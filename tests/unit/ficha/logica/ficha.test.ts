import type { SupabaseClient } from '@supabase/supabase-js';
import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  completarFicha,
  crearEsquemaFicha,
  crearEsquemaPersona,
  dependenciasFicha,
  guardarPersonaACargo,
  leerMiFicha,
  leerPersonasACargo,
  MENSAJES_FICHA,
  telefonoValido,
  valoresInicialesFicha,
  type FichaEntrada,
} from '../../../../src/modulos/ficha/logica';
import { usePersonasACargo } from '../../../../src/modulos/ficha/logica/usePersonasACargo';
import { MENSAJE_FICHAS_ALU13, MENSAJE_SIN_CONEXION, MENSAJES } from '../../../../src/lib/errores';

const HOY = '2026-11-02';

const FICHA: FichaEntrada = {
  nombre: ' Ana Pérez ',
  telefono: '+598 99 123-456',
  fecha_nacimiento: '1990-02-03',
  como_llego: ' Por una amiga ',
};

/** Cliente falso: `rpc` configurable y `from(...).select().eq().order()|maybeSingle()` encadenable. */
function cliente(opciones: { rpc?: { data: unknown; error: unknown }; filas?: { data: unknown; error: unknown } }) {
  const consulta = {
    select: vi.fn(() => consulta),
    eq: vi.fn(() => consulta),
    order: vi.fn(async () => opciones.filas ?? { data: [], error: null }),
    maybeSingle: vi.fn(async () => opciones.filas ?? { data: null, error: null }),
  };
  const c = {
    rpc: vi.fn(async () => opciones.rpc ?? { data: null, error: null }),
    from: vi.fn(() => consulta),
  };
  return { c, consulta, obtenerCliente: async () => c as unknown as SupabaseClient };
}

const err = (code: string, message: string, details: string | null = null) => ({ code, message, details, hint: null });

describe('esquema de la ficha (ALU-02, SEC-09)', () => {
  const esquema = crearEsquemaFicha(HOY);

  it('ALU_02_ficha_completa_valida_y_recortada', () => {
    expect(esquema.parse(FICHA)).toEqual({
      nombre: 'Ana Pérez',
      telefono: '+598 99 123-456',
      fecha_nacimiento: '1990-02-03',
      como_llego: 'Por una amiga',
    });
  });

  it('SEC_09_nombre_100_pasa_y_101_no', () => {
    expect(esquema.safeParse({ ...FICHA, nombre: 'a'.repeat(100) }).success).toBe(true);
    const r = esquema.safeParse({ ...FICHA, nombre: 'a'.repeat(101) });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(MENSAJES_FICHA.nombreLargo);
    expect(esquema.safeParse({ ...FICHA, nombre: '   ' }).error?.issues[0]?.message).toBe(MENSAJES_FICHA.nombreVacio);
  });

  it('SEC_09_telefono_con_formato_y_hasta_20', () => {
    expect(telefonoValido('099 123 456')).toBe(true);
    expect(telefonoValido('(099) 123-456')).toBe(true);
    expect(telefonoValido('+5989912345678901234')).toBe(false); // 20 caracteres pero 19 dígitos
    expect(telefonoValido('1'.repeat(15))).toBe(true);
    expect(telefonoValido('12345')).toBe(false);
    expect(telefonoValido('099abc123')).toBe(false);
    expect(telefonoValido('099+123456')).toBe(false);
    expect(esquema.safeParse({ ...FICHA, telefono: '1 2 3 4 5 6 7 8 9 0 1' }).success).toBe(false);
  });

  it('SEC_09_fecha_de_nacimiento_entre_1900_y_hoy', () => {
    expect(esquema.safeParse({ ...FICHA, fecha_nacimiento: '1900-01-01' }).success).toBe(true);
    expect(esquema.safeParse({ ...FICHA, fecha_nacimiento: HOY }).success).toBe(true);
    for (const malo of ['1899-12-31', '2026-11-03', '2026-02-30', '03/02/1990', '']) {
      const r = esquema.safeParse({ ...FICHA, fecha_nacimiento: malo });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0]?.message).toBe(MENSAJES_FICHA.fechaInvalida);
    }
  });

  it('SEC_09_como_llego_obligatorio_y_hasta_200', () => {
    expect(esquema.safeParse({ ...FICHA, como_llego: 'x'.repeat(200) }).success).toBe(true);
    expect(esquema.safeParse({ ...FICHA, como_llego: 'x'.repeat(201) }).success).toBe(false);
    expect(esquema.safeParse({ ...FICHA, como_llego: '' }).error?.issues[0]?.message).toBe(MENSAJES_FICHA.comoLlegoVacio);
  });

  it('SEC_29_persona_a_cargo_solo_nombre_y_fecha', () => {
    const persona = crearEsquemaPersona(HOY);
    expect(persona.parse({ nombre: ' Leo ', fecha_nacimiento: '2015-05-05', mail: 'x@y.z' })).toEqual({
      nombre: 'Leo',
      fecha_nacimiento: '2015-05-05',
    });
    expect(persona.safeParse({ nombre: 'Leo', fecha_nacimiento: '' }).success).toBe(false);
  });
});

