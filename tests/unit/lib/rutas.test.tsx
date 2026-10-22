import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { crearRouter, rutas, RUTAS_MODULOS } from '../../../src/rutas';
import { configurarSesionActual } from '../../../src/estado/sesion-actual';
import { destinoSinPermisos, motivoSinPermisos, type EstadoAlumno, type SesionActual } from '../../../src/estado';
import { MENSAJE_SIN_CONEXION } from '../../../src/lib/errores';

function montar(ruta: string) {
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] });
  render(<RouterProvider router={router} />);
  return router;
}

function alumno(estado: EstadoAlumno): SesionActual {
  return { rol: 'alumno', alumno_id: 'a1', estado, nombre: 'Ana', mail: 'ana@example.com', motivo_rechazo: null };
}
const PROFESOR: SesionActual = {
  rol: 'profesor',
  alumno_id: null,
  estado: null,
  nombre: 'Prof',
  mail: 'prof@example.com',
  motivo_rechazo: null,
};

/** Cliente falso: `sesion_actual()` responde lo pedido y `signOut` siempre funciona. */
function clienteCon(rpc: () => Promise<{ data: unknown; error: unknown }>) {
  const signOut = vi.fn(async () => ({ error: null }));
  const cliente = {
    rpc,
    auth: { signOut, onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) },
  };
  return { cliente: cliente as unknown as SupabaseClient, signOut };
}

/** `null` = visitante (sin sesión guardada en el navegador). */
function conSesion(sesion: SesionActual | null) {
  if (sesion === null) {
    configurarSesionActual({ haySesionGuardada: () => false });
    return undefined;
  }
  const falso = clienteCon(async () => ({ data: sesion, error: null }));
  configurarSesionActual({ haySesionGuardada: () => true, obtenerCliente: async () => falso.cliente });
  return falso;
}

// Sesión con la que cada ruta muestra su página (flujos.md §1, reglas de acceso).
const SESION_POR_RUTA: Readonly<Record<string, SesionActual | null>> = {
  '/': null,
  '/ingreso': null,
  '/ficha': alumno('pendiente'),
  '/solicitud': alumno('aprobado'),
  '/mis-clases': alumno('aprobado'),
  '/panel': PROFESOR,
  '/lista': PROFESOR,
  '/configuracion': PROFESOR,
};

// El h1 de la página cuando no coincide con el título del documento de la ruta (T04.2: «Ingresar»).
const H1_POR_RUTA: Readonly<Record<string, string>> = { '/ingreso': 'Ingresar' };

beforeAll(async () => {
  // Las páginas reales de B02/B03 tardan más que el segundo de `findBy*` en compilarse la primera vez;
  // se precargan para que las pruebas midan el ruteo y no la transformación de los módulos.
  await Promise.all(RUTAS_MODULOS.map((r) => r.cargar()));
}, 60_000);

beforeEach(() => {
  // Ninguna página sale a la red: sus lecturas quedan en «cargando».
  vi.stubGlobal('fetch', () => new Promise<Response>(() => undefined));
});

afterEach(() => {
  vi.unstubAllGlobals();
  configurarSesionActual();
});

describe('rutas hash de los 8 módulos (ADR-007, §4)', () => {
  it('NFR_09_las_rutas_son_las_de_adr_007', () => {
    expect(RUTAS_MODULOS.map((r) => r.path)).toEqual([
      '/',
      '/ingreso',
      '/ficha',
      '/solicitud',
      '/mis-clases',
      '/panel',
      '/lista',
      '/configuracion',
    ]);
  });

  it.each(RUTAS_MODULOS.map((r) => [r.path, r.titulo] as const))(
    'WEB_01_08_la_ruta_%s_carga_su_pagina_con_titulo',
    async (path, titulo) => {
      conSesion(SESION_POR_RUTA[path] ?? null);
      const router = montar(path);
      expect(await screen.findByRole('heading', { level: 1, name: H1_POR_RUTA[path] ?? titulo })).toBeDefined();
      // El título lo fija un useEffect de Layout después de pintar el h1 lazy: hay que esperarlo.
      await waitFor(() => expect(document.title).toBe(`${titulo} · ReservaTuClase`));
      expect(router.state.location.pathname).toBe(path);
    },
  );

  it('NFR_09_una_ruta_desconocida_vuelve_a_la_agenda', async () => {
    conSesion(null);
    const router = montar('/no-existe');
    expect(await screen.findByRole('heading', { level: 1, name: 'Agenda' })).toBeDefined();
    expect(router.state.location.pathname).toBe('/');
  });

  it('NFR_09_el_router_de_la_app_lee_la_ruta_del_hash_para_pages_estatico', () => {
    window.history.replaceState(null, '', '/reservas/#/panel');
    const router = crearRouter();
    expect(router.state.location.pathname).toBe('/panel');
    router.dispose();
  });
});

