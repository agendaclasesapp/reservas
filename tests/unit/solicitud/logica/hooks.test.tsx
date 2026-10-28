import type { SupabaseClient } from '@supabase/supabase-js';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  useMisSolicitudes,
  usePrevisualizacionSerie,
  useSolicitarReserva,
} from '../../../../src/modulos/solicitud/logica/hooks';
import * as api from '../../../../src/modulos/solicitud/logica';
import type { Frecuencia, SolicitudEntrada } from '../../../../src/modulos/solicitud/logica';
import { MENSAJES, mensajePendientesSol10 } from '../../../../src/lib/errores';

const INICIO = '2026-11-04T13:00:00+00:00';
const ENTRADA: SolicitudEntrada = {
  profesorId: 'prof-a',
  inicio: INICIO,
  tipo: 'suelta',
  frecuencia: null,
  personaACargoId: null,
  observacion: '',
};
const err = (code: string, message: string, details: string | null = null) => ({ code, message, details, hint: null });

function depsCon(rpc: (nombre: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>) {
  const c = { rpc: vi.fn(rpc) };
  const deps = { obtenerCliente: async () => c as unknown as SupabaseClient };
  return { c, deps };
}

describe('usePrevisualizacionSerie (RES-05, CA-19)', () => {
  it('RES_05_sin_frecuencia_queda_inactiva_y_no_llama', () => {
    const { c, deps } = depsCon(async () => ({ data: [], error: null }));
    const { result } = renderHook(() => usePrevisualizacionSerie('prof-a', INICIO, null, deps));
    expect(result.current).toEqual({ tipo: 'inactiva' });
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it('RES_05_carga_las_fechas_y_cambia_con_la_frecuencia', async () => {
    const { c, deps } = depsCon(async (_n, args) => ({
      data: [
        { inicio: INICIO, estado: 'reservable', motivo: null },
        { inicio: `f${String(args.p_frecuencia)}`, estado: 'salteada', motivo: 'bloqueado' },
      ],
      error: null,
    }));
    const { result, rerender } = renderHook(({ f }: { f: Frecuencia }) => usePrevisualizacionSerie('prof-a', INICIO, f, deps), {
      initialProps: { f: 1 },
    });
    expect(result.current).toEqual({ tipo: 'cargando' });
    await waitFor(() => expect(result.current.tipo).toBe('ok'));
    expect(result.current).toMatchObject({ tipo: 'ok', fechas: [{ estado: 'reservable' }, { inicio: 'f1', motivo: 'bloqueado' }] });
    rerender({ f: 2 });
    expect(result.current).toEqual({ tipo: 'cargando' });
    await waitFor(() => expect(result.current).toMatchObject({ tipo: 'ok', fechas: [{}, { inicio: 'f2' }] }));
    expect(c.rpc).toHaveBeenCalledTimes(2);
  });

  it('RES_05_respuesta_tardia_de_otra_consulta_se_descarta', async () => {
    let soltarPrimera: (v: { data: unknown; error: unknown }) => void = () => undefined;
    const { deps } = depsCon(
      (_n, args) =>
        new Promise((resolver) => {
          if (args.p_frecuencia === 1) soltarPrimera = resolver;
          else resolver({ data: [{ inicio: 'quincenal', estado: 'reservable', motivo: null }], error: null });
        }),
    );
    const { result, rerender } = renderHook(({ f }: { f: Frecuencia }) => usePrevisualizacionSerie('prof-a', INICIO, f, deps), {
      initialProps: { f: 1 },
    });
    rerender({ f: 2 });
    await waitFor(() => expect(result.current).toMatchObject({ tipo: 'ok', fechas: [{ inicio: 'quincenal' }] }));
    await act(async () => {
      soltarPrimera({ data: [{ inicio: 'semanal', estado: 'reservable', motivo: null }], error: null });
      await Promise.resolve();
    });
    expect(result.current).toMatchObject({ tipo: 'ok', fechas: [{ inicio: 'quincenal' }] });
  });

  it('AGE_11_error_de_la_base_queda_como_fallo_traducido', async () => {
    const { deps } = depsCon(async () => ({ data: null, error: err('PT409', 'PROFESOR_INACTIVO') }));
    const { result } = renderHook(() => usePrevisualizacionSerie('prof-a', INICIO, 1, deps));
    await waitFor(() => expect(result.current.tipo).toBe('error'));
    expect(result.current).toMatchObject({ fallo: { codigo: 'PROFESOR_INACTIVO', mensaje: MENSAJES.PROFESOR_INACTIVO } });
  });
});

describe('useSolicitarReserva (SOL-01, SOL-10)', () => {
  it('SOL_01_envia_una_vez_y_deja_el_resultado', async () => {
    let soltar: (v: { data: unknown; error: unknown }) => void = () => undefined;
    const { c, deps } = depsCon(() => new Promise((r) => (soltar = r)));
    const { result } = renderHook(() => useSolicitarReserva(deps));
    expect(result.current.estado).toEqual({ tipo: 'listo' });

    let primera: Promise<unknown> = Promise.resolve();
    let segunda: unknown;
    await act(async () => {
      primera = result.current.enviar(ENTRADA);
      segunda = await result.current.enviar(ENTRADA);
    });
    expect(segunda).toBeNull();
    expect(result.current.estado).toEqual({ tipo: 'enviando' });
    await act(async () => {
      soltar({ data: { solicitud_id: 's-1', reserva_id: 'r-1', fechas: [INICIO], salteadas: [] }, error: null });
      await primera;
    });
    expect(c.rpc).toHaveBeenCalledTimes(1);
    expect(result.current.estado).toEqual({
      tipo: 'hecho',
      resultado: { ok: true, solicitudId: 's-1', reservaId: 'r-1', fechas: [INICIO], salteadas: [] },
    });
    act(() => result.current.reiniciar());
    expect(result.current.estado).toEqual({ tipo: 'listo' });
  });

  it('SOL_10_el_429_llega_como_fallo_con_el_limite', async () => {
    const { deps } = depsCon(async () => ({ data: null, error: err('PT429', 'LIMITE_EXCEDIDO', '{"tope":"pendientes","limite":10}') }));
    const { result } = renderHook(() => useSolicitarReserva(deps));
    await act(async () => {
      await result.current.enviar(ENTRADA);
    });
    expect(result.current.estado).toMatchObject({
      tipo: 'hecho',
      resultado: { ok: false, codigo: 'LIMITE_EXCEDIDO', mensaje: mensajePendientesSol10(10) },
    });
  });

  it('SOL_01_desmontado_antes_de_responder_no_cambia_estado', async () => {
    let soltar: (v: { data: unknown; error: unknown }) => void = () => undefined;
    const { c, deps } = depsCon(() => new Promise((r) => (soltar = r)));
    const { result, unmount } = renderHook(() => useSolicitarReserva(deps));
    let envio: Promise<unknown> = Promise.resolve();
    act(() => {
      envio = result.current.enviar(ENTRADA);
    });
    await waitFor(() => expect(c.rpc).toHaveBeenCalledOnce());
    unmount();
    soltar({ data: null, error: err('PT409', 'HUECO_NO_LIBRE') });
    await expect(envio).resolves.toMatchObject({ ok: false, codigo: 'HUECO_NO_LIBRE' });
  });
});

describe('useMisSolicitudes (SOL-09)', () => {
  function depsFilas(respuestas: { data: unknown; error: unknown }[]) {
    const consulta = {
      select: vi.fn(() => consulta),
      eq: vi.fn(() => consulta),
      order: vi.fn(async () => respuestas.shift() ?? { data: [], error: null }),
    };
    const c = { from: vi.fn(() => consulta) };
    return { consulta, deps: { obtenerCliente: async () => c as unknown as SupabaseClient } };
  }
  const FILA = {
    id: 's-1',
    profesor_id: 'prof-a',
    tipo: 'reserva',
    alcance: null,
    estado: 'pendiente',
    vencida: true,
    fecha_clase: INICIO,
    reserva_id: 'r-1',
    clase_id: null,
    motivo: null,
    creada_en: INICIO,
    respondida_en: null,
  };

  it('SOL_09_carga_las_propias_y_recarga', async () => {
    const { consulta, deps } = depsFilas([
      { data: [], error: null },
      { data: [FILA], error: null },
    ]);
    const { result } = renderHook(() => useMisSolicitudes('prof-a', deps));
    expect(result.current.estado).toEqual({ tipo: 'cargando' });
    await waitFor(() => expect(result.current.estado).toEqual({ tipo: 'ok', solicitudes: [] }));
    act(() => result.current.recargar());
    await waitFor(() => expect(result.current.estado).toEqual({ tipo: 'ok', solicitudes: [FILA] }));
    expect(consulta.eq).toHaveBeenCalledWith('profesor_id', 'prof-a');
  });

  it('SOL_09_un_error_se_muestra_traducido', async () => {
    const { deps } = depsFilas([{ data: null, error: err('PT401', 'NO_AUTENTICADO') }]);
    const { result } = renderHook(() => useMisSolicitudes(null, deps));
    await waitFor(() => expect(result.current.estado).toEqual({ tipo: 'error', mensaje: MENSAJES.NO_AUTENTICADO }));
  });
});

describe('API pública con las dependencias reales (index.ts)', () => {
  it('WEB_04_los_hooks_publicos_arrancan_sin_llamar_cuando_no_hay_datos', () => {
    const { result } = renderHook(() => api.usePrevisualizacionSerie(null, null, null));
    expect(result.current).toEqual({ tipo: 'inactiva' });
    const envio = renderHook(() => api.useSolicitarReserva());
    expect(envio.result.current.estado).toEqual({ tipo: 'listo' });
  });

  it('SEC_09_la_api_publica_valida_antes_de_cargar_supabase', async () => {
    const r = await api.solicitarReserva({ ...ENTRADA, tipo: 'serie', frecuencia: null });
    expect(r).toMatchObject({ ok: false, campo: 'frecuencia' });
  });

  it('SOL_09_la_api_publica_delega_con_dependencias_inyectadas', async () => {
    const { deps } = depsCon(async () => ({ data: [], error: null }));
    expect(await api.previsualizarSerie('prof-a', INICIO, 1, deps)).toEqual({ ok: true, fechas: [] });
    const consulta = { select: vi.fn(() => consulta), eq: vi.fn(() => consulta), order: vi.fn(async () => ({ data: [], error: null })) };
    const c = { from: vi.fn(() => consulta) };
    expect(await api.leerMisSolicitudes(null, { obtenerCliente: async () => c as unknown as SupabaseClient })).toEqual([]);
  });
});
