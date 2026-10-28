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

/**
 * Persona cargada por un profesor (B14: la persona es única y se inscribe con cada profesor, DEC-25): ficha completa y una
 * inscripción por slug. `con_mail` null la deja sin cuenta ni forma de ingresar.
 */
export async function personaCargada(opciones: { mail: string | null; nombre?: string; inscripciones?: { slug: string; estado: string }[]; telefono?: string }): Promise<string> {
  const [{ id }] = await sql<{ id: string }>(
    `insert into public.alumno (estado, nombre, mail, telefono, fecha_nacimiento, ficha_completada_en, creado_por)
     values ('completa', $1, $2, $3, '1990-01-01', public.app_ahora(), (select id from public.profesor where slug = 'profesor-prueba')) returning id`,
    [opciones.nombre ?? 'Cargada por el profesor', opciones.mail, opciones.telefono ?? '+598 99 555 666'],
  );
  for (const i of opciones.inscripciones ?? [{ slug: 'profesor-prueba', estado: opciones.mail ? 'aprobado' : 'sin_cuenta' }]) {
    await sql("insert into public.inscripcion (alumno_id, profesor_id, estado) values ($1, (select id from public.profesor where slug = $2), $3)", [id, i.slug, i.estado]);
  }
  return id;
}

/** Borra usuarios de prueba y lo que cuelga de ellos (por mail). */
export async function borrarPorMail(mails: string[]): Promise<void> {
  if (mails.length === 0) return;
  // B05 (502): completar la ficha avisa al profesor con `alumno_id`; esos mails cuelgan del alumno (FK) y del tope horario.
  await sql('delete from public.mail_salida where alumno_id in (select id from public.alumno where lower(mail::text) = any($1::text[]))', [mails.map((m) => m.toLowerCase())]);
  await sql('delete from public.inscripcion where alumno_id in (select id from public.alumno where lower(mail::text) = any($1::text[]))', [mails.map((m) => m.toLowerCase())]);
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
