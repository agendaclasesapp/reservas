// Solicitudes pendientes del profesor y su respuesta (B07): `v_solicitudes_pendientes` (contratos.md §2) y
// `responder_solicitud(p_solicitud_id, p_decision, p_motivo)` (§3). SOL-04..06, SOL-08, PRF-06..08, AVI-03.
// Tipos a mano contra supabase/migrations/202611000702_* y 703_*. Errores con src/lib/errores.ts (SEC-17).
import { z } from 'zod';
import { traducirError, type CodigoTraducido } from '../../../lib/errores';
import { normalizarMotivo, type DependenciasLista } from './lista';
import { esquemaMotivo, MENSAJES_LISTA } from './tipos';

export const TIPOS_SOLICITUD = ['reserva', 'movimiento', 'cancelacion'] as const;
export type TipoSolicitud = (typeof TIPOS_SOLICITUD)[number];

export const ALCANCES = ['solo_esta', 'desde_aca'] as const;
export type Alcance = (typeof ALCANCES)[number];

export const DECISIONES = ['confirmar', 'rechazar'] as const;
export type Decision = (typeof DECISIONES)[number];

/** Fila de `v_solicitudes_pendientes`, ya ordenada por `fecha_clase` (PRF-06). */
export const esquemaSolicitudPendiente = z.object({
  id: z.string(),
  tipo: z.enum(TIPOS_SOLICITUD),
  alcance: z.enum(ALCANCES).nullable(),
  /** Inicio de la (primera) clase sobre la que trata. */
  fecha_clase: z.string(),
  /** Su horario pasó sin respuesta (SOL-08): ya no se puede responder (409 `SOLICITUD_VENCIDA`). */
  vencida: z.boolean(),
  alumno_id: z.string(),
  /** Texto (SEC-16); null si la persona ya no está en su lista. */
  titular: z.string().nullable(),
  quien_toma: z.string().nullable(),
  observacion: z.string().nullable(),
  reserva_tipo: z.enum(['suelta', 'serie']).nullable(),
  frecuencia: z.number().int().nullable(),
  /** Clase de origen (movimiento y cancelación, B08); null en una reserva. */
  origen_inicio: z.string().nullable(),
  origen_fin: z.string().nullable(),
  /** Primera clase pedida (reserva) o destino (movimiento); null en una cancelación. */
  destino_inicio: z.string().nullable(),
  destino_fin: z.string().nullable(),
  reserva_id: z.string().nullable(),
  clase_id: z.string().nullable(),
  creada_en: z.string(),
});
export type SolicitudPendiente = z.infer<typeof esquemaSolicitudPendiente>;

export const COLUMNAS_V_SOLICITUDES_PENDIENTES =
  'id, tipo, alcance, fecha_clase, vencida, alumno_id, titular, quien_toma, observacion, reserva_tipo, frecuencia, origen_inicio, origen_fin, destino_inicio, destino_fin, reserva_id, clase_id, creada_en';

export const MENSAJES_RESPUESTA = {
  confirmada: 'Solicitud confirmada. Le avisamos por mail.',
  rechazada: 'Solicitud rechazada. Le avisamos por mail.',
  /** PRF-08: inactivo no confirma (409 `PROFESOR_INACTIVO`), pero sí rechaza. */
  profesorInactivo:
    'Tu agenda está inactiva: no podés confirmar solicitudes hasta que el Administrador la reactive. Sí podés rechazarlas.',
  /** AVI-03: el motivo va en el mail de respuesta. */
  avisoMotivo: 'La persona recibe este motivo en el mail de respuesta.',
  /** SOL-08: pasó su horario sin respuesta. */
  vencida: 'Pendiente sin respuesta: su horario ya pasó.',
  tipo: {
    reserva: 'Reserva',
    movimiento: 'Cambio de horario',
    cancelacion: 'Cancelación',
  } satisfies Record<TipoSolicitud, string>,
  alcance: {
    solo_esta: 'Solo esta clase',
    desde_aca: 'De acá en adelante',
  } satisfies Record<Alcance, string>,
} as const;

export type FalloRespuesta = {
  ok: false;
  codigo: CodigoTraducido;
  mensaje: string;
  /** 422 del motivo (SEC-09); null en los demás errores. */
  campo: 'motivo' | null;
};
export type ResultadoRespuesta = { ok: true; estado: 'confirmada' | 'rechazada' } | FalloRespuesta;

