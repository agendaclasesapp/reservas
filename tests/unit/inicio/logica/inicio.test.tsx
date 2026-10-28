// B14 · T14.3 · Página principal sin enlace y selector de profesor (WEB-09, WEB-11, DEC-25, ADR-020).
import type { SupabaseClient } from '@supabase/supabase-js';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EstadoSesion, SesionActual } from '../../../../src/estado';
import { CLAVE_PROFESOR_ELEGIDO, configurarAlmacenProfesor, elegirProfesor } from '../../../../src/estado/profesor';
import { configurarSesionActual } from '../../../../src/estado/sesion-actual';
import {
  decidirInicio,
  MENSAJE_INICIO,
  mostrarSelector,
  opcionesSelector,
  rutaAgendaDePersona,
  useInicio,
  useSelectorProfesor,
} from '../../../../src/modulos/inicio/logica';
import { ADMINISTRADOR, almacenEnMemoria, enSesion, inscripcion, persona, profesor } from '../../estado/soporte';

const ANA = inscripcion('ana-perez', 'aprobado', { profesor_nombre: 'Ana Pérez' });
const BETO = inscripcion('beto-gil', 'pendiente', { profesor_nombre: 'Beto Gil', profesor_activo: false });
const DOS = persona([ANA, BETO]);

let memoria: ReturnType<typeof almacenEnMemoria>;

beforeEach(() => {
  memoria = almacenEnMemoria();
  configurarAlmacenProfesor(() => memoria.almacen);
});

afterEach(() => {
  configurarAlmacenProfesor();
  configurarSesionActual();
});

describe('WEB-09: qué muestra #/', () => {
  it('WEB_09_el_mensaje_fijo_no_lista_profesores', () => {
    expect(MENSAJE_INICIO).toBe('Pedile el enlace a tu profesor');
  });

  it('WEB_09_visitante_ve_el_mensaje_con_ingreso_y_con_error_sin_ingreso', () => {
    expect(decidirInicio({ tipo: 'visitante' }, null)).toEqual({ tipo: 'mensaje', conIngreso: true });
    expect(decidirInicio({ tipo: 'error', mensaje: 'x' }, null)).toEqual({ tipo: 'mensaje', conIngreso: false });
    expect(decidirInicio({ tipo: 'cargando' }, null)).toEqual({ tipo: 'cargando' });
  });

  it('WEB_09_profesor_administrador_y_persona_con_un_vinculo_se_redirigen', () => {
    expect(decidirInicio(enSesion(profesor()), null)).toEqual({ tipo: 'redirigir', a: '/panel' });
    expect(decidirInicio(enSesion(ADMINISTRADOR), null)).toEqual({ tipo: 'redirigir', a: '/admin' });
    expect(decidirInicio(enSesion(persona([BETO])), null)).toEqual({ tipo: 'redirigir', a: '/p/beto-gil' });
  });

  it('WEB_09_persona_sin_vinculo_ve_el_mensaje_sin_ingreso', () => {
    expect(decidirInicio(enSesion(persona([])), 'ana-perez')).toEqual({ tipo: 'mensaje', conIngreso: false });
  });

  it('WEB_11_persona_con_varios_vinculos_ve_el_selector_con_el_elegido_marcado', () => {
    const d = decidirInicio(enSesion(DOS), 'beto-gil');
    expect(d.tipo).toBe('selector');
    if (d.tipo !== 'selector') return;
    expect(d.opciones.map((o) => [o.slug, o.actual])).toEqual([
      ['ana-perez', false],
      ['beto-gil', true],
    ]);
  });
});

