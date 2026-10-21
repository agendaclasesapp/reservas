// Variables públicas de la SPA (DEC-14, DEC-17 opción A). Solo VITE_* públicas: URL y clave anon.
import { origenConexion } from './csp';

export interface Entorno {
  /** URL de Supabase sin barra final, p. ej. https://<ref>.supabase.co */
  supabaseUrl: string;
  /** Clave anon (pública). Nunca la de servicio (NFR-02). */
  supabaseAnonKey: string;
}

export class ErrorDeConfiguracion extends Error {
  override name = 'ErrorDeConfiguracion';
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : '';
}

/** Valida las variables; los mensajes nombran la variable, nunca su valor. */
export function leerEnv(fuente: Record<string, unknown>): Entorno {
  const url = texto(fuente.VITE_SUPABASE_URL);
  const clave = texto(fuente.VITE_SUPABASE_ANON_KEY);
  if (url === '') throw new ErrorDeConfiguracion('Falta VITE_SUPABASE_URL.');
  if (clave === '') throw new ErrorDeConfiguracion('Falta VITE_SUPABASE_ANON_KEY.');
  try {
    origenConexion(url);
  } catch (e) {
    throw new ErrorDeConfiguracion((e as Error).message);
  }
  return { supabaseUrl: url.replace(/\/+$/, ''), supabaseAnonKey: clave };
}

let cache: Entorno | undefined;

/** Entorno de la compilación actual (import.meta.env), validado una vez. */
export function entorno(): Entorno {
  cache ??= leerEnv(import.meta.env);
  return cache;
}
