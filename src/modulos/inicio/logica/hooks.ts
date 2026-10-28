// Hooks del inicio y del selector de profesor (WEB-09, WEB-11, ADR-020).
import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { elegirProfesor, normalizarSlug, rutaDeProfesor, slugDeRuta } from '../../../estado/profesor';
import { useProfesorElegido, useSesion } from '../../../estado/useSesion';
import { decidirInicio, mostrarSelector, opcionesSelector, type DecisionInicio, type OpcionProfesor } from './inicio';

/** WEB-09: qué muestra `#/` con la sesión y el profesor elegido del momento. */
export function useInicio(): DecisionInicio {
  const sesion = useSesion();
  const elegido = useProfesorElegido();
  return useMemo(() => decidirInicio(sesion, elegido), [sesion, elegido]);
}

export interface SelectorProfesor {
  /** false con un solo vínculo o sin sesión de persona: no se monta (DEC-25). */
  visible: boolean;
  opciones: OpcionProfesor[];
  /** Guarda el elegido en `sessionStorage` y navega a su agenda `#/p/<slug>`. */
  elegir: (slug: string) => void;
}

/** WEB-11: datos y acción del selector que el layout monta arriba en las pantallas de la persona. */
export function useSelectorProfesor(): SelectorProfesor {
  const sesion = useSesion();
  const elegido = useProfesorElegido();
  const { pathname } = useLocation();
  const navegar = useNavigate();
  const visible = mostrarSelector(sesion);
  const slugActual = slugDeRuta(pathname);
  const opciones = useMemo(
    () => (visible && sesion.tipo === 'sesion' ? opcionesSelector(sesion.sesion, slugActual, elegido) : []),
    [elegido, sesion, slugActual, visible],
  );
  const elegir = useCallback(
    (slug: string) => {
      const valido = normalizarSlug(slug);
      if (valido === null) return;
      elegirProfesor(valido);
      void navegar(rutaDeProfesor(valido));
    },
    [navegar],
  );
  return { visible, opciones, elegir };
}
