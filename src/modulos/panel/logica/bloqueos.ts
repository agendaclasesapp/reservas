// Bloqueos desde el panel del profesor (B10 · T10.1): `bloquear(p_desde, p_hasta, p_motivo)` y
// `desbloquear(p_bloqueo_id)` (contratos.md §3). AGE-05, AGE-06, AGE-10, SEC-06, SEC-09, SEC-17. CA-14, CA-52.
// La base decide siempre (ADR-001): conflictos, tope de hoy + 366 días (H-015, con su reloj, ADR-014) y propiedad
// del bloqueo. Lo de acá arma el período en el huso del profesor, evita viajes inútiles y elige el texto.
import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays } from 'date-fns';
import { TZDate } from '@date-fns/tz';
import { z } from 'zod';
import { traducirError, type CodigoTraducido } from '../../../lib/errores';
import { esDia, formatearFecha, formatearHora, sumarDias, type Dia } from '../../../lib/fechas';
import {
  LARGO_MAX_MOTIVO_BLOQUEO,
  MAX_DIAS_BLOQUEO,
  MENSAJES_BLOQUEO,
  MENSAJES_PANEL,
  esquemaBloqueoCreado,
  esquemaConflictoBloqueo,
  type BloqueoCreado,
  type CampoBloqueo,
  type ConflictoBloqueo,
  type EntradaBloqueo,
  type FilaAgendaProfesor,
} from './tipos';

export interface DependenciasBloqueo {
  obtenerCliente: () => Promise<SupabaseClient>;
}

export type OperacionBloqueo = 'bloquear' | 'desbloquear';

export interface FalloBloqueo {
  ok: false;
  codigo: CodigoTraducido;
  /** Texto ya traducido (SEC-17): nunca `details` crudos. */
  mensaje: string;
  /** Campo del 422 que la vista marca; null en los demás errores. */
  campo: CampoBloqueo | null;
  /** Solo con 409 `BLOQUEO_CON_RESERVAS`: las clases que impiden el bloqueo (AGE-05, CA-14); si no, `[]`. */
  conflictos: ConflictoBloqueo[];
}

export type ResultadoBloquear = ({ ok: true } & BloqueoCreado) | FalloBloqueo;
export type ResultadoDesbloquear = { ok: true } | FalloBloqueo;

/**
 * Campo del 422 de la RPC → campo de la entrada. El motivo sale de `privado.validar_motivo` como `motivo`, igual que
 * en `responder_solicitud` (contratos.md §3, H-394), y la vista lo marca en `p_motivo`.
 */
const CAMPO_DE_LA_RPC: Readonly<Record<string, CampoBloqueo>> = {
  p_desde: 'p_desde',
  p_hasta: 'p_hasta',
  motivo: 'p_motivo',
};

function leerDetails(error: unknown): unknown {
  const details = typeof error === 'object' && error !== null ? (error as { details?: unknown }).details : undefined;
  if (typeof details !== 'string') return null;
  try {
    return JSON.parse(details) as unknown;
  } catch {
    return null;
  }
}

function campoDelError(error: unknown): CampoBloqueo | null {
  const details = leerDetails(error);
  const campo = typeof details === 'object' && details !== null ? (details as { campo?: unknown }).campo : undefined;
  return typeof campo === 'string' && Object.hasOwn(CAMPO_DE_LA_RPC, campo) ? CAMPO_DE_LA_RPC[campo] : null;
}

/** AGE-05: las clases del detalle de 409 `BLOQUEO_CON_RESERVAS`; `[]` si el detalle no tiene la forma del contrato. */
export function conflictosDelError(error: unknown): ConflictoBloqueo[] {
  const r = z.array(esquemaConflictoBloqueo).safeParse(leerDetails(error));
  return r.success ? r.data : [];
}

const MENSAJE_CAMPO: Record<CampoBloqueo, string> = {
  p_desde: MENSAJES_BLOQUEO.desdeInvalido,
  p_hasta: MENSAJES_BLOQUEO.hastaInvalido,
  p_motivo: MENSAJES_BLOQUEO.motivoLargo,
};

/**
 * Traduce el error de `bloquear` o `desbloquear` (SEC-17). `BLOQUEO_CON_RESERVAS` trae las clases en conflicto;
 * `NO_ENCONTRADO` al desbloquear es un bloqueo que no existe o no es suyo (la misma respuesta, CA-52); un 422 marca
 * su campo.
 */
