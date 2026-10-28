// Mover o avisar que no voy a una clase confirmada (B08): `solicitar_movimiento(p_clase_id, p_destino, p_alcance)` y
// `solicitar_cancelacion(p_clase_id, p_alcance)` (contratos.md §3). SOL-02, SOL-03, SOL-07, SOL-10, RES-07, AGE-11,
// CA-13, CA-41, CA-63. Tipos a mano contra supabase/migrations/202611000801_*. Errores con src/lib/errores.ts (SEC-17).
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { traducirError, type CodigoTraducido } from "../../../lib/errores";
import {
  ALCANCES,
  ZONA_POR_DEFECTO,
  type Alcance,
  type ClaseMia,
} from "./tipos";

export interface DependenciasCambios {
  obtenerCliente: () => Promise<SupabaseClient>;
}

export const MENSAJES_CAMBIOS = {
  alcance: {
    solo_esta: "Solo esta clase",
    desde_aca: "De acá en adelante",
  } satisfies Record<Alcance, string>,
  /** SEC-09: alcance que la clase no admite («de acá en adelante» en una clase suelta). */
  alcanceInvalido: "Elegí si es solo esta clase o de acá en adelante.",
  /** Destino sin elegir. */
  sinDestino: "Elegí el horario nuevo.",
  /** AGE-11, CA-63: profesor inactivo; lo ya confirmado sigue en pie. */
  profesorInactivo:
    "Este profesor no toma reservas por ahora: no podés mover ni cancelar clases con él. Tus clases confirmadas siguen en pie.",
  movimientoPedido:
    "Pediste cambiar la clase de horario. Sigue en su horario actual hasta que el profesor responda.",
  cancelacionPedida:
    "Avisaste que no podés ir. La clase sigue confirmada hasta que el profesor responda.",
  /** CA-13, H-363: `details.inicio` es el de la clase; ya no se puede mover ni cancelar. */
  anticipacionClase: (horas: number) =>
    `Esta clase ya no se puede cambiar: hace falta pedirlo con ${horas} horas de anticipación.`,
  /** CA-13, H-363: `details.inicio` es el horario nuevo elegido. */
  anticipacionDestino: (horas: number) =>
    `El horario nuevo ya no se puede pedir: hace falta pedirlo con ${horas} horas de anticipación.`,
} as const;

export type ResultadoMovimiento =
  | { ok: true; solicitudId: string; fechas: string[]; salteadas: string[] }
  | FalloCambio;
export type ResultadoCancelacion =
  { ok: true; solicitudId: string } | FalloCambio;
export interface FalloCambio {
  ok: false;
  codigo: CodigoTraducido;
  /** Texto ya traducido (SEC-17); con `LIMITE_EXCEDIDO` dice el límite (SOL-10). */
  mensaje: string;
  /** Campo a marcar en el formulario, si el error es de uno. */
  campo: "alcance" | "destino" | null;
}

const esquemaMovimiento = z.object({
  solicitud_id: z.string(),
  fechas: z.array(z.string()),
  salteadas: z.array(z.string()),
});
const esquemaCancelacion = z.object({ solicitud_id: z.string() });

/** SOL-02, SOL-03: «de acá en adelante» solo en una clase de una serie. */
export function alcancesDeClase(
  clase: Pick<ClaseMia, "reserva_tipo">,
): readonly Alcance[] {
  return clase.reserva_tipo === "serie" ? ALCANCES : ["solo_esta"];
}

/**
 * Se puede pedir mover o cancelar: confirmada, sin empezar (según la base, `pasada`) y sin otra solicitud
 * pendiente no vencida sobre ella. La base decide igual (409 `CLASE_NO_MODIFICABLE`, `SOLICITUD_EN_CURSO`) y mide
 * la anticipación (422, CA-13), que la web no calcula con su reloj (ADR-014).
 */
export function puedePedirCambio(clase: ClaseMia): boolean {
  const s = clase.solicitud_pendiente;
  return (
    clase.estado === "confirmada" && !clase.pasada && (s === null || s.vencida)
  );
}

/**
 * RES-07: el destino se elige en la agenda del profesor DE ESA CLASE (`agenda_publica(p_slug, p_dia)` con este slug)
 * y se muestra en su huso (ADR-004). Sin slug no hay agenda que mostrar.
 */
export function agendaDelProfesorDeClase(
  clase: Pick<ClaseMia, "profesor_id" | "profesor_slug" | "zona_horaria">,
): { profesorId: string; slug: string; zona: string } | null {
  if (!clase.profesor_slug) return null;
  return {
    profesorId: clase.profesor_id,
    slug: clase.profesor_slug,
    zona: clase.zona_horaria ?? ZONA_POR_DEFECTO,
  };
}

