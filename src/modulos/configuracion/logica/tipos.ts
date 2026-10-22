// Tipos de dominio de «Mails fallidos» (WEB-08, NFR-07, AVI-08), escritos a mano contra
// contratos.md §2 (`v_mails_fallidos`) y §4 (tipos de mail).
import { z } from 'zod';

/** Tipos de mail que encola `privado.encolar_mail` (contratos.md §4). */
export const TIPOS_MAIL = [
  'cuenta_nueva',
  'solicitud_nueva',
  'cuenta_respondida',
  'solicitud_respondida',
  'clase_creada',
  'clase_movida',
  'clase_cancelada',
  'recordatorio',
  'aviso_inactividad',
] as const;

export type TipoMail = (typeof TIPOS_MAIL)[number];

/** Motivo con que nace un mail sobre el tope de AVI-08 (ADR-016). */
export const MOTIVO_TOPE = 'TOPE';
/** Motivo del barrido para un envío sin confirmar tras 10 min (H-017, DEC-10 b). */
export const MOTIVO_SIN_CONFIRMACION = 'SIN_CONFIRMACION';
/** Motivo con que nace un mail cuyo destinatario no es una dirección simple (H-141, NFR-07). */
export const MOTIVO_DESTINATARIO_INVALIDO = 'DESTINATARIO_INVALIDO';

/**
 * Clase de motivo para que la vista elija el texto:
 * - `tope`: se superó el tope de envío (AVI-08); el mail no salió.
 * - `sin_confirmacion`: la función no confirmó el envío; pudo haber salido.
 * - `destinatario_invalido`: la dirección no es un mail simple (H-141); el mail no salió.
 * - `envio`: error del servidor de correo (texto SMTP en `motivo`).
 * - `desconocido`: sin motivo (fila anonimizada, ADR-011).
 */
export type ClaseMotivo = 'tope' | 'sin_confirmacion' | 'destinatario_invalido' | 'envio' | 'desconocido';

/** Fila de `v_mails_fallidos`. `destinatario` y `motivo` son nulos si el alumno fue borrado (ADR-011). */
export const esquemaMailFallido = z.object({
  id: z.string().uuid(),
  fecha: z.string().min(1),
  destinatario: z.string().nullable(),
  tipo: z.enum(TIPOS_MAIL),
  motivo: z.string().nullable(),
});

export type MailFallido = z.infer<typeof esquemaMailFallido>;

/** Estado del hook `useMailsFallidos`. `error` es un texto ya traducido (SEC-17), nunca el crudo. */
export type EstadoMailsFallidos =
  | { estado: 'cargando'; mails: readonly MailFallido[]; error: null }
  | { estado: 'listo'; mails: readonly MailFallido[]; error: null }
  | { estado: 'error'; mails: readonly MailFallido[]; error: string };

export interface ResultadoMailsFallidos {
  datos: EstadoMailsFallidos;
  /** Vuelve a leer la vista (por ejemplo, tras volver a la pantalla). */
  recargar: () => void;
}
