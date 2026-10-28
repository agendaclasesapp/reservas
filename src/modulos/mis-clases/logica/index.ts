// API de la lógica de Mis clases para las vistas (T07.2) y las pruebas (T07.3).
// RES-06, SOL-08, ALU-03, WEB-05; CA-20, CA-25, CA-45, CA-53. Las vistas importan solo desde aquí.
//
// Uso típico en la vista:
//   const s = useSesion();                                             // sesion_actual (B14)
//   const { datos, recargar } = useMisClases();                        // v_mis_clases de todos sus profesores
//   const { pendientes, proximas, pasadas, canceladas } = agruparMisClases(datos.clases);
//   const profesores = profesoresDeMisClases(s.tipo === 'sesion' ? s.sesion : null, datos.clases);
//                                                                      // vínculo, motivo y clases por profesor
//   horarioDeClase(clase) → { fecha, desde, hasta, zona }               // en el huso de SU profesor (CA-53)
//   textoEstadoClase(clase), textoSolicitudDeClase(clase), profesorDeClase(clase)  // todo texto (SEC-16)
//
// Mover o avisar que no voy (B08; SOL-02, SOL-03, SOL-07, SOL-10, RES-07, AGE-11):
//   puedePedirCambio(clase)              // confirmada, sin empezar y sin otra solicitud pendiente
//   alcancesDeClase(clase)               // ['solo_esta'] o ['solo_esta', 'desde_aca'] si es de una serie
//   agendaDelProfesorDeClase(clase)      // { profesorId, slug, zona }: el destino se elige en ESA agenda
//   const cambio = useCambioDeClase();   // { enviando, resultado, mover, cancelar, limpiar }
//   const r = await cambio.mover(clase, destinoIso, 'solo_esta');   // { ok, solicitudId, fechas, salteadas } | fallo
//   const r = await cambio.cancelar(clase, 'desde_aca');            // { ok, solicitudId } | fallo
//   fallo: { ok: false, codigo, mensaje, campo: 'alcance' | 'destino' | null }; tras ok, recargar()
import { cargarSupabase } from '../../../lib/supabase';
import * as misClases from './mis-clases';
import { useMisClases as useMisClasesConLector, type EstadoMisClases } from './useMisClases';
import { useCambioDeClase as useCambioDeClaseConDeps, type CambioDeClase } from './useCambioDeClase';
import type { DependenciasCambios } from './cambios';
import type { ClaseMia } from './tipos';

export {
  ALCANCES,
  COLUMNAS_V_MIS_CLASES,
  ESTADOS_CLASE,
  esquemaClaseMia,
  esquemaSolicitudDeClase,
  MENSAJES_MIS_CLASES,
  TIPOS_SOLICITUD,
  ZONA_POR_DEFECTO,
} from './tipos';
export type { Alcance, ClaseMia, EstadoClase, SolicitudDeClase, TipoSolicitud } from './tipos';
export {
  agruparMisClases,
  esPendienteSinRespuesta,
  hayVariosHusos,
  horarioDeClase,
  profesorDeClase,
  profesoresDeMisClases,
  textoEstadoClase,
  textoSolicitudDeClase,
} from './mis-clases';
export type { DependenciasMisClases, GruposMisClases, HorarioDeClase, ProfesorDeMisClases } from './mis-clases';
export type { EstadoMisClases, LectorMisClases } from './useMisClases';
export {
  agendaDelProfesorDeClase,
  alcancesDeClase,
  falloCambio,
  MENSAJES_CAMBIOS,
  puedePedirCambio,
  solicitarCancelacion,
  solicitarMovimiento,
} from './cambios';
export type { DependenciasCambios, FalloCambio, ResultadoCancelacion, ResultadoMovimiento } from './cambios';
export type { CambioDeClase, EstadoCambioDeClase } from './useCambioDeClase';

/** Dependencias reales: supabase-js cargado con import() (ADR-017). */
export function dependenciasMisClases(): misClases.DependenciasMisClases {
  return { obtenerCliente: () => cargarSupabase() };
}

/** `v_mis_clases` (RES-06). Lanza el error de postgrest-js. */
export function leerMisClases(deps: misClases.DependenciasMisClases = dependenciasMisClases()): Promise<ClaseMia[]> {
  return misClases.leerMisClases(deps);
}

const LECTOR_REAL = () => misClases.leerMisClases(dependenciasMisClases());

/** Clases de la persona con todos sus profesores; `recargar()` tras volver de una solicitud. */
export function useMisClases(): { datos: EstadoMisClases; recargar: () => void } {
  return useMisClasesConLector(LECTOR_REAL);
}

const DEPENDENCIAS_CAMBIOS: DependenciasCambios = { obtenerCliente: () => cargarSupabase() };

/** Pedir mover o cancelar una clase con el cliente real (B08). */
export function useCambioDeClase(): CambioDeClase {
  return useCambioDeClaseConDeps(DEPENDENCIAS_CAMBIOS);
}
