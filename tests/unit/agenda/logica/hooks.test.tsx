import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MENSAJE_GENERICO, MENSAJES, MENSAJE_SIN_CONEXION } from '../../../../src/lib/errores';
import {
  reiniciarConfigPublica,
  useAgendaDia,
  useConfigPublica,
  type ConfigPublica,
  type Hueco,
} from '../../../../src/modulos/agenda/logica';

const LUNES: Hueco[] = [
  { inicio: '2026-11-02T11:00:00+00:00', fin: '2026-11-02T12:00:00+00:00', estado: 'libre' },
  { inicio: '2026-11-02T12:00:00+00:00', fin: '2026-11-02T13:00:00+00:00', estado: 'ocupado' },
];
const MARTES: Hueco[] = [{ inicio: '2026-11-03T11:00:00+00:00', fin: '2026-11-03T12:00:00+00:00', estado: 'bloqueado' }];

const CONFIG: ConfigPublica = {
  zona_horaria: 'America/Montevideo',
  duracion_min: 60,
  anticipacion_horas: 24,
  horizonte_semanas: 26,
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

afterEach(() => reiniciarConfigPublica());

describe('useAgendaDia (AGE-07)', () => {
  it('AGE_07_empieza_cargando_y_termina_con_los_huecos_del_dia', async () => {
    const obtener = vi.fn(async () => LUNES);
    const { result } = renderHook(() => useAgendaDia('2026-11-02', obtener));
    expect(result.current).toMatchObject({ estado: 'cargando', huecos: [], error: null });
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.huecos).toEqual(LUNES);
    expect(obtener).toHaveBeenCalledWith('2026-11-02');
  });

  it('AGE_07_un_dia_sin_huecos_queda_listo_con_lista_vacia', async () => {
    const { result } = renderHook(() => useAgendaDia('2026-11-07', async () => []));
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.huecos).toEqual([]);
  });

  it('SEC_09_el_422_de_p_dia_queda_como_error_traducido_sin_details', async () => {
    const obtener = vi.fn(async () => {
      throw { code: 'PT422', message: 'DATOS_INVALIDOS', details: '{"campo":"p_dia"}' };
    });
    const { result } = renderHook(() => useAgendaDia('2030-01-01', obtener));
    await waitFor(() => expect(result.current.estado).toBe('error'));
    expect(result.current.error).toEqual({ codigo: 'DATOS_INVALIDOS', mensaje: MENSAJES.DATOS_INVALIDOS });
    expect(result.current.huecos).toEqual([]);
  });

  it('AGE_07_un_error_sincronico_o_de_red_tambien_queda_como_error', async () => {
    const { result } = renderHook(() =>
      useAgendaDia('2026-11-02', () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await waitFor(() => expect(result.current.estado).toBe('error'));
    expect(result.current.error?.mensaje).toBe(MENSAJE_SIN_CONEXION);
  });

  it('AGE_07_al_cambiar_de_dia_descarta_la_respuesta_tardia_del_anterior', async () => {
    const lunes = diferido<Hueco[]>();
    const martes = diferido<Hueco[]>();
    const obtener = vi.fn((dia: string) => (dia === '2026-11-02' ? lunes.promesa : martes.promesa));
    const { result, rerender } = renderHook(({ dia }) => useAgendaDia(dia, obtener), {
      initialProps: { dia: '2026-11-02' },
    });
    await waitFor(() => expect(obtener).toHaveBeenCalledTimes(1));
    rerender({ dia: '2026-11-03' });
    expect(result.current.estado).toBe('cargando');
    await waitFor(() => expect(obtener).toHaveBeenCalledTimes(2));
    await act(async () => martes.resolver(MARTES));
    await act(async () => lunes.resolver(LUNES));
    expect(result.current).toMatchObject({ estado: 'listo', huecos: MARTES });
  });

  it('AGE_07_recargar_vuelve_a_pedir_el_dia_tras_un_error', async () => {
    const obtener = vi
      .fn<(dia: string) => Promise<Hueco[]>>()
      .mockRejectedValueOnce({ message: 'algo raro de postgres' })
      .mockResolvedValueOnce(LUNES);
    const { result } = renderHook(() => useAgendaDia('2026-11-02', obtener));
    await waitFor(() => expect(result.current.estado).toBe('error'));
    expect(result.current.error?.mensaje).toBe(MENSAJE_GENERICO);
    act(() => result.current.recargar());
    expect(result.current.estado).toBe('cargando');
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.huecos).toEqual(LUNES);
    expect(obtener).toHaveBeenCalledTimes(2);
  });

  it('AGE_07_mantiene_la_misma_referencia_entre_renders_sin_cambios', async () => {
    const obtener = vi.fn(async () => LUNES);
    const { result, rerender } = renderHook(() => useAgendaDia('2026-11-02', obtener));
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    const antes = result.current;
    rerender();
    expect(result.current).toBe(antes);
  });
});

describe('useConfigPublica (AGE-08, ADR-004)', () => {
  it('AGE_08_lee_la_configuracion_una_sola_vez_y_la_comparte', async () => {
    const obtener = vi.fn(async () => CONFIG);
    const a = renderHook(() => useConfigPublica(obtener));
    expect(a.result.current.estado).toBe('cargando');
    await waitFor(() => expect(a.result.current.estado).toBe('listo'));
    expect(a.result.current.config).toEqual(CONFIG);

    const b = renderHook(() => useConfigPublica(obtener));
    expect(b.result.current).toMatchObject({ estado: 'listo', config: CONFIG });
    await waitFor(() => expect(b.result.current.config).toEqual(CONFIG));
    expect(obtener).toHaveBeenCalledTimes(1);
  });

  it('AGE_08_si_falla_muestra_el_error_y_recargar_reintenta', async () => {
    const obtener = vi
      .fn<() => Promise<ConfigPublica>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(CONFIG);
    const { result } = renderHook(() => useConfigPublica(obtener));
    await waitFor(() => expect(result.current.estado).toBe('error'));
    expect(result.current.error?.codigo).toBe('SIN_CONEXION');
    expect(result.current.config).toBeNull();
    act(() => result.current.recargar());
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.config).toEqual(CONFIG);
    expect(obtener).toHaveBeenCalledTimes(2);
  });

  it('AGE_08_desmontar_antes_de_la_respuesta_no_actualiza_el_estado', async () => {
    const pedido = diferido<ConfigPublica>();
    const { result, unmount } = renderHook(() => useConfigPublica(() => pedido.promesa));
    unmount();
    await act(async () => pedido.resolver(CONFIG));
    expect(result.current.estado).toBe('cargando');
  });
});
