// Qué hace tocar un hueco libre según la relación de quien mira con el profesor de la agenda (WEB-01, CA-46,
// DEC-28). Es la misma tabla que `accionAlTocarHueco` de `solicitud/logica`: la agenda no importa de otro módulo
// (componentes.md §5), así que la decide con `src/estado`. Solo el hueco libre llega acá (ocupado y bloqueado
// nunca son interactivos).
import { puedeSolicitarA, type RelacionConProfesor } from '../../../estado';

/**
 * - `invitar_ingreso`: visitante sin sesión; aviso con acceso a `#/ingreso`, sin RPC ni datos (CA-46).
 * - `formulario`: vínculo aprobado con ESE profesor activo; abre el formulario de solicitud (WEB-04).
 * - `ver_aviso`: ficha incompleta, vínculo pendiente o rechazado, o sin vínculo; lleva al aviso de estado de WEB-01.
 * - `ninguna`: el hueco no es interactivo.
 */
export type AccionDeHueco = 'ninguna' | 'invitar_ingreso' | 'formulario' | 'ver_aviso';

export type OpcionesAccion = {
  /** La ruta compuso el formulario de solicitud (si no, un alumno aprobado no tiene a dónde ir). */
  hayFormulario: boolean;
  /** La ruta compuso «Pedir acceso». */
  hayPedirAcceso: boolean;
};

export function accionDeHueco(relacion: RelacionConProfesor, { hayFormulario, hayPedirAcceso }: OpcionesAccion): AccionDeHueco {
  switch (relacion.tipo) {
    case 'visitante':
      return 'invitar_ingreso';
    case 'ficha_incompleta':
      return 'ver_aviso';
    case 'sin_vinculo':
      return hayPedirAcceso ? 'ver_aviso' : 'ninguna';
    case 'vinculo':
      if (puedeSolicitarA(relacion)) return hayFormulario ? 'formulario' : 'ninguna';
      return relacion.inscripcion.estado === 'pendiente' || relacion.inscripcion.estado === 'rechazado'
        ? 'ver_aviso'
        : 'ninguna';
    default:
      return 'ninguna';
  }
}
