// Errores de RPC → texto para la persona (contratos.md §1, ADR-002).
// SEC-17: nunca se muestran `details` crudos ni mensajes de Postgres fuera del catálogo; de `details`
// solo se leen campos conocidos y no personales (tope, límite, horas mínimas), validados por tipo.

export const CODIGOS_ERROR = [
  'NO_AUTENTICADO',
  'PROHIBIDO',
  'FICHA_INCOMPLETA',
  'CUENTA_NO_APROBADA',
  'NO_ENCONTRADO',
  'HUECO_NO_LIBRE',
  'SOLICITUD_EN_CURSO',
  'SOLICITUD_YA_RESPONDIDA',
  'SOLICITUD_VENCIDA',
  'CLASE_NO_MODIFICABLE',
  'BLOQUEO_CON_RESERVAS',
  'MAIL_YA_REGISTRADO',
  'FUERA_DE_GRILLA',
  'ANTICIPACION_INSUFICIENTE',
  'DATOS_INVALIDOS',
  'LIMITE_EXCEDIDO',
] as const;

export type CodigoError = (typeof CODIGOS_ERROR)[number];
export type CodigoTraducido = CodigoError | 'SIN_CONEXION' | 'DESCONOCIDO';

export interface ErrorTraducido {
  codigo: CodigoTraducido;
  mensaje: string;
}

/** Tope de SOL-10; se usa si `details.limite` no llega o no es válido. */
export const LIMITE_PENDIENTES_SOL10 = 5;

export const MENSAJE_GENERICO = 'No pudimos completar la operación. Probá de nuevo en unos minutos.';
export const MENSAJE_SIN_CONEXION = 'No hay conexión con el servidor. Revisá tu conexión y probá de nuevo.';
export const MENSAJE_FICHAS_ALU13 =
  'En este momento no podemos registrar tu ficha. Intentá de nuevo más tarde.';
export const MENSAJE_LIMITE_OTRO = 'Llegaste a un límite de uso. Intentá de nuevo más tarde.';
const MENSAJE_ANTICIPACION_SIN_HORAS = 'Ese horario ya no se puede pedir: no llega a la anticipación mínima.';

export const MENSAJES: Readonly<Record<CodigoError, string>> = {
  NO_AUTENTICADO: 'Tenés que ingresar para hacer esto.',
  PROHIBIDO: 'No tenés permiso para hacer esto.',
  FICHA_INCOMPLETA: 'Completá tu ficha para continuar.',
  CUENTA_NO_APROBADA: 'Tu cuenta no está aprobada, así que todavía no podés hacer solicitudes.',
  NO_ENCONTRADO: 'No encontramos lo que buscás. Puede que ya no exista.',
  HUECO_NO_LIBRE: 'Ese horario ya no está libre. Elegí otro.',
  SOLICITUD_EN_CURSO: 'Ya hay una solicitud pendiente sobre esa clase.',
  SOLICITUD_YA_RESPONDIDA: 'Esa solicitud ya fue respondida.',
  SOLICITUD_VENCIDA: 'Esa solicitud venció: su horario ya pasó.',
  CLASE_NO_MODIFICABLE: 'Esa clase ya no se puede mover ni cancelar.',
  BLOQUEO_CON_RESERVAS: 'No se puede bloquear: hay clases pendientes o confirmadas en ese horario.',
  MAIL_YA_REGISTRADO: 'Ya hay un alumno con ese mail.',
  FUERA_DE_GRILLA: 'Ese horario no está en la grilla de clases.',
  ANTICIPACION_INSUFICIENTE: MENSAJE_ANTICIPACION_SIN_HORAS,
  DATOS_INVALIDOS: 'Revisá los datos ingresados.',
  LIMITE_EXCEDIDO: MENSAJE_LIMITE_OTRO,
};

/** SOL-10: el mensaje dice el límite. */
export function mensajePendientesSol10(limite: number): string {
  return `Ya tenés ${limite} solicitudes pendientes, que es el máximo. Cuando el profesor responda alguna vas a poder pedir otra.`;
}

function mensajeAnticipacion(horas: number): string {
  return `Ese horario ya no se puede pedir: hace falta pedirlo con ${horas} horas de anticipación.`;
}

const CODIGOS = new Set<string>(CODIGOS_ERROR);
const EXCLUSION_VIOLADA = '23P01';
const FALLAS_DE_RED = /failed to fetch|networkerror|load failed|network request failed/i;

function esCodigo(valor: unknown): valor is CodigoError {
  return typeof valor === 'string' && CODIGOS.has(valor);
}

function campo(objeto: unknown, nombre: string): unknown {
  return typeof objeto === 'object' && objeto !== null ? (objeto as Record<string, unknown>)[nombre] : undefined;
}

/** `details` de PostgREST llega como texto JSON; también se acepta ya parseado. Nunca se devuelve. */
function leerDetalles(details: unknown): unknown {
  if (typeof details !== 'string') return details;
  try {
    return JSON.parse(details) as unknown;
  } catch {
    return undefined;
  }
}

function enteroPositivo(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isInteger(valor) && valor > 0 ? valor : null;
}

function mensajeLimite(detalles: unknown): string {
  const tope = campo(detalles, 'tope');
  if (tope === 'pendientes') {
    return mensajePendientesSol10(enteroPositivo(campo(detalles, 'limite')) ?? LIMITE_PENDIENTES_SOL10);
  }
  if (tope === 'fichas') return MENSAJE_FICHAS_ALU13;
  return MENSAJE_LIMITE_OTRO;
}

function mensajeDe(codigo: CodigoError, detalles: unknown): string {
  if (codigo === 'LIMITE_EXCEDIDO') return mensajeLimite(detalles);
  if (codigo === 'ANTICIPACION_INSUFICIENTE') {
    const horas = enteroPositivo(campo(detalles, 'horas_minimas'));
    return horas === null ? MENSAJE_ANTICIPACION_SIN_HORAS : mensajeAnticipacion(horas);
  }
  return MENSAJES[codigo];
}

/**
 * Traduce un error de supabase-js / postgrest-js (`{ code, message, details }`) o de red.
 * Lo que no está en el catálogo da el mensaje genérico (SEC-17).
 */
export function traducirError(error: unknown): ErrorTraducido {
  const message = campo(error, 'message');
  if (esCodigo(message)) {
    return { codigo: message, mensaje: mensajeDe(message, leerDetalles(campo(error, 'details'))) };
  }
  if (campo(error, 'code') === EXCLUSION_VIOLADA) {
    return { codigo: 'HUECO_NO_LIBRE', mensaje: MENSAJES.HUECO_NO_LIBRE };
  }
  if (typeof message === 'string' && FALLAS_DE_RED.test(message)) {
    return { codigo: 'SIN_CONEXION', mensaje: MENSAJE_SIN_CONEXION };
  }
  return { codigo: 'DESCONOCIDO', mensaje: MENSAJE_GENERICO };
}

/** Atajo: solo el texto para mostrar. */
export function mensajeDeError(error: unknown): string {
  return traducirError(error).mensaje;
}
