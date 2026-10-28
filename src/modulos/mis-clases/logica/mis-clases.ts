// Lectura y armado de Mis clases (RES-06, SOL-08, ALU-03, WEB-05, CA-20, CA-25, CA-45, CA-53).
// Las clases salen de `v_mis_clases`; el estado de cada vínculo y su motivo de rechazo, de
// `sesion_actual().inscripciones` (`vinculosDeFicha`, B14): no se duplican aquí.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { EstadoInscripcion, SesionActual } from '../../../estado';
import { formatearFecha, formatearHora } from '../../../lib/fechas';
import { vinculosDeFicha } from '../../ficha/logica';
import {
  COLUMNAS_V_MIS_CLASES,
  esquemaClaseMia,
  MENSAJES_MIS_CLASES,
  ZONA_POR_DEFECTO,
  type ClaseMia,
} from './tipos';

export interface DependenciasMisClases {
  obtenerCliente: () => Promise<SupabaseClient>;
}

/** `v_mis_clases` por inicio. Lanza el error de postgrest-js (la vista lo traduce con `mensajeDeError`). */
export async function leerMisClases(deps: DependenciasMisClases): Promise<ClaseMia[]> {
  const cliente = await deps.obtenerCliente();
  const { data, error } = await cliente.from('v_mis_clases').select(COLUMNAS_V_MIS_CLASES).order('inicio');
  if (error) throw error;
  return z.array(esquemaClaseMia).parse(data ?? []);
}

export interface GruposMisClases {
  /** Solicitudes de reserva sin responder cuyo horario no pasó, de la más próxima a la más lejana. */
  pendientes: ClaseMia[];
  /** Confirmadas que no empezaron, de la más próxima a la más lejana. */
  proximas: ClaseMia[];
  /** Las que ya empezaron, de cualquier estado, de la más reciente a la más vieja (historial, SOL-08). */
  pasadas: ClaseMia[];
  /** Futuras rechazadas, canceladas o cambiadas de horario, por inicio. */
  canceladas: ClaseMia[];
}

const porInicio = (a: ClaseMia, b: ClaseMia) => a.inicio.localeCompare(b.inicio) || a.id.localeCompare(b.id);

/**
 * WEB-05: próximas, pendientes y pasadas de todos los profesores. «Pasada» la decide la base (`pasada`, con
 * `app_ahora()`); una pendiente pasada queda en el historial como «pendiente sin respuesta» (CA-25).
 */
export function agruparMisClases(clases: readonly ClaseMia[]): GruposMisClases {
  const grupos: GruposMisClases = { pendientes: [], proximas: [], pasadas: [], canceladas: [] };
  for (const c of clases) {
    if (c.pasada) grupos.pasadas.push(c);
    else if (c.estado === 'pendiente') grupos.pendientes.push(c);
    else if (c.estado === 'confirmada') grupos.proximas.push(c);
    else grupos.canceladas.push(c);
  }
  grupos.pendientes.sort(porInicio);
  grupos.proximas.sort(porInicio);
  grupos.canceladas.sort(porInicio);
  grupos.pasadas.sort((a, b) => porInicio(b, a));
  return grupos;
}

/** SOL-08, CA-25: pendiente cuyo horario pasó sin respuesta del profesor. */
export function esPendienteSinRespuesta(clase: ClaseMia): boolean {
  return clase.estado === 'pendiente' && (clase.pasada || clase.solicitud_pendiente?.vencida === true);
}

/** Texto del estado de la clase (CA-20); «Pendiente sin respuesta» si venció sin respuesta (CA-25). */
export function textoEstadoClase(clase: ClaseMia): string {
  if (esPendienteSinRespuesta(clase)) return MENSAJES_MIS_CLASES.pendienteSinRespuesta;
  return MENSAJES_MIS_CLASES.estado[clase.estado];
}

/**
 * Aviso de una solicitud sin responder sobre una clase confirmada (movimiento o cancelación, B08) o de la
 * reserva pedida; `null` si no hay ninguna o si ya venció (entonces manda `textoEstadoClase`).
 */
export function textoSolicitudDeClase(clase: ClaseMia): string | null {
  const s = clase.solicitud_pendiente;
  if (!s || s.vencida || clase.pasada) return null;
  return MENSAJES_MIS_CLASES.solicitud[s.tipo];
}

