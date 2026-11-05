// B19 · T19.1 · Responder una solicitud pendiente desde el calendario (CAL-12, CA-76; ADR-025; DEC-42 A, DEC-43 A).
// Adaptador fino sobre `responderSolicitud` y `accionesSolicitud` de `lista/logica`, usados tal cual (INV-04): mismo
// RPC `responder_solicitud`, mismos mensajes y mismo mail con el motivo (AVI-03). Qué se puede confirmar o rechazar
// lo decide `accionesSolicitud`, y la base es la última barrera (INV-01, SEC-36): acá no hay reglas propias.
import {
  accionesSolicitud,
  esquemaMotivo,
  MENSAJES_RESPUESTA,
  responderSolicitud,
  type Decision,
  type DependenciasLista,
  type FalloRespuesta,
} from '../../lista/logica';
import type { BloqueClase } from './eje';
import type { FilaAgendaDias, TipoSolicitud } from './tipos';

export { esquemaMotivo, LARGO_MAX_MOTIVO, MENSAJES_RESPUESTA } from '../../lista/logica';
export type { Decision, FalloRespuesta } from '../../lista/logica';

/** Solicitud que se responde desde un bloque o una fila del calendario. */
export interface SolicitudEnCalendario {
  /** `solicitud_id`: el que recibe `responder_solicitud`. */
  id: string;
  tipo: TipoSolicitud;
  /** `clase_id` del bloque que la muestra. */
  claseId: string;
}

/**
 * ADR-025 (DEC-42 A, DEC-43 A): la solicitud que se responde desde este bloque, o `null`.
 * - Bloque PENDIENTE (reserva o destino de un movimiento): su solicitud.
 * - Clase CONFIRMADA con «Cancelación pendiente»: su solicitud de cancelación.
 * - Origen de un movimiento (CONFIRMADA con solicitud `movimiento`): `null`; se responde desde su destino o desde
 *   la Lista (H-371). `cancelacionPendiente` es solo presentación (N-2): se mira `estado` y `solicitudTipo`.
 */
export function solicitudDeBloque(
  bloque: Pick<BloqueClase, 'id' | 'estado' | 'solicitudId' | 'solicitudTipo'>,
): SolicitudEnCalendario | null {
  const { id: claseId, estado, solicitudId, solicitudTipo } = bloque;
  if (solicitudId === null || solicitudTipo === null) return null;
  const responde = estado === 'pendiente' || (estado === 'confirmada' && solicitudTipo === 'cancelacion');
  return responde ? { id: solicitudId, tipo: solicitudTipo, claseId } : null;
}

/** Lo mismo que `solicitudDeBloque` para una fila de `agenda_profesor_dias` (vista «Ver como lista», CAL-19). */
export function solicitudDeFila(
  fila: Pick<FilaAgendaDias, 'clase_id' | 'clase_estado' | 'solicitud_id' | 'solicitud_tipo'>,
): SolicitudEnCalendario | null {
  if (fila.clase_id === null || fila.clase_estado === null) return null;
  return solicitudDeBloque({
    id: fila.clase_id,
    estado: fila.clase_estado,
    solicitudId: fila.solicitud_id,
    solicitudTipo: fila.solicitud_tipo,
  });
}

/**
 * `accionesSolicitud` de la Lista (PRF-08: inactivo no confirma pero sí rechaza). La agenda solo trae solicitudes
 * no vencidas (ADR-025): si vence entre la lectura y la respuesta, la base responde 409 `SOLICITUD_VENCIDA`.
 */
export function accionesRespuesta(profesorActivo: boolean): { confirmar: boolean; rechazar: boolean } {
  return accionesSolicitud({ vencida: false }, profesorActivo);
}

/** «Confirmar» habilitado (PRF-08, INV-05): `accionesRespuesta(profesorActivo).confirmar`. */
export function puedeConfirmar(profesorActivo: boolean): boolean {
  return accionesRespuesta(profesorActivo).confirmar;
}

/**
 * Texto del error del motivo con `esquemaMotivo` de la Lista (hasta `LARGO_MAX_MOTIVO`, SEC-09), o `null` si sirve.
 * Vacío o solo espacios es «sin motivo» y sirve.
 */
export function validarMotivo(motivo: string | null | undefined): string | null {
  const r = esquemaMotivo.safeParse(motivo ?? '');
  return r.success ? null : (r.error.issues[0]?.message ?? null);
}

/**
 * Códigos tras los cuales lo que ve el profesor quedó desactualizado y se vuelve a leer: los mismos que la Lista
 * (`SolicitudesPendientes`). La vencida da el mensaje del catálogo, el mismo que en la Lista.
 */
export const CODIGOS_RESPUESTA_DESACTUALIZADA: ReadonlySet<string> = new Set([
  'SOLICITUD_YA_RESPONDIDA',
  'SOLICITUD_VENCIDA',
  'NO_ENCONTRADO',
]);

export type ResultadoRespuestaCalendario =
  | { ok: true; estado: 'confirmada' | 'rechazada'; mensaje: string }
  | (FalloRespuesta & {
      /** true: ya se pidió la relectura del rango visible y de los contadores. */
      desactualizada: boolean;
    });

export interface OpcionesRespuesta {
  /**
   * Relee el rango visible y los contadores, como tras las acciones de B18:
   * `useAgendaDias(nav.desde, nav.hasta).recargar()` y `useContadores().recargar()`.
   */
  releer: () => void;
  /** Cliente de la RPC; por defecto, el real de la Lista (ADR-017). Solo para pruebas. */
  deps?: DependenciasLista;
}

async function responder(
  solicitud: SolicitudEnCalendario,
  decision: Decision,
  motivo: string | null,
  { releer, deps }: OpcionesRespuesta,
): Promise<ResultadoRespuestaCalendario> {
  const r = await responderSolicitud(solicitud.id, decision, motivo, deps);
  if (r.ok) {
    releer();
    const mensaje = r.estado === 'confirmada' ? MENSAJES_RESPUESTA.confirmada : MENSAJES_RESPUESTA.rechazada;
    return { ok: true, estado: r.estado, mensaje };
  }
  const desactualizada = CODIGOS_RESPUESTA_DESACTUALIZADA.has(r.codigo);
  if (desactualizada) releer();
  return { ...r, desactualizada };
}

/** CAL-12, CA-76: confirma (el bloque pasa a CONFIRMADA con la relectura). No lanza. */
export function confirmarSolicitud(
  solicitud: SolicitudEnCalendario,
  opciones: OpcionesRespuesta,
): Promise<ResultadoRespuestaCalendario> {
  return responder(solicitud, 'confirmar', null, opciones);
}

/**
 * CAL-12, CA-76, AVI-03: rechaza con motivo opcional (recortado; vacío = sin motivo) que la persona recibe por
 * mail; el bloque sale del calendario con la relectura. Un motivo largo da 422 de la Lista sin llamar. No lanza.
 */
export function rechazarSolicitud(
  solicitud: SolicitudEnCalendario,
  motivo: string | null | undefined,
  opciones: OpcionesRespuesta,
): Promise<ResultadoRespuestaCalendario> {
  return responder(solicitud, 'rechazar', motivo ?? null, opciones);
}