describe('completarFicha (ALU-02, ALU-13)', () => {
  it('ALU_02_completa_con_los_campos_recortados_y_refresca_la_sesion', async () => {
    const { c, obtenerCliente } = cliente({ rpc: { data: { estado: 'pendiente' }, error: null } });
    const alCompletar = vi.fn(async () => undefined);
    await expect(completarFicha(FICHA, { obtenerCliente, alCompletar })).resolves.toEqual({ ok: true });
    expect(c.rpc).toHaveBeenCalledWith('completar_ficha', {
      p_nombre: 'Ana Pérez',
      p_telefono: '+598 99 123-456',
      p_fecha_nacimiento: '1990-02-03',
      p_como_llego: 'Por una amiga',
    });
    expect(alCompletar).toHaveBeenCalledOnce();
  });

  it('ALU_13_tope_de_fichas_da_el_mensaje_de_intentar_mas_tarde_y_no_refresca', async () => {
    const { obtenerCliente } = cliente({
      rpc: { data: null, error: err('PT429', 'LIMITE_EXCEDIDO', '{"tope": "fichas", "limite": 10}') },
    });
    const alCompletar = vi.fn(async () => undefined);
    const r = await completarFicha(FICHA, { obtenerCliente, alCompletar });
    expect(r).toEqual({ ok: false, codigo: 'LIMITE_EXCEDIDO', mensaje: MENSAJE_FICHAS_ALU13, campo: null });
    expect(alCompletar).not.toHaveBeenCalled();
  });

  it('SEC_09_datos_invalidos_marca_el_campo_sin_mostrar_details', async () => {
    const { obtenerCliente } = cliente({ rpc: { data: null, error: err('PT422', 'DATOS_INVALIDOS', '{"campo": "p_telefono"}') } });
    const r = await completarFicha(FICHA, { obtenerCliente, alCompletar: vi.fn() });
    expect(r).toEqual({ ok: false, codigo: 'DATOS_INVALIDOS', mensaje: MENSAJES.DATOS_INVALIDOS, campo: 'telefono' });
    for (const details of ['{"campo":"p_otro"}', 'no json', null, '{"campo":3}']) {
      const otro = cliente({ rpc: { data: null, error: err('PT422', 'DATOS_INVALIDOS', details) } });
      const r2 = await completarFicha(FICHA, { obtenerCliente: otro.obtenerCliente, alCompletar: vi.fn() });
      expect(r2).toMatchObject({ ok: false, campo: null });
    }
  });

  it('ALU_02_ficha_ya_completa_se_toma_como_hecha', async () => {
    const { obtenerCliente } = cliente({ rpc: { data: null, error: err('PT409', 'FICHA_YA_COMPLETA') } });
    const alCompletar = vi.fn(async () => undefined);
    await expect(completarFicha(FICHA, { obtenerCliente, alCompletar })).resolves.toEqual({ ok: true });
    expect(alCompletar).toHaveBeenCalledOnce();
  });

  it('SEC_06_sin_sesion_o_sin_red_da_mensajes_del_catalogo', async () => {
    const { obtenerCliente } = cliente({ rpc: { data: null, error: err('PT401', 'NO_AUTENTICADO') } });
    await expect(completarFicha(FICHA, { obtenerCliente, alCompletar: vi.fn() })).resolves.toMatchObject({
      ok: false,
      codigo: 'NO_AUTENTICADO',
    });
    const sinRed = async (): Promise<SupabaseClient> => {
      throw new TypeError('Failed to fetch');
    };
    await expect(completarFicha(FICHA, { obtenerCliente: sinRed, alCompletar: vi.fn() })).resolves.toEqual({
      ok: false,
      codigo: 'SIN_CONEXION',
      mensaje: MENSAJE_SIN_CONEXION,
      campo: null,
    });
  });
});

