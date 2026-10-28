// Solicitud de reserva (B06, T06.1): `solicitar_reserva`, `previsualizar_serie` y `v_mis_solicitudes`
// (contratos.md §2 y §3). IDs: SOL-01, SOL-09, SOL-10, RES-01..05, RES-07, AGE-04, AGE-11, WEB-01, CA-46.
// Los errores se traducen con src/lib/errores.ts (SEC-17): de `details` solo se leen `campo` y el estado del
// vínculo de CUENTA_NO_APROBADA, validados contra listas cerradas.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { puedeSolicitarA, type RelacionConProfesor } from '../../../estado/profesor';
import { ESTADOS_INSCRIPCION, type EstadoInscripcion } from '../../../estado/tipos';
import { traducirError } from '../../../lib/errores';
import {
  CAMPOS_SOLICITUD,
  COLUMNAS_MIS_SOLICITUDES,
  esquemaFechaSerie,
  esquemaMiSolicitud,
  esquemaRespuestaSolicitud,
  esquemaSolicitud,
  type CampoSolicitud,
  type FalloSolicitud,
  type Frecuencia,
  type MiSolicitud,
  type ResultadoPrevisualizacion,
  type ResultadoSolicitud,
  type SolicitudEntrada,
} from './tipos';

export interface DependenciasSolicitud {
  obtenerCliente: () => Promise<SupabaseClient>;
}

function detallesDe(error: unknown): unknown {
  if (typeof error !== 'object' || error === null) return undefined;
  const details = (error as { details?: unknown }).details;
  if (typeof details !== 'string') return details;
  try {
    return JSON.parse(details) as unknown;
  } catch {
    return undefined;
  }
}

function propiedad(objeto: unknown, nombre: string): unknown {
  return typeof objeto === 'object' && objeto !== null ? (objeto as Record<string, unknown>)[nombre] : undefined;
}

function campoDe(detalles: unknown): CampoSolicitud | null {
  const campo = propiedad(detalles, 'campo');
  if (typeof campo !== 'string') return null;
  const sinPrefijo = campo.replace(/^p_/, '');
  return (CAMPOS_SOLICITUD as readonly string[]).includes(sinPrefijo) ? (sinPrefijo as CampoSolicitud) : null;
}

function estadoVinculoDe(detalles: unknown): EstadoInscripcion | null {
  const estado = propiedad(detalles, 'estado');
  return (ESTADOS_INSCRIPCION as readonly unknown[]).includes(estado) ? (estado as EstadoInscripcion) : null;
}

/** Traduce el error de la RPC a un fallo para la vista (SEC-17). */
export function falloDe(error: unknown): FalloSolicitud {
  const { codigo, mensaje } = traducirError(error);
  const detalles = detallesDe(error);
  const fallo: FalloSolicitud = { ok: false, codigo, mensaje, campo: codigo === 'DATOS_INVALIDOS' ? campoDe(detalles) : null };
  if (codigo === 'CUENTA_NO_APROBADA') fallo.estadoVinculo = estadoVinculoDe(detalles);
  return fallo;
}

function falloLocal(campo: CampoSolicitud, mensaje: string): FalloSolicitud {
  return { ok: false, codigo: 'DATOS_INVALIDOS', mensaje, campo };
}

/**
 * `solicitar_reserva` (SOL-01, RES-02..05, RES-07): pide una clase suelta o una serie en la agenda del
 * profesor `profesorId`. Valida la entrada antes de llamar (SEC-09); la base decide el resto: vínculo
 * aprobado con ese profesor (403 CUENTA_NO_APROBADA con su estado), profesor activo (409), tope de 10
 * pendientes con ese profesor (429 con el límite, SOL-10), grilla, anticipación (AGE-04) y hueco libre
 * (409 HUECO_NO_LIBRE, RES-01). Nunca reintenta sola (contratos.md §3).
 */
