import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { crearRouter, rutas, RUTAS_MODULOS } from '../../../src/rutas';
import { configurarSesionActual } from '../../../src/estado/sesion-actual';
import {
  destinoSinPermisos,
  elegirProfesor,
  leerProfesorOrigen,
  MOTIVOS_SIN_PERMISOS,
  motivoSinPermisos,
  type SesionActual,
} from '../../../src/estado';
import { MENSAJE_SIN_CONEXION } from '../../../src/lib/errores';
import { MENSAJE_INICIO } from '../../../src/modulos/inicio/logica';
import { ADMINISTRADOR, inscripcion, persona, profesor } from '../estado/soporte';

function montar(ruta: string) {
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] });
  render(<RouterProvider router={router} />);
  return router;
}

const FICHA_INCOMPLETA = persona([], 'ficha_incompleta');
/** Persona con ficha completa y un solo vínculo, con `ana-perez`, en `estado`. */
const conVinculo = (estado: 'pendiente' | 'aprobado' | 'rechazado') => persona([inscripcion('ana-perez', estado)]);
const PROFESOR = profesor();

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

// Sesión con la que cada ruta muestra su página (flujos.md §1, reglas de acceso; ADR-020).
const SESION_POR_RUTA: Readonly<Record<string, SesionActual | null>> = {
  '/': null,
  '/p/:slug': null,
  '/ingreso': null,
  '/ficha': conVinculo('pendiente'),
  '/solicitud': conVinculo('aprobado'),
  '/mis-clases': conVinculo('aprobado'),
  '/panel': PROFESOR,
  '/lista': PROFESOR,
  '/configuracion': PROFESOR,
  '/admin': ADMINISTRADOR,
};

/** Dirección concreta de cada ruta del router (`:slug` con un profesor de ejemplo). */
const direccion = (path: string) => path.replace(':slug', 'ana-perez');

// El h1 de la página cuando no coincide con el título del documento de la ruta (T04.2: «Ingresar»; WEB-09).
const H1_POR_RUTA: Readonly<Record<string, string>> = { '/': MENSAJE_INICIO, '/ingreso': 'Ingresar' };

beforeAll(async () => {
  // Las páginas reales tardan más que el segundo de `findBy*` en compilarse la primera vez;
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
  window.sessionStorage.clear();
});

describe('rutas hash de los módulos (ADR-007, ADR-020, §4)', () => {
  it('WEB_09_las_rutas_son_las_de_adr_007_y_adr_020', () => {
    expect(RUTAS_MODULOS.map((r) => r.path)).toEqual([
      '/',
      '/p/:slug',
      '/ingreso',
      '/ficha',
      '/solicitud',
      '/mis-clases',
      '/panel',
      '/lista',
      '/configuracion',
      '/admin',
    ]);
  });

  it.each(RUTAS_MODULOS.map((r) => [r.path, r.titulo] as const))(
    'WEB_01_08_la_ruta_%s_carga_su_pagina_con_titulo',
    async (path, titulo) => {
      conSesion(SESION_POR_RUTA[path] ?? null);
      const router = montar(direccion(path));
      expect(await screen.findByRole('heading', { level: 1, name: H1_POR_RUTA[path] ?? titulo })).toBeDefined();
      // El título lo fija un useEffect de Layout después de pintar el h1 lazy: hay que esperarlo.
      await waitFor(() => expect(document.title).toBe(`${titulo} · Agenda Clases App`));
      expect(router.state.location.pathname).toBe(direccion(path));
    },
  );

  it('WEB_09_una_ruta_desconocida_vuelve_al_inicio', async () => {
    conSesion(null);
    const router = montar('/no-existe');
    expect(await screen.findByRole('heading', { level: 1, name: MENSAJE_INICIO })).toBeDefined();
    expect(router.state.location.pathname).toBe('/');
  });

  it('NFR_09_el_router_de_la_app_lee_la_ruta_del_hash_para_pages_estatico', () => {
    window.history.replaceState(null, '', '/reservas/#/p/ana-perez');
    const router = crearRouter();
    expect(router.state.location.pathname).toBe('/p/ana-perez');
    router.dispose();
  });
});

