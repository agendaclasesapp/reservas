// Profesor de origen de la ficha (ADR-020, ALU-14, DEC-33): el último enlace `#/p/<slug>` que la persona abrió
// sin vínculo. Si es de un profesor activo, la ficha pregunta «cómo llegaste» a él y lo manda en
// `completar_ficha`; si no hay, no existe o está inactivo, la ficha no pregunta y no crea vínculo.
import { useEffect } from 'react';
import { inscripcionCon, olvidarProfesorOrigen } from '../../../estado/profesor';
import type { EstadoSesion } from '../../../estado/tipos';
import { useProfesorOrigen, useSesion } from '../../../estado/useSesion';
import type { ErrorTraducido } from '../../../lib/errores';
import { useConfigPublica, type ConfigPublicaCargada, type ObtenerConfig } from '../../agenda/logica';

export type ProfesorDeOrigen =
  | { estado: 'sin_origen' }
  | { estado: 'cargando'; slug: string }
  /** Profesor activo: la ficha pregunta «cómo llegaste a {nombre}» (texto, SEC-16). */
  | { estado: 'listo'; slug: string; nombre: string }
  /** No se pudo leer (red): la vista ofrece reintentar; mientras tanto no pregunta. */
  | { estado: 'error'; slug: string; error: ErrorTraducido; recargar: () => void };

/**
 * Decide con el slug guardado, la sesión y la lectura de `config_publica(slug)`. `descartar` es true cuando el
 * slug ya no sirve como origen (no existe, inactivo o la persona ya tiene vínculo con él).
 */
export function resolverProfesorDeOrigen(
  slug: string | null,
  sesion: EstadoSesion,
  config: ConfigPublicaCargada,
): { origen: ProfesorDeOrigen; descartar: boolean } {
  if (slug === null) return { origen: { estado: 'sin_origen' }, descartar: false };
  if (sesion.tipo === 'sesion' && inscripcionCon(sesion.sesion.inscripciones, slug)) {
    return { origen: { estado: 'sin_origen' }, descartar: true };
  }
  switch (config.estado) {
    case 'cargando':
      return { origen: { estado: 'cargando', slug }, descartar: false };
    case 'error':
      if (config.enlaceNoValido) return { origen: { estado: 'sin_origen' }, descartar: true };
      return {
        origen: {
          estado: 'error',
          slug,
          error: config.error ?? { codigo: 'DESCONOCIDO', mensaje: '' },
          recargar: config.recargar,
        },
        descartar: false,
      };
    case 'listo':
      if (config.config?.activo !== true) return { origen: { estado: 'sin_origen' }, descartar: true };
      return { origen: { estado: 'listo', slug, nombre: config.config.nombre }, descartar: false };
  }
}

/** Profesor de origen para la ficha; olvida el que ya no sirve. `obtener` solo para pruebas (referencia estable). */
export function useProfesorDeOrigen(obtener?: ObtenerConfig): ProfesorDeOrigen {
  const slug = useProfesorOrigen();
  const sesion = useSesion();
  const config = useConfigPublica(slug, obtener);
  const { origen, descartar } = resolverProfesorDeOrigen(slug, sesion, config);
  useEffect(() => {
    if (descartar) olvidarProfesorOrigen();
  }, [descartar]);
  return origen;
}
