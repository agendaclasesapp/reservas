// Variante V2: la agenda pública usa solo postgrest-js (anon); supabase-js completo se carga aparte.
import { PostgrestClient } from '@supabase/postgrest-js';

const URL_BASE = import.meta.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:57421';
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'clave-anon-local';
export const rest = new PostgrestClient(`${URL_BASE}/rest/v1`, { headers: { apikey: ANON } });
export const cargarSupabase = () => import('./supabase').then((m) => m.supabase);
