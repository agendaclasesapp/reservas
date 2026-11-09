// B21 · T21.1 · Arrastre en escritorio: qué se arrastra, dónde se suelta y cómo se mueve (ADR-026).
// CAL-13, CAL-14, INV-01, INV-05, CA-77, CA-78, CA-79, CA-87. Sin DOM: la geometría es la del eje (ADR-024).
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { TramoGrilla } from '../../../../src/modulos/configuracion/logica';
import {
  accionesFila,
  alcanceDeArrastre,
  calendarioConElementos,
  destinoEnPunto,
  diasCalendario,
  esArrastrable,
  minutosEnPunto,
  moverClase,
  moverPorArrastre,
  MENSAJES_PANEL,
  origenDeArrastre,
  type ColumnaCalendario,
  type ElementoHueco,
  type FilaAgendaDias,
  type OrigenArrastre,
} from '../../../../src/modulos/panel/logica';
import { MENSAJES } from '../../../../src/lib/errores';

const real = vi.hoisted(() => ({ cliente: null as unknown }));
vi.mock('../../../../src/lib/supabase', () => ({ cargarSupabase: async () => real.cliente }));

/** Montevideo es UTC−3 todo el año. El 30/10/2026 es viernes; el 31/10, sábado (sin grilla). */
const ZONA = 'America/Montevideo';
const DIA = '2026-10-30';
const SABADO = '2026-10-31';
/** 1 rem en px en la pantalla de las pruebas. */
const PX_POR_REM = 16;
/** Antes de todo lo del día. */
const AHORA = new Date('2026-10-29T12:00:00Z');

/** AGE-01: grilla inicial, lunes a viernes de 08:00 a 13:00 y de 14:00 a 18:00. */
const GRILLA: TramoGrilla[] = ([1, 2, 3, 4, 5] as const).flatMap((d) => [
  { dia_semana: d, desde: '08:00', hasta: '13:00' },
  { dia_semana: d, desde: '14:00', hasta: '18:00' },
]);
const CONFIGURACION = { grilla: GRILLA, duracionMin: 30 };

/** Instante del 30/10/2026 a la hora local `HH:MM` del profesor. */
function a(hora: string): string {
  const [h, m] = hora.split(':').map(Number) as [number, number];
  return new Date(Date.UTC(2026, 9, 30, h + 3, m)).toISOString().replace('.000Z', '+00:00');
}

function fila(desde: string, hasta: string, cambios: Partial<FilaAgendaDias> = {}): FilaAgendaDias {
  return {
    inicio: a(desde),
    fin: a(hasta),
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
    dia: DIA,
    clase_inicio: null,
    clase_fin: null,
    solicitud_tipo: null,
    ...cambios,
  };
}

function clase(desde: string, hasta: string, id: string, cambios: Partial<FilaAgendaDias> = {}): FilaAgendaDias {
  return fila(desde, hasta, {
    estado: 'ocupado',
    clase_id: id,
    clase_estado: 'confirmada',
    quien_toma: 'Ana',
    titular: 'Ana',
    reserva_tipo: 'suelta',
    clase_inicio: a(desde),
    clase_fin: a(hasta),
    ...cambios,
  });
}

const SERIE = clase('09:00', '09:30', 'serie', { reserva_tipo: 'serie' });
const SUELTA = clase('11:00', '11:30', 'suelta');
const PENDIENTE = clase('11:30', '12:00', 'pendiente', { clase_estado: 'pendiente', solicitud_id: 's1', solicitud_tipo: 'reserva' });
/** DEC-42 A: el destino pendiente de un movimiento es una clase pendiente con la solicitud que la creó. */
const DESTINO_DE_MOVIMIENTO = clase('14:00', '14:30', 'destino', { clase_estado: 'pendiente', solicitud_id: 's2', solicitud_tipo: 'movimiento' });
/** DEC-43 A: confirmada con una cancelación pendiente. */
const CANCELACION_PENDIENTE = clase('14:30', '15:00', 'cancelando', { solicitud_id: 's3', solicitud_tipo: 'cancelacion' });
const PASADA = clase('08:00', '08:30', 'pasada', { pasada: true });

