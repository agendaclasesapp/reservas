// @vitest-environment jsdom
// Widget de Turnstile (WEB-02, CA-44, SEC-16): carga diferida, token de un solo uso, estados de error.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cargarTurnstile,
  DesafioTurnstile,
  MENSAJE_FALLO_DESAFIO,
  MENSAJE_SIN_SCRIPT,
  URL_SCRIPT_TURNSTILE,
  type ApiTurnstile,
} from '../../../../src/modulos/ingreso/vistas/DesafioTurnstile';
import { sinViolacionesAxe } from '../../ui/soporte';
import { crearTurnstileFalso } from './turnstile-falso';

afterEach(() => {
  cleanup();
  delete window.turnstile;
  document.head.querySelectorAll('script').forEach((s) => s.remove());
});

describe('cargarTurnstile (script cargado solo al pedirlo, sin dependencia npm)', () => {
  it('WEB_02_si_el_script_falla_se_rechaza_y_el_proximo_intento_lo_vuelve_a_pedir', async () => {
    const primero = cargarTurnstile();
    const script = document.head.querySelector<HTMLScriptElement>('script');
    expect(script?.src).toBe(URL_SCRIPT_TURNSTILE);
    script?.dispatchEvent(new Event('error'));
    await expect(primero).rejects.toThrow();
    expect(document.head.querySelector('script')).toBeNull();

    const segundo = cargarTurnstile();
    expect(document.head.querySelectorAll('script')).toHaveLength(1);
    const api: ApiTurnstile = { render: vi.fn(), reset: vi.fn(), remove: vi.fn() };
    window.turnstile = api;
    document.head.querySelector('script')?.dispatchEvent(new Event('load'));
    await expect(segundo).resolves.toBe(api);
  });

  it('WEB_02_con_la_api_ya_disponible_no_inserta_otro_script', async () => {
    const api: ApiTurnstile = { render: vi.fn(), reset: vi.fn(), remove: vi.fn() };
    window.turnstile = api;
    await expect(cargarTurnstile()).resolves.toBe(api);
    expect(document.head.querySelector('script')).toBeNull();
  });
});

describe('DesafioTurnstile (WEB-02, CA-44)', () => {
  it('WEB_02_crea_el_widget_con_la_clave_publica_y_avisa_el_token', async () => {
    const turnstile = crearTurnstileFalso();
    const onToken = vi.fn();
    const { container } = render(
      <DesafioTurnstile sitekey="clave-publica" onToken={onToken} reinicio={0} cargador={turnstile.cargador} />,
    );
    expect(screen.getByRole('status').textContent).toContain('Cargando el desafío de seguridad…');
    await waitFor(() => expect(turnstile.render).toHaveBeenCalledOnce());
    expect(turnstile.opciones()).toMatchObject({ sitekey: 'clave-publica', language: 'es', theme: 'light' });
    expect(screen.getByRole('group', { name: 'Desafío de seguridad' })).toBeTruthy();
    turnstile.resolver('token-1');
    expect(onToken).toHaveBeenLastCalledWith('token-1');
    turnstile.vencer();
    expect(onToken).toHaveBeenLastCalledWith(null);
    await sinViolacionesAxe(container);
  });

  it('WEB_02_el_token_es_de_un_solo_uso_al_cambiar_reinicio_se_reinicia_el_widget', async () => {
    const turnstile = crearTurnstileFalso();
    const { rerender } = render(
      <DesafioTurnstile sitekey="k" onToken={() => undefined} reinicio={0} cargador={turnstile.cargador} />,
    );
    await waitFor(() => expect(turnstile.render).toHaveBeenCalledOnce());
    expect(turnstile.reset).not.toHaveBeenCalled();
    rerender(<DesafioTurnstile sitekey="k" onToken={() => undefined} reinicio={1} cargador={turnstile.cargador} />);
    expect(turnstile.reset).toHaveBeenCalledWith('widget-1');
    rerender(<DesafioTurnstile sitekey="k" onToken={() => undefined} reinicio={2} cargador={turnstile.cargador} />);
    expect(turnstile.reset).toHaveBeenCalledTimes(2);
    expect(turnstile.render).toHaveBeenCalledOnce();
  });

  it('WEB_02_al_desmontar_quita_el_widget', async () => {
    const turnstile = crearTurnstileFalso();
    const { unmount } = render(
      <DesafioTurnstile sitekey="k" onToken={() => undefined} reinicio={0} cargador={turnstile.cargador} />,
    );
    await waitFor(() => expect(turnstile.render).toHaveBeenCalledOnce());
    unmount();
    expect(turnstile.remove).toHaveBeenCalledWith('widget-1');
  });

  it('WEB_02_si_el_script_no_carga_avisa_y_Reintentar_vuelve_a_cargarlo', async () => {
    const turnstile = crearTurnstileFalso();
    turnstile.cargador.mockRejectedValueOnce(new Error('sin red'));
    const onToken = vi.fn();
    const { container } = render(
      <DesafioTurnstile sitekey="k" onToken={onToken} reinicio={0} cargador={turnstile.cargador} />,
    );
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain(MENSAJE_SIN_SCRIPT);
    await sinViolacionesAxe(container);
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(turnstile.render).toHaveBeenCalledOnce());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onToken).toHaveBeenLastCalledWith(null);
  });

  it('WEB_02_si_el_desafio_falla_avisa_descarta_el_token_y_Reintentar_reinicia', async () => {
    const turnstile = crearTurnstileFalso();
    const onToken = vi.fn();
    render(<DesafioTurnstile sitekey="k" onToken={onToken} reinicio={0} cargador={turnstile.cargador} />);
    await waitFor(() => expect(turnstile.render).toHaveBeenCalledOnce());
    turnstile.resolver('token-1');
    turnstile.fallar();
    expect(onToken).toHaveBeenLastCalledWith(null);
    expect((await screen.findByRole('alert')).textContent).toContain(MENSAJE_FALLO_DESAFIO);
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(turnstile.reset).toHaveBeenCalledWith('widget-1');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('WEB_02_un_desafio_que_vence_antes_de_cargar_no_rompe_nada', async () => {
    const turnstile = crearTurnstileFalso();
    const { unmount } = render(
      <DesafioTurnstile sitekey="k" onToken={() => undefined} reinicio={0} cargador={turnstile.cargador} />,
    );
    unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(turnstile.render).not.toHaveBeenCalled();
  });
});
