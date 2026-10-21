// API pública de la lógica de agenda (B02, T02.1). Las vistas (T02.2) importan solo desde acá.
//
//   useConfigPublica(obtener?)            -> { estado, config, error, recargar }   (ADR-004: una lectura)
//   useAgendaDia(dia, obtener?)           -> { estado, huecos, error, recargar }   (AGE-07, ADR-017)
//   limitesAgenda(config, ahora?)         -> { hoy, min, max }                     (SEC-09, días válidos)
//   diaEnLimites(dia, limites)            -> boolean
//   obtenerAgendaPublica(dia, cliente?)   -> Promise<Hueco[]>     (rpc agenda_publica por postgrest-js)
//   obtenerConfigPublica(cliente?)        -> Promise<ConfigPublica>
//
// Los instantes llegan en UTC; se muestran con formatearHora(instante, config.zona_horaria) de src/lib/fechas.
export type {
  AgendaDia,
  ConfigPublica,
  ConfigPublicaCargada,
  EstadoCarga,
  EstadoHueco,
  Hueco,
  LimitesAgenda,
  ObtenerAgenda,
  ObtenerConfig,
} from './tipos';
export { ESTADOS_HUECO } from './tipos';
export {
  ErrorRespuestaInvalida,
  diaEnLimites,
  limitesAgenda,
  leerConfigPublica,
  leerHuecos,
  obtenerAgendaPublica,
  obtenerConfigPublica,
} from './api';
export { useAgendaDia } from './useAgendaDia';
export { reiniciarConfigPublica, useConfigPublica } from './useConfigPublica';