export function falloBloqueo(error: unknown, operacion: OperacionBloqueo): FalloBloqueo {
  const { codigo, mensaje } = traducirError(error);
  const sin = { ok: false as const, codigo, campo: null, conflictos: [] };
  if (codigo === 'BLOQUEO_CON_RESERVAS') {
    return { ...sin, mensaje: MENSAJES_BLOQUEO.conReservas, conflictos: conflictosDelError(error) };
  }
  if (codigo === 'DATOS_INVALIDOS') {
    const campo = campoDelError(error);
    if (campo) return { ...sin, mensaje: MENSAJE_CAMPO[campo], campo };
  }
  if (codigo === 'NO_ENCONTRADO' && operacion === 'desbloquear') {
    return { ...sin, mensaje: MENSAJES_BLOQUEO.bloqueoNoEncontrado };
  }
  return { ...sin, mensaje };
}

function falloLocal(campo: CampoBloqueo, mensaje: string): FalloBloqueo {
  return { ok: false, codigo: 'DATOS_INVALIDOS', mensaje, campo, conflictos: [] };
}

/** Motivo recortado; vacío = null (como la base). */
export function normalizarMotivo(texto: string | null | undefined): string | null {
  const recortado = (texto ?? '').trim();
  return recortado === '' ? null : recortado;
}

function instante(valor: string | null | undefined): number {
  return valor ? Date.parse(valor) : Number.NaN;
}

/**
 * Validación previa de `bloquear` con las reglas de la base (SEC-09): inicio válido, fin posterior, rango de hasta
 * 366 días en el huso del profesor y motivo de hasta 500 caracteres. El tope de hoy + 366 días lo decide la base
 * con su reloj (ADR-014, H-015): acá no se usa el del navegador. Devuelve el fallo del primer campo o null.
 */
export function validarBloqueo(entrada: EntradaBloqueo, zona: string): FalloBloqueo | null {
  const desde = instante(entrada.desde);
  const hasta = instante(entrada.hasta);
  if (Number.isNaN(desde)) return falloLocal('p_desde', MENSAJES_BLOQUEO.desdeInvalido);
  if (Number.isNaN(hasta) || hasta <= desde) return falloLocal('p_hasta', MENSAJES_BLOQUEO.hastaAntesDeDesde);
  if (hasta > addDays(new TZDate(desde, zona), MAX_DIAS_BLOQUEO).getTime()) {
    return falloLocal('p_hasta', MENSAJES_BLOQUEO.rangoLargo);
  }
  const motivo = normalizarMotivo(entrada.motivo);
  if (motivo !== null && [...motivo].length > LARGO_MAX_MOTIVO_BLOQUEO) {
    return falloLocal('p_motivo', MENSAJES_BLOQUEO.motivoLargo);
  }
  return null;
}

/** 00:00 del día en el huso del profesor, como instante ISO con desplazamiento. */
function inicioDelDia(dia: Dia, zona: string, hora = 0, minuto = 0): string {
  const [anio, mes, d] = dia.split('-').map(Number) as [number, number, number];
  return new TZDate(anio, mes - 1, d, hora, minuto, zona).toISOString();
}

/**
 * AGE-05, un hueco o un rango de huecos: desde el inicio del primero hasta el fin del último (en cualquier orden).
 * Los instantes salen tal cual de `agenda_profesor`.
 */
export function bloqueoDeHuecos(
  primera: Pick<FilaAgendaProfesor, 'inicio' | 'fin'>,
  ultima: Pick<FilaAgendaProfesor, 'inicio' | 'fin'> = primera,
  motivo: string | null = null,
): EntradaBloqueo {
  const [a, b] = Date.parse(primera.inicio) <= Date.parse(ultima.inicio) ? [primera, ultima] : [ultima, primera];
  return { desde: a.inicio, hasta: b.fin, motivo };
}

/**
 * AGE-05, días completos: de las 00:00 del primer día a las 00:00 del día siguiente al último, en el huso del
 * profesor (contratos.md §3). Lanza `RangeError` con un día mal formado.
 */
export function bloqueoDeDias(primerDia: Dia, ultimoDia: Dia, zona: string, motivo: string | null = null): EntradaBloqueo {
  if (!esDia(primerDia) || !esDia(ultimoDia)) throw new RangeError('Día inválido: se espera YYYY-MM-DD.');
  const [a, b] = primerDia <= ultimoDia ? [primerDia, ultimoDia] : [ultimoDia, primerDia];
  return { desde: inicioDelDia(a, zona), hasta: inicioDelDia(sumarDias(b, 1, zona), zona), motivo };
}

const HORA = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;

