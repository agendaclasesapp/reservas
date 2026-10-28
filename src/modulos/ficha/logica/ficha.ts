// Ficha obligatoria del primer ingreso (ALU-02, ALU-13, ALU-14, WEB-03; contratos.md §3 `completar_ficha`),
// «Pedir acceso» a otro profesor (`pedir_inscripcion`, ALU-14, DEC-33) y personas a cargo (ALU-06, SEC-29,
// `guardar_persona_a_cargo`). Los errores se traducen con src/lib/errores.ts (SEC-17); de `details` solo se
// lee `campo`.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { normalizarSlug } from '../../../estado/profesor';
import type { SesionActual } from '../../../estado/tipos';
import { traducirError, type CodigoTraducido } from '../../../lib/errores';
import {
  CAMPOS_FICHA,
  crearEsquemaPedirAcceso,
  esquemaMiFicha,
  esquemaPersonaACargo,
  MENSAJES_FICHA,
  type CampoFicha,
  type FichaEntrada,
  type MiFicha,
  type PedirAccesoEntrada,
  type PersonaACargo,
  type PersonaEntrada,
  type VinculoFicha,
} from './tipos';

/** Ficha ya completada (doble envío o dos pestañas). Código propio de B04; ver handoff (pregunta). */
export const FICHA_YA_COMPLETA = 'FICHA_YA_COMPLETA';

export interface DependenciasFicha {
  obtenerCliente: () => Promise<SupabaseClient>;
  /** Tras completar la ficha o pedir acceso: refresca la sesión (la guarda suelta `/ficha`; llegan los vínculos). */
  alCompletar: () => Promise<unknown>;
  /** Olvida el profesor de origen de la pestaña (ADR-020) una vez usado o si ya no sirve. */
  olvidarOrigen?: () => void;
}

export type FalloFicha = {
  ok: false;
  codigo: CodigoTraducido;
  mensaje: string;
  campo: CampoFicha | null;
  /** true si el profesor de origen ya no existe o está inactivo y se olvidó: el próximo envío va sin vínculo. */
  origenDescartado?: boolean;
};
/** Inscripción pendiente que nació con la ficha (ALU-14). */
export interface InscripcionNueva {
  profesorId: string;
  estado: 'pendiente';
}
/** `inscripcion`: la que nació con la ficha si hubo profesor de origen; si no, `null` (ALU-14). */
export type ResultadoFicha = { ok: true; inscripcion?: InscripcionNueva | null } | FalloFicha;
export type ResultadoPedido = { ok: true; profesorId: string; estado: 'pendiente' } | FalloFicha;
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

const esquemaRespuestaFicha = z.object({
  estado: z.literal('completa'),
  inscripcion: z.object({ profesor_id: z.string(), estado: z.literal('pendiente') }).nullable(),
});

/**
 * Completa la ficha (ALU-02). Con `origen` (slug del profesor del enlace, ADR-020) manda `p_slug` y
 * `p_como_llego`, y la inscripción pendiente nace en la misma transacción (ALU-14); sin `origen` no manda
 * «cómo llegaste» y la persona queda sin vínculo. Con el tope de ALU-13 superado vuelve `LIMITE_EXCEDIDO`
 * con el texto de «intentá más tarde» y la ficha sigue incompleta. `FICHA_YA_COMPLETA` cuenta como éxito.
 * Si el profesor de origen ya no existe (404) o está inactivo (409 `PROFESOR_INACTIVO`), lo olvida y lo
 * dice: el próximo envío va sin vínculo.
 */
