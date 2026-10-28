// Apoyo de las pruebas de B10 (T10.3): reloj fijo y datos de las sesiones compartidas como en B06 a B09, limpieza de lo que crean
// los bloqueos y la gestión directa, y registro de entrada y salida de cada caso.
// Reloj de la aplicación (ADR-014) fijo en lunes 2026-11-02 12:00 de Montevideo. Solo @example.test (NFR-02).
import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from '../../soporte/bd';
import { RAIZ } from '../../soporte/entorno';
import { limpiarB09, prepararB09, terminarB09 } from '../gestion/ayuda';

export { AHORA, alumnoDe, asegurarSesionProfesor, crear, detalle, idsProfesores, leer, mensaje, pedirReserva, slot, type Ids } from '../gestion/ayuda';

/** Motivo de los bloqueos de estas pruebas: así se borran sin tocar los de otros bolts. */
export const PREFIJO_MOTIVO = 'T10 ';

/**
 * Extremo de `p_hasta` (H-015, corregido por H-394 / contratos.md §3): con el reloj en AHORA (hoy = 2026-11-02) el mayor `p_hasta` que
 * acepta `bloquear` es 00:00 de hoy + 367 en el huso del profesor (el día hoy + 366 entra completo). Si cambia, cambian solo estas constantes.
 * `p_desde` no puede ser anterior a 00:00 de hoy - 366 (DESDE_MIN).
 */
export const EXTREMO_A = '2027-11-04T00:00:00-03:00'; // profesor A, America/Montevideo
export const EXTREMO_B = '2027-11-04T00:00:00+01:00'; // profesora B, Europe/Madrid
export const EXTREMO_A_MAS_1S = '2027-11-04T00:00:01-03:00';
export const EXTREMO_A_MAS_1D = '2027-11-05T00:00:00-03:00';
export const EXTREMO_B_MAS_1S = '2027-11-04T00:00:01+01:00';
export const EXTREMO_B_MAS_1D = '2027-11-05T00:00:00+01:00';
export const DESDE_MIN_A = '2025-11-01T00:00:00-03:00';
export const DESDE_MIN_A_MENOS_1S = '2025-10-31T23:59:59-03:00';

export async function limpiarB10(): Promise<void> {
  await sql(`delete from public.bloqueo where motivo like '${PREFIJO_MOTIVO}%'`); // todos los bloqueos de estas pruebas llevan motivo «T10 …»
  await limpiarB09();
}
export async function prepararB10(): Promise<void> {
  await prepararB09();
  await limpiarB10();
}
export async function terminarB10(): Promise<void> {
  await limpiarB10();
  await terminarB09();
}

/** Cuerpo de un error de PostgREST con `details` JSON (objeto o lista) ya leído. */
export function detalleJson(r: { cuerpo: unknown }): unknown {
  const c = r.cuerpo as { details?: string | null };
  return c?.details ? JSON.parse(c.details) : null;
}

/** Entrada usada y salida obtenida de cada caso: test-results/evidencia-configuracion.jsonl (sin secretos). */
export function registrar(caso: string, entrada: unknown, salida: unknown): void {
  const dir = resolve(RAIZ, 'test-results');
  mkdirSync(dir, { recursive: true });
  appendFileSync(resolve(dir, 'evidencia-configuracion.jsonl'), JSON.stringify({ caso, entrada, salida, fecha: new Date().toISOString() }) + '\n');
}
