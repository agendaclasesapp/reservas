import { describe, expect, it, vi } from 'vitest';
import {
  CLAVE_PEDIDO,
  clasificarErrorPedido,
  clasificarErrorVerificacion,
  MENSAJES_PEDIDO,
  MENSAJES_VERIFICACION,
  msParaReenviar,
  normalizarMail,
  pedirCodigo,
  verificarCodigo,
  type AuthCodigo,
  type DependenciasCodigo,
} from '../../../../src/modulos/ingreso/logica';
import type { ErrorAuth } from '../../../../src/estado/tipos';

const T0 = 1_800_000_000_000;

function almacen(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial));
  return {
    datos,
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    removeItem: (k: string) => void datos.delete(k),
  };
}

function preparar(opciones: { errorOtp?: ErrorAuth | null; errorVerificar?: ErrorAuth | null; ahora?: number } = {}) {
  const auth = {
    signInWithOtp: vi.fn<AuthCodigo['signInWithOtp']>(async () => ({ error: opciones.errorOtp ?? null })),
    verifyOtp: vi.fn<AuthCodigo['verifyOtp']>(async () => ({ error: opciones.errorVerificar ?? null })),
  };
  const storage = almacen();
  const alIngresar = vi.fn(async () => undefined);
  let ahora = opciones.ahora ?? T0;
  const deps: DependenciasCodigo = { obtenerAuth: async () => auth, storage, ahora: () => ahora, alIngresar };
  return { auth, storage, alIngresar, deps, avanzar: (ms: number) => (ahora += ms) };
}

const OTP_EXPIRED: ErrorAuth = { status: 403, code: 'otp_expired', name: 'AuthApiError', message: 'Token has expired or is invalid' };

describe('pedirCodigo (WEB-02, CA-44)', () => {
  it('WEB_02_pide_el_codigo_con_el_token_del_captcha_y_guarda_la_hora', async () => {
    const { auth, storage, deps } = preparar();
    const r = await pedirCodigo({ mail: '  ana@example.test ', captchaToken: 'XXXX.DUMMY.TOKEN.XXXX' }, deps);
    expect(r).toEqual({ ok: true });
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'ana@example.test',
      options: { shouldCreateUser: true, captchaToken: 'XXXX.DUMMY.TOKEN.XXXX' },
    });
    expect(storage.datos.get(CLAVE_PEDIDO)).toBe(String(T0));
  });

  it('CA_44_sin_token_del_captcha_no_llama_a_auth', async () => {
    const { auth, storage, deps } = preparar();
    for (const captchaToken of [null, '', '   ']) {
      const r = await pedirCodigo({ mail: 'ana@example.test', captchaToken }, deps);
      expect(r).toEqual({ ok: false, error: 'captcha_pendiente', mensaje: MENSAJES_PEDIDO.captcha_pendiente });
    }
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
    expect(storage.datos.has(CLAVE_PEDIDO)).toBe(false);
  });

  it('CA_44_captcha_rechazado_por_auth_se_muestra_aparte_de_H_021', async () => {
    const { storage, deps } = preparar({
      errorOtp: { status: 400, code: 'captcha_failed', message: 'captcha protection: request disallowed (timeout-or-duplicate)' },
    });
    const r = await pedirCodigo({ mail: 'ana@example.test', captchaToken: 'usado' }, deps);
    expect(r).toEqual({ ok: false, error: 'captcha', mensaje: MENSAJES_PEDIDO.captcha });
    expect(storage.datos.has(CLAVE_PEDIDO)).toBe(false);
    // Sin `code` (GoTrue viejo) también se reconoce por el texto.
    expect(clasificarErrorPedido({ status: 400, message: 'captcha protection: request disallowed' })).toBe('captcha');
  });

  it('H_021_reenvio_antes_de_60_s_da_429_y_dice_esperar_un_minuto', async () => {
    const { storage, deps } = preparar({ errorOtp: { status: 429, code: 'over_email_send_rate_limit' } });
    storage.setItem(CLAVE_PEDIDO, String(T0 - 10_000));
    const r = await pedirCodigo({ mail: 'ana@example.test', captchaToken: 'tok' }, deps);
    expect(r).toEqual({ ok: false, error: 'esperar_reenvio', mensaje: 'Esperá un minuto para pedir otro código.' });
    // La hora del pedido anterior no se pisa: el código anterior sigue valiendo.
    expect(storage.datos.get(CLAVE_PEDIDO)).toBe(String(T0 - 10_000));
  });

  it('WEB_02_mail_invalido_no_llama_a_auth', async () => {
    const { auth, deps } = preparar();
    const r = await pedirCodigo({ mail: 'no-es-mail', captchaToken: 'tok' }, deps);
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ error: 'mail_invalido' });
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
    expect(normalizarMail(' a@b.co ')).toBe('a@b.co');
  });

  it('WEB_02_errores_de_red_y_desconocidos_dan_mensajes_del_catalogo', async () => {
    expect(clasificarErrorPedido({ status: 0, name: 'AuthRetryableFetchError' })).toBe('sin_conexion');
    expect(clasificarErrorPedido({ status: 422, code: 'email_address_invalid' })).toBe('mail_invalido');
    expect(clasificarErrorPedido({ status: 500, code: 'unexpected_failure', message: 'boom' })).toBe('otro');
    const { deps } = preparar();
    deps.obtenerAuth = async () => {
      throw new Error('Failed to fetch');
    };
    const r = await pedirCodigo({ mail: 'ana@example.test', captchaToken: 'tok' }, deps);
    expect(r).toEqual({ ok: false, error: 'sin_conexion', mensaje: MENSAJES_PEDIDO.sin_conexion });
  });

  it('H_021_ms_para_reenviar_cuenta_60_s_desde_el_pedido', () => {
    const s = almacen();
    expect(msParaReenviar(s, T0)).toBe(0);
    s.setItem(CLAVE_PEDIDO, String(T0));
    expect(msParaReenviar(s, T0 + 15_000)).toBe(45_000);
    expect(msParaReenviar(s, T0 + 60_000)).toBe(0);
    s.setItem(CLAVE_PEDIDO, 'basura');
    expect(msParaReenviar(s, T0)).toBe(0);
  });
});

