// B03 · T03.1 · Hook `useMailsFallidos` (WEB-08, NFR-07, SEC-17).
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MENSAJE_GENERICO, MENSAJES } from '../../../../src/lib/errores';
import { useMailsFallidos, type MailFallido } from '../../../../src/modulos/configuracion/logica';

const MAIL: MailFallido = {
  id: '11111111-1111-4111-8111-111111111111',
  fecha: '2026-11-02T13:00:00+00:00',
  destinatario: 'alumno@example.test',
  tipo: 'recordatorio',
  motivo: 'TOPE',
};

describe('useMailsFallidos', () => {
  it('NFR_07_arranca_cargando_y_queda_listo_con_los_mails', async () => {
    const lector = vi.fn().mockResolvedValue([MAIL]);
    const { result } = renderHook(() => useMailsFallidos(lector));
    expect(result.current.datos).toEqual({ estado: 'cargando', mails: [], error: null });
    await waitFor(() => expect(result.current.datos.estado).toBe('listo'));
    expect(result.current.datos.mails).toEqual([MAIL]);
    expect(lector).toHaveBeenCalledTimes(1);
  });

  it('SEC_17_un_error_deja_el_mensaje_traducido_y_nunca_los_details', async () => {
    const lector = vi.fn().mockRejectedValue({ code: 'XX000', message: 'boom', details: 'alumno@example.test' });
    const { result } = renderHook(() => useMailsFallidos(lector));
    await waitFor(() => expect(result.current.datos.estado).toBe('error'));
    expect(result.current.datos.error).toBe(MENSAJE_GENERICO);
    expect(JSON.stringify(result.current.datos)).not.toContain('alumno@example.test');
  });

  it('NFR_07_recargar_conserva_la_lista_mientras_carga_y_la_reemplaza', async () => {
    const otro = { ...MAIL, id: '22222222-2222-4222-8222-222222222222' };
    const lector = vi.fn().mockResolvedValueOnce([MAIL]).mockResolvedValueOnce([otro, MAIL]);
    const { result } = renderHook(() => useMailsFallidos(lector));
    await waitFor(() => expect(result.current.datos.estado).toBe('listo'));
    act(() => result.current.recargar());
    expect(result.current.datos).toEqual({ estado: 'cargando', mails: [MAIL], error: null });
    await waitFor(() => expect(result.current.datos.mails).toHaveLength(2));
    expect(lector).toHaveBeenCalledTimes(2);
  });

  it('NFR_07_un_error_al_recargar_conserva_la_lista_anterior', async () => {
    const lector = vi
      .fn()
      .mockResolvedValueOnce([MAIL])
      .mockRejectedValueOnce({ message: 'PROHIBIDO', code: 'PT403' });
    const { result } = renderHook(() => useMailsFallidos(lector));
    await waitFor(() => expect(result.current.datos.estado).toBe('listo'));
    act(() => result.current.recargar());
    await waitFor(() => expect(result.current.datos.estado).toBe('error'));
    expect(result.current.datos).toEqual({ estado: 'error', mails: [MAIL], error: MENSAJES.PROHIBIDO });
  });

  it('NFR_07_no_actualiza_el_estado_despues_de_desmontar', async () => {
    let resolver: (m: MailFallido[]) => void = () => {};
    const lector = vi.fn(() => new Promise<MailFallido[]>((r) => (resolver = r)));
    const { result, unmount } = renderHook(() => useMailsFallidos(lector));
    unmount();
    await act(async () => resolver([MAIL]));
    expect(result.current.datos.estado).toBe('cargando');
  });
});
