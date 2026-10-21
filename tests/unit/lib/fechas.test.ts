import { describe, expect, it } from 'vitest';
import {
  diaDeInstante,
  esDia,
  formatearDia,
  formatearFecha,
  formatearHora,
  hoyEn,
  sumarDias,
} from '../../../src/lib/fechas';

const MVD = 'America/Montevideo'; // UTC-3, sin horario de verano
const MADRID = 'Europe/Madrid';

describe('fechas.ts (ADR-004)', () => {
  it('CA_16_una_clase_de_las_10_se_muestra_a_las_10_en_el_huso_del_profesor', () => {
    // PostgREST devuelve UTC: 13:00Z = 10:00 en Montevideo, sin importar el huso del navegador.
    expect(formatearHora('2026-11-02T13:00:00+00:00', MVD)).toBe('10:00');
    expect(formatearHora('2026-11-02T10:00:00-03:00', MVD)).toBe('10:00');
  });

  it('CA_16_el_mismo_instante_en_otro_huso_da_otra_hora', () => {
    expect(formatearHora('2026-11-02T13:00:00+00:00', MADRID)).toBe('14:00');
  });

  it('CA_16_instante_invalido_lanza_error', () => {
    expect(() => formatearHora('no-es-fecha', MVD)).toThrow(RangeError);
  });

  it('CA_16_formatea_la_fecha_en_espanol_en_el_huso_del_profesor', () => {
    // 02:00Z del martes 3 es todavía lunes 2 en Montevideo.
    const texto = formatearFecha('2026-11-03T02:00:00Z', MVD);
    expect(texto).toMatch(/lunes/);
    expect(texto).toMatch(/2 de noviembre/);
  });

  it('CA_16_dia_de_un_instante_cerca_de_medianoche_sigue_al_huso', () => {
    expect(diaDeInstante('2026-11-03T02:00:00Z', MVD)).toBe('2026-11-02');
    expect(diaDeInstante('2026-11-03T02:00:00Z', MADRID)).toBe('2026-11-03');
  });

  it('CA_16_hoy_es_el_dia_del_profesor_no_el_del_navegador', () => {
    const ahora = new Date('2026-01-01T01:30:00Z');
    expect(hoyEn(MVD, ahora)).toBe('2025-12-31');
    expect(hoyEn('UTC', ahora)).toBe('2026-01-01');
  });

  it('WEB_01_dia_siguiente_y_anterior_cruzan_mes_y_anio', () => {
    expect(sumarDias('2026-12-31', 1, MVD)).toBe('2027-01-01');
    expect(sumarDias('2026-03-01', -1, MVD)).toBe('2026-02-28');
    expect(sumarDias('2026-11-02', 7, MVD)).toBe('2026-11-09');
  });

  it('WEB_01_dias_de_calendario_no_se_corren_con_cambio_de_hora', () => {
    // Madrid pasa a horario de verano el 29/03/2026.
    expect(sumarDias('2026-03-28', 1, MADRID)).toBe('2026-03-29');
    expect(sumarDias('2026-03-29', 1, MADRID)).toBe('2026-03-30');
  });

  it('WEB_01_dia_invalido_se_rechaza', () => {
    expect(esDia('2026-11-02')).toBe(true);
    expect(esDia('2026-02-29')).toBe(false);
    expect(esDia('2026-13-01')).toBe(false);
    expect(esDia('2026-1-1')).toBe(false);
    expect(esDia(20261102)).toBe(false);
    expect(() => sumarDias('2026-02-30', 1, MVD)).toThrow(RangeError);
    expect(() => formatearDia('ayer')).toThrow(RangeError);
  });

  it('WEB_01_formatea_un_dia_sin_depender_del_huso', () => {
    expect(formatearDia('2026-11-02')).toMatch(/lunes.*2 de noviembre/);
  });
});
