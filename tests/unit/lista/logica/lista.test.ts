import type { SupabaseClient } from '@supabase/supabase-js';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  altaAlumno,
  aprobarCuenta,
  crearEsquemaAlumno,
  CUENTA_NO_PENDIENTE,
  dependenciasLista,
  descartarUnion,
  editarAlumno,
  esquemaMotivo,
  falloLista,
  leerAlumnos,
  mailSimple,
  MENSAJES_LISTA,
  normalizarMotivo,
  rechazarCuenta,
  separarPendientes,
  sugerenciasUnion,
  UNION_NO_VALIDA,
  unirAlumnos,
  valoresInicialesAlumno,
  type AlumnoEntrada,
  type AlumnoLista,
} from '../../../../src/modulos/lista/logica';
import { useAlumnos } from '../../../../src/modulos/lista/logica/useAlumnos';
import { MENSAJE_SIN_CONEXION, MENSAJES } from '../../../../src/lib/errores';
import { MENSAJES_FICHA } from '../../../../src/modulos/ficha/logica';

const HOY = '2026-11-02';

/** Cliente falso: `rpc` configurable y `from(...).select().order()` encadenable. */
function cliente(opciones: { rpc?: { data: unknown; error: unknown }; filas?: { data: unknown; error: unknown } }) {
  const consulta = {
    select: vi.fn(() => consulta),
    order: vi.fn(async () => opciones.filas ?? { data: [], error: null }),
  };
  const c = {
    rpc: vi.fn(async () => opciones.rpc ?? { data: null, error: null }),
    from: vi.fn(() => consulta),
  };
  return { c, consulta, deps: { obtenerCliente: async () => c as unknown as SupabaseClient } };
}

const err = (code: string, message: string, details: string | null = null) => ({ code, message, details, hint: null });

const ALUMNO: AlumnoLista = {
  id: 'a1',
  estado: 'aprobado',
  nombre: 'Ana',
  mail: 'ana@example.test',
  telefono: '099 123-456',
  fecha_nacimiento: '2000-11-03',
  como_llego: 'Amigos',
  motivo_estado: null,
  con_usuario: true,
  creado_en: '2026-10-01T12:00:00+00:00',
  ficha_completada_en: '2026-10-01T12:05:00+00:00',
  aprobado_en: '2026-10-02T12:00:00+00:00',
  edad: 25,
};

const ENTRADA: AlumnoEntrada = { nombre: ' Beto ', telefono: ' 099 555-111 ', fecha_nacimiento: '1990-01-01', mail: '' };

