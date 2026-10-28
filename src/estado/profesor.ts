// Profesor de la ruta para la persona (ADR-020, WEB-01, WEB-11, ALU-14):
// - «profesor de origen»: el último slug visitado de un profesor sin vínculo; la ficha lo manda en
//   `completar_ficha(…, p_slug, p_como_llego)` para que la inscripción pendiente nazca con ella.
// - «profesor elegido»: el último profesor con vínculo que la persona eligió o abrió (selector de WEB-11).
// Los dos viven en `sessionStorage`: duran lo que la pestaña, sobreviven al ingreso con Google y al código
// (WEB-02) y no son secretos. Que el profesor esté activo lo confirma quien lo usa con `config_publica`.
import type { EstadoSesion, Inscripcion } from './tipos';

export const CLAVE_PROFESOR_ORIGEN = 'rtc.profesor-origen';
export const CLAVE_PROFESOR_ELEGIDO = 'rtc.profesor-elegido';

/** Slugs que nunca son de un profesor (ADM-02, ADR-018). */
export const SLUGS_RESERVADOS: readonly string[] = [
  'admin',
  'p',
  'ingreso',
  'ficha',
  'mis-clases',
  'panel',
  'lista',
  'configuracion',
  'inicio',
  'api',
  'reservas',
  'soporte',
  'ayuda',
];

const FORMA_SLUG = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
export const LARGO_MIN_SLUG = 3;
export const LARGO_MAX_SLUG = 30;

/**
 * Slug con la forma de ADM-02 (3 a 30, minúsculas, dígitos y guiones internos, no reservado), recortado y en
 * minúsculas como lo compara la base; `null` si no puede ser de ningún profesor (la web no consulta: AGE-09).
 */
export function normalizarSlug(valor: string | null | undefined): string | null {
  if (typeof valor !== 'string') return null;
  const slug = valor.trim().toLowerCase();
  if (slug.length < LARGO_MIN_SLUG || slug.length > LARGO_MAX_SLUG) return null;
  if (!FORMA_SLUG.test(slug) || SLUGS_RESERVADOS.includes(slug)) return null;
  return slug;
}

/** `/p/<slug>` → el slug tal como viene en la ruta; `null` si la ruta no es la agenda de un profesor. */
export function slugDeRuta(pathname: string): string | null {
  const partes = /^\/p\/([^/]+)\/?$/.exec(pathname);
  if (!partes?.[1]) return null;
  try {
    return decodeURIComponent(partes[1]);
  } catch {
    return null;
  }
}

/** Ruta de la agenda de un profesor (sin `#`). */
export function rutaDeProfesor(slug: string): string {
  return `/p/${encodeURIComponent(slug)}`;
}

type Almacen = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function delNavegador(): Almacen | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

let almacen: () => Almacen | null = delNavegador;
const oyentes = new Set<() => void>();

function leer(clave: string): string | null {
  try {
    return normalizarSlug(almacen()?.getItem(clave));
  } catch {
    return null;
  }
}

function escribir(clave: string, slug: string | null): void {
  try {
    const a = almacen();
    if (slug === null) a?.removeItem(clave);
    else a?.setItem(clave, slug);
  } catch {
    // Sin sessionStorage (modo privado estricto): la app sigue, solo no recuerda el profesor.
  }
  for (const oyente of oyentes) oyente();
}

export function leerProfesorOrigen(): string | null {
  return leer(CLAVE_PROFESOR_ORIGEN);
}

export function guardarProfesorOrigen(slug: string): void {
  const valido = normalizarSlug(slug);
  if (valido !== null && valido !== leerProfesorOrigen()) escribir(CLAVE_PROFESOR_ORIGEN, valido);
}

export function olvidarProfesorOrigen(): void {
  if (leerProfesorOrigen() !== null) escribir(CLAVE_PROFESOR_ORIGEN, null);
}

export function leerProfesorElegido(): string | null {
  return leer(CLAVE_PROFESOR_ELEGIDO);
}

/** WEB-11: guarda el profesor con el que la persona trabaja (el selector navega después a su agenda). */
export function elegirProfesor(slug: string): void {
  const valido = normalizarSlug(slug);
  if (valido !== null && valido !== leerProfesorElegido()) escribir(CLAVE_PROFESOR_ELEGIDO, valido);
}