const FILAS: FilaAgendaDias[] = [
  PASADA,
  fila('08:30', '09:00', { pasada: true }),
  SERIE,
  fila('09:30', '10:00'),
  fila('10:00', '10:30', { estado: 'bloqueado', bloqueo_id: 'b1', bloqueo_motivo: 'Médico' }),
  fila('10:30', '11:00'),
  SUELTA,
  PENDIENTE,
  fila('12:00', '12:30'),
  fila('12:30', '13:00'),
  // Fuera de tramo (13:00 a 14:00 no está en la grilla): la base no lo daría hoy, pero si llega no es destino.
  fila('13:00', '13:30'),
  DESTINO_DE_MOVIMIENTO,
  CANCELACION_PENDIENTE,
  fila('15:00', '15:30'),
];

function calendario(activo = true) {
  return calendarioConElementos(diasCalendario([DIA, SABADO], FILAS, ZONA), CONFIGURACION, ZONA, activo);
}

function columna(dia = DIA): ColumnaCalendario {
  return calendario().columnas.find((c) => c.dia === dia) as ColumnaCalendario;
}

function origen(f: FilaAgendaDias = SERIE): OrigenArrastre {
  return origenDeArrastre(f, true) as OrigenArrastre;
}

/** Minuto del día de `HH:MM`. */
function m(hora: string): number {
  const [h, mm] = hora.split(':').map(Number) as [number, number];
  return h * 60 + mm;
}

function cliente(rpc: { data: unknown; error: unknown } = { data: null, error: null }) {
  const c = { rpc: vi.fn(async () => rpc) };
  return { c, deps: { obtenerCliente: async () => c as unknown as SupabaseClient } };
}

function errorPg(message: string, details?: unknown, code = 'PT409') {
  return { code, message, details: details === undefined ? null : JSON.stringify(details) };
}

describe('CAL-14 · qué se arrastra (sale de accionesFila)', () => {
  it('CAL_13_una_clase_confirmada_futura_se_arrastra_y_en_una_serie_se_elige_el_alcance', () => {
    expect(origenDeArrastre(SERIE, true)).toEqual({ claseId: 'serie', fila: SERIE, elegirAlcance: true });
    expect(origenDeArrastre(SUELTA, true)).toEqual({ claseId: 'suelta', fila: SUELTA, elegirAlcance: false });
    expect(esArrastrable(SERIE, true)).toBe(true);
  });

  it('CAL_14_solicitud_pendiente_destino_de_movimiento_cancelacion_pendiente_y_pasada_no_se_arrastran', () => {
    for (const f of [PENDIENTE, DESTINO_DE_MOVIMIENTO, CANCELACION_PENDIENTE, PASADA]) {
      expect(origenDeArrastre(f, true)).toBeNull();
      expect(esArrastrable(f, true)).toBe(false);
    }
  });

  it('CAL_14_un_hueco_libre_o_bloqueado_no_se_arrastra', () => {
    expect(esArrastrable(fila('09:30', '10:00'), true)).toBe(false);
    expect(esArrastrable(fila('10:00', '10:30', { estado: 'bloqueado', bloqueo_id: 'b1' }), true)).toBe(false);
  });

  it('INV_01_se_arrastra_exactamente_lo_que_accionesFila_deja_mover_sin_copiar_la_regla', () => {
    for (const activo of [true, false]) {
      for (const f of FILAS) expect(esArrastrable(f, activo)).toBe(accionesFila(f, activo).mover);
    }
  });

  it('INV_05_CA_79_con_el_profesor_inactivo_nada_se_arrastra_y_cancelar_sigue', () => {
    for (const f of FILAS) expect(origenDeArrastre(f, false)).toBeNull();
    expect(accionesFila(SERIE, false)).toMatchObject({ mover: false, crear: false, cancelar: true });
  });
});