describe('aprobar y rechazar cuentas (ALU-03, AVI-03, H-037)', () => {
  it('ALU_03_aprobar_sin_motivo_manda_null_y_devuelve_sugerencias', async () => {
    const sug = [{ sin_cuenta_id: 's1', nombre: 'Ana vieja', telefono: '+598 99123456' }];
    const { c, deps } = cliente({ rpc: { data: { estado: 'aprobado', sugerencias: sug }, error: null } });
    const r = await aprobarCuenta('a1', '   ', deps);
    expect(c.rpc).toHaveBeenCalledWith('aprobar_cuenta', { p_alumno_id: 'a1', p_motivo: null });
    expect(r).toEqual({ ok: true, estado: 'aprobado', sugerencias: sug });
  });

  it('H_037_aprobar_siempre_envia_p_motivo_para_reemplazar_el_anterior', async () => {
    const { c, deps } = cliente({ rpc: { data: { estado: 'aprobado', sugerencias: [] }, error: null } });
    await aprobarCuenta('a1', undefined, deps);
    expect(c.rpc).toHaveBeenCalledWith('aprobar_cuenta', { p_alumno_id: 'a1', p_motivo: null });
    await aprobarCuenta('a1', ' Bienvenida ', deps);
    expect(c.rpc).toHaveBeenLastCalledWith('aprobar_cuenta', { p_alumno_id: 'a1', p_motivo: 'Bienvenida' });
  });

  it('ALU_03_rechazar_con_motivo_recortado', async () => {
    const { c, deps } = cliente({ rpc: { data: { estado: 'rechazado', sugerencias: [] }, error: null } });
    const r = await rechazarCuenta('a1', ' <b>Sin lugar</b> ', deps);
    expect(c.rpc).toHaveBeenCalledWith('rechazar_cuenta', { p_alumno_id: 'a1', p_motivo: '<b>Sin lugar</b>' });
    expect(r).toEqual({ ok: true, estado: 'rechazado', sugerencias: [] });
  });

  it('SEC_09_motivo_de_500_pasa_y_de_501_no_llama_a_la_base', async () => {
    const { c, deps } = cliente({ rpc: { data: { estado: 'rechazado', sugerencias: [] }, error: null } });
    expect((await rechazarCuenta('a1', 'x'.repeat(500), deps)).ok).toBe(true);
    const r = await rechazarCuenta('a1', 'x'.repeat(501), deps);
    expect(r).toEqual({
      ok: false,
      codigo: 'DATOS_INVALIDOS',
      mensaje: MENSAJES_LISTA.motivoLargo,
      campo: 'motivo',
      alumnoExistenteId: null,
    });
    expect(c.rpc).toHaveBeenCalledTimes(1);
    expect(esquemaMotivo.safeParse('x'.repeat(501)).success).toBe(false);
  });

  it('SEC_09_el_422_del_servidor_marca_el_campo_motivo', async () => {
    const { deps } = cliente({ rpc: { data: null, error: err('PT422', 'DATOS_INVALIDOS', '{"campo":"motivo"}') } });
    const r = await aprobarCuenta('a1', 'ok', deps);
    expect(r).toMatchObject({ ok: false, codigo: 'DATOS_INVALIDOS', campo: 'motivo', mensaje: MENSAJES.DATOS_INVALIDOS });
  });

  it('ALU_03_cuenta_ya_respondida_da_409_con_texto_propio', async () => {
    const { deps } = cliente({ rpc: { data: null, error: err('PT409', CUENTA_NO_PENDIENTE, '{"estado":"aprobado"}') } });
    expect(await rechazarCuenta('a1', null, deps)).toEqual({
      ok: false,
      codigo: CUENTA_NO_PENDIENTE,
      mensaje: MENSAJES_LISTA[CUENTA_NO_PENDIENTE],
      campo: null,
      alumnoExistenteId: null,
    });
  });

  it('SEC_06_alumno_en_rpc_de_profesor_da_403_prohibido', async () => {
    const { deps } = cliente({ rpc: { data: null, error: err('PT403', 'PROHIBIDO') } });
    expect(await aprobarCuenta('a1', null, deps)).toMatchObject({ ok: false, codigo: 'PROHIBIDO', mensaje: MENSAJES.PROHIBIDO });
  });

  it('ALU_03_cuenta_inexistente_da_404', async () => {
    const { deps } = cliente({ rpc: { data: null, error: err('PT404', 'NO_ENCONTRADO') } });
    expect(await aprobarCuenta('zz', null, deps)).toMatchObject({ ok: false, codigo: 'NO_ENCONTRADO' });
  });

  it('SEC_17_sin_conexion_no_muestra_detalles_crudos', async () => {
    const deps = { obtenerCliente: () => Promise.reject(new TypeError('Failed to fetch')) };
    expect(await aprobarCuenta('a1', null, deps)).toMatchObject({ ok: false, codigo: 'SIN_CONEXION', mensaje: MENSAJE_SIN_CONEXION });
  });
});

