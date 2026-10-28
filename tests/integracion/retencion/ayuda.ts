// Apoyo de las pruebas de B11 (T11.3): reloj fijo, personas de prueba (con cuenta real o sin usuario), clases con su reserva, limpieza de lo
// que se crea y registro de la entrada usada y la salida obtenida de cada caso. Solo @example.test (NFR-02). Datos sintéticos.
// Reloj de la aplicación (ADR-014) fijo en lunes 2026-11-02 12:00 de Montevideo (15:00Z).
import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from '../../soporte/bd';
import { entorno, RAIZ } from '../../soporte/entorno';
import { mailUnico } from '../../soporte/correo';
import { ingresarPorCodigo } from '../../soporte/usuarios';
import { AHORA, idsProfesores, prepararB06, terminarB06, type Ids } from '../reservas/ayuda';

export { AHORA, idsProfesores, type Ids };
export { esperarMailCon, mailsA, type MailPlano } from '../respuestas/ayuda';

export const MS = Date.parse(AHORA);
/** Instante `AHORA + delta` en ISO. */
export const desde = (deltaMs: number) => new Date(MS + deltaMs).toISOString();
export const HORA = 3_600_000;
export const DIA = 24 * HORA;

/** Todo lo que crea una corrida: se borra al final (la persona anonimizada no tiene nombre, así que se rastrea por id). */
const alumnos: string[] = [];
const usuarios: string[] = [];

/** Anota una persona creada por la API (alta del profesor) para limpiarla al terminar. */
export const rastrear = (id: string) => void alumnos.push(id);
/** Ids de las personas creadas hasta ahora. */
export const misIds = () => [...alumnos];

export async function preparar(): Promise<void> {
  await prepararB06();
}
export async function terminar(): Promise<void> {
  await limpiar();
  await terminarB06();
}

export interface Persona {
  id: string;
  mail: string;
  userId: string | null;
}
interface Opciones {
  /** Registro de la persona (por defecto, el reloj fijo). */
  creado?: string;
  con?: Partial<Record<'PA' | 'PB', 'aprobado' | 'rechazado' | 'pendiente' | 'sin_cuenta'>>;
  motivo?: string;
  como?: string;
  /** `true` = ingresa por código a Auth (usuario, sesión, refresh token y audit log reales). */
  cuenta?: boolean;
  mail?: string | null;
  telefono?: string;
  nacimiento?: string;
  /** Con `cuenta`: conserva el `ultimo_ingreso` que dejó el ingreso real (hora simulada) en lugar de ponerlo en nulo. */
  conservarIngreso?: boolean;
}

/** Persona con ficha completa y las inscripciones pedidas. Sin `cuenta` no tiene usuario de Auth (como las que da de alta el profesor). */
export async function persona(prefijo: string, nombre: string, ids: Ids, o: Opciones = {}): Promise<Persona> {
  const mail = o.mail === null ? null : (o.mail ?? mailUnico(prefijo));
  let userId: string | null = null;
  let id: string;
  const creado = o.creado ?? AHORA;
  if (o.cuenta) {
    userId = (await ingresarPorCodigo(mail!)).userId;
    usuarios.push(userId);
    const [f] = await sql<{ id: string }>('select id from public.alumno where user_id = $1', [userId]);
    id = f.id;
  } else {
    const [f] = await sql<{ id: string }>(`insert into public.alumno (estado) values ('completa') returning id`);
    id = f.id;
  }
  alumnos.push(id);
  await sql(
    `update public.alumno set estado = 'completa', nombre = $2, mail = $3, telefono = $4, fecha_nacimiento = $5, ficha_completada_en = '2026-01-01',
            ficha_origen_profesor_id = $6, creado_en = $7::timestamptz, ultimo_ingreso = case when $8 then ultimo_ingreso end, aviso_inactividad_en = null where id = $1`,
    [id, nombre, mail, o.telefono ?? '099 700 700', o.nacimiento ?? '1990-01-01', ids.PA, creado, o.conservarIngreso === true],
  );
  for (const [quien, estado] of Object.entries(o.con ?? {})) {
    await sql(
      `insert into public.inscripcion (alumno_id, profesor_id, estado, motivo_estado, como_llego, aprobado_en)
       values ($1, $2, $3, $4, $5, $6::timestamptz)`,
      [id, quien === 'PA' ? ids.PA : ids.PB, estado, estado === 'rechazado' ? (o.motivo ?? null) : null, o.como ?? 'Amigos', estado === 'aprobado' ? creado : null],
    );
  }
  return { id, mail: mail ?? '', userId };
}

