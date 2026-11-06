// B20 · T20.1 · Semana ISO, ventana de 3 días, flechas en el borde, agrupación por día y hora actual.
// CAL-03 (rama Semana), CAL-10, CAL-15, CAL-16, CAL-19 (rama Semana), CA-74, CA-80, CA-81, CA-83; DEC-45 A (H-475),
// DEC-46, SEC-37.
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  agruparPorDia,
  ahoraDelProfesor,
  destinoFlecha,
  DIAS_SEMANA,
  DIAS_VENTANA,
  diaSemanaIso,
  diasDeSemana,
  diasDeVentana,
  diasVisibles,
  limitesPanel,
  lineaAhora,
  lunesDe,
  PERIODO_AHORA_MS,
  primerDiaDentro,
  rangoALeer,
  tituloRango,
  useAhora,
  type FilaAgendaDias,
} from '../../../../src/modulos/panel/logica';

const ZONA = 'America/Montevideo';
/** 30/10/2026 12:00 en Montevideo: límites del 29/10/2025 (miércoles) al 31/10/2027 (domingo). */
const AHORA = new Date('2026-10-30T15:00:00Z');
const LIMITES = limitesPanel(ZONA, AHORA);
/** Eje de la grilla inicial, 08:00 a 18:00. */
const EJE = { desdeMin: 8 * 60, hastaMin: 18 * 60 };

function fila(dia: string, inicio: string): FilaAgendaDias {
  return { dia, inicio, fin: inicio } as FilaAgendaDias;
}

describe('Semana ISO (CAL-15, CAL-03)', () => {
  it('CAL_15_la_semana_va_de_lunes_a_domingo_y_cruza_el_cambio_de_mes', () => {
    expect(DIAS_SEMANA).toBe(7);
    expect(diasDeSemana('2026-10-30')).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
    expect(tituloRango(diasDeSemana('2026-10-30'))).toBe('26/10/2026 - 01/11/2026');
  });

  it('CAL_15_el_lunes_y_el_domingo_dan_su_propia_semana', () => {
    expect(diasDeSemana('2026-10-26')[0]).toBe('2026-10-26');
    expect(diasDeSemana('2026-11-01')[0]).toBe('2026-10-26');
    expect(diasDeSemana('2026-11-02')[0]).toBe('2026-11-02');
    expect([diaSemanaIso('2026-10-26'), diaSemanaIso('2026-10-30'), diaSemanaIso('2026-11-01')]).toEqual([1, 5, 7]);
  });

  it('CAL_03_semana_que_cruza_el_cambio_de_anio', () => {
    // 01/01/2027 es viernes: su semana empieza el lunes 28/12/2026.
    expect(lunesDe('2027-01-01')).toBe('2026-12-28');
    expect(tituloRango(diasDeSemana('2027-01-01'))).toBe('28/12/2026 - 03/01/2027');
    // Año bisiesto: el martes 29/02/2028 cae en la semana del 28/02 al 05/03.
    expect(tituloRango(diasDeSemana('2028-02-29'))).toBe('28/02/2028 - 05/03/2028');
  });

  it('CAL_03_un_dia_invalido_no_arma_semana', () => {
    expect(() => diasDeSemana('2026-02-30')).toThrow(RangeError);
    expect(() => tituloRango([])).toThrow(RangeError);
  });
});

