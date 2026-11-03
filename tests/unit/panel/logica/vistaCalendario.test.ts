// B17 · T17.1 · Estado de la vista del calendario desde la dirección, navegación y lectura del rango visible.
// CAL-01, CAL-02, CAL-03, CA-67, CA-68 (rama Día y Semana de la lógica), INV-02, SEC-17, SEC-35.
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mensajeDeError } from '../../../../src/lib/errores';
import {
  direccionCalendario,
  ErrorAgendaDias,
  fechaNumerica,
  limitesPanel,
  navegacionCalendario,
  useAgendaDiasConLector,
  vistaDesdeDireccion,
  type FilaAgendaDias,
  type LectorAgendaDias,
} from '../../../../src/modulos/panel/logica';

const ZONA = 'America/Montevideo';
/** 30/10/2026 12:00 en Montevideo. */
const AHORA = new Date('2026-10-30T15:00:00Z');
const LIMITES = limitesPanel(ZONA, AHORA);

describe('limitesPanel (CAL-02, CAL-03)', () => {
  it('CAL_03_limites_son_hoy_mas_menos_366_en_el_huso_del_profesor', () => {
    expect(LIMITES).toEqual({ hoy: '2026-10-30', min: '2025-10-29', max: '2027-10-31' });
  });

  it('CAL_02_hoy_es_el_del_huso_del_profesor_no_el_de_utc', () => {
    // 31/10 01:00 UTC todavía es 30/10 en Montevideo (UTC−3).
    expect(limitesPanel(ZONA, new Date('2026-10-31T01:00:00Z')).hoy).toBe('2026-10-30');
  });
});

describe('vistaDesdeDireccion (CAL-01, CAL-02, CA-67)', () => {
  it('CA_67_sin_parametros_abre_la_vista_dia_de_hoy', () => {
    expect(vistaDesdeDireccion('', LIMITES)).toEqual({ vista: 'dia', dia: '2026-10-30', corregida: false });
  });

  it('CA_67_semana_del_30_10_2026_muestra_del_26_10_al_01_11', () => {
    const v = vistaDesdeDireccion('?v=semana&d=2026-10-30', LIMITES);
    expect(v).toEqual({ vista: 'semana', dia: '2026-10-30', corregida: false });
    const nav = navegacionCalendario(v, LIMITES);
    expect(nav.titulo).toBe('26/10/2026 - 01/11/2026');
    expect(nav.dias.map((d) => d.dia)).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
    expect(nav.dias.filter((d) => d.esHoy).map((d) => d.dia)).toEqual(['2026-10-30']);
    expect([nav.desde, nav.hasta]).toEqual(['2026-10-26', '2026-11-01']);
  });

  it('CA_67_recargar_la_direccion_deja_la_misma_vista_y_el_mismo_dia', () => {
    for (const estado of [
      { vista: 'semana', dia: '2026-10-30' },
      { vista: 'dia', dia: '2026-12-24' },
    ] as const) {
      const direccion = new URLSearchParams(direccionCalendario(estado));
      expect(direccion.toString()).toBe(`v=${estado.vista}&d=${estado.dia}`);
      expect(vistaDesdeDireccion(direccion, LIMITES)).toEqual({ ...estado, corregida: false });
    }
  });

  it('CA_67_v_invalido_abre_la_vista_dia_de_hoy', () => {
    for (const q of ['?v=otra', '?v=otra&d=2026-11-05', '?v=', '?v=Semana&d=2026-11-05']) {
      expect(vistaDesdeDireccion(q, LIMITES), q).toEqual({ vista: 'dia', dia: '2026-10-30', corregida: true });
    }
  });

  it('CA_67_d_invalido_o_fuera_de_366_dias_abre_la_vista_dia_de_hoy', () => {
    for (const q of ['?d=2026-02-30', '?d=manana', '?d=', '?v=semana&d=30/10/2026', '?d=2027-11-01', '?d=2025-10-28']) {
      expect(vistaDesdeDireccion(q, LIMITES), q).toEqual({ vista: 'dia', dia: '2026-10-30', corregida: true });
    }
  });

  it('CA_67_d_solo_sigue_abriendo_la_vista_dia_de_ese_dia', () => {
    expect(vistaDesdeDireccion('?d=2026-11-05', LIMITES)).toEqual({ vista: 'dia', dia: '2026-11-05', corregida: false });
  });

  it('CAL_02_los_extremos_de_366_dias_son_validos', () => {
    expect(vistaDesdeDireccion('?d=2027-10-31', LIMITES).corregida).toBe(false);
    expect(vistaDesdeDireccion('?d=2025-10-29', LIMITES).corregida).toBe(false);
  });

  it('CAL_02_semana_sin_d_abre_la_semana_de_hoy', () => {
    expect(vistaDesdeDireccion(new URLSearchParams({ v: 'semana' }), LIMITES)).toEqual({
      vista: 'semana',
      dia: '2026-10-30',
      corregida: false,
    });
  });
});

