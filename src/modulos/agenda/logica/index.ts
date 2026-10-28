// API pública de la lógica de agenda (B02, T02.1; B14, T14.3). Las vistas importan solo desde acá.
//
//   useConfigPublica(slug | null, obtener?)  -> { estado, config, error, enlaceNoValido, recargar }
//                                               (ADR-004: una lectura por slug; config activa o inactiva)
//   useAgendaDia(slug, dia, obtener?)        -> { estado, huecos, error, recargar }   (AGE-07, ADR-017)
//   limitesAgenda(configActiva, ahora?)      -> { hoy, min, max }                     (SEC-09, días válidos)
//   diaEnLimites(dia, limites)               -> boolean
//   obtenerAgendaPublica(slug, dia, cliente?) -> Promise<Hueco[]>  (rpc agenda_publica por postgrest-js)
//   obtenerConfigPublica(slug, cliente?)     -> Promise<ConfigPublica>
//   precargarAgendaPublica(slug, diaPedido, opciones?) -> void  (NFR-04: config y día a la vez, sin esperarse)
//   precargarDesdeHash(location.hash)        -> void  (lo llama src/main.tsx si la dirección es `#/p/<slug>`)
//   MENSAJE_ENLACE_NO_VALIDO                 -> texto de AGE-09 para un slug que no es de ningún profesor
//
// Los instantes llegan en UTC; se muestran con formatearHora(instante, config.zona_horaria) de src/lib/fechas.
export type {
  AgendaDia,
  ConfigPublica,
  ConfigPublicaActiva,
  ConfigPublicaCargada,
  ConfigPublicaInactiva,
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
  MENSAJE_ENLACE_NO_VALIDO,
  diaEnLimites,
  limitesAgenda,
  leerConfigPublica,
  leerHuecos,
  obtenerAgendaPublica,
  obtenerConfigPublica,
} from './api';
export {
  VIGENCIA_PRECARGA_MS,
  diaSupuesto,
  precargarAgendaPublica,
  precargarDesdeHash,
  reiniciarPrecargaAgenda,
  tomarPrecargaAgenda,
  type OpcionesPrecarga,
} from './precarga';
export { useAgendaDia } from './useAgendaDia';
export { reiniciarConfigPublica, useConfigPublica } from './useConfigPublica';