describe('guardas de ruta conectadas en la app (CA-02, flujos.md §1)', () => {
  it.each(['/', '/p/ana-perez', '/mis-clases', '/panel', '/admin', '/ingreso', '/no-existe'])(
    'CA_02_con_la_ficha_incompleta_%s_lleva_a_la_ficha',
    async (ruta) => {
      conSesion(FICHA_INCOMPLETA);
      const router = montar(ruta);
      await waitFor(() => expect(router.state.location.pathname).toBe('/ficha'));
      expect(await screen.findByRole('heading', { level: 1, name: 'Ficha' })).toBeDefined();
    },
  );

  it('CA_02_con_la_ficha_incompleta_la_navegacion_solo_ofrece_la_ficha_y_salir', async () => {
    conSesion(FICHA_INCOMPLETA);
    montar('/ficha');
    await screen.findByRole('heading', { level: 1, name: 'Ficha' });
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    await waitFor(() =>
      expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Mi ficha']),
    );
    expect(within(nav).getByRole('button', { name: 'Salir' })).toBeDefined();
  });

  it('ALU_14_con_la_ficha_incompleta_el_enlace_queda_como_profesor_de_origen', async () => {
    conSesion(FICHA_INCOMPLETA);
    const router = montar('/p/Ana-Perez');
    await waitFor(() => expect(router.state.location.pathname).toBe('/ficha'));
    expect(leerProfesorOrigen()).toBe('ana-perez');
  });

  it('ALU_01_visitante_en_ruta_con_sesion_va_al_ingreso_con_volver', async () => {
    conSesion(null);
    const router = montar('/solicitud?hueco=7');
    await waitFor(() => expect(router.state.location.pathname).toBe('/ingreso'));
    expect(router.state.location.search).toBe('?volver=%2Fsolicitud%3Fhueco%3D7');
    expect(await screen.findByRole('heading', { level: 1, name: 'Ingresar' })).toBeDefined();
  });

  it('WEB_02_con_sesion_el_ingreso_vuelve_a_la_ruta_pedida', async () => {
    conSesion(conVinculo('aprobado'));
    const router = montar('/ingreso?volver=%2Fmis-clases');
    await waitFor(() => expect(router.state.location.pathname).toBe('/mis-clases'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Mis clases' })).toBeDefined();
  });

  it.each([
    ['pendiente', 'Tu cuenta está pendiente de aprobación. Cuando el profesor la apruebe vas a poder pedir clases.'],
    ['rechazado', 'Tu cuenta fue rechazada, así que no podés pedir clases.'],
  ] as const)('ALU_03_persona_%s_en_solicitud_ve_sin_permisos_con_su_estado', async (estado, motivo) => {
    conSesion(conVinculo(estado));
    const router = montar('/solicitud');
    expect(await screen.findByRole('heading', { level: 1, name: 'Sin permisos' })).toBeDefined();
    expect(screen.getByText(motivo)).toBeDefined();
    expect(screen.getByRole('link', { name: 'Ir a la agenda' }).getAttribute('href')).toBe('#/');
    expect(router.state.location.pathname).toBe('/solicitud');
  });

  it('SEC_15_persona_en_ruta_del_profesor_ve_sin_permisos', async () => {
    conSesion(conVinculo('aprobado'));
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

  it('WEB_10_el_profesor_en_admin_ve_sin_permisos', async () => {
    conSesion(PROFESOR);
    montar('/admin');
    expect(await screen.findByRole('heading', { level: 1, name: 'Sin permisos' })).toBeDefined();
    expect(screen.getByText(MOTIVOS_SIN_PERMISOS.soloAdministrador)).toBeDefined();
    expect(screen.queryByRole('heading', { level: 1, name: 'Administración' })).toBeNull();
  });

  it('ALU_03_motivo_de_sin_permisos_por_ruta_y_vinculos', () => {
    expect(motivoSinPermisos('/lista', conVinculo('pendiente'))).toBe('Esta pantalla es solo para el profesor.');
    expect(motivoSinPermisos('/ficha', persona([], 'borrado'))).toBe('Tu cuenta no tiene acceso a esta pantalla.');
    expect(motivoSinPermisos('/mis-clases', persona([inscripcion('ana-perez', 'sin_cuenta')]))).toBe(
      'Tu cuenta no tiene acceso a esta pantalla.',
    );
    expect(destinoSinPermisos(conVinculo('aprobado'))).toEqual({ texto: 'Ir a la agenda', href: '#/' });
    expect(destinoSinPermisos(PROFESOR)).toEqual({ texto: 'Ir al panel', href: '#/panel' });
  });

  it.each([
    ['profesor', PROFESOR, '/panel'],
    ['administrador', ADMINISTRADOR, '/admin'],
    ['persona_con_un_vinculo', conVinculo('pendiente'), '/p/ana-perez'],
  ] as const)('WEB_09_el_inicio_lleva_al_%s_a_su_pantalla', async (_quien, sesion, destino) => {
    conSesion(sesion);
    const router = montar('/');
    await waitFor(() => expect(router.state.location.pathname).toBe(destino));
  });

  it('WEB_09_persona_sin_vinculo_se_queda_en_el_inicio_con_el_mensaje', async () => {
    conSesion(persona([]));
    const router = montar('/');
    expect(await screen.findByRole('heading', { level: 1, name: MENSAJE_INICIO })).toBeDefined();
    expect(router.state.location.pathname).toBe('/');
  });

  it('ALU_14_el_visitante_que_abre_un_enlace_deja_anotado_el_profesor_de_origen', async () => {
    conSesion(null);
    montar('/p/Ana-Perez');
    await waitFor(() => expect(leerProfesorOrigen()).toBe('ana-perez'));
  });

  it('WEB_03_mientras_carga_la_sesion_las_rutas_con_sesion_esperan', async () => {
    configurarSesionActual({ haySesionGuardada: () => true, obtenerCliente: () => new Promise(() => undefined) });
    montar('/mis-clases');
    expect(await screen.findByRole('status')).toBeDefined();
    expect(screen.queryByRole('heading', { level: 1, name: 'Mis clases' })).toBeNull();
  });

  it('WEB_03_la_agenda_y_el_inicio_no_esperan_a_la_sesion', async () => {
    configurarSesionActual({ haySesionGuardada: () => true, obtenerCliente: () => new Promise(() => undefined) });
    const router = montar('/p/ana-perez');
    expect(await screen.findByRole('heading', { level: 1, name: 'Agenda' })).toBeDefined();
    await act(() => router.navigate('/'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Inicio' })).toBeDefined();
  });

  it('WEB_03_si_falla_la_sesion_muestra_el_error_y_reintenta', async () => {
    const ok = clienteCon(async () => ({ data: conVinculo('aprobado'), error: null }));
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

  it('WEB_03_salir_cierra_la_sesion_y_vuelve_al_inicio_como_visitante', async () => {
    const falso = conSesion(PROFESOR);
    const router = montar('/panel');
    await screen.findByRole('heading', { level: 1, name: 'Panel' });
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Panel', 'Lista', 'Configuración']);
    fireEvent.click(within(nav).getByRole('button', { name: 'Salir' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(falso?.signOut).toHaveBeenCalled();
    expect(await screen.findByRole('heading', { level: 1, name: MENSAJE_INICIO })).toBeDefined();
  });
});

describe('menú por rol conectado en la app (WEB-07, WEB-11, ADM-04)', () => {
  /** Enlaces del menú principal cuando ya cargó la sesión (aparece «Salir»). */
  async function menu() {
    const nav = await screen.findByRole('navigation', { name: 'Principal' });
    await within(nav).findByRole('button', { name: 'Salir' });
    return nav;
  }
  const hrefAgenda = (nav: HTMLElement) => within(nav).getByRole('link', { name: 'Agenda' }).getAttribute('href');
  const DOS_PROFESORES = persona([inscripcion('ana-perez', 'aprobado'), inscripcion('beto-diaz', 'aprobado')]);

  it('WEB_11_agenda_del_menu_lleva_a_la_del_profesor_elegido_y_sigue_al_selector', async () => {
    elegirProfesor('beto-diaz');
    conSesion(DOS_PROFESORES);
    montar('/mis-clases');
    const nav = await menu();
    expect(hrefAgenda(nav)).toBe('#/p/beto-diaz');
    act(() => elegirProfesor('ana-perez'));
    await waitFor(() => expect(hrefAgenda(nav)).toBe('#/p/ana-perez'));
  });

  it('WEB_11_con_un_solo_profesor_agenda_lleva_a_su_agenda', async () => {
    conSesion(conVinculo('aprobado'));
    montar('/mis-clases');
    expect(hrefAgenda(await menu())).toBe('#/p/ana-perez');
  });

  it('WEB_07_con_varios_profesores_y_ninguno_elegido_agenda_lleva_al_inicio', async () => {
    conSesion(DOS_PROFESORES);
    montar('/mis-clases');
    expect(hrefAgenda(await menu())).toBe('#/');
  });

  it('ADM_04_el_profesor_que_es_administrador_ve_administracion_y_entra', async () => {
    conSesion(profesor('ana-perez', true, true));
    const router = montar('/panel');
    const nav = await menu();
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Panel',
      'Lista',
      'Configuración',
      'Administración',
    ]);
    expect(within(nav).getByRole('link', { name: 'Administración' }).getAttribute('href')).toBe('#/admin');
    await act(() => router.navigate('/admin'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Administración' })).toBeDefined();
  });

  it('ADM_04_el_profesor_que_no_es_administrador_no_ve_administracion', async () => {
    conSesion(PROFESOR);
    montar('/panel');
    const nav = await menu();
    expect(within(nav).queryByRole('link', { name: 'Administración' })).toBeNull();
  });
});