describe('navegacionCalendario (CAL-03, CA-68)', () => {
  it('CA_68_en_dia_la_flecha_siguiente_pasa_al_dia_siguiente_y_hoy_vuelve_al_actual', () => {
    const nav = navegacionCalendario({ vista: 'dia', dia: '2026-10-30' }, LIMITES);
    expect(nav.titulo).toBe('30/10/2026');
    expect(nav.dias).toEqual([{ dia: '2026-10-30', enRango: true, esHoy: true }]);
    expect([nav.desde, nav.hasta]).toEqual(['2026-10-30', '2026-10-30']);
    expect(nav.siguiente).toEqual({ vista: 'dia', dia: '2026-10-31' });
    expect(nav.anterior).toEqual({ vista: 'dia', dia: '2026-10-29' });

    const despues = navegacionCalendario(nav.siguiente!, LIMITES);
    expect(despues.titulo).toBe('31/10/2026');
    expect(despues.hoy).toEqual({ vista: 'dia', dia: '2026-10-30' });
  });

  it('CA_68_en_el_ultimo_dia_permitido_la_flecha_siguiente_esta_deshabilitada', () => {
    const nav = navegacionCalendario({ vista: 'dia', dia: '2027-10-31' }, LIMITES);
    expect(nav.siguiente).toBeNull();
    expect(nav.anterior).toEqual({ vista: 'dia', dia: '2027-10-30' });
    expect(navegacionCalendario({ vista: 'dia', dia: '2027-10-30' }, LIMITES).siguiente).toEqual({
      vista: 'dia',
      dia: '2027-10-31',
    });
  });

  it('CAL_03_en_el_primer_dia_permitido_la_flecha_anterior_esta_deshabilitada', () => {
    const nav = navegacionCalendario({ vista: 'dia', dia: '2025-10-29' }, LIMITES);
    expect(nav.anterior).toBeNull();
    expect(nav.siguiente).toEqual({ vista: 'dia', dia: '2025-10-30' });
  });

  it('CA_68_en_semana_la_flecha_pasa_a_la_semana_siguiente', () => {
    const nav = navegacionCalendario({ vista: 'semana', dia: '2026-10-30' }, LIMITES);
    expect(nav.siguiente).toEqual({ vista: 'semana', dia: '2026-11-02' });
    expect(nav.anterior).toEqual({ vista: 'semana', dia: '2026-10-19' });
    expect(nav.hoy).toEqual({ vista: 'semana', dia: '2026-10-30' });
    expect(navegacionCalendario(nav.siguiente!, LIMITES).titulo).toBe('02/11/2026 - 08/11/2026');
  });

  it('CAL_03_en_la_semana_del_ultimo_dia_la_flecha_siguiente_esta_deshabilitada_y_la_lectura_se_recorta', () => {
    // 31/10/2027 es domingo: su semana es la última.
    const nav = navegacionCalendario({ vista: 'semana', dia: '2027-10-31' }, LIMITES);
    expect(nav.titulo).toBe('25/10/2027 - 31/10/2027');
    expect(nav.siguiente).toBeNull();
    expect([nav.desde, nav.hasta]).toEqual(['2027-10-25', '2027-10-31']);
  });

  it('CAL_03_en_la_semana_del_primer_dia_la_lectura_y_la_flecha_anterior_se_acotan_al_rango', () => {
    // 29/10/2025 es miércoles: lunes y martes de esa semana quedan fuera.
    const nav = navegacionCalendario({ vista: 'semana', dia: '2025-10-29' }, LIMITES);
    expect(nav.dias.slice(0, 3).map((d) => d.enRango)).toEqual([false, false, true]);
    expect([nav.desde, nav.hasta]).toEqual(['2025-10-29', '2025-11-02']);
    expect(nav.anterior).toBeNull();
    // Desde la semana siguiente, la anterior lleva al primer día dentro del rango (la dirección queda válida).
    const siguiente = navegacionCalendario({ vista: 'semana', dia: '2025-11-03' }, LIMITES);
    expect(siguiente.anterior).toEqual({ vista: 'semana', dia: '2025-10-29' });
    expect(vistaDesdeDireccion(new URLSearchParams(direccionCalendario(siguiente.anterior!)), LIMITES).corregida).toBe(
      false,
    );
  });

  it('CAL_03_fecha_numerica_es_dd_mm_aaaa', () => {
    expect(fechaNumerica('2026-11-01')).toBe('01/11/2026');
  });
});