describe('personas a cargo (ALU-06, SEC-29)', () => {
  it('ALU_06_alta_de_persona_a_cargo_devuelve_el_id', async () => {
    const { c, obtenerCliente } = cliente({ rpc: { data: { id: 'p1' }, error: null } });
    const r = await guardarPersonaACargo({ id: null, nombre: ' Leo ', fecha_nacimiento: '2015-05-05' }, { obtenerCliente });
    expect(r).toEqual({ ok: true, id: 'p1' });
    expect(c.rpc).toHaveBeenCalledWith('guardar_persona_a_cargo', {
      p_id: null,
      p_nombre: 'Leo',
      p_fecha_nacimiento: '2015-05-05',
    });
  });

  it('ALU_06_edicion_de_una_ajena_o_inexistente_da_403_o_404', async () => {
    const ajena = cliente({ rpc: { data: null, error: err('PT403', 'PROHIBIDO') } });
    await expect(
      guardarPersonaACargo({ id: 'x', nombre: 'Leo', fecha_nacimiento: '2015-05-05' }, { obtenerCliente: ajena.obtenerCliente }),
    ).resolves.toMatchObject({ ok: false, codigo: 'PROHIBIDO', mensaje: MENSAJES.PROHIBIDO });
    const nada = cliente({ rpc: { data: null, error: err('PT404', 'NO_ENCONTRADO') } });
    await expect(
      guardarPersonaACargo({ id: 'x', nombre: 'Leo', fecha_nacimiento: '2015-05-05' }, { obtenerCliente: nada.obtenerCliente }),
    ).resolves.toMatchObject({ ok: false, codigo: 'NO_ENCONTRADO' });
    const incompleta = cliente({ rpc: { data: null, error: err('PT403', 'FICHA_INCOMPLETA') } });
    await expect(
      guardarPersonaACargo({ id: null, nombre: 'Leo', fecha_nacimiento: '2015-05-05' }, { obtenerCliente: incompleta.obtenerCliente }),
    ).resolves.toMatchObject({ ok: false, codigo: 'FICHA_INCOMPLETA' });
    const raro = cliente({ rpc: { data: { otro: 1 }, error: null } });
    await expect(
      guardarPersonaACargo({ id: null, nombre: 'Leo', fecha_nacimiento: '2015-05-05' }, { obtenerCliente: raro.obtenerCliente }),
    ).resolves.toMatchObject({ ok: false, codigo: 'DESCONOCIDO' });
  });

  it('ALU_06_lee_las_personas_del_alumno_por_nombre', async () => {
    const filas = [{ id: 'p1', nombre: 'Leo', fecha_nacimiento: '2015-05-05' }];
    const { c, consulta, obtenerCliente } = cliente({ filas: { data: filas, error: null } });
    await expect(leerPersonasACargo('a1', { obtenerCliente })).resolves.toEqual(filas);
    expect(c.from).toHaveBeenCalledWith('persona_a_cargo');
    expect(consulta.select).toHaveBeenCalledWith('id, nombre, fecha_nacimiento');
    expect(consulta.eq).toHaveBeenCalledWith('alumno_id', 'a1');
    const conError = cliente({ filas: { data: null, error: err('42501', 'permission denied') } });
    await expect(leerPersonasACargo('a1', { obtenerCliente: conError.obtenerCliente })).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('ALU_02_mi_ficha_prellena_nombre_y_mail_de_google', async () => {
    const fila = { nombre: 'Ana Google', mail: 'ana@x.y', telefono: null, fecha_nacimiento: null, como_llego: null };
    const { obtenerCliente } = cliente({ filas: { data: fila, error: null } });
    const ficha = await leerMiFicha('a1', { obtenerCliente });
    expect(valoresInicialesFicha(ficha)).toEqual({ nombre: 'Ana Google', telefono: '', fecha_nacimiento: '', como_llego: '' });
    expect(valoresInicialesFicha(null).nombre).toBe('');
    const vacio = cliente({ filas: { data: null, error: null } });
    await expect(leerMiFicha('a1', { obtenerCliente: vacio.obtenerCliente })).resolves.toBeNull();
    const conError = cliente({ filas: { data: null, error: err('XX', 'x') } });
    await expect(leerMiFicha('a1', { obtenerCliente: conError.obtenerCliente })).rejects.toBeTruthy();
  });

  it('ALU_06_hook_carga_recarga_y_traduce_errores', async () => {
    const filas = [{ id: 'p1', nombre: 'Leo', fecha_nacimiento: '2015-05-05' }];
    const { consulta, obtenerCliente } = cliente({ filas: { data: filas, error: null } });
    const deps = { obtenerCliente };
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => usePersonasACargo(id, deps), {
      initialProps: { id: null as string | null },
    });
    expect(result.current.estado).toEqual({ tipo: 'cargando' });
    rerender({ id: 'a1' });
    await waitFor(() => expect(result.current.estado).toEqual({ tipo: 'ok', personas: filas }));
    act(() => result.current.recargar());
    await waitFor(() => expect(consulta.order).toHaveBeenCalledTimes(2));

    const conError = cliente({ filas: { data: null, error: { message: 'Failed to fetch' } } });
    const depsError = { obtenerCliente: conError.obtenerCliente };
    const { result: r2 } = renderHook(() => usePersonasACargo('a1', depsError));
    await waitFor(() => expect(r2.current.estado).toEqual({ tipo: 'error', mensaje: MENSAJE_SIN_CONEXION }));
  });

  it('ALU_02_dependencias_reales_cargan_supabase_y_refrescan_la_sesion', () => {
    const d = dependenciasFicha();
    expect(typeof d.obtenerCliente).toBe('function');
    expect(typeof d.alCompletar).toBe('function');
  });
});
