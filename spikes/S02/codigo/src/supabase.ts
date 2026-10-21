import { createClient } from '@supabase/supabase-js';

// detectSessionInUrl: false porque el canje lo hace procesarRetorno con exchangeCodeForSession;
// con true, supabase-js canjea solo al inicializar y un segundo canje falla (ver resultado.md).
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
  auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true },
});
