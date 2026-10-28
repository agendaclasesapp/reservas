// Apoyo de las pruebas de reservas de B06 (T06.3): reloj fijo, limpieza de lo que crean las solicitudes de las sesiones
// compartidas, configuración inicial de los dos profesores y registro de entrada y salida de cada caso.
// Reloj de la aplicación (ADR-014) fijo en lunes 2026-11-02 12:00 de Montevideo. Solo @example.test (NFR-02).
import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from '../../soporte/bd';
import { RAIZ } from '../../soporte/entorno';
import { limpiarReloj, fijarReloj } from '../../soporte/reloj';
import { profesorId, SLUG_A, SLUG_B, type RespuestaApi } from '../../soporte/usuarios';

export const AHORA = '2026-11-02T15:00:00Z'; // lunes 12:00 en Montevideo (-03)
export const PREFIJO_PERSONA = 'T06 ';

/** Inicio de un hueco en hora de Montevideo: `slot('2026-11-04', '10:00')`. */
export const slot = (dia: string, hora: string) => `${dia}T${hora}:00-03:00`;

export const TRAMOS_INICIALES = [1, 2, 3, 4, 5].flatMap((d) => [
  { dia_semana: d, desde: '08:00', hasta: '13:00' },
  { dia_semana: d, desde: '14:00', hasta: '18:00' },
]);

export interface Ids {
  PA: string;
  PB: string;
}
export async function idsProfesores(): Promise<Ids> {
  return { PA: await profesorId(SLUG_A), PB: await profesorId(SLUG_B) };
}

/** Las personas de las sesiones compartidas se llaman «Alumno <rol>»; las personas a cargo de estas pruebas, «T06 …». */
const ALUMNOS = `select id from public.alumno where nombre like 'Alumno %'`;

/** Borra lo que dejaron las solicitudes de las sesiones compartidas (solicitudes, clases, reservas, mails y personas a cargo). */
export async function limpiarB06(): Promise<void> {
  await sql(`delete from public.solicitud where alumno_id in (${ALUMNOS})`);
  await sql(`delete from public.clase where alumno_id in (${ALUMNOS})`);
  await sql(`delete from public.reserva where alumno_id in (${ALUMNOS})`);
  await sql(`delete from public.mail_salida where tipo = 'solicitud_nueva'`);
  await sql(`delete from public.persona_a_cargo where nombre like '${PREFIJO_PERSONA}%'`);
  await sql(`delete from public.bloqueo where motivo like '${PREFIJO_PERSONA}%'`);
}

/** Configuración inicial (AGE-01) de los dos profesores y de los vínculos de las sesiones compartidas. */
export async function restaurarConfiguracion(): Promise<void> {
  await sql("update public.profesor set duracion_min = 60, anticipacion_horas = 24, zona_horaria = 'America/Montevideo', activo = true");
  await sql('delete from public.grilla_tramo');
  await sql(
    `insert into public.grilla_tramo (profesor_id, dia_semana, desde, hasta)
     select p.id, (t ->> 'dia_semana')::smallint, (t ->> 'desde')::time, (t ->> 'hasta')::time
       from public.profesor p, jsonb_array_elements($1::jsonb) t`,
    [JSON.stringify(TRAMOS_INICIALES)],
  );
}

export async function prepararB06(): Promise<void> {
  await limpiarB06();
  await restaurarConfiguracion();
  await fijarReloj(AHORA);
}

export async function terminarB06(): Promise<void> {
  await limpiarB06();
  await restaurarConfiguracion();
  await limpiarReloj();
}

/** `details` de un error de PostgREST (el DETAIL de la excepción) como objeto. */
export function detalle(r: RespuestaApi): Record<string, unknown> {
  const c = r.cuerpo as { details?: string | null };
  return c?.details ? (JSON.parse(c.details) as Record<string, unknown>) : {};
}
export const mensaje = (r: RespuestaApi) => (r.cuerpo as { message?: string })?.message;

/** Cuántas filas de solicitud, reserva y clase tiene la persona (para comprobar que un rechazo no creó nada). */
export async function filasDe(alumnoId: string): Promise<string> {
  const [f] = await sql<{ h: string }>(
    `select (select count(*) from public.solicitud where alumno_id = $1) || '/' ||
            (select count(*) from public.reserva where alumno_id = $1) || '/' ||
            (select count(*) from public.clase where alumno_id = $1) as h`,
    [alumnoId],
  );
  return f.h;
}

/** Entrada usada y salida obtenida de cada caso: test-results/evidencia-reservas.jsonl (sin secretos). */
export function registrar(caso: string, entrada: unknown, salida: unknown): void {
  const dir = resolve(RAIZ, 'test-results');
  mkdirSync(dir, { recursive: true });
  appendFileSync(resolve(dir, 'evidencia-reservas.jsonl'), JSON.stringify({ caso, entrada, salida, fecha: new Date().toISOString() }) + '\n');
}
