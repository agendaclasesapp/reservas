// API pública de la lógica de inicio (B14 · T14.3): página principal sin enlace (WEB-09) y selector de
// profesor (WEB-11). Las vistas (T14.4) importan solo desde acá.
//
//   useInicio()                     -> { tipo: 'cargando' | 'mensaje' (conIngreso) | 'redirigir' (a) | 'selector' (opciones) }
//   useSelectorProfesor()           -> { visible, opciones: OpcionProfesor[], elegir(slug) }
//   rutaAgendaDePersona(sesion, elegido) -> ruta del enlace «Agenda» de la persona
//   MENSAJE_INICIO                  -> «Pedile el enlace a tu profesor»
export {
  decidirInicio,
  MENSAJE_INICIO,
  mostrarSelector,
  opcionesSelector,
  rutaAgendaDePersona,
  type DecisionInicio,
  type OpcionProfesor,
} from './inicio';
export { useInicio, useSelectorProfesor, type SelectorProfesor } from './hooks';