describe('Ventana de 3 días (CAL-16, CA-81)', () => {
  it('CAL_16_la_ventana_empieza_en_el_dia_elegido_y_tiene_3_dias', () => {
    expect(DIAS_VENTANA).toBe(3);
    expect(diasDeVentana('2026-10-30')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
    expect(tituloRango(diasDeVentana('2026-10-30'))).toBe('30/10/2026 - 01/11/2026');
  });

  it('CAL_16_ventana_que_cruza_el_cambio_de_anio', () => {
    expect(tituloRango(diasDeVentana('2026-12-30'))).toBe('30/12/2026 - 01/01/2027');
  });

  it('CAL_03_un_solo_dia_titula_con_la_fecha', () => {
    expect(tituloRango(['2026-10-30'])).toBe('30/10/2026');
  });
});

describe('Borde de hoy ± 366 (CAL-03, DEC-45 A con H-475)', () => {
  it('DEC_45_marca_los_dias_fuera_del_rango_y_solo_lee_los_de_adentro', () => {
    const dias = diasVisibles(diasDeSemana('2025-10-29'), LIMITES);
    expect(dias.map((d) => d.enRango)).toEqual([false, false, true, true, true, true, true]);
    expect(rangoALeer(dias)).toEqual({ desde: '2025-10-29', hasta: '2025-11-02' });
    const adelante = diasVisibles(diasDeVentana('2027-10-30'), LIMITES);
    expect(adelante.map((d) => d.enRango)).toEqual([true, true, false]);
    expect(rangoALeer(adelante)).toEqual({ desde: '2027-10-30', hasta: '2027-10-31' });
  });

  it('DEC_45_sin_dias_adentro_no_hay_rango_que_leer', () => {
    expect(rangoALeer(diasVisibles(diasDeVentana('2027-11-01'), LIMITES))).toBeNull();
  });

  it('CAL_10_es_hoy_marca_solo_el_dia_de_hoy_del_profesor', () => {
    const dias = diasVisibles(diasDeSemana('2026-10-30'), LIMITES);
    expect(dias.filter((d) => d.esHoy).map((d) => d.dia)).toEqual(['2026-10-30']);
    expect(diasVisibles(diasDeSemana('2026-11-05'), LIMITES).some((d) => d.esHoy)).toBe(false);
  });

  it('H_475_la_flecha_lleva_al_primer_dia_dentro_del_bloque_nuevo', () => {
    // Hacia atrás: la semana del 27/10/2025 tiene dentro solo del miércoles 29 en adelante.
    expect(destinoFlecha('2025-11-03', -7, 7, LIMITES)).toBe('2025-10-29');
    expect(destinoFlecha('2025-10-27', -7, 7, LIMITES)).toBeNull();
    // Ventana: del 30/10/2025, la anterior (27 a 29) tiene dentro solo el 29.
    expect(destinoFlecha('2025-10-30', -3, 3, LIMITES)).toBe('2025-10-29');
    // Hacia adelante: el primer día del bloque nuevo es el primero dentro.
    expect(destinoFlecha('2027-10-28', 3, 3, LIMITES)).toBe('2027-10-31');
    expect(destinoFlecha('2027-10-29', 3, 3, LIMITES)).toBeNull();
    expect(primerDiaDentro('2027-11-01', 3, LIMITES)).toBeNull();
  });
});

describe('agruparPorDia (CAL-19, DEC-46, CA-83)', () => {
  it('CAL_19_reparte_una_sola_lectura_por_dia_en_orden_de_la_semana_y_de_inicio', () => {
    const filas = [
      fila('2026-10-28', '2026-10-28T14:00:00+00:00'),
      fila('2026-10-26', '2026-10-26T13:30:00+00:00'),
      fila('2026-10-28', '2026-10-28T12:00:00+00:00'),
      fila('2026-10-26', '2026-10-26T13:00:00+00:00'),
    ];
    const copia = structuredClone(filas);
    const grupos = agruparPorDia(diasVisibles(diasDeSemana('2026-10-30'), LIMITES), filas);
    expect(grupos.map((g) => g.dia)).toEqual(diasDeSemana('2026-10-30'));
    expect(grupos[0]?.filas.map((f) => f.inicio)).toEqual(['2026-10-26T13:00:00+00:00', '2026-10-26T13:30:00+00:00']);
    expect(grupos[2]?.filas.map((f) => f.inicio)).toEqual(['2026-10-28T12:00:00+00:00', '2026-10-28T14:00:00+00:00']);
    expect(grupos[1]?.filas).toEqual([]);
    expect(grupos[4]).toMatchObject({ dia: '2026-10-30', esHoy: true, enRango: true });
    expect(filas).toEqual(copia);
  });

  it('DEC_45_un_dia_fuera_del_rango_queda_vacio_y_las_filas_de_otros_dias_se_descartan', () => {
    const filas = [fila('2025-10-27', '2025-10-27T13:00:00+00:00'), fila('2025-11-10', '2025-11-10T13:00:00+00:00')];
    const grupos = agruparPorDia(diasVisibles(diasDeSemana('2025-10-29'), LIMITES), filas);
    expect(grupos[0]).toEqual({ dia: '2025-10-27', enRango: false, esHoy: false, filas: [] });
    expect(grupos.flatMap((g) => g.filas)).toEqual([]);
  });
});

describe('Hoy y la hora actual en el huso del profesor (CAL-10, CA-74)', () => {
  /** 31/10/2026 01:30 UTC: 30/10 22:30 en Montevideo y 31/10 10:30 en Tokio. */
  const NOCHE = new Date('2026-10-31T01:30:00Z');

  it('CAL_10_hoy_y_los_minutos_son_los_del_huso_del_profesor', () => {
    expect(ahoraDelProfesor(ZONA, NOCHE)).toEqual({ hoy: '2026-10-30', minutos: 22 * 60 + 30 });
    expect(ahoraDelProfesor('Asia/Tokyo', NOCHE)).toEqual({ hoy: '2026-10-31', minutos: 10 * 60 + 30 });
  });

  it('CA_74_la_linea_de_la_hora_actual_va_solo_en_hoy_y_dentro_del_eje', () => {
    expect(lineaAhora('2026-10-30', EJE, ZONA, AHORA)).toEqual({ arribaHoras: 4, hora: '12:00' });
    expect(lineaAhora('2026-10-31', EJE, ZONA, AHORA)).toBeNull();
    // 22:30 queda fuera del eje de 08:00 a 18:00: no hay línea.
    expect(lineaAhora('2026-10-30', EJE, ZONA, NOCHE)).toBeNull();
    expect(lineaAhora('2026-10-30', { desdeMin: 0, hastaMin: 24 * 60 }, ZONA, NOCHE)).toEqual({
      arribaHoras: 22.5,
      hora: '22:30',
    });
    // Los extremos del eje cuentan.
    expect(lineaAhora('2026-10-30', EJE, ZONA, new Date('2026-10-30T11:00:00Z'))?.arribaHoras).toBe(0);
    expect(lineaAhora('2026-10-30', EJE, ZONA, new Date('2026-10-30T21:00:00Z'))?.arribaHoras).toBe(10);
  });

  it('CAL_10_el_huso_del_navegador_no_cambia_hoy_ni_la_linea', () => {
    const original = process.env.TZ;
    try {
      // El navegador en Kiritimati (UTC+14): ya es 31/10 allí, pero el profesor está en Montevideo.
      process.env.TZ = 'Pacific/Kiritimati';
      expect(ahoraDelProfesor(ZONA, NOCHE)).toEqual({ hoy: '2026-10-30', minutos: 22 * 60 + 30 });
      expect(lineaAhora('2026-10-30', EJE, 'Asia/Tokyo', NOCHE)).toBeNull();
      expect(lineaAhora('2026-10-31', EJE, 'Asia/Tokyo', NOCHE)).toEqual({ arribaHoras: 2.5, hora: '10:30' });
      expect(limitesPanel(ZONA, NOCHE).hoy).toBe('2026-10-30');
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});

describe('useAhora (CAL-10, SEC-37)', () => {
  afterEach(() => vi.useRealTimers());

  it('CAL_10_renueva_el_instante_cada_minuto_y_no_guarda_nada_en_el_navegador', () => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
    localStorage.clear();
    sessionStorage.clear();
    const { result, unmount } = renderHook(() => useAhora());
    expect(result.current.toISOString()).toBe(AHORA.toISOString());
    act(() => {
      vi.advanceTimersByTime(PERIODO_AHORA_MS);
    });
    expect(result.current.getTime()).toBe(AHORA.getTime() + PERIODO_AHORA_MS);
    expect(lineaAhora('2026-10-30', EJE, ZONA, result.current)).toEqual({ arribaHoras: 4 + 1 / 60, hora: '12:01' });
    expect([localStorage.length, sessionStorage.length]).toEqual([0, 0]);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
