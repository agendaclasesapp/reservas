// Conexión directa a la base local (rol postgres) para preparar y limpiar estado. Nunca por la API.
import pg from 'pg';
import { entorno } from './entorno';

let cliente: pg.Client | null = null;

export async function conectar(): Promise<pg.Client> {
  if (!cliente) {
    cliente = new pg.Client({ connectionString: entorno().dbUrl });
    await cliente.connect();
  }
  return cliente;
}

export async function cerrar(): Promise<void> {
  if (cliente) {
    await cliente.end();
    cliente = null;
  }
}

export async function sql<T extends pg.QueryResultRow = Record<string, unknown>>(texto: string, params: unknown[] = []): Promise<T[]> {
  const c = await conectar();
  return (await c.query<T>(texto, params)).rows;
}
