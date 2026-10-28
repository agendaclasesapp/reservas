// Apoyo de las pruebas de B07 (T07.3): mismo reloj fijo y datos de las sesiones compartidas que B06, limpieza de los mails de
// respuesta, lectura de Mailpit con remitente y Reply-To, y registro de entrada y salida de cada caso.
// Reloj de la aplicación (ADR-014) fijo en lunes 2026-11-02 12:00 de Montevideo. Solo @example.test (NFR-02).
import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from '../../soporte/bd';
import { entorno, RAIZ } from '../../soporte/entorno';
import { rest, rpc, sesionDe, type Rol } from '../../soporte/usuarios';
import { AHORA, detalle, idsProfesores, limpiarB06, mensaje, prepararB06, slot, terminarB06, type Ids } from '../reservas/ayuda';

export { AHORA, detalle, idsProfesores, mensaje, slot, type Ids };

/** Hora de Madrid (+01 en noviembre): `madrid('2026-11-10', '10:00')`. */
export const madrid = (dia: string, hora: string) => `${dia}T${hora}:00+01:00`;

export async function limpiarB07(): Promise<void> {
  await sql(`delete from public.mail_salida where tipo = 'solicitud_respondida'`);
  await limpiarB06();
}
export async function prepararB07(): Promise<void> {
  await limpiarB07();
  await prepararB06();
}
export async function terminarB07(): Promise<void> {
  await limpiarB07();
  await terminarB06();
}

export const alumnoDe = async (rol: Rol) => (await sesionDe(rol)).alumnoId!;

/** Solicita una reserva (suelta por defecto) y devuelve el id de la solicitud creada. */
export async function pedirReserva(rol: Rol, profesor: string, inicio: string, extra: Record<string, unknown> = {}): Promise<{ status: number; solicitudId: string | null; cuerpo: unknown }> {
  const r = await rpc(rol, 'solicitar_reserva', { p_profesor_id: profesor, p_inicio: inicio, p_tipo: 'suelta', ...extra });
  const cuerpo = r.cuerpo as { solicitud_id?: string } | null;
  return { status: r.status, solicitudId: cuerpo?.solicitud_id ?? null, cuerpo: r.cuerpo };
}

export const responder = (rol: Rol, id: string, decision: string, motivo?: string | null) =>
  rpc(rol, 'responder_solicitud', { p_solicitud_id: id, p_decision: decision, ...(motivo === undefined ? {} : { p_motivo: motivo }) });

/** Lectura de una vista por la API REST (la misma ruta que usa la web). */
export async function leer<T = Record<string, unknown>>(rol: Rol, vista: string, consulta = ''): Promise<T[]> {
  const r = await rest(rol, 'GET', `${vista}${consulta ? `?${consulta}` : ''}`);
  if (r.status !== 200) throw new Error(`GET ${vista}?${consulta} como ${rol}: ${r.status} ${JSON.stringify(r.cuerpo)}`);
  return r.cuerpo as T[];
}

export interface MailPlano {
  Subject: string;
  Text: string;
  To: { Address: string }[];
  From: { Address: string; Name: string };
  ReplyTo: { Address: string; Name: string }[] | null;
}

/** Espera en Mailpit un mail con destinatario y asunto exactos cuyo texto contenga `marca` (único de la prueba). */
export async function esperarMailCon(para: string, asunto: string, marca: string, intentos = 120): Promise<MailPlano> {
  const q = encodeURIComponent(`to:"${para}" subject:"${asunto}"`);
  for (let i = 0; i < intentos; i++) {
    const r = (await (await fetch(`${entorno().mailpitUrl}/api/v1/search?query=${q}`)).json()) as { messages: { ID: string }[] };
    for (const m of r.messages) {
      const p = (await (await fetch(`${entorno().mailpitUrl}/api/v1/message/${m.ID}`)).json()) as MailPlano;
      if (p.Text.includes(marca)) return p;
    }
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error(`No llegó a ${para} un mail con asunto «${asunto}» que contenga «${marca}»`);
}
export async function mailsA(para: string, asunto: string): Promise<number> {
  const q = encodeURIComponent(`to:"${para}" subject:"${asunto}"`);
  return ((await (await fetch(`${entorno().mailpitUrl}/api/v1/search?query=${q}`)).json()) as { messages: unknown[] }).messages.length;
}

/** Entrada usada y salida obtenida de cada caso: test-results/evidencia-respuestas.jsonl (sin secretos). */
export function registrar(caso: string, entrada: unknown, salida: unknown): void {
  const dir = resolve(RAIZ, 'test-results');
  mkdirSync(dir, { recursive: true });
  appendFileSync(resolve(dir, 'evidencia-respuestas.jsonl'), JSON.stringify({ caso, entrada, salida, fecha: new Date().toISOString() }) + '\n');
}
