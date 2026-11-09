// B17 · T17.1 · Lectura de la agenda del rango visible del calendario (ADR-023: una lectura por vista).
// ux/web/flujos.md §4: `cargando | error | listo`; «releyendo» es `cargando` con `previo`. INV-02: el profesor sale de
// la sesión en la base; acá solo viaja el rango. SEC-17, SEC-35: el error es el texto del catálogo, sin `details`
// ni filas, y no se escribe en la consola. B23 · T23.2 (NFR-10, CA-88): la lectura toma la precarga del mismo rango
// si la hay (`precarga.ts`); si no coincide, se descarta sin mostrarse.
import { useMemo } from 'react';
import { MENSAJE_GENERICO } from '../../../lib/errores';
import type { Dia } from '../../../lib/fechas';
import { tomarPrecargaPanel } from './precarga';
import type { FilaAgendaDias } from './tipos';
import { useLecturaPanel, type EstadoLecturaPanel } from './usePanel';

export type LectorAgendaDias = (desde: Dia, hasta: Dia) => Promise<FilaAgendaDias[]>;

/** Lo leído para un rango: las filas llevan el rango al que pertenecen. */
export interface AgendaDiasLeida {
  desde: Dia;
  hasta: Dia;
  filas: FilaAgendaDias[];
}

/**
 * Estado de la lectura del calendario (CC-02). `cargando` con `previo` distinto de null es «releyendo»: la vista
 * deja la grilla anterior con `aria-busy`. `error.mensaje` ya es el texto del catálogo (`mensajeDeError`).
 */
export type LecturaAgendaDias =
  | { estado: 'cargando'; previo: AgendaDiasLeida | null }
  | { estado: 'error'; mensaje: string }
  | { estado: 'listo'; datos: AgendaDiasLeida };

/** Traduce el estado de `useLecturaPanel` a la unión discriminada de la vista. */
export function lecturaAgendaDias(lectura: EstadoLecturaPanel<AgendaDiasLeida>): LecturaAgendaDias {
  if (lectura.estado === 'error') return { estado: 'error', mensaje: lectura.error ?? MENSAJE_GENERICO };
  if (lectura.estado === 'listo' && lectura.datos) return { estado: 'listo', datos: lectura.datos };
  return { estado: 'cargando', previo: lectura.datos };
}

/**
 * Lee `[desde, hasta]` (en Día, `desde = hasta`) con `lector`; vuelve a leer al cambiar el rango y en `recargar()`
 * (después de una acción o con «Reintentar»). Una respuesta vieja no pisa a la nueva (`useLecturaPanel`).
 * La primera lectura usa la precarga del mismo rango y lector si la hay (NFR-10); su error se muestra como el de una
 * lectura propia. `lector` debe ser una referencia estable.
 */
export function useAgendaDiasConLector(
  lector: LectorAgendaDias,
  desde: Dia,
  hasta: Dia,
): { lectura: LecturaAgendaDias; recargar: () => void } {
  const leer = useMemo(
    () => async (): Promise<AgendaDiasLeida> => ({
      desde,
      hasta,
      filas: await (tomarPrecargaPanel(lector, desde, hasta) ?? lector(desde, hasta)),
    }),
    [lector, desde, hasta],
  );
  const { lectura, recargar } = useLecturaPanel(leer);
  return { lectura: lecturaAgendaDias(lectura), recargar };
}
