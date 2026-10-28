import type { SupabaseClient } from '@supabase/supabase-js';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import {
  accesoDe,
  decidirGuarda,
  GuardaDeRuta,
  MOTIVOS_SIN_PERMISOS,
  rutaDeVuelta,
  usuarioNavegacion,
  type EstadoInscripcion,
  type EstadoSesion,
} from '../../../../src/estado';
import { configurarSesionActual } from '../../../../src/estado/sesion-actual';
import { enSesion, inscripcion, persona, profesor } from '../../estado/soporte';

const VISITANTE: EstadoSesion = { tipo: 'visitante' };
const CARGANDO: EstadoSesion = { tipo: 'cargando' };
const FICHA_INCOMPLETA = enSesion(persona([], 'ficha_incompleta'));
const PROFESOR = enSesion(profesor());
const IR_AL_INICIO = { texto: 'Ir a la agenda', href: '#/' };

/** Persona con ficha completa y un vínculo en `estado` con el profesor `ana-perez` (y otro, si se pide). */
function conVinculo(estado: EstadoInscripcion, otro?: EstadoInscripcion): EstadoSesion {
  const vinculos = [inscripcion('ana-perez', estado)];
  if (otro) vinculos.push(inscripcion('beto-gil', otro));
  return enSesion(persona(vinculos));
}

const ir = (pathname: string, search = '') => ({ pathname, search });

