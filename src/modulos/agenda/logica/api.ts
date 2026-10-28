// Lectura pública de la agenda de un profesor por el cliente REST liviano (ADR-017, ADR-020):
// `agenda_publica(p_slug, p_dia)` y `config_publica(p_slug)` sin sesión ni supabase-js. Las respuestas se
// validan y se copian solo con las claves del contrato (SEC-07, DEC-34): nada que el servidor agregara por
// error llega a la vista. Un slug con una forma que ningún profesor puede tener no sale a la red (AGE-09).
import type { PostgrestClient } from '@supabase/postgrest-js';
import { normalizarSlug } from '../../../estado/profesor';
import { rest } from '../../../lib/rest';
import { esDia, hoyEn, sumarDias, type Dia } from '../../../lib/fechas';
import {
  ESTADOS_HUECO,
  type ConfigPublica,
  type ConfigPublicaActiva,
  type EstadoHueco,
  type Hueco,
  type LimitesAgenda,
} from './tipos';

/** AGE-09: lo que dice un enlace que no corresponde a ningún profesor (sin listar profesores). */
export const MENSAJE_ENLACE_NO_VALIDO = 'Enlace no válido, pedile el enlace a tu profesor';

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

/** El mismo 404 que da la base para un slug desconocido o inválido (contratos.md §1, AGE-09). */
function noEncontrado() {
  return { code: 'PT404', message: 'NO_ENCONTRADO' };
}

function slugValidoODe404(slug: string): string {
  const valido = normalizarSlug(slug);
  if (valido === null) throw noEncontrado();
  return valido;
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

function textoNoVacio(valor: unknown): valor is string {
  return typeof valor === 'string' && valor !== '';
}

/**
 * Valida la salida de `config_publica(p_slug)` (AGE-02, AGE-08, AGE-09, AGE-11). Activo: id, nombre, huso,
 * duración, anticipación y horizonte; inactivo: solo id, nombre y `activo: false` (DEC-34).
 */
export function leerConfigPublica(datos: unknown): ConfigPublica {
  if (!esObjeto(datos) || !textoNoVacio(datos.profesor_id) || typeof datos.nombre !== 'string') {
    throw new ErrorRespuestaInvalida();
  }
  if (datos.activo === false) return { profesor_id: datos.profesor_id, nombre: datos.nombre, activo: false };
  if (
    datos.activo !== true ||
    !textoNoVacio(datos.zona_horaria) ||
    !enteroNoNegativo(datos.duracion_min) ||
    datos.duracion_min === 0 ||
    !enteroNoNegativo(datos.anticipacion_horas) ||
    !enteroNoNegativo(datos.horizonte_semanas)
  ) {
    throw new ErrorRespuestaInvalida();
  }
  return {
    profesor_id: datos.profesor_id,
    nombre: datos.nombre,
    activo: true,
    zona_horaria: datos.zona_horaria,
    duracion_min: datos.duracion_min,
    anticipacion_horas: datos.anticipacion_horas,
    horizonte_semanas: datos.horizonte_semanas,
  };
}

/**
 * Huecos del día `dia` (`YYYY-MM-DD`, huso del profesor) del profesor del slug. Lanza el error de PostgREST
 * tal cual llega (404 `NO_ENCONTRADO`, 409 `PROFESOR_INACTIVO`, 422 `p_dia`).
 */
export async function obtenerAgendaPublica(
  slug: string,
  dia: Dia,
  cliente: PostgrestClient = rest(),
): Promise<Hueco[]> {
  const pSlug = slugValidoODe404(slug);
  if (!esDia(dia)) throw datosInvalidos('p_dia');
  const { data, error } = await cliente.rpc('agenda_publica', { p_slug: pSlug, p_dia: dia });
  if (error) throw error;
  return leerHuecos(data);
}

/** Configuración pública del profesor del slug (404 `NO_ENCONTRADO` si no es de ninguno). */
export async function obtenerConfigPublica(slug: string, cliente: PostgrestClient = rest()): Promise<ConfigPublica> {
  const pSlug = slugValidoODe404(slug);
  const { data, error } = await cliente.rpc('config_publica', { p_slug: pSlug });
  if (error) throw error;
  return leerConfigPublica(data);
}

/**
 * Días que acepta `agenda_publica` (SEC-09, contratos.md §3): de hoy − 366 días a hoy + horizonte + 31
 * días, en el huso del profesor. La base decide con `app_ahora()`; esto solo acota la navegación.
 */
export function limitesAgenda(config: ConfigPublicaActiva, ahora: Date = new Date()): LimitesAgenda {
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
