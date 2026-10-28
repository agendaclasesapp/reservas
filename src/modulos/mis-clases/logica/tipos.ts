// Mis clases de la persona (RES-06, SOL-08, ALU-03, WEB-05; contratos.md §2 `v_mis_clases`, B07).
// Tipos a mano contra supabase/migrations/202611000702_vistas_clases_y_solicitudes.sql.
import { z } from 'zod';

export const ESTADOS_CLASE = ['pendiente', 'confirmada', 'rechazada', 'cancelada', 'movida'] as const;
export type EstadoClase = (typeof ESTADOS_CLASE)[number];

export const TIPOS_SOLICITUD = ['reserva', 'movimiento', 'cancelacion'] as const;
export type TipoSolicitud = (typeof TIPOS_SOLICITUD)[number];

export const ALCANCES = ['solo_esta', 'desde_aca'] as const;
export type Alcance = (typeof ALCANCES)[number];

/**
 * Huso de respaldo si la clase llega sin el de su profesor (no debería: la inscripción no se borra). Es el
 * valor por defecto de `profesor.zona_horaria`; nunca el del navegador (ADR-004).
 */
export const ZONA_POR_DEFECTO = 'America/Montevideo';

/**
 * Solicitud sin responder sobre la clase (SOL-01..03): la de reserva sobre su reserva, o un movimiento o
 * una cancelación (B08). `vencida`: su horario pasó sin respuesta (SOL-08), calculado por la base con
 * `app_ahora()`.
 */
export const esquemaSolicitudDeClase = z.object({
  id: z.string(),
  tipo: z.enum(TIPOS_SOLICITUD),
  alcance: z.enum(ALCANCES).nullable(),
  vencida: z.boolean(),
});
export type SolicitudDeClase = z.infer<typeof esquemaSolicitudDeClase>;

/** Fila de `v_mis_clases`: una clase de la persona con cualquiera de sus profesores. */
export const esquemaClaseMia = z.object({
  id: z.string(),
  inicio: z.string(),
  fin: z.string(),
  estado: z.enum(ESTADOS_CLASE),
  /** Persona a cargo o el titular. Texto (SEC-16). */
  quien_toma: z.string().nullable(),
  persona_a_cargo_id: z.string().nullable(),
  /** Texto libre de la persona (SEC-16). */
  observacion: z.string().nullable(),
  reserva_tipo: z.enum(['suelta', 'serie']),
  /** 1 semanal, 2 quincenal; null en una suelta. */
  frecuencia: z.number().int().nullable(),
  solicitud_pendiente: esquemaSolicitudDeClase.nullable(),
  /** Ya empezó según `app_ahora()` (ADR-014): la web no usa su reloj para separar próximas y pasadas. */
  pasada: z.boolean(),
  reserva_id: z.string(),
  profesor_id: z.string(),
  /** Texto (SEC-16). */
  profesor_nombre: z.string().nullable(),
  profesor_slug: z.string().nullable(),
  /** Huso del profesor de esta clase: la hora se muestra en él (CA-53, ADR-004). */
  zona_horaria: z.string().nullable(),
});
export type ClaseMia = z.infer<typeof esquemaClaseMia>;

export const COLUMNAS_V_MIS_CLASES =
  'id, inicio, fin, estado, quien_toma, persona_a_cargo_id, observacion, reserva_tipo, frecuencia, solicitud_pendiente, pasada, reserva_id, profesor_id, profesor_nombre, profesor_slug, zona_horaria';

export const MENSAJES_MIS_CLASES = {
  estado: {
    pendiente: 'Pendiente de confirmación',
    confirmada: 'Confirmada',
    rechazada: 'Rechazada',
    cancelada: 'Cancelada',
    movida: 'Cambiada de horario',
  } satisfies Record<EstadoClase, string>,
  /** SOL-08, CA-25: pendiente cuyo horario pasó sin que el profesor respondiera. */
  pendienteSinRespuesta: 'Pendiente sin respuesta',
  solicitud: {
    reserva: 'Esperando que el profesor confirme',
    movimiento: 'Pediste cambiarla de horario',
    cancelacion: 'Avisaste que no podés ir',
  } satisfies Record<TipoSolicitud, string>,
  vinculo: {
    pendiente: 'Pendiente de aprobación',
    aprobado: 'Aprobado',
    rechazado: 'Rechazado',
    sin_cuenta: 'Aprobado',
  },
  /** Profesor que ya no te tiene en su lista (baja): sus clases pasadas siguen a la vista. */
  sinVinculo: 'Ya no figurás en su lista',
  sinClases: 'Todavía no tenés clases.',
  profesorSinNombre: 'Profesor',
} as const;
