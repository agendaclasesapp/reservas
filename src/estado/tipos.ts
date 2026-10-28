// Tipos de la sesión de la app (contratos.md §3 `sesion_actual`, ADR-007, ADR-013, ADR-020).
// Sin zod a propósito: este módulo entra en el arranque (src/main.tsx) y no debe engordar la ruta
// de agenda (ADR-017).

/** Rol de la sesión: profesor, después Administrador, después persona (alumno) (ADR-020). */
export const ROLES_SESION = ['administrador', 'profesor', 'alumno'] as const;
export type RolSesion = (typeof ROLES_SESION)[number];

/** Estado de la ficha de la persona (`alumno.estado`, ADR-018). `borrado` no inicia sesión, pero se tolera. */
export const ESTADOS_PERSONA = ['ficha_incompleta', 'completa', 'borrado'] as const;
export type EstadoPersona = (typeof ESTADOS_PERSONA)[number];

/** Estado del vínculo con un profesor (`inscripcion.estado`); `sesion_actual` no trae las de `baja`. */
export const ESTADOS_INSCRIPCION = ['pendiente', 'aprobado', 'rechazado', 'sin_cuenta'] as const;
export type EstadoInscripcion = (typeof ESTADOS_INSCRIPCION)[number];

/** Profesor de la sesión (solo con `rol = "profesor"`). */
export interface ProfesorDeSesion {
  id: string;
  slug: string;
  /** Texto: la vista lo muestra escapado (SEC-16). */
  nombre: string;
  activo: boolean;
}

/**
 * Vínculo de la persona con un profesor (ALU-03, ALU-14, WEB-03, WEB-11). `motivo_rechazo` es el texto
 * de ese profesor solo con `estado = "rechazado"`; si no, `null`. La vista lo muestra como texto (SEC-16).
 */
export interface Inscripcion {
  profesor_id: string;
  slug: string;
  profesor_nombre: string;
  profesor_activo: boolean;
  estado: EstadoInscripcion;
  motivo_rechazo: string | null;
}

/** Respuesta de `sesion_actual()` (ADR-020). `inscripciones` llega ordenada por nombre del profesor. */
export interface SesionActual {
  rol: RolSesion;
  es_administrador: boolean;
  profesor: ProfesorDeSesion | null;
  alumno_id: string | null;
  estado: EstadoPersona | null;
  nombre: string | null;
  mail: string | null;
  inscripciones: Inscripcion[];
}

/** Estado de la sesión para vistas y guardas. */
export type EstadoSesion =
  | { tipo: 'cargando' }
  | { tipo: 'visitante' }
  | { tipo: 'sesion'; sesion: SesionActual }
  /** No se pudo leer `sesion_actual` (red o servidor); `mensaje` ya viene traducido (SEC-17). */
  | { tipo: 'error'; mensaje: string };

/** Error de supabase-js Auth reducido a lo que la app mira; nunca se muestra crudo (SEC-17). */
export interface ErrorAuth {
  status?: number;
  code?: string;
  name?: string;
  message?: string;
}

export class SesionInvalida extends Error {
  override name = 'SesionInvalida';
}

type Objeto = Record<string, unknown>;

function esObjeto(valor: unknown): valor is Objeto {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function textoONulo(objeto: Objeto, campo: string, donde = 'sesion_actual'): string | null {
  const valor = objeto[campo];
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== 'string') throw new SesionInvalida(`${donde}: ${campo} no es texto`);
  return valor;
}

function texto(objeto: Objeto, campo: string, donde: string): string {
  const valor = textoONulo(objeto, campo, donde);
  if (valor === null || valor === '') throw new SesionInvalida(`${donde}: falta ${campo}`);
  return valor;
}

function booleano(objeto: Objeto, campo: string, donde: string): boolean {
  const valor = objeto[campo];
  if (typeof valor !== 'boolean') throw new SesionInvalida(`${donde}: ${campo} no es booleano`);
  return valor;
}

function deLista<T extends string>(lista: readonly T[], valor: unknown): valor is T {
  return typeof valor === 'string' && (lista as readonly string[]).includes(valor);
}

function leerProfesor(valor: unknown): ProfesorDeSesion | null {
  if (valor === null || valor === undefined) return null;
  if (!esObjeto(valor)) throw new SesionInvalida('sesion_actual: profesor no es objeto');
  const donde = 'sesion_actual.profesor';
  return {
    id: texto(valor, 'id', donde),
    slug: texto(valor, 'slug', donde),
    nombre: textoONulo(valor, 'nombre', donde) ?? '',
    activo: booleano(valor, 'activo', donde),
  };
}

function leerInscripcion(valor: unknown): Inscripcion {
  const donde = 'sesion_actual.inscripciones';
  if (!esObjeto(valor)) throw new SesionInvalida(`${donde}: elemento no es objeto`);
  if (!deLista(ESTADOS_INSCRIPCION, valor.estado)) throw new SesionInvalida(`${donde}: estado desconocido`);
  const estado = valor.estado;
  return {
    profesor_id: texto(valor, 'profesor_id', donde),
    slug: texto(valor, 'slug', donde),
    profesor_nombre: textoONulo(valor, 'profesor_nombre', donde) ?? '',
    profesor_activo: booleano(valor, 'profesor_activo', donde),
    estado,
    // ALU-03: el motivo solo se muestra con el vínculo rechazado, aunque llegara otro valor.
    motivo_rechazo: estado === 'rechazado' ? textoONulo(valor, 'motivo_rechazo', donde) : null,
  };
}

/** Valida la respuesta de `sesion_actual()` contra el contrato; lanza `SesionInvalida` si no cumple. */
export function leerSesionActual(data: unknown): SesionActual {
  if (!esObjeto(data)) throw new SesionInvalida('sesion_actual: respuesta sin objeto');
  const o = data;
  if (!deLista(ROLES_SESION, o.rol)) throw new SesionInvalida('sesion_actual: rol desconocido');
  const rol = o.rol;
  const estado = o.estado ?? null;
  if (estado !== null && !deLista(ESTADOS_PERSONA, estado)) {
    throw new SesionInvalida('sesion_actual: estado desconocido');
  }
  const profesor = leerProfesor(o.profesor);
  const alumnoId = textoONulo(o, 'alumno_id');
  if (rol === 'profesor' && profesor === null) throw new SesionInvalida('sesion_actual: profesor sin datos');
  if (rol === 'alumno' && (estado === null || alumnoId === null)) {
    throw new SesionInvalida('sesion_actual: alumno sin estado');
  }
  const inscripciones = o.inscripciones ?? [];
  if (!Array.isArray(inscripciones)) throw new SesionInvalida('sesion_actual: inscripciones no es lista');
  return {
    rol,
    // Un rol `administrador` lo es siempre, aunque la bandera llegara falsa.
    es_administrador: rol === 'administrador' || o.es_administrador === true,
    profesor: rol === 'profesor' ? profesor : null,
    alumno_id: alumnoId,
    estado,
    nombre: textoONulo(o, 'nombre'),
    mail: textoONulo(o, 'mail'),
    // Solo la persona tiene vínculos (ADR-020).
    inscripciones: rol === 'alumno' ? inscripciones.map(leerInscripcion) : [],
  };
}