describe('CAL-13 · geometría del eje: píxeles a minutos', () => {
  const { eje } = calendario();
  /** La columna dibujada con `--cal-alto-hora` = `eje.altoHora`. */
  const geometria = { eje, pxPorRem: PX_POR_REM };
  const pxPorHora = eje.altoHoraRem * PX_POR_REM;

  it('CAL_13_el_borde_de_arriba_es_el_comienzo_del_eje_y_baja_con_la_escala_de_cal_alto_hora', () => {
    expect(eje).toMatchObject({ desdeMin: m('08:00'), hastaMin: m('18:00'), altoHoraRem: 5.5 });
    expect(minutosEnPunto(0, geometria)).toBe(m('08:00'));
    expect(minutosEnPunto(pxPorHora / 2, geometria)).toBe(m('08:30'));
    expect(minutosEnPunto(pxPorHora * 1.25 + 0.4, geometria)).toBe(m('09:15'));
    expect(minutosEnPunto(pxPorHora * 10 - 0.1, geometria)).toBe(m('17:59'));
    // Con letra más grande (1 rem = 20 px) la misma posición relativa da el mismo minuto.
    expect(minutosEnPunto(eje.altoHoraRem * 20 * 1.5, { eje, pxPorRem: 20 })).toBe(m('09:30'));
  });

  it('CA_78_fuera_del_eje_o_con_geometria_invalida_no_hay_minuto', () => {
    expect(minutosEnPunto(-1, geometria)).toBeNull();
    expect(minutosEnPunto(pxPorHora * 10, geometria)).toBeNull();
    expect(minutosEnPunto(Number.NaN, geometria)).toBeNull();
    expect(minutosEnPunto(10, { eje, pxPorRem: 0 })).toBeNull();
  });

  it('CAL_13_el_punto_dentro_del_hueco_dibujado_cae_en_ese_hueco_misma_escala_que_posicionEnEje', () => {
    const col = columna();
    for (const h of col.elementos.filter((e): e is ElementoHueco => e.tipo === 'hueco')) {
      const arriba = h.posicion.arribaHoras * pxPorHora;
      const abajo = arriba + h.posicion.altoHoras * pxPorHora;
      for (const y of [arriba + 0.5, (arriba + abajo) / 2, abajo - 0.5]) {
        const minutos = minutosEnPunto(y, geometria);
        expect(minutos).not.toBeNull();
        expect(minutos as number).toBeGreaterThanOrEqual(h.inicioMin);
        expect(minutos as number).toBeLessThan(h.finMin);
      }
    }
  });
});

describe('CAL-13, CAL-14 · dónde se suelta (sale de destinosLibres)', () => {
  it('CAL_13_sobre_un_hueco_libre_futuro_dentro_de_la_grilla_hay_destino', () => {
    const d = destinoEnPunto({ columna: columna(), minutos: m('12:10'), origen: origen(), ahora: AHORA });
    expect(d).toMatchObject({ clave: `hueco:${a('12:00')}`, dia: DIA, inicio: a('12:00'), fin: a('12:30') });
    expect(d).toMatchObject({ inicioMin: m('12:00'), finMin: m('12:30') });
    expect(d?.fila.estado).toBe('libre');
  });

  it('CA_78_sobre_un_hueco_ocupado_o_bloqueado_no_hay_destino', () => {
    const col = columna();
    for (const hora of ['09:10', '11:00', '11:45', '14:15', '10:00', '10:29']) {
      expect(destinoEnPunto({ columna: col, minutos: m(hora), origen: origen(), ahora: AHORA })).toBeNull();
    }
  });

  it('CA_78_sobre_un_hueco_pasado_no_hay_destino_ni_si_empezo_despues_de_la_lectura', () => {
    const col = columna();
    expect(destinoEnPunto({ columna: col, minutos: m('08:40'), origen: origen(), ahora: AHORA })).toBeNull();
    const ahoraEnElHueco = new Date(Date.parse(a('12:00')) + 60_000);
    expect(destinoEnPunto({ columna: col, minutos: m('12:10'), origen: origen(), ahora: ahoraEnElHueco })).toBeNull();
    expect(destinoEnPunto({ columna: col, minutos: m('12:40'), origen: origen(), ahora: ahoraEnElHueco })).not.toBeNull();
  });

  it('CA_78_fuera_de_la_grilla_no_hay_destino', () => {
    const col = columna();
    // Libre pero fuera de tramo (13:00 a 14:00), en una zona sin huecos, fuera del eje y en un día sin grilla.
    expect(destinoEnPunto({ columna: col, minutos: m('13:10'), origen: origen(), ahora: AHORA })).toBeNull();
    expect(destinoEnPunto({ columna: col, minutos: m('16:00'), origen: origen(), ahora: AHORA })).toBeNull();
    expect(destinoEnPunto({ columna: col, minutos: null, origen: origen(), ahora: AHORA })).toBeNull();
    expect(destinoEnPunto({ columna: columna(SABADO), minutos: m('09:40'), origen: origen(), ahora: AHORA })).toBeNull();
  });

  it('INV_05_sin_origen_arrastrable_no_hay_destino', () => {
    expect(destinoEnPunto({ columna: columna(), minutos: m('12:10'), origen: null, ahora: AHORA })).toBeNull();
    const inactivo = calendario(false).columnas[0] as ColumnaCalendario;
    expect(destinoEnPunto({ columna: inactivo, minutos: m('12:10'), origen: origenDeArrastre(SERIE, false), ahora: AHORA })).toBeNull();
  });

  it('CA_78_calcular_origen_y_destino_no_toca_la_base', () => {
    const { c } = cliente();
    real.cliente = c;
    destinoEnPunto({ columna: columna(), minutos: m('12:10'), origen: origen(), ahora: AHORA });
    expect(c.rpc).not.toHaveBeenCalled();
  });
});

