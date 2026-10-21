// Cargador diferido de supabase-js (ADR-017). Todo lo que necesita sesión (RPC de escritura,
// agenda_profesor, lecturas por RLS) pide el cliente por acá; nunca con import estático.
import type { SupabaseClient } from '@supabase/supabase-js';

type Importador = () => Promise<{ crearCliente: () => SupabaseClient }>;

const importarCliente: Importador = () => import('./supabase-cliente');

let promesa: Promise<SupabaseClient> | null = null;

/** Devuelve siempre el mismo cliente; si la carga falla, el próximo pedido reintenta. */
export function cargarSupabase(importar: Importador = importarCliente): Promise<SupabaseClient> {
  promesa ??= importar()
    .then((m) => m.crearCliente())
    .catch((e: unknown) => {
      promesa = null;
      throw e;
    });
  return promesa;
}

/** Solo para pruebas: olvida el cliente cargado. */
export function reiniciarCargaSupabase(): void {
  promesa = null;
}
