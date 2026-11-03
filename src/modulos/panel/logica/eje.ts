// B17 · T17.1 · Geometría del eje de horas y bloques de clase del calendario (ADR-024, ADR-023).
// CAL-04 (eje desde la grilla), CAL-07/CAL-08 (bloques confirmados y pendientes con alto proporcional), CAL-09
// (canceladas y rechazadas no llegan: las filtra la base). DEC-42 A, DEC-44 A, DEC-50 A. Todo en el huso del
// profesor (ADR-004): los minutos son minutos desde las 00:00 del día de calendario.
import { diaDeInstante, formatearHora, type Dia } from '../../../lib/fechas';
import type { TramoGrilla } from '../../configuracion/logica';
import type { EstadoClaseAgenda, FilaAgendaDias, TipoClase, TipoSolicitud } from './tipos';
import { diaSemanaIso } from './vistaCalendario';

export const MINUTOS_DIA = 24 * 60;

/** ADR-024: sin tramos el eje es el de la grilla inicial (AGE-01: 08:00 a 18:00). */
export const EJE_SIN_GRILLA = { desdeMin: 8 * 60, hastaMin: 18 * 60 } as const;

/** `--cal-alto-hora` de UX: 5,5 rem por hora (30 min = 2,75 rem = 44 px). */
export const ALTO_HORA_BASE_REM = 5.5;
/** NFR-12, DEC-50 A: un hueco del profesor mide al menos 2,75 rem (44 px). */
export const ALTO_MINIMO_HUECO_REM = 2.75;
/**
 * ADR-024 A-2 (H-472): tope del alto de una hora, 16,5 rem. Es el alto con el que un hueco de 10 min mide 44 px;
 * debajo de esa duración la alternativa accesible es «Ver como lista» (CA-83).
 */
export const ALTO_HORA_MAXIMO_REM = 16.5;
/** ADR-024 A-2 (H-472): desde esta duración (min) un hueco del calendario mide al menos 44 px. */
export const DURACION_MINIMA_CALENDARIO_MIN = 10;

/** Un intervalo en minutos del día, `[desdeMin, hastaMin)`. */
export interface IntervaloMinutos {
  desdeMin: number;
  hastaMin: number;
}

/** Línea del eje: una por hora y otra por media hora (CAL-04). */
export interface MarcaEje {
  minutos: number;
  /** `08:00`, `08:30`. */
  etiqueta: string;
  tipo: 'hora' | 'media';
}

/** Geometría del eje (CC-03 `EjeHoras`): horas en punto y alto de una hora para `--cal-alto-hora`. */
export interface EjeCalendario extends IntervaloMinutos {
  /** Hora en punto de inicio (0 a 23). */
  desdeHora: number;
  /** Hora en punto de fin (1 a 24). */
  hastaHora: number;
  /** Alto de una hora en rem (DEC-50 A). */
  altoHoraRem: number;
  /** El mismo alto como valor CSS (`5.5rem`) para `--cal-alto-hora`. */
  altoHora: string;
  marcas: MarcaEje[];
}

/**
 * Bloque de una clase confirmada o pendiente de un día (CC-06 `BloqueClase`), armado de las filas con el mismo
 * `clase_id` con sus horas reales (`clase_inicio`/`clase_fin`, CA-72).
 */
export interface BloqueClase {
  /** `clase_id`. */
  id: string;
  dia: Dia;
  /** Instantes reales de la clase (ISO). */
  inicio: string;
  fin: string;
  /** Minutos del día en el huso del profesor, recortados al día (una clase que cruza la medianoche). */
  inicioMin: number;
  finMin: number;
  /** DEC-42 A: toda clase `pendiente` (también el destino de un movimiento) se dibuja como PENDIENTE (CAL-08). */
  estado: EstadoClaseAgenda;
  quien: string | null;
  titular: string | null;
  observacion: string | null;
  reservaTipo: TipoClase | null;
  solicitudId: string | null;
  solicitudTipo: TipoSolicitud | null;
  /** DEC-43 A (contratos.md §2): confirmada con una cancelación pendiente. */
  cancelacionPendiente: boolean;
  /** `pasada` de la primera fila (la base decide con `app_ahora()`, ADR-014). */
  pasada: boolean;
  /** Primera fila de la clase, por `inicio`: la que se pasa a `accionesFila`. */
  fila: FilaAgendaDias;
}

/** Las filas y los bloques de un día visible. */
export interface DiaCalendario {
  dia: Dia;
  /** Filas del día en orden de `inicio` (huecos libres, ocupados y bloqueados). */
  filas: FilaAgendaDias[];
  clases: BloqueClase[];
}

