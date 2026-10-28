// Datos de prueba compartidos por las pruebas de las vistas de Mis clases (T07.2).
import type { EstadoSesion, Inscripcion, SesionActual } from '../../../../src/estado';
import type { ClaseMia, EstadoMisClases } from '../../../../src/modulos/mis-clases/logica';

export function clase(extra: Partial<ClaseMia> = {}): ClaseMia {
  return {
    id: 'c1',
    inicio: '2026-11-02T13:00:00Z',
    fin: '2026-11-02T14:00:00Z',
    estado: 'confirmada',
    quien_toma: 'Ana Pérez',
    persona_a_cargo_id: null,
    observacion: null,
    reserva_tipo: 'suelta',
    frecuencia: null,
    solicitud_pendiente: null,
    pasada: false,
    reserva_id: 'r1',
    profesor_id: 'pa',
    profesor_nombre: 'Profe Ana',
    profesor_slug: 'ana',
    zona_horaria: 'America/Montevideo',
    ...extra,
  };
}

export function inscripcion(extra: Partial<Inscripcion> = {}): Inscripcion {
  return {
    profesor_id: 'pa',
    slug: 'ana',
    profesor_nombre: 'Profe Ana',
    profesor_activo: true,
    estado: 'aprobado',
    motivo_rechazo: null,
    ...extra,
  };
}

export function sesion(extra: Partial<SesionActual> = {}): SesionActual {
  return {
    rol: 'alumno',
    es_administrador: false,
    profesor: null,
    alumno_id: 'al1',
    estado: 'completa',
    nombre: 'Ana Pérez',
    mail: 'ana@correo.test',
    inscripciones: [inscripcion()],
    ...extra,
  };
}

export const conSesion = (s: SesionActual = sesion()): EstadoSesion => ({ tipo: 'sesion', sesion: s });

export const LISTO = (clases: ClaseMia[]): EstadoMisClases => ({ estado: 'listo', clases, error: null });
