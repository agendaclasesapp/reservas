// Guardas de ruta (ADR-007, ADR-020; ux/web/flujos.md §1, «Reglas de acceso"). Solo deciden qué se ve: la
// autorización real es RLS y las RPC (NFR-01, ADR-001).
// - Visitante en ruta con sesión → `/ingreso?volver=<ruta>`.
// - Con sesión en `/ingreso` → la ruta de `?volver=` o `/`.
// - Persona con `ficha_incompleta` → `/ficha` desde cualquier ruta (ALU-02, CA-02).
// - `/` (WEB-09): profesor → `/panel`; Administrador que no es profesor → `/admin`; persona con un solo
//   vínculo → `/p/<slug>`; con más de uno, el selector; sin vínculos o visitante, el mensaje fijo.
// - `/p/<slug>` es pública: la agenda no espera a la sesión (ADR-017).
// - Rol o vínculo sin acceso → «Sin permisos» con el motivo (no redirige en silencio; ALU-03, CA-03).
import type { UsuarioNavegacion } from '../ui/Navegacion';
import type { DestinoSinPermisos } from '../ui/SinPermisos';
import { rutaDeProfesor, slugDeRuta } from './profesor';
import type { EstadoSesion, SesionActual } from './tipos';

export type DecisionGuarda =
  | { tipo: 'mostrar' }
  | { tipo: 'esperar' }
  | { tipo: 'redirigir'; a: string }
  | { tipo: 'sin_permisos'; motivo: string; destino: DestinoSinPermisos }
  | { tipo: 'error'; mensaje: string };

type Acceso = 'publico' | 'ingreso' | 'persona' | 'alumno_aprobado' | 'profesor' | 'administrador';

const ACCESOS: Readonly<Record<string, Acceso>> = {
  '/': 'publico',
  '/ingreso': 'ingreso',
  '/ficha': 'persona',
  '/solicitud': 'alumno_aprobado',
  '/mis-clases': 'alumno_aprobado',
  '/panel': 'profesor',
  '/lista': 'profesor',
  '/configuracion': 'profesor',
  '/admin': 'administrador',
};

export const RUTA_INICIO = '/';
export const RUTA_FICHA = '/ficha';
export const RUTA_INGRESO = '/ingreso';
export const RUTA_PANEL = '/panel';
export const RUTA_ADMIN = '/admin';

function esRutaPropia(pathname: string): boolean {
  return Object.hasOwn(ACCESOS, pathname) || slugDeRuta(pathname) !== null;
}

/** Acceso de una ruta del router; las desconocidas son públicas (el router las manda a `/`). */
export function accesoDe(pathname: string): Acceso {
  return Object.hasOwn(ACCESOS, pathname) ? (ACCESOS[pathname] as Acceso) : 'publico';
}

/**
 * `?volver=` válido o `/`: una ruta conocida del router (con su query, p. ej. `/solicitud?hueco=…`) o la
 * agenda de un profesor `/p/<slug>` (WEB-02), nunca el ingreso ni algo que no empiece con una ruta propia.
 */
