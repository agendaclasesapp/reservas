// Hooks de lectura de la vista en modo lista (B07): solicitudes pendientes y clases (PRF-06, WEB-07).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { mensajeDeError } from '../../../lib/errores';
import { validarFiltroClases, type ClaseProfesor, type FiltroClases } from './clases';
import type { SolicitudPendiente } from './solicitudes';

export interface EstadoLectura<T> {
  estado: 'cargando' | 'listo' | 'error';
  filas: T[];
  /** Texto ya traducido (SEC-17). */
  error: string | null;
}

interface Resultado<T> {
  lector: () => Promise<T[]>;
  version: number;
  estado: 'listo' | 'error';
  filas: T[];
  error: string | null;
}

/**
 * Lee al montar, cuando cambia `lector` y en cada `recargar()`. Mientras lee está `cargando` y conserva las
 * filas anteriores; un error deja el texto traducido y las filas que ya tenía.
 */
export function useLectura<T>(lector: () => Promise<T[]>): { datos: EstadoLectura<T>; recargar: () => void } {
  const [resultado, setResultado] = useState<Resultado<T> | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    lector().then(
      (filas) => {
        if (vigente) setResultado({ lector, version, estado: 'listo', filas, error: null });
      },
      (e: unknown) => {
        if (vigente) {
          setResultado((previo) => ({ lector, version, estado: 'error', filas: previo?.filas ?? [], error: mensajeDeError(e) }));
        }
      },
    );
    return () => {
      vigente = false;
    };
  }, [lector, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  const datos: EstadoLectura<T> =
    resultado && resultado.lector === lector && resultado.version === version
      ? { estado: resultado.estado, filas: resultado.filas, error: resultado.error }
      : { estado: 'cargando', filas: resultado?.filas ?? [], error: null };
  return { datos, recargar };
}

export type LectorSolicitudes = () => Promise<SolicitudPendiente[]>;

/** `v_solicitudes_pendientes`; `recargar()` después de responder una. */
export function useSolicitudesPendientes(lector: LectorSolicitudes): {
  datos: EstadoLectura<SolicitudPendiente>;
  recargar: () => void;
} {
  return useLectura(lector);
}

export type LectorClases = (filtro: FiltroClases, zona: string) => Promise<ClaseProfesor[]>;

/**
 * `v_clases` con el filtro de CA-29 en el huso del profesor. Vuelve a leer cuando cambia un campo del filtro o
 * el huso. Un filtro inválido no consulta: deja el error de `validarFiltroClases`.
 */
export function useClases(
  lector: LectorClases,
  filtro: FiltroClases,
  zona: string,
): { datos: EstadoLectura<ClaseProfesor>; recargar: () => void } {
  const desde = filtro.desde ?? null;
  const hasta = filtro.hasta ?? null;
  const alumnoId = filtro.alumnoId ?? null;
  const invalido = validarFiltroClases({ desde, hasta, alumnoId });
  const leer = useMemo<() => Promise<ClaseProfesor[]>>(
    () => (invalido ? () => Promise.resolve([]) : () => lector({ desde, hasta, alumnoId }, zona)),
    [lector, invalido, desde, hasta, alumnoId, zona],
  );
  const lectura = useLectura(leer);
  if (invalido) return { datos: { estado: 'error', filas: [], error: invalido }, recargar: lectura.recargar };
  return lectura;
}
