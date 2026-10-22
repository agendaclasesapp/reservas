// Arranque de la sesión (ADR-007). src/main.tsx espera iniciarSesion() antes de createHashRouter.
// - Con `code` o `error_description` en la URL (vuelta de Google): carga supabase-js, canjea con
//   `exchangeCodeForSession(code)` explícito, limpia la query y deja en el hash la ruta guardada.
// - Sin ellos y con una sesión guardada (H-020): la valida con `getUser()`, que va al servidor; si el
//   usuario ya no existe o el token no vale, `signOut({ scope: 'local' })` y la app sigue como
//   visitante. `getSession()` solo no basta: lee el almacenamiento del navegador.
// - Sin retorno ni sesión guardada vuelve en el acto, sin cargar supabase-js (ADR-017).
import { cargarSupabase } from '../lib/supabase';
import { procesarRetorno, SIN_RETORNO, traeRetorno, type CanjeadorDeCodigo, type Retorno } from './retorno';
import { haySesionGuardadaEnNavegador, refrescarSesion } from './sesion-actual';
import type { ErrorAuth } from './tipos';

/** Texto para el error de la vuelta de Google o del canje; nunca el texto crudo (SEC-17). */
export const MENSAJE_RETORNO_GOOGLE = 'No pudimos completar el ingreso con Google. Probá de nuevo.';

/** Lo que la validación de H-020 usa de `supabase.auth`. */
export interface ValidadorDeSesion {
  getUser(): Promise<{ data: { user: unknown }; error: ErrorAuth | null }>;
  signOut(opciones: { scope: 'local' }): Promise<{ error: unknown }>;
}

export interface DependenciasSesion {
  href: string;
  history: Pick<History, 'replaceState'>;
  storage: Pick<Storage, 'getItem' | 'removeItem'>;
  cargarAuth: () => Promise<CanjeadorDeCodigo>;
  /** H-020: true si hay una sesión de supabase-js guardada en el navegador. Por defecto, no. */
  haySesionGuardada?: () => boolean;
  cargarValidador?: () => Promise<ValidadorDeSesion>;
  /** Después de canjear o validar: refresca el estado de la app sin esperar. */
  alCambiarSesion?: () => void;
}

function dependenciasDelNavegador(): DependenciasSesion {
  return {
    href: window.location.href,
    history: window.history,
    storage: window.sessionStorage,
    cargarAuth: () => cargarSupabase().then((s) => s.auth),
    haySesionGuardada: haySesionGuardadaEnNavegador,
    cargarValidador: () => cargarSupabase().then((s) => s.auth),
    alCambiarSesion: () => void refrescarSesion(),
  };
}

let errorPendiente: string | null = null;

/** Error de la vuelta de Google para mostrar una vez en la pantalla de ingreso (y olvidarlo). */
export function tomarErrorDeIngreso(): string | null {
  const error = errorPendiente;
  errorPendiente = null;
  return error;
}

/**
 * H-020: true si la sesión guardada sigue valiendo. Una respuesta 4xx de Auth (usuario borrado,
 * token inválido, sesión inexistente) la cierra en este navegador; un fallo de red la conserva.
 */
export async function validarSesionGuardada(auth: ValidadorDeSesion): Promise<boolean> {
  let rechazada: boolean;
  try {
    const { data, error } = await auth.getUser();
    const status = error?.status ?? 0;
    rechazada = error ? status >= 400 && status < 500 : data.user === null || data.user === undefined;
  } catch {
    return true;
  }
  if (!rechazada) return true;
  try {
    await auth.signOut({ scope: 'local' });
  } catch {
    // Sin red el cierre local igual borra el almacenamiento en supabase-js; nada más que hacer.
  }
  return false;
}

export async function iniciarSesion(deps: DependenciasSesion = dependenciasDelNavegador()): Promise<Retorno> {
  if (traeRetorno(deps.href)) {
    const auth = await deps.cargarAuth();
    const retorno = await procesarRetorno({ auth, href: deps.href, history: deps.history, storage: deps.storage });
    if (retorno.error !== null) errorPendiente = MENSAJE_RETORNO_GOOGLE;
    deps.alCambiarSesion?.();
    return retorno;
  }
  if (!(deps.haySesionGuardada?.() ?? false) || deps.cargarValidador === undefined) return SIN_RETORNO;
  const valida = await validarSesionGuardada(await deps.cargarValidador());
  deps.alCambiarSesion?.();
  return valida ? SIN_RETORNO : { ...SIN_RETORNO, sesionCerrada: true };
}
