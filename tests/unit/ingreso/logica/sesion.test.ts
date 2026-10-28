import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  iniciarSesion,
  MENSAJE_RETORNO_GOOGLE,
  tomarErrorDeIngreso,
  validarSesionGuardada,
  type DependenciasSesion,
  type ValidadorDeSesion,
} from '../../../../src/estado/sesion';
import {
  cerrarSesion,
  claveSesionGuardada,
  configurarSesionActual,
  estadoSesion,
  haySesionGuardadaEn,
  haySesionGuardadaEnNavegador,
  refrescarSesion,
  suscribirSesion,
} from '../../../../src/estado/sesion-actual';
import { CLAVE_RUTA, SIN_RETORNO, type CanjeadorDeCodigo } from '../../../../src/estado/retorno';
import { leerSesionActual, SesionInvalida } from '../../../../src/estado/tipos';
import { MENSAJE_SIN_CONEXION } from '../../../../src/lib/errores';

const BASE = 'https://agendaclasesapp.github.io/reservas/';

function almacen(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial));
  return {
    datos,
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    removeItem: (k: string) => void datos.delete(k),
  };
}

function validador(respuesta: Awaited<ReturnType<ValidadorDeSesion['getUser']>> | Error) {
  return {
    getUser: vi.fn(async () => {
      if (respuesta instanceof Error) throw respuesta;
      return respuesta;
    }),
    signOut: vi.fn(async () => ({ error: null })),
  };
}

function depsArranque(href: string, v: ValidadorDeSesion, haySesion = true) {
  const canje: CanjeadorDeCodigo = { exchangeCodeForSession: vi.fn(async () => ({ error: null })) };
  const cargarValidador = vi.fn(async () => v);
  const alCambiarSesion = vi.fn();
  const d: DependenciasSesion = {
    href,
    history: { replaceState: vi.fn() },
    storage: almacen(),
    cargarAuth: vi.fn(async () => canje),
    haySesionGuardada: () => haySesion,
    cargarValidador,
    alCambiarSesion,
  };
  return { d, cargarValidador, alCambiarSesion, canje };
}

const USUARIO_BORRADO = {
  data: { user: null },
  error: { status: 403, code: 'user_not_found', name: 'AuthApiError', message: 'User from sub claim in JWT does not exist' },
};

