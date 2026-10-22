// Formato de fechas de nacimiento para la ficha (WEB-03): día de calendario, sin huso, con año.
import type { Dia } from '../../../lib/fechas';

const FORMATO = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** `1990-02-03` → «3 de febrero de 1990». Si no es un día válido devuelve el texto tal cual. */
export function formatearNacimiento(dia: Dia | null): string {
  if (dia === null || dia === '') return 'Sin dato';
  const fecha = new Date(`${dia}T12:00:00Z`);
  return Number.isNaN(fecha.getTime()) ? dia : FORMATO.format(fecha);
}
