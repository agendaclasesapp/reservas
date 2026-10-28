// Tipos, esquemas y textos del panel del profesor (B09): `agenda_profesor`, `contadores`, `crear_clase`,
// `mover_clase` y `cancelar_clase` (contratos.md §3). Tipos a mano contra supabase/migrations/2026110009*.
// B10 (T10.1): `bloquear` y `desbloquear` (AGE-05, AGE-06), contra supabase/migrations/2026110010*.
// PRF-01..05, PRF-08, AVI-01, AVI-04, SEC-09, SEC-16 (todo texto se muestra como texto).
import { z } from 'zod';

export const ESTADOS_HUECO_PROFESOR = ['libre', 'ocupado', 'bloqueado'] as const;
export type EstadoHuecoProfesor = (typeof ESTADOS_HUECO_PROFESOR)[number];

/** Estado de la clase que ocupa un hueco: solo las activas ocupan (RES-01). */
export const ESTADOS_CLASE_AGENDA = ['pendiente', 'confirmada'] as const;
export type EstadoClaseAgenda = (typeof ESTADOS_CLASE_AGENDA)[number];

export const TIPOS_CLASE = ['suelta', 'serie'] as const;
export type TipoClase = (typeof TIPOS_CLASE)[number];

/** Serie semanal (1) o quincenal (2) (RES-02). */
export const FRECUENCIAS = [1, 2] as const;
export type Frecuencia = (typeof FRECUENCIAS)[number];

/** PRF-02, PRF-03: en una serie, «solo esta clase» o «de acá en adelante». En una suelta vale `solo_esta`. */
export const ALCANCES = ['solo_esta', 'desde_aca'] as const;
export type Alcance = (typeof ALCANCES)[number];

/** SEC-09: la observación llega hasta 500 caracteres tras recortar. */
export const LARGO_MAX_OBSERVACION = 500;

/**
 * Fila de `agenda_profesor(p_dia)` (PRF-05, CA-28), en orden de `inicio`. `titular` y `quien_toma` son null en un
 * hueco libre o bloqueado y si la persona ya no está en su lista. `reserva_tipo` y `pasada` son columnas sumadas
 * al final del contrato: la web ofrece el alcance solo en una serie y no usa su reloj (ADR-014).
 */
export const esquemaFilaAgenda = z.object({
  inicio: z.string(),
  fin: z.string(),
  estado: z.enum(ESTADOS_HUECO_PROFESOR),
  clase_id: z.string().nullable(),
  /**
   * contratos.md §3 (`agenda_profesor`, H-371): la solicitud pendiente y no vencida que alcanza esa clase con la regla
   * de `SOLICITUD_EN_CURSO` (contratos.md §1; la más antigua), o la que la creó si la clase es `pendiente`. Con ella
   * la web no ofrece mover ni cancelar (la base daría 409); se responde en la lista.
   */
  solicitud_id: z.string().nullable(),
  quien_toma: z.string().nullable(),
  titular: z.string().nullable(),
  observacion: z.string().nullable(),
  clase_estado: z.enum(ESTADOS_CLASE_AGENDA).nullable(),
  bloqueo_id: z.string().nullable(),
  bloqueo_motivo: z.string().nullable(),
  reserva_tipo: z.enum(TIPOS_CLASE).nullable(),
  pasada: z.boolean(),
});
export type FilaAgendaProfesor = z.infer<typeof esquemaFilaAgenda>;

/** `contadores()` (AVI-01): los del profesor que mira (CA-55). */
export const esquemaContadores = z.object({
  solicitudes_pendientes: z.number().int().nonnegative(),
  cuentas_pendientes: z.number().int().nonnegative(),
});
export type Contadores = z.infer<typeof esquemaContadores>;

/** `crear_clase`: la reserva, las fechas creadas y las salteadas por ocupadas o bloqueadas (RES-05). */
export const esquemaClaseCreada = z.object({
  reserva_id: z.string(),
  fechas: z.array(z.string()),
  salteadas: z.array(z.string()),
});
export type ClaseCreada = z.infer<typeof esquemaClaseCreada>;

