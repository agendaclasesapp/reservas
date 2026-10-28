// Datos y montaje compartidos por las pruebas de las vistas del panel del profesor (T09.2).
import { render } from '@testing-library/react';
import { vi, type Mock } from 'vitest';
import type { AlumnoLista } from '../../../../src/modulos/lista/logica';
import type { FalloPanel, FilaAgendaProfesor } from '../../../../src/modulos/panel/logica';
import type { AccionesPanel } from '../../../../src/modulos/panel/vistas/contrato';
import { VistaPanel, type VistaPanelProps } from '../../../../src/modulos/panel/vistas/VistaPanel';
import { alumno } from '../../lista/vistas/soporte';

export const ZONA = 'America/Montevideo';
export const DIA = '2026-11-12';
export const LIMITES = { hoy: '2026-11-02', min: '2025-11-01', max: '2027-11-03' };

/** 10:00 en Montevideo (UTC-3) del 12/11. */
export const H10 = '2026-11-12T13:00:00Z';
export const H11 = '2026-11-12T14:00:00Z';
export const H12 = '2026-11-12T15:00:00Z';
export const H13 = '2026-11-12T16:00:00Z';

export function fila(extra: Partial<FilaAgendaProfesor> = {}): FilaAgendaProfesor {
  return {
    inicio: H10,
    fin: H11,
    estado: 'libre',
    clase_id: null,
    solicitud_id: null,
    quien_toma: null,
    titular: null,
    observacion: null,
    clase_estado: null,
    bloqueo_id: null,
    bloqueo_motivo: null,
    reserva_tipo: null,
    pasada: false,
    ...extra,
  };
}

export function ocupada(extra: Partial<FilaAgendaProfesor> = {}): FilaAgendaProfesor {
  return fila({
    estado: 'ocupado',
    clase_id: 'c1',
    quien_toma: 'Ana Pérez',
    titular: 'Ana Pérez',
    clase_estado: 'confirmada',
    reserva_tipo: 'suelta',
    ...extra,
  });
}

export const LIBRE_11 = fila({ inicio: H11, fin: H12 });
export const LIBRE_12 = fila({ inicio: H12, fin: H13 });

export function fallo(codigo: FalloPanel['codigo'], mensaje: string, campo: FalloPanel['campo'] = null): FalloPanel {
  return { ok: false, codigo, mensaje, campo };
}

export type AccionesSimuladas = { [K in 'crear' | 'mover' | 'cancelar' | 'leerDia']: Mock<AccionesPanel[K]> } & {
  leerPersonasACargo: Mock<NonNullable<AccionesPanel['leerPersonasACargo']>>;
};

/** Acciones que responden bien por defecto; cada prueba pisa la que necesita con `mockResolvedValueOnce`. */
export function acciones(): AccionesSimuladas {
  return {
    crear: vi.fn<AccionesPanel['crear']>(() => Promise.resolve({ ok: true, reserva_id: 'r1', fechas: [H10], salteadas: [] })),
    mover: vi.fn<AccionesPanel['mover']>(() => Promise.resolve({ ok: true, clase_id: 'c2', fechas: [H11], salteadas: [] })),
    cancelar: vi.fn<AccionesPanel['cancelar']>(() => Promise.resolve({ ok: true, canceladas: 1 })),
    leerDia: vi.fn<AccionesPanel['leerDia']>(() => Promise.resolve([ocupada(), LIBRE_11, LIBRE_12])),
    leerPersonasACargo: vi.fn<NonNullable<AccionesPanel['leerPersonasACargo']>>(() => Promise.resolve([])),
  };
}

export const ANA: AlumnoLista = alumno({ id: 'a1', nombre: 'Ana Pérez', mail: 'ana@correo.test', estado: 'aprobado' });
export const BRUNO: AlumnoLista = alumno({
  id: 'a2',
  nombre: 'Bruno Díaz',
  mail: null,
  estado: 'sin_cuenta',
  con_usuario: false,
});
export const CARLA: AlumnoLista = alumno({ id: 'a3', nombre: 'Carla Gómez', mail: 'carla@correo.test', estado: 'pendiente' });

export type OpcionesMontaje = Partial<VistaPanelProps> & { simuladas?: AccionesSimuladas };

export function montar(filas: FilaAgendaProfesor[], opciones: OpcionesMontaje = {}) {
  const { simuladas: dadas, ...resto } = opciones;
  const simuladas = dadas ?? acciones();
  const onCambiarDia = vi.fn();
  const onRecargarAgenda = vi.fn();
  const onRecargarContadores = vi.fn();
  const onRecargarAlumnos = vi.fn();
  const props: VistaPanelProps = {
    dia: DIA,
    zona: ZONA,
    limites: LIMITES,
    agenda: { estado: 'listo', datos: filas, error: null },
    contadores: { estado: 'listo', datos: { solicitudes_pendientes: 3, cuentas_pendientes: 1 }, error: null },
    alumnos: { estado: 'listo', alumnos: [ANA, BRUNO, CARLA], error: null },
    profesorActivo: true,
    acciones: simuladas,
    onCambiarDia,
    onRecargarAgenda,
    onRecargarContadores,
    onRecargarAlumnos,
    escritorio: false,
    ...resto,
  };
  const r = render(<VistaPanel {...props} />);
  return { ...r, simuladas, onCambiarDia, onRecargarAgenda, onRecargarContadores, onRecargarAlumnos };
}
