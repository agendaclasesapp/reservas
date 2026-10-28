// API pública de la lógica de la solicitud de reserva (B06, T06.1). Las vistas (T06.2) importan solo desde acá.
// SOL-01, SOL-09, SOL-10, RES-02..05, RES-07, AGE-04, AGE-11, WEB-01, WEB-04, CA-19, CA-46.
//
//   accionAlTocarHueco(relacion, estadoHueco, profesorActivo) -> AccionHueco
//       qué abre un hueco tocado: 'invitar_ingreso' (visitante, sin RPC, CA-46) · 'formulario' (vínculo
//       aprobado con ese profesor activo) · 'estado_vinculo' · 'pedir_acceso' · 'completar_ficha' · 'ninguna'
//   usePrevisualizacionSerie(profesorId, inicio, frecuencia | null) -> EstadoPrevisualizacion  (RES-05)
//   useSolicitarReserva() -> { estado, enviar(entrada), reiniciar }                             (SOL-01)
//   useMisSolicitudes(profesorId | null) -> { estado, recargar }                                (SOL-09)
//   solicitarReserva(entrada) / previsualizarSerie(profesorId, inicio, frecuencia) / leerMisSolicitudes()
//   salteadasDe(fechas) -> inicios salteados de una vista previa, sin la primera fecha
//
// Los fallos traen `codigo` y `mensaje` ya traducidos (src/lib/errores.ts): LIMITE_EXCEDIDO dice el límite
// de SOL-10; CUENTA_NO_APROBADA trae `estadoVinculo`; DATOS_INVALIDOS trae `campo`. Los instantes llegan en
// UTC: se muestran con formatearHora/formatearFecha(instante, zona_horaria del profesor) de src/lib/fechas.
import { cargarSupabase } from '../../../lib/supabase';
import * as hooks from './hooks';
import * as solicitud from './solicitud';
import type { Frecuencia, MiSolicitud, ResultadoPrevisualizacion, ResultadoSolicitud, SolicitudEntrada } from './tipos';

export {
  CAMPOS_SOLICITUD,
  esquemaSolicitud,
  FRECUENCIAS,
  LARGO_MAX_OBSERVACION,
  MENSAJES_SOLICITUD,
  TIPOS_RESERVA,
} from './tipos';
export type {
  AlcanceSolicitud,
  CampoSolicitud,
  EstadoFechaSerie,
  EstadoSolicitud,
  FalloSolicitud,
  FechaSerie,
  Frecuencia,
  MiSolicitud,
  MotivoSalteada,
  ResultadoPrevisualizacion,
  ResultadoSolicitud,
  SolicitudCreada,
  SolicitudEntrada,
  TipoReserva,
  TipoSolicitud,
} from './tipos';
export { accionAlTocarHueco, falloDe, salteadasDe } from './solicitud';
export type { AccionHueco, DependenciasSolicitud } from './solicitud';
export type { EstadoEnvio, EstadoMisSolicitudes, EstadoPrevisualizacion } from './hooks';

const obtenerCliente = () => cargarSupabase();

/** Dependencias reales: supabase-js cargado con import() (ADR-017). Referencia estable para los hooks. */
const DEPS: solicitud.DependenciasSolicitud = { obtenerCliente };

export function dependenciasSolicitud(): solicitud.DependenciasSolicitud {
  return DEPS;
}

/** `solicitar_reserva` (SOL-01): valida la entrada y llama; nunca reintenta. */
export function solicitarReserva(
  entrada: SolicitudEntrada,
  deps: solicitud.DependenciasSolicitud = DEPS,
): Promise<ResultadoSolicitud> {
  return solicitud.solicitarReserva(entrada, deps);
}

/** `previsualizar_serie` (RES-05): fechas reservables y salteadas hasta el horizonte. */
export function previsualizarSerie(
  profesorId: string,
  inicio: string,
  frecuencia: Frecuencia,
  deps: solicitud.DependenciasSolicitud = DEPS,
): Promise<ResultadoPrevisualizacion> {
  return solicitud.previsualizarSerie(profesorId, inicio, frecuencia, deps);
}

/** `v_mis_solicitudes` (SOL-09): las de la persona de la sesión; lanza el error de supabase-js. */
export function leerMisSolicitudes(
  profesorId: string | null = null,
  deps: solicitud.DependenciasSolicitud = DEPS,
): Promise<MiSolicitud[]> {
  return solicitud.leerMisSolicitudes(deps, profesorId);
}

export function usePrevisualizacionSerie(
  profesorId: string | null,
  inicio: string | null,
  frecuencia: Frecuencia | null,
): hooks.EstadoPrevisualizacion {
  return hooks.usePrevisualizacionSerie(profesorId, inicio, frecuencia, DEPS);
}

export function useSolicitarReserva(): ReturnType<typeof hooks.useSolicitarReserva> {
  return hooks.useSolicitarReserva(DEPS);
}

export function useMisSolicitudes(profesorId: string | null = null): ReturnType<typeof hooks.useMisSolicitudes> {
  return hooks.useMisSolicitudes(profesorId, DEPS);
}
