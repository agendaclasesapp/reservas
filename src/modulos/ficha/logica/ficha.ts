// Ficha obligatoria del primer ingreso (ALU-02, ALU-13, WEB-03; contratos.md §3 `completar_ficha`) y
// personas a cargo (ALU-06, SEC-29, `guardar_persona_a_cargo`). Los errores se traducen con
// src/lib/errores.ts (SEC-17); de `details` solo se lee `campo`.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { traducirError, type CodigoTraducido } from '../../../lib/errores';
import {
  CAMPOS_FICHA,
  esquemaMiFicha,
  esquemaPersonaACargo,
  type CampoFicha,
  type FichaEntrada,
  type MiFicha,
  type PersonaACargo,
  type PersonaEntrada,
} from './tipos';

/** Ficha ya completada (doble envío o dos pestañas). Código propio de B04; ver handoff (pregunta). */
export const FICHA_YA_COMPLETA = 'FICHA_YA_COMPLETA';

export interface DependenciasFicha {
  obtenerCliente: () => Promise<SupabaseClient>;
  /** Tras completar la ficha: refresca la sesión para que la guarda suelte `/ficha`. */
  alCompletar: () => Promise<unknown>;
}

export type FalloFicha = { ok: false; codigo: CodigoTraducido; mensaje: string; campo: CampoFicha | null };
export type ResultadoFicha = { ok: true } | FalloFicha;
export type ResultadoPersona = { ok: true; id: string } | FalloFicha;

function campoDe(error: unknown): CampoFicha | null {
  if (typeof error !== 'object' || error === null) return null;
  const details = (error as { details?: unknown }).details;
  let detalles: unknown = details;
  if (typeof details === 'string') {
    try {
      detalles = JSON.parse(details) as unknown;
    } catch {
      return null;
    }
  }
  const campo = typeof detalles === 'object' && detalles !== null ? (detalles as { campo?: unknown }).campo : null;
  if (typeof campo !== 'string') return null;
  const sinPrefijo = campo.replace(/^p_/, '');
  return (CAMPOS_FICHA as readonly string[]).includes(sinPrefijo) ? (sinPrefijo as CampoFicha) : null;
}

function fallo(error: unknown): FalloFicha {
  const { codigo, mensaje } = traducirError(error);
  return { ok: false, codigo, mensaje, campo: codigo === 'DATOS_INVALIDOS' ? campoDe(error) : null };
}

function mensajeDe(error: unknown): unknown {
  return typeof error === 'object' && error !== null ? (error as { message?: unknown }).message : undefined;
}

/**
 * Completa la ficha (pasa a `pendiente`). Con el tope de ALU-13 superado vuelve
 * `LIMITE_EXCEDIDO` con el texto de «intentá más tarde» y la cuenta sigue en `ficha_incompleta`.
 */
export async function completarFicha(datos: FichaEntrada, deps: DependenciasFicha): Promise<ResultadoFicha> {
  try {
    const cliente = await deps.obtenerCliente();
    const { error } = await cliente.rpc('completar_ficha', {
      p_nombre: datos.nombre.trim(),
      p_telefono: datos.telefono.trim(),
      p_fecha_nacimiento: datos.fecha_nacimiento.trim(),
      p_como_llego: datos.como_llego.trim(),
    });
    if (error && mensajeDe(error) !== FICHA_YA_COMPLETA) return fallo(error);
  } catch (e) {
    return fallo(e);
  }
  await deps.alCompletar();
  return { ok: true };
}

/** Alta (`id: null`) o edición de una persona a cargo (ALU-06). */
export async function guardarPersonaACargo(
  persona: PersonaEntrada,
  deps: Pick<DependenciasFicha, 'obtenerCliente'>,
): Promise<ResultadoPersona> {
  try {
    const cliente = await deps.obtenerCliente();
    const { data, error } = await cliente.rpc('guardar_persona_a_cargo', {
      p_id: persona.id,
      p_nombre: persona.nombre.trim(),
      p_fecha_nacimiento: persona.fecha_nacimiento.trim(),
    });
    if (error) return fallo(error);
    return { ok: true, id: z.object({ id: z.string() }).parse(data).id };
  } catch (e) {
    return fallo(e);
  }
}

/** Personas a cargo del alumno (RLS: solo las suyas), por nombre. Lanza el error de postgrest-js. */
export async function leerPersonasACargo(
  alumnoId: string,
  deps: Pick<DependenciasFicha, 'obtenerCliente'>,
): Promise<PersonaACargo[]> {
  const cliente = await deps.obtenerCliente();
  const { data, error } = await cliente
    .from('persona_a_cargo')
    .select('id, nombre, fecha_nacimiento')
    .eq('alumno_id', alumnoId)
    .order('nombre');
  if (error) throw error;
  return z.array(esquemaPersonaACargo).parse(data ?? []);
}

/** La ficha propia para mostrarla o prellenar el formulario; null si no hay fila visible. */
export async function leerMiFicha(alumnoId: string, deps: Pick<DependenciasFicha, 'obtenerCliente'>): Promise<MiFicha | null> {
  const cliente = await deps.obtenerCliente();
  const { data, error } = await cliente
    .from('alumno')
    .select('nombre, mail, telefono, fecha_nacimiento, como_llego')
    .eq('id', alumnoId)
    .maybeSingle();
  if (error) throw error;
  return data === null ? null : esquemaMiFicha.parse(data);
}

/** Valores iniciales del formulario: con Google, nombre y mail ya vienen (ALU-02). */
export function valoresInicialesFicha(ficha: MiFicha | null): FichaEntrada {
  return {
    nombre: ficha?.nombre ?? '',
    telefono: ficha?.telefono ?? '',
    fecha_nacimiento: ficha?.fecha_nacimiento ?? '',
    como_llego: ficha?.como_llego ?? '',
  };
}