function detallesDelError(error: unknown): Record<string, unknown> | null {
  const details =
    typeof error === "object" && error !== null
      ? (error as { details?: unknown }).details
      : null;
  if (typeof details !== "string") return null;
  try {
    const d: unknown = JSON.parse(details);
    return typeof d === "object" && d !== null
      ? (d as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function campoDelError(error: unknown): string | null {
  const campo = detallesDelError(error)?.campo;
  return typeof campo === "string" ? campo : null;
}

/**
 * H-363, contratos.md §3: en un movimiento la base mide la anticipación del origen y del destino, y
 * `details.inicio` dice cuál falló. Sin la clase, o sin horas o inicio legibles, queda el mensaje del catálogo.
 */
function mensajeAnticipacion(
  error: unknown,
  inicioClase: string | undefined,
): string | null {
  const d = detallesDelError(error);
  const horas = d?.horas_minimas;
  const inicio =
    typeof d?.inicio === "string" ? Date.parse(d.inicio) : Number.NaN;
  if (
    inicioClase === undefined ||
    typeof horas !== "number" ||
    !Number.isInteger(horas) ||
    horas <= 0
  )
    return null;
  if (Number.isNaN(inicio)) return null;
  return inicio === Date.parse(inicioClase)
    ? MENSAJES_CAMBIOS.anticipacionClase(horas)
    : MENSAJES_CAMBIOS.anticipacionDestino(horas);
}

/**
 * Traduce el error de las dos RPC: `PROFESOR_INACTIVO` con el texto de AGE-11, `LIMITE_EXCEDIDO` con el límite
 * (SOL-10, CA-41), `DATOS_INVALIDOS` de `p_alcance` o `p_destino` en su campo, y el resto con el catálogo
 * (`FUERA_DE_GRILLA`, `ANTICIPACION_INSUFICIENTE` con las horas, `HUECO_NO_LIBRE`, `SOLICITUD_EN_CURSO`,
 * `CLASE_NO_MODIFICABLE`…). Con `inicioClase`, `ANTICIPACION_INSUFICIENTE` dice si falla la clase o el horario
 * nuevo (H-363). Nunca `details` crudos (SEC-17).
 */
export function falloCambio(error: unknown, inicioClase?: string): FalloCambio {
  const { codigo, mensaje } = traducirError(error);
  if (codigo === "ANTICIPACION_INSUFICIENTE") {
    return {
      ok: false,
      codigo,
      mensaje: mensajeAnticipacion(error, inicioClase) ?? mensaje,
      campo: null,
    };
  }
  if (codigo === "PROFESOR_INACTIVO") {
    return {
      ok: false,
      codigo,
      mensaje: MENSAJES_CAMBIOS.profesorInactivo,
      campo: null,
    };
  }
  if (codigo === "DATOS_INVALIDOS") {
    const c = campoDelError(error);
    if (c === "p_alcance")
      return {
        ok: false,
        codigo,
        mensaje: MENSAJES_CAMBIOS.alcanceInvalido,
        campo: "alcance",
      };
    if (c === "p_destino")
      return {
        ok: false,
        codigo,
        mensaje: MENSAJES_CAMBIOS.sinDestino,
        campo: "destino",
      };
  }
  if (codigo === "FUERA_DE_GRILLA" || codigo === "HUECO_NO_LIBRE") {
    return { ok: false, codigo, mensaje, campo: "destino" };
  }
  return { ok: false, codigo, mensaje, campo: null };
}

function validarAlcance(
  clase: Pick<ClaseMia, "reserva_tipo">,
  alcance: string,
): FalloCambio | null {
  return (alcancesDeClase(clase) as readonly string[]).includes(alcance)
    ? null
    : {
        ok: false,
        codigo: "DATOS_INVALIDOS",
        mensaje: MENSAJES_CAMBIOS.alcanceInvalido,
        campo: "alcance",
      };
}

/**
 * SOL-02, SOL-07: pide mover la clase a `destino` (instante ISO del inicio del hueco elegido en la agenda de su
 * profesor), solo esta o de acá en adelante. Devuelve las fechas creadas (pendientes, ocupan los huecos) y las
 * salteadas por ocupadas o bloqueadas (RES-05). La clase sigue en su horario hasta la respuesta.
 */
export async function solicitarMovimiento(
  clase: Pick<ClaseMia, "id" | "reserva_tipo"> &
    Partial<Pick<ClaseMia, "inicio">>,
  destino: string | null | undefined,
  alcance: Alcance,
  deps: DependenciasCambios,
): Promise<ResultadoMovimiento> {
  const invalido = validarAlcance(clase, alcance);
  if (invalido) return invalido;
  if (!destino)
    return {
      ok: false,
      codigo: "DATOS_INVALIDOS",
      mensaje: MENSAJES_CAMBIOS.sinDestino,
      campo: "destino",
    };
  try {
    const cliente = await deps.obtenerCliente();
    const { data, error } = await cliente.rpc("solicitar_movimiento", {
      p_clase_id: clase.id,
      p_destino: destino,
      p_alcance: alcance,
    });
    if (error) return falloCambio(error, clase.inicio);
    const r = esquemaMovimiento.parse(data);
    return {
      ok: true,
      solicitudId: r.solicitud_id,
      fechas: r.fechas,
      salteadas: r.salteadas,
    };
  } catch (e) {
    return falloCambio(e);
  }
}

/** SOL-03: avisa que no va (solicitud de cancelación), solo esta o de acá en adelante. */
export async function solicitarCancelacion(
  clase: Pick<ClaseMia, "id" | "reserva_tipo"> &
    Partial<Pick<ClaseMia, "inicio">>,
  alcance: Alcance,
  deps: DependenciasCambios,
): Promise<ResultadoCancelacion> {
  const invalido = validarAlcance(clase, alcance);
  if (invalido) return invalido;
  try {
    const cliente = await deps.obtenerCliente();
    const { data, error } = await cliente.rpc("solicitar_cancelacion", {
      p_clase_id: clase.id,
      p_alcance: alcance,
    });
    if (error) return falloCambio(error, clase.inicio);
    return {
      ok: true,
      solicitudId: esquemaCancelacion.parse(data).solicitud_id,
    };
  } catch (e) {
    return falloCambio(e);
  }
}