/** `mover_clase`: la (primera) clase nueva, sus fechas y las salteadas. */
export const esquemaClaseMovida = z.object({
  clase_id: z.string(),
  fechas: z.array(z.string()),
  salteadas: z.array(z.string()),
});
export type ClaseMovida = z.infer<typeof esquemaClaseMovida>;

export const esquemaClasesCanceladas = z.object({ canceladas: z.number().int().nonnegative() });
export type ClasesCanceladas = z.infer<typeof esquemaClasesCanceladas>;

/** Lo que arma el formulario de crear clase (PRF-01). `inicio` es el `inicio` de una fila libre. */
export interface EntradaCrearClase {
  alumnoId: string;
  personaACargoId?: string | null;
  inicio: string;
  tipo: TipoClase;
  /** Obligatoria en una serie; se ignora en una suelta. */
  frecuencia?: Frecuencia | null;
  observacion?: string | null;
}

/** Campos que puede marcar un 422 `DATOS_INVALIDOS` de estas RPC (`details.campo`). */
export const CAMPOS_PANEL = ['p_inicio', 'p_destino', 'p_tipo', 'p_frecuencia', 'p_observacion', 'p_alcance', 'p_dia'] as const;
export type CampoPanel = (typeof CAMPOS_PANEL)[number];

export const MENSAJES_PANEL = {
  creada: 'Listo: la clase quedó confirmada. Si la persona tiene mail, le avisamos.',
  serieCreada: 'Listo: la serie quedó confirmada. Si la persona tiene mail, le avisamos.',
  movida: 'Listo: la clase cambió de horario. Si la persona tiene mail, le avisamos.',
  cancelada: 'Listo: la clase quedó cancelada y el horario libre. Si la persona tiene mail, le avisamos.',
  /** RES-05: las fechas de una serie que no se pudieron reservar. */
  salteadas: 'Estas fechas no se reservaron porque estaban ocupadas o bloqueadas:',
  /** PRF-08: inactivo no crea ni mueve (409 `PROFESOR_INACTIVO`), pero sí cancela. */
  profesorInactivo:
    'Tu agenda está inactiva: no podés crear ni mover clases hasta que el Administrador la reactive. Sí podés cancelarlas.',
  /** 403 de `crear_clase`: la persona no tiene inscripción aprobada o sin cuenta con él (PRF-01, CA-52). */
  alumnoNoValido: 'Esa persona no está en tu lista como alumna aprobada o sin cuenta.',
  /** 404 de `crear_clase` por `p_persona_a_cargo_id`. */
  personaACargoNoValida: 'Esa persona a cargo no es de este alumno.',
  /** 404 de mover o cancelar: la clase no existe o no es suya. */
  claseNoEncontrada: 'No encontramos esa clase en tu agenda. Actualizá la página.',
  /** 409 `SOLICITUD_EN_CURSO` de mover y cancelar (PRF-02, PRF-03, WEB-06): única fuente del texto; la vista lo usa tal cual. */
  solicitudEnCurso: 'La clase tiene un pedido del alumno sin responder: respondelo primero en la lista.',
  horarioInvalido: 'Elegí un horario que todavía no pasó, dentro del próximo año.',
  diaInvalido: 'Elegí un día dentro del último año o del próximo.',
  tipoInvalido: 'Elegí si es una clase suelta o una serie.',
  frecuenciaRequerida: 'Elegí si la serie es semanal o quincenal.',
  alcanceInvalido: 'Elegí si el cambio es solo para esta clase o de acá en adelante.',
  observacionLarga: `La observación puede tener hasta ${LARGO_MAX_OBSERVACION} caracteres.`,
  alumnoRequerido: 'Elegí el alumno.',
  alcance: {
    solo_esta: 'Solo esta clase',
    desde_aca: 'De acá en adelante',
  } satisfies Record<Alcance, string>,
  frecuencia: {
    1: 'Semanal',
    2: 'Quincenal',
  } satisfies Record<Frecuencia, string>,
  estadoClase: {
    pendiente: 'Pendiente de respuesta',
    confirmada: 'Confirmada',
  } satisfies Record<EstadoClaseAgenda, string>,
} as const;