describe('unión de alumnos (ALU-04, ALU-05)', () => {
  it('ALU_04_sugerencias_union_lee_la_lista', async () => {
    const sug = [{ sin_cuenta_id: 's1', nombre: 'Ana vieja', telefono: '099 123-456' }];
    const { c, deps } = cliente({ rpc: { data: sug, error: null } });
    expect(await sugerenciasUnion('a1', deps)).toEqual({ ok: true, sugerencias: sug });
    expect(c.rpc).toHaveBeenCalledWith('sugerencias_union', { p_alumno_id: 'a1' });
  });

  it('ALU_04_sin_sugerencias_da_lista_vacia_y_404_se_traduce', async () => {
    expect(await sugerenciasUnion('a1', cliente({ rpc: { data: null, error: null } }).deps)).toEqual({ ok: true, sugerencias: [] });
    const { deps } = cliente({ rpc: { data: null, error: err('PT404', 'NO_ENCONTRADO') } });
    expect(await sugerenciasUnion('zz', deps)).toMatchObject({ ok: false, codigo: 'NO_ENCONTRADO' });
  });

  it('ALU_05_unir_alumnos_devuelve_la_cuenta', async () => {
    const { c, deps } = cliente({ rpc: { data: { cuenta_id: 'a1' }, error: null } });
    expect(await unirAlumnos('a1', 's1', deps)).toEqual({ ok: true, cuentaId: 'a1' });
    expect(c.rpc).toHaveBeenCalledWith('unir_alumnos', { p_cuenta_id: 'a1', p_sin_cuenta_id: 's1' });
  });

  it('ALU_05_union_no_valida_da_409_con_texto_propio', async () => {
    const { deps } = cliente({ rpc: { data: null, error: err('PT409', UNION_NO_VALIDA) } });
    expect(await unirAlumnos('s1', 'a1', deps)).toMatchObject({
      ok: false,
      codigo: UNION_NO_VALIDA,
      mensaje: MENSAJES_LISTA[UNION_NO_VALIDA],
    });
  });

  it('ALU_04_descartar_union', async () => {
    const { c, deps } = cliente({ rpc: { data: { cuenta_id: 'a1' }, error: null } });
    expect(await descartarUnion('a1', 's1', deps)).toEqual({ ok: true, cuentaId: 'a1' });
    expect(c.rpc).toHaveBeenCalledWith('descartar_union', { p_cuenta_id: 'a1', p_sin_cuenta_id: 's1' });
  });

  it('ALU_05_respuesta_fuera_de_contrato_da_error_generico', async () => {
    const { deps } = cliente({ rpc: { data: { otra: 1 }, error: null } });
    expect(await unirAlumnos('a1', 's1', deps)).toMatchObject({ ok: false, codigo: 'DESCONOCIDO' });
  });
});

