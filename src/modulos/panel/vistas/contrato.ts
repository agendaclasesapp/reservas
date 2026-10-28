// Contrato de las vistas del panel (T09.2): lo que el Developer o la página conectan y lo que las vistas devuelven.
// Las vistas no llaman a la red: reciben estas funciones (las de `logica/` o simuladas en las pruebas).
import type { Dia } from '../../../lib/fechas';
import type { PersonaACargo } from '../../ficha/logica';
import type {
  Alcance,
  EntradaCrearClase,
  FilaAgendaProfesor,
  ResultadoCancelar,
  ResultadoCrear,
  ResultadoMover,
} from '../logica';

export type AccionesPanel = {
  /** `crearClase` de `logica/` (PRF-01, PRF-04): devuelve un resultado, no lanza. */
  crear: (entrada: EntradaCrearClase) => Promise<ResultadoCrear>;
  /** `moverClase` (PRF-02). */
  mover: (claseId: string, destino: string, alcance: Alcance) => Promise<ResultadoMover>;
  /** `cancelarClase` (PRF-03, PRF-08). */
  cancelar: (claseId: string, alcance: Alcance) => Promise<ResultadoCancelar>;
  /** `leerAgendaProfesor`: los huecos de otro día, para elegir el destino de «Mover» (lanza el error de postgrest-js). */
  leerDia: (dia: Dia) => Promise<FilaAgendaProfesor[]>;
  /**
   * `leerPersonasACargo` de `ficha/logica`: las personas a cargo de un alumno, para «¿Quién toma la clase?».
   * Debe ser una referencia estable. Sin ella, la clase queda siempre a nombre del titular.
   */
  leerPersonasACargo?: (alumnoId: string) => Promise<PersonaACargo[]>;
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
