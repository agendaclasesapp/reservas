// B17 · T17.1 · Estado de la vista del calendario desde la dirección y su navegación (CAL-01, CAL-02, CAL-03).
// La dirección es la única fuente del estado de la vista (ux/web/flujos.md §1): `#/panel?v=dia|semana&d=AAAA-MM-DD`.
// Funciones puras: la vista lee con `vistaDesdeDireccion` y escribe con `direccionCalendario`.
import { esDia, hoyEn, sumarDias, type Dia } from '../../../lib/fechas';
import { diaEnLimites, type LimitesAgenda } from '../../agenda/logica';

export const VISTAS_CALENDARIO = ['dia', 'semana'] as const;
export type VistaCalendario = (typeof VISTAS_CALENDARIO)[number];

/** Nombres de los parámetros de consulta de `#/panel` (CAL-02). */
export const PARAMETROS_CALENDARIO = { vista: 'v', dia: 'd' } as const;

/** CAL-03: la navegación no pasa de hoy ± 366 días en el huso del profesor (el alcance de `agenda_profesor`). */
export const DIAS_DE_ALCANCE_PANEL = 366;

/** Días de calendario sin hora: la cuenta no depende del huso (como en `agendaDias.ts`). */
const CALENDARIO = 'UTC';

/** Vista y día que muestra el calendario. En Semana, `dia` es cualquier día de la semana (flujos.md §1). */
export interface EstadoVistaCalendario {
  vista: VistaCalendario;
  dia: Dia;
}

/** Lo leído de la dirección. `corregida`: traía un valor inválido; la vista reemplaza la entrada del historial. */
export interface VistaDesdeDireccion extends EstadoVistaCalendario {
  corregida: boolean;
}

/** Un día visible del calendario: `enRango` dentro de hoy ± 366 (CAL-03), `esHoy` en el huso del profesor. */
export interface DiaVisible {
  dia: Dia;
  enRango: boolean;
  esHoy: boolean;
}

/** Todo lo que la barra y la grilla necesitan de la navegación (CC-01, CC-02). */
export interface NavegacionCalendario extends EstadoVistaCalendario {
  /** `30/10/2026` en Día; `26/10/2026 - 01/11/2026` en Semana (CAL-03). */
  titulo: string;
  /** Día: el día; Semana: de lunes a domingo. */
  dias: DiaVisible[];
  /** Rango a leer con `useAgendaDias`: los días visibles dentro de los límites (contratos.md §2). */
  desde: Dia;
  hasta: Dia;
  /** Destino de la flecha anterior; null = deshabilitada (saldría de hoy − 366). */
  anterior: EstadoVistaCalendario | null;
  /** Destino de la flecha siguiente; null = deshabilitada (saldría de hoy + 366, CA-68). */
  siguiente: EstadoVistaCalendario | null;
  /** Destino de «Hoy»: la misma vista en el día de hoy. */
  hoy: EstadoVistaCalendario;
}

export function esVistaCalendario(valor: unknown): valor is VistaCalendario {
  return typeof valor === 'string' && (VISTAS_CALENDARIO as readonly string[]).includes(valor);
}

/** Límites del Panel (CAL-03): de hoy − 366 a hoy + 366 en el huso del profesor. `ahora` se inyecta en las pruebas. */
export function limitesPanel(zona: string, ahora: Date = new Date()): LimitesAgenda {
  const hoy = hoyEn(zona, ahora);
  return {
    hoy,
    min: sumarDias(hoy, -DIAS_DE_ALCANCE_PANEL, zona),
    max: sumarDias(hoy, DIAS_DE_ALCANCE_PANEL, zona),
  };
}

/**
 * CAL-02, CA-67: vista y día desde los parámetros de la dirección. Sin `v`, vista Día (`?d=` solo abre Día de ese
 * día); sin `d`, hoy. Un valor inválido —`v` que no es `dia` ni `semana`, `d` que no es un día real o que sale de
 * hoy ± 366— abre la vista Día de hoy y marca `corregida`.
 */