/** SEC-09: el motivo de un bloqueo llega hasta 500 caracteres tras recortar; es opcional (AGE-05). */
export const LARGO_MAX_MOTIVO_BLOQUEO = 500;
/** SEC-09, H-015: un bloqueo abarca hasta 366 días (en el huso del profesor). */
export const MAX_DIAS_BLOQUEO = 366;

/** Lo que manda la vista a `bloquear`: período `[desde, hasta)` en instantes ISO con desplazamiento. */
export interface EntradaBloqueo {
  desde: string;
  hasta: string;
  motivo?: string | null;
}

/** `bloquear`: el bloqueo creado. */
export const esquemaBloqueoCreado = z.object({ bloqueo_id: z.string() });
export type BloqueoCreado = z.infer<typeof esquemaBloqueoCreado>;

/**
 * Detalle de 409 `BLOQUEO_CON_RESERVAS` (AGE-05, CA-14): cada clase pendiente o confirmada que el bloqueo cubre,
 * por `inicio`. `alumno` es quien toma la clase; null si la persona ya no está en su lista.
 */
export const esquemaConflictoBloqueo = z.object({
  clase_id: z.string(),
  inicio: z.string(),
  estado: z.enum(ESTADOS_CLASE_AGENDA),
  alumno: z.string().nullable(),
});
export type ConflictoBloqueo = z.infer<typeof esquemaConflictoBloqueo>;

/** Campos que puede marcar un 422 `DATOS_INVALIDOS` de `bloquear`. */
export const CAMPOS_BLOQUEO = ['p_desde', 'p_hasta', 'p_motivo'] as const;
export type CampoBloqueo = (typeof CAMPOS_BLOQUEO)[number];

export const MENSAJES_BLOQUEO = {
  bloqueado: 'Listo: el horario quedó bloqueado. Nadie puede pedirlo hasta que quites el bloqueo.',
  desbloqueado: 'Listo: quitaste el bloqueo y esos horarios vuelven a estar libres.',
  /** 409 `BLOQUEO_CON_RESERVAS`: la vista lista debajo cada clase con `textoConflicto`. */
  conReservas:
    'No se puede bloquear: en ese horario hay clases confirmadas o pedidos sin responder. Cancelalas o respondé los pedidos primero:',
  /** Sin inicio, o 422 `{"campo":"p_desde"}` de la base: antes de las 00:00 de hoy − 366 días (H-394). */
  desdeInvalido: 'Elegí desde cuándo bloquear: el inicio no puede ser de hace más de un año.',
  hastaAntesDeDesde: 'El fin del bloqueo tiene que ser posterior al inicio.',
  rangoLargo: `Un bloqueo puede abarcar hasta ${MAX_DIAS_BLOQUEO} días.`,
  /** 422 `{"campo":"p_hasta"}` de la base: fin no posterior, rango largo o más allá de hoy + 366 días (H-015). */
  hastaInvalido: `Revisá el fin del bloqueo: tiene que ser posterior al inicio, abarcar hasta ${MAX_DIAS_BLOQUEO} días y no pasar de un año desde hoy.`,
  motivoLargo: `El motivo puede tener hasta ${LARGO_MAX_MOTIVO_BLOQUEO} caracteres.`,
  /** 404 de `desbloquear`: no existe o no es suyo (CA-52). */
  bloqueoNoEncontrado: 'Ese bloqueo ya no está en tu agenda. Actualizá la página.',
  /** Conflicto con una persona que ya no está en su lista. */
  alumnoDadoDeBaja: 'Alumno dado de baja',
} as const;
