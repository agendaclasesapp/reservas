// B18 · T18.1 · Elementos tocables de cada columna del calendario: clase, hueco libre y bloqueo (ADR-024, ADR-023).
// CAL-05 (hueco libre futuro dentro de tramo, tocable; pasado o fuera de la grilla, decorativo), CAL-06 (bloqueo con
// motivo), CAL-11 (detalle y las mismas acciones del Panel). INV-01, INV-05: las acciones salen de `accionesFila`,
// `accionesBloqueo` y `permisosPanel`, sin reglas propias. ADR-024 A-3 (H-474, configuración en error) y A-4 (H-473,
// carriles). La geometría es la de `eje.ts` (H-470): la vista dibuja lo que recibe, sin calcular nada.
import type { Dia } from '../../../lib/fechas';
import type { TramoGrilla } from '../../configuracion/logica';
import { accionesBloqueo, type AccionesBloqueo } from './bloqueos';
import {
  ALTO_HORA_BASE_REM,
  ALTO_MINIMO_HUECO_REM,
  ejeCalendario,
  minutosEnDia,
  posicionEnEje,
  zonasFueraDeTramo,
  type BloqueClase,
  type DiaCalendario,
  type EjeCalendario,
  type IntervaloMinutos,
  type PosicionEnEje,
} from './eje';
import { accionesFila, type AccionesFila } from './panel';
import type { FilaAgendaDias } from './tipos';

/** Lo de la configuración que necesita el calendario: la grilla semanal y la duración de un hueco. */
export interface ConfiguracionCalendario {
  grilla: readonly TramoGrilla[];
  duracionMin: number;
}

/** Lo que mira `configuracionCalendario` del estado de `useConfiguracionAgenda` (`configuracion/logica`). */
export interface LecturaConfiguracionCalendario {
  estado: 'cargando' | 'listo' | 'error';
  datos: { config: { duracion_min: number }; grilla: readonly TramoGrilla[] } | null;
}

/** Lo común a los tres elementos de una columna. Minutos del día en el huso del profesor (ADR-004). */
interface ElementoBase {
  /** Clave estable para `key`: `clase:<id>`, `hueco:<inicio>`, `bloqueo:<bloqueo_id>:<inicio>`. */
  clave: string;
  dia: Dia;
  /** Instantes reales (ISO). */
  inicio: string;
  fin: string;
  inicioMin: number;
  finMin: number;
  /** `posicionEnEje(inicioMin, finMin, eje)`: la vista multiplica por `--cal-alto-hora`. */
  posicion: PosicionEnEje;
  /** ADR-024 A-4 (H-473): carril desde 0 entre los elementos cuyos intervalos visuales se pisan. */
  carril: number;
  /** Carriles del grupo que se pisa (1 si no se pisa con nada): ancho `1 / carriles`. */
  carriles: number;
  /** Se dibuja como control y abre el detalle (CAL-11); si no, es decorativo. */
  tocable: boolean;
  /** `pasada` de la base (ADR-014): la web no usa su reloj. */
  pasado: boolean;
}

/** CAL-07, CAL-08, CAL-11: una clase confirmada o pendiente (CC-06). */
export interface ElementoClase extends ElementoBase {
  tipo: 'clase';
  clase: BloqueClase;
  /** `accionesFila(clase.fila, profesorActivo)`: mover, cancelar y elegir alcance (INV-01, INV-05). */
  acciones: AccionesFila;
  /** Mover o cancelar disponibles: confirmada, no pasada y sin `solicitud_id`, como hoy en la lista. */
  gestionable: boolean;
}

/** CAL-05, CA-70: un hueco libre (CC-07 `HuecoLibre`). */
export interface ElementoHueco extends ElementoBase {
  tipo: 'hueco';
  fila: FilaAgendaDias;
  /** Ningún fondo fuera de tramo lo pisa (con la configuración en error, siempre true: ADR-024 A-3). */
  dentroDeTramo: boolean;
  /** `accionesFila(fila, profesorActivo)`: «Crear clase» (deshabilitada con el profesor inactivo, INV-05). */
  acciones: AccionesFila;
  /** `accionesBloqueo(fila)`: «Bloquear» un hueco libre y futuro. */
  accionesBloqueo: AccionesBloqueo;
}

