// Página principal y selector de profesor (WEB-09, WEB-11, ADR-020, DEC-25, DEC-28). Funciones puras: las
// usan los hooks de este módulo y se prueban con sesiones fijas.
import { destinoInicio } from '../../../estado/guardas';
import { inscripcionCon, normalizarSlug, rutaDeProfesor } from '../../../estado/profesor';
import type { EstadoInscripcion, EstadoSesion, SesionActual } from '../../../estado/tipos';

/** WEB-09: lo único que dice la página principal sin enlace de profesor (no lista profesores). */
export const MENSAJE_INICIO = 'Pedile el enlace a tu profesor';

/** Qué muestra `#/` (WEB-09). La guarda de ruta ya redirige; esto lo decide para la página. */
export type DecisionInicio =
  | { tipo: 'cargando' }
  /** Visitante, persona sin vínculos o sesión con error: el mensaje fijo y el acceso al ingreso. */
  | { tipo: 'mensaje'; conIngreso: boolean }
  | { tipo: 'redirigir'; a: string }
  | { tipo: 'selector'; opciones: OpcionProfesor[] };

/** Un profesor de la persona en el selector, con el estado del vínculo (WEB-11). */
export interface OpcionProfesor {
  slug: string;
  /** Texto (SEC-16). */
  profesorNombre: string;
  estado: EstadoInscripcion;
  /** false: «no toma reservas» (AGE-11). */
  activo: boolean;
  /** Es el profesor de la ruta o, fuera de una agenda, el elegido en esta pestaña. */
  actual: boolean;
  /** Ruta de su agenda, sin `#`. */
  ruta: string;
}

/**
 * WEB-11: el selector aparece en las pantallas de la persona solo con más de un vínculo; con uno no aparece
 * (DEC-25). Profesor y Administrador no lo ven.
 */
export function mostrarSelector(sesion: EstadoSesion): boolean {
  return (
    sesion.tipo === 'sesion' &&
    sesion.sesion.rol === 'alumno' &&
    sesion.sesion.estado === 'completa' &&
    sesion.sesion.inscripciones.length > 1
  );
}

/**
 * Profesores de la persona en el orden de `sesion_actual` (por nombre). `actual` marca el de la ruta
 * (`slugDeLaRuta`) o, si la ruta no es de un profesor, el elegido.
 */
export function opcionesSelector(
  s: SesionActual,
  slugDeLaRuta: string | null,
  elegido: string | null,
): OpcionProfesor[] {
  const marcado = normalizarSlug(slugDeLaRuta) ?? normalizarSlug(elegido);
  return s.inscripciones.map((i) => ({
    slug: i.slug,
    profesorNombre: i.profesor_nombre,
    estado: i.estado,
    activo: i.profesor_activo,
    actual: marcado !== null && normalizarSlug(i.slug) === marcado,
    ruta: rutaDeProfesor(i.slug),
  }));
}

/** WEB-09 con la sesión del momento. */
export function decidirInicio(sesion: EstadoSesion, elegido: string | null): DecisionInicio {
  switch (sesion.tipo) {
    case 'cargando':
      return { tipo: 'cargando' };
    case 'visitante':
      return { tipo: 'mensaje', conIngreso: true };
    case 'error':
      return { tipo: 'mensaje', conIngreso: false };
    case 'sesion':
      break;
  }
  const s = sesion.sesion;
  const destino = destinoInicio(s);
  if (destino !== null) return { tipo: 'redirigir', a: destino };
  if (mostrarSelector(sesion)) return { tipo: 'selector', opciones: opcionesSelector(s, null, elegido) };
  return { tipo: 'mensaje', conIngreso: false };
}

/**
 * Ruta del enlace «Agenda» de la persona (WEB-11): la del profesor elegido si sigue siendo suyo, la del único
 * profesor si tiene uno, y si no `/` (el inicio decide).
 */
export function rutaAgendaDePersona(sesion: EstadoSesion, elegido: string | null): string {
  if (sesion.tipo !== 'sesion' || sesion.sesion.rol !== 'alumno') return '/';
  const { inscripciones } = sesion.sesion;
  const delElegido = elegido === null ? undefined : inscripcionCon(inscripciones, elegido);
  if (delElegido) return rutaDeProfesor(delElegido.slug);
  const [unica, ...otras] = inscripciones;
  return unica && otras.length === 0 ? rutaDeProfesor(unica.slug) : '/';
}