/** Posición de un intervalo en el eje, en horas: la vista multiplica por `--cal-alto-hora`. */
export interface PosicionEnEje {
  arribaHoras: number;
  altoHoras: number;
}

/** `HH:MM` (o `24:00`) → minutos. */
export function minutosDeHora(hora: string): number {
  const [h, m] = hora.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

function horaDeMinutos(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Minutos del instante en el día `dia` del huso del profesor: 0 si es de un día anterior, 1440 si es posterior. */
export function minutosEnDia(instante: string, dia: Dia, zona: string): number {
  const suDia = diaDeInstante(instante, zona);
  if (suDia < dia) return 0;
  if (suDia > dia) return MINUTOS_DIA;
  return minutosDeHora(formatearHora(instante, zona));
}

/**
 * DEC-50 A con el tope de ADR-024 A-2 (H-472, NFR-12): `min(16,5 rem, max(5,5 rem, 2,75 rem × 60 / duración))`. Desde
 * 10 min un hueco de la duración del profesor mide al menos 44 px y todo sigue proporcional (CA-72); debajo de 10 min
 * el alto queda en 16,5 rem y la alternativa es «Ver como lista» (CA-83). Se redondea hacia arriba al milésimo.
 */
export function altoHoraRem(duracionMin: number): number {
  if (!Number.isFinite(duracionMin) || duracionMin <= 0) return ALTO_HORA_BASE_REM;
  const minimo = (ALTO_MINIMO_HUECO_REM * 60) / duracionMin;
  return Math.min(ALTO_HORA_MAXIMO_REM, Math.max(ALTO_HORA_BASE_REM, Math.ceil(minimo * 1000) / 1000));
}

/** Tramos de la grilla del día de la semana de `dia`, en minutos y en orden (CAL-05). */
export function tramosDelDia(grilla: readonly TramoGrilla[], dia: Dia): IntervaloMinutos[] {
  const semana = diaSemanaIso(dia);
  return grilla
    .filter((t) => t.dia_semana === semana)
    .map((t) => ({ desdeMin: minutosDeHora(t.desde), hastaMin: minutosDeHora(t.hasta) }))
    .sort((a, b) => a.desdeMin - b.desdeMin);
}

/** ADR-024, CAL-05: lo que ningún tramo de ese día cubre dentro del eje (fondo sombreado, no tocable). */
export function zonasFueraDeTramo(grilla: readonly TramoGrilla[], dia: Dia, eje: IntervaloMinutos): IntervaloMinutos[] {
  const zonas: IntervaloMinutos[] = [];
  let cursor = eje.desdeMin;
  for (const t of tramosDelDia(grilla, dia)) {
    const desde = Math.max(t.desdeMin, eje.desdeMin);
    if (desde > cursor) zonas.push({ desdeMin: cursor, hastaMin: Math.min(desde, eje.hastaMin) });
    cursor = Math.max(cursor, Math.min(t.hastaMin, eje.hastaMin));
  }
  if (cursor < eje.hastaMin) zonas.push({ desdeMin: cursor, hastaMin: eje.hastaMin });
  return zonas.filter((z) => z.hastaMin > z.desdeMin);
}

/**
 * CAL-04, CA-69, ADR-024: eje desde la hora en punto anterior o igual al primer `desde` de la grilla semanal hasta
 * la hora en punto posterior o igual al último `hasta` (08:00 a 18:00 con la grilla inicial; 07:30-12:15 → 07:00 a
 * 13:00). Sin tramos, 08:00 a 18:00. DEC-44 A: se amplía para cubrir las clases y solicitudes visibles que quedan
 * fuera. El alto de la hora sale de la duración del profesor (DEC-50 A, A-2). `clases` acepta cualquier intervalo
 * `inicioMin`/`finMin`: con la configuración en error, `calendarioConElementos` pasa también los huecos leídos (A-3).
 */
export function ejeCalendario(
  grilla: readonly TramoGrilla[],
  duracionMin: number,
  clases: readonly Pick<BloqueClase, 'inicioMin' | 'finMin'>[] = [],
): EjeCalendario {
  let desdeMin: number = grilla.length ? Math.min(...grilla.map((t) => minutosDeHora(t.desde))) : EJE_SIN_GRILLA.desdeMin;
  let hastaMin: number = grilla.length ? Math.max(...grilla.map((t) => minutosDeHora(t.hasta))) : EJE_SIN_GRILLA.hastaMin;
  for (const c of clases) {
    if (c.finMin <= c.inicioMin) continue;
    desdeMin = Math.min(desdeMin, c.inicioMin);
    hastaMin = Math.max(hastaMin, c.finMin);
  }
  const desdeHora = Math.max(0, Math.floor(desdeMin / 60));
  const hastaHora = Math.min(24, Math.max(desdeHora + 1, Math.ceil(hastaMin / 60)));
  const marcas: MarcaEje[] = [];
  for (let h = desdeHora; h <= hastaHora; h++) {
    marcas.push({ minutos: h * 60, etiqueta: horaDeMinutos(h * 60), tipo: 'hora' });
    if (h < hastaHora) marcas.push({ minutos: h * 60 + 30, etiqueta: horaDeMinutos(h * 60 + 30), tipo: 'media' });
  }
  const alto = altoHoraRem(duracionMin);
  return {
    desdeHora,
    hastaHora,
    desdeMin: desdeHora * 60,
    hastaMin: hastaHora * 60,
    altoHoraRem: alto,
    altoHora: `${alto}rem`,
    marcas,
  };
}

/** Posición de `[inicioMin, finMin)` en el eje, recortada al eje; alto proporcional a la duración (CAL-07, CA-72). */
export function posicionEnEje(inicioMin: number, finMin: number, eje: IntervaloMinutos): PosicionEnEje {
  const desde = Math.min(Math.max(inicioMin, eje.desdeMin), eje.hastaMin);
  const hasta = Math.min(Math.max(finMin, desde), eje.hastaMin);
  return { arribaHoras: (desde - eje.desdeMin) / 60, altoHoras: (hasta - desde) / 60 };
}

/**
 * ADR-023, CAL-07, CAL-08: un bloque por clase y por día, agrupando las filas con el mismo `clase_id` y usando
 * `clase_inicio`/`clase_fin` (una clase de 60 min sobre huecos de 30 llega en dos filas y se dibuja una vez). Solo
 * clases `confirmada` o `pendiente`: las canceladas y las rechazadas no llegan (CAL-09). En orden de día e inicio.
 */
export function bloquesDeClase(filas: readonly FilaAgendaDias[], zona: string): BloqueClase[] {
  const grupos = new Map<string, FilaAgendaDias[]>();
  for (const f of filas) {
    if (f.clase_id === null || f.clase_estado === null) continue;
    const clave = `${f.dia}|${f.clase_id}`;
    const grupo = grupos.get(clave);
    if (grupo) grupo.push(f);
    else grupos.set(clave, [f]);
  }
  const bloques: BloqueClase[] = [];
  for (const grupo of grupos.values()) {
    const ordenadas = [...grupo].sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
    const fila = ordenadas[0] as FilaAgendaDias;
    const ultima = ordenadas[ordenadas.length - 1] as FilaAgendaDias;
    const inicio = fila.clase_inicio ?? fila.inicio;
    const fin = fila.clase_fin ?? ultima.fin;
    bloques.push({
      id: fila.clase_id as string,
      dia: fila.dia,
      inicio,
      fin,
      inicioMin: minutosEnDia(inicio, fila.dia, zona),
      finMin: minutosEnDia(fin, fila.dia, zona),
      estado: fila.clase_estado as EstadoClaseAgenda,
      quien: fila.quien_toma,
      titular: fila.titular,
      observacion: fila.observacion,
      reservaTipo: fila.reserva_tipo,
      solicitudId: fila.solicitud_id,
      solicitudTipo: fila.solicitud_tipo,
      cancelacionPendiente: fila.clase_estado === 'confirmada' && fila.solicitud_tipo === 'cancelacion',
      pasada: fila.pasada,
      fila,
    });
  }
  return bloques.sort((a, b) => (a.dia === b.dia ? a.inicioMin - b.inicioMin : a.dia < b.dia ? -1 : 1));
}

/** Filas y bloques de cada día visible, en el orden de `dias`; un día sin filas queda vacío. */
export function diasCalendario(dias: readonly Dia[], filas: readonly FilaAgendaDias[], zona: string): DiaCalendario[] {
  const clases = bloquesDeClase(filas, zona);
  return dias.map((dia) => ({
    dia,
    filas: filas.filter((f) => f.dia === dia),
    clases: clases.filter((c) => c.dia === dia),
  }));
}

/** CAL-18: «No hay clases este día/esta semana» se calcula del estado listo. */
export function sinClases(dias: readonly DiaCalendario[]): boolean {
  return dias.every((d) => d.clases.length === 0);
}
