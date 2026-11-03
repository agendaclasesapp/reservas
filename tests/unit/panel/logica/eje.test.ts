// B17 · T17.1 · Geometría del eje y bloques de clase del calendario (ADR-023, ADR-024).
// CAL-04, CAL-07, CAL-08, CAL-09, CA-69, CA-72 (rama Día), DEC-42 A, DEC-44 A, DEC-50 A.
// B18 · T18.1: tope del alto de la hora de ADR-024 A-2 (H-472, NFR-12).
import { describe, expect, it } from 'vitest';
import type { TramoGrilla } from '../../../../src/modulos/configuracion/logica';
import {
  ALTO_HORA_MAXIMO_REM,
  DURACION_MINIMA_CALENDARIO_MIN,
  altoHoraRem,
  bloquesDeClase,
  diasCalendario,
  ejeCalendario,
  posicionEnEje,
  sinClases,
  zonasFueraDeTramo,
  type FilaAgendaDias,
} from '../../../../src/modulos/panel/logica';

/** Montevideo es UTC−3 todo el año: 13:00Z = 10:00 del profesor. */
const ZONA = 'America/Montevideo';
const DIA = '2026-10-30';
const PX_POR_REM = 16;

/** AGE-01: grilla inicial, lunes a viernes de 08:00 a 13:00 y de 14:00 a 18:00. */
const GRILLA_INICIAL: TramoGrilla[] = ([1, 2, 3, 4, 5] as const).flatMap((d) => [
  { dia_semana: d, desde: '08:00', hasta: '13:00' },
  { dia_semana: d, desde: '14:00', hasta: '18:00' },
]);

/** Instante del 30/10/2026 a la hora local `HH:MM` del profesor. */
function a(hora: string): string {
  const [h, m] = hora.split(':').map(Number) as [number, number];
  return new Date(Date.UTC(2026, 9, 30, h + 3, m)).toISOString().replace('.000Z', '+00:00');
}

