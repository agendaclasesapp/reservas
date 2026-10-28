// Estado de la sesión de la app (ADR-007, contratos.md §3 `sesion_actual`). Un solo almacén para
// vistas y guardas de ruta. Sin sesión guardada en el navegador arranca como visitante sin cargar
// supabase-js (ADR-017); con sesión, pide `sesion_actual()` (rol, ficha y vínculos con cada profesor).
import type { SupabaseClient } from '@supabase/supabase-js';
import { entorno } from '../lib/env';
import { traducirError } from '../lib/errores';
import { cargarSupabase } from '../lib/supabase';
import { olvidarProfesorElegido, olvidarProfesorOrigen } from './profesor';
import { leerSesionActual, type EstadoSesion } from './tipos';

export interface DependenciasSesionActual {
  obtenerCliente: () => Promise<SupabaseClient>;
  /** true si el navegador guarda una sesión de supabase-js (sin cargar supabase-js). */
  haySesionGuardada: () => boolean;
}

const VISITANTE: EstadoSesion = Object.freeze({ tipo: 'visitante' });
const CARGANDO: EstadoSesion = Object.freeze({ tipo: 'cargando' });

/** Clave con la que supabase-js guarda la sesión: `sb-<primer tramo del host>-auth-token`. */
export function claveSesionGuardada(supabaseUrl: string): string {
  return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
}

export function haySesionGuardadaEn(storage: Pick<Storage, 'getItem'>, supabaseUrl: string): boolean {
  try {
    return storage.getItem(claveSesionGuardada(supabaseUrl)) !== null;
  } catch {
    return false;
  }
}

export function haySesionGuardadaEnNavegador(): boolean {
  try {
    return haySesionGuardadaEn(window.localStorage, entorno().supabaseUrl);
  } catch {
    return false;
  }
}

const DEL_NAVEGADOR: DependenciasSesionActual = {
  obtenerCliente: () => cargarSupabase(),
  haySesionGuardada: haySesionGuardadaEnNavegador,
};

let deps: DependenciasSesionActual = DEL_NAVEGADOR;
let estado: EstadoSesion | null = null;
let enCurso: Promise<EstadoSesion> | null = null;
let escuchado: SupabaseClient | null = null;
const oyentes = new Set<() => void>();

function fijar(nuevo: EstadoSesion): EstadoSesion {
  estado = nuevo;
  for (const oyente of oyentes) oyente();
  return nuevo;
}

/** Estado actual (estable entre llamadas; apto para `useSyncExternalStore`). */
export function estadoSesion(): EstadoSesion {
  estado ??= deps.haySesionGuardada() ? CARGANDO : VISITANTE;
  return estado;
}

export function suscribirSesion(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/** Si Auth cierra la sesión (token vencido sin renovar, otra pestaña), la app pasa a visitante. */
function escuchar(cliente: SupabaseClient): void {
  if (escuchado === cliente) return;
  escuchado = cliente;
  cliente.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT') fijar(VISITANTE);
  });
}

async function cargar(): Promise<EstadoSesion> {
  if (!deps.haySesionGuardada()) return fijar(VISITANTE);
  // Al refrescar con una sesión ya cargada se conserva la vista hasta tener la respuesta.
  if (estado?.tipo !== 'sesion') fijar(CARGANDO);
  try {
    const cliente = await deps.obtenerCliente();
    escuchar(cliente);
    const { data, error } = await cliente.rpc('sesion_actual');
    if (!error) return fijar({ tipo: 'sesion', sesion: leerSesionActual(data) });
    const traducido = traducirError(error);
    if (traducido.codigo === 'NO_AUTENTICADO') {
      // La sesión no corresponde a ninguna cuenta de la app: se cierra solo en este navegador.
      await cliente.auth.signOut({ scope: 'local' });
      return fijar(VISITANTE);
    }
    return fijar({ tipo: 'error', mensaje: traducido.mensaje });
  } catch (e) {
    return fijar({ tipo: 'error', mensaje: traducirError(e).mensaje });
  }
}

/** Vuelve a leer `sesion_actual()`; llamadas simultáneas comparten la misma lectura. */
export function refrescarSesion(): Promise<EstadoSesion> {
  enCurso ??= cargar().finally(() => {
    enCurso = null;
  });
  return enCurso;
}

/**
 * Cierra la sesión (en el servidor y, si no hay red, al menos en este navegador) y olvida el profesor
 * elegido y el de origen de esta pestaña (ADR-020): la próxima persona arranca sin ellos.
 */
export async function cerrarSesion(): Promise<void> {
  olvidarProfesorElegido();
  olvidarProfesorOrigen();
  try {
    const cliente = await deps.obtenerCliente();
    const { error } = await cliente.auth.signOut();
    if (error) await cliente.auth.signOut({ scope: 'local' });
  } finally {
    fijar(VISITANTE);
  }
}

/** Solo para pruebas: cambia las dependencias y olvida el estado. */
export function configurarSesionActual(nuevas?: Partial<DependenciasSesionActual>): void {
  deps = { ...DEL_NAVEGADOR, ...nuevas };
  estado = null;
  enCurso = null;
  escuchado = null;
  oyentes.clear();
}
