// Contrato de presentación del calendario del Panel (CAL-01, CAL-07, CAL-08). La geometría (eje, posición y alto de
// los bloques, DEC-44 A, DEC-50 A) y la navegación viven en `logica/` (`eje.ts`, `vistaCalendario.ts`; ADR-024): acá
// solo hay lo que es de presentación, el estado de la lectura que dibuja `CalendarioPanel` y los nombres de los días.
import type { CSSProperties } from 'react';
import { formatearDia, type Dia } from '../../../lib/fechas';
import type { ColumnaCalendario, PosicionEnEje } from '../logica';

/** Estado de la lectura del calendario (F-CAL-11): `sinClases` lo calcula la lógica (`sinClases`, CAL-18). */
export type EstadoCalendario =
  | { estado: 'cargando' }
  | { estado: 'error'; mensaje: string }
  | { estado: 'listo'; columnas: readonly ColumnaCalendario[]; sinClases: boolean };

/** Variables CSS en línea: el alto de la hora y la posición de cada bloque salen de los datos, no de un literal. */
export type VariablesCss = CSSProperties & Record<`--${string}`, string | number>;

const DIA_CORTO = new Intl.DateTimeFormat('es', { weekday: 'short', timeZone: 'UTC' });

/** «Lun 26/10»: día corto con día y mes de dos cifras (nombre accesible de los bloques, A11Y-36). */
export function diaCorto(dia: Dia): string {
  const [anio, mes, d] = dia.split('-').map(Number);
  const semana = DIA_CORTO.format(new Date(Date.UTC(anio ?? 1970, (mes ?? 1) - 1, d ?? 1, 12))).replace('.', '');
  const nombre = semana.charAt(0).toUpperCase() + semana.slice(1);
  return `${nombre} ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

/** Nombre largo del día, «jueves, 12 de noviembre», para nombrar su columna. */
export function nombreDelDia(dia: Dia): string {
  return formatearDia(dia);
}

/**
 * Variables CSS de un elemento de la columna: arriba y alto en horas (la hoja de estilos multiplica por
 * `--cal-alto-hora`) y su carril entre los que se solapan. Todo viene de la lógica (`posicion`, `carril`, `carriles`).
 */
export function variablesDeElemento(
  { arribaHoras, altoHoras }: PosicionEnEje,
  { carril, carriles }: { carril: number; carriles: number },
): VariablesCss {
  return { '--cal-arriba': arribaHoras, '--cal-alto': altoHoras, '--cal-carril': carril, '--cal-carriles': carriles };
}

/** CC-09 · Posición de la línea de la hora actual de un día, en horas desde el comienzo del eje y su `HH:MM` (`lineaAhora` de la lógica, CAL-10). */
export type { LineaAhora as LineaAhoraDia } from '../logica';