/** CAL-06, CA-71: un bloqueo (CC-08 `BloqueBloqueo`); las filas seguidas del mismo bloqueo van en un elemento. */
export interface ElementoBloqueo extends ElementoBase {
  tipo: 'bloqueo';
  /** Filas del bloqueo en este día, en orden; `filas[0]` es la que se pasa a «Desbloquear». */
  filas: FilaAgendaDias[];
  bloqueoId: string | null;
  /** Motivo tal como llega (se muestra como texto, SEC-16); null sin motivo. */
  motivo: string | null;
  /** Tiene `bloqueo_id`: es un bloqueo suyo y se puede desbloquear (AGE-06), como hoy en la lista. */
  propio: boolean;
  /** `accionesBloqueo(filas[0])`: «Desbloquear». */
  accionesBloqueo: AccionesBloqueo;
}

export type ElementoCalendario = ElementoClase | ElementoHueco | ElementoBloqueo;
export type TipoElementoCalendario = ElementoCalendario['tipo'];

/** Una columna de día (CC-04): fondo fuera de tramo y elementos en orden horario (orden de lectura, A-4). */
export interface ColumnaCalendario {
  dia: Dia;
  /** CAL-05: fondo sombreado, no tocable. Vacío con la configuración en error (A-3). */
  zonasFueraDeTramo: IntervaloMinutos[];
  elementos: ElementoCalendario[];
}

export interface CalendarioConElementos {
  eje: EjeCalendario;
  /** false con la configuración en error o sin datos (ADR-024 A-3, H-474): la grilla no se conoce. */
  grillaConocida: boolean;
  columnas: ColumnaCalendario[];
}

/**
 * ADR-024 A-3: la configuración para el calendario, o null si la lectura está en error o todavía no hay datos (una
 * grilla desconocida no es una grilla vacía). Mientras relee, usa el dato anterior.
 */
export function configuracionCalendario(lectura: LecturaConfiguracionCalendario): ConfiguracionCalendario | null {
  if (lectura.estado === 'error' || lectura.datos === null) return null;
  return { grilla: lectura.datos.grilla, duracionMin: lectura.datos.config.duracion_min };
}

/** ADR-024 A-4: `[inicioMin, max(finMin, inicioMin + 60 × 2,75 / altoHoraRem))`, el lugar que ocupa dibujado. */
export function intervaloVisual(inicioMin: number, finMin: number, altoHoraRem: number): IntervaloMinutos {
  const alto = Number.isFinite(altoHoraRem) && altoHoraRem > 0 ? altoHoraRem : ALTO_HORA_BASE_REM;
  return { desdeMin: inicioMin, hastaMin: Math.max(finMin, inicioMin + (60 * ALTO_MINIMO_HUECO_REM) / alto) };
}

/**
 * ADR-024 A-4 (H-473): carril y carriles de cada intervalo, en el mismo orden. Los que se pisan (en cadena) forman un
 * grupo; cada uno toma el primer carril libre por orden de inicio y el grupo tiene tantos carriles como usó.
 */
export function asignarCarriles(
  intervalos: readonly { inicioMin: number; finMin: number }[],
  altoHoraRem: number,
): { carril: number; carriles: number }[] {
  const visuales = intervalos.map((i) => intervaloVisual(i.inicioMin, i.finMin, altoHoraRem));
  const orden = visuales.map((_, i) => i).sort((a, b) => {
    const va = visuales[a] as IntervaloMinutos;
    const vb = visuales[b] as IntervaloMinutos;
    return va.desdeMin - vb.desdeMin || va.hastaMin - vb.hastaMin || a - b;
  });
  const resultado = intervalos.map(() => ({ carril: 0, carriles: 1 }));
  let finesDeCarril: number[] = [];
  let grupo: number[] = [];
  let finDelGrupo = Number.NEGATIVE_INFINITY;
  const cerrarGrupo = () => {
    for (const i of grupo) (resultado[i] as { carriles: number }).carriles = finesDeCarril.length;
    finesDeCarril = [];
    grupo = [];
  };
  for (const i of orden) {
    const v = visuales[i] as IntervaloMinutos;
    if (v.desdeMin >= finDelGrupo) cerrarGrupo();
    let carril = finesDeCarril.findIndex((fin) => fin <= v.desdeMin);
    if (carril === -1) {
      carril = finesDeCarril.length;
      finesDeCarril.push(v.hastaMin);
    } else {
      finesDeCarril[carril] = v.hastaMin;
    }
    (resultado[i] as { carril: number }).carril = carril;
    grupo.push(i);
    finDelGrupo = grupo.length === 1 ? v.hastaMin : Math.max(finDelGrupo, v.hastaMin);
  }
  cerrarGrupo();
  return resultado;
}

