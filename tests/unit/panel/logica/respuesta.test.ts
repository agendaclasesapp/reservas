// B19 · T19.1 · Responder solicitudes desde el calendario (CAL-08, CAL-12, CA-76; INV-04, SEC-17, SEC-36;
// ADR-025, DEC-42 A, DEC-43 A). Usa `responderSolicitud` real de la Lista con un cliente falso: mismo RPC y mensajes.
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MENSAJE_GENERICO, MENSAJES } from '../../../../src/lib/errores';
import * as lista from '../../../../src/modulos/lista/logica';
import {
  accionesRespuesta,
  bloquesDeClase,
  confirmarSolicitud,
  esquemaMotivo,
  LARGO_MAX_MOTIVO,
  MENSAJES_RESPUESTA,
  puedeConfirmar,
  rechazarSolicitud,
  solicitudDeBloque,
  solicitudDeFila,
  validarMotivo,
  type FilaAgendaDias,
  type SolicitudEnCalendario,
} from '../../../../src/modulos/panel/logica';

const real = vi.hoisted(() => ({ cliente: null as unknown }));
vi.mock('../../../../src/lib/supabase', () => ({ cargarSupabase: async () => real.cliente }));

const ZONA = 'America/Montevideo';
const DIA = '2026-10-30';

type Resultado = { data: unknown; error: unknown };

function cliente(rpc: Resultado = { data: { estado: 'confirmada' }, error: null }) {
  const c = { rpc: vi.fn(async () => rpc) };
  return { c, deps: { obtenerCliente: async () => c as unknown as SupabaseClient } };
}

const err = (code: string, message: string, details: string | null = null) => ({ code, message, details, hint: null });

function fila(cambios: Partial<FilaAgendaDias> = {}): FilaAgendaDias {
  return {
    inicio: '2026-10-30T13:00:00+00:00',
    fin: '2026-10-30T13:30:00+00:00',
    estado: 'ocupado',
    clase_id: 'c1',
    solicitud_id: null,
    quien_toma: 'Ana Pérez',
    titular: 'Ana Pérez',
    observacion: null,
    clase_estado: 'confirmada',
    bloqueo_id: null,
    bloqueo_motivo: null,
    reserva_tipo: 'suelta',
    pasada: false,
    dia: DIA,
    clase_inicio: '2026-10-30T13:00:00+00:00',
    clase_fin: '2026-10-30T13:30:00+00:00',
    solicitud_tipo: null,
    ...cambios,
  };
}

const bloque = (cambios: Partial<FilaAgendaDias>) => bloquesDeClase([fila(cambios)], ZONA)[0]!;

const SOLICITUD: SolicitudEnCalendario = { id: 's1', tipo: 'reserva', claseId: 'c1' };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('solicitudDeBloque y solicitudDeFila (ADR-025)', () => {
  it('CAL_08_CAL_12_un_bloque_PENDIENTE_de_reserva_se_responde_con_su_solicitud', () => {
    const cambios = { clase_estado: 'pendiente', solicitud_id: 's1', solicitud_tipo: 'reserva' } as const;
    expect(solicitudDeBloque(bloque(cambios))).toEqual({ id: 's1', tipo: 'reserva', claseId: 'c1' });
    expect(solicitudDeFila(fila(cambios))).toEqual({ id: 's1', tipo: 'reserva', claseId: 'c1' });
  });

  it('CAL_08_DEC_42_el_destino_PENDIENTE_de_un_movimiento_se_responde_como_en_la_Lista', () => {
    const destino = { clase_id: 'c2', clase_estado: 'pendiente', solicitud_id: 's2', solicitud_tipo: 'movimiento' } as const;
    expect(solicitudDeBloque(bloque(destino))).toEqual({ id: 's2', tipo: 'movimiento', claseId: 'c2' });
    expect(solicitudDeFila(fila(destino))).toEqual({ id: 's2', tipo: 'movimiento', claseId: 'c2' });
  });

  it('CAL_08_DEC_42_el_origen_CONFIRMADO_de_un_movimiento_no_se_responde_desde_el_calendario', () => {
    const origen = { clase_estado: 'confirmada', solicitud_id: 's2', solicitud_tipo: 'movimiento' } as const;
    const b = bloque(origen);
    expect(b.estado).toBe('confirmada');
    expect(solicitudDeBloque(b)).toBeNull();
    expect(solicitudDeFila(fila(origen))).toBeNull();
  });

  it('CAL_12_DEC_43_una_clase_CONFIRMADA_con_cancelacion_pendiente_se_responde_desde_su_detalle', () => {
    const cambios = { clase_estado: 'confirmada', solicitud_id: 's3', solicitud_tipo: 'cancelacion' } as const;
    const b = bloque(cambios);
    expect(b.cancelacionPendiente).toBe(true);
    expect(solicitudDeBloque(b)).toEqual({ id: 's3', tipo: 'cancelacion', claseId: 'c1' });
    expect(solicitudDeFila(fila(cambios))).toEqual({ id: 's3', tipo: 'cancelacion', claseId: 'c1' });
  });

  it('CAL_12_sin_solicitud_o_sin_clase_no_hay_nada_que_responder', () => {
    expect(solicitudDeBloque(bloque({}))).toBeNull();
    expect(solicitudDeFila(fila({}))).toBeNull();
    const libre = { estado: 'libre', clase_id: null, clase_estado: null, quien_toma: null, titular: null } as const;
    expect(solicitudDeFila(fila(libre))).toBeNull();
    expect(solicitudDeBloque({ id: 'c1', estado: 'pendiente', solicitudId: 's1', solicitudTipo: null })).toBeNull();
  });
});