export async function solicitarReserva(
  entrada: SolicitudEntrada,
  deps: DependenciasSolicitud,
): Promise<ResultadoSolicitud> {
  const validado = esquemaSolicitud.safeParse(entrada);
  if (!validado.success) {
    const problema = validado.error.issues[0];
    const campo = (CAMPOS_SOLICITUD as readonly unknown[]).includes(problema?.path[0])
      ? (problema?.path[0] as CampoSolicitud)
      : 'inicio';
    return falloLocal(campo, problema?.message ?? 'Revisá los datos ingresados.');
  }
  const v = validado.data;
  try {
    const cliente = await deps.obtenerCliente();
    const { data, error } = await cliente.rpc('solicitar_reserva', {
      p_profesor_id: v.profesorId,
      p_inicio: v.inicio,
      p_tipo: v.tipo,
      p_frecuencia: v.tipo === 'serie' ? v.frecuencia : null,
      p_persona_a_cargo_id: v.personaACargoId,
      p_observacion: v.observacion === '' ? null : v.observacion,
    });
    if (error) return falloDe(error);
    const r = esquemaRespuestaSolicitud.parse(data);
    return { ok: true, solicitudId: r.solicitud_id, reservaId: r.reserva_id, fechas: r.fechas, salteadas: r.salteadas };
  } catch (e) {
    return falloDe(e);
  }
}

/**
 * `previsualizar_serie` (RES-05, CA-19): las fechas que tendría la serie hasta el horizonte, con las que se
 * saltean y por qué, antes de enviar. No escribe nada.
 */
export async function previsualizarSerie(
  profesorId: string,
  inicio: string,
  frecuencia: Frecuencia,
  deps: DependenciasSolicitud,
): Promise<ResultadoPrevisualizacion> {
  try {
    const cliente = await deps.obtenerCliente();
    const { data, error } = await cliente.rpc('previsualizar_serie', {
      p_profesor_id: profesorId,
      p_inicio: inicio,
      p_frecuencia: frecuencia,
    });
    if (error) return falloDe(error);
    // Solo las tres claves del contrato llegan a la vista.
    const fechas = z.array(esquemaFechaSerie).parse(data ?? []).map((f) => ({ inicio: f.inicio, estado: f.estado, motivo: f.motivo }));
    return { ok: true, fechas };
  } catch (e) {
    return falloDe(e);
  }
}

/**
 * Las solicitudes de la persona de la sesión con todos sus profesores (`v_mis_solicitudes`, RLS: solo las
 * suyas, SOL-09), de la clase más reciente a la más vieja. Con `profesorId`, solo las de ese profesor.
 * Lanza el error de supabase-js.
 */
export async function leerMisSolicitudes(
  deps: DependenciasSolicitud,
  profesorId: string | null = null,
): Promise<MiSolicitud[]> {
  const cliente = await deps.obtenerCliente();
  let consulta = cliente.from('v_mis_solicitudes').select(COLUMNAS_MIS_SOLICITUDES);
  if (profesorId !== null) consulta = consulta.eq('profesor_id', profesorId);
  const { data, error } = await consulta.order('fecha_clase', { ascending: false });
  if (error) throw error;
  return z.array(esquemaMiSolicitud).parse(data ?? []);
}

/** Fechas salteadas de una vista previa (RES-05), sin la primera, que es la que se pide. */
export function salteadasDe(fechas: readonly { inicio: string; estado: string }[]): string[] {
  return fechas.slice(1).filter((f) => f.estado === 'salteada').map((f) => f.inicio);
}

/**
 * Qué pasa al tocar un hueco de la agenda de un profesor (WEB-01, CA-46, AGE-11). Solo un hueco libre hace
 * algo: el visitante ve la invitación a ingresar (sin RPC); la persona con el vínculo aprobado con ese
 * profesor activo abre el formulario; con otro estado ve el de su vínculo; sin vínculo, «Pedir acceso».
 */
export type AccionHueco =
  | { tipo: 'ninguna' }
  | { tipo: 'invitar_ingreso' }
  | { tipo: 'completar_ficha' }
  | { tipo: 'pedir_acceso' }
  | { tipo: 'estado_vinculo'; estado: EstadoInscripcion }
  | { tipo: 'formulario' };

export function accionAlTocarHueco(
  relacion: RelacionConProfesor,
  estadoHueco: string,
  profesorActivo: boolean,
): AccionHueco {
  if (estadoHueco !== 'libre' || !profesorActivo) return { tipo: 'ninguna' };
  switch (relacion.tipo) {
    case 'visitante':
      return { tipo: 'invitar_ingreso' };
    case 'ficha_incompleta':
      return { tipo: 'completar_ficha' };
    case 'sin_vinculo':
      return { tipo: 'pedir_acceso' };
    case 'vinculo':
      if (puedeSolicitarA(relacion)) return { tipo: 'formulario' };
      // Aprobado con el profesor inactivo según la sesión: no toma reservas (AGE-11).
      if (relacion.inscripcion.estado === 'aprobado') return { tipo: 'ninguna' };
      return { tipo: 'estado_vinculo', estado: relacion.inscripcion.estado };
    default:
      return { tipo: 'ninguna' };
  }
}
