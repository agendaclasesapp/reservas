// Hook de Mis clases (RES-06, WEB-05).
import { useCallback, useEffect, useState } from 'react';
import { mensajeDeError } from '../../../lib/errores';
import type { ClaseMia } from './tipos';

export type LectorMisClases = () => Promise<ClaseMia[]>;

export interface EstadoMisClases {
  estado: 'cargando' | 'listo' | 'error';
  clases: ClaseMia[];
  /** Texto ya traducido (SEC-17). */
  error: string | null;
}

const INICIAL: EstadoMisClases = { estado: 'cargando', clases: [], error: null };

/**
 * Lee `v_mis_clases` al montar y en cada `recargar()`. Mientras recarga conserva las clases anteriores; un
 * error deja el texto traducido y las clases que ya tenía.
 */
export function useMisClases(lector: LectorMisClases): { datos: EstadoMisClases; recargar: () => void } {
  const [datos, setDatos] = useState<EstadoMisClases>(INICIAL);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    lector().then(
      (clases) => {
        if (vigente) setDatos({ estado: 'listo', clases, error: null });
      },
      (e: unknown) => {
        if (vigente) setDatos((previo) => ({ estado: 'error', clases: previo.clases, error: mensajeDeError(e) }));
      },
    );
    return () => {
      vigente = false;
    };
  }, [lector, version]);

  const recargar = useCallback(() => {
    setDatos((previo) => ({ estado: 'cargando', clases: previo.clases, error: null }));
    setVersion((v) => v + 1);
  }, []);

  return { datos, recargar };
}
