// Qué fila del calendario es una solicitud que se responde desde el Panel (CAL-12; DEC-42 A, DEC-43 A; ADR-025): la
// regla (bloque PENDIENTE y clase CONFIRMADA con «Cancelación pendiente»; el origen de un movimiento no) es la de
// `solicitudDeFila` de la lógica; acá solo se suman el nombre de quien pide y la fecha para los nombres accesibles. Con
// qué botones (confirmar / rechazar) lo decide `accionesRespuesta` de la lógica. Nombre como texto (SEC-16).
import { nombreVisible } from '../../lista/logica';
import { solicitudDeFila as solicitudDeLaLogica, TIPOS_SOLICITUD, type FilaAgendaDias, type SolicitudEnCalendario } from '../logica';
import { fechaCorta, textoRango } from './formato';

export type SolicitudDeFila = {
  /** Lo que recibe `responder` (`solicitud_id`, tipo y clase). */
  solicitud: SolicitudEnCalendario;
  /** Quien pide (titular), como texto. */
  nombre: string;
  /** «12/11 10:00, 10:00 a 11:00»: fecha y hora de la clase, para el nombre accesible de los botones de una lista. */
  cuando: string;
};

/** La solicitud que se responde desde esta fila, o `null` si no hay (libre, bloqueada, pasada, sin pedido o de origen). */
export function solicitudDeFila(fila: FilaAgendaDias, zona: string): SolicitudDeFila | null {
  if (fila.estado !== 'ocupado' || fila.pasada) return null;
  // `solicitud_tipo` viene en las filas de `agenda_profesor_dias` (`FilaAgendaDias`): sin él no se sabe de qué pedido es la clase.
  const tipo = TIPOS_SOLICITUD.find((t) => t === fila.solicitud_tipo) ?? null;
  const solicitud = solicitudDeLaLogica({
    clase_id: fila.clase_id,
    clase_estado: fila.clase_estado,
    solicitud_id: fila.solicitud_id,
    solicitud_tipo: tipo,
  });
  if (solicitud === null) return null;
  return {
    solicitud,
    nombre: nombreVisible(fila.titular),
    cuando: `${fechaCorta(fila.inicio, zona)}, ${textoRango(fila, zona)}`,
  };
}