describe('WEB-11: selector de profesor', () => {
  it('WEB_11_solo_aparece_para_la_persona_con_ficha_completa_y_mas_de_un_vinculo', () => {
    expect(mostrarSelector(enSesion(DOS))).toBe(true);
    // DEC-25: con un solo vínculo no aparece.
    expect(mostrarSelector(enSesion(persona([ANA])))).toBe(false);
    expect(mostrarSelector(enSesion(persona([ANA, BETO], 'ficha_incompleta')))).toBe(false);
    expect(mostrarSelector(enSesion(profesor()))).toBe(false);
    expect(mostrarSelector(enSesion(ADMINISTRADOR))).toBe(false);
    expect(mostrarSelector({ tipo: 'visitante' })).toBe(false);
  });

  it('WEB_11_cada_opcion_dice_nombre_estado_si_esta_activo_y_su_ruta', () => {
    expect(opcionesSelector(DOS, null, null)).toEqual([
      { slug: 'ana-perez', profesorNombre: 'Ana Pérez', estado: 'aprobado', activo: true, actual: false, ruta: '/p/ana-perez' },
      { slug: 'beto-gil', profesorNombre: 'Beto Gil', estado: 'pendiente', activo: false, actual: false, ruta: '/p/beto-gil' },
    ]);
  });

  it('WEB_11_marca_el_de_la_ruta_antes_que_el_elegido', () => {
    const marcadas = (ruta: string | null, elegido: string | null) =>
      opcionesSelector(DOS, ruta, elegido)
        .filter((o) => o.actual)
        .map((o) => o.slug);
    expect(marcadas('ana-perez', 'beto-gil')).toEqual(['ana-perez']);
    expect(marcadas(null, 'Beto-Gil')).toEqual(['beto-gil']);
    expect(marcadas('otro-prof', 'beto-gil')).toEqual([]);
    expect(marcadas('admin', 'beto-gil')).toEqual(['beto-gil']);
  });

  it('WEB_11_ruta_de_la_agenda_de_la_persona', () => {
    const s = (x: SesionActual): EstadoSesion => enSesion(x);
    expect(rutaAgendaDePersona(s(DOS), 'beto-gil')).toBe('/p/beto-gil');
    expect(rutaAgendaDePersona(s(DOS), 'otro-prof')).toBe('/');
    expect(rutaAgendaDePersona(s(DOS), null)).toBe('/');
    expect(rutaAgendaDePersona(s(persona([ANA])), null)).toBe('/p/ana-perez');
    expect(rutaAgendaDePersona(s(persona([ANA])), 'beto-gil')).toBe('/p/ana-perez');
    expect(rutaAgendaDePersona(s(persona([])), null)).toBe('/');
    expect(rutaAgendaDePersona(s(profesor()), 'ana-perez')).toBe('/');
    expect(rutaAgendaDePersona({ tipo: 'visitante' }, 'ana-perez')).toBe('/');
  });
});

describe('hooks de inicio (WEB-09, WEB-11)', () => {
  function conSesion(sesion: SesionActual) {
    const cliente = {
      rpc: async () => ({ data: sesion, error: null }),
      auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) },
    };
    configurarSesionActual({ haySesionGuardada: () => true, obtenerCliente: async () => cliente as unknown as SupabaseClient });
  }

  /** Monta el hook dentro de un router de memoria en `ruta`; devuelve el router para mirar la navegación. */
  function enRouter<T>(hook: () => T, ruta = '/') {
    const salida: { current: T | null } = { current: null };
    function Sonda(): ReactNode {
      salida.current = hook();
      return null;
    }
    const router = createMemoryRouter(
      [
        { path: '/', element: <Sonda /> },
        { path: '/p/:slug', element: <Sonda /> },
      ],
      { initialEntries: [ruta] },
    );
    return { router, salida, Raiz: () => <RouterProvider router={router} /> };
  }

  it('WEB_09_use_inicio_sigue_a_la_sesion_y_al_elegido', async () => {
    conSesion(DOS);
    const { result } = renderHook(() => useInicio());
    expect(result.current).toEqual({ tipo: 'cargando' });
    await waitFor(() => expect(result.current.tipo).toBe('selector'));
    act(() => elegirProfesor('ana-perez'));
    expect(result.current.tipo === 'selector' && result.current.opciones.find((o) => o.actual)?.slug).toBe('ana-perez');
  });

  it('WEB_11_elegir_guarda_en_sessionStorage_y_navega_a_su_agenda', async () => {
    conSesion(DOS);
    const { router, salida, Raiz } = enRouter(() => useSelectorProfesor(), '/p/ana-perez');
    render(<Raiz />);
    await waitFor(() => expect(salida.current?.visible).toBe(true));
    expect(salida.current?.opciones.find((o) => o.actual)?.slug).toBe('ana-perez');
    act(() => salida.current?.elegir('Beto-Gil'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/p/beto-gil'));
    expect(memoria.datos.get(CLAVE_PROFESOR_ELEGIDO)).toBe('beto-gil');
    expect(salida.current?.opciones.find((o) => o.actual)?.slug).toBe('beto-gil');
  });

  it('WEB_11_un_slug_invalido_no_se_guarda_ni_navega', async () => {
    conSesion(DOS);
    const { router, salida, Raiz } = enRouter(() => useSelectorProfesor());
    render(<Raiz />);
    await waitFor(() => expect(salida.current?.visible).toBe(true));
    act(() => salida.current?.elegir('../admin'));
    expect(router.state.location.pathname).toBe('/');
    expect(memoria.datos.size).toBe(0);
  });

  it('WEB_11_con_un_solo_vinculo_el_selector_no_se_monta_ni_tiene_opciones', async () => {
    conSesion(persona([ANA]));
    const { salida, Raiz } = enRouter(() => useSelectorProfesor(), '/p/ana-perez');
    render(<Raiz />);
    await waitFor(() => expect(salida.current).not.toBeNull());
    expect(salida.current?.visible).toBe(false);
    expect(salida.current?.opciones).toEqual([]);
  });
});
