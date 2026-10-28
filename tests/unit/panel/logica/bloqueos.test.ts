// B10 · T10.1 · Bloqueos desde el panel: `bloquear` y `desbloquear` (contratos.md §3).
// AGE-05, AGE-06, AGE-10, SEC-06, SEC-09, SEC-17. Apoyo de CA-14 y CA-52.
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  accionesBloqueo,
  bloquear,
  bloqueoDeDias,
  bloqueoDeHoras,
  bloqueoDeHuecos,
  conflictosDelError,
  dependenciasPanel,
  desbloquear,
  falloBloqueo,
  MENSAJES_BLOQUEO,
  normalizarMotivo,
  textoConflicto,
  validarBloqueo,
  type ConflictoBloqueo,
  type FilaAgendaProfesor,
} from '../../../../src/modulos/panel/logica';
import { MENSAJE_GENERICO, MENSAJES } from '../../../../src/lib/errores';

const real = vi.hoisted(() => ({ cliente: null as unknown }));
vi.mock('../../../../src/lib/supabase', () => ({ cargarSupabase: async () => real.cliente }));

const ZONA = 'America/Montevideo';

type Resultado = { data: unknown; error: unknown };

function cliente(rpc: Resultado = { data: null, error: null }) {
  const c = { rpc: vi.fn(async () => rpc) };
  return { c, deps: { obtenerCliente: async () => c as unknown as SupabaseClient } };
}

function errorPg(message: string, details?: unknown, code = 'PT409') {
  return { code, message, details: details === undefined ? null : JSON.stringify(details) };
}

const CONFLICTOS: ConflictoBloqueo[] = [
  { clase_id: 'c1', inicio: '2026-11-04T13:00:00+00:00', estado: 'confirmada', alumno: 'Ana' },
  { clase_id: 'c2', inicio: '2026-11-04T14:00:00+00:00', estado: 'pendiente', alumno: null },
];

function fila(cambios: Partial<FilaAgendaProfesor> = {}): FilaAgendaProfesor {
  return {
    inicio: '2026-11-04T13:00:00+00:00',
    fin: '2026-11-04T14:00:00+00:00',
    estado: 'libre',
    clase_id: null,
    solicitud_id: null,
    quien_toma: null,
    titular: null,
    observacion: null,
    clase_estado: null,
    bloqueo_id: null,
    bloqueo_motivo: null,
    reserva_tipo: null,
    pasada: false,
    ...cambios,
  };
}

describe('armar el período del bloqueo en el huso del profesor (AGE-05)', () => {
  it('AGE_05_un_hueco_va_de_su_inicio_a_su_fin', () => {
    expect(bloqueoDeHuecos(fila())).toEqual({
      desde: '2026-11-04T13:00:00+00:00',
      hasta: '2026-11-04T14:00:00+00:00',
      motivo: null,
    });
  });

  it('AGE_05_un_rango_de_huecos_va_del_inicio_del_primero_al_fin_del_ultimo_en_cualquier_orden', () => {
    const a = fila();
    const b = fila({ inicio: '2026-11-04T16:00:00+00:00', fin: '2026-11-04T17:00:00+00:00' });
    expect(bloqueoDeHuecos(b, a, 'Médico')).toEqual({ desde: a.inicio, hasta: b.fin, motivo: 'Médico' });
  });

  it('AGE_05_dias_completos_van_de_00_00_a_00_00_del_dia_siguiente_al_ultimo', () => {
    expect(bloqueoDeDias('2026-11-02', '2026-11-04', ZONA)).toEqual({
      desde: '2026-11-02T00:00:00.000-03:00',
      hasta: '2026-11-05T00:00:00.000-03:00',
      motivo: null,
    });
    expect(bloqueoDeDias('2026-11-04', '2026-11-02', ZONA).desde).toBe('2026-11-02T00:00:00.000-03:00');
  });

  it('AGE_05_dias_completos_respetan_el_huso_con_cambio_de_hora', () => {
    const e = bloqueoDeDias('2026-03-08', '2026-03-08', 'America/New_York');
    expect(e.desde).toBe('2026-03-08T00:00:00.000-05:00');
    expect(e.hasta).toBe('2026-03-09T00:00:00.000-04:00');
  });

  it('AGE_05_un_rango_de_horas_y_24_00_es_el_fin_del_dia', () => {
    expect(bloqueoDeHoras('2026-11-04', '09:30', '12:00', ZONA, 'Trámite')).toEqual({
      desde: '2026-11-04T09:30:00.000-03:00',
      hasta: '2026-11-04T12:00:00.000-03:00',
      motivo: 'Trámite',
    });
    expect(bloqueoDeHoras('2026-11-04', '20:00', '24:00', ZONA).hasta).toBe('2026-11-05T00:00:00.000-03:00');
  });

  it('AGE_05_rechaza_dia_u_hora_mal_formados', () => {
    expect(() => bloqueoDeDias('2026-02-30', '2026-03-01', ZONA)).toThrow(RangeError);
    expect(() => bloqueoDeHoras('2026-11-04', '24:00', '24:00', ZONA)).toThrow(RangeError);
    expect(() => bloqueoDeHoras('2026-11-04', '9:00', '10:00', ZONA)).toThrow(RangeError);
    expect(() => bloqueoDeHoras('04/11/2026', '09:00', '10:00', ZONA)).toThrow(RangeError);
  });
});

