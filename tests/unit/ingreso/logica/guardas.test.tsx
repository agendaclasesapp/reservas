import type { SupabaseClient } from '@supabase/supabase-js';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import {
  accesoDe,
  decidirGuarda,
  GuardaDeRuta,
  rutaDeVuelta,
  usuarioNavegacion,
  type EstadoAlumno,
  type EstadoSesion,
} from '../../../../src/estado';
import { configurarSesionActual } from '../../../../src/estado/sesion-actual';

const VISITANTE: EstadoSesion = { tipo: 'visitante' };
const CARGANDO: EstadoSesion = { tipo: 'cargando' };

function alumno(estado: EstadoAlumno): EstadoSesion {
  return {
    tipo: 'sesion',
    sesion: { rol: 'alumno', alumno_id: 'a1', estado, nombre: 'Ana', mail: 'a@x.y', motivo_rechazo: null },
  };
}
const PROFESOR: EstadoSesion = {
  tipo: 'sesion',
  sesion: { rol: 'profesor', alumno_id: null, estado: null, nombre: 'P', mail: 'p@x.y', motivo_rechazo: null },
};

const ir = (pathname: string, search = '') => ({ pathname, search });

describe('guardas de ruta (ADR-007, flujos.md §1)', () => {
  it('CA_02_ficha_incompleta_lleva_toda_ruta_a_la_ficha', () => {
    const s = alumno('ficha_incompleta');
    for (const ruta of ['/', '/ingreso', '/mis-clases', '/solicitud', '/panel', '/no-existe']) {
      expect(decidirGuarda(ir(ruta), s)).toEqual({ tipo: 'redirigir', a: '/ficha' });
    }
    expect(decidirGuarda(ir('/ficha'), s)).toEqual({ tipo: 'mostrar' });
  });

  it('ALU_01_visitante_en_ruta_con_sesion_va_al_ingreso_con_volver', () => {
    expect(decidirGuarda(ir('/mis-clases'), VISITANTE)).toEqual({ tipo: 'redirigir', a: '/ingreso?volver=%2Fmis-clases' });
    expect(decidirGuarda(ir('/solicitud', '?hueco=7'), VISITANTE)).toEqual({
      tipo: 'redirigir',
      a: '/ingreso?volver=%2Fsolicitud%3Fhueco%3D7',
    });
    expect(decidirGuarda(ir('/'), VISITANTE)).toEqual({ tipo: 'mostrar' });
    expect(decidirGuarda(ir('/ingreso'), VISITANTE)).toEqual({ tipo: 'mostrar' });
  });

  it('ALU_01_con_sesion_el_ingreso_redirige_a_volver_o_a_la_agenda', () => {
    expect(decidirGuarda(ir('/ingreso', '?volver=%2Fmis-clases'), alumno('aprobado'))).toEqual({
      tipo: 'redirigir',
      a: '/mis-clases',
    });
    expect(decidirGuarda(ir('/ingreso', '?volver=https%3A%2F%2Fx.y'), alumno('aprobado'))).toEqual({
      tipo: 'redirigir',
      a: '/',
    });
  });

  it('ALU_03_pendiente_y_rechazado_ven_ficha_y_agenda_y_sin_permisos_en_solicitud', () => {
    for (const estado of ['pendiente', 'rechazado'] as const) {
      const s = alumno(estado);
      expect(decidirGuarda(ir('/ficha'), s)).toEqual({ tipo: 'mostrar' });
      expect(decidirGuarda(ir('/'), s)).toEqual({ tipo: 'mostrar' });
      expect(decidirGuarda(ir('/solicitud'), s)).toEqual({ tipo: 'sin_permisos', estado });
      expect(decidirGuarda(ir('/mis-clases'), s)).toEqual({ tipo: 'sin_permisos', estado });
    }
    expect(decidirGuarda(ir('/mis-clases'), alumno('aprobado'))).toEqual({ tipo: 'mostrar' });
    expect(decidirGuarda(ir('/ficha'), alumno('borrado'))).toEqual({ tipo: 'sin_permisos', estado: 'borrado' });
  });

  it('SEC_15_alumno_no_entra_a_rutas_del_profesor_ni_el_profesor_a_la_ficha', () => {
    expect(decidirGuarda(ir('/panel'), alumno('aprobado'))).toEqual({ tipo: 'sin_permisos', estado: 'aprobado' });
    expect(decidirGuarda(ir('/configuracion'), PROFESOR)).toEqual({ tipo: 'mostrar' });
    expect(decidirGuarda(ir('/ficha'), PROFESOR)).toEqual({ tipo: 'sin_permisos', estado: null });
  });

  it('WEB_03_mientras_carga_la_agenda_se_muestra_y_el_resto_espera_o_muestra_el_error', () => {
    expect(decidirGuarda(ir('/'), CARGANDO)).toEqual({ tipo: 'mostrar' });
    expect(decidirGuarda(ir('/ficha'), CARGANDO)).toEqual({ tipo: 'esperar' });
    const error: EstadoSesion = { tipo: 'error', mensaje: 'sin red' };
    expect(decidirGuarda(ir('/ficha'), error)).toEqual({ tipo: 'error', mensaje: 'sin red' });
    expect(decidirGuarda(ir('/ingreso'), error)).toEqual({ tipo: 'mostrar' });
  });

  it('WEB_02_ruta_de_vuelta_solo_rutas_propias', () => {
    expect(rutaDeVuelta('?volver=%2Flista')).toBe('/lista');
    expect(rutaDeVuelta('?volver=%2Flista%23x')).toBe('/');
    expect(rutaDeVuelta('?volver=constructor')).toBe('/');
    expect(accesoDe('constructor')).toBe('publico');
    expect(accesoDe('/panel')).toBe('profesor');
  });

  it('WEB_03_usuario_de_navegacion_por_rol_y_estado', () => {
    expect(usuarioNavegacion(VISITANTE)).toBeUndefined();
    expect(usuarioNavegacion(PROFESOR)).toEqual({ rol: 'profesor' });
    expect(usuarioNavegacion(alumno('aprobado'))).toEqual({ rol: 'alumno', estado: 'aprobado' });
    expect(usuarioNavegacion(alumno('pendiente'))).toEqual({ rol: 'alumno', estado: 'pendiente' });
    expect(usuarioNavegacion(alumno('rechazado'))).toEqual({ rol: 'alumno', estado: 'rechazado' });
    expect(usuarioNavegacion(alumno('ficha_incompleta'))).toEqual({ rol: 'alumno', estado: 'ficha_incompleta' });
  });
});

