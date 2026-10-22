// Datos y acciones de prueba compartidos por las pruebas de las vistas de la lista (T05.2).
import { vi, type Mock } from 'vitest';
import type { AccionesLista } from '../../../../src/modulos/lista/vistas/VistaLista';
import type { AlumnoLista, FalloLista } from '../../../../src/modulos/lista/logica';

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
    alta: vi.fn<AccionesLista['alta']>(() => Promise.resolve({ ok: true, alumnoId: 'n1', estado: 'aprobado' })),
    editar: vi.fn<AccionesLista['editar']>(() => Promise.resolve({ ok: true, alumnoId: 'a1' })),
  };
}
