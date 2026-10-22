// Hook de «Mails fallidos» de Configuración (WEB-08, NFR-07, AVI-08).
import { useCallback, useEffect, useState } from 'react';
import { mensajeDeError } from '../../../lib/errores';
import { leerMailsFallidos, type LectorMailsFallidos } from './mails-fallidos';
import type { EstadoMailsFallidos, ResultadoMailsFallidos } from './tipos';

const INICIAL: EstadoMailsFallidos = { estado: 'cargando', mails: [], error: null };

/**
 * Lee `v_mails_fallidos` al montar y en cada `recargar()`. Mientras recarga conserva la lista
 * anterior; un error deja el texto traducido (nunca `details` crudos, SEC-17).
 */
export function useMailsFallidos(lector: LectorMailsFallidos = leerMailsFallidos): ResultadoMailsFallidos {
  const [datos, setDatos] = useState<EstadoMailsFallidos>(INICIAL);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    lector().then(
      (mails) => {
        if (vigente) setDatos({ estado: 'listo', mails, error: null });
      },
      (e: unknown) => {
        if (vigente) setDatos((previo) => ({ estado: 'error', mails: previo.mails, error: mensajeDeError(e) }));
      },
    );
    return () => {
      vigente = false;
    };
  }, [lector, version]);

  const recargar = useCallback(() => {
    setDatos((previo) => ({ estado: 'cargando', mails: previo.mails, error: null }));
    setVersion((v) => v + 1);
  }, []);

  return { datos, recargar };
}
