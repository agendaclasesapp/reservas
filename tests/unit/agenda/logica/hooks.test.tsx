import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MENSAJE_GENERICO, MENSAJES, MENSAJE_SIN_CONEXION } from '../../../../src/lib/errores';
import {
  reiniciarConfigPublica,
  useAgendaDia,
  useConfigPublica,
  type ConfigPublica,
  type Hueco,
  type ObtenerConfig,
} from '../../../../src/modulos/agenda/logica';

const LUNES: Hueco[] = [
  { inicio: '2026-11-02T11:00:00+00:00', fin: '2026-11-02T12:00:00+00:00', estado: 'libre' },
  { inicio: '2026-11-02T12:00:00+00:00', fin: '2026-11-02T13:00:00+00:00', estado: 'ocupado' },
];
const MARTES: Hueco[] = [{ inicio: '2026-11-03T11:00:00+00:00', fin: '2026-11-03T12:00:00+00:00', estado: 'bloqueado' }];

const ANA = 'ana-perez';
const BETO = 'beto-gomez';
const CONFIG: ConfigPublica = {
  profesor_id: 'p-ana',
  nombre: 'Ana Pérez',
  activo: true,
  zona_horaria: 'America/Montevideo',
  duracion_min: 60,
  anticipacion_horas: 24,
  horizonte_semanas: 26,
};
const CONFIG_BETO: ConfigPublica = { profesor_id: 'p-beto', nombre: 'Beto Gómez', activo: false };

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

