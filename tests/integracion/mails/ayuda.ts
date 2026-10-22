// Apoyo de las pruebas de mails de B03 (T03.4): Mailpit con remitente, transacciones con reloj propio, filas
// sintéticas con prefijo `t03.` que cada prueba limpia, y la función `enviar-mail` del stack local.
// Todo contra el stack local (NFR-02); direcciones solo @example.test; sin secretos en el repositorio:
// el secreto de la función es el valor de prueba de supabase/.env.development y la clave de servicio se lee
// del contenedor del edge runtime en cada corrida.
import { execSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type pg from 'pg';
import { conectar, sql } from '../../soporte/bd';
import { entorno, RAIZ } from '../../soporte/entorno';

export const PREFIJO = 't03.';

export function direccion(etiqueta: string): string {
  return `${PREFIJO}${etiqueta}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.test`;
}

function envDesarrollo(): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const linea of readFileSync(resolve(RAIZ, 'supabase/.env.development'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(linea);
    if (m && !linea.trim().startsWith('#')) salida[m[1]] = m[2];
  }
  return salida;
}

export const REMITENTE_LOCAL = envDesarrollo().GMAIL_USER;
export const SECRETO_LOCAL = envDesarrollo().MAIL_SECRETO;
export const URL_FUNCION = `${entorno().apiUrl}/functions/v1/enviar-mail`;

export interface MailVisto {
  ID: string;
  From: { Address: string; Name: string };
  To: { Address: string }[];
  Cc: unknown[];
  Bcc: unknown[];
  Subject: string;
  Text: string;
}

async function buscar(to: string): Promise<{ ID: string }[]> {
  const r = await fetch(`${entorno().mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
  return ((await r.json()) as { messages: { ID: string }[] }).messages;
}

/** Mails de Mailpit dirigidos a `to`, completos (con remitente y cabeceras). */
export async function mailsPara(to: string): Promise<MailVisto[]> {
  const salida: MailVisto[] = [];
  for (const { ID } of await buscar(to)) {
    salida.push((await (await fetch(`${entorno().mailpitUrl}/api/v1/message/${ID}`)).json()) as MailVisto);
  }
  return salida;
}

/** Espera hasta `intentos` x 250 ms el primer mail a `to`. */
export async function esperarMailPara(to: string, intentos = 80): Promise<MailVisto> {
  for (let i = 0; i < intentos; i++) {
    const m = await mailsPara(to);
    if (m.length > 0) return m[0];
    await dormir(250);
  }
  throw new Error(`No llegó ningún mail a ${to}`);
}

export const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function esperarEstado(id: string, estados: string[], intentos = 80): Promise<{ estado: string; motivo_fallo: string | null }> {
  let f: { estado: string; motivo_fallo: string | null } | undefined;
  for (let i = 0; i < intentos; i++) {
    [f] = await sql<{ estado: string; motivo_fallo: string | null }>('select estado, motivo_fallo from public.mail_salida where id = $1', [id]);
    if (f && estados.includes(f.estado)) return f;
    await dormir(250);
  }
  throw new Error(`La fila ${id} no llegó a ${estados.join('/')}; quedó ${f?.estado}`);
}

/** Encola dentro de la transacción abierta (`c`) y devuelve el id (o null). */
export async function encolar(c: pg.Client, tipo: string, destinatario: string | null, asunto: string, cuerpo: string, alumnoId: string | null = null): Promise<string | null> {
  const r = await c.query<{ id: string | null }>('select privado.encolar_mail($1, $2, $3, $4, $5) as id', [tipo, alumnoId, destinatario, asunto, cuerpo]);
  return r.rows[0].id;
}

/** Corre `f` dentro de una transacción y la confirma. */
export async function confirmar<T>(f: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = await conectar();
  await c.query('begin');
  try {
    const r = await f(c);
    await c.query('commit');
    return r;
  } catch (e) {
    await c.query('rollback');
    throw e;
  }
}

/** Corre `f` dentro de una transacción con el reloj fijado SOLO en ella y la deshace (nada se confirma). */
export async function conRelojEnTransaccion<T>(instante: string, f: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = await conectar();
  await c.query('begin');
  try {
    await c.query('update privado.reloj_prueba set ahora = $1::timestamptz', [instante]);
    return await f(c);
  } finally {
    await c.query('rollback');
  }
}

export async function limpiarFilas(): Promise<void> {
  await sql("delete from public.mail_salida where destinatario like $1", [`${PREFIJO}%`]);
}

export interface FilaFijada {
  estado: 'pendiente' | 'enviando' | 'enviado' | 'fallido';
  motivo?: string | null;
  creadoEn?: string;
  intentadoEn?: string | null;
  destinatario?: string;
}

/** Inserta una fila sintética por conexión directa. `sinDisparo`: la inserta sin el trigger de pg_net (réplica). */
export async function insertarFila(f: FilaFijada, sinDisparo = false): Promise<string> {
  const c = await conectar();
  await c.query('begin');
  try {
    if (sinDisparo) await c.query("set local session_replication_role = replica");
    const r = await c.query<{ id: string }>(
      `insert into public.mail_salida (profesor_id, tipo, destinatario, asunto, cuerpo_texto, estado, motivo_fallo, creado_en, intentado_en)
       values ((select id from public.profesor), 'recordatorio', $1, 'fila sintetica', 'cuerpo sintetico', $2, $3, coalesce($4::timestamptz, public.app_ahora()), $5::timestamptz)
       returning id`,
      [f.destinatario ?? direccion('fila'), f.estado, f.motivo ?? null, f.creadoEn ?? null, f.intentadoEn ?? null],
    );
    await c.query('commit');
    return r.rows[0].id;
  } catch (e) {
    await c.query('rollback');
    throw e;
  }
}

/** Mails del profesor no TOPE creados en la última hora y en las últimas 24 h (lo que cuenta AVI-08), con la hora real. */
export async function cuentaDelTope(): Promise<{ hora: number; dia: number }> {
  const [f] = await sql<{ hora: string; dia: string }>(
    `select count(*) filter (where creado_en > public.app_ahora() - interval '60 minutes') as hora, count(*) as dia
       from public.mail_salida
      where creado_en > public.app_ahora() - interval '24 hours' and creado_en <= public.app_ahora()
        and not (estado = 'fallido' and motivo_fallo is not distinct from 'TOPE')`,
  );
  return { hora: Number(f.hora), dia: Number(f.dia) };
}

/** Llama a `enviar-mail` del stack (o de `url`) con las cabeceras dadas. */
export async function invocar(cuerpo: unknown, cabeceras: Record<string, string> = { 'x-mail-secreto': SECRETO_LOCAL }, metodo = 'POST', url = URL_FUNCION) {
  const r = await fetch(url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...cabeceras },
    body: metodo === 'POST' ? (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)) : undefined,
  });
  const texto = await r.text();
  let json: unknown = null;
  try {
    json = JSON.parse(texto);
  } catch {
    /* sin cuerpo JSON */
  }
  return { status: r.status, texto, json };
}

/** Registro del edge runtime del stack (SEC-17). */
export function logsDelEdgeRuntime(): string {
  return execSync('docker logs supabase_edge_runtime_reservas 2>&1', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 60_000 });
}

/** Clave de servicio del stack local, leída del contenedor del edge runtime (nunca a disco). */
export function claveDeServicioLocal(): string {
  return execSync('docker exec supabase_edge_runtime_reservas printenv SUPABASE_SERVICE_ROLE_KEY', { encoding: 'utf8', timeout: 60_000 }).trim();
}

/** Deja la entrada usada y la salida obtenida de cada caso en test-results/evidencia-mails.jsonl (sin secretos). */
export function registrar(caso: string, entrada: unknown, salida: unknown): void {
  const dir = resolve(RAIZ, 'test-results');
  mkdirSync(dir, { recursive: true });
  appendFileSync(resolve(dir, 'evidencia-mails.jsonl'), JSON.stringify({ caso, entrada, salida, fecha: new Date().toISOString() }) + '\n');
}