/** ADR-024 A-3: la duración inferida del menor `fin − inicio` de los huecos libres leídos; NaN sin huecos libres. */
export function duracionDeHuecosLibres(filas: readonly FilaAgendaDias[]): number {
  let menor = Number.POSITIVE_INFINITY;
  for (const f of filas) {
    if (f.estado !== 'libre') continue;
    const minutos = (Date.parse(f.fin) - Date.parse(f.inicio)) / 60_000;
    if (minutos > 0) menor = Math.min(menor, minutos);
  }
  return Number.isFinite(menor) ? menor : Number.NaN;
}

/** Elemento antes de ubicarlo en el eje y en su carril. */
type Crudo =
  | Omit<ElementoClase, 'posicion' | 'carril' | 'carriles'>
  | Omit<ElementoHueco, 'posicion' | 'carril' | 'carriles' | 'tocable' | 'dentroDeTramo'>
  | Omit<ElementoBloqueo, 'posicion' | 'carril' | 'carriles'>;

const ORDEN_TIPO: Record<TipoElementoCalendario, number> = { clase: 0, bloqueo: 1, hueco: 2 };

function continua(anterior: FilaAgendaDias, siguiente: FilaAgendaDias): boolean {
  return Date.parse(anterior.fin) === Date.parse(siguiente.inicio);
}

/** Clases, huecos libres y bloqueos de un día, sin posición. Una fila ocupada sin clase no da elemento. */
function crudosDelDia(dia: DiaCalendario, zona: string, profesorActivo: boolean): Crudo[] {
  const crudos: Crudo[] = dia.clases.map((clase) => {
    const acciones = accionesFila(clase.fila, profesorActivo);
    return {
      tipo: 'clase',
      clave: `clase:${clase.id}`,
      dia: dia.dia,
      inicio: clase.inicio,
      fin: clase.fin,
      inicioMin: clase.inicioMin,
      finMin: clase.finMin,
      // CAL-11: toda clase abre su detalle; las acciones dicen qué se puede hacer (como hoy).
      tocable: true,
      pasado: clase.pasada,
      clase,
      acciones,
      gestionable: acciones.mover || acciones.cancelar,
    };
  });
  let bloqueo: Omit<ElementoBloqueo, 'posicion' | 'carril' | 'carriles'> | null = null;
  for (const fila of dia.filas) {
    if (fila.estado === 'libre' && fila.clase_id === null) {
      crudos.push({
        tipo: 'hueco',
        clave: `hueco:${fila.inicio}`,
        dia: dia.dia,
        inicio: fila.inicio,
        fin: fila.fin,
        inicioMin: minutosEnDia(fila.inicio, dia.dia, zona),
        finMin: minutosEnDia(fila.fin, dia.dia, zona),
        pasado: fila.pasada,
        fila,
        acciones: accionesFila(fila, profesorActivo),
        accionesBloqueo: accionesBloqueo(fila),
      });
      continue;
    }
    if (fila.estado !== 'bloqueado') continue;
    const ultima = bloqueo?.filas[bloqueo.filas.length - 1];
    if (bloqueo && ultima && fila.bloqueo_id !== null && fila.bloqueo_id === bloqueo.bloqueoId && continua(ultima, fila)) {
      bloqueo.filas.push(fila);
      bloqueo.fin = fila.fin;
      bloqueo.finMin = minutosEnDia(fila.fin, dia.dia, zona);
      bloqueo.pasado = fila.pasada;
      continue;
    }
    const acciones = accionesBloqueo(fila);
    bloqueo = {
      tipo: 'bloqueo',
      clave: `bloqueo:${fila.bloqueo_id ?? ''}:${fila.inicio}`,
      dia: dia.dia,
      inicio: fila.inicio,
      fin: fila.fin,
      inicioMin: minutosEnDia(fila.inicio, dia.dia, zona),
      finMin: minutosEnDia(fila.fin, dia.dia, zona),
      // CA-71: un bloqueo suyo se toca y ofrece «Desbloquear» (`accionesBloqueo`, como hoy).
      tocable: acciones.desbloquear,
      pasado: fila.pasada,
      filas: [fila],
      bloqueoId: fila.bloqueo_id,
      motivo: fila.bloqueo_motivo,
      propio: acciones.desbloquear,
      accionesBloqueo: acciones,
    };
    crudos.push(bloqueo);
  }
  return crudos;
}

