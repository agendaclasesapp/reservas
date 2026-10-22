// Lectura del registro de mails fallidos (WEB-08, NFR-07, AVI-08). La vista `v_mails_fallidos` es
// `security_invoker` y solo el profesor la lee (RLS de `mail_salida`); un alumno recibe `[]`.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { cargarSupabase } from '../../../lib/supabase';
import {
  MOTIVO_DESTINATARIO_INVALIDO,
  MOTIVO_SIN_CONFIRMACION,
  MOTIVO_TOPE,
  esquemaMailFallido,
  type ClaseMotivo,
  type MailFallido,
} from './tipos';

export const VISTA_MAILS_FALLIDOS = 'v_mails_fallidos';

const COLUMNAS = 'id, fecha, destinatario, tipo, motivo';

export type LectorMailsFallidos = () => Promise<MailFallido[]>;

/**
 * Lee los mails fallidos, del más reciente al más viejo. Lanza el error de postgrest-js tal cual
 * (la vista lo traduce con `traducirError`, SEC-17) o un error de validación si la fila no cumple
 * el contrato.
 */
export async function leerMailsFallidos(
  obtenerCliente: () => Promise<SupabaseClient> = () => cargarSupabase(),
): Promise<MailFallido[]> {
  const cliente = await obtenerCliente();
  const { data, error } = await cliente
    .from(VISTA_MAILS_FALLIDOS)
    .select(COLUMNAS)
    .order('fecha', { ascending: false });
  if (error) throw error;
  return z.array(esquemaMailFallido).parse(data ?? []);
}

/** NFR-07, AVI-08, H-141: clase del motivo para que la vista diga en palabras qué pasó. */
export function clasificarMotivo(motivo: string | null): ClaseMotivo {
  if (motivo === null || motivo.trim() === '') return 'desconocido';
  if (motivo === MOTIVO_TOPE) return 'tope';
  if (motivo === MOTIVO_SIN_CONFIRMACION) return 'sin_confirmacion';
  if (motivo === MOTIVO_DESTINATARIO_INVALIDO) return 'destinatario_invalido';
  return 'envio';
}