export async function completarFicha(
  datos: FichaEntrada,
  origen: string | null,
  deps: DependenciasFicha,
): Promise<ResultadoFicha> {
  const slug = origen === null ? null : normalizarSlug(origen);
  let inscripcion: InscripcionNueva | null = null;
  try {
    const cliente = await deps.obtenerCliente();
    const { data, error } = await cliente.rpc('completar_ficha', {
      p_nombre: datos.nombre.trim(),
      p_telefono: datos.telefono.trim(),
      p_fecha_nacimiento: datos.fecha_nacimiento.trim(),
      p_slug: slug,
      p_como_llego: slug === null ? null : datos.como_llego.trim(),
    });
    if (error && mensajeDe(error) !== FICHA_YA_COMPLETA) {
      const f = fallo(error);
      if (slug !== null && (f.codigo === 'NO_ENCONTRADO' || f.codigo === 'PROFESOR_INACTIVO')) {
        deps.olvidarOrigen?.();
        return { ...f, mensaje: MENSAJES_FICHA.origenNoDisponible, origenDescartado: true };
      }
      return f;
    }
    if (!error) {
      const r = esquemaRespuestaFicha.safeParse(data);
      if (r.success && r.data.inscripcion) {
        inscripcion = { profesorId: r.data.inscripcion.profesor_id, estado: 'pendiente' };
      }
    }
  } catch (e) {
    return fallo(e);
  }
  if (slug !== null) deps.olvidarOrigen?.();
  await deps.alCompletar();
  return { ok: true, inscripcion };
}

const esquemaRespuestaPedido = z.object({ profesor_id: z.string(), estado: z.literal('pendiente') });

/**
 * «Pedir acceso» al profesor del slug con la ficha ya completa (ALU-14, DEC-33): la inscripción nace
 * pendiente. Si ya había un vínculo (409 `CUENTA_NO_PENDIENTE`) lo dice y refresca la sesión para mostrar su
 * estado. «Cómo llegaste» se valida antes de llamar (SEC-09).
 */
export async function pedirInscripcion(
  slug: string,
  entrada: PedirAccesoEntrada,
  deps: Pick<DependenciasFicha, 'obtenerCliente' | 'alCompletar'>,
): Promise<ResultadoPedido> {
  const pSlug = normalizarSlug(slug);
  if (pSlug === null) return fallo({ code: 'PT404', message: 'NO_ENCONTRADO' });
  const validado = crearEsquemaPedirAcceso().safeParse(entrada);
  if (!validado.success) {
    return {
      ok: false,
      codigo: 'DATOS_INVALIDOS',
      mensaje: validado.error.issues[0]?.message ?? MENSAJES_FICHA.comoLlegoVacio,
      campo: 'como_llego',
    };
  }
  try {
    const cliente = await deps.obtenerCliente();
    const { data, error } = await cliente.rpc('pedir_inscripcion', {
      p_slug: pSlug,
      p_como_llego: validado.data.como_llego,
    });
    if (error) {
      const f = fallo(error);
      if (f.codigo !== 'CUENTA_NO_PENDIENTE') return f;
      await deps.alCompletar();
      return { ...f, mensaje: MENSAJES_FICHA.yaPediste };
    }
    const r = esquemaRespuestaPedido.parse(data);
    await deps.alCompletar();
    return { ok: true, profesorId: r.profesor_id, estado: r.estado };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * WEB-03, ALU-03: el estado con cada profesor (en el orden de `sesion_actual`, por nombre) y el motivo del
 * que rechazó, solo si lo escribió. Sin sesión de persona, lista vacía.
 */
export function vinculosDeFicha(sesion: SesionActual | null): VinculoFicha[] {
  if (sesion?.rol !== 'alumno') return [];
  return sesion.inscripciones.map((i) => {
    const motivo = i.estado === 'rechazado' ? (i.motivo_rechazo?.trim() ?? '') : '';
    return {
      profesorId: i.profesor_id,
      slug: i.slug,
      profesorNombre: i.profesor_nombre,
      profesorActivo: i.profesor_activo,
      estado: i.estado,
      motivo: motivo === '' ? null : motivo,
    };
  });
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
    .select('nombre, mail, telefono, fecha_nacimiento')
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
    como_llego: '',
  };
}
