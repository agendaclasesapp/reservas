// B17 · T17.1 · Estado de la vista del calendario desde la dirección y su navegación (CAL-01, CAL-02, CAL-03).
// La dirección es la única fuente del estado de la vista (ux/web/flujos.md §1): `#/panel?v=dia|semana&d=AAAA-MM-DD`.
// Funciones puras: la vista lee con `vistaDesdeDireccion` y escribe con `direccionCalendario`.
// B20 · T20.1: rama Semana completa (lunes a domingo) y ventana de 3 días (CAL-15, CAL-16) con las flechas de DEC-45 A
// en la lectura de H-475; la aritmética de días vive en `semana.ts` y se reexporta acá (eje.ts importa `diaSemanaIso`).
import { hoyEn, sumarDias, type Dia } from '../../../lib/fechas';
import { diaEnLimites, type LimitesAgenda } from '../../agenda/logica';
import {
  DIAS_SEMANA,
  DIAS_VENTANA,
  destinoFlecha,
  diasSeguidos,
  diasVisibles,
  lunesDe,
  rangoALeer,
  tituloRango,
  type DiaVisible,
} from './semana';

export { diaSemanaIso, fechaNumerica, lunesDe } from './semana';
export type { DiaVisible } from './semana';

export const VISTAS_CALENDARIO = ['dia', 'semana'] as const;
export type VistaCalendario = (typeof VISTAS_CALENDARIO)[number];

/** Nombres de los parámetros de consulta de `#/panel` (CAL-02). */
export const PARAMETROS_CALENDARIO = { vista: 'v', dia: 'd' } as const;

/** CAL-03: la navegación no pasa de hoy ± 366 días en el huso del profesor (el alcance de `agenda_profesor`). */
export const DIAS_DE_ALCANCE_PANEL = 366;

/** Vista y día que muestra el calendario. En Semana, `dia` es cualquier día de la semana (flujos.md §1). */
export interface EstadoVistaCalendario {
  vista: VistaCalendario;
  dia: Dia;
}

/** Lo leído de la dirección. `corregida`: traía un valor inválido; la vista reemplaza la entrada del historial. */
export interface VistaDesdeDireccion extends EstadoVistaCalendario {
  corregida: boolean;
}

/** Todo lo que la barra y la grilla necesitan de la navegación (CC-01, CC-02). */
export interface NavegacionCalendario extends EstadoVistaCalendario {
  /** `30/10/2026` en Día; `26/10/2026 - 01/11/2026` en Semana; los 3 días en la ventana (CAL-03, CAL-16). */
  titulo: string;
  /** Día: el día; Semana: de lunes a domingo (CAL-15); ventana: el día elegido y los 2 siguientes (CAL-16). */
  dias: DiaVisible[];
  /**
   * Rango a leer con `useAgendaDias`: los días visibles dentro de los límites, una sola lectura (ADR-023, DEC-45 A).
   * Los días fuera no se piden.
   */
  desde: Dia;
  hasta: Dia;
  /** Destino de la flecha anterior: el primer día dentro del bloque anterior (H-475). Si es null, queda deshabilitada. */
  anterior: EstadoVistaCalendario | null;
  /** Destino de la flecha siguiente: el primer día dentro del bloque siguiente. Si es null, queda deshabilitada (CA-68). */
  siguiente: EstadoVistaCalendario | null;
  /** Destino de «Hoy»: la misma vista en el día de hoy (en la ventana, la que empieza hoy). */
  hoy: EstadoVistaCalendario;
}

/** Cómo se dibuja la vista Semana: `ventana` (CAL-16) cuando la pantalla mide menos de 60 rem. */
export interface OpcionesNavegacion {
  ventana?: boolean;
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

/** CAL-15, CA-80: tocar el encabezado de un día abre la vista Día de ese día; fuera de hoy ± 366, null (DEC-45 A). */
export function abrirDia(dia: DiaVisible): EstadoVistaCalendario | null {
  return dia.enRango ? { vista: 'dia', dia: dia.dia } : null;
}

/**
 * CAL-03, CA-68, CAL-15, CAL-16: título, días visibles, rango a leer y destinos de las flechas y de «Hoy».
 * - Día: las flechas van de a un día.
 * - Semana: de lunes a domingo, las flechas van de a una semana.
 * - Semana con `ventana`: 3 días desde el día elegido, las flechas van de a 3 días.
 * DEC-45 A con la lectura de H-475, para las dos flechas: una flecha se habilita si algún día del bloque nuevo cae
 * dentro de hoy ± 366 y lleva al primero de esos días. Los días fuera se marcan con `enRango: false` y no se leen.
 */
export function navegacionCalendario(
  estado: EstadoVistaCalendario,
  limites: LimitesAgenda,
  opciones: OpcionesNavegacion = {},
): NavegacionCalendario {
  const [inicio, largo] =
    estado.vista === 'dia'
      ? [estado.dia, 1]
      : opciones.ventana
        ? [estado.dia, DIAS_VENTANA]
        : [lunesDe(estado.dia), DIAS_SEMANA];
  const dias = diasVisibles(diasSeguidos(inicio, largo), limites);
  // Inalcanzable desde la dirección: `vistaDesdeDireccion` deja `estado.dia` dentro de los límites.
  const rango = rangoALeer(dias) ?? { desde: estado.dia, hasta: estado.dia };
  const destino = (dia: Dia | null): EstadoVistaCalendario | null => (dia ? { vista: estado.vista, dia } : null);
  return {
    ...estado,
    titulo: tituloRango(dias.map((d) => d.dia)),
    dias,
    desde: rango.desde,
    hasta: rango.hasta,
    anterior: destino(destinoFlecha(inicio, -largo, largo, limites)),
    siguiente: destino(destinoFlecha(inicio, largo, largo, limites)),
    hoy: { vista: estado.vista, dia: limites.hoy },
  };
}

