import type { SupabaseClient } from '@supabase/supabase-js';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  crearEsquemaPedirAcceso,
  MENSAJES_FICHA,
  pedirInscripcion,
  resolverProfesorDeOrigen,
  useProfesorDeOrigen,
  vinculosDeFicha,
} from '../../../../src/modulos/ficha/logica';
import { reiniciarConfigPublica, type ConfigPublica, type ConfigPublicaCargada } from '../../../../src/modulos/agenda/logica';
import {
  CLAVE_PROFESOR_ORIGEN,
  configurarAlmacenProfesor,
  guardarProfesorOrigen,
} from '../../../../src/estado/profesor';
import { configurarSesionActual } from '../../../../src/estado/sesion-actual';
import { MENSAJES } from '../../../../src/lib/errores';
import { almacenEnMemoria, enSesion, inscripcion, persona } from '../../estado/soporte';

const err = (code: string, message: string, details: string | null = null) => ({ code, message, details, hint: null });

function cliente(rpc: { data: unknown; error: unknown }) {
  const c = { rpc: vi.fn(async () => rpc) };
  return { c, obtenerCliente: async () => c as unknown as SupabaseClient };
}

describe('pedirInscripcion (ALU-14, DEC-33)', () => {
  it('ALU_14_pide_acceso_con_slug_y_como_llego_y_refresca_la_sesion', async () => {
    const { c, obtenerCliente } = cliente({ data: { profesor_id: 'p-beto', estado: 'pendiente' }, error: null });
    const alCompletar = vi.fn(async () => undefined);
    const r = await pedirInscripcion(' Beto-Gomez ', { como_llego: ' Instagram ' }, { obtenerCliente, alCompletar });
    expect(r).toEqual({ ok: true, profesorId: 'p-beto', estado: 'pendiente' });
    expect(c.rpc).toHaveBeenCalledWith('pedir_inscripcion', { p_slug: 'beto-gomez', p_como_llego: 'Instagram' });
    expect(alCompletar).toHaveBeenCalledOnce();
  });

  it('ALU_14_como_llego_vacio_o_largo_no_llama_a_la_base', async () => {
    const { c, obtenerCliente } = cliente({ data: null, error: null });
    const alCompletar = vi.fn();
    await expect(pedirInscripcion('beto-gomez', { como_llego: '  ' }, { obtenerCliente, alCompletar })).resolves.toEqual({
      ok: false,
      codigo: 'DATOS_INVALIDOS',
      mensaje: MENSAJES_FICHA.comoLlegoVacio,
      campo: 'como_llego',
    });
    await expect(
      pedirInscripcion('beto-gomez', { como_llego: 'x'.repeat(201) }, { obtenerCliente, alCompletar }),
    ).resolves.toMatchObject({ ok: false, mensaje: MENSAJES_FICHA.comoLlegoLargo, campo: 'como_llego' });
    expect(crearEsquemaPedirAcceso().safeParse({ como_llego: 'x'.repeat(200) }).success).toBe(true);
    expect(c.rpc).not.toHaveBeenCalled();
    expect(alCompletar).not.toHaveBeenCalled();
  });

  it('AGE_09_un_slug_invalido_da_404_sin_llamar', async () => {
    const { c, obtenerCliente } = cliente({ data: null, error: null });
    const r = await pedirInscripcion('admin', { como_llego: 'x' }, { obtenerCliente, alCompletar: vi.fn() });
    expect(r).toMatchObject({ ok: false, codigo: 'NO_ENCONTRADO', mensaje: MENSAJES.NO_ENCONTRADO });
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it('ALU_03_con_un_vinculo_existente_dice_que_ya_pidio_y_refresca_para_mostrar_el_estado', async () => {
    const { obtenerCliente } = cliente({ data: null, error: err('PT409', 'CUENTA_NO_PENDIENTE', '{"estado":"rechazado"}') });
    const alCompletar = vi.fn(async () => undefined);
    const r = await pedirInscripcion('beto-gomez', { como_llego: 'x' }, { obtenerCliente, alCompletar });
    expect(r).toEqual({ ok: false, codigo: 'CUENTA_NO_PENDIENTE', mensaje: MENSAJES_FICHA.yaPediste, campo: null });
    expect(alCompletar).toHaveBeenCalledOnce();
  });

  it.each([
    ['PT409', 'PROFESOR_INACTIVO'],
    ['PT403', 'FICHA_INCOMPLETA'],
    ['PT403', 'PROHIBIDO'],
    ['PT404', 'NO_ENCONTRADO'],
  ])('AGE_11_%s_%s_se_traduce_con_el_catalogo_y_no_refresca', async (code, message) => {
    const { obtenerCliente } = cliente({ data: null, error: err(code, message) });
    const alCompletar = vi.fn();
    const r = await pedirInscripcion('beto-gomez', { como_llego: 'x' }, { obtenerCliente, alCompletar });
    expect(r).toMatchObject({ ok: false, codigo: message });
    expect(alCompletar).not.toHaveBeenCalled();
  });

  it('SEC_17_respuesta_sin_forma_o_sin_red_no_muestra_crudos', async () => {
    const raro = cliente({ data: { otra: 'cosa' }, error: null });
    await expect(
      pedirInscripcion('beto-gomez', { como_llego: 'x' }, { obtenerCliente: raro.obtenerCliente, alCompletar: vi.fn() }),
    ).resolves.toMatchObject({ ok: false, codigo: 'DESCONOCIDO' });
    const sinRed = async (): Promise<SupabaseClient> => {
      throw new TypeError('Failed to fetch');
    };
    await expect(
      pedirInscripcion('beto-gomez', { como_llego: 'x' }, { obtenerCliente: sinRed, alCompletar: vi.fn() }),
    ).resolves.toMatchObject({ ok: false, codigo: 'SIN_CONEXION' });
  });
});

describe('vinculosDeFicha (WEB-03, ALU-03)', () => {
  it('ALU_03_estado_con_cada_profesor_y_motivo_solo_del_que_rechazo_con_texto', () => {
    const s = persona([
      inscripcion('ana-perez', 'aprobado'),
      inscripcion('beto-gomez', 'rechazado', { motivo_rechazo: '  No tengo lugar  ' }),
      inscripcion('caro-diaz', 'rechazado', { motivo_rechazo: '   ' }),
      inscripcion('dani-ruiz', 'pendiente', { profesor_activo: false }),
    ]);
    expect(vinculosDeFicha(s)).toEqual([
      { profesorId: 'id-ana-perez', slug: 'ana-perez', profesorNombre: 'Prof ana-perez', profesorActivo: true, estado: 'aprobado', motivo: null },
      { profesorId: 'id-beto-gomez', slug: 'beto-gomez', profesorNombre: 'Prof beto-gomez', profesorActivo: true, estado: 'rechazado', motivo: 'No tengo lugar' },
      { profesorId: 'id-caro-diaz', slug: 'caro-diaz', profesorNombre: 'Prof caro-diaz', profesorActivo: true, estado: 'rechazado', motivo: null },
      { profesorId: 'id-dani-ruiz', slug: 'dani-ruiz', profesorNombre: 'Prof dani-ruiz', profesorActivo: false, estado: 'pendiente', motivo: null },
    ]);
  });

  it('ALU_14_sin_vinculos_o_sin_persona_da_lista_vacia', () => {
    expect(vinculosDeFicha(persona([]))).toEqual([]);
    expect(vinculosDeFicha(null)).toEqual([]);
  });
});

const ACTIVO: ConfigPublica = {
  profesor_id: 'id-ana-perez',
  nombre: 'Ana Pérez',
  activo: true,
  zona_horaria: 'America/Montevideo',
  duracion_min: 60,
  anticipacion_horas: 24,
  horizonte_semanas: 26,
};

function cargada(parcial: Partial<ConfigPublicaCargada>): ConfigPublicaCargada {
  return { estado: 'cargando', config: null, error: null, enlaceNoValido: false, recargar: () => undefined, ...parcial };
}

describe('resolverProfesorDeOrigen (ADR-020, ALU-14)', () => {
  const sinVinculo = enSesion(persona([], 'ficha_incompleta'));

  it('ALU_14_sin_slug_guardado_no_hay_origen', () => {
    expect(resolverProfesorDeOrigen(null, sinVinculo, cargada({}))).toEqual({
      origen: { estado: 'sin_origen' },
      descartar: false,
    });
  });

  it('ALU_14_profesor_activo_da_su_nombre_para_preguntar_como_llego', () => {
    const r = resolverProfesorDeOrigen('ana-perez', sinVinculo, cargada({ estado: 'listo', config: ACTIVO }));
    expect(r).toEqual({ origen: { estado: 'listo', slug: 'ana-perez', nombre: 'Ana Pérez' }, descartar: false });
    expect(resolverProfesorDeOrigen('ana-perez', sinVinculo, cargada({})).origen).toEqual({
      estado: 'cargando',
      slug: 'ana-perez',
    });
  });

  it('AGE_11_profesor_inactivo_o_inexistente_no_es_origen_y_se_descarta', () => {
    const inactivo = cargada({ estado: 'listo', config: { profesor_id: 'x', nombre: 'Ana', activo: false } });
    expect(resolverProfesorDeOrigen('ana-perez', sinVinculo, inactivo)).toEqual({
      origen: { estado: 'sin_origen' },
      descartar: true,
    });
    const noExiste = cargada({ estado: 'error', error: { codigo: 'NO_ENCONTRADO', mensaje: 'x' }, enlaceNoValido: true });
    expect(resolverProfesorDeOrigen('ana-perez', sinVinculo, noExiste).descartar).toBe(true);
  });

  it('ALU_14_un_error_de_red_no_descarta_y_permite_reintentar', () => {
    const recargar = vi.fn();
    const r = resolverProfesorDeOrigen(
      'ana-perez',
      sinVinculo,
      cargada({ estado: 'error', error: { codigo: 'SIN_CONEXION', mensaje: 'sin red' }, recargar }),
    );
    expect(r.descartar).toBe(false);
    expect(r.origen).toMatchObject({ estado: 'error', slug: 'ana-perez', error: { codigo: 'SIN_CONEXION' } });
    if (r.origen.estado === 'error') r.origen.recargar();
    expect(recargar).toHaveBeenCalledOnce();
  });

  it('DEC_28_con_vinculo_con_ese_profesor_no_es_origen', () => {
    const conVinculo = enSesion(persona([inscripcion('ana-perez', 'pendiente')]));
    expect(resolverProfesorDeOrigen('ana-perez', conVinculo, cargada({ estado: 'listo', config: ACTIVO }))).toEqual({
      origen: { estado: 'sin_origen' },
      descartar: true,
    });
  });
});

describe('useProfesorDeOrigen (ADR-020)', () => {
  let memoria: ReturnType<typeof almacenEnMemoria>;

  beforeEach(() => {
    memoria = almacenEnMemoria();
    configurarAlmacenProfesor(() => memoria.almacen);
    configurarSesionActual({ haySesionGuardada: () => false });
  });

  afterEach(() => {
    configurarAlmacenProfesor();
    configurarSesionActual();
    reiniciarConfigPublica();
  });

  it('ALU_14_lee_el_origen_guardado_y_lo_confirma_con_config_publica', async () => {
    guardarProfesorOrigen('ana-perez');
    const obtener = vi.fn(async () => ACTIVO);
    const { result } = renderHook(() => useProfesorDeOrigen(obtener));
    expect(result.current).toEqual({ estado: 'cargando', slug: 'ana-perez' });
    await waitFor(() => expect(result.current).toEqual({ estado: 'listo', slug: 'ana-perez', nombre: 'Ana Pérez' }));
    expect(obtener).toHaveBeenCalledWith('ana-perez');
  });

  it('AGE_11_un_origen_inactivo_se_olvida_de_la_pestana', async () => {
    guardarProfesorOrigen('ana-perez');
    const obtener = vi.fn(async (): Promise<ConfigPublica> => ({ profesor_id: 'x', nombre: 'Ana', activo: false }));
    const { result } = renderHook(() => useProfesorDeOrigen(obtener));
    await waitFor(() => expect(memoria.datos.has(CLAVE_PROFESOR_ORIGEN)).toBe(false));
    await act(async () => undefined);
    expect(result.current).toEqual({ estado: 'sin_origen' });
  });

  it('ALU_14_sin_origen_no_consulta_la_base', async () => {
    const obtener = vi.fn(async () => ACTIVO);
    const { result } = renderHook(() => useProfesorDeOrigen(obtener));
    await act(async () => undefined);
    expect(result.current).toEqual({ estado: 'sin_origen' });
    expect(obtener).not.toHaveBeenCalled();
  });
});
