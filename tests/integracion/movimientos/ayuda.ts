// Apoyo de las pruebas de B08 (T08.3): mismo reloj fijo y sesiones compartidas que B06/B07, mails de Mailpit por cantidad y registro de
// entrada y salida de cada caso. Reloj de la aplicación (ADR-014): lunes 2026-11-02 12:00 de Montevideo. Solo @example.test (NFR-02).
import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from '../../soporte/bd';
import { entorno, RAIZ } from '../../soporte/entorno';
import { fijarReloj } from '../../soporte/reloj';
import { rpc, type Rol } from '../../soporte/usuarios';
import { AHORA, alumnoDe, detalle, idsProfesores, leer, limpiarB07, madrid, mensaje, pedirReserva, prepararB07, responder, slot, terminarB07, type Ids } from '../respuestas/ayuda';

export { AHORA, alumnoDe, detalle, idsProfesores, leer, madrid, mensaje, pedirReserva, prepararB07, responder, slot, terminarB07, limpiarB07, fijarReloj, type Ids };

/** Pide una reserva y la confirma el profesor: deja una clase (o serie) confirmada. Devuelve el id de la solicitud de reserva. */
export async function confirmada(rol: Rol, profesor: 'profesor' | 'profesorB', ids: Ids, inicio: string, extra: Record<string, unknown> = {}): Promise<string> {
  const p = await pedirReserva(rol, profesor === 'profesor' ? ids.PA : ids.PB, inicio, extra);
  if (p.status !== 200) throw new Error(`reserva ${inicio}: ${p.status} ${JSON.stringify(p.cuerpo)}`);
  const r = await responder(profesor, p.solicitudId!, 'confirmar');
  if (r.status !== 200) throw new Error(`confirmar ${inicio}: ${r.status} ${JSON.stringify(r.cuerpo)}`);
  return p.solicitudId!;
}

/** Id de la clase activa del profesor con ese inicio (consulta directa: preparación y comprobación de estado). */
export async function claseEn(profesorId: string, inicio: string): Promise<string> {
  const f = await sql<{ id: string }>(`select id from public.clase where profesor_id = $1 and inicio = $2::timestamptz and estado in ('pendiente','confirmada')`, [profesorId, inicio]);
  if (f.length !== 1) throw new Error(`No hay una clase activa de ${profesorId} en ${inicio}`);
  return f[0].id;
}

export const mover = (rol: Rol, clase: string, destino: string | null, alcance = 'solo_esta') => rpc(rol, 'solicitar_movimiento', { p_clase_id: clase, p_destino: destino, p_alcance: alcance });
export const cancelar = (rol: Rol, clase: string, alcance = 'solo_esta') => rpc(rol, 'solicitar_cancelacion', { p_clase_id: clase, p_alcance: alcance });

export const estadoClase = async (id: string) => (await sql<{ estado: string }>('select estado from public.clase where id = $1', [id]))[0]?.estado;
export const cuenta = async (texto: string, params: unknown[] = []) => Number((await sql<{ n: string }>(texto, params))[0].n);

interface MailPlano {
  Subject: string;
  Text: string;
  To: { Address: string }[];
}
async function buscar(para: string, asunto: string): Promise<{ ID: string }[]> {
  const q = encodeURIComponent(`to:"${para}" subject:"${asunto}"`);
  return ((await (await fetch(`${entorno().mailpitUrl}/api/v1/search?query=${q}&limit=200`)).json()) as { messages: { ID: string }[] }).messages;
}
/** Cuántos mails con ese destinatario y asunto hay hoy en Mailpit (no se vacía el buzón: lo comparten otros bolts). */
export const mailsCon = async (para: string, asunto: string) => (await buscar(para, asunto)).length;
/** Espera un mail más con ese destinatario y asunto que los `antes` previos y devuelve el más nuevo. */
export async function esperarNuevo(para: string, asunto: string, antes: number, intentos = 120): Promise<MailPlano> {
  for (let i = 0; i < intentos; i++) {
    const m = await buscar(para, asunto);
    if (m.length > antes) return (await (await fetch(`${entorno().mailpitUrl}/api/v1/message/${m[0].ID}`)).json()) as MailPlano;
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error(`No llegó a ${para} un mail nuevo con asunto «${asunto}»`);
}

/** Entrada usada y salida obtenida de cada caso: test-results/evidencia-movimientos.jsonl (sin secretos). */
export function registrar(caso: string, entrada: unknown, salida: unknown): void {
  const dir = resolve(RAIZ, 'test-results');
  mkdirSync(dir, { recursive: true });
  appendFileSync(resolve(dir, 'evidencia-movimientos.jsonl'), JSON.stringify({ caso, entrada, salida, fecha: new Date().toISOString() }) + '\n');
}
