// Tipos, esquemas y textos de la configuración de la agenda del profesor (B10 · T10.1, WEB-08): grilla, duración,
// anticipación y huso. A mano contra contratos.md §3 (`guardar_configuracion`, `guardar_grilla`) y las tablas
// `profesor` y `grilla_tramo` (lectura por RLS: solo las suyas). AGE-01..04, AGE-08, AGE-10, SEC-09, SEC-16.
import { z } from 'zod';
import type { CodigoTraducido } from '../../../lib/errores';

/** SEC-09, contratos.md §3: límites de entrada de `guardar_configuracion` (no son reglas de la spec). */
export const DURACION_MIN_MINIMA = 1;
export const DURACION_MIN_MAXIMA = 1440;
export const ANTICIPACION_HORAS_MINIMA = 0;
/** 366 días: el alcance de `agenda_profesor` (H-140). */
export const ANTICIPACION_HORAS_MAXIMA = 8784;
/** SEC-09: `guardar_grilla` acepta hasta 50 tramos. */
export const MAX_TRAMOS_GRILLA = 50;

/** Día de la semana ISO: 1 = lunes … 7 = domingo. */
export const DIAS_SEMANA = [1, 2, 3, 4, 5, 6, 7] as const;
export type DiaSemana = (typeof DIAS_SEMANA)[number];

/** Hora `HH:MM` de 00:00 a 23:59. */
export const PATRON_HORA_DESDE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
/** Hora `HH:MM` de 00:00 a 23:59, o `24:00` (fin del día). */
export const PATRON_HORA_HASTA = /^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$/;

/** Un tramo de la grilla semanal (AGE-01), en la hora local del huso del profesor (ADR-004). */
export const esquemaTramo = z.object({
  dia_semana: z.number().int().min(1).max(7),
  desde: z.string().regex(PATRON_HORA_DESDE),
  hasta: z.string().regex(PATRON_HORA_HASTA),
});
export interface TramoGrilla {
  dia_semana: DiaSemana;
  /** `HH:MM`. */
  desde: string;
  /** `HH:MM` o `24:00`. */
  hasta: string;
}

/** Salida de `guardar_configuracion` y lectura de la fila propia de `profesor`. */
export const esquemaConfiguracionAgenda = z.object({
  zona_horaria: z.string().min(1),
  duracion_min: z.number().int(),
  anticipacion_horas: z.number().int(),
  horizonte_semanas: z.number().int(),
});
export type ConfiguracionAgenda = z.infer<typeof esquemaConfiguracionAgenda>;

/** Lo que edita el formulario de configuración (WEB-08). */
export interface EntradaConfiguracion {
  duracionMin: number;
  anticipacionHoras: number;
  zonaHoraria: string;
}

/** Configuración y grilla del profesor de la sesión. */
export interface AgendaConfigurada {
  config: ConfiguracionAgenda;
  /** Ordenada por día y hora de inicio. */
  grilla: TramoGrilla[];
}

/** Campos que puede marcar un 422 `DATOS_INVALIDOS` de `guardar_configuracion` y `guardar_grilla`. */
export const CAMPOS_CONFIGURACION = ['p_duracion_min', 'p_anticipacion_horas', 'p_zona_horaria', 'p_tramos'] as const;
export type CampoConfiguracion = (typeof CAMPOS_CONFIGURACION)[number];

export interface FalloConfiguracion {
  ok: false;
  codigo: CodigoTraducido;
  /** Texto ya traducido (SEC-17): nunca `details` crudos. */
  mensaje: string;
  /** Campo del 422 que la vista marca; null en los demás errores. */
  campo: CampoConfiguracion | null;
}

export type ResultadoConfiguracion = ({ ok: true } & ConfiguracionAgenda) | FalloConfiguracion;

/** Error de un tramo de la grilla, por índice en la lista que editó el profesor (contratos.md §1). */
export type ErrorTramo = 'dia' | 'hora' | 'orden' | 'solape';

export interface ValidacionGrilla {
  /** true si la lista cumple todas las reglas y se puede mandar. */
  valida: boolean;
  /** Un texto por tramo (mismo índice), o null si ese tramo está bien. */
  porTramo: (string | null)[];
  /** Error de toda la lista (más de 50 tramos), o null. */
  general: string | null;
}

export type ResultadoGrilla = { ok: true; grilla: TramoGrilla[] } | (FalloConfiguracion & { validacion: ValidacionGrilla | null });

export const MENSAJES_CONFIGURACION = {
  guardada: 'Listo: guardamos la configuración de tu agenda.',
  grillaGuardada: 'Listo: guardamos tu grilla semanal.',
  /** AGE-03, CA-12: lo ya guardado no cambia. */
  sinEfectoEnClases:
    'Las clases confirmadas y los pedidos pendientes conservan su horario: el cambio solo cambia los horarios libres que ofrecés.',
  /** ADR-004 (DEC-08 A), AGE-10: el cambio de huso es solo de su agenda. */
  cambioHuso:
    'Vas a cambiar el huso horario de tu agenda. Solo cambia tu agenda, no la de otros profesores. Tu grilla se va a leer en el huso nuevo, y las clases ya guardadas mantienen su momento real, así que pueden verse a otra hora.',
  duracionInvalida: `La duración tiene que ser un número entero de minutos entre ${DURACION_MIN_MINIMA} y ${DURACION_MIN_MAXIMA}.`,
  anticipacionInvalida: `La anticipación tiene que ser un número entero de horas entre ${ANTICIPACION_HORAS_MINIMA} y ${ANTICIPACION_HORAS_MAXIMA}.`,
  zonaInvalida: 'Elegí un huso horario de la lista.',
  grillaInvalida: 'Revisá los tramos marcados de la grilla.',
  demasiadosTramos: `La grilla puede tener hasta ${MAX_TRAMOS_GRILLA} tramos.`,
  tramo: {
    dia: 'Elegí un día de la semana.',
    hora: 'Usá horas HH:MM; el fin puede ser 24:00.',
    orden: 'El fin tiene que ser posterior al inicio.',
    solape: 'Se superpone con otro tramo del mismo día.',
  } satisfies Record<ErrorTramo, string>,
  diaSemana: {
    1: 'Lunes',
    2: 'Martes',
    3: 'Miércoles',
    4: 'Jueves',
    5: 'Viernes',
    6: 'Sábado',
    7: 'Domingo',
  } satisfies Record<DiaSemana, string>,
} as const;
