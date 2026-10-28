// Configuración pública de un profesor por su slug (ADR-004, ADR-020): nombre, activo y, si está activo,
// huso, duración, anticipación y horizonte. Se lee una vez por slug y por carga de la app y se comparte
// entre pantallas; `recargar` vuelve a pedirla (tras un error o tras guardar la configuración, B10).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { normalizarSlug } from '../../../estado/profesor';
import { traducirError, type ErrorTraducido } from '../../../lib/errores';
import { obtenerConfigPublica } from './api';
import type { ConfigPublica, ConfigPublicaCargada, ObtenerConfig } from './tipos';

interface Cache {
  promesa: Promise<ConfigPublica>;
  valor: ConfigPublica | null;
}

const caches = new Map<string, Cache>();

/** Clave de caché: el slug como lo compara la base; uno inválido se guarda tal cual (da 404 sin red). */
function claveDe(slug: string): string {
  return normalizarSlug(slug) ?? slug;
}

function cargar(slug: string, obtener: ObtenerConfig): Promise<ConfigPublica> {
  const clave = claveDe(slug);
  const existente = caches.get(clave);
  if (existente) return existente.promesa;
  const nueva: Cache = { promesa: Promise.resolve().then(() => obtener(slug)), valor: null };
  nueva.promesa.then(
    (valor) => {
      nueva.valor = valor;
    },
    () => {
      // Un error no queda en caché: la próxima lectura vuelve a pedir.
      if (caches.get(clave) === nueva) caches.delete(clave);
    },
  );
  caches.set(clave, nueva);
  return nueva.promesa;
}

/** Solo para pruebas: olvida la configuración leída de todos los profesores. */
export function reiniciarConfigPublica(): void {
  caches.clear();
}

interface Resultado {
  clave: string;
  config: ConfigPublica | null;
  error: ErrorTraducido | null;
}

const CARGANDO_SIN_SLUG = 'sin-slug';

/**
 * `slug` del enlace (`#/p/<slug>`) o del profesor de la sesión; con `null` queda en `cargando` sin pedir nada
 * (por ejemplo, mientras la sesión carga). `obtener` se inyecta en las pruebas; debe ser una referencia estable.
 */
export function useConfigPublica(
  slug: string | null,
  obtener: ObtenerConfig = obtenerConfigPublica,
): ConfigPublicaCargada {
  const [version, setVersion] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const clave = slug === null ? CARGANDO_SIN_SLUG : `${claveDe(slug)}|${version}`;

  useEffect(() => {
    if (slug === null) return;
    let vigente = true;
    cargar(slug, obtener).then(
      (config) => {
        if (vigente) setResultado({ clave, config, error: null });
      },
      (e: unknown) => {
        if (vigente) setResultado({ clave, config: null, error: traducirError(e) });
      },
    );
    return () => {
      vigente = false;
    };
  }, [clave, obtener, slug]);

  const recargar = useCallback(() => {
    if (slug !== null) caches.delete(claveDe(slug));
    setVersion((v) => v + 1);
  }, [slug]);
  const enCache = slug === null ? null : (caches.get(claveDe(slug))?.valor ?? null);

  return useMemo<ConfigPublicaCargada>(() => {
    if (resultado && resultado.clave === clave) {
      return resultado.error
        ? {
            estado: 'error',
            config: null,
            error: resultado.error,
            enlaceNoValido: resultado.error.codigo === 'NO_ENCONTRADO',
            recargar,
          }
        : { estado: 'listo', config: resultado.config, error: null, enlaceNoValido: false, recargar };
    }
    if (enCache) return { estado: 'listo', config: enCache, error: null, enlaceNoValido: false, recargar };
    return { estado: 'cargando', config: null, error: null, enlaceNoValido: false, recargar };
  }, [clave, enCache, recargar, resultado]);
}
