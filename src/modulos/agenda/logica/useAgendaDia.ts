// Hook de la agenda pública de un día (AGE-07, ADR-006, ADR-017). No espera la sesión: lee por el
// cliente REST anónimo. Una respuesta de un día anterior que llega tarde se descarta.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { traducirError, type ErrorTraducido } from '../../../lib/errores';
import type { Dia } from '../../../lib/fechas';
import { obtenerAgendaPublica } from './api';
import type { AgendaDia, Hueco, ObtenerAgenda } from './tipos';

interface Resultado {
  clave: string;
  huecos: Hueco[];
  error: ErrorTraducido | null;
}

const SIN_HUECOS: Hueco[] = [];

/**
 * Huecos del día `dia` (`YYYY-MM-DD`, huso del profesor) con su estado.
 * `obtener` se inyecta en las pruebas; debe ser una referencia estable.
 */
export function useAgendaDia(dia: Dia, obtener: ObtenerAgenda = obtenerAgendaPublica): AgendaDia {
  const [version, setVersion] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const clave = `${dia}|${version}`;

  useEffect(() => {
    let vigente = true;
    Promise.resolve()
      .then(() => obtener(dia))
      .then(
        (huecos) => {
          if (vigente) setResultado({ clave, huecos, error: null });
        },
        (e: unknown) => {
          if (vigente) setResultado({ clave, huecos: SIN_HUECOS, error: traducirError(e) });
        },
      );
    return () => {
      vigente = false;
    };
  }, [clave, dia, obtener]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  return useMemo<AgendaDia>(() => {
    if (!resultado || resultado.clave !== clave) {
      return { estado: 'cargando', huecos: SIN_HUECOS, error: null, recargar };
    }
    if (resultado.error) {
      return { estado: 'error', huecos: SIN_HUECOS, error: resultado.error, recargar };
    }
    return { estado: 'listo', huecos: resultado.huecos, error: null, recargar };
  }, [clave, recargar, resultado]);
}
