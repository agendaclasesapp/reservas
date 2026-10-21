// Configuración pública del profesor (huso, duración, anticipación, horizonte). Se lee una vez por
// carga de la app y se comparte entre pantallas (ADR-004); si falla, `recargar` reintenta.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { traducirError, type ErrorTraducido } from '../../../lib/errores';
import { obtenerConfigPublica } from './api';
import type { ConfigPublica, ConfigPublicaCargada, ObtenerConfig } from './tipos';

interface Cache {
  promesa: Promise<ConfigPublica>;
  valor: ConfigPublica | null;
}

let cache: Cache | null = null;

function cargar(obtener: ObtenerConfig): Promise<ConfigPublica> {
  if (!cache) {
    const nueva: Cache = { promesa: Promise.resolve().then(obtener), valor: null };
    nueva.promesa.then(
      (valor) => {
        nueva.valor = valor;
      },
      () => {
        if (cache === nueva) cache = null;
      },
    );
    cache = nueva;
  }
  return cache.promesa;
}

/** Solo para pruebas: olvida la configuración leída. */
export function reiniciarConfigPublica(): void {
  cache = null;
}

interface Resultado {
  version: number;
  config: ConfigPublica | null;
  error: ErrorTraducido | null;
}

/** `obtener` se inyecta en las pruebas; debe ser una referencia estable. */
export function useConfigPublica(obtener: ObtenerConfig = obtenerConfigPublica): ConfigPublicaCargada {
  const [version, setVersion] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  useEffect(() => {
    let vigente = true;
    cargar(obtener).then(
      (config) => {
        if (vigente) setResultado({ version, config, error: null });
      },
      (e: unknown) => {
        if (vigente) setResultado({ version, config: null, error: traducirError(e) });
      },
    );
    return () => {
      vigente = false;
    };
  }, [obtener, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  const enCache = cache?.valor ?? null;

  return useMemo<ConfigPublicaCargada>(() => {
    if (resultado && resultado.version === version) {
      return resultado.error
        ? { estado: 'error', config: null, error: resultado.error, recargar }
        : { estado: 'listo', config: resultado.config, error: null, recargar };
    }
    if (enCache) return { estado: 'listo', config: enCache, error: null, recargar };
    return { estado: 'cargando', config: null, error: null, recargar };
  }, [enCache, recargar, resultado, version]);
}
