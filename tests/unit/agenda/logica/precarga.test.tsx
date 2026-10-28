// @vitest-environment jsdom
// Precarga de la agenda pública (B13 · T13.2, DEC-41): config_publica y agenda_publica en paralelo (NFR-04, CA-36).
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MENSAJE_SIN_CONEXION } from '../../../../src/lib/errores';
import {
  VIGENCIA_PRECARGA_MS,
  diaSupuesto,
  precargarAgendaPublica,
  precargarDesdeHash,
  reiniciarConfigPublica,
  reiniciarPrecargaAgenda,
  tomarPrecargaAgenda,
  useAgendaDia,
  useConfigPublica,
  type ConfigPublica,
  type Hueco,
} from '../../../../src/modulos/agenda/logica';

// 2026-11-02 12:00 en Montevideo (UTC-3).
const AHORA = new Date('2026-11-02T15:00:00Z');
const ZONA = 'America/Montevideo';
const ANA = 'ana-perez';
const LUNES: Hueco[] = [{ inicio: '2026-11-02T11:00:00+00:00', fin: '2026-11-02T12:00:00+00:00', estado: 'libre' }];
const CONFIG: ConfigPublica = {
  profesor_id: 'p-ana',
  nombre: 'Ana Pérez',
  activo: true,
  zona_horaria: ZONA,
  duracion_min: 60,
  anticipacion_horas: 24,
  horizonte_semanas: 4,
};

function diferido<T>() {
  let resolver!: (v: T) => void;
  let rechazar!: (e: unknown) => void;
  const promesa = new Promise<T>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
}

/** Deja correr las microtareas (las lecturas arrancan en un `then`). */
const tic = () => new Promise<void>((r) => setTimeout(r, 0));

afterEach(() => {
  vi.restoreAllMocks();
  reiniciarPrecargaAgenda();
  reiniciarConfigPublica();
});

describe('diaSupuesto (NFR-04, SEC-09)', () => {
  it('NFR_04_sin_d_o_con_un_d_que_no_es_dia_supone_hoy_en_el_huso_del_navegador', () => {
    expect(diaSupuesto(null, AHORA, ZONA)).toBe('2026-11-02');
    expect(diaSupuesto('basura', AHORA, ZONA)).toBe('2026-11-02');
    expect(diaSupuesto('2026-02-30', AHORA, ZONA)).toBe('2026-11-02');
    expect(diaSupuesto(null, AHORA, 'Pacific/Kiritimati')).toBe('2026-11-03');
  });

  it('NFR_04_un_d_dentro_de_la_ventana_segura_se_pide_tal_cual', () => {
    expect(diaSupuesto('2026-11-05', AHORA, ZONA)).toBe('2026-11-05');
    expect(diaSupuesto('2025-11-02', AHORA, ZONA)).toBe('2025-11-02');
    expect(diaSupuesto('2026-12-02', AHORA, ZONA)).toBe('2026-12-02');
  });

  it('NFR_04_un_d_fuera_de_la_ventana_segura_no_se_adivina', () => {
    expect(diaSupuesto('2026-12-03', AHORA, ZONA)).toBeNull();
    expect(diaSupuesto('2025-11-01', AHORA, ZONA)).toBeNull();
    expect(diaSupuesto('2031-01-01', AHORA, ZONA)).toBeNull();
  });
});