describe('alta y edición (ALU-07, ALU-08, SEC-09)', () => {
  it('ALU_08_alta_sin_mail_manda_null_y_queda_sin_cuenta', async () => {
    const { c, deps } = cliente({ rpc: { data: { alumno_id: 'n1', estado: 'sin_cuenta' }, error: null } });
    expect(await altaAlumno(ENTRADA, deps)).toEqual({ ok: true, alumnoId: 'n1', estado: 'sin_cuenta' });
    expect(c.rpc).toHaveBeenCalledWith('alta_alumno', {
      p_nombre: 'Beto',
      p_telefono: '099 555-111',
      p_fecha_nacimiento: '1990-01-01',
      p_mail: null,
    });
  });

  it('ALU_07_alta_con_mail_queda_aprobada', async () => {
    const { c, deps } = cliente({ rpc: { data: { alumno_id: 'n1', estado: 'aprobado' }, error: null } });
    expect(await altaAlumno({ ...ENTRADA, mail: ' beto@example.test ' }, deps)).toEqual({
      ok: true,
      alumnoId: 'n1',
      estado: 'aprobado',
    });
    expect(c.rpc).toHaveBeenCalledWith('alta_alumno', expect.objectContaining({ p_mail: 'beto@example.test' }));
  });

  it('ALU_07_mail_ya_registrado_da_409_con_el_alumno_existente', async () => {
    const { deps } = cliente({ rpc: { data: null, error: err('PT409', 'MAIL_YA_REGISTRADO', '{"alumno_id":"a9"}') } });
    expect(await altaAlumno({ ...ENTRADA, mail: 'x@example.test' }, deps)).toEqual({
      ok: false,
      codigo: 'MAIL_YA_REGISTRADO',
      mensaje: MENSAJES.MAIL_YA_REGISTRADO,
      campo: null,
      alumnoExistenteId: 'a9',
    });
    const prof = cliente({ rpc: { data: null, error: err('PT409', 'MAIL_YA_REGISTRADO', '{"alumno_id":null}') } });
    expect(await altaAlumno(ENTRADA, prof.deps)).toMatchObject({ codigo: 'MAIL_YA_REGISTRADO', alumnoExistenteId: null });
  });

  it('SEC_09_alta_422_marca_el_campo_sin_prefijo', async () => {
    for (const [detalle, campo] of [
      ['{"campo":"p_mail"}', 'mail'],
      ['{"campo": "p_telefono"}', 'telefono'],
      ['{"campo":"p_fecha_nacimiento"}', 'fecha_nacimiento'],
      ['{"campo":"p_otro"}', null],
      ['no es json', null],
    ] as const) {
      const { deps } = cliente({ rpc: { data: null, error: err('PT422', 'DATOS_INVALIDOS', detalle) } });
      expect(await altaAlumno(ENTRADA, deps)).toMatchObject({ ok: false, codigo: 'DATOS_INVALIDOS', campo });
    }
  });

  it('ALU_09_editar_manda_el_mail_siempre', async () => {
    const { c, deps } = cliente({ rpc: { data: { alumno_id: 'a1' }, error: null } });
    expect(await editarAlumno('a1', valoresInicialesAlumno(ALUMNO), deps)).toEqual({ ok: true, alumnoId: 'a1' });
    expect(c.rpc).toHaveBeenCalledWith('editar_alumno', {
      p_alumno_id: 'a1',
      p_nombre: 'Ana',
      p_telefono: '099 123-456',
      p_fecha_nacimiento: '2000-11-03',
      p_mail: 'ana@example.test',
    });
  });

  it('ALU_09_editar_inexistente_da_404', async () => {
    const { deps } = cliente({ rpc: { data: null, error: err('PT404', 'NO_ENCONTRADO') } });
    expect(await editarAlumno('zz', ENTRADA, deps)).toMatchObject({ ok: false, codigo: 'NO_ENCONTRADO' });
  });

  it('ALU_07_esquema_del_alta_valida_como_la_base', () => {
    const esquema = crearEsquemaAlumno(HOY);
    expect(esquema.parse({ ...ENTRADA, mail: ' a@b.co ' })).toEqual({
      nombre: 'Beto',
      telefono: '099 555-111',
      fecha_nacimiento: '1990-01-01',
      mail: 'a@b.co',
    });
    expect(esquema.safeParse(ENTRADA).success).toBe(true);
    const mal = (cambio: Partial<AlumnoEntrada>) => esquema.safeParse({ ...ENTRADA, ...cambio });
    expect(mal({ mail: 'a@b.c, d@e.f' }).error?.issues[0]?.message).toBe(MENSAJES_LISTA.mailInvalido);
    expect(mal({ telefono: '12-3' }).error?.issues[0]?.message).toBe(MENSAJES_FICHA.telefonoInvalido);
    expect(mal({ fecha_nacimiento: '2026-11-03' }).success).toBe(false);
    expect(mal({ fecha_nacimiento: HOY }).success).toBe(true);
    expect(mal({ nombre: 'x'.repeat(101) }).success).toBe(false);
  });

  it('SEC_09_mail_simple_como_es_mail_simple', () => {
    expect(mailSimple('ana@example.test')).toBe(true);
    for (const malo of ['ana', 'a b@c.d', 'a@b', 'a@b.c;d@e.f', '<a@b.c>', 'a@@b.c']) expect(mailSimple(malo)).toBe(false);
    expect(mailSimple(`${'a'.repeat(244)}@example.t`)).toBe(true);
    expect(mailSimple(`${'a'.repeat(245)}@example.t`)).toBe(false);
  });
});

