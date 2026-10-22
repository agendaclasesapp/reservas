// Ingreso con código de 6 dígitos por mail (ALU-01, WEB-02; ADR-007, ADR-016; contratos.md §5).
// Base probada: spikes/S02/codigo/src/codigo.ts.
//
// - Pedido: `signInWithOtp` con `options.captchaToken` de Turnstile (CR-001, CA-44). Sin token no se
//   llama a Auth. El rechazo del CAPTCHA (`captcha_failed`) se clasifica aparte de H-021.
// - H-021: GoTrue responde `403 otp_expired` igual para un código incorrecto, vencido o ya usado. La
//   SPA guarda la hora del pedido y decide: >= 600 s (otp_expiry, DEC-11) → vencido; si no →
//   incorrecto. El reenvío antes de 60 s da `429 over_email_send_rate_limit` → «esperá un minuto».
import { z } from 'zod';
import { MENSAJE_GENERICO, MENSAJE_SIN_CONEXION } from '../../../lib/errores';
import type { ErrorAuth } from '../../../estado/tipos';

/** Vigencia del código (`otp_expiry = 600`, DEC-11). */
export const VIGENCIA_CODIGO_MS = 600_000;
/** Espera mínima entre pedidos (`max_frequency = "60s"`). */
export const ESPERA_REENVIO_MS = 60_000;
/** Hora del último pedido aceptado, en ms (sessionStorage). */
export const CLAVE_PEDIDO = 'rtc.codigo-pedido-en';
export const LARGO_CODIGO = 6;

export type ErrorPedido =
  | 'mail_invalido'
  | 'captcha_pendiente'
  | 'captcha'
  | 'esperar_reenvio'
  | 'sin_conexion'
  | 'otro';

export type ErrorVerificacion =
  | 'codigo_invalido'
  | 'incorrecto'
  | 'vencido'
  | 'incorrecto_o_vencido'
  | 'demasiados_intentos'
  | 'sin_conexion'
  | 'otro';

export type Resultado<E extends string> = { ok: true } | { ok: false; error: E; mensaje: string };

export const MENSAJES_PEDIDO: Readonly<Record<ErrorPedido, string>> = {
  mail_invalido: 'Revisá el mail: no parece válido.',
  captcha_pendiente: 'Resolvé el desafío para pedir el código.',
  captcha: 'No pudimos comprobar el desafío. Resolvelo de nuevo y volvé a pedir el código.',
  esperar_reenvio: 'Esperá un minuto para pedir otro código.',
  sin_conexion: MENSAJE_SIN_CONEXION,
  otro: MENSAJE_GENERICO,
};

export const MENSAJES_VERIFICACION: Readonly<Record<ErrorVerificacion, string>> = {
  codigo_invalido: 'El código tiene 6 dígitos.',
  incorrecto: 'El código no es correcto. Revisalo y probá de nuevo.',
  vencido: 'El código venció. Pedí uno nuevo.',
  incorrecto_o_vencido: 'El código no es correcto o ya venció. Revisalo o pedí uno nuevo.',
  demasiados_intentos: 'Hiciste demasiados intentos. Esperá unos minutos y probá de nuevo.',
  sin_conexion: MENSAJE_SIN_CONEXION,
  otro: MENSAJE_GENERICO,
};

/** Lo que el ingreso por código usa de `supabase.auth`. */
export interface AuthCodigo {
  signInWithOtp(credenciales: {
    email: string;
    options: { shouldCreateUser: boolean; captchaToken: string };
  }): Promise<{ error: ErrorAuth | null }>;
  verifyOtp(credenciales: { email: string; token: string; type: 'email' }): Promise<{ error: ErrorAuth | null }>;
}

export interface DependenciasCodigo {
  obtenerAuth: () => Promise<AuthCodigo>;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  /** Hora del navegador en ms. */
  ahora: () => number;
  /** Se llama tras un ingreso correcto (refresca la sesión de la app). */
  alIngresar: () => Promise<unknown>;
}

const esquemaMail = z.email();
const CODIGO_VALIDO = /^\d{6}$/;

/** Normaliza el mail escrito (espacios alrededor); null si no es un mail. */
export function normalizarMail(mail: string): string | null {
  const limpio = mail.trim();
  return esquemaMail.safeParse(limpio).success ? limpio : null;
}

/** Quita espacios y guiones que la persona pudo copiar del mail. */
export function normalizarCodigo(codigo: string): string {
  return codigo.replace(/[\s-]/g, '');
}

