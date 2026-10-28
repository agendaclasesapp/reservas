// B15 · T15.1 · Hooks del Administrador: lista (ADM-03), alta (ADM-02) y cambio de estado (ADM-05). SEC-17.
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MENSAJE_GENERICO, MENSAJES } from '../../../../src/lib/errores';
import type { ProfesorLista, ResultadoAltaProfesor, ResultadoEstadoProfesor } from '../../../../src/modulos/admin/logica';
import {
  useAltaProfesor,
  useCambiarEstadoProfesor,
  useProfesores,
} from '../../../../src/modulos/admin/logica/hooks';

const P: ProfesorLista = {
  profesor_id: 'p1',
  nombre: 'Profe A',
  mail: 'profa@example.test',
  slug: 'profe-a',
  activo: true,
  creado_en: '2026-10-23T15:00:00+00:00',
  enlace: 'https://ejemplo.test/#/p/profe-a',
};

const ALTA = { mail: 'nuevo@example.test', nombre: 'Nuevo', slug: 'nuevo' };

function diferida<T>() {
  let resolver: (v: T) => void = () => undefined;
  const promesa = new Promise<T>((r) => {
    resolver = r;
  });
  return { promesa, resolver };
}

describe('useProfesores', () => {
  it('ADM_03_arranca_cargando_y_queda_listo_con_la_lista', async () => {
    const lector = vi.fn().mockResolvedValue([P]);
    const { result } = renderHook(() => useProfesores(lector));
    expect(result.current.datos).toEqual({ estado: 'cargando', profesores: [], error: null });
    await waitFor(() => expect(result.current.datos.estado).toBe('listo'));
    expect(result.current.datos.profesores).toEqual([P]);
  });

  it('SEC_06_el_403_queda_traducido_y_nunca_los_details', async () => {
    const lector = vi.fn().mockRejectedValue({ code: 'PT403', message: 'PROHIBIDO', details: 'profa@example.test' });
    const { result } = renderHook(() => useProfesores(lector));
    await waitFor(() => expect(result.current.datos.estado).toBe('error'));
    expect(result.current.datos.error).toBe(MENSAJES.PROHIBIDO);
    expect(JSON.stringify(result.current.datos)).not.toContain('profa@example.test');
  });

  it('ADM_03_recargar_conserva_la_lista_mientras_carga_y_la_reemplaza', async () => {
    const otro = { ...P, profesor_id: 'p2', activo: false };
    const lector = vi.fn().mockResolvedValueOnce([P]).mockResolvedValueOnce([P, otro]);
    const { result } = renderHook(() => useProfesores(lector));
    await waitFor(() => expect(result.current.datos.estado).toBe('listo'));
    act(() => result.current.recargar());
    expect(result.current.datos).toEqual({ estado: 'cargando', profesores: [P], error: null });
    await waitFor(() => expect(result.current.datos.profesores).toHaveLength(2));
  });

  it('ADM_03_una_respuesta_que_llega_despues_de_desmontar_no_se_aplica', async () => {
    const d = diferida<ProfesorLista[]>();
    const { result, unmount } = renderHook(() => useProfesores(() => d.promesa));
    unmount();
    d.resolver([P]);
    await d.promesa;
    expect(result.current.datos.estado).toBe('cargando');
  });
});

describe('useAltaProfesor', () => {
  it('ADM_02_envia_marca_enviando_y_deja_el_resultado', async () => {
    const d = diferida<ResultadoAltaProfesor>();
    const accion = vi.fn(() => d.promesa);
    const { result } = renderHook(() => useAltaProfesor(accion));
    let promesa: Promise<ResultadoAltaProfesor> | undefined;
    act(() => {
      promesa = result.current.enviar(ALTA);
    });
    expect(result.current.enviando).toBe(true);
    const ok: ResultadoAltaProfesor = { ok: true, profesorId: 'p9', slug: 'nuevo', adoptado: false };
    await act(async () => {
      d.resolver(ok);
      await promesa;
    });
    expect(result.current).toMatchObject({ enviando: false, resultado: ok });
    act(() => result.current.limpiar());
    expect(result.current.resultado).toBeNull();
  });

  it('ADM_02_un_segundo_envio_en_curso_no_repite_la_escritura', async () => {
    const d = diferida<ResultadoAltaProfesor>();
    const accion = vi.fn(() => d.promesa);
    const { result } = renderHook(() => useAltaProfesor(accion));
    let a: Promise<ResultadoAltaProfesor> | undefined;
    let b: Promise<ResultadoAltaProfesor> | undefined;
    act(() => {
      a = result.current.enviar(ALTA);
      b = result.current.enviar(ALTA);
    });
    expect(a).toBe(b);
    expect(accion).toHaveBeenCalledTimes(1);
    await act(async () => {
      d.resolver({ ok: true, profesorId: 'p9', slug: 'nuevo', adoptado: true });
      await a;
    });
  });

  it('SEC_17_si_la_accion_falla_queda_el_mensaje_generico_y_se_puede_reintentar', async () => {
    const accion = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({
      ok: true,
      profesorId: 'p9',
      slug: 'nuevo',
      adoptado: false,
    });
    const { result } = renderHook(() => useAltaProfesor(accion));
    await act(async () => {
      await result.current.enviar(ALTA);
    });
    expect(result.current.resultado).toMatchObject({ ok: false, mensaje: MENSAJE_GENERICO });
    expect(result.current.enviando).toBe(false);
    await act(async () => {
      await result.current.enviar(ALTA);
    });
    expect(result.current.resultado).toMatchObject({ ok: true });
  });
});

describe('useCambiarEstadoProfesor', () => {
  it('ADM_05_marca_el_profesor_en_curso_y_deja_el_resultado', async () => {
    const d = diferida<ResultadoEstadoProfesor>();
    const accion = vi.fn(() => d.promesa);
    const { result } = renderHook(() => useCambiarEstadoProfesor(accion));
    let promesa: Promise<ResultadoEstadoProfesor> | undefined;
    act(() => {
      promesa = result.current.cambiar('p1', false);
    });
    expect(result.current.cambiando).toBe('p1');
    expect(accion).toHaveBeenCalledWith('p1', false);
    await act(async () => {
      d.resolver({ ok: true, profesorId: 'p1', activo: false });
      await promesa;
    });
    expect(result.current).toMatchObject({ cambiando: null, resultado: { ok: true, activo: false } });
  });

  it('ADM_05_mientras_hay_un_cambio_en_curso_otro_no_sale', async () => {
    const d = diferida<ResultadoEstadoProfesor>();
    const accion = vi.fn(() => d.promesa);
    const { result } = renderHook(() => useCambiarEstadoProfesor(accion));
    let a: Promise<ResultadoEstadoProfesor> | undefined;
    act(() => {
      a = result.current.cambiar('p1', false);
      void result.current.cambiar('p2', true);
    });
    expect(accion).toHaveBeenCalledTimes(1);
    await act(async () => {
      d.resolver({ ok: true, profesorId: 'p1', activo: false });
      await a;
    });
  });

  it('SEC_06_un_403_queda_como_resultado_traducido', async () => {
    const accion = vi.fn().mockRejectedValue({ code: 'PT403', message: 'PROHIBIDO' });
    const { result } = renderHook(() => useCambiarEstadoProfesor(accion));
    await act(async () => {
      await result.current.cambiar('p1', true);
    });
    expect(result.current.resultado).toMatchObject({ ok: false, codigo: 'PROHIBIDO', mensaje: MENSAJES.PROHIBIDO });
  });
});
