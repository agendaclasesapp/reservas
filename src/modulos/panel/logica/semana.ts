// B20 · T20.1 · Semana ISO, ventana de 3 días, flechas en el borde del rango, agrupación por día y hora actual.
// CAL-03 (rama Semana), CAL-10, CAL-15, CAL-16, CAL-19 (rama Semana), INV-02; DEC-45 A con la lectura de H-475,
// DEC-46, ADR-023. Los días de calendario no tienen hora y su cuenta no depende del huso. «Hoy» y la hora actual sí
// dependen del huso, y siempre van en el del profesor (ADR-004), nunca en el del navegador.
// No persiste nada en el navegador (SEC-37): todo es puro o vive en el estado de React.
import { useEffect, useState } from 'react';
import { esDia, formatearHora, hoyEn, sumarDias, type Dia } from '../../../lib/fechas';
import { diaEnLimites, type LimitesAgenda } from '../../agenda/logica';
import type { IntervaloMinutos } from './eje';
import type { FilaAgendaDias } from './tipos';

/** CAL-15: la Semana va de lunes a domingo. */
export const DIAS_SEMANA = 7;
/** CAL-16: la ventana de pantallas angostas muestra 3 días seguidos y se corre de a 3. */
export const DIAS_VENTANA = 3;
/** CAL-16: debajo de este ancho (en rem) la vista Semana muestra la ventana de 3 días. */
export const ANCHO_MINIMO_SEMANA_REM = 60;
/** CAL-10: cada cuánto se mueve la línea de la hora actual (ms). */
export const PERIODO_AHORA_MS = 60_000;

/** Días de calendario sin hora: la cuenta no depende del huso (como en `agendaDias.ts`). */
const CALENDARIO = 'UTC';

/** Un día visible del calendario: `enRango` dentro de hoy ± 366 (CAL-03), `esHoy` en el huso del profesor. */
export interface DiaVisible {
  dia: Dia;
  enRango: boolean;
  esHoy: boolean;
}

/** Rango de días seguidos para `useAgendaDias` (ADR-023). */
export interface RangoDias {
  desde: Dia;
  hasta: Dia;
}

/** Un grupo de «Ver como lista» (CAL-19, DEC-46): las filas leídas de un día, en orden de `inicio`. */
export interface GrupoDia extends DiaVisible {
  filas: FilaAgendaDias[];
}

/** Hoy y la hora actual en el huso del profesor (CAL-10). `minutos` cuenta desde las 00:00. */
export interface AhoraDelProfesor {
  hoy: Dia;
  minutos: number;
}

/** Posición de la línea de la hora actual en el eje, en horas: la vista multiplica por `--cal-alto-hora`. */
export interface LineaAhora {
  arribaHoras: number;
  /** `14:05`, para el nombre accesible de la línea. */
  hora: string;
}

function sumar(dia: Dia, n: number): Dia {
  return sumarDias(dia, n, CALENDARIO);
}

/** Día de la semana ISO de un día de calendario: 1 es lunes y 7 es domingo. */
export function diaSemanaIso(dia: Dia): number {
  if (!esDia(dia)) throw new RangeError('Día inválido: se espera YYYY-MM-DD.');
  const [anio, mes, d] = dia.split('-').map(Number) as [number, number, number];
  const semana = new Date(Date.UTC(anio, mes - 1, d)).getUTCDay();
  return semana === 0 ? 7 : semana;
}

/** Lunes de la semana del día (las semanas van de lunes a domingo, CAL-03). */
export function lunesDe(dia: Dia): Dia {
  return sumar(dia, 1 - diaSemanaIso(dia));
}

/** `30/10/2026` (CAL-03). */
export function fechaNumerica(dia: Dia): string {
  if (!esDia(dia)) throw new RangeError('Día inválido: se espera YYYY-MM-DD.');
  const [anio, mes, d] = dia.split('-');
  return `${d}/${mes}/${anio}`;
}

/** `largo` días seguidos desde `inicio`. */
export function diasSeguidos(inicio: Dia, largo: number): Dia[] {
  return Array.from({ length: largo }, (_, i) => sumar(inicio, i));
}

/** CAL-15: de lunes a domingo de la semana del día, también si cruza un cambio de mes o de año. */
export function diasDeSemana(dia: Dia): Dia[] {
  return diasSeguidos(lunesDe(dia), DIAS_SEMANA);
}

/** CAL-16: la ventana de 3 días empieza en el día elegido. */
export function diasDeVentana(dia: Dia): Dia[] {
  return diasSeguidos(dia, DIAS_VENTANA);
}

