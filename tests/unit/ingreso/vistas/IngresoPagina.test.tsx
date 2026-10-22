// @vitest-environment jsdom
// Pantalla de ingreso (WEB-02, ALU-01, CA-01, CA-44, H-021, SEC-16): Google sin desafío, código con Turnstile,
// errores de código incorrecto, vencido y «esperá para pedir otro».
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  IngresoPagina,
  MENSAJE_SIN_CAPTCHA_CONFIGURADO,
  type IngresoPaginaProps,
} from '../../../../src/modulos/ingreso/vistas/IngresoPagina';
import { MENSAJES_PEDIDO, MENSAJES_VERIFICACION } from '../../../../src/modulos/ingreso/logica';
import { sinViolacionesAxe } from '../../ui/soporte';
import { crearTurnstileFalso, type TurnstileFalso } from './turnstile-falso';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const OK = { ok: true } as const;

function montar(extra: Partial<IngresoPaginaProps> = {}, turnstile: TurnstileFalso = crearTurnstileFalso()) {
  const props = {
    onGoogle: vi.fn(() => Promise.resolve(OK)),
    onPedirCodigo: vi.fn(() => Promise.resolve(OK)),
    onVerificarCodigo: vi.fn(() => Promise.resolve(OK)),
    onIngreso: vi.fn(),
    msParaReenviar: vi.fn(() => 0),
  };
  const resultado = render(
    <IngresoPagina sitekey="clave-publica" cargadorTurnstile={turnstile.cargador} {...props} {...extra} />,
  );
  return { ...resultado, props, turnstile };
}

async function elegirCodigo(turnstile: TurnstileFalso) {
  await userEvent.click(screen.getByRole('button', { name: 'Entrar con un código por mail' }));
  await waitFor(() => expect(turnstile.render).toHaveBeenCalled());
}

async function pedirConDesafio(turnstile: TurnstileFalso, mail = 'ana@correo.test') {
  await elegirCodigo(turnstile);
  await userEvent.type(screen.getByLabelText(/^Mail/), mail);
  turnstile.resolver('token-1');
  await userEvent.click(screen.getByRole('button', { name: 'Pedir código' }));
}

