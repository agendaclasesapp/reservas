// Reloj de la aplicación para pruebas (ADR-014): se fija por conexión directa a la base local,
// rol postgres, nunca por la API. Se limpia (ahora = null) al final de cada prueba.
import { sql } from './bd';

/** Fija `privado.reloj_prueba.ahora`; exige `permitir_reloj_prueba = true` (solo seed.sql, local y CI). */
export async function fijarReloj(instante: string | Date): Promise<void> {
  const iso = instante instanceof Date ? instante.toISOString() : instante;
  const permitido = await sql<{ permitir_reloj_prueba: boolean }>('select permitir_reloj_prueba from privado.ajustes limit 1');
  if (!permitido[0]?.permitir_reloj_prueba) throw new Error('permitir_reloj_prueba es false: el seed local no corrió (ADR-014)');
  const r = await sql('update privado.reloj_prueba set ahora = $1::timestamptz returning 1', [iso]);
  if (r.length === 0) await sql('insert into privado.reloj_prueba (ahora) values ($1::timestamptz)', [iso]);
}

export async function limpiarReloj(): Promise<void> {
  await sql('update privado.reloj_prueba set ahora = null');
}

/** Lo que devuelve la base como hora de la aplicación (rol postgres: no pasa por permisos de la API). */
export async function ahoraDeLaBase(): Promise<Date> {
  const [f] = await sql<{ a: Date }>('select public.app_ahora() as a');
  return f.a;
}