describe('verificarCodigo (WEB-02, H-021)', () => {
  it('WEB_02_codigo_correcto_entra_olvida_la_hora_y_refresca_la_sesion', async () => {
    const { auth, storage, alIngresar, deps } = preparar();
    storage.setItem(CLAVE_PEDIDO, String(T0));
    const r = await verificarCodigo({ mail: 'ana@example.test', codigo: ' 123 456 ' }, deps);
    expect(r).toEqual({ ok: true });
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'ana@example.test', token: '123456', type: 'email' });
    expect(storage.datos.has(CLAVE_PEDIDO)).toBe(false);
    expect(alIngresar).toHaveBeenCalledOnce();
  });

  it('H_021_otp_expired_antes_de_600_s_es_incorrecto', async () => {
    const { storage, alIngresar, deps, avanzar } = preparar({ errorVerificar: OTP_EXPIRED });
    storage.setItem(CLAVE_PEDIDO, String(T0));
    avanzar(599_999);
    const r = await verificarCodigo({ mail: 'ana@example.test', codigo: '000000' }, deps);
    expect(r).toEqual({ ok: false, error: 'incorrecto', mensaje: MENSAJES_VERIFICACION.incorrecto });
    expect(alIngresar).not.toHaveBeenCalled();
    expect(storage.datos.has(CLAVE_PEDIDO)).toBe(true);
  });

  it('H_021_otp_expired_a_los_600_s_o_mas_es_vencido', async () => {
    const { storage, deps, avanzar } = preparar({ errorVerificar: OTP_EXPIRED });
    storage.setItem(CLAVE_PEDIDO, String(T0));
    avanzar(600_000);
    const r = await verificarCodigo({ mail: 'ana@example.test', codigo: '123456' }, deps);
    expect(r).toEqual({ ok: false, error: 'vencido', mensaje: 'El código venció. Pedí uno nuevo.' });
  });

  it('H_021_incorrecto_y_vencido_tienen_mensajes_distintos', () => {
    expect(MENSAJES_VERIFICACION.incorrecto).not.toBe(MENSAJES_VERIFICACION.vencido);
    expect(clasificarErrorVerificacion(OTP_EXPIRED, null, T0)).toBe('incorrecto_o_vencido');
    expect(clasificarErrorVerificacion({ status: 403 }, T0, T0 + 1)).toBe('incorrecto');
    expect(clasificarErrorVerificacion({ status: 429, code: 'over_request_rate_limit' }, T0, T0)).toBe(
      'demasiados_intentos',
    );
    expect(clasificarErrorVerificacion({ status: 0 }, T0, T0)).toBe('sin_conexion');
    expect(clasificarErrorVerificacion({ status: 500 }, T0, T0)).toBe('otro');
  });

  it('WEB_02_codigo_con_formato_invalido_no_llama_a_auth', async () => {
    const { auth, deps } = preparar();
    for (const codigo of ['12345', '1234567', 'abcdef', '']) {
      const r = await verificarCodigo({ mail: 'ana@example.test', codigo }, deps);
      expect(r).toMatchObject({ ok: false, error: 'codigo_invalido' });
    }
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it('WEB_02_verificar_sin_red_da_sin_conexion', async () => {
    const { deps } = preparar();
    deps.obtenerAuth = async () => {
      throw new TypeError('Failed to fetch');
    };
    const r = await verificarCodigo({ mail: 'ana@example.test', codigo: '123456' }, deps);
    expect(r).toMatchObject({ ok: false, error: 'sin_conexion' });
  });
});
