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
import { cargarSupabase } from '../../../lib/supabase';
import * as lista from './lista';
import { useAlumnos as useAlumnosConLector, type EstadoAlumnos } from './useAlumnos';
import type { AlumnoEntrada, AlumnoLista } from './tipos';

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
export { falloLista, normalizarMotivo, separarPendientes, valoresInicialesAlumno } from './lista';
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

/** `v_alumnos` (ALU-09). */
export function leerAlumnos(deps: lista.DependenciasLista = dependenciasLista()): Promise<AlumnoLista[]> {
  return lista.leerAlumnos(deps);
}

const LECTOR_REAL = () => lista.leerAlumnos(dependenciasLista());

/** Lista de alumnos del profesor; `recargar()` después de cada operación. */
export function useAlumnos(): { datos: EstadoAlumnos; recargar: () => void } {
  return useAlumnosConLector(LECTOR_REAL);
}
