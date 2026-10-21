// Fechas en el huso del profesor (ADR-004, CA-16). La web no hace aritmética de husos: muestra
// instantes con Intl.DateTimeFormat en la zona de config_publica() y opera días de calendario
// (`YYYY-MM-DD`) con TZDate en esa zona. Nunca usa el huso del navegador.
import { addDays, format } from 'date-fns';
import { TZDate } from '@date-fns/tz';

/** Día de calendario `YYYY-MM-DD`, interpretado en el huso del profesor. */
export type Dia = string;
/** Instante ISO-8601 con desplazamiento (salida de PostgREST) o Date. */
export type Instante = string | Date;

const FORMATO_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCALE = 'es';

const formateadores = new Map<string, Intl.DateTimeFormat>();

function formateador(zona: string, opciones: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const clave = `${zona}|${JSON.stringify(opciones)}`;
  let f = formateadores.get(clave);
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALE, { ...opciones, timeZone: zona });
    formateadores.set(clave, f);
  }
  return f;
}

function aDate(instante: Instante): Date {
  const d = instante instanceof Date ? instante : new Date(instante);
  if (Number.isNaN(d.getTime())) throw new RangeError('Instante inválido.');
  return d;
}

/** true si el texto es un día `YYYY-MM-DD` que existe en el calendario. */
export function esDia(valor: unknown): valor is Dia {
  if (typeof valor !== 'string') return false;
  const m = FORMATO_DIA.exec(valor);
  if (!m) return false;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

function partesDia(dia: Dia): [number, number, number] {
  if (!esDia(dia)) throw new RangeError('Día inválido: se espera YYYY-MM-DD.');
  const [anio, mes, d] = dia.split('-').map(Number) as [number, number, number];
  return [anio, mes, d];
}

/** Hora local del profesor, `HH:mm` (24 h). */
export function formatearHora(instante: Instante, zona: string): string {
  return formateador(zona, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(aDate(instante));
}

/** Fecha larga del instante en el huso del profesor, p. ej. «lunes, 2 de noviembre». */
export function formatearFecha(instante: Instante, zona: string): string {
  return formateador(zona, { weekday: 'long', day: 'numeric', month: 'long' }).format(aDate(instante));
}

/** Día de calendario del instante en el huso del profesor. */
export function diaDeInstante(instante: Instante, zona: string): Dia {
  return format(new TZDate(aDate(instante).getTime(), zona), 'yyyy-MM-dd');
}

/** Hoy en el huso del profesor. `ahora` se inyecta en las pruebas. */
export function hoyEn(zona: string, ahora: Date = new Date()): Dia {
  return diaDeInstante(ahora, zona);
}

/** Día de calendario + n días (n puede ser negativo), en el huso del profesor. */
export function sumarDias(dia: Dia, n: number, zona: string): Dia {
  const [anio, mes, d] = partesDia(dia);
  return format(addDays(new TZDate(anio, mes - 1, d, zona), n), 'yyyy-MM-dd');
}

/** Un día de calendario en texto, p. ej. «lunes, 2 de noviembre» (no depende de ningún huso). */
export function formatearDia(dia: Dia): string {
  const [anio, mes, d] = partesDia(dia);
  return formateador('UTC', { weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(Date.UTC(anio, mes - 1, d, 12)),
  );
}
