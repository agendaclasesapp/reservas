// API de la lógica de la ficha para las vistas (T04.2) y las pruebas (T04.4).
// ALU-02 (ficha obligatoria), ALU-06 (personas a cargo), ALU-13 (tope de fichas), WEB-03, SEC-09.
//
// Uso típico en la vista:
//   const esquema = crearEsquemaFicha(hoyEn(config.zona_horaria));       // react-hook-form + zod
//   const r = await completarFicha(valores);   // ok → la guarda suelta /ficha; LIMITE_EXCEDIDO → r.mensaje
//   const r = await guardarPersonaACargo({ id: null, nombre, fecha_nacimiento });
//   const { estado, recargar } = usePersonasACargo(sesion.alumno_id);
import { cargarSupabase } from '../../../lib/supabase';
import { refrescarSesion } from '../../../estado/sesion-actual';
import * as ficha from './ficha';
import { usePersonasACargo as usePersonasConDeps, type EstadoPersonas } from './usePersonasACargo';
import type { FichaEntrada, MiFicha, PersonaACargo, PersonaEntrada } from './tipos';

export {
  CAMPOS_FICHA,
  crearEsquemaFicha,
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
export type { CampoFicha, FichaEntrada, MiFicha, PersonaACargo, PersonaEntrada } from './tipos';
export { FICHA_YA_COMPLETA, valoresInicialesFicha } from './ficha';
export type { DependenciasFicha, FalloFicha, ResultadoFicha, ResultadoPersona } from './ficha';
export type { EstadoPersonas } from './usePersonasACargo';

const obtenerCliente = () => cargarSupabase();

/** Dependencias reales: supabase-js cargado con import() (ADR-017) y el refresco de la sesión. */
export function dependenciasFicha(): ficha.DependenciasFicha {
  return { obtenerCliente, alCompletar: () => refrescarSesion() };
}

/** `completar_ficha` (ALU-02, ALU-13). */
export function completarFicha(
  datos: FichaEntrada,
  deps: ficha.DependenciasFicha = dependenciasFicha(),
): Promise<ficha.ResultadoFicha> {
  return ficha.completarFicha(datos, deps);
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