describe('precargarAgendaPublica (NFR-04, CA-36)', () => {
  it('NFR_04_CA_36_config_publica_y_agenda_publica_salen_a_la_vez_sin_esperarse', async () => {
    const config = diferido<ConfigPublica>();
    const agenda = diferido<Hueco[]>();
    const obtenerConfig = vi.fn(() => config.promesa);
    const obtenerAgenda = vi.fn(() => agenda.promesa);
    precargarAgendaPublica(ANA, null, { obtenerConfig, obtenerAgenda, ahora: AHORA, zona: ZONA });
    await tic();
    // Ninguna de las dos respondió y las dos ya salieron.
    expect(obtenerConfig).toHaveBeenCalledWith(ANA);
    expect(obtenerAgenda).toHaveBeenCalledWith(ANA, '2026-11-02');

    // La configuración queda en la caché de useConfigPublica: no se pide de nuevo.
    config.resolver(CONFIG);
    const { result: cfg } = renderHook(() => useConfigPublica(ANA, obtenerConfig));
    await waitFor(() => expect(cfg.current.estado).toBe('listo'));
    expect(obtenerConfig).toHaveBeenCalledTimes(1);

    // La agenda del mismo día usa la respuesta ya pedida.
    agenda.resolver(LUNES);
    const { result } = renderHook(() => useAgendaDia(ANA, '2026-11-02', obtenerAgenda));
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.huecos).toEqual(LUNES);
    expect(obtenerAgenda).toHaveBeenCalledTimes(1);
  });

  it('NFR_04_repetir_la_precarga_no_repite_pedidos', async () => {
    const obtenerConfig = vi.fn(() => new Promise<ConfigPublica>(() => undefined));
    const obtenerAgenda = vi.fn(async () => LUNES);
    const opciones = { obtenerConfig, obtenerAgenda, ahora: AHORA, zona: ZONA };
    precargarAgendaPublica(ANA, null, opciones);
    precargarAgendaPublica('Ana-Perez', null, opciones);
    precargarDesdeHash('#/p/ana-perez', opciones);
    await tic();
    expect(obtenerConfig).toHaveBeenCalledTimes(1);
    expect(obtenerAgenda).toHaveBeenCalledTimes(1);
  });

  it('AGE_09_un_slug_que_ningun_profesor_puede_tener_no_sale_a_la_red', async () => {
    const obtenerConfig = vi.fn(async () => CONFIG);
    const obtenerAgenda = vi.fn(async () => LUNES);
    precargarAgendaPublica('a', null, { obtenerConfig, obtenerAgenda, ahora: AHORA, zona: ZONA });
    precargarDesdeHash('#/p/no%20vale', { obtenerConfig, obtenerAgenda, ahora: AHORA, zona: ZONA });
    await tic();
    expect(obtenerConfig).not.toHaveBeenCalled();
    expect(obtenerAgenda).not.toHaveBeenCalled();
  });

  it('NFR_04_con_la_configuracion_ya_leida_no_precarga_la_agenda', async () => {
    const obtenerConfig = vi.fn(async () => CONFIG);
    const obtenerAgenda = vi.fn(async () => LUNES);
    const { result } = renderHook(() => useConfigPublica(ANA, obtenerConfig));
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    precargarAgendaPublica(ANA, null, { obtenerConfig, obtenerAgenda, ahora: AHORA, zona: ZONA });
    await tic();
    expect(obtenerAgenda).not.toHaveBeenCalled();
    expect(obtenerConfig).toHaveBeenCalledTimes(1);
  });

  it('NFR_04_un_d_fuera_de_la_ventana_segura_solo_precarga_la_configuracion', async () => {
    const obtenerConfig = vi.fn(async () => CONFIG);
    const obtenerAgenda = vi.fn(async () => LUNES);
    precargarAgendaPublica(ANA, '2031-01-01', { obtenerConfig, obtenerAgenda, ahora: AHORA, zona: ZONA });
    await tic();
    expect(obtenerConfig).toHaveBeenCalledTimes(1);
    expect(obtenerAgenda).not.toHaveBeenCalled();
  });

  it('NFR_04_una_precarga_fallida_no_se_reutiliza_en_la_siguiente', async () => {
    const obtenerConfig = vi.fn(() => new Promise<ConfigPublica>(() => undefined));
    const obtenerAgenda = vi
      .fn<(slug: string, dia: string) => Promise<Hueco[]>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(LUNES);
    const opciones = { obtenerConfig, obtenerAgenda, ahora: AHORA, zona: ZONA };
    precargarAgendaPublica(ANA, null, opciones);
    await tic();
    precargarAgendaPublica(ANA, null, opciones);
    await tic();
    expect(obtenerAgenda).toHaveBeenCalledTimes(2);
    await expect(tomarPrecargaAgenda(ANA, '2026-11-02', obtenerAgenda)).resolves.toEqual(LUNES);
  });
});

describe('precargarDesdeHash (NFR-04, CA-36)', () => {
  it('NFR_04_la_direccion_inicial_de_la_agenda_precarga_ese_profesor_y_ese_dia', async () => {
    const obtenerConfig = vi.fn(() => new Promise<ConfigPublica>(() => undefined));
    const obtenerAgenda = vi.fn(async () => LUNES);
    precargarDesdeHash('#/p/ana-perez?d=2026-11-05', { obtenerConfig, obtenerAgenda, ahora: AHORA, zona: ZONA });
    await tic();
    expect(obtenerConfig).toHaveBeenCalledWith(ANA);
    expect(obtenerAgenda).toHaveBeenCalledWith(ANA, '2026-11-05');
  });

  it('NFR_04_otra_direccion_no_pide_nada', async () => {
    const obtenerConfig = vi.fn(async () => CONFIG);
    const obtenerAgenda = vi.fn(async () => LUNES);
    for (const hash of ['', '#/', '#/panel', '#/p/', '#/p/ana-perez/otra', '#/mis-clases?d=2026-11-05']) {
      precargarDesdeHash(hash, { obtenerConfig, obtenerAgenda, ahora: AHORA, zona: ZONA });
    }
    await tic();
    expect(obtenerConfig).not.toHaveBeenCalled();
    expect(obtenerAgenda).not.toHaveBeenCalled();
  });
});

