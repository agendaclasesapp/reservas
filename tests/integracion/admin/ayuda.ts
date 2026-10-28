// Apoyo de las pruebas de B15 (T15.3): llamadas con el token de una persona recién dada de alta, filas sintéticas con
// mail `t15.*` y slug `t15-*` que cada prueba limpia, y registro de la entrada y la salida de cada caso. Solo @example.test (NFR-02).
import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from '../../soporte/bd';
import { entorno, RAIZ } from '../../soporte/entorno';
import { sesionDe, type RespuestaApi } from '../../soporte/usuarios';

export const MAIL_PREFIJO = 't15.';
export const SLUG_PREFIJO = 't15-';

export const mailT15 = (etiqueta: string) => `${MAIL_PREFIJO}${etiqueta}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.test`;

/** Slug único de `largo` caracteres (3 a 30) con el prefijo t15-. */
export function slugT15(largo = 14): string {
  const base = `${SLUG_PREFIJO}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  return base.length >= largo ? base.slice(0, largo).replace(/-$/, 'x') : base + 'x'.repeat(largo - base.length);
}

/** POST /rest/v1/rpc/<nombre> con un token explícito (la persona dada de alta, que no es un rol de ROLES). */
export async function rpcConToken(token: string, nombre: string, args: Record<string, unknown> = {}): Promise<RespuestaApi> {
  const e = entorno();
  const r = await fetch(`${e.apiUrl}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: { apikey: e.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const texto = await r.text();
  let cuerpo: unknown = texto;
  try {
    cuerpo = texto ? JSON.parse(texto) : null;
  } catch {
    /* no JSON */
  }
  return { status: r.status, cuerpo };
}

export async function restConToken(token: string, ruta: string): Promise<RespuestaApi> {
  const e = entorno();
  const r = await fetch(`${e.apiUrl}/rest/v1/${ruta}`, { headers: { apikey: e.anonKey, Authorization: `Bearer ${token}` } });
  const texto = await r.text();
  return { status: r.status, cuerpo: texto ? JSON.parse(texto) : null };
}

/** Llamada anónima a una RPC pública (el enlace del profesor). */
export async function rpcAnon(nombre: string, args: Record<string, unknown>) {
  const e = entorno();
  const r = await fetch(`${e.apiUrl}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: { apikey: e.anonKey, Authorization: `Bearer ${e.anonKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const texto = await r.text();
  return { status: r.status, texto, cuerpo: texto ? JSON.parse(texto) : null };
}

export const cuerpoDe = (r: { cuerpo: unknown }) => r.cuerpo as Record<string, unknown>;

/** Alta de profesor con la sesión del Administrador. */
export const alta = (mail: string, nombre: string, slug: string) => rpcAdmin('alta_profesor', { p_mail: mail, p_nombre: nombre, p_slug: slug });

async function rpcAdmin(nombre: string, args: Record<string, unknown>): Promise<RespuestaApi> {
  const s = await sesionDe('administrador');
  return rpcConToken(s.accessToken, nombre, args);
}
export { rpcAdmin };

/** Huella de lo que cuelga de un profesor (menos `activo`): lo que inactivar no puede cambiar (CA-63). */
export async function fotoDe(profesorId: string): Promise<string> {
  const [f] = await sql<{ h: string }>(
    `select md5(concat_ws('|',
       (select coalesce(jsonb_agg(to_jsonb(i) order by i.alumno_id), '[]') from public.inscripcion i where i.profesor_id = $1),
       (select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]') from public.reserva r where r.profesor_id = $1),
       (select coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]') from public.clase c where c.profesor_id = $1),
       (select coalesce(jsonb_agg(to_jsonb(g) order by g.id), '[]') from public.grilla_tramo g where g.profesor_id = $1),
       (select to_jsonb(x) - 'activo' from public.profesor x where x.id = $1),
       (select count(*) from public.mail_salida m where m.profesor_id = $1))) as h`,
    [profesorId],
  );
  return f.h;
}

/** Borra un profesor de prueba por su enlace, con su grilla y sus mails (nunca A ni B). */
export async function borrarProfesor(slug: string): Promise<void> {
  const ids = `select id from public.profesor where slug = '${slug.replace(/'/g, "''")}'`;
  await sql(`delete from public.mail_salida where profesor_id in (${ids})`);
  await sql(`delete from public.grilla_tramo where profesor_id in (${ids})`);
  await sql(`delete from public.profesor where id in (${ids})`);
}

/** Borra los profesores sintéticos de B15 con todo lo que cuelga de ellos, y sus usuarios de Auth. */
export async function limpiarT15(): Promise<void> {
  const ids = `select id from public.profesor where mail like '${MAIL_PREFIJO}%' or slug like '${SLUG_PREFIJO}%'`;
  await sql(`delete from public.mail_salida where profesor_id in (${ids}) or destinatario like '${MAIL_PREFIJO}%'`);
  await sql(`delete from public.clase where profesor_id in (${ids})`);
  await sql(`delete from public.reserva where profesor_id in (${ids})`);
  await sql(`delete from public.inscripcion where profesor_id in (${ids})`);
  await sql(`delete from public.grilla_tramo where profesor_id in (${ids})`);
  await sql(`delete from public.profesor where id in (${ids})`);
  await sql(`delete from public.alumno where mail like '${MAIL_PREFIJO}%'`);
  await sql(`delete from auth.users where email like '${MAIL_PREFIJO}%'`);
}

/** Deja la entrada usada y la salida obtenida de cada caso en test-results/evidencia-admin.jsonl (sin secretos). */
export function registrar(caso: string, entrada: unknown, salida: unknown): void {
  const dir = resolve(RAIZ, 'test-results');
  mkdirSync(dir, { recursive: true });
  appendFileSync(resolve(dir, 'evidencia-admin.jsonl'), JSON.stringify({ caso, entrada, salida, fecha: new Date().toISOString() }) + '\n');
}
