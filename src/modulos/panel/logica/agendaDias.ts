// B16 · T16.1 · Lector de varios días de la agenda del profesor: `agenda_profesor_dias(p_desde, p_hasta)`.
// contratos.md §2 (calendario-profesor), ADR-023. CAL-07, CAL-08, CAL-09, INV-02, INV-05, SEC-09, SEC-17, SEC-35.
// El profesor sale de la sesión en la base (INV-02): el lector solo manda el rango.
import { z } from 'zod';
import { traducirError, type CodigoTraducido } from '../../../lib/errores';
import { esDia, sumarDias, type Dia } from '../../../lib/fechas';
import type { DependenciasPanel } from './panel';
import { esquemaFilaAgendaDias, MAX_DIAS_AGENDA, type FilaAgendaDias } from './tipos';

/** Texto de falla de red que `traducirError` reconoce como `SIN_CONEXION` (no se copia el mensaje original). */
const MESSAGE_SIN_CONEXION = 'Failed to fetch';

/**
 * Error saneado de la lectura de varios días (SEC-17, SEC-35): solo el código del catálogo de `errores.ts` y su
 * texto. No lleva `details`, `hint`, `cause` ni filas: el error de postgrest-js y el de zod no salen de acá.
 * `message` es el código del catálogo (o un texto de red fijo), así `mensajeDeError(e)` da el mismo texto que
 * `mensaje` y `useLecturaPanel` lo muestra tal cual.
 */
export class ErrorAgendaDias extends Error {
  readonly codigo: CodigoTraducido;
  readonly mensaje: string;

  constructor(error: unknown) {
    const { codigo, mensaje } = traducirError(error);
    super(codigo === 'SIN_CONEXION' ? MESSAGE_SIN_CONEXION : codigo);
    this.name = 'ErrorAgendaDias';
    this.codigo = codigo;
    this.mensaje = mensaje;
  }
}

/** SEC-09: dos días válidos, `desde <= hasta <= desde + 6`. Los límites de hoy ± 366 los decide la base. */
function rangoValido(desde: Dia, hasta: Dia): boolean {
  if (!esDia(desde) || !esDia(hasta)) return false;
  // Días de calendario sin hora: el huso no cambia la cuenta.
  return hasta >= desde && hasta <= sumarDias(desde, MAX_DIAS_AGENDA - 1, 'UTC');
}

/**
 * `agenda_profesor_dias(p_desde, p_hasta)` (ADR-023): la agenda del profesor de la sesión de cada día del rango
 * (de 1 a 7), ordenada por `dia`, `inicio`, `clase_id`. Un rango inválido no sale a la red. Cualquier fallo —error
 * de la RPC, de red o filas con otra forma— se lanza como `ErrorAgendaDias` con el texto del catálogo; lo
 * desconocido y la forma inválida dan el mensaje genérico (SEC-17, SEC-35).
 */
export async function leerAgendaDias(desde: Dia, hasta: Dia, deps: DependenciasPanel): Promise<FilaAgendaDias[]> {
  if (!rangoValido(desde, hasta)) throw new ErrorAgendaDias({ message: 'DATOS_INVALIDOS' });
  try {
    const cliente = await deps.obtenerCliente();
    const { data, error } = await cliente.rpc('agenda_profesor_dias', { p_desde: desde, p_hasta: hasta });
    if (error) throw new ErrorAgendaDias(error);
    const filas = z.array(esquemaFilaAgendaDias).safeParse(data ?? []);
    if (!filas.success) throw new ErrorAgendaDias(null);
    return filas.data;
  } catch (e) {
    throw e instanceof ErrorAgendaDias ? e : new ErrorAgendaDias(e);
  }
}
