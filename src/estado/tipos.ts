// Tipos de la sesión de la app (contratos.md §3 `sesion_actual`, ADR-007, ADR-013).
// Sin zod a propósito: este módulo entra en el arranque (src/main.tsx) y no debe engordar la ruta
// de agenda (ADR-017).

export const ESTADOS_ALUMNO = [
  'ficha_incompleta',
  'pendiente',
  'aprobado',
  'rechazado',
  'sin_cuenta',
  'borrado',
] as const;

export type EstadoAlumno = (typeof ESTADOS_ALUMNO)[number];

/**
 * Respuesta de `sesion_actual()`. `motivo_rechazo` es el texto del profesor solo con
 * `estado = "rechazado"`; si no, `null` (ALU-03, WEB-03). La vista lo muestra como texto (SEC-16).
 */
export interface SesionActual {
  rol: 'profesor' | 'alumno';
  alumno_id: string | null;
  estado: EstadoAlumno | null;
  nombre: string | null;
  mail: string | null;
  motivo_rechazo: string | null;
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

function textoONulo(objeto: Record<string, unknown>, campo: string): string | null {
  const valor = objeto[campo];
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== 'string') throw new SesionInvalida(`sesion_actual: ${campo} no es texto`);
  return valor;
}

const ESTADOS = new Set<string>(ESTADOS_ALUMNO);

/** Valida la respuesta de `sesion_actual()` contra el contrato; lanza `SesionInvalida` si no cumple. */
export function leerSesionActual(data: unknown): SesionActual {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new SesionInvalida('sesion_actual: respuesta sin objeto');
  }
  const o = data as Record<string, unknown>;
  if (o.rol !== 'profesor' && o.rol !== 'alumno') throw new SesionInvalida('sesion_actual: rol desconocido');
  const estado = textoONulo(o, 'estado');
  if (estado !== null && !ESTADOS.has(estado)) throw new SesionInvalida('sesion_actual: estado desconocido');
  if (o.rol === 'alumno' && estado === null) throw new SesionInvalida('sesion_actual: alumno sin estado');
  return {
    rol: o.rol,
    alumno_id: textoONulo(o, 'alumno_id'),
    estado: estado as EstadoAlumno | null,
    nombre: textoONulo(o, 'nombre'),
    mail: textoONulo(o, 'mail'),
    // ALU-03: el motivo solo se muestra mientras la cuenta está rechazada, aunque llegara otro valor.
    motivo_rechazo: estado === 'rechazado' ? textoONulo(o, 'motivo_rechazo') : null,
  };
}
