// Retorno de Google con PKCE a una SPA con rutas hash (ADR-007).
// Google -> Supabase Auth -> origin + BASE_URL + "?code=..." (sin fragmento). Antes de montar el
// router se canjea el código, se limpia la query y se vuelve a la ruta guardada antes de salir.

export const CLAVE_RUTA = 'rtc.ruta-antes-de-ingresar';
export const RUTA_POR_DEFECTO = '#/';

export interface CanjeadorDeCodigo {
  exchangeCodeForSession(code: string): Promise<{ error: { message: string } | null }>;
}

export interface Retorno {
  /** true si la URL traía `code` o `error_description` y se procesó. */
  procesado: boolean;
  canjeado: boolean;
  error: string | null;
  ruta: string | null;
}

export function guardarRuta(storage: Pick<Storage, 'setItem'>, hash: string): void {
  storage.setItem(CLAVE_RUTA, hash.startsWith('#/') ? hash : RUTA_POR_DEFECTO);
}

export async function procesarRetorno(deps: {
  auth: CanjeadorDeCodigo;
  href: string;
  history: Pick<History, 'replaceState'>;
  storage: Pick<Storage, 'getItem' | 'removeItem'>;
}): Promise<Retorno> {
  const url = new URL(deps.href);
  const code = url.searchParams.get('code');
  const errorProveedor = url.searchParams.get('error_description');
  if (code === null && errorProveedor === null) {
    return { procesado: false, canjeado: false, error: null, ruta: null };
  }
  let error: string | null = errorProveedor;
  let canjeado = false;
  if (code !== null && errorProveedor === null) {
    const r = await deps.auth.exchangeCodeForSession(code);
    canjeado = r.error === null;
    error = r.error?.message ?? null;
  }
  const guardada = deps.storage.getItem(CLAVE_RUTA);
  deps.storage.removeItem(CLAVE_RUTA);
  const ruta = guardada !== null && guardada.startsWith('#/') ? guardada : RUTA_POR_DEFECTO;
  // Sin query y con la ruta guardada en el hash, antes de que createHashRouter lea la URL.
  deps.history.replaceState(null, '', url.pathname + ruta);
  return { procesado: true, canjeado, error, ruta };
}
