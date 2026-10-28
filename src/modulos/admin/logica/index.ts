// API de la lógica del Administrador para las vistas (T15.2) y las pruebas (T15.3).
// ADM-01..05, AGE-09, AGE-11, DEC-31, DEC-34, SEC-06, SEC-09, SEC-17. Las vistas importan solo desde aquí.
// Quién es Administrador lo dice `sesion_actual().es_administrador` (src/estado); la base decide igual (403).
//
// Uso típico en la vista:
//   const { datos, recargar } = useProfesores();          // ADM-03: nombre, mail, slug, enlace, activo
//   const alta = useAltaProfesor();                       // ADM-02
//   const r = await alta.enviar({ mail, nombre, slug });  // r.ok → r.adoptado ? MENSAJES_ADMIN.adoptado; recargar()
//                                                          // !r.ok → r.campo marca el campo y r.mensaje el texto
//   const estado = useCambiarEstadoProfesor();            // ADM-05: estado.cambiando = id en curso
//   const r = await estado.cambiar(p.profesor_id, !p.activo); // r.ok → recargar()
//   esquemaAltaProfesor                                   // react-hook-form + zod; normalizarSlug en el campo
//   MENSAJES_ADMIN.avisoDatosPublicos                     // DEC-34, junto al formulario de alta
import { cargarSupabase } from '../../../lib/supabase';
import { enlaceDeProfesor } from '../../configuracion/logica';
import * as admin from './admin';
import * as hooks from './hooks';
import type { ProfesorEntrada, ProfesorLista } from './tipos';

export {
  CAMPOS_ADMIN,
  esquemaAltaProfesor,
  LARGO_MAX_NOMBRE_PROFESOR,
  LARGO_MAX_SLUG,
  LARGO_MIN_SLUG,
  MENSAJES_ADMIN,
  normalizarSlug,
  SLUGS_RESERVADOS,
  slugConFormato,
  slugReservado,
  slugValido,
} from './tipos';
export type { CampoAdmin, ProfesorEntrada, ProfesorFila, ProfesorLista } from './tipos';
export { falloAdmin, validarAltaProfesor } from './admin';
export type {
  ArmarEnlace,
  DependenciasAdmin,
  FalloAdmin,
  ResultadoAltaProfesor,
  ResultadoEstadoProfesor,
} from './admin';
export type { AccionAlta, AccionEstado, EstadoProfesores, LectorProfesores } from './hooks';

/** Dependencias reales: supabase-js cargado con import() (ADR-017). */
export function dependenciasAdmin(): admin.DependenciasAdmin {
  return { obtenerCliente: () => cargarSupabase() };
}

/** `alta_profesor` (ADM-02). */
export function altaProfesor(
  datos: ProfesorEntrada,
  deps: admin.DependenciasAdmin = dependenciasAdmin(),
): Promise<admin.ResultadoAltaProfesor> {
  return admin.altaProfesor(datos, deps);
}

/** `cambiar_estado_profesor` (ADM-05). */
export function cambiarEstadoProfesor(
  profesorId: string,
  activo: boolean,
  deps: admin.DependenciasAdmin = dependenciasAdmin(),
): Promise<admin.ResultadoEstadoProfesor> {
  return admin.cambiarEstadoProfesor(profesorId, activo, deps);
}

/** `listar_profesores` (ADM-03), con el enlace de cada profesor (`origen + base + #/p/<slug>`). */
export function leerProfesores(
  deps: admin.DependenciasAdmin = dependenciasAdmin(),
  armarEnlace: admin.ArmarEnlace = (slug) => enlaceDeProfesor(slug),
): Promise<ProfesorLista[]> {
  return admin.leerProfesores(deps, armarEnlace);
}

const LECTOR_REAL: hooks.LectorProfesores = () => leerProfesores();
const ALTA_REAL: hooks.AccionAlta = (datos) => altaProfesor(datos);
const ESTADO_REAL: hooks.AccionEstado = (profesorId, activo) => cambiarEstadoProfesor(profesorId, activo);

/** Lista de profesores (ADM-03); `recargar()` después de un alta o de un cambio de estado. */
export function useProfesores(): { datos: hooks.EstadoProfesores; recargar: () => void } {
  return hooks.useProfesores(LECTOR_REAL);
}

/** Alta de un profesor (ADM-02). */
export function useAltaProfesor(): ReturnType<typeof hooks.useAltaProfesor> {
  return hooks.useAltaProfesor(ALTA_REAL);
}

/** Inactivar o reactivar un profesor (ADM-05). */
export function useCambiarEstadoProfesor(): ReturnType<typeof hooks.useCambiarEstadoProfesor> {
  return hooks.useCambiarEstadoProfesor(ESTADO_REAL);
}