/** CAL-03, CAL-16: `26/10/2026 - 01/11/2026` (del primer al último día visible); con un solo día, la fecha. */
export function tituloRango(dias: readonly Dia[]): string {
  const primero = dias[0];
  const ultimo = dias[dias.length - 1];
  if (primero === undefined || ultimo === undefined) throw new RangeError('Rango vacío.');
  return primero === ultimo ? fechaNumerica(primero) : `${fechaNumerica(primero)} - ${fechaNumerica(ultimo)}`;
}

/** Marca cada día con `enRango` (hoy ± 366, CAL-03) y `esHoy` (huso del profesor, CAL-10). */
export function diasVisibles(dias: readonly Dia[], limites: LimitesAgenda): DiaVisible[] {
  return dias.map((dia) => ({ dia, enRango: diaEnLimites(dia, limites), esHoy: dia === limites.hoy }));
}

/**
 * ADR-023, DEC-45 A: el rango que se pide a la base son los días visibles dentro de hoy ± 366. Como el rango
 * permitido es continuo, esos días son seguidos y alcanza con una lectura. Los de afuera no se piden y se ven vacíos.
 * Si ningún día está dentro, devuelve null.
 */
export function rangoALeer(dias: readonly DiaVisible[]): RangoDias | null {
  const dentro = dias.filter((d) => d.enRango);
  const desde = dentro[0];
  const hasta = dentro[dentro.length - 1];
  return desde && hasta ? { desde: desde.dia, hasta: hasta.dia } : null;
}

/** El primero de los `largo` días desde `inicio` que queda dentro de hoy ± 366, o null si ninguno queda. */
export function primerDiaDentro(inicio: Dia, largo: number, limites: LimitesAgenda): Dia | null {
  return diasSeguidos(inicio, largo).find((d) => diaEnLimites(d, limites)) ?? null;
}

/**
 * CAL-03 y DEC-45 A con la lectura de H-475. La flecha corre `paso` días (negativo para la anterior) el bloque de
 * `largo` días que empieza en `inicio`. Queda habilitada si algún día del bloque nuevo cae dentro de hoy ± 366 y
 * lleva al primero de esos días. Si ninguno cae dentro, devuelve null y la flecha queda deshabilitada.
 */
export function destinoFlecha(inicio: Dia, paso: number, largo: number, limites: LimitesAgenda): Dia | null {
  return primerDiaDentro(sumar(inicio, paso), largo, limites);
}

/**
 * CAL-19, DEC-46: las filas de una sola lectura repartidas por `dia`, en el orden de `dias`, para las columnas y para
 * «Ver como lista». Cada grupo lleva sus filas ordenadas por `inicio`. Un día fuera de hoy ± 366 queda sin filas y
 * sin huecos tocables (DEC-45 A). Las filas de un día que no está a la vista se descartan.
 */
export function agruparPorDia(dias: readonly DiaVisible[], filas: readonly FilaAgendaDias[]): GrupoDia[] {
  const porDia = new Map<Dia, FilaAgendaDias[]>();
  for (const f of filas) {
    const grupo = porDia.get(f.dia);
    if (grupo) grupo.push(f);
    else porDia.set(f.dia, [f]);
  }
  return dias.map((d) => ({
    ...d,
    filas: d.enRango ? [...(porDia.get(d.dia) ?? [])].sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio)) : [],
  }));
}

/** CAL-10: hoy y los minutos desde las 00:00 en el huso del profesor. `ahora` se inyecta en las pruebas. */
export function ahoraDelProfesor(zona: string, ahora: Date = new Date()): AhoraDelProfesor {
  const [h, m] = formatearHora(ahora, zona).split(':').map(Number) as [number, number];
  return { hoy: hoyEn(zona, ahora), minutos: h * 60 + m };
}

/**
 * CAL-10, CA-74: posición de la línea de la hora actual en la columna de `dia`. Solo hay línea si `dia` es hoy en el
 * huso del profesor y la hora cae dentro del eje (`eje.desdeMin` a `eje.hastaMin`). Si no, devuelve null.
 */
export function lineaAhora(dia: Dia, eje: IntervaloMinutos, zona: string, ahora: Date = new Date()): LineaAhora | null {
  const { hoy, minutos } = ahoraDelProfesor(zona, ahora);
  if (dia !== hoy || minutos < eje.desdeMin || minutos > eje.hastaMin) return null;
  return { arribaHoras: (minutos - eje.desdeMin) / 60, hora: formatearHora(ahora, zona) };
}

/**
 * CAL-10: el instante actual, renovado cada `periodoMs` (un minuto por defecto). Sirve para mover la línea de la hora
 * y para que «hoy» (`limitesPanel(zona, ahora)`) cambie a medianoche sin recargar. No guarda nada fuera de React.
 */
export function useAhora(periodoMs: number = PERIODO_AHORA_MS): Date {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), periodoMs);
    return () => clearInterval(id);
  }, [periodoMs]);
  return ahora;
}