describe('GuardaDeRuta (componente)', () => {
  afterEach(() => configurarSesionActual());

  function montar(ruta: string) {
    const envolver = (texto: string) => (
      <GuardaDeRuta esperando={<p>esperando</p>} sinPermisos={(e) => <p>sin permisos {String(e)}</p>}>
        <p>{texto}</p>
      </GuardaDeRuta>
    );
    const router = createMemoryRouter(
      [
        { path: '/', element: envolver('agenda') },
        { path: '/ingreso', element: envolver('ingreso') },
        { path: '/mis-clases', element: envolver('mis clases') },
        { path: '/panel', element: envolver('panel') },
      ],
      { initialEntries: [ruta] },
    );
    render(<RouterProvider router={router} />);
    return router;
  }

  it('CA_02_visitante_que_entra_a_mis_clases_termina_en_el_ingreso', async () => {
    configurarSesionActual({ haySesionGuardada: () => false });
    const router = montar('/mis-clases');
    expect(await screen.findByText('ingreso')).toBeTruthy();
    expect(router.state.location.search).toBe('?volver=%2Fmis-clases');
  });

  it('WEB_03_sin_permisos_y_espera_se_delegan_en_la_vista', async () => {
    configurarSesionActual({ haySesionGuardada: () => true, obtenerCliente: () => new Promise(() => undefined) });
    montar('/panel');
    expect(await screen.findByText('esperando')).toBeTruthy();
  });

  it('ALU_03_alumno_aprobado_en_ruta_del_profesor_ve_sin_permisos', async () => {
    const sesion = { rol: 'alumno', alumno_id: 'a1', estado: 'aprobado', nombre: 'A', mail: 'a@x.y', motivo_rechazo: null };
    const cliente = {
      rpc: async () => ({ data: sesion, error: null }),
      auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) },
    };
    configurarSesionActual({
      haySesionGuardada: () => true,
      obtenerCliente: async () => cliente as unknown as SupabaseClient,
    });
    montar('/panel');
    expect(await screen.findByText('sin permisos aprobado')).toBeTruthy();
  });
});
