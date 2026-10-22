// Enlace de React con el estado de sesión y las guardas de ruta (ADR-007). La presentación de
// «esperando», «sin permisos» y «error» la pone quien monta la guarda (src/ui, ux-web).
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { decidirGuarda, type DecisionGuarda } from './guardas';
import { estadoSesion, refrescarSesion, suscribirSesion } from './sesion-actual';
import type { EstadoAlumno, EstadoSesion } from './tipos';

/** Estado de la sesión de la app; si arranca en `cargando`, dispara la lectura de `sesion_actual`. */
export function useSesion(): EstadoSesion {
  const estado = useSyncExternalStore(suscribirSesion, estadoSesion, estadoSesion);
  const cargando = estado.tipo === 'cargando';
  useEffect(() => {
    if (cargando) void refrescarSesion();
  }, [cargando]);
  return estado;
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
  sinPermisos?: (estado: EstadoAlumno | null) => ReactNode;
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
      return <>{sinPermisos?.(decision.estado) ?? null}</>;
    case 'error':
      return <>{error?.(decision.mensaje) ?? null}</>;
  }
}
