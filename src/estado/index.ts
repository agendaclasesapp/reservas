// Sesión de la app (ADR-007, ADR-020): arranque, estado, profesor de la ruta, guardas de ruta y cierre.
export { iniciarSesion, MENSAJE_RETORNO_GOOGLE, tomarErrorDeIngreso, validarSesionGuardada } from './sesion';
export type { DependenciasSesion, ValidadorDeSesion } from './sesion';
export { cerrarSesion, estadoSesion, refrescarSesion, suscribirSesion } from './sesion-actual';
export {
  accesoDe,
  decidirGuarda,
  destinoInicio,
  destinoSinPermisos,
  MOTIVOS_SIN_PERMISOS,
  motivoSinPermisos,
  rutaDeVuelta,
  RUTA_ADMIN,
  RUTA_FICHA,
  RUTA_INGRESO,
  RUTA_INICIO,
  RUTA_PANEL,
  usuarioNavegacion,
} from './guardas';
export type { DecisionGuarda } from './guardas';
export {
  anotarVisitaDeProfesor,
  elegirProfesor,
  inscripcionCon,
  leerProfesorElegido,
  leerProfesorOrigen,
  normalizarSlug,
  olvidarProfesorElegido,
  olvidarProfesorOrigen,
  puedePedirAcceso,
  puedeSolicitarA,
  relacionConProfesor,
  rutaDeProfesor,
  slugDeRuta,
} from './profesor';
export type { RelacionConProfesor } from './profesor';
export {
  GuardaDeRuta,
  useAnotarVisitaDeProfesor,
  useGuardaDeRuta,
  useProfesorElegido,
  useProfesorOrigen,
  useSesion,
} from './useSesion';
export type { GuardaDeRutaProps } from './useSesion';
export { ESTADOS_INSCRIPCION, ESTADOS_PERSONA, leerSesionActual, ROLES_SESION } from './tipos';
export type {
  ErrorAuth,
  EstadoInscripcion,
  EstadoPersona,
  EstadoSesion,
  Inscripcion,
  ProfesorDeSesion,
  RolSesion,
  SesionActual,
} from './tipos';
