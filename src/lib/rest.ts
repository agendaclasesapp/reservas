// Cliente REST anónimo para la lectura pública (agenda_publica, config_publica), ADR-017.
// No depende de la sesión ni de supabase-js; @supabase/postgrest-js va en la misma versión que la
// que declara supabase-js (un solo ejemplar en el bundle).
import { PostgrestClient } from '@supabase/postgrest-js';
import { entorno, type Entorno } from './env';

/** Los encabezados que supabase-js manda sin sesión: `apikey` y `Authorization` con la clave anon. */
export function encabezadosAnonimos(claveAnon: string): Record<string, string> {
  return { apikey: claveAnon, Authorization: `Bearer ${claveAnon}` };
}

export function crearClienteRest(env: Entorno = entorno(), fetchPropio?: typeof fetch): PostgrestClient {
  return new PostgrestClient(`${env.supabaseUrl}/rest/v1`, {
    headers: encabezadosAnonimos(env.supabaseAnonKey),
    ...(fetchPropio ? { fetch: fetchPropio } : {}),
  });
}

let cliente: PostgrestClient | undefined;

/** Cliente REST anónimo de la app (uno solo). */
export function rest(): PostgrestClient {
  cliente ??= crearClienteRest();
  return cliente;
}