export function olvidarProfesorElegido(): void {
  if (leerProfesorElegido() !== null) escribir(CLAVE_PROFESOR_ELEGIDO, null);
}

export function suscribirProfesor(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/** Solo para pruebas: cambia el almacén (por defecto, `sessionStorage`) y olvida los oyentes. */
export function configurarAlmacenProfesor(nuevo?: () => Almacen | null): void {
  almacen = nuevo ?? delNavegador;
  oyentes.clear();
}

/** El vínculo de la persona con el profesor del slug, o `undefined`. */
export function inscripcionCon(inscripciones: readonly Inscripcion[], slug: string): Inscripcion | undefined {
  const buscado = normalizarSlug(slug);
  return buscado === null ? undefined : inscripciones.find((i) => normalizarSlug(i.slug) === buscado);
}

/**
 * Qué relación tiene quien mira con el profesor de la agenda (ADR-020, DEC-28): las acciones miran el
 * vínculo con ese profesor, nunca un estado global.
 * - `sin_vinculo`: ficha completa y sin vínculo → «Pedir acceso» (ALU-14).
 * - `vinculo`: pendiente o rechazado → su estado (WEB-01); aprobado → puede pedir clases.
 */
export type RelacionConProfesor =
  | { tipo: 'cargando' }
  | { tipo: 'error' }
  | { tipo: 'visitante' }
  | { tipo: 'profesor'; propio: boolean }
  | { tipo: 'administrador' }
  | { tipo: 'ficha_incompleta' }
  | { tipo: 'sin_acceso' }
  | { tipo: 'sin_vinculo' }
  | { tipo: 'vinculo'; inscripcion: Inscripcion };

export function relacionConProfesor(sesion: EstadoSesion, slug: string): RelacionConProfesor {
  switch (sesion.tipo) {
    case 'cargando':
    case 'visitante':
      return { tipo: sesion.tipo };
    case 'error':
      return { tipo: 'error' };
    case 'sesion':
      break;
  }
  const s = sesion.sesion;
  if (s.rol === 'profesor') {
    return { tipo: 'profesor', propio: s.profesor !== null && s.profesor.slug === normalizarSlug(slug) };
  }
  if (s.rol === 'administrador') return { tipo: 'administrador' };
  if (s.estado === 'ficha_incompleta') return { tipo: 'ficha_incompleta' };
  if (s.estado !== 'completa') return { tipo: 'sin_acceso' };
  const inscripcion = inscripcionCon(s.inscripciones, slug);
  return inscripcion ? { tipo: 'vinculo', inscripcion } : { tipo: 'sin_vinculo' };
}

/** WEB-01: puede tocar un hueco libre y pedir clase a ese profesor (vínculo aprobado y profesor activo). */
export function puedeSolicitarA(relacion: RelacionConProfesor): boolean {
  return (
    relacion.tipo === 'vinculo' && relacion.inscripcion.estado === 'aprobado' && relacion.inscripcion.profesor_activo
  );
}

/** ALU-14: ve «Pedir acceso» (ficha completa, sin vínculo). Con el profesor inactivo nadie pide (AGE-11). */
export function puedePedirAcceso(relacion: RelacionConProfesor, profesorActivo: boolean): boolean {
  return relacion.tipo === 'sin_vinculo' && profesorActivo;
}

/**
 * Anota la visita a `#/p/<slug>` (ADR-020): con vínculo, ese profesor pasa a ser el elegido (WEB-11); sin
 * vínculo (visitante, ficha incompleta o completa sin vínculo), queda como profesor de origen para la ficha
 * (ALU-14). Profesor y Administrador no anotan nada. Mientras la sesión carga no decide: se vuelve a llamar.
 */
export function anotarVisitaDeProfesor(slugDeLaRuta: string, sesion: EstadoSesion): void {
  const slug = normalizarSlug(slugDeLaRuta);
  if (slug === null) return;
  const relacion = relacionConProfesor(sesion, slug);
  switch (relacion.tipo) {
    case 'vinculo':
      elegirProfesor(slug);
      if (leerProfesorOrigen() === slug) olvidarProfesorOrigen();
      return;
    case 'visitante':
    case 'ficha_incompleta':
    case 'sin_vinculo':
      guardarProfesorOrigen(slug);
      return;
    default:
      return;
  }
}
