// Lectura pública de la agenda por el cliente REST liviano (ADR-017): `agenda_publica` y `config_publica`
// sin sesión ni supabase-js. Las respuestas se validan y se copian solo con las claves del contrato
// (SEC-07): nada que el servidor agregara por error llega a la vista.
import type { PostgrestClient } from '@supabase/postgrest-js';
import { rest } from '../../../lib/rest';
import { esDia, hoyEn, sumarDias, type Dia } from '../../../lib/fechas';
import { ESTADOS_HUECO, type ConfigPublica, type EstadoHueco, type Hueco, type LimitesAgenda } from './tipos';

/** La respuesta no tiene la forma del contrato. `traducirError` la muestra con el mensaje genérico (SEC-17). */
export class ErrorRespuestaInvalida extends Error {
  override name = 'ErrorRespuestaInvalida';
  constructor() {
    super('RESPUESTA_INVALIDA');
  }
}

/** Mismo formato que un error de PostgREST, para que `traducirError` lo traduzca (contratos.md §1). */
function datosInvalidos(campo: string) {
  return { code: 'PT422', message: 'DATOS_INVALIDOS', details: JSON.stringify({ campo }) };
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function esInstante(valor: unknown): valor is string {
  return typeof valor === 'string' && valor !== '' && !Number.isNaN(Date.parse(valor));
}

const ESTADOS = new Set<string>(ESTADOS_HUECO);

function esEstadoHueco(valor: unknown): valor is EstadoHueco {
  return typeof valor === 'string' && ESTADOS.has(valor);
}

/** Valida la salida de `agenda_publica` y devuelve copias con solo `inicio`, `fin` y `estado` (AGE-07, SEC-07). */
export function leerHuecos(datos: unknown): Hueco[] {
  if (!Array.isArray(datos)) throw new ErrorRespuestaInvalida();
  return datos.map((h: unknown) => {
    if (!esObjeto(h) || !esInstante(h.inicio) || !esInstante(h.fin) || !esEstadoHueco(h.estado)) {
      throw new ErrorRespuestaInvalida();
    }
    return { inicio: h.inicio, fin: h.fin, estado: h.estado };
  });
}

function enteroNoNegativo(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 0;
}

/** Valida la salida de `config_publica` (AGE-02, AGE-08). */
export function leerConfigPublica(datos: unknown): ConfigPublica {
  if (
    !esObjeto(datos) ||
    typeof datos.zona_horaria !== 'string' ||
    datos.zona_horaria === '' ||
    !enteroNoNegativo(datos.duracion_min) ||
    datos.duracion_min === 0 ||
    !enteroNoNegativo(datos.anticipacion_horas) ||
    !enteroNoNegativo(datos.horizonte_semanas)
  ) {
    throw new ErrorRespuestaInvalida();
  }
  return {
    zona_horaria: datos.zona_horaria,
    duracion_min: datos.duracion_min,
    anticipacion_horas: datos.anticipacion_horas,
    horizonte_semanas: datos.horizonte_semanas,
  };
}

/** Huecos del día `dia` (`YYYY-MM-DD`, huso del profesor). Lanza el error de PostgREST tal cual llega. */
export async function obtenerAgendaPublica(dia: Dia, cliente: PostgrestClient = rest()): Promise<Hueco[]> {
  if (!esDia(dia)) throw datosInvalidos('p_dia');
  const { data, error } = await cliente.rpc('agenda_publica', { p_dia: dia });
  if (error) throw error;
  return leerHuecos(data);
}

/** Configuración pública del profesor: huso, duración, anticipación y horizonte. */
export async function obtenerConfigPublica(cliente: PostgrestClient = rest()): Promise<ConfigPublica> {
  const { data, error } = await cliente.rpc('config_publica');
  if (error) throw error;
  return leerConfigPublica(data);
}

/**
 * Días que acepta `agenda_publica` (SEC-09, contratos.md §3): de hoy − 366 días a hoy + horizonte + 31
 * días, en el huso del profesor. La base decide con `app_ahora()`; esto solo acota la navegación.
 */
export function limitesAgenda(config: ConfigPublica, ahora: Date = new Date()): LimitesAgenda {
  const zona = config.zona_horaria;
  const hoy = hoyEn(zona, ahora);
  return {
    hoy,
    min: sumarDias(hoy, -366, zona),
    max: sumarDias(hoy, config.horizonte_semanas * 7 + 31, zona),
  };
}

/** true si `dia` está dentro de los límites (los extremos incluidos). */
export function diaEnLimites(dia: Dia, limites: LimitesAgenda): boolean {
  return esDia(dia) && dia >= limites.min && dia <= limites.max;
}