describe('IngresoPagina · elección (WEB-02, CA-01)', () => {
  it('WEB_02_ofrece_Google_y_codigo_por_mail_sin_contrasena_y_sin_cargar_el_desafio', async () => {
    const { container, turnstile } = montar();
    expect(screen.getByRole('heading', { level: 1, name: 'Ingresar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continuar con Google' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Entrar con un código por mail' })).toBeTruthy();
    expect(container.querySelector('input[type="password"]')).toBeNull();
    // El script de Turnstile solo se carga al elegir el código (y no con Google).
    expect(turnstile.cargador).not.toHaveBeenCalled();
    await sinViolacionesAxe(container);
  });

  it('CA_44_Continuar_con_Google_no_pide_desafio_y_sale_hacia_Google', async () => {
    const { props, turnstile } = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Continuar con Google' }));
    expect(props.onGoogle).toHaveBeenCalledOnce();
    expect(turnstile.cargador).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Abriendo Google…' }).getAttribute('aria-busy')).toBe('true');
  });

  it('WEB_02_un_error_de_Google_se_anuncia_con_Probar_de_nuevo', async () => {
    const onGoogle = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: 'otro', mensaje: 'No pudimos completar la operación.' })
      .mockResolvedValue(OK);
    const { container } = montar({ onGoogle });
    await userEvent.click(screen.getByRole('button', { name: 'Continuar con Google' }));
    expect((await screen.findByRole('alert')).textContent).toContain('No pudimos completar la operación.');
    await sinViolacionesAxe(container);
    await userEvent.click(screen.getByRole('button', { name: 'Probar de nuevo' }));
    expect(onGoogle).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('WEB_02_muestra_el_error_de_la_vuelta_de_Google', () => {
    montar({ errorGoogle: 'No pudimos completar el ingreso con Google. Probá de nuevo.' });
    expect(screen.getByRole('alert').textContent).toContain('No pudimos completar el ingreso con Google.');
  });

  it('WEB_02_sin_clave_de_turnstile_el_codigo_no_esta_disponible_y_no_se_carga_nada', async () => {
    const { container, turnstile } = montar({ sitekey: undefined });
    await userEvent.click(screen.getByRole('button', { name: 'Entrar con un código por mail' }));
    expect(screen.getByRole('alert').textContent).toContain(MENSAJE_SIN_CAPTCHA_CONFIGURADO);
    expect(screen.queryByLabelText(/^Mail/)).toBeNull();
    expect(turnstile.cargador).not.toHaveBeenCalled();
    await sinViolacionesAxe(container);
  });
});

describe('IngresoPagina · pedir el código (CA-44)', () => {
  it('CA_44_elegir_codigo_carga_el_desafio_y_pide_el_mail_con_los_atributos_del_campo', async () => {
    const { container, turnstile } = montar();
    await elegirCodigo(turnstile);
    expect(turnstile.cargador).toHaveBeenCalledOnce();
    const mail = screen.getByLabelText(/^Mail/);
    expect(mail.getAttribute('type')).toBe('email');
    expect(mail.getAttribute('autocomplete')).toBe('email');
    expect(mail.getAttribute('inputmode')).toBe('email');
    expect(screen.getByRole('heading', { level: 2, name: 'Entrar con un código por mail' })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(mail));
    await sinViolacionesAxe(container);
  });

  it('CA_44_sin_desafio_resuelto_no_se_pide_el_codigo', async () => {
    const { props, turnstile } = montar();
    await elegirCodigo(turnstile);
    await userEvent.type(screen.getByLabelText(/^Mail/), 'ana@correo.test');
    await userEvent.click(screen.getByRole('button', { name: 'Pedir código' }));
    expect(props.onPedirCodigo).not.toHaveBeenCalled();
    expect((await screen.findByRole('alert')).textContent).toContain(MENSAJES_PEDIDO.captcha_pendiente);
  });

  it('CA_44_un_desafio_vencido_vuelve_a_bloquear_el_pedido', async () => {
    const { props, turnstile } = montar();
    await elegirCodigo(turnstile);
    await userEvent.type(screen.getByLabelText(/^Mail/), 'ana@correo.test');
    turnstile.resolver('token-1');
    turnstile.vencer();
    await userEvent.click(screen.getByRole('button', { name: 'Pedir código' }));
    expect(props.onPedirCodigo).not.toHaveBeenCalled();
  });

  it('WEB_02_un_mail_invalido_se_marca_en_el_campo_y_no_se_pide', async () => {
    const { container, props, turnstile } = montar();
    await elegirCodigo(turnstile);
    const campo = screen.getByLabelText(/^Mail/);
    await userEvent.type(campo, 'esto-no-es-un-mail');
    turnstile.resolver('token-1');
    await userEvent.click(screen.getByRole('button', { name: 'Pedir código' }));
    expect(props.onPedirCodigo).not.toHaveBeenCalled();
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(campo.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.activeElement).toBe(campo);
    expect(screen.getByRole('alert').textContent).toBe(MENSAJES_PEDIDO.mail_invalido);
    await sinViolacionesAxe(container);
  });

  it('CA_44_con_el_desafio_resuelto_pide_con_el_token_y_el_widget_usado_se_descarta', async () => {
    const { props, turnstile } = montar();
    await pedirConDesafio(turnstile);
    await waitFor(() => expect(props.onPedirCodigo).toHaveBeenCalledOnce());
    expect(props.onPedirCodigo).toHaveBeenCalledWith({ mail: 'ana@correo.test', captchaToken: 'token-1' });
    expect(await screen.findByRole('heading', { level: 2, name: 'Ingresá el código' })).toBeTruthy();
    // El widget del primer pedido se quita (token usado) y el reenvío arranca con uno nuevo.
    expect(turnstile.remove).toHaveBeenCalledWith('widget-1');
    await waitFor(() => expect(turnstile.creados()).toBe(2));
  });

  it('CA_44_si_el_servidor_rechaza_el_desafio_muestra_el_error_y_reinicia_el_widget_sin_avanzar', async () => {
    const onPedirCodigo = vi.fn(() =>
      Promise.resolve({ ok: false, error: 'captcha', mensaje: MENSAJES_PEDIDO.captcha } as const),
    );
    const { container, turnstile } = montar({ onPedirCodigo });
    await pedirConDesafio(turnstile);
    expect((await screen.findByRole('alert')).textContent).toContain(MENSAJES_PEDIDO.captcha);
    expect(turnstile.reset).toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Ingresá el código' })).toBeNull();
    await sinViolacionesAxe(container);
    // El token usado ya no sirve: hasta resolver otro desafío no se vuelve a pedir.
    await userEvent.click(screen.getByRole('button', { name: 'Pedir código' }));
    expect(onPedirCodigo).toHaveBeenCalledOnce();
    expect((await screen.findByRole('alert')).textContent).toContain(MENSAJES_PEDIDO.captcha_pendiente);
  });

  it('WEB_02_esperar_para_pedir_otro_y_sin_conexion_se_anuncian_como_error', async () => {
    const onPedirCodigo = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: 'esperar_reenvio', mensaje: MENSAJES_PEDIDO.esperar_reenvio })
      .mockResolvedValueOnce({ ok: false, error: 'sin_conexion', mensaje: MENSAJES_PEDIDO.sin_conexion });
    const { turnstile } = montar({ onPedirCodigo });
    await pedirConDesafio(turnstile);
    expect((await screen.findByRole('alert')).textContent).toContain('Esperá un minuto para pedir otro código.');
    turnstile.resolver('token-2');
    await userEvent.click(screen.getByRole('button', { name: 'Pedir código' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(MENSAJES_PEDIDO.sin_conexion));
    expect(onPedirCodigo).toHaveBeenLastCalledWith({ mail: 'ana@correo.test', captchaToken: 'token-2' });
  });

  it('WEB_02_mientras_se_envia_el_boton_dice_Enviando_y_no_admite_un_segundo_pedido', async () => {
    let terminar: (r: { ok: true }) => void = () => undefined;
    const onPedirCodigo = vi.fn(() => new Promise<{ ok: true }>((resolver) => (terminar = resolver)));
    const { turnstile } = montar({ onPedirCodigo });
    await pedirConDesafio(turnstile);
    const boton = await screen.findByRole('button', { name: 'Enviando…' });
    expect(boton.getAttribute('aria-busy')).toBe('true');
    await userEvent.click(boton);
    expect(onPedirCodigo).toHaveBeenCalledOnce();
    await act(async () => terminar({ ok: true }));
  });
});

describe('IngresoPagina · ingresar el código (H-021)', () => {
  async function enPasoCodigo(extra: Partial<IngresoPaginaProps> = {}) {
    const montado = montar(extra);
    await pedirConDesafio(montado.turnstile);
    await screen.findByRole('heading', { level: 2, name: 'Ingresá el código' });
    return montado;
  }

  it('WEB_02_el_paso_del_codigo_tiene_los_atributos_correctos_foco_y_axe', async () => {
    const { container } = await enPasoCodigo();
    const campo = screen.getByLabelText(/^Código de 6 dígitos/);
    expect(campo.getAttribute('autocomplete')).toBe('one-time-code');
    expect(campo.getAttribute('inputmode')).toBe('numeric');
    await waitFor(() => expect(document.activeElement).toBe(campo));
    expect(screen.getByText('ana@correo.test')).toBeTruthy();
    await sinViolacionesAxe(container);
  });

  it('CA_01_con_el_codigo_correcto_ingresa_y_la_pagina_navega', async () => {
    const { props } = await enPasoCodigo();
    await userEvent.type(screen.getByLabelText(/^Código de 6 dígitos/), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(props.onIngreso).toHaveBeenCalledOnce());
    expect(props.onVerificarCodigo).toHaveBeenCalledWith({ mail: 'ana@correo.test', codigo: '123456' });
  });

  it.each([
    ['incorrecto', MENSAJES_VERIFICACION.incorrecto],
    ['vencido', MENSAJES_VERIFICACION.vencido],
    ['incorrecto_o_vencido', MENSAJES_VERIFICACION.incorrecto_o_vencido],
    ['codigo_invalido', MENSAJES_VERIFICACION.codigo_invalido],
    ['demasiados_intentos', MENSAJES_VERIFICACION.demasiados_intentos],
  ] as const)('H_021_el_error_%s_se_anuncia_en_el_campo_con_su_texto_y_el_foco', async (error, mensaje) => {
    const onVerificarCodigo = vi.fn(() => Promise.resolve({ ok: false, error, mensaje } as const));
    const { container, props } = await enPasoCodigo({ onVerificarCodigo });
    const campo = screen.getByLabelText(/^Código de 6 dígitos/);
    await userEvent.type(campo, '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toBe(mensaje);
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(campo.getAttribute('aria-describedby')).toContain(alerta.id);
    await waitFor(() => expect(document.activeElement).toBe(campo));
    expect(props.onIngreso).not.toHaveBeenCalled();
    await sinViolacionesAxe(container);
  });

  it('H_021_incorrecto_y_vencido_tienen_mensajes_distintos', () => {
    expect(MENSAJES_VERIFICACION.incorrecto).not.toBe(MENSAJES_VERIFICACION.vencido);
  });

  it('WEB_02_Usar_otro_mail_vuelve_al_paso_del_mail', async () => {
    await enPasoCodigo();
    await userEvent.click(screen.getByRole('button', { name: 'Usar otro mail' }));
    expect(screen.getByLabelText(/^Mail/)).toBeTruthy();
    expect(screen.queryByLabelText(/^Código de 6 dígitos/)).toBeNull();
  });
});

describe('IngresoPagina · reenvío (H-021, CA-44)', () => {
  async function enPasoCodigo(extra: Partial<IngresoPaginaProps> = {}) {
    const montado = montar(extra);
    await pedirConDesafio(montado.turnstile);
    await screen.findByRole('heading', { level: 2, name: 'Ingresá el código' });
    // El widget del paso del mail se quitó y se creó otro para el reenvío.
    await waitFor(() => expect(montado.turnstile.creados()).toBe(2));
    return montado;
  }

  it('H_021_antes_de_60_s_muestra_la_cuenta_y_no_pide_otro_codigo', async () => {
    const { container, props } = await enPasoCodigo({ msParaReenviar: vi.fn(() => 42_300) });
    expect(screen.getByText('Podés pedir otro código en 43 s.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Pedir un código nuevo' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Esperá un minuto para pedir otro código.');
    expect(props.onPedirCodigo).toHaveBeenCalledOnce();
    await sinViolacionesAxe(container);
  });

  it('H_021_la_cuenta_regresiva_baja_cada_segundo', async () => {
    let restante = 3_000;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await enPasoCodigo({ msParaReenviar: () => restante });
    expect(screen.getByText('Podés pedir otro código en 3 s.')).toBeTruthy();
    restante = 1_000;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText('Podés pedir otro código en 1 s.')).toBeTruthy();
    restante = 0;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText('Resolvé el desafío para pedir un código nuevo.')).toBeTruthy();
  });

  it('CA_44_el_reenvio_exige_un_desafio_nuevo_y_no_reutiliza_el_token_del_primer_pedido', async () => {
    const { props } = await enPasoCodigo();
    await userEvent.click(screen.getByRole('button', { name: 'Pedir un código nuevo' }));
    expect((await screen.findByRole('alert')).textContent).toContain(MENSAJES_PEDIDO.captcha_pendiente);
    expect(props.onPedirCodigo).toHaveBeenCalledOnce();
  });

  it('H_021_con_otro_desafio_reenvia_anuncia_el_codigo_nuevo_y_reinicia_el_widget', async () => {
    const { props, turnstile } = await enPasoCodigo();
    const reinicios = turnstile.reset.mock.calls.length;
    turnstile.resolver('token-2');
    await userEvent.click(screen.getByRole('button', { name: 'Pedir un código nuevo' }));
    await waitFor(() => expect(props.onPedirCodigo).toHaveBeenCalledTimes(2));
    expect(props.onPedirCodigo).toHaveBeenLastCalledWith({ mail: 'ana@correo.test', captchaToken: 'token-2' });
    expect((await screen.findByRole('status')).textContent).toContain('Te mandamos un código nuevo.');
    expect(turnstile.reset.mock.calls.length).toBeGreaterThan(reinicios);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/^Código de 6 dígitos/)));
    // Otro reenvío sin resolver un desafío nuevo no sale.
    await userEvent.click(screen.getByRole('button', { name: 'Pedir un código nuevo' }));
    expect(props.onPedirCodigo).toHaveBeenCalledTimes(2);
  });

  it('H_021_si_el_servidor_responde_429_al_reenviar_dice_que_hay_que_esperar', async () => {
    const onPedirCodigo = vi
      .fn()
      .mockResolvedValueOnce(OK)
      .mockResolvedValueOnce({ ok: false, error: 'esperar_reenvio', mensaje: MENSAJES_PEDIDO.esperar_reenvio });
    const { turnstile } = await enPasoCodigo({ onPedirCodigo });
    turnstile.resolver('token-2');
    await userEvent.click(screen.getByRole('button', { name: 'Pedir un código nuevo' }));
    expect((await screen.findByRole('alert')).textContent).toBe(MENSAJES_PEDIDO.esperar_reenvio);
    expect(turnstile.reset).toHaveBeenCalled();
  });
});
