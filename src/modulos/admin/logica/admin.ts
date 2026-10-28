// Llamadas del Administrador (contratos.md §3, RPC `[Adm]`): `listar_profesores`, `alta_profesor` y
// `cambiar_estado_profesor`. Los errores se traducen con src/lib/errores.ts (SEC-17); de `details` solo se lee
// `campo`. El rol lo decide la base (403 `PROHIBIDO` a un profesor o a un alumno, SEC-06).
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { traducirError, type CodigoTraducido } from '../../../lib/errores';
import {
  CAMPOS_ADMIN,
  esquemaAltaProfesor,
  esquemaProfesorFila,
  esquemaRespuestaAltaProfesor,
  esquemaRespuestaEstadoProfesor,
  MENSAJES_ADMIN,
  type CampoAdmin,
  type ProfesorEntrada,
  type ProfesorFila,
  type ProfesorLista,
} from './tipos';

export interface DependenciasAdmin {
  obtenerCliente: () => Promise<SupabaseClient>;
}

/** Arma el enlace público de un slug (en la web, `enlaceDeProfesor` de configuracion/logica). */
export type ArmarEnlace = (slug: string) => string;

export type FalloAdmin = {
  ok: false;
  codigo: CodigoTraducido;
  mensaje: string;
  /** Campo que marca la vista: el de un 422 (sin `p_`), `slug` en `SLUG_YA_USADO` y `mail` en `MAIL_YA_REGISTRADO`. */
  campo: CampoAdmin | null;
};
/** `adoptado`: el mail era del profesor con enlace provisional y quedó con el definitivo (spec §8). */
export type ResultadoAltaProfesor = { ok: true; profesorId: string; slug: string; adoptado: boolean } | FalloAdmin;
export type ResultadoEstadoProfesor = { ok: true; profesorId: string; activo: boolean } | FalloAdmin;

function propiedad(objeto: unknown, clave: string): unknown {
  return typeof objeto === 'object' && objeto !== null ? (objeto as Record<string, unknown>)[clave] : undefined;
}

function campoDe(error: unknown): CampoAdmin | null {
  let detalles = propiedad(error, 'details');
  if (typeof detalles === 'string') {
    try {
      detalles = JSON.parse(detalles) as unknown;
    } catch {
      return null;
    }
  }
  const campo = propiedad(detalles, 'campo');
  if (typeof campo !== 'string') return null;
  const sinPrefijo = campo.replace(/^p_/, '');
  return (CAMPOS_ADMIN as readonly string[]).includes(sinPrefijo) ? (sinPrefijo as CampoAdmin) : null;
}

const MENSAJE_CAMPO: Readonly<Record<CampoAdmin, string | null>> = {
  mail: MENSAJES_ADMIN.mailInvalido,
  nombre: MENSAJES_ADMIN.nombreVacio,
  slug: MENSAJES_ADMIN.slugNoValido,
  activo: null,
};

/**
 * Traduce el error de una RPC `[Adm]`. `MAIL_YA_REGISTRADO` no dice de quién es el mail (DEC-31) y
 * `SLUG_YA_USADO` marca el enlace; el resto sale del catálogo (SEC-17).
 */
export function falloAdmin(error: unknown): FalloAdmin {
  const { codigo, mensaje } = traducirError(error);
  if (codigo === 'MAIL_YA_REGISTRADO') {
    return { ok: false, codigo, mensaje: MENSAJES_ADMIN.mailYaRegistrado, campo: 'mail' };
  }
  if (codigo === 'SLUG_YA_USADO') return { ok: false, codigo, mensaje, campo: 'slug' };
  if (codigo === 'DATOS_INVALIDOS') {
    const campo = campoDe(error);
    return { ok: false, codigo, mensaje: (campo && MENSAJE_CAMPO[campo]) ?? mensaje, campo };
  }
  return { ok: false, codigo, mensaje, campo: null };
}

/** Valida el alta como la base (ADM-02, SEC-09); el primer error, con su campo y su texto. */
export function validarAltaProfesor(datos: ProfesorEntrada): FalloAdmin | null {
  const r = esquemaAltaProfesor.safeParse(datos);
  if (r.success) return null;
  const problema = r.error.issues[0];
  const campo = problema?.path[0];
  return {
    ok: false,
    codigo: 'DATOS_INVALIDOS',
    mensaje: problema?.message ?? MENSAJES_ADMIN.slugNoValido,
    campo: (CAMPOS_ADMIN as readonly unknown[]).includes(campo) ? (campo as CampoAdmin) : null,
  };
}

async function llamar<T>(
  deps: DependenciasAdmin,
  rpc: string,
  args: Record<string, unknown>,
  leer: (data: unknown) => T,
): Promise<({ ok: true } & T) | FalloAdmin> {
  try {
    const cliente = await deps.obtenerCliente();
    const { data, error } = await cliente.rpc(rpc, args);
    if (error) return falloAdmin(error);
    return { ok: true, ...leer(data) };
  } catch (e) {
    return falloAdmin(e);
  }
}

/**
 * Alta de un profesor (ADM-02): valida antes de llamar y no llama si algo no cumple. Con el mail del profesor
 * de enlace provisional lo adopta (`adoptado: true`); nace activo con la grilla de AGE-01 y le llega el mail
 * con su enlace (DEC-34).
 */
export function altaProfesor(datos: ProfesorEntrada, deps: DependenciasAdmin): Promise<ResultadoAltaProfesor> {
  const invalido = validarAltaProfesor(datos);
  if (invalido) return Promise.resolve(invalido);
  const args = { p_mail: datos.mail.trim(), p_nombre: datos.nombre.trim(), p_slug: datos.slug.trim() };
  return llamar(deps, 'alta_profesor', args, (data) => {
    const r = esquemaRespuestaAltaProfesor.parse(data);
    return { profesorId: r.profesor_id, slug: r.slug, adoptado: r.adoptado };
  });
}

/** Inactiva (`activo: false`) o reactiva un profesor (ADM-05, DEC-30). Repetirlo no cambia nada. */
export function cambiarEstadoProfesor(
  profesorId: string,
  activo: boolean,
  deps: DependenciasAdmin,
): Promise<ResultadoEstadoProfesor> {
  return llamar(deps, 'cambiar_estado_profesor', { p_profesor_id: profesorId, p_activo: activo }, (data) => {
    const r = esquemaRespuestaEstadoProfesor.parse(data);
    return { profesorId: r.profesor_id, activo: r.activo };
  });
}

/** `listar_profesores()` (ADM-03), con el enlace de cada uno. Lanza el error de supabase-js. */
export async function leerProfesores(deps: DependenciasAdmin, armarEnlace: ArmarEnlace): Promise<ProfesorLista[]> {
  const cliente = await deps.obtenerCliente();
  const { data, error } = await cliente.rpc('listar_profesores');
  if (error) throw error;
  const filas: ProfesorFila[] = z.array(esquemaProfesorFila).parse(data ?? []);
  return filas.map((f) => ({ ...f, enlace: armarEnlace(f.slug) }));
}
