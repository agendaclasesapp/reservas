// Cliente supabase-js con PKCE (ADR-007). Este módulo solo se carga con import() desde supabase.ts
// (ADR-017): supabase-js no entra en la ruta de agenda.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { entorno, type Entorno } from './env';

// detectSessionInUrl: false porque el canje lo hace iniciarSesion() con exchangeCodeForSession;
// con true, supabase-js canjea solo al inicializar y el segundo canje falla (S02).
export const OPCIONES_AUTH = {
  flowType: 'pkce',
  detectSessionInUrl: false,
  persistSession: true,
} as const;

export function crearCliente(env: Entorno = entorno()): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { ...OPCIONES_AUTH } });
}
