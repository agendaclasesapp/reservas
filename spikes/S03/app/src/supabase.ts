import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:57421',
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'clave-anon-local',
  { auth: { flowType: 'pkce' } },
);
