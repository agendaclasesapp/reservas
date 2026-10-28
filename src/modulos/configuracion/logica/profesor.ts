// Datos del profesor de la sesión para Configuración y las otras pantallas del profesor (WEB-08, PRF-08,
// ADR-020): su enlace propio `…/#/p/<slug>` para copiar y el huso de su agenda.
// El huso sale de `useConfigPublica(slug)` de agenda (la única lectura de `config_publica`, componentes.md §5).
// Con el profesor inactivo `config_publica` no trae el huso (AGE-11), y su panel sigue disponible (PRF-08):
// entonces se lee de su fila de `profesor` (RLS: solo la suya, contratos.md §2).
import type { SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { rutaDeProfesor } from '../../../estado/profesor';
import type { EstadoSesion, ProfesorDeSesion } from '../../../estado/tipos';
import { useSesion } from '../../../estado/useSesion';
import { traducirError } from '../../../lib/errores';
import { cargarSupabase } from '../../../lib/supabase';
import { useConfigPublica, type ObtenerConfig } from '../../agenda/logica';

/** Profesor de la sesión, o `null` si quien mira no es profesor. */
export function profesorDeSesion(sesion: EstadoSesion): ProfesorDeSesion | null {
  return sesion.tipo === 'sesion' ? sesion.sesion.profesor : null;
}

function conBarras(base: string): string {
  const b = base.startsWith('/') ? base : `/${base}`;
  return b.endsWith('/') ? b : `${b}/`;
}

/**
 * WEB-08, AGE-09: enlace público del profesor, `origen + BASE_URL + #/p/<slug>` (DEC-14: base y origen del
 * entorno, no fijos en el código).
 */
export function enlaceDeProfesor(
  slug: string,
  origen: string = window.location.origin,
  base: string = import.meta.env.BASE_URL,
): string {
  return `${origen.replace(/\/+$/, '')}${conBarras(base)}#${rutaDeProfesor(slug)}`;
}

type Portapapeles = Pick<Clipboard, 'writeText'>;

function portapapelesDelNavegador(): Portapapeles | undefined {
  try {
    return typeof navigator === 'undefined' ? undefined : navigator.clipboard;
  } catch {
    return undefined;
  }
}

/** Copia el texto; `false` si el navegador no deja (sin permiso o sin contexto seguro): la vista lo muestra. */
export async function copiarTexto(texto: string, portapapeles = portapapelesDelNavegador()): Promise<boolean> {
  if (!portapapeles) return false;
  try {
    await portapapeles.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

export interface EnlacePropio {
  slug: string;
  enlace: string;
  /** false: el enlace muestra que no toma reservas (AGE-11). */
  activo: boolean;
}

/** WEB-08: el enlace propio del profesor de la sesión; `null` si no es profesor (o la sesión carga). */
export function useEnlacePropio(): EnlacePropio | null {
  const profesor = profesorDeSesion(useSesion());
  if (profesor === null) return null;
  return { slug: profesor.slug, enlace: enlaceDeProfesor(profesor.slug), activo: profesor.activo };
}

export type LectorHusoPropio = (profesorId: string) => Promise<string>;

/** Huso de la fila propia de `profesor` (solo el profesor la lee, RLS). Lanza el error de postgrest-js. */
export async function leerHusoPropio(
  profesorId: string,
  obtenerCliente: () => Promise<SupabaseClient> = () => cargarSupabase(),
): Promise<string> {
  const cliente = await obtenerCliente();
  const { data, error } = await cliente.from('profesor').select('zona_horaria').eq('id', profesorId).single();
  if (error) throw error;
  return z.object({ zona_horaria: z.string().min(1) }).parse(data).zona_horaria;
}

export type HusoDelProfesor =
  | { estado: 'cargando' }
  | { estado: 'listo'; zona: string }
  | { estado: 'error'; mensaje: string; recargar: () => void };

interface LecturaPropia {
  profesorId: string;
  version: number;
  zona: string | null;
  mensaje: string | null;
}

/**
 * Huso de la agenda del profesor de la sesión para formatear fechas y calcular «hoy» (ADR-004).
 * `obtenerConfig` y `leerPropio` solo para pruebas (referencias estables).
 */
export function useHusoDelProfesor(
  obtenerConfig?: ObtenerConfig,
  leerPropio: LectorHusoPropio = leerHusoPropio,
): HusoDelProfesor {
  const profesor = profesorDeSesion(useSesion());
  const config = useConfigPublica(profesor?.slug ?? null, obtenerConfig);
  const inactivo = config.estado === 'listo' && config.config?.activo === false;
  const profesorId = profesor?.id ?? null;
  const [version, setVersion] = useState(0);
  const [propia, setPropia] = useState<LecturaPropia | null>(null);

  useEffect(() => {
    if (!inactivo || profesorId === null) return;
    let vigente = true;
    leerPropio(profesorId).then(
      (zona) => {
        if (vigente) setPropia({ profesorId, version, zona, mensaje: null });
      },
      (e: unknown) => {
        if (vigente) setPropia({ profesorId, version, zona: null, mensaje: traducirError(e).mensaje });
      },
    );
    return () => {
      vigente = false;
    };
  }, [inactivo, leerPropio, profesorId, version]);

  const recargarPropia = useCallback(() => setVersion((v) => v + 1), []);

  if (config.estado === 'error') {
    return { estado: 'error', mensaje: config.error?.mensaje ?? '', recargar: config.recargar };
  }
  if (config.estado === 'cargando' || config.config === null) return { estado: 'cargando' };
  if (config.config.activo) return { estado: 'listo', zona: config.config.zona_horaria };
  if (propia === null || propia.profesorId !== profesorId || propia.version !== version) return { estado: 'cargando' };
  return propia.zona !== null
    ? { estado: 'listo', zona: propia.zona }
    : { estado: 'error', mensaje: propia.mensaje ?? '', recargar: recargarPropia };
}