function campoDelError(error: unknown): 'motivo' | null {
  const details = typeof error === 'object' && error !== null ? (error as { details?: unknown }).details : undefined;
  if (typeof details !== 'string') return null;
  try {
    const campo = (JSON.parse(details) as { campo?: unknown } | null)?.campo;
    return campo === 'motivo' || campo === 'p_motivo' ? 'motivo' : null;
  } catch {
    return null;
  }
}

/**
 * Traduce el error de `responder_solicitud`: `PROFESOR_INACTIVO` con el texto de PRF-08; `NO_ENCONTRADO`,
 * `SOLICITUD_YA_RESPONDIDA` y `SOLICITUD_VENCIDA` con el catálogo (SEC-17; nunca `details` crudos).
 */
export function falloRespuesta(error: unknown): FalloRespuesta {
  const { codigo, mensaje } = traducirError(error);
  if (codigo === 'PROFESOR_INACTIVO') {
    return { ok: false, codigo, mensaje: MENSAJES_RESPUESTA.profesorInactivo, campo: null };
  }
  if (codigo === 'DATOS_INVALIDOS' && campoDelError(error) === 'motivo') {
    return { ok: false, codigo, mensaje: MENSAJES_LISTA.motivoLargo, campo: 'motivo' };
  }
  return { ok: false, codigo, mensaje, campo: null };
}

const esquemaRespuesta = z.object({ estado: z.enum(['confirmada', 'rechazada']) });

/**
 * SOL-04..06, AVI-03: confirma o rechaza una solicitud dirigida al profesor, con motivo opcional (recortado;
 * vacío = sin motivo; hasta 500, SEC-09) que la persona recibe por mail. La base decide igual: 404 si no es
 * suya, 409 ya respondida, vencida o profesor inactivo al confirmar (PRF-08).
 */
export async function responderSolicitud(
  solicitudId: string,
  decision: Decision,
  motivo: string | null | undefined,
  deps: DependenciasLista,
): Promise<ResultadoRespuesta> {
  const p_motivo = normalizarMotivo(motivo);
  if (p_motivo !== null && !esquemaMotivo.safeParse(p_motivo).success) {
    return { ok: false, codigo: 'DATOS_INVALIDOS', mensaje: MENSAJES_LISTA.motivoLargo, campo: 'motivo' };
  }
  try {
    const cliente = await deps.obtenerCliente();
    const { data, error } = await cliente.rpc('responder_solicitud', {
      p_solicitud_id: solicitudId,
      p_decision: decision,
      p_motivo,
    });
    if (error) return falloRespuesta(error);
    return { ok: true, estado: esquemaRespuesta.parse(data).estado };
  } catch (e) {
    return falloRespuesta(e);
  }
}

/** `v_solicitudes_pendientes` (PRF-06), por fecha de la clase. Lanza el error de postgrest-js. */
export async function leerSolicitudesPendientes(deps: DependenciasLista): Promise<SolicitudPendiente[]> {
  const cliente = await deps.obtenerCliente();
  const { data, error } = await cliente
    .from('v_solicitudes_pendientes')
    .select(COLUMNAS_V_SOLICITUDES_PENDIENTES)
    .order('fecha_clase')
    .order('id');
  if (error) throw error;
  return z.array(esquemaSolicitudPendiente).parse(data ?? []);
}

/**
 * PRF-08: con el profesor inactivo no confirma (la base da 409) pero sí rechaza. Una vencida no se responde
 * (SOL-08): ni confirmar ni rechazar.
 */
export function accionesSolicitud(
  solicitud: Pick<SolicitudPendiente, 'vencida'>,
  profesorActivo: boolean,
): { confirmar: boolean; rechazar: boolean } {
  if (solicitud.vencida) return { confirmar: false, rechazar: false };
  return { confirmar: profesorActivo, rechazar: true };
}

/** Las que se pueden responder primero y las vencidas aparte, cada grupo en el orden recibido (fecha_clase). */
export function separarVencidas(solicitudes: readonly SolicitudPendiente[]): {
  vigentes: SolicitudPendiente[];
  vencidas: SolicitudPendiente[];
} {
  return {
    vigentes: solicitudes.filter((s) => !s.vencida),
    vencidas: solicitudes.filter((s) => s.vencida),
  };
}

/** «Reserva», «Cambio de horario · Solo esta clase», etc. (texto, SEC-16). */
export function textoTipoSolicitud(solicitud: Pick<SolicitudPendiente, 'tipo' | 'alcance'>): string {
  const tipo = MENSAJES_RESPUESTA.tipo[solicitud.tipo];
  return solicitud.alcance ? `${tipo} · ${MENSAJES_RESPUESTA.alcance[solicitud.alcance]}` : tipo;
}
