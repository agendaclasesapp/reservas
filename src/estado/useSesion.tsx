// Enlace de React con el estado de sesión, el profesor de la ruta y las guardas (ADR-007, ADR-020). La
// presentación de «esperando», «sin permisos» y «error» la pone quien monta la guarda (src/ui, ux-web).
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import type { DestinoSinPermisos } from '../ui/SinPermisos';
import { decidirGuarda, type DecisionGuarda } from './guardas';
import {
  anotarVisitaDeProfesor,
  leerProfesorElegido,
  leerProfesorOrigen,
  slugDeRuta,
  suscribirProfesor,
} from './profesor';
import { estadoSesion, refrescarSesion, suscribirSesion } from './sesion-actual';
import type { EstadoSesion } from './tipos';

/** Estado de la sesión de la app; si arranca en `cargando`, dispara la lectura de `sesion_actual`. */
export function useSesion(): EstadoSesion {
  const estado = useSyncExternalStore(suscribirSesion, estadoSesion, estadoSesion);
  const cargando = estado.tipo === 'cargando';
  useEffect(() => {
    if (cargando) void refrescarSesion();
  }, [cargando]);
  return estado;
}

/** WEB-11: slug del profesor elegido en esta pestaña, o `null`. */
export function useProfesorElegido(): string | null {
  return useSyncExternalStore(suscribirProfesor, leerProfesorElegido, leerProfesorElegido);
}

/** ALU-14: slug del profesor de origen (último enlace visitado sin vínculo), o `null`. */
export function useProfesorOrigen(): string | null {
  return useSyncExternalStore(suscribirProfesor, leerProfesorOrigen, leerProfesorOrigen);
}

/**
 * Anota cada visita a `#/p/<slug>` con la sesión del momento (ADR-020): se monta una vez en el layout de
 * src/rutas.tsx, así el profesor de origen queda anotado aunque la guarda lleve a la ficha.
 */
export function useAnotarVisitaDeProfesor(pathname: string, sesion: EstadoSesion): void {
  const slug = slugDeRuta(pathname);
  useEffect(() => {
    if (slug !== null) anotarVisitaDeProfesor(slug, sesion);
  }, [slug, sesion]);
}

/** Decisión de la guarda para la ruta actual. */
export function useGuardaDeRuta(): DecisionGuarda {
  const sesion = useSesion();
  const { pathname, search } = useLocation();
  return decidirGuarda({ pathname, search }, sesion);
}

export interface GuardaDeRutaProps {
  children: ReactNode;
  esperando?: ReactNode;
  sinPermisos?: (motivo: string, destino: DestinoSinPermisos) => ReactNode;
  error?: (mensaje: string) => ReactNode;
}

/** Envuelve el contenido de una ruta: redirige, espera, muestra «sin permisos» o el contenido. */
export function GuardaDeRuta({ children, esperando = null, sinPermisos, error }: GuardaDeRutaProps) {
  const decision = useGuardaDeRuta();
  const { key } = useLocation();
  switch (decision.tipo) {
    case 'mostrar':
      return <>{children}</>;
    case 'esperar':
      return <>{esperando}</>;
    case 'redirigir':
      // H-160 (CA-02): la guarda vive en el layout y no se desmonta al cambiar de ruta. `<Navigate>` solo
      // navega al montarse o si cambia `to`; si otra navegación interrumpe la redirección (p. ej. la
      // página de ingreso navega a `/` mientras `/ficha` todavía carga), la misma `<Navigate>` quedaba
      // montada sin volver a disparar y `main` quedaba vacío. Con la clave de la ubicación se monta
      // una nueva en cada ubicación y la redirección se reintenta.
      return <Navigate key={key} to={decision.a} replace />;
    case 'sin_permisos':
      return <>{sinPermisos?.(decision.motivo, decision.destino) ?? null}</>;
    case 'error':
      return <>{error?.(decision.mensaje) ?? null}</>;
  }
}
