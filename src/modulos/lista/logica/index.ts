// API de la lógica de la lista de alumnos para las vistas (T05.2) y las pruebas (T05.3).
// ALU-03, ALU-04, ALU-05, ALU-07, ALU-08, ALU-09, AVI-03, SEC-09, H-037. Las vistas importan solo desde aquí.
//
// Uso típico en la vista:
//   const { datos, recargar } = useAlumnos();                     // v_alumnos: estado, ficha y edad
//   const { pendientes, resto } = separarPendientes(datos.alumnos);
//   const s = await sugerenciasUnion(pendiente.id);               // sugerencia de unión de una pendiente
//   const r = await aprobarCuenta(id, motivo);                    // ok → r.sugerencias; luego recargar()
//   const r = await rechazarCuenta(id, motivo);                   // motivo opcional: la cuenta lo ve (ALU-03)
//   await unirAlumnos(cuentaId, sinCuentaId) | descartarUnion(cuentaId, sinCuentaId);
//   const esquema = crearEsquemaAlumno(hoyEn(config.zona_horaria));  // react-hook-form + zod
//   const r = await altaAlumno(valores) | editarAlumno(id, valores);  // r.campo marca el campo del 422
//   r.ok && r.asociado → MENSAJES_LISTA.altaAsociada (DEC-29 b)
//   const p = permisosLista(sesion.profesor.activo);              // PRF-08: aprobar y alta solo activo
//   puedeEditar(alumno)                                           // DEC-32: v_alumnos.editable
// B07 (T07.2):
//   const { datos, recargar } = useSolicitudesPendientes();       // v_solicitudes_pendientes por fecha_clase
//   const { vigentes, vencidas } = separarVencidas(datos.filas);  // SOL-08: las vencidas no se responden
//   const a = accionesSolicitud(s, sesion.profesor.activo);       // PRF-08: inactivo rechaza pero no confirma
//   const r = await responderSolicitud(s.id, 'confirmar' | 'rechazar', motivo);  // ok → r.estado; luego recargar()
//   const { datos } = useClases({ desde, hasta, alumnoId }, zona);  // v_clases filtrada (CA-29), con pasadas
// B11 (T11.2):
//   textoConfirmacionBorrado(alumno)                              // párrafos del diálogo (ALU-12, DEC-26 A)
//   const r = await borrarAlumno(alumno.id);                      // ok → resumenBorrado(r); luego recargar()
//   nombreVisible(clase.titular)                                  // «Alumno dado de baja» si ya no tiene datos
import { cargarSupabase } from '../../../lib/supabase';
import * as lista from './lista';
import { useAlumnos as useAlumnosConLector, type EstadoAlumnos } from './useAlumnos';
import type { AlumnoEntrada, AlumnoLista } from './tipos';
import * as clases from './clases';
import * as solicitudes from './solicitudes';
import * as borrado from './borrado';
import {
  useClases as useClasesConLector,
  useSolicitudesPendientes as useSolicitudesConLector,
  type EstadoLectura,
} from './useLectura';

export {
  CAMPOS_LISTA,
  COLUMNAS_V_ALUMNOS,
  crearEsquemaAlumno,
  CUENTA_NO_PENDIENTE,
  ESTADOS_LISTA,
  esquemaAlumnoLista,
  esquemaMotivo,
  LARGO_MAX_MAIL,
  LARGO_MAX_MOTIVO,
  mailSimple,
  MENSAJES_LISTA,
  UNION_NO_VALIDA,
} from './tipos';
export type { AlumnoEntrada, AlumnoLista, CampoLista, EstadoAlumno, RespuestaCuenta, Sugerencia } from './tipos';
export {
  falloLista,
  normalizarMotivo,
  permisosLista,
  puedeEditar,
  separarPendientes,
  valoresInicialesAlumno,
} from './lista';
export type {
  CodigoLista,
  DependenciasLista,
  FalloLista,
  ResultadoAlta,
  ResultadoCuenta,
  ResultadoEdicion,
  ResultadoSugerencias,
  ResultadoUnion,
} from './lista';
export type { EstadoAlumnos, LectorAlumnos } from './useAlumnos';
export {
  accionesSolicitud,
  ALCANCES,
  COLUMNAS_V_SOLICITUDES_PENDIENTES,
  DECISIONES,
  esquemaSolicitudPendiente,
  falloRespuesta,
  MENSAJES_RESPUESTA,
  separarVencidas,
  textoTipoSolicitud,
  TIPOS_SOLICITUD,
} from './solicitudes';
export type {
  Alcance,
  Decision,
  FalloRespuesta,
  ResultadoRespuesta,
  SolicitudPendiente,
  TipoSolicitud,
} from './solicitudes';
export {
  COLUMNAS_V_CLASES,
  ESTADOS_CLASE,
  esquemaClaseProfesor,
  MENSAJES_CLASES,
  rangoDeFiltro,
  textoEstadoClaseProfesor,
  validarFiltroClases,
} from './clases';
export type { ClaseProfesor, EstadoClase, FiltroClases } from './clases';
export type { EstadoLectura, LectorClases, LectorSolicitudes } from './useLectura';
export { MENSAJES_BORRADO, nombreVisible, resumenBorrado, textoConfirmacionBorrado } from './borrado';
export type { ResultadoBorrado } from './borrado';

