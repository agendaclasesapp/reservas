// Arranque de la sesión (ADR-007). src/main.tsx espera iniciarSesion() antes de createHashRouter.
// B01: sin `code` ni `error_description` en la URL vuelve en el acto, sin cargar supabase-js
// (ADR-017); con ellos canjea el código y limpia la URL. B04 completa la validación de la sesión
// guardada con getUser() (H-020) y la presentación del error.
import { cargarSupabase } from '../lib/supabase';
import { procesarRetorno, SIN_RETORNO, traeRetorno, type CanjeadorDeCodigo, type Retorno } from './retorno';

export interface DependenciasSesion {
  href: string;
  history: Pick<History, 'replaceState'>;
  storage: Pick<Storage, 'getItem' | 'removeItem'>;
  cargarAuth: () => Promise<CanjeadorDeCodigo>;
}

function dependenciasDelNavegador(): DependenciasSesion {
  return {
    href: window.location.href,
    history: window.history,
    storage: window.sessionStorage,
    cargarAuth: () => cargarSupabase().then((s) => s.auth),
  };
}

export async function iniciarSesion(deps: DependenciasSesion = dependenciasDelNavegador()): Promise<Retorno> {
  if (!traeRetorno(deps.href)) return SIN_RETORNO;
  const auth = await deps.cargarAuth();
  return procesarRetorno({ auth, href: deps.href, history: deps.history, storage: deps.storage });
}
