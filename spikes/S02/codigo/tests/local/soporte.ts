// Soporte de las pruebas contra el stack local del spike (supabase start + scripts/env-local.mjs).
import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import pg from 'pg';
import { loadEnv } from 'vite';

export const env = loadEnv('development', process.cwd(), '');

export const db = new pg.Client({ connectionString: env.S02_DB_URL });

export async function sql<T extends pg.QueryResultRow = Record<string, unknown>>(texto: string, params: unknown[] = []) {
  return (await db.query<T>(texto, params)).rows;
}

function memoria(): SupportedStorage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      m.set(k, v);
    },
    removeItem: (k) => {
      m.delete(k);
    },
  };
}

/** Cliente como el de la SPA (PKCE) pero con almacenamiento en memoria. */
export function cliente() {
  return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storage: memoria() },
  });
}

export function mailUnico(prefijo: string) {
  return `${prefijo}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@rtc.test`;
}

export interface Mail {
  Subject: string;
  HTML: string;
  Text: string;
}

/** Espera el mail número `n` (1 = el primero) dirigido a `to` y lo devuelve con su código. */
export async function esperarMail(to: string, n = 1): Promise<Mail & { codigo: string | null }> {
  for (let i = 0; i < 40; i++) {
    const r = await fetch(`${env.S02_MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages } = (await r.json()) as { messages: { ID: string }[] };
    if (messages.length >= n) {
      // Mailpit ordena del más nuevo al más viejo.
      const id = messages[messages.length - n].ID;
      const m = (await (await fetch(`${env.S02_MAILPIT_URL}/api/v1/message/${id}`)).json()) as Mail;
      return { ...m, codigo: /\b(\d{6})\b/.exec(m.Text)?.[1] ?? null };
    }
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error(`No llegó el mail ${n} a ${to}`);
}

export async function traza(userId: string) {
  return sql<{ disparador: string; operacion: string; confirmado: boolean; accion: string }>(
    'select disparador, operacion, confirmado, accion from privado.traza_trigger where user_id = $1 order by id',
    [userId],
  );
}

export async function usuario(email: string) {
  const [u] = await sql<{ id: string; email_confirmed_at: Date | null; last_sign_in_at: Date | null }>(
    'select id, email_confirmed_at, last_sign_in_at from auth.users where email = $1',
    [email],
  );
  return u;
}

export async function alumnoDe(userId: string) {
  return sql<{ id: string; nombre: string | null; estado: string; ultimo_ingreso: Date | null }>(
    'select id, nombre, estado, ultimo_ingreso from public.alumno where user_id = $1',
    [userId],
  );
}

/** Corre el reloj de GoTrue hacia atrás para un usuario: simula que el código se envió hace `seg` segundos. */
export async function envejecerEnvio(email: string, seg: number) {
  await sql(
    `update auth.users
        set confirmation_sent_at = case when confirmation_sent_at is null then null else now() - make_interval(secs => $2) end,
            recovery_sent_at = case when recovery_sent_at is null then null else now() - make_interval(secs => $2) end
      where email = $1`,
    [email, seg],
  );
}
