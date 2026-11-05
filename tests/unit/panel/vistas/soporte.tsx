// Datos y montaje compartidos por las pruebas de las vistas del panel del profesor (T09.2).
import { fireEvent, render, screen } from '@testing-library/react';
import { vi, type Mock } from 'vitest';
import type { AlumnoLista } from '../../../../src/modulos/lista/logica';
import type { TramoGrilla } from '../../../../src/modulos/configuracion/logica';
import {
  bloquesDeClase,
  calendarioConElementos,
  diasCalendario,
  ejeCalendario,
  navegacionCalendario,
  sinClases,
  type BloqueClase,
  type ColumnaCalendario,
  type FalloBloqueo,
  type FalloPanel,
  type FilaAgendaDias,
  type FilaAgendaProfesor,
  type TipoSolicitud,
} from '../../../../src/modulos/panel/logica';
import type { AccionesPanel } from '../../../../src/modulos/panel/vistas/contrato';
import type { EstadoCalendario } from '../../../../src/modulos/panel/vistas/calendario';
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

export function falloBloqueo(
  codigo: FalloBloqueo['codigo'],
  mensaje: string,
  extra: Partial<Pick<FalloBloqueo, 'campo' | 'conflictos'>> = {},
): FalloBloqueo {
  return { ok: false, codigo, mensaje, campo: null, conflictos: [], ...extra };
}

export type AccionesSimuladas = { [K in 'crear' | 'mover' | 'cancelar' | 'bloquear' | 'desbloquear' | 'leerDia']: Mock<AccionesPanel[K]> } & {
  leerPersonasACargo: Mock<NonNullable<AccionesPanel['leerPersonasACargo']>>;
};

/** Acciones que responden bien por defecto; cada prueba pisa la que necesita con `mockResolvedValueOnce`. */
export function acciones(): AccionesSimuladas {
  return {
    crear: vi.fn<AccionesPanel['crear']>(() => Promise.resolve({ ok: true, reserva_id: 'r1', fechas: [H10], salteadas: [] })),
    mover: vi.fn<AccionesPanel['mover']>(() => Promise.resolve({ ok: true, clase_id: 'c2', fechas: [H11], salteadas: [] })),
    cancelar: vi.fn<AccionesPanel['cancelar']>(() => Promise.resolve({ ok: true, canceladas: 1 })),
    bloquear: vi.fn<AccionesPanel['bloquear']>(() => Promise.resolve({ ok: true, bloqueo_id: 'b1' })),
    desbloquear: vi.fn<AccionesPanel['desbloquear']>(() => Promise.resolve({ ok: true })),
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

/** Eje de la grilla inicial (CAL-04) que da la lógica: 08:00 a 18:00 con 5,5 rem por hora. */
export const EJE = ejeCalendario([], 60);

/** B19: tipo de cada solicitud por su `solicitud_id` (`agenda_profesor_dias.solicitud_tipo`, CAL-08; DEC-42 A, DEC-43 A). */
export type TiposDeSolicitud = Record<string, TipoSolicitud>;

/** Filas de `agenda_profesor_dias` de un día: las de `agenda_profesor` más el día y las horas reales de la clase. */
export function filasDias(filas: FilaAgendaProfesor[], dia = DIA, tipos: TiposDeSolicitud = {}): FilaAgendaDias[] {
  return filas.map((f) => ({
    ...f,
    dia,
    clase_inicio: f.clase_id === null ? null : f.inicio,
    clase_fin: f.clase_id === null ? null : f.fin,
    solicitud_tipo: f.solicitud_id === null ? null : (tipos[f.solicitud_id] ?? null),
  }));
}

/** Un bloque de clase armado por la lógica (`bloquesDeClase`) con las horas de la fila. */
export function bloqueDe(extra: Partial<FilaAgendaProfesor> = {}): BloqueClase {
  const bloque = bloquesDeClase(filasDias([ocupada(extra)]), ZONA)[0];
  if (!bloque) throw new Error('La fila no es una clase.');
  return bloque;
}

/** AGE-01: grilla inicial, lunes a viernes de 08:00 a 13:00 y de 14:00 a 18:00 (el 12/11/2026 es jueves). */
export const GRILLA: TramoGrilla[] = ([1, 2, 3, 4, 5] as const).flatMap((d) => [
  { dia_semana: d, desde: '08:00', hasta: '13:00' },
  { dia_semana: d, desde: '14:00', hasta: '18:00' },
]);

/** El calendario del día como lo arma la lógica (`calendarioConElementos`): clases, huecos libres y bloqueos (CAL-05..08). */
export function calendarioDe(
  filas: FilaAgendaProfesor[],
  dia = DIA,
  profesorActivo = true,
  tipos: TiposDeSolicitud = {},
): EstadoCalendario {
  const dias = diasCalendario([dia], filasDias(filas, dia, tipos), ZONA);
  const { columnas } = calendarioConElementos(dias, { grilla: GRILLA, duracionMin: 60 }, ZONA, profesorActivo);
  return { estado: 'listo', columnas, sinClases: sinClases(dias) };
}

/** La columna de un día con sus elementos, para probar `ColumnaDia` solo. */
export function columnaDe(filas: FilaAgendaProfesor[], dia = DIA, profesorActivo = true): ColumnaCalendario {
  const estado = calendarioDe(filas, dia, profesorActivo);
  if (estado.estado !== 'listo' || !estado.columnas[0]) throw new Error('Sin columna.');
  return estado.columnas[0];
}

export type OpcionesMontaje = Partial<VistaPanelProps> & {
  simuladas?: AccionesSimuladas;
  /**
   * Desde B17 el Panel abre en el calendario (CAL-01). Las pruebas de reglas y mensajes de la lista llegan a ella con
   * «Ver como lista» (CAL-19, CA-83); `'calendario'` deja la grilla.
   */
  modo?: 'lista' | 'calendario';
};

export function montar(filas: FilaAgendaProfesor[], opciones: OpcionesMontaje = {}) {
  const { simuladas: dadas, modo = 'lista', ...resto } = opciones;
  const simuladas = dadas ?? acciones();
  const onCambiarDia = vi.fn();
  const onRecargarAgenda = vi.fn();
  const onRecargarContadores = vi.fn();
  const onRecargarAlumnos = vi.fn();
  const props: VistaPanelProps = {
    dia: DIA,
    zona: ZONA,
    limites: LIMITES,
    agenda: { estado: 'listo', datos: filasDias(filas, resto.dia ?? DIA), error: null },
    calendario: calendarioDe(filas, resto.dia ?? DIA, resto.profesorActivo ?? true),
    eje: EJE,
    navegacion: navegacionCalendario({ vista: 'dia', dia: resto.dia ?? DIA }, resto.limites ?? LIMITES),
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
  if (modo === 'lista') fireEvent.click(screen.getByRole('button', { name: 'Ver como lista' }));
  return { ...r, props, simuladas, onCambiarDia, onRecargarAgenda, onRecargarContadores, onRecargarAlumnos };
}