describe('useAgendaDiasConLector (INV-02, SEC-17, SEC-35)', () => {
  afterEach(() => vi.restoreAllMocks());

  const FILA = { dia: '2026-10-30', inicio: '2026-10-30T13:00:00+00:00' } as FilaAgendaDias;

  it('INV_02_lee_solo_el_rango_de_la_vista_sin_profesor_y_queda_listo', async () => {
    const lector = vi.fn<LectorAgendaDias>(async () => [FILA]);
    const { result } = renderHook(() => useAgendaDiasConLector(lector, '2026-10-30', '2026-10-30'));
    expect(result.current.lectura).toEqual({ estado: 'cargando', previo: null });
    await waitFor(() => expect(result.current.lectura.estado).toBe('listo'));
    expect(lector).toHaveBeenCalledTimes(1);
    expect(lector.mock.calls[0]).toEqual(['2026-10-30', '2026-10-30']);
    expect(result.current.lectura).toEqual({
      estado: 'listo',
      datos: { desde: '2026-10-30', hasta: '2026-10-30', filas: [FILA] },
    });
  });

  it('CAL_03_al_cambiar_de_dia_relee_y_conserva_el_previo_mientras_carga', async () => {
    const lector = vi.fn<LectorAgendaDias>(async () => [FILA]);
    const { result, rerender } = renderHook(({ dia }) => useAgendaDiasConLector(lector, dia, dia), {
      initialProps: { dia: '2026-10-30' },
    });
    await waitFor(() => expect(result.current.lectura.estado).toBe('listo'));
    rerender({ dia: '2026-10-31' });
    expect(result.current.lectura).toEqual({
      estado: 'cargando',
      previo: { desde: '2026-10-30', hasta: '2026-10-30', filas: [FILA] },
    });
    await waitFor(() => expect(result.current.lectura.estado).toBe('listo'));
    expect(lector.mock.calls[1]).toEqual(['2026-10-31', '2026-10-31']);
  });

  it('SEC_17_el_error_es_el_texto_del_catalogo_sin_details_ni_consola_y_recargar_vuelve_a_leer', async () => {
    const consola = [vi.spyOn(console, 'error'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'log')];
    const error = new ErrorAgendaDias({ code: 'PT422', message: 'DATOS_INVALIDOS', details: '{"campo":"p_hasta"}' });
    const lector = vi.fn<LectorAgendaDias>(async () => {
      throw error;
    });
    const { result } = renderHook(() => useAgendaDiasConLector(lector, '2026-10-30', '2026-10-30'));
    await waitFor(() => expect(result.current.lectura.estado).toBe('error'));
    expect(result.current.lectura).toEqual({ estado: 'error', mensaje: mensajeDeError(error) });
    expect(JSON.stringify(result.current.lectura)).not.toContain('p_hasta');
    for (const c of consola) expect(c).not.toHaveBeenCalled();

    lector.mockResolvedValueOnce([FILA]);
    act(() => result.current.recargar());
    await waitFor(() => expect(result.current.lectura.estado).toBe('listo'));
    expect(lector).toHaveBeenCalledTimes(2);
  });
});
