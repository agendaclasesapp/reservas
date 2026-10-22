// Ingreso con Google (ALU-01; ADR-007, contratos.md §5). Sin CAPTCHA (ADR-016).
// Antes de salir guarda la ruta a la que volver (solo `#/…`); al volver, `iniciarSesion()` canjea el
// `?code=` y deja esa ruta en el hash (src/estado/sesion.ts).
import { MENSAJE_GENERICO, MENSAJE_SIN_CONEXION } from '../../../lib/errores';
import { rutaDeVuelta } from '../../../estado/guardas';
import { guardarRuta, RUTA_POR_DEFECTO } from '../../../estado/retorno';
import type { ErrorAuth } from '../../../estado/tipos';
import type { Resultado } from './codigo';

export type ErrorGoogle = 'sin_conexion' | 'otro';

export const MENSAJES_GOOGLE: Readonly<Record<ErrorGoogle, string>> = {
  sin_conexion: MENSAJE_SIN_CONEXION,
  otro: MENSAJE_GENERICO,
};

/** Texto para el error que trajo la vuelta de Google o el canje; nunca el texto crudo (SEC-17). */
export const MENSAJE_RETORNO_GOOGLE = 'No pudimos completar el ingreso con Google. Probá de nuevo.';

export interface AuthGoogle {
  signInWithOAuth(credenciales: {
    provider: 'google';
    options: { redirectTo: string };
  }): Promise<{ error: ErrorAuth | null }>;
}

export interface DependenciasGoogle {
  obtenerAuth: () => Promise<AuthGoogle>;
  storage: Pick<Storage, 'setItem'>;
  /** `origin + BASE_URL`, sin fragmento (ADR-007, DEC-14). */
  redirectTo: string;
}

/**
 * Ruta del router a la que ir después de ingresar con código, a partir del `?volver=` que deja la
 * guarda (`/mis-clases`). Solo rutas propias; si no, `/` (src/estado/guardas.ts).
 */
export function destinoTrasIngreso(busqueda: string): string {
  return rutaDeVuelta(busqueda);
}

/** La misma ruta como hash (`#/mis-clases`), para guardarla antes de salir hacia Google. */
export function hashTrasIngreso(busqueda: string): string {
  const destino = destinoTrasIngreso(busqueda);
  return destino === '/' ? RUTA_POR_DEFECTO : `#${destino}`;
}

/** Sale hacia Google. Si vuelve `{ ok: true }`, el navegador ya está saliendo de la página. */
export async function ingresarConGoogle(
  entrada: { busqueda: string },
  deps: DependenciasGoogle,
): Promise<Resultado<ErrorGoogle>> {
  guardarRuta(deps.storage, hashTrasIngreso(entrada.busqueda));
  try {
    const auth = await deps.obtenerAuth();
    const { error } = await auth.signInWithOAuth({ provider: 'google', options: { redirectTo: deps.redirectTo } });
    if (error) return { ok: false, error: 'otro', mensaje: MENSAJES_GOOGLE.otro };
  } catch {
    return { ok: false, error: 'sin_conexion', mensaje: MENSAJES_GOOGLE.sin_conexion };
  }
  return { ok: true };
}