function partesHora(hora: string, admite24: boolean): [number, number] | null {
  if (admite24 && hora === '24:00') return [24, 0];
  const m = HORA.exec(hora);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/**
 * AGE-05, un rango de horas de un día: `desde` y `hasta` en `HH:MM` locales del profesor (`hasta` admite 24:00 =
 * 00:00 del día siguiente). Lanza `RangeError` con un día o una hora mal formados; el orden lo valida
 * `validarBloqueo`.
 */
export function bloqueoDeHoras(
  dia: Dia,
  desde: string,
  hasta: string,
  zona: string,
  motivo: string | null = null,
): EntradaBloqueo {
  const d = partesHora(desde, false);
  const h = partesHora(hasta, true);
  if (!esDia(dia) || d === null || h === null) throw new RangeError('Día u hora inválidos: se espera YYYY-MM-DD y HH:MM.');
  const fin = h[0] === 24 ? inicioDelDia(sumarDias(dia, 1, zona), zona) : inicioDelDia(dia, zona, h[0], h[1]);
  return { desde: inicioDelDia(dia, zona, d[0], d[1]), hasta: fin, motivo };
}

/**
 * `bloquear` (AGE-05, AGE-10): bloquea en su propia agenda. Errores: 409 `BLOQUEO_CON_RESERVAS` con las clases en
 * `conflictos` (CA-14); 422 `p_desde` (incluido antes de hoy − 366 días), `p_hasta` (incluido después de las 00:00
 * de hoy + 367 días, H-015, H-394) y `motivo` (que aquí se marca en `p_motivo`).
 */
export async function bloquear(entrada: EntradaBloqueo, zona: string, deps: DependenciasBloqueo): Promise<ResultadoBloquear> {
  const invalido = validarBloqueo(entrada, zona);
  if (invalido) return invalido;
  try {
    const cliente = await deps.obtenerCliente();
    const { data, error } = await cliente.rpc('bloquear', {
      p_desde: entrada.desde,
      p_hasta: entrada.hasta,
      p_motivo: normalizarMotivo(entrada.motivo),
    });
    if (error) return falloBloqueo(error, 'bloquear');
    return { ok: true, ...esquemaBloqueoCreado.parse(data) };
  } catch (e) {
    return falloBloqueo(e, 'bloquear');
  }
}

/**
 * `desbloquear` (AGE-06): quita un bloqueo suyo y esos huecos vuelven a libres. Uno de otro profesor o que ya no
 * existe da 404 (CA-52): `MENSAJES_BLOQUEO.bloqueoNoEncontrado`.
 */
export async function desbloquear(bloqueoId: string, deps: DependenciasBloqueo): Promise<ResultadoDesbloquear> {
  if (!bloqueoId) {
    return { ok: false, codigo: 'NO_ENCONTRADO', mensaje: MENSAJES_BLOQUEO.bloqueoNoEncontrado, campo: null, conflictos: [] };
  }
  try {
    const cliente = await deps.obtenerCliente();
    const { error } = await cliente.rpc('desbloquear', { p_bloqueo_id: bloqueoId });
    if (error) return falloBloqueo(error, 'desbloquear');
    return { ok: true };
  } catch (e) {
    return falloBloqueo(e, 'desbloquear');
  }
}

export interface AccionesBloqueo {
  /** Hueco libre que no pasó (AGE-05). */
  bloquear: boolean;
  /** La fila tiene un bloqueo suyo (AGE-06). */
  desbloquear: boolean;
}

/** Qué ofrece el panel sobre una fila: bloquear un hueco libre y futuro; desbloquear si hay un bloqueo. */
export function accionesBloqueo(fila: Pick<FilaAgendaProfesor, 'estado' | 'pasada' | 'bloqueo_id'>): AccionesBloqueo {
  return {
    bloquear: fila.estado === 'libre' && !fila.pasada,
    desbloquear: fila.bloqueo_id !== null,
  };
}

/**
 * Una clase en conflicto en texto, en el huso del profesor: «miércoles, 4 de noviembre 10:00 · Ana · Confirmada».
 * La vista lo muestra como texto (SEC-16).
 */
export function textoConflicto(conflicto: ConflictoBloqueo, zona: string): string {
  const cuando = `${formatearFecha(conflicto.inicio, zona)} ${formatearHora(conflicto.inicio, zona)}`;
  const quien = conflicto.alumno ?? MENSAJES_BLOQUEO.alumnoDadoDeBaja;
  return `${cuando} · ${quien} · ${MENSAJES_PANEL.estadoClase[conflicto.estado]}`;
}