export function rutaDeVuelta(busqueda: string): string {
  const volver = new URLSearchParams(busqueda).get('volver');
  if (volver === null) return RUTA_INICIO;
  const ruta = volver.split(/[?#]/, 1)[0] ?? '';
  const resto = volver.slice(ruta.length);
  if (ruta === RUTA_INGRESO || !esRutaPropia(ruta) || resto.startsWith('#')) return RUTA_INICIO;
  return volver;
}

function aIngreso(pathname: string, search: string): string {
  return `${RUTA_INGRESO}?${new URLSearchParams({ volver: pathname + search }).toString()}`;
}

/** true si es una persona (alumno) con al menos un vínculo aprobado. */
function tieneVinculoAprobado(s: SesionActual): boolean {
  return s.inscripciones.some((i) => i.estado === 'aprobado');
}

/**
 * WEB-09: a dónde lleva `/` con la sesión cargada; `null` = quedarse (mensaje fijo o selector de WEB-11).
 * El Administrador que además es profesor entra como profesor (ADR-020).
 */
export function destinoInicio(s: SesionActual): string | null {
  if (s.rol === 'profesor') return RUTA_PANEL;
  if (s.rol === 'administrador') return RUTA_ADMIN;
  if (s.estado !== 'completa') return null;
  const [unica, ...otras] = s.inscripciones;
  return unica && otras.length === 0 ? rutaDeProfesor(unica.slug) : null;
}

export const MOTIVOS_SIN_PERMISOS = {
  soloProfesor: 'Esta pantalla es solo para el profesor.',
  soloAdministrador: 'Esta pantalla es solo para el Administrador.',
  soloAlumnos: 'Esta pantalla es solo para alumnos.',
  pendiente: 'Tu cuenta está pendiente de aprobación. Cuando el profesor la apruebe vas a poder pedir clases.',
  rechazado: 'Tu cuenta fue rechazada, así que no podés pedir clases.',
  sinVinculo: 'Todavía no tenés acceso con ningún profesor. Pedile el enlace a tu profesor.',
  sinAcceso: 'Tu cuenta no tiene acceso a esta pantalla.',
} as const;

/**
 * Texto de «Sin permisos» (flujos.md §1): dice por qué y, para una persona, el estado de sus vínculos
 * (ALU-03, CA-03). El motivo de rechazo de un profesor no se muestra acá (ux/web P-01): va en la ficha.
 */
export function motivoSinPermisos(pathname: string, s: SesionActual | null): string {
  const acceso = accesoDe(pathname);
  if (acceso === 'profesor') return MOTIVOS_SIN_PERMISOS.soloProfesor;
  if (acceso === 'administrador') return MOTIVOS_SIN_PERMISOS.soloAdministrador;
  if (s === null || s.rol !== 'alumno') return MOTIVOS_SIN_PERMISOS.soloAlumnos;
  if (s.estado !== 'completa') return MOTIVOS_SIN_PERMISOS.sinAcceso;
  if (s.inscripciones.length === 0) return MOTIVOS_SIN_PERMISOS.sinVinculo;
  if (s.inscripciones.some((i) => i.estado === 'pendiente')) return MOTIVOS_SIN_PERMISOS.pendiente;
  if (s.inscripciones.every((i) => i.estado === 'rechazado')) return MOTIVOS_SIN_PERMISOS.rechazado;
  return MOTIVOS_SIN_PERMISOS.sinAcceso;
}

/** Salida de «Sin permisos»: el profesor vuelve a su panel; el Administrador, a la suya; el resto, al inicio. */
export function destinoSinPermisos(s: SesionActual | null): DestinoSinPermisos {
  if (s?.rol === 'profesor') return { texto: 'Ir al panel', href: `#${RUTA_PANEL}` };
  if (s?.rol === 'administrador') return { texto: 'Ir a administración', href: `#${RUTA_ADMIN}` };
  return { texto: 'Ir a la agenda', href: `#${RUTA_INICIO}` };
}

const MOSTRAR: DecisionGuarda = Object.freeze({ tipo: 'mostrar' });

function sinPermisos(pathname: string, s: SesionActual): DecisionGuarda {
  return { tipo: 'sin_permisos', motivo: motivoSinPermisos(pathname, s), destino: destinoSinPermisos(s) };
}

function decidirConSesion(acceso: Acceso, pathname: string, busqueda: string, s: SesionActual): DecisionGuarda {
  if (s.rol === 'alumno' && s.estado === 'ficha_incompleta') {
    return pathname === RUTA_FICHA ? MOSTRAR : { tipo: 'redirigir', a: RUTA_FICHA };
  }
  const permitido = (condicion: boolean) => (condicion ? MOSTRAR : sinPermisos(pathname, s));
  switch (acceso) {
    case 'publico': {
      const destino = pathname === RUTA_INICIO ? destinoInicio(s) : null;
      return destino === null ? MOSTRAR : { tipo: 'redirigir', a: destino };
    }
    case 'ingreso':
      return { tipo: 'redirigir', a: rutaDeVuelta(busqueda) };
    case 'profesor':
      // PRF-08: el profesor inactivo sigue entrando a su panel; las acciones las limita la base.
      return permitido(s.rol === 'profesor');
    case 'administrador':
      return permitido(s.es_administrador);
    case 'persona':
      return permitido(s.rol === 'alumno' && s.estado === 'completa');
    case 'alumno_aprobado':
      return permitido(s.rol === 'alumno' && s.estado === 'completa' && tieneVinculoAprobado(s));
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
      // La agenda pública y el inicio no esperan a la sesión (ADR-017).
      return acceso === 'publico' ? MOSTRAR : { tipo: 'esperar' };
    case 'error':
      return acceso === 'publico' || acceso === 'ingreso' ? MOSTRAR : { tipo: 'error', mensaje: sesion.mensaje };
    case 'sesion':
      return decidirConSesion(acceso, ruta.pathname, ruta.search, sesion.sesion);
  }
}

/**
 * Estado de cuenta resumido para la navegación actual de src/ui (T14.4 la rehace por vínculo): ficha
 * incompleta o borrada tal cual; con ficha completa, el mejor estado entre sus vínculos.
 */
function estadoParaNavegacion(s: SesionActual) {
  if (s.estado === 'ficha_incompleta' || s.estado === 'borrado') return s.estado;
  if (tieneVinculoAprobado(s)) return 'aprobado';
  if (s.inscripciones.some((i) => i.estado === 'rechazado') && !s.inscripciones.some((i) => i.estado === 'pendiente')) {
    return 'rechazado';
  }
  return 'pendiente';
}

/**
 * Adaptador para `Navegacion` de src/ui (sin usuario = visitante). El profesor que además es Administrador
 * lleva `esAdministrador` para ver también «Administración» (ADM-04, ADR-020). `nombre` es quién está
 * conectado: el de la sesión o, sin él (el Administrador), su mail (WEB-13).
 */
export function usuarioNavegacion(sesion: EstadoSesion): UsuarioNavegacion | undefined {
  if (sesion.tipo !== 'sesion') return undefined;
  const s = sesion.sesion;
  const nombre = s.nombre ?? s.mail ?? undefined;
  if (s.rol === 'profesor') {
    return s.es_administrador ? { rol: 'profesor', esAdministrador: true, nombre } : { rol: 'profesor', nombre };
  }
  if (s.rol === 'administrador') return { rol: 'administrador', nombre };
  return { rol: 'alumno', estado: estadoParaNavegacion(s), nombre };
}