describe('guardas de ruta conectadas en la app (CA-02, flujos.md §1)', () => {
  it.each(['/', '/mis-clases', '/panel', '/ingreso', '/no-existe'])(
    'CA_02_con_la_ficha_incompleta_%s_lleva_a_la_ficha',
    async (ruta) => {
      conSesion(alumno('ficha_incompleta'));
      const router = montar(ruta);
      await waitFor(() => expect(router.state.location.pathname).toBe('/ficha'));
      expect(await screen.findByRole('heading', { level: 1, name: 'Ficha' })).toBeDefined();
    },
  );

  it('CA_02_con_la_ficha_incompleta_la_navegacion_solo_ofrece_la_ficha_y_salir', async () => {
    conSesion(alumno('ficha_incompleta'));
    montar('/ficha');
    await screen.findByRole('heading', { level: 1, name: 'Ficha' });
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    await waitFor(() =>
      expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Mi ficha']),
    );
    expect(within(nav).getByRole('button', { name: 'Salir' })).toBeDefined();
  });

  it('ALU_01_visitante_en_ruta_con_sesion_va_al_ingreso_con_volver', async () => {
    conSesion(null);
    const router = montar('/solicitud?hueco=7');
    await waitFor(() => expect(router.state.location.pathname).toBe('/ingreso'));
    expect(router.state.location.search).toBe('?volver=%2Fsolicitud%3Fhueco%3D7');
    expect(await screen.findByRole('heading', { level: 1, name: 'Ingresar' })).toBeDefined();
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Agenda', 'Ingresar']);
  });

  it('WEB_02_con_sesion_el_ingreso_vuelve_a_la_ruta_pedida', async () => {
    conSesion(alumno('aprobado'));
    const router = montar('/ingreso?volver=%2Fmis-clases');
    await waitFor(() => expect(router.state.location.pathname).toBe('/mis-clases'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Mis clases' })).toBeDefined();
  });

  it.each([
    ['pendiente', 'Tu cuenta está pendiente de aprobación. Cuando el profesor la apruebe vas a poder pedir clases.'],
    ['rechazado', 'Tu cuenta fue rechazada, así que no podés pedir clases.'],
  ] as const)('ALU_03_alumno_%s_en_solicitud_ve_sin_permisos_con_su_estado', async (estado, motivo) => {
    conSesion(alumno(estado));
    const router = montar('/solicitud');
    expect(await screen.findByRole('heading', { level: 1, name: 'Sin permisos' })).toBeDefined();
    expect(screen.getByText(motivo)).toBeDefined();
    expect(screen.getByRole('link', { name: 'Ir a la agenda' }).getAttribute('href')).toBe('#/');
    expect(router.state.location.pathname).toBe('/solicitud');
  });

  it('SEC_15_alumno_en_ruta_del_profesor_ve_sin_permisos', async () => {
    conSesion(alumno('aprobado'));
    montar('/panel');
    expect(await screen.findByRole('heading', { level: 1, name: 'Sin permisos' })).toBeDefined();
    expect(screen.getByText('Esta pantalla es solo para el profesor.')).toBeDefined();
    expect(screen.queryByRole('heading', { level: 1, name: 'Panel' })).toBeNull();
  });

  it('SEC_15_el_profesor_en_la_ficha_ve_sin_permisos_y_vuelve_al_panel', async () => {
    conSesion(PROFESOR);
    montar('/ficha');
    expect(await screen.findByRole('heading', { level: 1, name: 'Sin permisos' })).toBeDefined();
    expect(screen.getByText('Esta pantalla es solo para alumnos.')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Ir al panel' }).getAttribute('href')).toBe('#/panel');
  });

  it('ALU_03_motivo_de_sin_permisos_por_ruta_y_estado', () => {
    expect(motivoSinPermisos('/lista', 'pendiente')).toBe('Esta pantalla es solo para el profesor.');
    expect(motivoSinPermisos('/ficha', 'borrado')).toBe('Tu cuenta no tiene acceso a esta pantalla.');
    expect(motivoSinPermisos('/mis-clases', 'sin_cuenta')).toBe('Tu cuenta no tiene acceso a esta pantalla.');
    expect(destinoSinPermisos('aprobado')).toEqual({ texto: 'Ir a la agenda', href: '#/' });
    expect(destinoSinPermisos(null)).toEqual({ texto: 'Ir al panel', href: '#/panel' });
  });

  it('WEB_03_mientras_carga_la_sesion_las_rutas_con_sesion_esperan', async () => {
    configurarSesionActual({ haySesionGuardada: () => true, obtenerCliente: () => new Promise(() => undefined) });
    montar('/mis-clases');
    expect(await screen.findByRole('status')).toBeDefined();
    expect(screen.queryByRole('heading', { level: 1, name: 'Mis clases' })).toBeNull();
  });

  it('WEB_03_la_agenda_no_espera_a_la_sesion', async () => {
    configurarSesionActual({ haySesionGuardada: () => true, obtenerCliente: () => new Promise(() => undefined) });
    montar('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Agenda' })).toBeDefined();
  });

  it('WEB_03_si_falla_la_sesion_muestra_el_error_y_reintenta', async () => {
    const ok = clienteCon(async () => ({ data: alumno('aprobado'), error: null }));
    const obtenerCliente = vi
      .fn<() => Promise<SupabaseClient>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(ok.cliente);
    configurarSesionActual({ haySesionGuardada: () => true, obtenerCliente });
    montar('/mis-clases');
    const alerta = await screen.findByRole('alert');
    expect(within(alerta).getByText(MENSAJE_SIN_CONEXION)).toBeDefined();
    fireEvent.click(within(alerta).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Mis clases' })).toBeDefined();
  });

  it('WEB_03_salir_cierra_la_sesion_y_vuelve_a_la_agenda_como_visitante', async () => {
    const falso = conSesion(PROFESOR);
    const router = montar('/panel');
    await screen.findByRole('heading', { level: 1, name: 'Panel' });
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Panel', 'Lista', 'Configuración']);
    fireEvent.click(within(nav).getByRole('button', { name: 'Salir' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(falso?.signOut).toHaveBeenCalled();
    expect(await screen.findByRole('link', { name: 'Ingresar' })).toBeDefined();
  });
});