describe('lista de alumnos (ALU-09)', () => {
  it('ALU_09_lee_v_alumnos_con_edad_por_nombre', async () => {
    const { c, consulta, deps } = cliente({ filas: { data: [ALUMNO], error: null } });
    expect(await leerAlumnos(deps)).toEqual([ALUMNO]);
    expect(c.from).toHaveBeenCalledWith('v_alumnos');
    expect(consulta.select).toHaveBeenCalledWith(expect.stringContaining('edad'));
    expect(consulta.order).toHaveBeenCalledWith('nombre');
  });

  it('ALU_09_error_de_lectura_se_propaga_y_fila_fuera_de_contrato_falla', async () => {
    const e = err('PGRST301', 'JWT expired');
    await expect(leerAlumnos(cliente({ filas: { data: null, error: e } }).deps)).rejects.toBe(e);
    await expect(leerAlumnos(cliente({ filas: { data: [{ ...ALUMNO, estado: 'borrado' }], error: null } }).deps)).rejects.toThrow();
    expect(await leerAlumnos(cliente({ filas: { data: null, error: null } }).deps)).toEqual([]);
  });

  it('ALU_03_separa_pendientes_por_fecha_de_ficha', () => {
    const p1 = { ...ALUMNO, id: 'p1', estado: 'pendiente' as const, ficha_completada_en: '2026-10-03T00:00:00+00:00' };
    const p2 = { ...ALUMNO, id: 'p2', estado: 'pendiente' as const, ficha_completada_en: null, creado_en: '2026-10-02T00:00:00+00:00' };
    const s = { ...ALUMNO, id: 's', estado: 'sin_cuenta' as const };
    expect(separarPendientes([p1, ALUMNO, p2, s])).toEqual({ pendientes: [p2, p1], resto: [ALUMNO, s] });
    expect(separarPendientes([])).toEqual({ pendientes: [], resto: [] });
  });

  it('ALU_09_valores_iniciales_de_alta_vacios', () => {
    expect(valoresInicialesAlumno(null)).toEqual({ nombre: '', telefono: '', fecha_nacimiento: '', mail: '' });
    const sinDatos = { ...ALUMNO, nombre: null, mail: null, telefono: null, fecha_nacimiento: null };
    expect(valoresInicialesAlumno(sinDatos)).toEqual({ nombre: '', telefono: '', fecha_nacimiento: '', mail: '' });
  });

  it('ALU_03_normalizar_motivo', () => {
    expect(normalizarMotivo(null)).toBeNull();
    expect(normalizarMotivo('  ')).toBeNull();
    expect(normalizarMotivo(' a ')).toBe('a');
  });

  it('SEC_17_fallo_lista_con_error_desconocido_da_generico', () => {
    expect(falloLista(new Error('boom'))).toMatchObject({ codigo: 'DESCONOCIDO', campo: null, alumnoExistenteId: null });
    expect(falloLista(null)).toMatchObject({ codigo: 'DESCONOCIDO' });
  });

  it('ALU_09_dependencias_reales_cargan_supabase_diferido', () => {
    expect(typeof dependenciasLista().obtenerCliente).toBe('function');
  });
});

describe('useAlumnos (ALU-09)', () => {
  it('ALU_09_carga_y_recarga_conservando_la_lista', async () => {
    const lector = vi.fn().mockResolvedValueOnce([ALUMNO]).mockRejectedValueOnce(err('PT403', 'PROHIBIDO'));
    const { result } = renderHook(() => useAlumnos(lector));
    expect(result.current.datos.estado).toBe('cargando');
    await waitFor(() => expect(result.current.datos).toEqual({ estado: 'listo', alumnos: [ALUMNO], error: null }));
    act(() => result.current.recargar());
    await waitFor(() => expect(result.current.datos.estado).toBe('error'));
    expect(result.current.datos).toEqual({ estado: 'error', alumnos: [ALUMNO], error: MENSAJES.PROHIBIDO });
    expect(lector).toHaveBeenCalledTimes(2);
  });
});