describe('useAgendaDia con precarga (NFR-04, CA-36, AGE-07)', () => {
  it('NFR_04_si_el_dia_de_la_configuracion_es_otro_descarta_la_precarga_y_pide_el_suyo', async () => {
    const obtenerConfig = vi.fn(() => new Promise<ConfigPublica>(() => undefined));
    const obtenerAgenda = vi.fn(async (_slug: string, dia: string) => (dia === '2026-11-02' ? LUNES : []));
    // El navegador está en UTC+14: supone el 3; el profesor está en el 2.
    precargarAgendaPublica(ANA, null, { obtenerConfig, obtenerAgenda, ahora: AHORA, zona: 'Pacific/Kiritimati' });
    await tic();
    expect(obtenerAgenda).toHaveBeenLastCalledWith(ANA, '2026-11-03');
    const { result } = renderHook(() => useAgendaDia(ANA, '2026-11-02', obtenerAgenda));
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.huecos).toEqual(LUNES);
    expect(obtenerAgenda).toHaveBeenCalledTimes(2);
    expect(obtenerAgenda).toHaveBeenLastCalledWith(ANA, '2026-11-02');
  });

  it('CA_36_el_error_de_la_precarga_se_muestra_igual_y_reintentar_vuelve_a_pedir', async () => {
    const obtenerConfig = vi.fn(() => new Promise<ConfigPublica>(() => undefined));
    const obtenerAgenda = vi
      .fn<(slug: string, dia: string) => Promise<Hueco[]>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(LUNES);
    precargarAgendaPublica(ANA, null, { obtenerConfig, obtenerAgenda, ahora: AHORA, zona: ZONA });
    await tic();
    const { result } = renderHook(() => useAgendaDia(ANA, '2026-11-02', obtenerAgenda));
    await waitFor(() => expect(result.current.estado).toBe('error'));
    expect(result.current.error?.mensaje).toBe(MENSAJE_SIN_CONEXION);
    expect(obtenerAgenda).toHaveBeenCalledTimes(1);
    act(() => result.current.recargar());
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(obtenerAgenda).toHaveBeenCalledTimes(2);
  });

  it('NFR_04_la_precarga_se_usa_una_vez_cambiar_de_dia_y_volver_lee_de_nuevo', async () => {
    const obtenerConfig = vi.fn(() => new Promise<ConfigPublica>(() => undefined));
    const obtenerAgenda = vi.fn(async () => LUNES);
    precargarAgendaPublica(ANA, null, { obtenerConfig, obtenerAgenda, ahora: AHORA, zona: ZONA });
    await tic();
    const { result, rerender } = renderHook(({ dia }) => useAgendaDia(ANA, dia, obtenerAgenda), {
      initialProps: { dia: '2026-11-02' },
    });
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(obtenerAgenda).toHaveBeenCalledTimes(1);
    await act(tic);
    rerender({ dia: '2026-11-03' });
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    rerender({ dia: '2026-11-02' });
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(obtenerAgenda).toHaveBeenCalledTimes(3);
  });

  it('NFR_04_una_precarga_vencida_o_de_otra_funcion_no_se_usa', async () => {
    const obtenerConfig = vi.fn(() => new Promise<ConfigPublica>(() => undefined));
    const obtenerAgenda = vi.fn(async () => LUNES);
    const otra = vi.fn(async () => LUNES);
    const inicio = Date.now();
    precargarAgendaPublica(ANA, null, { obtenerConfig, obtenerAgenda, ahora: AHORA, zona: ZONA });
    expect(tomarPrecargaAgenda(ANA, '2026-11-02', otra)).toBeNull();
    vi.spyOn(Date, 'now').mockReturnValue(inicio + VIGENCIA_PRECARGA_MS + 1_000);
    expect(tomarPrecargaAgenda(ANA, '2026-11-02', obtenerAgenda)).toBeNull();
  });
});