describe('iniciarSesion con sesión guardada (H-020, ADR-007)', () => {
  it('H_020_sesion_guardada_de_usuario_borrado_se_cierra_y_la_app_sigue_como_visitante', async () => {
    const v = validador(USUARIO_BORRADO);
    const { d, alCambiarSesion } = depsArranque(`${BASE}#/mis-clases`, v);
    const r = await iniciarSesion(d);
    expect(v.getUser).toHaveBeenCalledOnce();
    expect(v.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(r).toEqual({ ...SIN_RETORNO, sesionCerrada: true });
    expect(alCambiarSesion).toHaveBeenCalledOnce();
  });

  it('H_020_sesion_guardada_valida_se_conserva', async () => {
    const v = validador({ data: { user: { id: 'u1' } }, error: null });
    const { d, alCambiarSesion } = depsArranque(`${BASE}#/`, v);
    await expect(iniciarSesion(d)).resolves.toBe(SIN_RETORNO);
    expect(v.signOut).not.toHaveBeenCalled();
    expect(alCambiarSesion).toHaveBeenCalledOnce();
  });

  it('H_020_sin_sesion_guardada_no_carga_supabase_js', async () => {
    const v = validador({ data: { user: null }, error: null });
    const { d, cargarValidador, alCambiarSesion } = depsArranque(`${BASE}#/`, v, false);
    await expect(iniciarSesion(d)).resolves.toBe(SIN_RETORNO);
    expect(cargarValidador).not.toHaveBeenCalled();
    expect(alCambiarSesion).not.toHaveBeenCalled();
  });

  it('H_020_fallo_de_red_o_5xx_no_cierra_la_sesion', async () => {
    for (const respuesta of [
      new Error('Failed to fetch'),
      { data: { user: null }, error: { status: 0, name: 'AuthRetryableFetchError' } },
      { data: { user: null }, error: { status: 503 } },
    ]) {
      const v = validador(respuesta);
      await expect(validarSesionGuardada(v)).resolves.toBe(true);
      expect(v.signOut).not.toHaveBeenCalled();
    }
  });

  it('H_020_token_invalido_o_sesion_inexistente_cierra_local_aunque_signOut_falle', async () => {
    const v = validador({ data: { user: null }, error: { status: 401, code: 'bad_jwt' } });
    v.signOut.mockRejectedValueOnce(new Error('sin red'));
    await expect(validarSesionGuardada(v)).resolves.toBe(false);
    const sinUsuario = validador({ data: { user: null }, error: null });
    await expect(validarSesionGuardada(sinUsuario)).resolves.toBe(false);
    expect(sinUsuario.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('WEB_02_con_code_canjea_sin_validar_con_getUser_y_refresca', async () => {
    const v = validador(USUARIO_BORRADO);
    const { d, canje, alCambiarSesion } = depsArranque(`${BASE}?code=abc`, v);
    (d.storage as ReturnType<typeof almacen>).datos.set(CLAVE_RUTA, '#/ficha');
    const r = await iniciarSesion(d);
    expect(canje.exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(v.getUser).not.toHaveBeenCalled();
    expect(r.ruta).toBe('#/ficha');
    expect(alCambiarSesion).toHaveBeenCalledOnce();
    expect(tomarErrorDeIngreso()).toBeNull();
  });

  it('ALU_01_error_de_google_se_guarda_como_texto_fijo_y_se_muestra_una_vez', async () => {
    const v = validador(USUARIO_BORRADO);
    const { d } = depsArranque(`${BASE}?error=access_denied&error_description=%3Cimg%20src%3Dx%3E`, v);
    const r = await iniciarSesion(d);
    expect(r.error).toBe('<img src=x>');
    expect(tomarErrorDeIngreso()).toBe(MENSAJE_RETORNO_GOOGLE);
    expect(tomarErrorDeIngreso()).toBeNull();
  });
});

function clienteFalso(rpc: () => Promise<{ data: unknown; error: unknown }>) {
  let oyente: ((evento: string) => void) | undefined;
  const auth = {
    signOut: vi.fn<(o?: { scope?: string }) => Promise<{ error: unknown }>>(async () => ({ error: null })),
    onAuthStateChange: vi.fn((cb: (evento: string) => void) => {
      oyente = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
  };
  const cliente = { rpc: vi.fn(rpc), auth };
  return { cliente, auth, emitir: (e: string) => oyente?.(e), comoSupabase: cliente as unknown as SupabaseClient };
}

// Forma de `sesion_actual()` de B14 (ADR-020): el estado de cada profesor va en `inscripciones`.
const SESION_ALUMNO = {
  rol: 'alumno',
  es_administrador: false,
  profesor: null,
  alumno_id: 'a1',
  estado: 'ficha_incompleta',
  nombre: 'Ana',
  mail: 'ana@example.test',
  inscripciones: [],
};

describe('estado de la sesión (sesion_actual)', () => {
  afterEach(() => configurarSesionActual());

  it('WEB_03_sin_sesion_guardada_arranca_visitante_sin_cargar_el_cliente', async () => {
    const obtenerCliente = vi.fn();
    configurarSesionActual({ obtenerCliente, haySesionGuardada: () => false });
    expect(estadoSesion()).toEqual({ tipo: 'visitante' });
    await expect(refrescarSesion()).resolves.toEqual({ tipo: 'visitante' });
    expect(obtenerCliente).not.toHaveBeenCalled();
  });

  it('WEB_03_con_sesion_lee_sesion_actual_y_avisa_a_los_suscriptos', async () => {
    const { cliente, comoSupabase } = clienteFalso(async () => ({ data: SESION_ALUMNO, error: null }));
    configurarSesionActual({ obtenerCliente: async () => comoSupabase, haySesionGuardada: () => true });
    expect(estadoSesion()).toEqual({ tipo: 'cargando' });
    const oyente = vi.fn();
    const baja = suscribirSesion(oyente);
    const [a, b] = await Promise.all([refrescarSesion(), refrescarSesion()]);
    expect(a).toBe(b);
    expect(cliente.rpc).toHaveBeenCalledOnce();
    expect(cliente.rpc).toHaveBeenCalledWith('sesion_actual');
    expect(estadoSesion()).toEqual({ tipo: 'sesion', sesion: SESION_ALUMNO });
    expect(oyente).toHaveBeenCalled();
    baja();
  });

  it('WEB_03_sesion_sin_cuenta_en_la_app_401_cierra_local_y_queda_visitante', async () => {
    const { auth, comoSupabase } = clienteFalso(async () => ({
      data: null,
      error: { code: 'PT401', message: 'NO_AUTENTICADO', details: null },
    }));
    configurarSesionActual({ obtenerCliente: async () => comoSupabase, haySesionGuardada: () => true });
    await expect(refrescarSesion()).resolves.toEqual({ tipo: 'visitante' });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('WEB_03_fallo_de_red_o_respuesta_fuera_de_contrato_da_error_traducido', async () => {
    const red = clienteFalso(async () => ({ data: null, error: { message: 'TypeError: Failed to fetch' } }));
    configurarSesionActual({ obtenerCliente: async () => red.comoSupabase, haySesionGuardada: () => true });
    await expect(refrescarSesion()).resolves.toEqual({ tipo: 'error', mensaje: MENSAJE_SIN_CONEXION });
    const raro = clienteFalso(async () => ({ data: { rol: 'admin' }, error: null }));
    configurarSesionActual({ obtenerCliente: async () => raro.comoSupabase, haySesionGuardada: () => true });
    const r = await refrescarSesion();
    expect(r.tipo).toBe('error');
  });

  it('WEB_03_signed_out_de_auth_pasa_a_visitante_y_cerrar_sesion_tambien', async () => {
    const f = clienteFalso(async () => ({ data: SESION_ALUMNO, error: null }));
    configurarSesionActual({ obtenerCliente: async () => f.comoSupabase, haySesionGuardada: () => true });
    await refrescarSesion();
    f.emitir('TOKEN_REFRESHED');
    expect(estadoSesion().tipo).toBe('sesion');
    f.emitir('SIGNED_OUT');
    expect(estadoSesion()).toEqual({ tipo: 'visitante' });

    await refrescarSesion();
    f.auth.signOut.mockResolvedValueOnce({ error: { status: 0 } });
    await cerrarSesion();
    expect(f.auth.signOut).toHaveBeenNthCalledWith(1);
    expect(f.auth.signOut).toHaveBeenLastCalledWith({ scope: 'local' });
    expect(estadoSesion()).toEqual({ tipo: 'visitante' });
  });

  it('H_020_la_sesion_guardada_se_busca_con_la_clave_de_supabase_js', () => {
    expect(claveSesionGuardada('https://abcd.supabase.co')).toBe('sb-abcd-auth-token');
    expect(claveSesionGuardada('http://127.0.0.1:54321')).toBe('sb-127-auth-token');
    expect(haySesionGuardadaEn(almacen({ 'sb-abcd-auth-token': '{}' }), 'https://abcd.supabase.co')).toBe(true);
    expect(haySesionGuardadaEn(almacen(), 'https://abcd.supabase.co')).toBe(false);
    const roto = { getItem: () => { throw new Error('bloqueado'); } };
    expect(haySesionGuardadaEn(roto, 'https://abcd.supabase.co')).toBe(false);
    window.localStorage.clear();
    expect(haySesionGuardadaEnNavegador()).toBe(false);
    window.localStorage.setItem('sb-127-auth-token', '{}');
    expect(haySesionGuardadaEnNavegador()).toBe(true);
    window.localStorage.clear();
  });
});

describe('leerSesionActual (contrato, ALU-03)', () => {
  const vinculo = {
    profesor_id: 'p1',
    slug: 'ana-perez',
    profesor_nombre: 'Ana Pérez',
    profesor_activo: true,
    estado: 'rechazado',
    motivo_rechazo: 'Sin cupo',
  };

  it('ALU_03_motivo_de_rechazo_solo_con_el_vinculo_rechazado', () => {
    const s = leerSesionActual({
      ...SESION_ALUMNO,
      estado: 'completa',
      inscripciones: [vinculo, { ...vinculo, profesor_id: 'p2', slug: 'beto', estado: 'aprobado', motivo_rechazo: 'viejo' }],
    });
    expect(s.inscripciones.map((i) => i.motivo_rechazo)).toEqual(['Sin cupo', null]);
    const profesor = leerSesionActual({
      rol: 'profesor',
      es_administrador: false,
      profesor: { id: 'p1', slug: 'ana-perez', nombre: 'P', activo: true },
      alumno_id: null,
      estado: null,
      nombre: 'P',
      mail: 'p@x.y',
      inscripciones: [],
    });
    expect(profesor).toMatchObject({ rol: 'profesor', inscripciones: [] });
  });

  it('WEB_03_respuesta_fuera_de_contrato_lanza', () => {
    for (const malo of [
      null,
      [],
      'x',
      { rol: 'admin' },
      { rol: 'alumno', estado: null },
      { rol: 'alumno', estado: 'otro', alumno_id: 'a1' },
      { rol: 'alumno', estado: 'aprobado', alumno_id: 'a1' },
      { ...SESION_ALUMNO, nombre: 3 },
      { ...SESION_ALUMNO, inscripciones: [{ ...vinculo, estado: 'baja' }] },
    ]) {
      expect(() => leerSesionActual(malo)).toThrow(SesionInvalida);
    }
  });
});
