// API de la lógica de la ficha para las vistas (T04.2, T14.4) y las pruebas.
// ALU-02 (ficha obligatoria), ALU-03 (estado por profesor), ALU-06 (personas a cargo), ALU-13 (tope de
// fichas), ALU-14 (vínculo al completar o al pedir acceso), WEB-03, SEC-09.
//
// Uso típico en la vista:
//   const origen = useProfesorDeOrigen();                      // 'listo' → preguntar «cómo llegaste a {nombre}»
//   const esquema = crearEsquemaFicha(hoy, origen.estado === 'listo');
//   const r = await completarFicha(valores, origen.estado === 'listo' ? origen.slug : null);
//   const r = await pedirInscripcion(slug, { como_llego });  // «Pedir acceso» en #/p/<slug>
//   const vinculos = vinculosDeFicha(sesion);                // estado y motivo con cada profesor
//   const r = await guardarPersonaACargo({ id: null, nombre, fecha_nacimiento });
//   const { estado, recargar } = usePersonasACargo(sesion.alumno_id);
import { olvidarProfesorOrigen } from '../../../estado/profesor';
import { refrescarSesion } from '../../../estado/sesion-actual';
import { cargarSupabase } from '../../../lib/supabase';
import * as ficha from './ficha';
import { usePersonasACargo as usePersonasConDeps, type EstadoPersonas } from './usePersonasACargo';
import type { FichaEntrada, MiFicha, PedirAccesoEntrada, PersonaACargo, PersonaEntrada } from './tipos';

export {
  CAMPOS_FICHA,
  crearEsquemaFicha,
  crearEsquemaPedirAcceso,
  crearEsquemaPersona,
  DIGITOS_MAX_TELEFONO,
  DIGITOS_MIN_TELEFONO,
  FECHA_NACIMIENTO_MINIMA,
  LARGO_MAX_COMO_LLEGO,
  LARGO_MAX_NOMBRE,
  LARGO_MAX_TELEFONO,
  MENSAJES_FICHA,
  telefonoValido,
} from './tipos';
export type {
  CampoFicha,
  FichaEntrada,
  MiFicha,
  PedirAccesoEntrada,
  PersonaACargo,
  PersonaEntrada,
  VinculoFicha,
} from './tipos';
export { FICHA_YA_COMPLETA, valoresInicialesFicha, vinculosDeFicha } from './ficha';
export type {
  DependenciasFicha,
  FalloFicha,
  InscripcionNueva,
  ResultadoFicha,
  ResultadoPedido,
  ResultadoPersona,
} from './ficha';
export type { EstadoPersonas } from './usePersonasACargo';
export { resolverProfesorDeOrigen, useProfesorDeOrigen } from './origen';
export type { ProfesorDeOrigen } from './origen';

const obtenerCliente = () => cargarSupabase();

/** Dependencias reales: supabase-js cargado con import() (ADR-017), el refresco de la sesión y el origen. */
export function dependenciasFicha(): ficha.DependenciasFicha {
  return { obtenerCliente, alCompletar: () => refrescarSesion(), olvidarOrigen: olvidarProfesorOrigen };
}

/**
 * `completar_ficha` (ALU-02, ALU-13, ALU-14). `origen`: slug del profesor de origen activo
 * (`useProfesorDeOrigen`), o `null` para completar sin vínculo.
 */
export function completarFicha(
  datos: FichaEntrada,
  origen: string | null = null,
  deps: ficha.DependenciasFicha = dependenciasFicha(),
): Promise<ficha.ResultadoFicha> {
  return ficha.completarFicha(datos, origen, deps);
}

/** `pedir_inscripcion` (ALU-14, DEC-33): «Pedir acceso» al profesor del slug con la ficha completa. */
export function pedirInscripcion(
  slug: string,
  entrada: PedirAccesoEntrada,
  deps: Pick<ficha.DependenciasFicha, 'obtenerCliente' | 'alCompletar'> = dependenciasFicha(),
): Promise<ficha.ResultadoPedido> {
  return ficha.pedirInscripcion(slug, entrada, deps);
}

/** `guardar_persona_a_cargo` (ALU-06): `id: null` da de alta; con id, edita. */
export function guardarPersonaACargo(
  persona: PersonaEntrada,
  deps: Pick<ficha.DependenciasFicha, 'obtenerCliente'> = dependenciasFicha(),
): Promise<ficha.ResultadoPersona> {
  return ficha.guardarPersonaACargo(persona, deps);
}

export function leerPersonasACargo(
  alumnoId: string,
  deps: Pick<ficha.DependenciasFicha, 'obtenerCliente'> = dependenciasFicha(),
): Promise<PersonaACargo[]> {
  return ficha.leerPersonasACargo(alumnoId, deps);
}

export function leerMiFicha(
  alumnoId: string,
  deps: Pick<ficha.DependenciasFicha, 'obtenerCliente'> = dependenciasFicha(),
): Promise<MiFicha | null> {
  return ficha.leerMiFicha(alumnoId, deps);
}

const DEPS_HOOK = { obtenerCliente };

/** Personas a cargo del alumno de la sesión; `recargar()` después de guardar. */
export function usePersonasACargo(alumnoId: string | null): { estado: EstadoPersonas; recargar: () => void } {
  return usePersonasConDeps(alumnoId, DEPS_HOOK);
}