/** El intervalo `[inicioMin, finMin)` no lo pisa ninguna zona fuera de tramo y está dentro del eje (CAL-05). */
function dentroDeTramo(inicioMin: number, finMin: number, zonas: readonly IntervaloMinutos[], eje: IntervaloMinutos): boolean {
  if (inicioMin < eje.desdeMin || finMin > eje.hastaMin) return false;
  return zonas.every((z) => z.hastaMin <= inicioMin || z.desdeMin >= finMin);
}

/**
 * Eje, fondo fuera de tramo y elementos de cada día visible, en el orden de `dias` (de `diasCalendario`).
 * Con `configuracion` (CAL-04, CAL-05): eje de la grilla ampliado por las clases (A-1, DEC-44 A), zonas fuera de tramo
 * con `zonasFueraDeTramo`, y un hueco libre es tocable si está dentro de tramo y la fila ofrece crear o bloquear.
 * Con `configuracion` null (A-3, H-474): sin zonas, eje 08:00 a 18:00 ampliado por las clases y por todas las filas
 * leídas, y alto de la hora con la duración del menor hueco libre (sin huecos, el alto base); lo tocable sale de la
 * agenda. Los elementos van en orden horario con su `carril` y `carriles` (A-4, H-473).
 */
export function calendarioConElementos(
  dias: readonly DiaCalendario[],
  configuracion: ConfiguracionCalendario | null,
  zona: string,
  profesorActivo: boolean,
): CalendarioConElementos {
  const crudos = dias.map((d) => crudosDelDia(d, zona, profesorActivo));
  const clases = dias.flatMap((d) => d.clases);
  let eje: EjeCalendario;
  if (configuracion) {
    eje = ejeCalendario(configuracion.grilla, configuracion.duracionMin, clases);
  } else {
    const filas = dias.flatMap((d) => d.filas.map((f) => ({ fila: f, dia: d.dia })));
    const intervalos = filas.map(({ fila, dia }) => ({
      inicioMin: minutosEnDia(fila.inicio, dia, zona),
      finMin: minutosEnDia(fila.fin, dia, zona),
    }));
    eje = ejeCalendario([], duracionDeHuecosLibres(filas.map((f) => f.fila)), [...clases, ...intervalos]);
  }
  const columnas = dias.map((d, i): ColumnaCalendario => {
    const zonas = configuracion ? zonasFueraDeTramo(configuracion.grilla, d.dia, eje) : [];
    const ordenados = [...(crudos[i] as Crudo[])].sort(
      (a, b) => a.inicioMin - b.inicioMin || ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo] || a.finMin - b.finMin,
    );
    const carriles = asignarCarriles(ordenados, eje.altoHoraRem);
    const elementos = ordenados.map((c, j): ElementoCalendario => {
      const ubicacion = { posicion: posicionEnEje(c.inicioMin, c.finMin, eje), ...(carriles[j] as { carril: number; carriles: number }) };
      if (c.tipo !== 'hueco') return { ...c, ...ubicacion };
      const dentro = dentroDeTramo(c.inicioMin, c.finMin, zonas, eje);
      // CAL-05, CA-70: libre, futuro y dentro de tramo; pasado o fuera de la grilla, decorativo.
      const tocable = dentro && (c.acciones.crear || c.accionesBloqueo.bloquear);
      return { ...c, ...ubicacion, dentroDeTramo: dentro, tocable };
    });
    return { dia: d.dia, zonasFueraDeTramo: zonas, elementos };
  });
  return { eje, grillaConocida: configuracion !== null, columnas };
}
