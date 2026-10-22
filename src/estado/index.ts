// Sesión de la app (ADR-007): arranque, estado, guardas de ruta y cierre.
export { iniciarSesion, MENSAJE_RETORNO_GOOGLE, tomarErrorDeIngreso, validarSesionGuardada } from './sesion';
export type { DependenciasSesion, ValidadorDeSesion } from './sesion';
export { cerrarSesion, estadoSesion, refrescarSesion, suscribirSesion } from './sesion-actual';
export {
  accesoDe,
  decidirGuarda,
  destinoSinPermisos,
  motivoSinPermisos,
  rutaDeVuelta,
  RUTA_FICHA,
  RUTA_INGRESO,
  usuarioNavegacion,
} from './guardas';
export type { DecisionGuarda } from './guardas';
export { GuardaDeRuta, useGuardaDeRuta, useSesion } from './useSesion';
export type { GuardaDeRutaProps } from './useSesion';
export { ESTADOS_ALUMNO, leerSesionActual } from './tipos';
export type { ErrorAuth, EstadoAlumno, EstadoSesion, SesionActual } from './tipos';
