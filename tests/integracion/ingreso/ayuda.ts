// Ayudas de las pruebas de ingreso (B04): usuarios de Auth como los deja GoTrue, almacenamiento en memoria y
// limpieza. Datos sintéticos (@example.test, NFR-02).
import { randomUUID } from 'node:crypto';
import { sql } from '../../soporte/bd';
import { limpiarReloj } from '../../soporte/reloj';

/** Inserta un usuario en auth.users con las columnas de token en '' (como GoTrue). */
export async function crearUsuarioAuth(opciones: { mail: string; confirmado: boolean; meta?: Record<string, unknown> }): Promise<string> {
  const id = randomUUID();
  await sql(
    `insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at,
                             confirmation_token, recovery_token, email_change_token_new, email_change, raw_user_meta_data)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
             case when $3::boolean then now() end, now(), now(), '', '', '', '', $4::jsonb)`,
    [id, opciones.mail, opciones.confirmado, JSON.stringify(opciones.meta ?? {})],
  );
  return id;
}

export async function confirmarUsuarioAuth(id: string): Promise<void> {
  await sql('update auth.users set email_confirmed_at = now() where id = $1', [id]);
}

export async function alumnoDe(userId: string) {
  const f = await sql<{ id: string; estado: string; nombre: string | null; mail: string | null }>(
    'select id, estado, nombre, mail::text as mail from public.alumno where user_id = $1',
    [userId],
  );
  return f[0] ?? null;
}

/** Borra usuarios de prueba y lo que cuelga de ellos (por mail). */
export async function borrarPorMail(mails: string[]): Promise<void> {
  if (mails.length === 0) return;
  // B05 (502): completar la ficha avisa al profesor con `alumno_id`; esos mails cuelgan del alumno (FK) y del tope horario.
  await sql('delete from public.mail_salida where alumno_id in (select id from public.alumno where lower(mail::text) = any($1::text[]))', [mails.map((m) => m.toLowerCase())]);
  await sql('delete from public.persona_a_cargo where alumno_id in (select id from public.alumno where lower(mail::text) = any($1::text[]))', [mails.map((m) => m.toLowerCase())]);
  await sql('delete from public.alumno where lower(mail::text) = any($1::text[])', [mails.map((m) => m.toLowerCase())]);
  await sql('delete from auth.users where lower(email) = any($1::text[])', [mails.map((m) => m.toLowerCase())]);
}

/** Higiene del reloj: se restaura siempre al terminar cada prueba. */
export const restaurarReloj = limpiarReloj;

export function almacenamientoEnMemoria(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}