/** Clase con su reserva suelta. `segundos` = duración (1 para acotar la ventana de los recordatorios sin pisar otras clases). */
export async function clase(
  profesor: string,
  alumnoId: string,
  inicio: string,
  extra: { estado?: string; segundos?: number; confirmada?: string | null; observacion?: string | null } = {},
): Promise<string> {
  const estado = extra.estado ?? 'confirmada';
  const segundos = extra.segundos ?? 3600;
  const [r] = await sql<{ id: string }>(
    `insert into public.reserva (profesor_id, alumno_id, tipo, hora_local, dia_semana, duracion_min, observacion, estado, desde, origen)
     values ($1, $2, 'suelta', ($3::timestamptz at time zone 'UTC')::time, extract(isodow from $3::timestamptz at time zone 'UTC')::int,
             greatest(1, $4::int / 60), $5, $6, ($3::timestamptz at time zone 'UTC')::date, 'profesor') returning id`,
    [profesor, alumnoId, inicio, segundos, extra.observacion ?? null, estado === 'pendiente' ? 'pendiente' : estado === 'cancelada' ? 'cancelada' : 'confirmada'],
  );
  const [c] = await sql<{ id: string }>(
    `insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado, confirmada_en)
     values ($1, $2, $3, $4::timestamptz, $4::timestamptz + make_interval(secs => $5::int), $6, $7::timestamptz) returning id`,
    [profesor, r.id, alumnoId, inicio, segundos, estado, extra.confirmada === undefined ? null : extra.confirmada],
  );
  return c.id;
}

/** Corre el proceso programado como lo llama pg_cron (rol postgres, reloj de prueba) y devuelve su fila en `privado.ejecucion_proceso`. */
export async function correr(nombre: 'retencion' | 'recordatorios'): Promise<{ id: string; ahora: Date; ok: boolean; error: string | null; cantidades: Record<string, number> | null }> {
  const [antes] = await sql<{ m: string | null }>('select max(id)::text as m from privado.ejecucion_proceso');
  await sql(`call privado.correr_proceso('${nombre}')`);
  const filas = await sql<{ id: string; ahora: Date; ok: boolean; error: string | null; cantidades: Record<string, number> | null }>(
    'select id::text, ahora, ok, error, cantidades from privado.ejecucion_proceso where nombre = $1 and id > $2::bigint order by id desc',
    [nombre, antes.m ?? '0'],
  );
  if (filas.length === 0) throw new Error(`correr_proceso(${nombre}) no dejó fila en ejecucion_proceso`);
  return filas[0];
}

/** Tablas de public, auth y privado con alguna fila cuyo texto case con el patrón (regex): `schema.tabla:n`. */
export async function restos(patron: string): Promise<string> {
  const tablas = await sql<{ s: string; r: string }>(
    `select n.nspname as s, c.relname as r from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'r' and n.nspname in ('public', 'auth', 'privado') order by 1, 2`,
  );
  const hallados: string[] = [];
  for (const t of tablas) {
    const [f] = await sql<{ n: string }>(`select count(*)::text as n from "${t.s}"."${t.r}" x where x::text ~* $1`, [patron]);
    if (Number(f.n) > 0) hallados.push(`${t.s}.${t.r}:${f.n}`);
  }
  return hallados.join(' ');
}

export async function limpiar(): Promise<void> {
  if (alumnos.length) {
    await sql('delete from public.mail_salida where alumno_id = any($1::uuid[])', [alumnos]);
    await sql('delete from public.solicitud where alumno_id = any($1::uuid[])', [alumnos]);
    await sql('delete from public.clase where alumno_id = any($1::uuid[])', [alumnos]);
    await sql('delete from public.reserva where alumno_id = any($1::uuid[])', [alumnos]);
    await sql('delete from public.persona_a_cargo where alumno_id = any($1::uuid[])', [alumnos]);
    await sql('delete from public.inscripcion where alumno_id = any($1::uuid[])', [alumnos]);
    await sql('delete from privado.union_descartada where cuenta_id = any($1::uuid[]) or sin_cuenta_id = any($1::uuid[])', [alumnos]);
    await sql('delete from public.alumno where id = any($1::uuid[])', [alumnos]);
    alumnos.length = 0;
  }
  if (usuarios.length) {
    await sql('delete from auth.users where id = any($1::uuid[])', [usuarios]);
    usuarios.length = 0;
  }
}

/** Entrada usada y salida obtenida de cada caso: test-results/evidencia-retencion.jsonl (sin secretos). */
export function registrar(caso: string, entrada: unknown, salida: unknown): void {
  const dir = resolve(RAIZ, 'test-results');
  mkdirSync(dir, { recursive: true });
  appendFileSync(resolve(dir, 'evidencia-retencion.jsonl'), JSON.stringify({ caso, entrada, salida, entorno: entorno().apiUrl, fecha: new Date().toISOString() }) + '\n');
}