function esSinConexion(error: ErrorAuth): boolean {
  return error.status === 0 || (error.name === 'AuthRetryableFetchError' && error.status === undefined);
}

/** Clasifica el error de `signInWithOtp` (CA-44, H-021). */
export function clasificarErrorPedido(error: ErrorAuth): ErrorPedido {
  if (error.status === 429) return 'esperar_reenvio';
  if (error.code === 'captcha_failed' || /captcha/i.test(error.message ?? '')) return 'captcha';
  if (error.code === 'email_address_invalid' || error.code === 'validation_failed') return 'mail_invalido';
  if (esSinConexion(error)) return 'sin_conexion';
  return 'otro';
}

/**
 * H-021: clasifica el error de `verifyOtp` con la hora del pedido. Sin hora guardada (otra pestaña)
 * no se puede distinguir y se dice las dos cosas.
 */
export function clasificarErrorVerificacion(
  error: ErrorAuth,
  pedidoEnMs: number | null,
  ahoraMs: number,
): ErrorVerificacion {
  if (error.status === 429) return 'demasiados_intentos';
  if (error.code === 'otp_expired' || (error.status === 403 && error.code === undefined)) {
    if (pedidoEnMs === null) return 'incorrecto_o_vencido';
    return ahoraMs - pedidoEnMs >= VIGENCIA_CODIGO_MS ? 'vencido' : 'incorrecto';
  }
  if (esSinConexion(error)) return 'sin_conexion';
  return 'otro';
}

/** Hora del último pedido aceptado, o null. */
export function horaDelPedido(storage: Pick<Storage, 'getItem'>): number | null {
  const valor = Number(storage.getItem(CLAVE_PEDIDO) ?? Number.NaN);
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

/** Milisegundos que faltan para poder pedir otro código (0 = ya se puede). */
export function msParaReenviar(storage: Pick<Storage, 'getItem'>, ahoraMs: number): number {
  const pedido = horaDelPedido(storage);
  if (pedido === null) return 0;
  return Math.max(0, pedido + ESPERA_REENVIO_MS - ahoraMs);
}

function fallo<E extends string>(error: E, mensajes: Readonly<Record<E, string>>): Resultado<E> {
  return { ok: false, error, mensaje: mensajes[error] };
}

/**
 * Pide el código (alta e ingreso son lo mismo para Auth). `captchaToken` es el del widget de
 * Turnstile, de un solo uso: la vista lo reinicia después de cada llamada, salga bien o mal.
 * La respuesta es la misma para un mail conocido o desconocido.
 */
export async function pedirCodigo(
  entrada: { mail: string; captchaToken: string | null },
  deps: DependenciasCodigo,
): Promise<Resultado<ErrorPedido>> {
  const mail = normalizarMail(entrada.mail);
  if (mail === null) return fallo('mail_invalido', MENSAJES_PEDIDO);
  const token = entrada.captchaToken?.trim() ?? '';
  if (token === '') return fallo('captcha_pendiente', MENSAJES_PEDIDO);
  try {
    const auth = await deps.obtenerAuth();
    const { error } = await auth.signInWithOtp({
      email: mail,
      options: { shouldCreateUser: true, captchaToken: token },
    });
    if (error) return fallo(clasificarErrorPedido(error), MENSAJES_PEDIDO);
  } catch {
    return fallo('sin_conexion', MENSAJES_PEDIDO);
  }
  deps.storage.setItem(CLAVE_PEDIDO, String(deps.ahora()));
  return { ok: true };
}

/** Verifica el código; si entra, olvida la hora del pedido y refresca la sesión de la app. */
export async function verificarCodigo(
  entrada: { mail: string; codigo: string },
  deps: DependenciasCodigo,
): Promise<Resultado<ErrorVerificacion>> {
  const mail = normalizarMail(entrada.mail);
  const codigo = normalizarCodigo(entrada.codigo);
  if (mail === null || !CODIGO_VALIDO.test(codigo)) return fallo('codigo_invalido', MENSAJES_VERIFICACION);
  try {
    const auth = await deps.obtenerAuth();
    const { error } = await auth.verifyOtp({ email: mail, token: codigo, type: 'email' });
    if (error) {
      const tipo = clasificarErrorVerificacion(error, horaDelPedido(deps.storage), deps.ahora());
      return fallo(tipo, MENSAJES_VERIFICACION);
    }
  } catch {
    return fallo('sin_conexion', MENSAJES_VERIFICACION);
  }
  deps.storage.removeItem(CLAVE_PEDIDO);
  await deps.alIngresar();
  return { ok: true };
}
