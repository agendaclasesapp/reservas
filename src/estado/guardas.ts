// Guardas de ruta (ADR-007; ux/web/flujos.md §1, «Reglas de acceso"). Solo deciden qué se ve: la
// autorización real es RLS y las RPC (NFR-01, ADR-001).
// - Visitante en ruta con sesión → `/ingreso?volver=<ruta>`.
// - Con sesión en `/ingreso` → la ruta de `?volver=` o `/`.
// - Titular con `ficha_incompleta` → `/ficha` desde cualquier ruta (ALU-02, CA-02).
// - Rol o estado sin acceso → «Sin permisos» con el estado (no redirige en silencio; ALU-03, CA-03).
import type { UsuarioNavegacion } from '../ui/Navegacion';
import type { DestinoSinPermisos } from '../ui/SinPermisos';
import type { EstadoAlumno, EstadoSesion, SesionActual } from './tipos';

export type DecisionGuarda =
  | { tipo: 'mostrar' }
  | { tipo: 'esperar' }
  | { tipo: 'redirigir'; a: string }
  | { tipo: 'sin_permisos'; estado: EstadoAlumno | null }
  | { tipo: 'error'; mensaje: string };

type Acceso = 'publico' | 'ingreso' | 'titular' | 'alumno_aprobado' | 'profesor';

const ACCESOS: Readonly<Record<string, Acceso>> = {
  '/': 'publico',
  '/ingreso': 'ingreso',
  '/ficha': 'titular',
  '/solicitud': 'alumno_aprobado',
  '/mis-clases': 'alumno_aprobado',
  '/panel': 'profesor',
  '/lista': 'profesor',
  '/configuracion': 'profesor',
};

export const RUTA_FICHA = '/ficha';
export const RUTA_INGRESO = '/ingreso';

/** Acceso de una ruta del router; las desconocidas son públicas (el router las manda a `/`). */
export function accesoDe(pathname: string): Acceso {
  return Object.hasOwn(ACCESOS, pathname) ? (ACCESOS[pathname] as Acceso) : 'publico';
}

/**
 * `?volver=` válido o `/`: una ruta conocida del router (con su query, p. ej.
 * `/solicitud?hueco=…`), nunca el ingreso ni algo que no empiece con una ruta propia.
 */
export function rutaDeVuelta(busqueda: string): string {
  const volver = new URLSearchParams(busqueda).get('volver');
  if (volver === null) return '/';
  const ruta = volver.split(/[?#]/, 1)[0] ?? '';
  const resto = volver.slice(ruta.length);
  if (ruta === RUTA_INGRESO || !Object.hasOwn(ACCESOS, ruta) || resto.startsWith('#')) return '/';
  return volver;
}

function aIngreso(pathname: string, search: string): string {
  return `${RUTA_INGRESO}?${new URLSearchParams({ volver: pathname + search }).toString()}`;
}

const MOSTRAR: DecisionGuarda = Object.freeze({ tipo: 'mostrar' });

function decidirConSesion(acceso: Acceso, pathname: string, busqueda: string, s: SesionActual): DecisionGuarda {
  if (s.rol === 'alumno' && s.estado === 'ficha_incompleta') {
    return pathname === RUTA_FICHA ? MOSTRAR : { tipo: 'redirigir', a: RUTA_FICHA };
  }
  switch (acceso) {
    case 'publico':
      return MOSTRAR;
    case 'ingreso':
      return { tipo: 'redirigir', a: rutaDeVuelta(busqueda) };
    case 'profesor':
      return s.rol === 'profesor' ? MOSTRAR : { tipo: 'sin_permisos', estado: s.estado };
    case 'titular':
      return s.rol === 'alumno' && s.estado !== 'borrado' && s.estado !== 'sin_cuenta'
        ? MOSTRAR
        : { tipo: 'sin_permisos', estado: s.estado };
    case 'alumno_aprobado':
      return s.rol === 'alumno' && s.estado === 'aprobado' ? MOSTRAR : { tipo: 'sin_permisos', estado: s.estado };
  }
}

/** Qué hacer al entrar en `pathname` (+ `search`) con el estado de sesión dado. */
export function decidirGuarda(ruta: { pathname: string; search: string }, sesion: EstadoSesion): DecisionGuarda {
  const acceso = accesoDe(ruta.pathname);
  switch (sesion.tipo) {
    case 'visitante':
      return acceso === 'publico' || acceso === 'ingreso'
        ? MOSTRAR
        : { tipo: 'redirigir', a: aIngreso(ruta.pathname, ruta.search) };
    case 'cargando':
      // La agenda pública no espera a la sesión (ADR-017).
      return acceso === 'publico' ? MOSTRAR : { tipo: 'esperar' };
    case 'error':
      return acceso === 'publico' || acceso === 'ingreso' ? MOSTRAR : { tipo: 'error', mensaje: sesion.mensaje };
    case 'sesion':
      return decidirConSesion(acceso, ruta.pathname, ruta.search, sesion.sesion);
  }
}

/** Adaptador para `Navegacion` de src/ui (sin usuario = visitante). */
export function usuarioNavegacion(sesion: EstadoSesion): UsuarioNavegacion | undefined {
  if (sesion.tipo !== 'sesion') return undefined;
  const s = sesion.sesion;
  if (s.rol === 'profesor') return { rol: 'profesor' };
  // H-036: los estados de `Navegacion` son los del contrato de `sesion_actual`; no hay traducción.
  return { rol: 'alumno', estado: s.estado ?? 'sin_cuenta' };
}

/**
 * Texto de «Sin permisos» (flujos.md §1): dice por qué y, para un alumno, su estado (ALU-03, CA-03).
 * El motivo de rechazo del profesor no se muestra en pantalla (ux/web P-01).
 */
export function motivoSinPermisos(pathname: string, estado: EstadoAlumno | null): string {
  if (accesoDe(pathname) === 'profesor') return 'Esta pantalla es solo para el profesor.';
  switch (estado) {
    case null:
      return 'Esta pantalla es solo para alumnos.';
    case 'pendiente':
      return 'Tu cuenta está pendiente de aprobación. Cuando el profesor la apruebe vas a poder pedir clases.';
    case 'rechazado':
      return 'Tu cuenta fue rechazada, así que no podés pedir clases.';
    default:
      return 'Tu cuenta no tiene acceso a esta pantalla.';
  }
}

/** Salida de «Sin permisos»: el profesor vuelve a su panel; el resto, a la agenda. */
export function destinoSinPermisos(estado: EstadoAlumno | null): DestinoSinPermisos {
  return estado === null ? { texto: 'Ir al panel', href: '#/panel' } : { texto: 'Ir a la agenda', href: '#/' };
}
