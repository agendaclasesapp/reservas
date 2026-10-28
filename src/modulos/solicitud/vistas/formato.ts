// Textos de fechas del formulario de solicitud (WEB-04, RES-05): siempre en el huso del profesor (AGE-08).
import { diaDeInstante, formatearFecha, formatearHora } from '../../../lib/fechas';

/** «lunes, 2 de noviembre»; con el año (`de 2027`) si cae en otro año que el de referencia. */
export function textoFecha(inicio: string, zona: string, instanteReferencia?: string): string {
  const base = formatearFecha(inicio, zona);
  if (instanteReferencia === undefined) return base;
  const anio = diaDeInstante(inicio, zona).slice(0, 4);
  return anio === diaDeInstante(instanteReferencia, zona).slice(0, 4) ? base : `${base} de ${anio}`;
}

/** «lunes, 2 de noviembre, 08:00 a 09:00» del hueco que se pide. */
export function textoHorario(inicio: string, fin: string, zona: string): string {
  return `${formatearFecha(inicio, zona)}, ${formatearHora(inicio, zona)} a ${formatearHora(fin, zona)}`;
}

/** Hora de inicio, «08:00». */
export function textoHora(inicio: string, zona: string): string {
  return formatearHora(inicio, zona);
}