describe('qué se ofrece: lo de la Lista (INV-04)', () => {
  it('INV_04_accionesRespuesta_es_accionesSolicitud_de_la_Lista_para_una_no_vencida', () => {
    for (const activo of [true, false]) {
      expect(accionesRespuesta(activo)).toEqual(lista.accionesSolicitud({ vencida: false }, activo));
      expect(puedeConfirmar(activo)).toBe(lista.accionesSolicitud({ vencida: false }, activo).confirmar);
    }
    expect(accionesRespuesta(false)).toEqual({ confirmar: false, rechazar: true });
  });

  it('INV_04_el_motivo_usa_esquemaMotivo_y_LARGO_MAX_MOTIVO_de_la_Lista_tal_cual', () => {
    expect(esquemaMotivo).toBe(lista.esquemaMotivo);
    expect(LARGO_MAX_MOTIVO).toBe(lista.LARGO_MAX_MOTIVO);
    expect(MENSAJES_RESPUESTA).toBe(lista.MENSAJES_RESPUESTA);
  });

  it('CAL_12_validarMotivo_acepta_vacio_y_hasta_el_largo_maximo_y_rechaza_uno_mas_con_el_texto_de_la_Lista', () => {
    expect(validarMotivo('')).toBeNull();
    expect(validarMotivo(null)).toBeNull();
    expect(validarMotivo('   ')).toBeNull();
    expect(validarMotivo('x'.repeat(LARGO_MAX_MOTIVO))).toBeNull();
    expect(validarMotivo(`  ${'x'.repeat(LARGO_MAX_MOTIVO)}  `)).toBeNull();
    expect(validarMotivo('x'.repeat(LARGO_MAX_MOTIVO + 1))).toBe(lista.MENSAJES_LISTA.motivoLargo);
  });
});