/** Dependencias reales: supabase-js cargado con import() (ADR-017). */
export function dependenciasLista(): lista.DependenciasLista {
  return { obtenerCliente: () => cargarSupabase() };
}

/** `aprobar_cuenta` (ALU-03, ALU-04, AVI-03, H-037). */
export function aprobarCuenta(
  alumnoId: string,
  motivo?: string | null,
  deps: lista.DependenciasLista = dependenciasLista(),
): Promise<lista.ResultadoCuenta> {
  return lista.aprobarCuenta(alumnoId, motivo, deps);
}

/** `rechazar_cuenta` (ALU-03, AVI-03). */
export function rechazarCuenta(
  alumnoId: string,
  motivo?: string | null,
  deps: lista.DependenciasLista = dependenciasLista(),
): Promise<lista.ResultadoCuenta> {
  return lista.rechazarCuenta(alumnoId, motivo, deps);
}

/** `sugerencias_union` (ALU-04). */
export function sugerenciasUnion(
  alumnoId: string,
  deps: lista.DependenciasLista = dependenciasLista(),
): Promise<lista.ResultadoSugerencias> {
  return lista.sugerenciasUnion(alumnoId, deps);
}

/** `unir_alumnos` (ALU-05). */
export function unirAlumnos(
  cuentaId: string,
  sinCuentaId: string,
  deps: lista.DependenciasLista = dependenciasLista(),
): Promise<lista.ResultadoUnion> {
  return lista.unirAlumnos(cuentaId, sinCuentaId, deps);
}

/** `descartar_union` (ALU-04). */
export function descartarUnion(
  cuentaId: string,
  sinCuentaId: string,
  deps: lista.DependenciasLista = dependenciasLista(),
): Promise<lista.ResultadoUnion> {
  return lista.descartarUnion(cuentaId, sinCuentaId, deps);
}

/** `alta_alumno` (ALU-07, ALU-08). */
export function altaAlumno(
  datos: AlumnoEntrada,
  deps: lista.DependenciasLista = dependenciasLista(),
): Promise<lista.ResultadoAlta> {
  return lista.altaAlumno(datos, deps);
}

/** `editar_alumno` (ALU-09: ficha). */
export function editarAlumno(
  alumnoId: string,
  datos: AlumnoEntrada,
  deps: lista.DependenciasLista = dependenciasLista(),
): Promise<lista.ResultadoEdicion> {
  return lista.editarAlumno(alumnoId, datos, deps);
}

/** `borrar_alumno` (ALU-12, DEC-26 A): `{clasesCanceladas, solicitudesAnuladas}` o el fallo traducido. */
export function borrarAlumno(
  alumnoId: string,
  deps: lista.DependenciasLista = dependenciasLista(),
): Promise<borrado.ResultadoBorrado> {
  return borrado.borrarAlumno(alumnoId, deps);
}

/** `v_alumnos` (ALU-09). */
export function leerAlumnos(deps: lista.DependenciasLista = dependenciasLista()): Promise<AlumnoLista[]> {
  return lista.leerAlumnos(deps);
}

const LECTOR_REAL = () => lista.leerAlumnos(dependenciasLista());

/** Lista de alumnos del profesor; `recargar()` después de cada operación. */
export function useAlumnos(): { datos: EstadoAlumnos; recargar: () => void } {
  return useAlumnosConLector(LECTOR_REAL);
}

/** `responder_solicitud` (SOL-04..06, AVI-03, PRF-08). */
export function responderSolicitud(
  solicitudId: string,
  decision: solicitudes.Decision,
  motivo?: string | null,
  deps: lista.DependenciasLista = dependenciasLista(),
): Promise<solicitudes.ResultadoRespuesta> {
  return solicitudes.responderSolicitud(solicitudId, decision, motivo, deps);
}

/** `v_solicitudes_pendientes` (PRF-06). */
export function leerSolicitudesPendientes(
  deps: lista.DependenciasLista = dependenciasLista(),
): Promise<solicitudes.SolicitudPendiente[]> {
  return solicitudes.leerSolicitudesPendientes(deps);
}

/** `v_clases` con el filtro de CA-29 en el huso del profesor (PRF-06). */
export function leerClases(
  filtro: clases.FiltroClases,
  zona: string,
  deps: lista.DependenciasLista = dependenciasLista(),
): Promise<clases.ClaseProfesor[]> {
  return clases.leerClases(filtro, zona, deps);
}

const LECTOR_SOLICITUDES_REAL = () => solicitudes.leerSolicitudesPendientes(dependenciasLista());
const LECTOR_CLASES_REAL = (filtro: clases.FiltroClases, zona: string) =>
  clases.leerClases(filtro, zona, dependenciasLista());

/** Solicitudes pendientes del profesor; `recargar()` después de responder. */
export function useSolicitudesPendientes(): {
  datos: EstadoLectura<solicitudes.SolicitudPendiente>;
  recargar: () => void;
} {
  return useSolicitudesConLector(LECTOR_SOLICITUDES_REAL);
}

/** Clases de su agenda filtradas (CA-29); vuelve a leer al cambiar el filtro o el huso. */
export function useClases(
  filtro: clases.FiltroClases,
  zona: string,
): { datos: EstadoLectura<clases.ClaseProfesor>; recargar: () => void } {
  return useClasesConLector(LECTOR_CLASES_REAL, filtro, zona);
}