describe('useAgendaDia (AGE-07, AGE-09)', () => {
  it('AGE_09_empieza_cargando_y_termina_con_los_huecos_del_dia_del_profesor_del_slug', async () => {
    const obtener = vi.fn(async () => LUNES);
    const { result } = renderHook(() => useAgendaDia(ANA, '2026-11-02', obtener));
    expect(result.current).toMatchObject({ estado: 'cargando', huecos: [], error: null });
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.huecos).toEqual(LUNES);
    expect(obtener).toHaveBeenCalledWith(ANA, '2026-11-02');
  });

  it('AGE_07_un_dia_sin_huecos_queda_listo_con_lista_vacia', async () => {
    const { result } = renderHook(() => useAgendaDia(ANA, '2026-11-07', async () => []));
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.huecos).toEqual([]);
  });

  it('SEC_09_el_422_de_p_dia_queda_como_error_traducido_sin_details', async () => {
    const obtener = vi.fn(async () => {
      throw { code: 'PT422', message: 'DATOS_INVALIDOS', details: '{"campo":"p_dia"}' };
    });
    const { result } = renderHook(() => useAgendaDia(ANA, '2030-01-01', obtener));
    await waitFor(() => expect(result.current.estado).toBe('error'));
    expect(result.current.error).toEqual({ codigo: 'DATOS_INVALIDOS', mensaje: MENSAJES.DATOS_INVALIDOS });
    expect(result.current.huecos).toEqual([]);
  });

  it('AGE_11_el_409_de_profesor_inactivo_queda_como_error_con_su_codigo', async () => {
    const obtener = vi.fn(async () => {
      throw { code: 'PT409', message: 'PROFESOR_INACTIVO' };
    });
    const { result } = renderHook(() => useAgendaDia(ANA, '2026-11-02', obtener));
    await waitFor(() => expect(result.current.estado).toBe('error'));
    expect(result.current.error?.codigo).toBe('PROFESOR_INACTIVO');
    expect(result.current.huecos).toEqual([]);
  });

  it('AGE_07_un_error_sincronico_o_de_red_tambien_queda_como_error', async () => {
    const { result } = renderHook(() =>
      useAgendaDia(ANA, '2026-11-02', () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await waitFor(() => expect(result.current.estado).toBe('error'));
    expect(result.current.error?.mensaje).toBe(MENSAJE_SIN_CONEXION);
  });

  it('AGE_07_al_cambiar_de_dia_descarta_la_respuesta_tardia_del_anterior', async () => {
    const lunes = diferido<Hueco[]>();
    const martes = diferido<Hueco[]>();
    const obtener = vi.fn((_slug: string, dia: string) => (dia === '2026-11-02' ? lunes.promesa : martes.promesa));
    const { result, rerender } = renderHook(({ dia }) => useAgendaDia(ANA, dia, obtener), {
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

  it('AGE_10_al_cambiar_de_profesor_descarta_la_respuesta_tardia_del_anterior', async () => {
    const deAna = diferido<Hueco[]>();
    const deBeto = diferido<Hueco[]>();
    const obtener = vi.fn((slug: string) => (slug === ANA ? deAna.promesa : deBeto.promesa));
    const { result, rerender } = renderHook(({ slug }) => useAgendaDia(slug, '2026-11-02', obtener), {
      initialProps: { slug: ANA },
    });
    await waitFor(() => expect(obtener).toHaveBeenCalledTimes(1));
    rerender({ slug: BETO });
    expect(result.current.estado).toBe('cargando');
    await waitFor(() => expect(obtener).toHaveBeenCalledWith(BETO, '2026-11-02'));
    await act(async () => deBeto.resolver(MARTES));
    await act(async () => deAna.resolver(LUNES));
    expect(result.current).toMatchObject({ estado: 'listo', huecos: MARTES });
  });

  it('AGE_07_recargar_vuelve_a_pedir_el_dia_tras_un_error', async () => {
    const obtener = vi
      .fn<(slug: string, dia: string) => Promise<Hueco[]>>()
      .mockRejectedValueOnce({ message: 'algo raro de postgres' })
      .mockResolvedValueOnce(LUNES);
    const { result } = renderHook(() => useAgendaDia(ANA, '2026-11-02', obtener));
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
    const { result, rerender } = renderHook(() => useAgendaDia(ANA, '2026-11-02', obtener));
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    const antes = result.current;
    rerender();
    expect(result.current).toBe(antes);
  });
});

describe('useConfigPublica(slug) (AGE-08, AGE-09, AGE-11, ADR-004)', () => {
  it('AGE_08_lee_la_configuracion_de_un_slug_una_sola_vez_y_la_comparte', async () => {
    const obtener = vi.fn(async () => CONFIG);
    const a = renderHook(() => useConfigPublica(ANA, obtener));
    expect(a.result.current.estado).toBe('cargando');
    await waitFor(() => expect(a.result.current.estado).toBe('listo'));
    expect(a.result.current.config).toEqual(CONFIG);

    const b = renderHook(() => useConfigPublica(' ANA-PEREZ ', obtener));
    expect(b.result.current).toMatchObject({ estado: 'listo', config: CONFIG, enlaceNoValido: false });
    await waitFor(() => expect(b.result.current.config).toEqual(CONFIG));
    expect(obtener).toHaveBeenCalledTimes(1);
    expect(obtener).toHaveBeenCalledWith(ANA);
  });

  it('AGE_10_cada_slug_tiene_su_cache_y_no_mezcla_profesores', async () => {
    const obtener = vi.fn<ObtenerConfig>(async (slug) => (slug === ANA ? CONFIG : CONFIG_BETO));
    const { result, rerender } = renderHook(({ slug }) => useConfigPublica(slug, obtener), {
      initialProps: { slug: ANA },
    });
    await waitFor(() => expect(result.current.config).toEqual(CONFIG));
    rerender({ slug: BETO });
    expect(result.current.config).not.toEqual(CONFIG);
    await waitFor(() => expect(result.current.config).toEqual(CONFIG_BETO));
    rerender({ slug: ANA });
    expect(result.current.config).toEqual(CONFIG);
    expect(obtener).toHaveBeenCalledTimes(2);
  });

  it('AGE_11_un_profesor_inactivo_queda_listo_con_activo_false', async () => {
    const { result } = renderHook(() => useConfigPublica(BETO, async () => CONFIG_BETO));
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.config).toEqual({ profesor_id: 'p-beto', nombre: 'Beto Gómez', activo: false });
  });

  it('AGE_09_un_slug_desconocido_marca_enlace_no_valido', async () => {
    const obtener = vi.fn(async (): Promise<ConfigPublica> => {
      throw { code: 'PT404', message: 'NO_ENCONTRADO' };
    });
    const { result } = renderHook(() => useConfigPublica('nadie-asi', obtener));
    await waitFor(() => expect(result.current.estado).toBe('error'));
    expect(result.current.enlaceNoValido).toBe(true);
    expect(result.current.config).toBeNull();
  });

  it('AGE_09_con_slug_null_queda_cargando_sin_pedir_nada', async () => {
    const obtener = vi.fn(async () => CONFIG);
    const { result } = renderHook(() => useConfigPublica(null, obtener));
    await act(async () => undefined);
    expect(result.current).toMatchObject({ estado: 'cargando', config: null, enlaceNoValido: false });
    expect(obtener).not.toHaveBeenCalled();
  });

  it('AGE_08_si_falla_muestra_el_error_y_recargar_reintenta', async () => {
    const obtener = vi
      .fn<ObtenerConfig>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(CONFIG);
    const { result } = renderHook(() => useConfigPublica(ANA, obtener));
    await waitFor(() => expect(result.current.estado).toBe('error'));
    expect(result.current.error?.codigo).toBe('SIN_CONEXION');
    expect(result.current.enlaceNoValido).toBe(false);
    expect(result.current.config).toBeNull();
    act(() => result.current.recargar());
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.config).toEqual(CONFIG);
    expect(obtener).toHaveBeenCalledTimes(2);
  });

  it('AGE_08_recargar_tras_un_exito_vuelve_a_leer_la_configuracion', async () => {
    const nueva: ConfigPublica = { ...CONFIG, duracion_min: 45 };
    const obtener = vi.fn<ObtenerConfig>().mockResolvedValueOnce(CONFIG).mockResolvedValueOnce(nueva);
    const { result } = renderHook(() => useConfigPublica(ANA, obtener));
    await waitFor(() => expect(result.current.config).toEqual(CONFIG));
    act(() => result.current.recargar());
    await waitFor(() => expect(result.current.config).toEqual(nueva));
    expect(obtener).toHaveBeenCalledTimes(2);
  });

  it('AGE_08_desmontar_antes_de_la_respuesta_no_actualiza_el_estado', async () => {
    const pedido = diferido<ConfigPublica>();
    const { result, unmount } = renderHook(() => useConfigPublica(ANA, () => pedido.promesa));
    unmount();
    await act(async () => pedido.resolver(CONFIG));
    expect(result.current.estado).toBe('cargando');
  });
});
