// Datos y acciones de prueba compartidos por las pruebas de las vistas de la lista (T05.2).
import { vi, type Mock } from 'vitest';
import type { AccionesLista } from '../../../../src/modulos/lista/vistas/VistaLista';
import type { AlumnoLista, ClaseProfesor, FalloLista, SolicitudPendiente } from '../../../../src/modulos/lista/logica';

export function alumno(extra: Partial<AlumnoLista> = {}): AlumnoLista {
  return {
    id: 'a1',
    estado: 'aprobado',
    nombre: 'Ana Pérez',
    mail: 'ana@correo.test',
    telefono: '099 123 456',
    fecha_nacimiento: '1990-02-03',
    como_llego: 'Me recomendó una amiga',
    motivo_estado: null,
    con_usuario: true,
    creado_en: '2026-10-01T12:00:00Z',
    ficha_completada_en: '2026-10-01T12:05:00Z',
    aprobado_en: null,
    edad: 36,
    editable: true,
    ...extra,
  };
}

export function fallo(codigo: FalloLista['codigo'], mensaje: string, campo: FalloLista['campo'] = null): FalloLista {
  return { ok: false, codigo, mensaje, campo, alumnoExistenteId: null };
}

export type AccionesSimuladas = { [K in keyof AccionesLista]: Mock<AccionesLista[K]> };

/** Acciones que responden bien por defecto; cada prueba pisa la que necesita con `mockResolvedValueOnce`. */
export function acciones(): AccionesSimuladas {
  return {
    aprobar: vi.fn<AccionesLista['aprobar']>(() => Promise.resolve({ ok: true, estado: 'aprobado', sugerencias: [] })),
    rechazar: vi.fn<AccionesLista['rechazar']>(() => Promise.resolve({ ok: true, estado: 'rechazado', sugerencias: [] })),
    sugerencias: vi.fn<AccionesLista['sugerencias']>(() => Promise.resolve({ ok: true, sugerencias: [] })),
    unir: vi.fn<AccionesLista['unir']>(() => Promise.resolve({ ok: true, cuentaId: 'p1' })),
    descartar: vi.fn<AccionesLista['descartar']>(() => Promise.resolve({ ok: true, cuentaId: 'p1' })),
    alta: vi.fn<AccionesLista['alta']>(() => Promise.resolve({ ok: true, alumnoId: 'n1', estado: 'aprobado', asociado: false })),
    editar: vi.fn<AccionesLista['editar']>(() => Promise.resolve({ ok: true, alumnoId: 'a1' })),
    borrar: vi.fn<AccionesLista['borrar']>(() => Promise.resolve({ ok: true, clasesCanceladas: 0, solicitudesAnuladas: 0 })),
  };
}

// B07 (T07.2): solicitudes pendientes y clases del profesor.

export function solicitud(extra: Partial<SolicitudPendiente> = {}): SolicitudPendiente {
  return {
    id: 's1',
    tipo: 'reserva',
    alcance: null,
    fecha_clase: '2026-11-02T13:00:00Z',
    vencida: false,
    alumno_id: 'a1',
    titular: 'Ana Pérez',
    quien_toma: 'Ana Pérez',
    observacion: null,
    reserva_tipo: 'suelta',
    frecuencia: null,
    origen_inicio: null,
    origen_fin: null,
    destino_inicio: '2026-11-02T13:00:00Z',
    destino_fin: '2026-11-02T14:00:00Z',
    reserva_id: 'r1',
    clase_id: null,
    creada_en: '2026-10-30T12:00:00Z',
    ...extra,
  };
}

export function claseProfesor(extra: Partial<ClaseProfesor> = {}): ClaseProfesor {
  return {
    id: 'c1',
    inicio: '2026-11-02T13:00:00Z',
    fin: '2026-11-02T14:00:00Z',
    estado: 'confirmada',
    alumno_id: 'a1',
    titular: 'Ana Pérez',
    quien_toma: 'Ana Pérez',
    persona_a_cargo_id: null,
    observacion: null,
    reserva_tipo: 'suelta',
    frecuencia: null,
    solicitud_pendiente: null,
    pasada: false,
    reserva_id: 'r1',
    ...extra,
  };
}