describe('CAL-13, INV-01 · movimiento con moverClase', () => {
  const destino = () => destinoEnPunto({ columna: columna(), minutos: m('15:10'), origen: origen(), ahora: AHORA })!;
  const movida = { data: { clase_id: 'serie', fechas: [a('15:00')], salteadas: [] }, error: null };

  it('CA_77_en_una_serie_de_aca_en_adelante_viaja_con_el_destino_soltado', async () => {
    const { c, deps } = cliente(movida);
    const r = await moverPorArrastre(origen(), destino(), 'desde_aca', deps);
    expect(r).toEqual({ ok: true, clase_id: 'serie', fechas: [a('15:00')], salteadas: [] });
    expect(c.rpc).toHaveBeenCalledWith('mover_clase', { p_clase_id: 'serie', p_destino: a('15:00'), p_alcance: 'desde_aca' });
  });

  it('CAL_13_solo_esta_clase_en_una_serie_y_en_una_suelta_siempre_solo_esta_como_Mover', async () => {
    const { c, deps } = cliente(movida);
    await moverPorArrastre(origen(), destino(), 'solo_esta', deps);
    await moverPorArrastre(origen(SUELTA), destino(), 'desde_aca', deps);
    expect(c.rpc).toHaveBeenNthCalledWith(1, 'mover_clase', expect.objectContaining({ p_clase_id: 'serie', p_alcance: 'solo_esta' }));
    expect(c.rpc).toHaveBeenNthCalledWith(2, 'mover_clase', expect.objectContaining({ p_clase_id: 'suelta', p_alcance: 'solo_esta' }));
    expect(alcanceDeArrastre(origen(SUELTA), 'desde_aca')).toBe('solo_esta');
    expect(alcanceDeArrastre(origen(), 'desde_aca')).toBe('desde_aca');
  });

  it('CA_87_un_destino_que_otro_ocupo_se_rechaza_con_el_mismo_codigo_y_mensaje_que_Mover', async () => {
    const respuesta = { data: null, error: errorPg('HUECO_NO_LIBRE', { inicio: a('15:00') }) };
    const r = await moverPorArrastre(origen(), destino(), 'solo_esta', cliente(respuesta).deps);
    const conMover = await moverClase('serie', a('15:00'), 'solo_esta', cliente(respuesta).deps);
    expect(r).toEqual(conMover);
    expect(r).toMatchObject({ ok: false, codigo: 'HUECO_NO_LIBRE', mensaje: MENSAJES.HUECO_NO_LIBRE });
  });

  it('INV_01_INV_05_si_el_profesor_quedo_inactivo_antes_de_confirmar_la_base_lo_rechaza_como_Mover', async () => {
    const respuesta = { data: null, error: errorPg('PROFESOR_INACTIVO') };
    const r = await moverPorArrastre(origen(), destino(), 'desde_aca', cliente(respuesta).deps);
    expect(r).toEqual(await moverClase('serie', a('15:00'), 'desde_aca', cliente(respuesta).deps));
    expect(r).toMatchObject({ ok: false, codigo: 'PROFESOR_INACTIVO', mensaje: MENSAJES_PANEL.profesorInactivo });
  });

  it('INV_01_fuera_de_la_grilla_en_la_base_da_el_mismo_fallo_que_Mover', async () => {
    const respuesta = { data: null, error: errorPg('FUERA_DE_GRILLA', undefined, 'PT422') };
    const r = await moverPorArrastre(origen(), destino(), 'solo_esta', cliente(respuesta).deps);
    expect(r).toEqual(await moverClase('serie', a('15:00'), 'solo_esta', cliente(respuesta).deps));
    expect(r.ok).toBe(false);
  });

  it('CAL_13_sin_deps_usa_el_cliente_real_como_moverClase', async () => {
    const { c } = cliente(movida);
    real.cliente = c;
    const r = await moverPorArrastre(origen(), destino(), 'solo_esta');
    expect(r.ok).toBe(true);
    expect(c.rpc).toHaveBeenCalledWith('mover_clase', { p_clase_id: 'serie', p_destino: a('15:00'), p_alcance: 'solo_esta' });
  });
});
