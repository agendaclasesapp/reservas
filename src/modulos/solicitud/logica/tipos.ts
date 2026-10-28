// Tipos y esquemas de la solicitud de reserva, escritos a mano contra contratos.md §2 y §3 (B06, T06.1).
// IDs: SOL-01, SOL-08, RES-02..05, SEC-09. Los instantes son ISO-8601 (la base los devuelve en UTC).
import { z } from 'zod';
import type { CodigoTraducido } from '../../../lib/errores';
import type { EstadoInscripcion } from '../../../estado/tipos';

/** RES-02: clase suelta o serie semanal (1) o quincenal (2). */
export type TipoReserva = 'suelta' | 'serie';
export const TIPOS_RESERVA: readonly TipoReserva[] = ['suelta', 'serie'];
export type Frecuencia = 1 | 2;
export const FRECUENCIAS: readonly Frecuencia[] = [1, 2];

/** SEC-09: la observación (RES-04) tiene hasta 500 caracteres en la base (CHECK de `reserva.observacion`). */
export const LARGO_MAX_OBSERVACION = 500;

export const MENSAJES_SOLICITUD = {
  observacionLarga: `La observación puede tener hasta ${LARGO_MAX_OBSERVACION} caracteres.`,
  frecuenciaFaltante: 'Elegí si la serie es semanal o quincenal.',
  tipoInvalido: 'Elegí si es una clase suelta o una serie.',
  inicioInvalido: 'Elegí un horario de la agenda.',
} as const;

/** Lo que completa el formulario de solicitud (WEB-04). `personaACargoId` null = la toma el titular (RES-03). */
export interface SolicitudEntrada {
  profesorId: string;
  /** Inicio del hueco elegido, tal como lo devolvió `agenda_publica`. */
  inicio: string;
  tipo: TipoReserva;
  /** Obligatoria con `serie`; se ignora con `suelta`. */
  frecuencia: Frecuencia | null;
  personaACargoId: string | null;
  observacion: string;
}

/** Campos del formulario que la base puede marcar con 422 `{"campo":"p_<campo>"}`. */
export const CAMPOS_SOLICITUD = ['tipo', 'frecuencia', 'observacion', 'inicio'] as const;
export type CampoSolicitud = (typeof CAMPOS_SOLICITUD)[number];

/** Esquema de la entrada (SEC-09): la misma regla que la base, para avisar antes de llamar. */
export const esquemaSolicitud = z
  .object({
    profesorId: z.string().min(1),
    inicio: z
      .string()
      .refine((v) => v !== '' && !Number.isNaN(Date.parse(v)), { message: MENSAJES_SOLICITUD.inicioInvalido }),
    tipo: z.enum(['suelta', 'serie'], { message: MENSAJES_SOLICITUD.tipoInvalido }),
    frecuencia: z.union([z.literal(1), z.literal(2)]).nullable(),
    personaACargoId: z.string().min(1).nullable(),
    observacion: z
      .string()
      .transform((v) => v.trim())
      .refine((v) => v.length <= LARGO_MAX_OBSERVACION, { message: MENSAJES_SOLICITUD.observacionLarga }),
  })
  .superRefine((v, ctx) => {
    if (v.tipo === 'serie' && v.frecuencia === null) {
      ctx.addIssue({ code: 'custom', path: ['frecuencia'], message: MENSAJES_SOLICITUD.frecuenciaFaltante });
    }
  });

/** Una fecha de `previsualizar_serie` (RES-05): `salteada` con su motivo, o `reservable`. */
export type EstadoFechaSerie = 'reservable' | 'salteada';
export type MotivoSalteada = 'ocupado' | 'bloqueado';
export interface FechaSerie {
  inicio: string;
  estado: EstadoFechaSerie;
  motivo: MotivoSalteada | null;
}

export const esquemaFechaSerie = z.object({
  inicio: z.string().min(1),
  estado: z.enum(['reservable', 'salteada']),
  motivo: z.enum(['ocupado', 'bloqueado']).nullable(),
});

/** Salida de `solicitar_reserva`: la solicitud, la reserva, las fechas ocupadas y las salteadas (RES-05). */
export interface SolicitudCreada {
  solicitudId: string;
  reservaId: string;
  fechas: string[];
  salteadas: string[];
}

export const esquemaRespuestaSolicitud = z.object({
  solicitud_id: z.string().min(1),
  reserva_id: z.string().min(1),
  fechas: z.array(z.string()),
  salteadas: z.array(z.string()),
});

/** Fallo traducido (SEC-17): de `details` solo se leen `campo` y, con CUENTA_NO_APROBADA, el estado del vínculo. */
export interface FalloSolicitud {
  ok: false;
  codigo: CodigoTraducido;
  mensaje: string;
  campo: CampoSolicitud | null;
  /** CUENTA_NO_APROBADA (CA-03): el estado del vínculo con ese profesor; null sin vínculo. */
  estadoVinculo?: EstadoInscripcion | null;
}

export type ResultadoSolicitud = ({ ok: true } & SolicitudCreada) | FalloSolicitud;
export type ResultadoPrevisualizacion = { ok: true; fechas: FechaSerie[] } | FalloSolicitud;

/** Tipos de solicitud (SOL-01..03) y su estado (componentes.md §3). */
export type TipoSolicitud = 'reserva' | 'movimiento' | 'cancelacion';
export type AlcanceSolicitud = 'solo_esta' | 'desde_aca';
export type EstadoSolicitud = 'pendiente' | 'confirmada' | 'rechazada' | 'anulada';

/** Fila de `v_mis_solicitudes` (contratos.md §2): `vencida` = pendiente cuyo horario pasó (SOL-08). */
export interface MiSolicitud {
  id: string;
  profesor_id: string;
  tipo: TipoSolicitud;
  alcance: AlcanceSolicitud | null;
  estado: EstadoSolicitud;
  vencida: boolean;
  fecha_clase: string;
  reserva_id: string | null;
  clase_id: string | null;
  /** Texto del profesor: la vista lo muestra escapado (SEC-16). */
  motivo: string | null;
  creada_en: string;
  respondida_en: string | null;
}

export const COLUMNAS_MIS_SOLICITUDES =
  'id, profesor_id, tipo, alcance, estado, vencida, fecha_clase, reserva_id, clase_id, motivo, creada_en, respondida_en';

export const esquemaMiSolicitud = z.object({
  id: z.string(),
  profesor_id: z.string(),
  tipo: z.enum(['reserva', 'movimiento', 'cancelacion']),
  alcance: z.enum(['solo_esta', 'desde_aca']).nullable(),
  estado: z.enum(['pendiente', 'confirmada', 'rechazada', 'anulada']),
  vencida: z.boolean(),
  fecha_clase: z.string(),
  reserva_id: z.string().nullable(),
  clase_id: z.string().nullable(),
  motivo: z.string().nullable(),
  creada_en: z.string(),
  respondida_en: z.string().nullable(),
});
