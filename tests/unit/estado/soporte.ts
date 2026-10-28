// Sesiones fijas con la forma de `sesion_actual()` de B14 (ADR-020) para las pruebas de lógica.
import type { EstadoInscripcion, EstadoSesion, Inscripcion, SesionActual } from '../../../src/estado';

export function inscripcion(slug: string, estado: EstadoInscripcion, extra: Partial<Inscripcion> = {}): Inscripcion {
  return {
    profesor_id: `id-${slug}`,
    slug,
    profesor_nombre: `Prof ${slug}`,
    profesor_activo: true,
    estado,
    motivo_rechazo: null,
    ...extra,
  };
}

export function persona(inscripciones: Inscripcion[] = [], estado: SesionActual['estado'] = 'completa'): SesionActual {
  return {
    rol: 'alumno',
    es_administrador: false,
    profesor: null,
    alumno_id: 'a1',
    estado,
    nombre: 'Ana',
    mail: 'ana@example.com',
    inscripciones,
  };
}

export function profesor(slug = 'ana-perez', activo = true, esAdministrador = false): SesionActual {
  return {
    rol: 'profesor',
    es_administrador: esAdministrador,
    profesor: { id: `id-${slug}`, slug, nombre: `Prof ${slug}`, activo },
    alumno_id: null,
    estado: null,
    nombre: `Prof ${slug}`,
    mail: 'prof@example.com',
    inscripciones: [],
  };
}

export const ADMINISTRADOR: SesionActual = {
  rol: 'administrador',
  es_administrador: true,
  profesor: null,
  alumno_id: null,
  estado: null,
  nombre: null,
  mail: 'admin@example.com',
  inscripciones: [],
};

export function enSesion(sesion: SesionActual): EstadoSesion {
  return { tipo: 'sesion', sesion };
}

/** `sessionStorage` en memoria para `configurarAlmacenProfesor`. */
export function almacenEnMemoria() {
  const datos = new Map<string, string>();
  return {
    datos,
    almacen: {
      getItem: (k: string) => datos.get(k) ?? null,
      setItem: (k: string, v: string) => void datos.set(k, v),
      removeItem: (k: string) => void datos.delete(k),
    },
  };
}