describe('confirmarSolicitud y rechazarSolicitud', () => {
  it('CAL_12_CA_76_confirmar_llama_a_responder_solicitud_relee_y_da_el_mensaje_de_la_Lista', async () => {
    const { c, deps } = cliente({ data: { estado: 'confirmada' }, error: null });
    const releer = vi.fn();
    const r = await confirmarSolicitud(SOLICITUD, { releer, deps });
    expect(c.rpc).toHaveBeenCalledWith('responder_solicitud', {
      p_solicitud_id: 's1',
      p_decision: 'confirmar',
      p_motivo: null,
    });
    expect(r).toEqual({ ok: true, estado: 'confirmada', mensaje: MENSAJES_RESPUESTA.confirmada });
    expect(releer).toHaveBeenCalledTimes(1);
  });

  it('CAL_12_CA_76_rechazar_manda_el_motivo_recortado_para_el_mail_y_relee', async () => {
    const { c, deps } = cliente({ data: { estado: 'rechazada' }, error: null });
    const releer = vi.fn();
    const r = await rechazarSolicitud(SOLICITUD, '  Ese día no doy clases  ', { releer, deps });
    expect(c.rpc).toHaveBeenCalledWith('responder_solicitud', {
      p_solicitud_id: 's1',
      p_decision: 'rechazar',
      p_motivo: 'Ese día no doy clases',
    });
    expect(r).toEqual({ ok: true, estado: 'rechazada', mensaje: MENSAJES_RESPUESTA.rechazada });
    expect(releer).toHaveBeenCalledTimes(1);
  });

  it('CAL_12_rechazar_sin_motivo_o_con_solo_espacios_manda_p_motivo_null', async () => {
    for (const motivo of [undefined, null, '', '   ']) {
      const { c, deps } = cliente({ data: { estado: 'rechazada' }, error: null });
      await rechazarSolicitud(SOLICITUD, motivo, { releer: () => undefined, deps });
      expect(c.rpc).toHaveBeenCalledWith('responder_solicitud', expect.objectContaining({ p_motivo: null }));
    }
  });

  it('CAL_12_SEC_36_un_motivo_largo_no_llama_a_la_base_marca_el_campo_y_no_relee', async () => {
    const { c, deps } = cliente();
    const releer = vi.fn();
    const r = await rechazarSolicitud(SOLICITUD, 'x'.repeat(LARGO_MAX_MOTIVO + 1), { releer, deps });
    expect(c.rpc).not.toHaveBeenCalled();
    expect(r).toEqual({
      ok: false,
      codigo: 'DATOS_INVALIDOS',
      mensaje: lista.MENSAJES_LISTA.motivoLargo,
      campo: 'motivo',
      desactualizada: false,
    });
    expect(releer).not.toHaveBeenCalled();
  });

  it('CAL_12_INV_04_vencida_al_responder_da_el_mismo_mensaje_que_la_Lista_y_relee', async () => {
    const error = err('PT409', 'SOLICITUD_VENCIDA', '{"secreto":"x"}');
    const releer = vi.fn();
    const r = await confirmarSolicitud(SOLICITUD, { releer, deps: cliente({ data: null, error }).deps });
    const deLaLista = await lista.responderSolicitud('s1', 'confirmar', null, cliente({ data: null, error }).deps);
    expect(r).toEqual({ ...deLaLista, desactualizada: true });
    expect(r).toMatchObject({ ok: false, codigo: 'SOLICITUD_VENCIDA', mensaje: MENSAJES.SOLICITUD_VENCIDA });
    expect(JSON.stringify(r)).not.toContain('secreto');
    expect(releer).toHaveBeenCalledTimes(1);
  });

  it('CAL_12_ya_respondida_o_no_encontrada_releen_como_en_la_Lista', async () => {
    for (const [code, message] of [
      ['PT409', 'SOLICITUD_YA_RESPONDIDA'],
      ['PT404', 'NO_ENCONTRADO'],
    ] as const) {
      const releer = vi.fn();
      const { deps } = cliente({ data: null, error: err(code, message) });
      const r = await rechazarSolicitud(SOLICITUD, 'motivo', { releer, deps });
      expect(r).toEqual({ ok: false, codigo: message, mensaje: MENSAJES[message], campo: null, desactualizada: true });
      expect(releer).toHaveBeenCalledTimes(1);
    }
  });

  it('SEC_36_confirmar_con_el_profesor_inactivo_lo_decide_la_base_con_el_texto_de_la_Lista', async () => {
    const { c, deps } = cliente({ data: null, error: err('PT409', 'PROFESOR_INACTIVO') });
    const releer = vi.fn();
    const r = await confirmarSolicitud(SOLICITUD, { releer, deps });
    expect(c.rpc).toHaveBeenCalledTimes(1);
    expect(r).toEqual({
      ok: false,
      codigo: 'PROFESOR_INACTIVO',
      mensaje: MENSAJES_RESPUESTA.profesorInactivo,
      campo: null,
      desactualizada: false,
    });
    expect(releer).not.toHaveBeenCalled();
  });

  it('SEC_17_un_error_desconocido_de_red_o_una_respuesta_rara_dan_el_generico_sin_console', async () => {
    const consola = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m));
    const casos = [
      { obtenerCliente: async () => { throw new Error('red caída'); } },
      cliente({ data: null, error: err('XX000', 'OTRA_COSA', '{"filas":[1]}') }).deps,
      cliente({ data: { estado: 'otra' }, error: null }).deps,
    ];
    for (const deps of casos) {
      const releer = vi.fn();
      const r = await confirmarSolicitud(SOLICITUD, { releer, deps });
      expect(r).toEqual({ ok: false, codigo: 'DESCONOCIDO', mensaje: MENSAJE_GENERICO, campo: null, desactualizada: false });
      expect(releer).not.toHaveBeenCalled();
    }
    for (const espia of consola) expect(espia).not.toHaveBeenCalled();
  });

  it('INV_04_sin_deps_usa_el_cliente_real_de_la_Lista_con_el_mismo_RPC', async () => {
    const { c } = cliente({ data: { estado: 'rechazada' }, error: null });
    real.cliente = c;
    const r = await rechazarSolicitud({ id: 's9', tipo: 'cancelacion', claseId: 'c9' }, null, { releer: () => undefined });
    expect(c.rpc).toHaveBeenCalledWith('responder_solicitud', { p_solicitud_id: 's9', p_decision: 'rechazar', p_motivo: null });
    expect(r).toMatchObject({ ok: true, estado: 'rechazada' });
  });
});