function fila(cambios: Partial<FilaAgendaDias> = {}): FilaAgendaDias {
  return {
    inicio: a('10:00'),
    fin: a('10:30'),
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

/** Las filas de una clase sobre huecos de 30 min, de `desde` a `hasta` (hora local). */
function clase(id: string, desde: string, hasta: string, cambios: Partial<FilaAgendaDias> = {}): FilaAgendaDias[] {
  const filas: FilaAgendaDias[] = [];
  for (let t = Date.parse(a(desde)); t < Date.parse(a(hasta)); t += 30 * 60_000) {
    filas.push(
      fila({
        inicio: new Date(t).toISOString().replace('.000Z', '+00:00'),
        fin: new Date(t + 30 * 60_000).toISOString().replace('.000Z', '+00:00'),
        estado: 'ocupado',
        clase_id: id,
        quien_toma: 'Ana Pérez',
        titular: 'Ana Pérez',
        clase_estado: 'confirmada',
        reserva_tipo: 'suelta',
        clase_inicio: a(desde),
        clase_fin: a(hasta),
        ...cambios,
      }),
    );
  }
  return filas;
}

describe('ejeCalendario (CAL-04, CA-69, DEC-44 A)', () => {
  it('CA_69_con_la_grilla_inicial_el_eje_va_de_08_00_a_18_00', () => {
    const eje = ejeCalendario(GRILLA_INICIAL, 30);
    expect([eje.desdeHora, eje.hastaHora]).toEqual([8, 18]);
    expect([eje.desdeMin, eje.hastaMin]).toEqual([480, 1080]);
  });

  it('CA_69_con_un_tramo_de_07_30_a_12_15_el_eje_va_de_07_00_a_13_00', () => {
    const eje = ejeCalendario([{ dia_semana: 3, desde: '07:30', hasta: '12:15' }], 60);
    expect([eje.desdeHora, eje.hastaHora]).toEqual([7, 13]);
  });

  it('CAL_04_toma_el_primer_desde_y_el_ultimo_hasta_de_toda_la_semana', () => {
    const eje = ejeCalendario(
      [
        { dia_semana: 1, desde: '09:00', hasta: '12:00' },
        { dia_semana: 6, desde: '06:45', hasta: '10:00' },
        { dia_semana: 7, desde: '20:00', hasta: '24:00' },
      ],
      30,
    );
    expect([eje.desdeHora, eje.hastaHora]).toEqual([6, 24]);
  });

  it('CAL_04_una_linea_por_hora_y_otra_por_media_hora', () => {
    const eje = ejeCalendario(GRILLA_INICIAL, 30);
    expect(eje.marcas.filter((m) => m.tipo === 'hora').map((m) => m.etiqueta)).toEqual([
      '08:00',
      '09:00',
      '10:00',
      '11:00',
      '12:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
      '17:00',
      '18:00',
    ]);
    const medias = eje.marcas.filter((m) => m.tipo === 'media');
    expect(medias).toHaveLength(10);
    expect(medias[0]).toEqual({ minutos: 510, etiqueta: '08:30', tipo: 'media' });
    expect(medias.at(-1)?.etiqueta).toBe('17:30');
  });

  it('CAL_04_sin_tramos_ni_clases_el_eje_es_el_de_la_grilla_inicial', () => {
    const eje = ejeCalendario([], 30);
    expect([eje.desdeHora, eje.hastaHora]).toEqual([8, 18]);
  });

  it('DEC_44_una_clase_fuera_de_la_grilla_extiende_el_eje', () => {
    const tarde = bloquesDeClase(clase('c1', '18:30', '19:30'), ZONA);
    expect(ejeCalendario(GRILLA_INICIAL, 30, tarde)).toMatchObject({ desdeHora: 8, hastaHora: 20 });
    const temprano = bloquesDeClase(clase('c2', '06:15', '06:45'), ZONA);
    expect(ejeCalendario(GRILLA_INICIAL, 30, temprano)).toMatchObject({ desdeHora: 6, hastaHora: 18 });
  });

  it('DEC_44_una_solicitud_pendiente_fuera_de_la_grilla_tambien_extiende_el_eje', () => {
    const pendiente = bloquesDeClase(
      clase('c3', '21:00', '21:30', { clase_estado: 'pendiente', solicitud_id: 's1', solicitud_tipo: 'reserva' }),
      ZONA,
    );
    expect(ejeCalendario(GRILLA_INICIAL, 30, pendiente)).toMatchObject({ desdeHora: 8, hastaHora: 22 });
  });

  it('DEC_44_una_clase_dentro_de_la_grilla_no_cambia_el_eje', () => {
    const dentro = bloquesDeClase(clase('c4', '10:00', '11:00'), ZONA);
    expect(ejeCalendario(GRILLA_INICIAL, 30, dentro)).toMatchObject({ desdeHora: 8, hastaHora: 18 });
  });
});

describe('alto de la hora (DEC-50 A, NFR-12, ADR-024 A-2, H-472)', () => {
  it('DEC_50_con_duracion_de_15_min_el_alto_de_la_hora_crece_y_un_hueco_mide_44_px', () => {
    const eje = ejeCalendario(GRILLA_INICIAL, 15);
    expect(eje.altoHoraRem).toBe(11);
    expect(eje.altoHora).toBe('11rem');
    const hueco = posicionEnEje(600, 615, eje);
    expect(hueco.altoHoras * eje.altoHoraRem * PX_POR_REM).toBeGreaterThanOrEqual(44);
  });

  it('DEC_50_con_duracion_de_60_min_el_alto_de_la_hora_es_el_de_ux_y_un_hueco_mide_al_menos_44_px', () => {
    const eje = ejeCalendario(GRILLA_INICIAL, 60);
    expect(eje.altoHoraRem).toBe(5.5);
    expect(eje.altoHora).toBe('5.5rem');
    const hueco = posicionEnEje(600, 660, eje);
    expect(hueco.altoHoras * eje.altoHoraRem * PX_POR_REM).toBeGreaterThanOrEqual(44);
  });

  it('DEC_50_con_30_min_queda_5_5_rem_y_con_20_min_un_hueco_sigue_midiendo_44_px', () => {
    expect(altoHoraRem(30)).toBe(5.5);
    expect(altoHoraRem(45)).toBe(5.5);
    const alto = altoHoraRem(20);
    expect(alto).toBe(8.25);
    expect((20 / 60) * alto * PX_POR_REM).toBeGreaterThanOrEqual(44);
  });

  it('NFR_12_H_472_con_10_min_el_alto_llega_al_tope_de_16_5_rem_y_un_hueco_mide_44_px', () => {
    expect(ALTO_HORA_MAXIMO_REM).toBe(16.5);
    expect(DURACION_MINIMA_CALENDARIO_MIN).toBe(10);
    expect(altoHoraRem(10)).toBe(16.5);
    expect(altoHoraRem(10) * (10 / 60) * PX_POR_REM).toBeGreaterThanOrEqual(44);
    expect(altoHoraRem(12) * (12 / 60) * PX_POR_REM).toBeGreaterThanOrEqual(44);
  });

  it('NFR_12_H_472_debajo_de_10_min_el_alto_no_pasa_de_16_5_rem', () => {
    expect(altoHoraRem(7)).toBe(16.5);
    expect(altoHoraRem(1)).toBe(16.5);
    const eje = ejeCalendario(GRILLA_INICIAL, 5);
    expect(eje.altoHoraRem).toBe(16.5);
    expect(eje.altoHora).toBe('16.5rem');
  });

  it('DEC_50_una_duracion_invalida_usa_el_alto_de_ux', () => {
    expect(altoHoraRem(0)).toBe(5.5);
    expect(altoHoraRem(Number.NaN)).toBe(5.5);
  });
});

describe('bloquesDeClase (CAL-07, CAL-08, CAL-09, CA-72, DEC-42 A)', () => {
  it('CA_72_una_clase_de_60_min_mide_el_doble_de_alto_que_una_de_30', () => {
    const bloques = bloquesDeClase([...clase('larga', '10:00', '11:00'), ...clase('corta', '14:00', '14:30')], ZONA);
    expect(bloques.map((b) => b.id)).toEqual(['larga', 'corta']);
    const eje = ejeCalendario(GRILLA_INICIAL, 30, bloques);
    const [larga, corta] = bloques.map((b) => posicionEnEje(b.inicioMin, b.finMin, eje));
    expect(larga).toEqual({ arribaHoras: 2, altoHoras: 1 });
    expect(corta).toEqual({ arribaHoras: 6, altoHoras: 0.5 });
    expect(larga!.altoHoras).toBe(2 * corta!.altoHoras);
  });

  it('CA_72_una_clase_que_cubre_dos_huecos_se_dibuja_una_vez_con_sus_horas_reales_y_quien_la_toma', () => {
    const filas = clase('c1', '10:00', '11:00', { solicitud_id: null });
    expect(filas).toHaveLength(2);
    const [b] = bloquesDeClase(filas, ZONA);
    expect(b).toMatchObject({
      id: 'c1',
      dia: DIA,
      inicio: a('10:00'),
      fin: a('11:00'),
      inicioMin: 600,
      finMin: 660,
      estado: 'confirmada',
      quien: 'Ana Pérez',
      titular: 'Ana Pérez',
      cancelacionPendiente: false,
      pasada: false,
    });
    expect(b!.fila).toBe(filas[0]);
  });

  it('CA_72_una_solicitud_de_reserva_pendiente_se_dibuja_como_pendiente', () => {
    const [b] = bloquesDeClase(
      clase('c2', '15:00', '15:30', { clase_estado: 'pendiente', solicitud_id: 's1', solicitud_tipo: 'reserva' }),
      ZONA,
    );
    expect(b).toMatchObject({ estado: 'pendiente', solicitudId: 's1', solicitudTipo: 'reserva' });
  });

  it('DEC_42_el_destino_pendiente_de_un_movimiento_se_dibuja_como_pendiente_y_el_origen_como_confirmada', () => {
    const bloques = bloquesDeClase(
      [
        ...clase('origen', '10:00', '10:30', { solicitud_id: 's2', solicitud_tipo: 'movimiento' }),
        ...clase('destino', '16:00', '16:30', { clase_estado: 'pendiente', solicitud_id: 's2', solicitud_tipo: 'movimiento' }),
      ],
      ZONA,
    );
    expect(bloques.map((b) => [b.id, b.estado])).toEqual([
      ['origen', 'confirmada'],
      ['destino', 'pendiente'],
    ]);
  });

  it('CAL_08_una_confirmada_con_cancelacion_pendiente_sigue_confirmada_y_lo_marca', () => {
    const [b] = bloquesDeClase(clase('c5', '11:00', '11:30', { solicitud_id: 's3', solicitud_tipo: 'cancelacion' }), ZONA);
    expect(b).toMatchObject({ estado: 'confirmada', cancelacionPendiente: true });
  });

  it('CAL_09_los_huecos_libres_y_bloqueados_no_son_bloques_de_clase', () => {
    const filas = [
      fila(),
      fila({ inicio: a('10:30'), fin: a('11:00'), estado: 'bloqueado', bloqueo_id: 'b1', bloqueo_motivo: 'Torneo' }),
      ...clase('c6', '12:00', '12:30'),
    ];
    expect(bloquesDeClase(filas, ZONA).map((b) => b.id)).toEqual(['c6']);
  });

  it('CAL_07_una_clase_que_cruza_la_medianoche_se_recorta_a_cada_dia', () => {
    const inicio = a('23:30');
    const fin = new Date(Date.parse(inicio) + 60 * 60_000).toISOString().replace('.000Z', '+00:00');
    const base = { estado: 'ocupado', clase_id: 'n1', clase_estado: 'confirmada', clase_inicio: inicio, clase_fin: fin } as const;
    const bloques = bloquesDeClase(
      [
        fila({ ...base, inicio, fin }),
        fila({ ...base, inicio, fin, dia: '2026-10-31' }),
      ],
      ZONA,
    );
    expect(bloques.map((b) => [b.dia, b.inicioMin, b.finMin])).toEqual([
      [DIA, 1410, 1440],
      ['2026-10-31', 0, 30],
    ]);
  });
});

describe('diasCalendario y zonas fuera de tramo (ADR-024)', () => {
  it('CAL_07_agrupa_filas_y_bloques_por_dia_visible', () => {
    const filas = [fila(), ...clase('c1', '10:30', '11:00')];
    const dias = diasCalendario([DIA, '2026-10-31'], filas, ZONA);
    expect(dias.map((d) => [d.dia, d.filas.length, d.clases.length])).toEqual([
      [DIA, 2, 1],
      ['2026-10-31', 0, 0],
    ]);
    expect(sinClases(dias)).toBe(false);
    expect(sinClases(diasCalendario([DIA], [fila()], ZONA))).toBe(true);
  });

  it('CAL_05_fuera_de_los_tramos_del_dia_queda_la_zona_sombreada', () => {
    const eje = ejeCalendario(GRILLA_INICIAL, 30);
    // Viernes 30/10: el almuerzo; sábado 31/10: todo el eje.
    expect(zonasFueraDeTramo(GRILLA_INICIAL, DIA, eje)).toEqual([{ desdeMin: 780, hastaMin: 840 }]);
    expect(zonasFueraDeTramo(GRILLA_INICIAL, '2026-10-31', eje)).toEqual([{ desdeMin: 480, hastaMin: 1080 }]);
    const extendido = ejeCalendario(GRILLA_INICIAL, 30, bloquesDeClase(clase('c1', '18:30', '19:00'), ZONA));
    expect(zonasFueraDeTramo(GRILLA_INICIAL, DIA, extendido)).toEqual([
      { desdeMin: 780, hastaMin: 840 },
      { desdeMin: 1080, hastaMin: 1140 },
    ]);
  });
});