describe('validación previa de bloquear (SEC-09)', () => {
  const ok = { desde: '2026-11-02T00:00:00-03:00', hasta: '2026-11-03T00:00:00-03:00' };

  it('SEC_09_acepta_un_periodo_valido_y_motivo_vacio', () => {
    expect(validarBloqueo({ ...ok, motivo: '   ' }, ZONA)).toBeNull();
  });

  it('SEC_09_rechaza_inicio_invalido_con_campo_p_desde', () => {
    expect(validarBloqueo({ ...ok, desde: '' }, ZONA)).toMatchObject({ campo: 'p_desde', mensaje: MENSAJES_BLOQUEO.desdeInvalido });
    expect(validarBloqueo({ ...ok, desde: 'mañana' }, ZONA)?.campo).toBe('p_desde');
  });

  it('SEC_09_rechaza_fin_no_posterior_al_inicio_con_campo_p_hasta', () => {
    expect(validarBloqueo({ ...ok, hasta: ok.desde }, ZONA)).toMatchObject({
      codigo: 'DATOS_INVALIDOS',
      campo: 'p_hasta',
      mensaje: MENSAJES_BLOQUEO.hastaAntesDeDesde,
    });
    expect(validarBloqueo({ ...ok, hasta: '' }, ZONA)?.campo).toBe('p_hasta');
  });

  it('SEC_09_un_rango_de_366_dias_pasa_y_uno_de_367_no', () => {
    expect(validarBloqueo({ desde: ok.desde, hasta: '2027-11-03T00:00:00-03:00' }, ZONA)).toBeNull();
    expect(validarBloqueo({ desde: ok.desde, hasta: '2027-11-03T00:00:01-03:00' }, ZONA)).toMatchObject({
      campo: 'p_hasta',
      mensaje: MENSAJES_BLOQUEO.rangoLargo,
    });
  });

  it('SEC_09_motivo_de_500_pasa_y_de_501_no', () => {
    expect(validarBloqueo({ ...ok, motivo: ` ${'m'.repeat(500)} ` }, ZONA)).toBeNull();
    expect(validarBloqueo({ ...ok, motivo: 'm'.repeat(501) }, ZONA)).toMatchObject({
      campo: 'p_motivo',
      mensaje: MENSAJES_BLOQUEO.motivoLargo,
    });
  });

  it('AGE_05_normaliza_el_motivo_opcional', () => {
    expect(normalizarMotivo('  Vacaciones ')).toBe('Vacaciones');
    expect(normalizarMotivo('   ')).toBeNull();
    expect(normalizarMotivo(undefined)).toBeNull();
  });
});

