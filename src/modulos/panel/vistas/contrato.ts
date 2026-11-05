// Contrato de las vistas del panel (T09.2): lo que el Developer o la página conectan y lo que las vistas devuelven.
// Las vistas no llaman a la red: reciben estas funciones (las de `logica/` o simuladas en las pruebas).
import type { Dia } from '../../../lib/fechas';
import type { PersonaACargo } from '../../ficha/logica';
import type {
  Alcance,
  Decision,
  EntradaBloqueo,
  EntradaCrearClase,
  FilaAgendaProfesor,
  ResultadoBloquear,
  ResultadoCancelar,
  ResultadoCrear,
  ResultadoDesbloquear,
  ResultadoMover,
  ResultadoRespuestaCalendario,
  SolicitudEnCalendario,
} from '../logica';

/**
 * `confirmarSolicitud` / `rechazarSolicitud` de `logica/respuesta.ts` (CAL-12, ADR-025): confirma o rechaza una
 * solicitud, con motivo opcional solo al rechazar. No lanza. Quien la conecta pasa la relectura (`releer`) a la lógica:
 * las vistas no vuelven a releer tras un `ok` ni tras un fallo `desactualizada`.
 */
export type ResponderSolicitudAccion = (
  solicitud: SolicitudEnCalendario,
  decision: Decision,
  motivo: string | null,
) => Promise<ResultadoRespuestaCalendario>;

export type AccionesPanel = {
  /** `crearClase` de `logica/` (PRF-01, PRF-04): devuelve un resultado, no lanza. */
  crear: (entrada: EntradaCrearClase) => Promise<ResultadoCrear>;
  /** `moverClase` (PRF-02). */
  mover: (claseId: string, destino: string, alcance: Alcance) => Promise<ResultadoMover>;
  /** `cancelarClase` (PRF-03, PRF-08). */
  cancelar: (claseId: string, alcance: Alcance) => Promise<ResultadoCancelar>;
  /** `bloquear` de `logica/` (AGE-05, CA-14): `zona` es el huso del profesor. Devuelve un resultado, no lanza. */
  bloquear: (entrada: EntradaBloqueo, zona: string) => Promise<ResultadoBloquear>;
  /** `desbloquear` (AGE-06, CA-52): quita un bloqueo suyo por su id. Devuelve un resultado, no lanza. */
  desbloquear: (bloqueoId: string) => Promise<ResultadoDesbloquear>;
  /** `leerAgendaProfesor`: los huecos de otro día, para elegir el destino de «Mover» (lanza el error de postgrest-js). */
  leerDia: (dia: Dia) => Promise<FilaAgendaProfesor[]>;
  /**
   * `leerPersonasACargo` de `ficha/logica`: las personas a cargo de un alumno, para «¿Quién toma la clase?».
   * Debe ser una referencia estable. Sin ella, la clase queda siempre a nombre del titular.
   */
  leerPersonasACargo?: (alumnoId: string) => Promise<PersonaACargo[]>;
  /**
   * Responder una solicitud pendiente desde el calendario o la lista (CAL-12, DEC-42 A, DEC-43 A). Sin ella las
   * solicitudes quedan de solo lectura con el enlace a la Lista, como antes de B19.
   */
  responder?: ResponderSolicitudAccion;
};

/** Lo que una operación exitosa le cuenta a la página: se anuncia y se muestra sobre la agenda. */
export type ResultadoPanel = {
  /** Titular del aviso, p. ej. «Clase movida al 12/11 10:00». */
  mensaje: string;
  /** Segunda línea, opcional (aviso por mail). */
  detalle?: string;
  /** Instantes (UTC) de las fechas de una serie que no se reservaron (RES-05). */
  salteadas: readonly string[];
};

/** Códigos tras los cuales la agenda que ve el profesor quedó desactualizada: se vuelve a leer. */
export const CODIGOS_DESACTUALIZADA: ReadonlySet<string> = new Set([
  'HUECO_NO_LIBRE',
  'CLASE_NO_MODIFICABLE',
  'NO_ENCONTRADO',
  'SOLICITUD_EN_CURSO',
]);