describe('guardas de ruta (ADR-007, ADR-020, flujos.md §1)', () => {
  it('CA_02_ficha_incompleta_lleva_toda_ruta_a_la_ficha', () => {
    for (const ruta of ['/', '/ingreso', '/mis-clases', '/solicitud', '/panel', '/admin', '/no-existe']) {
      expect(decidirGuarda(ir(ruta), FICHA_INCOMPLETA)).toEqual({ tipo: 'redirigir', a: '/ficha' });
    }
    expect(decidirGuarda(ir('/ficha'), FICHA_INCOMPLETA)).toEqual({ tipo: 'mostrar' });
  });

  it('ALU_01_visitante_en_ruta_con_sesion_va_al_ingreso_con_volver', () => {
    expect(decidirGuarda(ir('/mis-clases'), VISITANTE)).toEqual({ tipo: 'redirigir', a: '/ingreso?volver=%2Fmis-clases' });
    expect(decidirGuarda(ir('/solicitud', '?hueco=7'), VISITANTE)).toEqual({
      tipo: 'redirigir',
      a: '/ingreso?volver=%2Fsolicitud%3Fhueco%3D7',
    });
    expect(decidirGuarda(ir('/'), VISITANTE)).toEqual({ tipo: 'mostrar' });
    expect(decidirGuarda(ir('/p/ana-perez'), VISITANTE)).toEqual({ tipo: 'mostrar' });
    expect(decidirGuarda(ir('/ingreso'), VISITANTE)).toEqual({ tipo: 'mostrar' });
  });

  it('ALU_01_con_sesion_el_ingreso_redirige_a_volver_o_al_inicio', () => {
    const s = conVinculo('aprobado');
    expect(decidirGuarda(ir('/ingreso', '?volver=%2Fmis-clases'), s)).toEqual({ tipo: 'redirigir', a: '/mis-clases' });
    expect(decidirGuarda(ir('/ingreso', '?volver=%2Fp%2Fana-perez'), s)).toEqual({
      tipo: 'redirigir',
      a: '/p/ana-perez',
    });
    expect(decidirGuarda(ir('/ingreso', '?volver=https%3A%2F%2Fx.y'), s)).toEqual({ tipo: 'redirigir', a: '/' });
  });

  it('ALU_03_pendiente_y_rechazado_ven_ficha_y_agenda_y_sin_permisos_en_solicitud', () => {
    const motivos = { pendiente: MOTIVOS_SIN_PERMISOS.pendiente, rechazado: MOTIVOS_SIN_PERMISOS.rechazado };
    for (const estado of ['pendiente', 'rechazado'] as const) {
      const s = conVinculo(estado);
      const sinPermisos = { tipo: 'sin_permisos', motivo: motivos[estado], destino: IR_AL_INICIO };
      expect(decidirGuarda(ir('/ficha'), s)).toEqual({ tipo: 'mostrar' });
      expect(decidirGuarda(ir('/p/ana-perez'), s)).toEqual({ tipo: 'mostrar' });
      expect(decidirGuarda(ir('/solicitud'), s)).toEqual(sinPermisos);
      expect(decidirGuarda(ir('/mis-clases'), s)).toEqual(sinPermisos);
    }
    expect(decidirGuarda(ir('/mis-clases'), conVinculo('aprobado'))).toEqual({ tipo: 'mostrar' });
    expect(decidirGuarda(ir('/ficha'), enSesion(persona([], 'borrado')))).toEqual({
      tipo: 'sin_permisos',
      motivo: MOTIVOS_SIN_PERMISOS.sinAcceso,
      destino: IR_AL_INICIO,
    });
  });

  it('SEC_15_la_persona_no_entra_a_rutas_del_profesor_ni_el_profesor_a_la_ficha', () => {
    expect(decidirGuarda(ir('/panel'), conVinculo('aprobado'))).toEqual({
      tipo: 'sin_permisos',
      motivo: MOTIVOS_SIN_PERMISOS.soloProfesor,
      destino: IR_AL_INICIO,
    });
    expect(decidirGuarda(ir('/configuracion'), PROFESOR)).toEqual({ tipo: 'mostrar' });
    expect(decidirGuarda(ir('/ficha'), PROFESOR)).toEqual({
      tipo: 'sin_permisos',
      motivo: MOTIVOS_SIN_PERMISOS.soloAlumnos,
      destino: { texto: 'Ir al panel', href: '#/panel' },
    });
  });

  it('WEB_03_mientras_carga_la_agenda_y_el_inicio_se_muestran_y_el_resto_espera_o_muestra_el_error', () => {
    expect(decidirGuarda(ir('/'), CARGANDO)).toEqual({ tipo: 'mostrar' });
    expect(decidirGuarda(ir('/p/ana-perez'), CARGANDO)).toEqual({ tipo: 'mostrar' });
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
    expect(usuarioNavegacion(PROFESOR)).toEqual({ rol: 'profesor', nombre: 'Prof ana-perez' });
    expect(usuarioNavegacion(conVinculo('aprobado'))).toEqual({ rol: 'alumno', estado: 'aprobado', nombre: 'Ana' });
    expect(usuarioNavegacion(conVinculo('pendiente'))).toEqual({ rol: 'alumno', estado: 'pendiente', nombre: 'Ana' });
    expect(usuarioNavegacion(conVinculo('rechazado'))).toEqual({ rol: 'alumno', estado: 'rechazado', nombre: 'Ana' });
    expect(usuarioNavegacion(FICHA_INCOMPLETA)).toEqual({ rol: 'alumno', estado: 'ficha_incompleta', nombre: 'Ana' });
  });
});

describe('GuardaDeRuta (componente)', () => {
  afterEach(() => configurarSesionActual());

  function montar(ruta: string) {
    const envolver = (texto: string) => (
      <GuardaDeRuta
        esperando={<p>esperando</p>}
        sinPermisos={(motivo, destino) => (
          <p>
            sin permisos: {motivo} ({destino.href})
          </p>
        )}
      >
        <p>{texto}</p>
      </GuardaDeRuta>
    );
    const router = createMemoryRouter(
      [
        { path: '/', element: envolver('inicio') },
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

  it('ALU_03_persona_aprobada_en_ruta_del_profesor_ve_sin_permisos_con_motivo_y_salida', async () => {
    const sesion = persona([inscripcion('ana-perez', 'aprobado')]);
    const cliente = {
      rpc: async () => ({ data: sesion, error: null }),
      auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) },
    };
    configurarSesionActual({
      haySesionGuardada: () => true,
      obtenerCliente: async () => cliente as unknown as SupabaseClient,
    });
    montar('/panel');
    expect(await screen.findByText(`sin permisos: ${MOTIVOS_SIN_PERMISOS.soloProfesor} (#/)`)).toBeTruthy();
  });
});
