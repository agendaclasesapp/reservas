// Apoyo de las pruebas de cuentas de B05 (T05.3): alumnos sintéticos con prefijo `T05 ` / `t05.`, limpieza, lector de Mailpit
// por asunto y registro de entrada y salida de cada caso. Solo @example.test (NFR-02).
import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from '../../soporte/bd';
import { entorno, RAIZ } from '../../soporte/entorno';
import { limpiarReloj } from '../../soporte/reloj';
import { SLUG_A, type RespuestaApi } from '../../soporte/usuarios';

export const PREFIJO_NOMBRE = 'T05 ';

export function mailT05(etiqueta: string): string {
  return `t05.${etiqueta}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.test`;
}

export async function profesorId(slug: string = SLUG_A): Promise<string> {
  return (await sql<{ id: string }>('select id from public.profesor where slug = $1', [slug]))[0].id;
}

export interface AlumnoSintetico {
  nombre: string;
  estado: 'pendiente' | 'aprobado' | 'rechazado' | 'sin_cuenta';
  telefono: string;
  fecha_nacimiento?: string;
  mail?: string | null;
}

/**
 * Persona con ficha completa e inscripción con el profesor del slug (B14, DEC-25): el estado del caso es el de la
 * inscripción. La ficha lleva una fecha vieja para no contar en el tope de fichas por hora (ALU-13).
 */
export async function crearAlumno(a: AlumnoSintetico, slug: string = SLUG_A): Promise<string> {
  const p = await profesorId(slug);
  const [f] = await sql<{ id: string }>(
    `insert into public.alumno (estado, nombre, telefono, fecha_nacimiento, mail, ficha_completada_en, ficha_origen_profesor_id, creado_por)
     values ('completa', $1, $2, $3, $4, '2026-01-01T12:00:00Z', $5, $5) returning id`,
    [PREFIJO_NOMBRE + a.nombre, a.telefono, a.fecha_nacimiento ?? '1990-01-01', a.mail ?? null, p],
  );
  await sql('insert into public.inscripcion (alumno_id, profesor_id, estado) values ($1, $2, $3)', [f.id, p, a.estado]);
  return f.id;
}

/** Una reserva suelta con una clase futura confirmada para el alumno (lo que la unión tiene que mover). */
export async function crearClase(alumnoId: string, inicio: string, slug: string = SLUG_A): Promise<string> {
  const [r] = await sql<{ id: string }>(
    `insert into public.reserva (profesor_id, alumno_id, tipo, hora_local, dia_semana, duracion_min, estado, desde, origen)
     values ((select id from public.profesor where slug = $3), $1, 'suelta', '10:00', 4, 60, 'confirmada', ($2::timestamptz)::date, 'profesor') returning id`,
    [alumnoId, inicio, slug],
  );
  const [c] = await sql<{ id: string }>(
    `insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado)
     values ((select id from public.profesor where slug = $4), $1, $2, $3::timestamptz, $3::timestamptz + interval '1 hour', 'confirmada') returning id`,
    [r.id, alumnoId, inicio, slug],
  );
  return c.id;
}

/** Borra todo lo que dejaron las pruebas: alumnos sintéticos, sus clases, mails y usuarios de Auth con mail t05.* */
export async function limpiarT05(): Promise<void> {
  const ids = `select id from public.alumno where nombre like '${PREFIJO_NOMBRE}%' or mail like 't05.%'`;
  await sql(`delete from public.clase where alumno_id in (${ids})`);
  await sql(`delete from public.reserva where alumno_id in (${ids})`);
  await sql(`delete from public.persona_a_cargo where alumno_id in (${ids})`);
  await sql(`delete from public.mail_salida where alumno_id in (${ids})`);
  await sql(`delete from public.inscripcion where alumno_id in (${ids})`);
  await sql(`delete from public.alumno where nombre like '${PREFIJO_NOMBRE}%' or mail like 't05.%'`);
  await sql(`delete from auth.users where email like 't05.%'`);
}

export const restaurarReloj = limpiarReloj;

/** Deja la inscripción con A de la cuenta de prueba `rechazado` como la entrega tests/soporte/usuarios.ts. */
export async function restaurarRechazado(alumnoId: string): Promise<void> {
  await sql(
    `update public.inscripcion set estado = 'rechazado', motivo_estado = 'Motivo de prueba', aprobado_en = null
      where alumno_id = $1 and profesor_id = (select id from public.profesor where slug = $2)`,
    [alumnoId, SLUG_A],
  );
}

/** Inscripción de la persona con el profesor del slug (lo que el caso observa por conexión directa). */
export async function inscripcionDe(alumnoId: string, slug: string = SLUG_A) {
  const f = await sql<{ estado: string; motivo_estado: string | null; como_llego: string | null }>(
    `select i.estado, i.motivo_estado, i.como_llego from public.inscripcion i join public.profesor p on p.id = i.profesor_id
      where i.alumno_id = $1 and p.slug = $2`,
    [alumnoId, slug],
  );
  return f[0] ?? null;
}

export async function rpcCon(token: string, nombre: string, args: Record<string, unknown>): Promise<RespuestaApi> {
  const r = await fetch(`${entorno().apiUrl}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: { apikey: entorno().anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const t = await r.text();
  return { status: r.status, cuerpo: t ? JSON.parse(t) : null };
}

export interface MailPlano {
  Subject: string;
  Text: string;
  To: { Address: string }[];
  From: { Address: string; Name: string };
  ReplyTo: { Address: string; Name: string }[] | null;
}

/** Espera un mail en Mailpit con destinatario y asunto exactos (el asunto puede traer nombres únicos). */
export async function esperarMailConAsunto(para: string, asunto: string, intentos = 120): Promise<MailPlano> {
  const q = encodeURIComponent(`to:"${para}" subject:"${asunto}"`);
  for (let i = 0; i < intentos; i++) {
    const r = (await (await fetch(`${entorno().mailpitUrl}/api/v1/search?query=${q}`)).json()) as { messages: { ID: string }[] };
    if (r.messages.length > 0) return (await (await fetch(`${entorno().mailpitUrl}/api/v1/message/${r.messages[0].ID}`)).json()) as MailPlano;
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error(`No llegó a ${para} un mail con asunto «${asunto}»`);
}

export async function mailsPorAsunto(para: string, asunto: string): Promise<number> {
  const q = encodeURIComponent(`to:"${para}" subject:"${asunto}"`);
  return ((await (await fetch(`${entorno().mailpitUrl}/api/v1/search?query=${q}`)).json()) as { messages: unknown[] }).messages.length;
}

/** Entrada usada y salida obtenida de cada caso: test-results/evidencia-cuentas.jsonl (sin secretos). */
export function registrar(caso: string, entrada: unknown, salida: unknown): void {
  const dir = resolve(RAIZ, 'test-results');
  mkdirSync(dir, { recursive: true });
  appendFileSync(resolve(dir, 'evidencia-cuentas.jsonl'), JSON.stringify({ caso, entrada, salida, fecha: new Date().toISOString() }) + '\n');
}