describe('bloquear (AGE-05, CA-14)', () => {
  const entrada = { desde: '2026-11-04T10:00:00-03:00', hasta: '2026-11-04T12:00:00-03:00', motivo: ' Médico ' };

  it('AGE_05_bloquea_y_manda_el_periodo_y_el_motivo_recortado', async () => {
    const { c, deps } = cliente({ data: { bloqueo_id: 'b1' }, error: null });
    await expect(bloquear(entrada, ZONA, deps)).resolves.toEqual({ ok: true, bloqueo_id: 'b1' });
    expect(c.rpc).toHaveBeenCalledWith('bloquear', {
      p_desde: entrada.desde,
      p_hasta: entrada.hasta,
      p_motivo: 'Médico',
    });
  });

  it('AGE_05_sin_motivo_manda_null', async () => {
    const { c, deps } = cliente({ data: { bloqueo_id: 'b1' }, error: null });
    await bloquear({ desde: entrada.desde, hasta: entrada.hasta }, ZONA, deps);
    expect(c.rpc).toHaveBeenCalledWith('bloquear', expect.objectContaining({ p_motivo: null }));
  });

  it('AGE_05_rechaza_el_bloqueo_que_cubre_clases_e_indica_cuales_con_409', async () => {
    const { deps } = cliente({ data: null, error: errorPg('BLOQUEO_CON_RESERVAS', CONFLICTOS) });
    const r = await bloquear(entrada, ZONA, deps);
    expect(r).toEqual({
      ok: false,
      codigo: 'BLOQUEO_CON_RESERVAS',
      mensaje: MENSAJES_BLOQUEO.conReservas,
      campo: null,
      conflictos: CONFLICTOS,
    });
  });

  it('SEC_09_p_hasta_mas_alla_de_hoy_mas_366_dias_marca_el_campo_con_el_texto_de_la_base', async () => {
    const { deps } = cliente({ data: null, error: errorPg('DATOS_INVALIDOS', { campo: 'p_hasta' }, 'PT422') });
    await expect(bloquear(entrada, ZONA, deps)).resolves.toMatchObject({
      ok: false,
      codigo: 'DATOS_INVALIDOS',
      campo: 'p_hasta',
      mensaje: MENSAJES_BLOQUEO.hastaInvalido,
      conflictos: [],
    });
  });

  it('SEC_09_un_invalido_no_sale_a_la_red', async () => {
    const { c, deps } = cliente();
    await expect(bloquear({ ...entrada, hasta: entrada.desde }, ZONA, deps)).resolves.toMatchObject({ campo: 'p_hasta' });
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it('SEC_06_un_no_profesor_recibe_403_traducido', async () => {
    const { deps } = cliente({ data: null, error: errorPg('PROHIBIDO', undefined, 'PT403') });
    await expect(bloquear(entrada, ZONA, deps)).resolves.toMatchObject({
      codigo: 'PROHIBIDO',
      mensaje: MENSAJES.PROHIBIDO,
      conflictos: [],
    });
  });

  it('SEC_17_un_fallo_de_red_da_el_texto_generico_sin_detalles', async () => {
    const deps = { obtenerCliente: async () => Promise.reject(new Error('detalle interno')) };
    const r = await bloquear(entrada, ZONA, deps);
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.mensaje).not.toContain('detalle interno');
  });

  it('SEC_17_una_respuesta_sin_bloqueo_id_no_se_da_por_buena', async () => {
    const { deps } = cliente({ data: { otro: 1 }, error: null });
    await expect(bloquear(entrada, ZONA, deps)).resolves.toMatchObject({ ok: false, mensaje: MENSAJE_GENERICO });
  });
});

describe('detalle de BLOQUEO_CON_RESERVAS (AGE-05, SEC-16, SEC-17)', () => {
  it('AGE_05_lee_las_clases_del_detalle', () => {
    expect(conflictosDelError(errorPg('BLOQUEO_CON_RESERVAS', CONFLICTOS))).toEqual(CONFLICTOS);
  });

  it('SEC_17_un_detalle_sin_la_forma_del_contrato_da_lista_vacia', () => {
    expect(conflictosDelError(errorPg('BLOQUEO_CON_RESERVAS', [{ clase_id: 'c1' }]))).toEqual([]);
    expect(conflictosDelError({ message: 'BLOQUEO_CON_RESERVAS', details: '{no json' })).toEqual([]);
    expect(conflictosDelError(null)).toEqual([]);
  });

  it('AGE_05_texto_de_cada_conflicto_en_el_huso_del_profesor', () => {
    expect(textoConflicto(CONFLICTOS[0]!, ZONA)).toBe('miércoles, 4 de noviembre 10:00 · Ana · Confirmada');
    expect(textoConflicto(CONFLICTOS[1]!, ZONA)).toBe(
      `miércoles, 4 de noviembre 11:00 · ${MENSAJES_BLOQUEO.alumnoDadoDeBaja} · Pendiente de respuesta`,
    );
  });
});

describe('desbloquear (AGE-06, CA-52)', () => {
  it('AGE_06_quita_un_bloqueo_suyo', async () => {
    const { c, deps } = cliente({ data: null, error: null });
    await expect(desbloquear('b1', deps)).resolves.toEqual({ ok: true });
    expect(c.rpc).toHaveBeenCalledWith('desbloquear', { p_bloqueo_id: 'b1' });
  });

  it('AGE_10_un_bloqueo_de_otro_profesor_o_inexistente_da_404_con_su_texto', async () => {
    const { deps } = cliente({ data: null, error: errorPg('NO_ENCONTRADO', undefined, 'PT404') });
    await expect(desbloquear('b-de-otro', deps)).resolves.toEqual({
      ok: false,
      codigo: 'NO_ENCONTRADO',
      mensaje: MENSAJES_BLOQUEO.bloqueoNoEncontrado,
      campo: null,
      conflictos: [],
    });
  });

  it('AGE_06_sin_id_no_sale_a_la_red', async () => {
    const { c, deps } = cliente();
    await expect(desbloquear('', deps)).resolves.toMatchObject({ codigo: 'NO_ENCONTRADO' });
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it('SEC_17_un_fallo_inesperado_da_el_texto_generico', async () => {
    const deps = { obtenerCliente: async () => Promise.reject(new Error('x')) };
    await expect(desbloquear('b1', deps)).resolves.toMatchObject({ ok: false, mensaje: MENSAJE_GENERICO });
  });
});

describe('falloBloqueo (SEC-17)', () => {
  it('SEC_17_404_al_bloquear_usa_el_texto_comun', () => {
    expect(falloBloqueo(errorPg('NO_ENCONTRADO', undefined, 'PT404'), 'bloquear').mensaje).toBe(MENSAJES.NO_ENCONTRADO);
  });

  it('SEC_17_un_422_de_un_campo_ajeno_no_marca_campo', () => {
    expect(falloBloqueo(errorPg('DATOS_INVALIDOS', { campo: 'otro' }, 'PT422'), 'bloquear')).toMatchObject({
      campo: null,
      mensaje: MENSAJES.DATOS_INVALIDOS,
    });
  });

  it('SEC_09_un_422_de_p_desde_marca_su_campo_y_dice_que_no_puede_ser_de_hace_mas_de_un_anio_H_394', () => {
    expect(falloBloqueo(errorPg('DATOS_INVALIDOS', { campo: 'p_desde' }, 'PT422'), 'bloquear')).toMatchObject({
      codigo: 'DATOS_INVALIDOS',
      campo: 'p_desde',
      mensaje: MENSAJES_BLOQUEO.desdeInvalido,
    });
    expect(MENSAJES_BLOQUEO.desdeInvalido).toMatch(/no puede ser de hace más de un año/);
  });

  it('SEC_09_un_422_motivo_de_la_rpc_se_marca_en_p_motivo_H_394', () => {
    expect(falloBloqueo(errorPg('DATOS_INVALIDOS', { campo: 'motivo' }, 'PT422'), 'bloquear')).toMatchObject({
      codigo: 'DATOS_INVALIDOS',
      campo: 'p_motivo',
      mensaje: MENSAJES_BLOQUEO.motivoLargo,
    });
  });

  it('SEC_09_un_422_p_motivo_fuera_del_contrato_no_marca_campo_H_394', () => {
    expect(falloBloqueo(errorPg('DATOS_INVALIDOS', { campo: 'p_motivo' }, 'PT422'), 'bloquear')).toMatchObject({
      campo: null,
      mensaje: MENSAJES.DATOS_INVALIDOS,
    });
  });

  it('SEC_09_un_422_motivo_de_la_rpc_llega_a_bloquear_marcado_en_p_motivo_H_394', async () => {
    const { deps } = cliente({ data: null, error: errorPg('DATOS_INVALIDOS', { campo: 'motivo' }, 'PT422') });
    await expect(
      bloquear({ desde: '2026-11-10T13:00:00.000Z', hasta: '2026-11-10T14:00:00.000Z', motivo: 'Médico' }, ZONA, deps),
    ).resolves.toMatchObject({ ok: false, campo: 'p_motivo', mensaje: MENSAJES_BLOQUEO.motivoLargo });
  });

  it('SEC_17_campo_de_un_422_que_es_propiedad_heredada_no_marca_campo', () => {
    expect(falloBloqueo(errorPg('DATOS_INVALIDOS', { campo: 'toString' }, 'PT422'), 'bloquear').campo).toBeNull();
  });
});

describe('acciones de bloqueo por fila (AGE-05, AGE-06)', () => {
  it('AGE_05_un_hueco_libre_y_futuro_se_puede_bloquear', () => {
    expect(accionesBloqueo(fila())).toEqual({ bloquear: true, desbloquear: false });
  });

  it('AGE_05_un_hueco_pasado_u_ocupado_no_se_ofrece_para_bloquear', () => {
    expect(accionesBloqueo(fila({ pasada: true })).bloquear).toBe(false);
    expect(accionesBloqueo(fila({ estado: 'ocupado', clase_id: 'c1' })).bloquear).toBe(false);
  });

  it('AGE_06_un_hueco_bloqueado_se_puede_desbloquear_y_no_volver_a_bloquear', () => {
    expect(accionesBloqueo(fila({ estado: 'bloqueado', bloqueo_id: 'b1' }))).toEqual({ bloquear: false, desbloquear: true });
  });
});

describe('dependencias reales', () => {
  it('AGE_05_bloquear_y_desbloquear_usan_supabase_cargado_con_import', async () => {
    const { c } = cliente({ data: { bloqueo_id: 'b9' }, error: null });
    real.cliente = c;
    expect(dependenciasPanel()).toHaveProperty('obtenerCliente');
    await expect(
      bloquear({ desde: '2026-11-04T10:00:00-03:00', hasta: '2026-11-04T11:00:00-03:00' }, ZONA),
    ).resolves.toEqual({ ok: true, bloqueo_id: 'b9' });
    c.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(desbloquear('b9')).resolves.toEqual({ ok: true });
  });
});