export interface HorarioDeClase {
  /** P. ej. «martes, 3 de noviembre». */
  fecha: string;
  /** `HH:mm` de inicio y de fin. */
  desde: string;
  hasta: string;
  /** Huso del profesor de la clase, para mostrarlo si difiere entre profesores (CA-53). */
  zona: string;
}

/** Fecha y hora de la clase en el huso de su profesor (ADR-004, CA-53), nunca en el del navegador. */
export function horarioDeClase(clase: ClaseMia): HorarioDeClase {
  const zona = clase.zona_horaria ?? ZONA_POR_DEFECTO;
  return {
    fecha: formatearFecha(clase.inicio, zona),
    desde: formatearHora(clase.inicio, zona),
    hasta: formatearHora(clase.fin, zona),
    zona,
  };
}

/** Nombre del profesor de la clase como texto (SEC-16). */
export function profesorDeClase(clase: ClaseMia): string {
  return clase.profesor_nombre?.trim() || MENSAJES_MIS_CLASES.profesorSinNombre;
}

/** Hay clases en más de un huso: la vista muestra el huso junto a la hora (CA-53). */
export function hayVariosHusos(clases: readonly ClaseMia[]): boolean {
  return new Set(clases.map((c) => c.zona_horaria ?? ZONA_POR_DEFECTO)).size > 1;
}

export interface ProfesorDeMisClases {
  profesorId: string;
  slug: string | null;
  /** Texto (SEC-16). */
  profesorNombre: string;
  /** Activo según la sesión; `null` si no hay vínculo vigente (baja). */
  profesorActivo: boolean | null;
  /** Estado del vínculo según `sesion_actual().inscripciones`; `null` sin vínculo vigente (baja). */
  estado: EstadoInscripcion | null;
  /** Texto del estado del vínculo. */
  textoEstado: string;
  /** ALU-03, CA-45: motivo del profesor que rechazó, solo si lo escribió; texto, nunca HTML (SEC-16). */
  motivoRechazo: string | null;
  /** Sus clases, por inicio. */
  clases: ClaseMia[];
}

/**
 * ALU-03, CA-45, CA-53: cada profesor de la persona con el estado del vínculo, el motivo de rechazo (de
 * `sesion_actual`, sin duplicarlo) y sus clases. Primero los vínculos en el orden de la sesión (por nombre);
 * después los profesores que solo aparecen en clases (vínculo en baja), por nombre.
 */
export function profesoresDeMisClases(sesion: SesionActual | null, clases: readonly ClaseMia[]): ProfesorDeMisClases[] {
  const porProfesor = new Map<string, ClaseMia[]>();
  for (const c of [...clases].sort(porInicio)) {
    const lista = porProfesor.get(c.profesor_id) ?? [];
    lista.push(c);
    porProfesor.set(c.profesor_id, lista);
  }

  const resultado: ProfesorDeMisClases[] = vinculosDeFicha(sesion).map((v) => ({
    profesorId: v.profesorId,
    slug: v.slug,
    profesorNombre: v.profesorNombre,
    profesorActivo: v.profesorActivo,
    estado: v.estado,
    textoEstado: MENSAJES_MIS_CLASES.vinculo[v.estado],
    motivoRechazo: v.motivo,
    clases: porProfesor.get(v.profesorId) ?? [],
  }));

  const conVinculo = new Set(resultado.map((p) => p.profesorId));
  const sinVinculo = [...porProfesor.entries()]
    .filter(([id]) => !conVinculo.has(id))
    .map(([id, lista]): ProfesorDeMisClases => ({
      profesorId: id,
      slug: lista[0]?.profesor_slug ?? null,
      profesorNombre: lista[0] ? profesorDeClase(lista[0]) : MENSAJES_MIS_CLASES.profesorSinNombre,
      profesorActivo: null,
      estado: null,
      textoEstado: MENSAJES_MIS_CLASES.sinVinculo,
      motivoRechazo: null,
      clases: lista,
    }))
    .sort((a, b) => a.profesorNombre.localeCompare(b.profesorNombre, 'es'));

  return [...resultado, ...sinVinculo];
}
