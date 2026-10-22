// API de la lógica de ingreso para las vistas (T04.2) y las pruebas (T04.4). ALU-01, WEB-02, H-021.
//
// Uso típico en la vista:
//   const r = await pedirCodigo({ mail, captchaToken });   // reiniciar el widget después, siempre
//   const r = await verificarCodigo({ mail, codigo });     // ok → navigate(destinoTrasIngreso(search))
//   await ingresarConGoogle({ busqueda: search });         // sin CAPTCHA
//   const error = tomarErrorDeIngreso();                   // error de la vuelta de Google, una vez
import { cargarSupabase } from '../../../lib/supabase';
import { refrescarSesion } from '../../../estado/sesion-actual';
import * as codigo from './codigo';
import * as google from './google';

export {
  CLAVE_PEDIDO,
  clasificarErrorPedido,
  clasificarErrorVerificacion,
  ESPERA_REENVIO_MS,
  horaDelPedido,
  LARGO_CODIGO,
  MENSAJES_PEDIDO,
  MENSAJES_VERIFICACION,
  normalizarCodigo,
  normalizarMail,
  VIGENCIA_CODIGO_MS,
} from './codigo';
export type {
  AuthCodigo,
  DependenciasCodigo,
  ErrorPedido,
  ErrorVerificacion,
  Resultado,
} from './codigo';
export { destinoTrasIngreso, hashTrasIngreso, MENSAJES_GOOGLE } from './google';
export type { AuthGoogle, DependenciasGoogle, ErrorGoogle } from './google';
export { MENSAJE_RETORNO_GOOGLE, tomarErrorDeIngreso } from '../../../estado/sesion';

/** Dependencias reales: supabase-js cargado con import() (ADR-017), sessionStorage y la hora local. */
export function dependenciasCodigo(): codigo.DependenciasCodigo {
  return {
    obtenerAuth: () => cargarSupabase().then((s) => s.auth),
    storage: window.sessionStorage,
    ahora: () => Date.now(),
    alIngresar: () => refrescarSesion(),
  };
}

export function dependenciasGoogle(): google.DependenciasGoogle {
  return {
    obtenerAuth: () => cargarSupabase().then((s) => s.auth),
    storage: window.sessionStorage,
    redirectTo: window.location.origin + import.meta.env.BASE_URL,
  };
}

/** Pide el código de 6 dígitos con el token de Turnstile (WEB-02, CA-44). */
export function pedirCodigo(
  entrada: { mail: string; captchaToken: string | null },
  deps: codigo.DependenciasCodigo = dependenciasCodigo(),
): Promise<codigo.Resultado<codigo.ErrorPedido>> {
  return codigo.pedirCodigo(entrada, deps);
}

/** Verifica el código; distingue incorrecto y vencido por la hora del pedido (H-021). */
export function verificarCodigo(
  entrada: { mail: string; codigo: string },
  deps: codigo.DependenciasCodigo = dependenciasCodigo(),
): Promise<codigo.Resultado<codigo.ErrorVerificacion>> {
  return codigo.verificarCodigo(entrada, deps);
}

/** Milisegundos que faltan para poder pedir otro código (0 = ya se puede). */
export function msParaReenviar(
  storage: Pick<Storage, 'getItem'> = window.sessionStorage,
  ahoraMs: number = Date.now(),
): number {
  return codigo.msParaReenviar(storage, ahoraMs);
}

/** Sale hacia Google guardando la ruta de `?volver=` (ADR-007). */
export function ingresarConGoogle(
  entrada: { busqueda: string },
  deps: google.DependenciasGoogle = dependenciasGoogle(),
): Promise<codigo.Resultado<google.ErrorGoogle>> {
  return google.ingresarConGoogle(entrada, deps);
}