export function vistaDesdeDireccion(parametros: URLSearchParams | string, limites: LimitesAgenda): VistaDesdeDireccion {
  const p = typeof parametros === 'string' ? new URLSearchParams(parametros) : parametros;
  const v = p.get(PARAMETROS_CALENDARIO.vista);
  const d = p.get(PARAMETROS_CALENDARIO.dia);
  const vistaValida = v === null || esVistaCalendario(v);
  const diaValido = d === null || diaEnLimites(d, limites);
  if (!vistaValida || !diaValido) return { vista: 'dia', dia: limites.hoy, corregida: true };
  return { vista: esVistaCalendario(v) ? v : 'dia', dia: d ?? limites.hoy, corregida: false };
}

/** Parámetros de la dirección para un estado de la vista (para `setSearchParams`). */
export function direccionCalendario(estado: EstadoVistaCalendario): Record<'v' | 'd', string> {
  return { v: estado.vista, d: estado.dia };
}

/** Día de la semana ISO (1 = lunes … 7 = domingo) de un día de calendario. */
export function diaSemanaIso(dia: Dia): number {
  if (!esDia(dia)) throw new RangeError('Día inválido: se espera YYYY-MM-DD.');
  const [anio, mes, d] = dia.split('-').map(Number) as [number, number, number];
  const semana = new Date(Date.UTC(anio, mes - 1, d)).getUTCDay();
  return semana === 0 ? 7 : semana;
}

/** Lunes de la semana del día (las semanas van de lunes a domingo, CAL-03). */
export function lunesDe(dia: Dia): Dia {
  return sumarDias(dia, 1 - diaSemanaIso(dia), CALENDARIO);
}

/** `30/10/2026` (CAL-03). */
export function fechaNumerica(dia: Dia): string {
  if (!esDia(dia)) throw new RangeError('Día inválido: se espera YYYY-MM-DD.');
  const [anio, mes, d] = dia.split('-');
  return `${d}/${mes}/${anio}`;
}

function sumar(dia: Dia, n: number): Dia {
  return sumarDias(dia, n, CALENDARIO);
}

/**
 * CAL-03, CA-68: título, días visibles, rango a leer y destinos de las flechas y de «Hoy». En Día las flechas van
 * de a un día; en Semana, de a una semana (lunes a domingo). Una flecha que saldría de hoy ± 366 da null. En Semana
 * la flecha se habilita si la semana nueva tiene algún día dentro del rango, y su `dia` es el primero de esos días
 * (con la flecha siguiente, el lunes: DEC-45 A).
 */
export function navegacionCalendario(estado: EstadoVistaCalendario, limites: LimitesAgenda): NavegacionCalendario {
  const visible = (dia: Dia): DiaVisible => ({ dia, enRango: diaEnLimites(dia, limites), esHoy: dia === limites.hoy });
  const hoy: EstadoVistaCalendario = { vista: estado.vista, dia: limites.hoy };

  if (estado.vista === 'dia') {
    const anterior = sumar(estado.dia, -1);
    const siguiente = sumar(estado.dia, 1);
    return {
      ...estado,
      titulo: fechaNumerica(estado.dia),
      dias: [visible(estado.dia)],
      desde: estado.dia,
      hasta: estado.dia,
      anterior: diaEnLimites(anterior, limites) ? { vista: 'dia', dia: anterior } : null,
      siguiente: diaEnLimites(siguiente, limites) ? { vista: 'dia', dia: siguiente } : null,
      hoy,
    };
  }

  const lunes = lunesDe(estado.dia);
  const domingo = sumar(lunes, 6);
  const dias = Array.from({ length: 7 }, (_, i) => visible(sumar(lunes, i)));
  const enRango = dias.filter((d) => d.enRango);
  const lunesSiguiente = sumar(lunes, 7);
  const lunesAnterior = sumar(lunes, -7);
  const domingoAnterior = sumar(lunes, -1);
  return {
    ...estado,
    titulo: `${fechaNumerica(lunes)} - ${fechaNumerica(domingo)}`,
    dias,
    desde: enRango[0]?.dia ?? estado.dia,
    hasta: enRango[enRango.length - 1]?.dia ?? estado.dia,
    anterior:
      domingoAnterior >= limites.min
        ? { vista: 'semana', dia: lunesAnterior >= limites.min ? lunesAnterior : limites.min }
        : null,
    siguiente: lunesSiguiente <= limites.max ? { vista: 'semana', dia: lunesSiguiente } : null,
    hoy,
  };
}
