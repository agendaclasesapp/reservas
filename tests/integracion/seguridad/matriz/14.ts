// Matriz rol x RPC de B14 (SEC-04, SEC-06; contratos.md §3, ADR-020): la RPC nueva de la fila es `pedir_inscripcion`;
// `config_publica(p_slug)` y `agenda_publica(p_slug, p_dia)` son sobrecargas de las de B01 y B02 y tienen su fila en
// 01.ts y 02.ts (las versiones sin slug son de transición y las cubre agenda/agenda-publica.test.ts). `completar_ficha`
// cambió de firma y su fila está en 04.ts. Las tablas y vistas con dos profesores y el Administrador se prueban en
// tests/integracion/multiprofesor/tablas-vistas.test.ts.
//
// La llamada lleva un `p_como_llego` vacío: la RPC evalúa el rol, la ficha, el profesor y la inscripción existente antes
// que el campo, así que el resultado distingue a cada rol y a cada vínculo sin escribir nada:
//   anon sin permiso; profesores y Administrador 403 (DEC-31); ficha incompleta 403 FICHA_INCOMPLETA;
//   con inscripción vigente con A (pendiente, rechazada o aprobada, incluida la de `dosVinculos`) 409 CUENTA_NO_PENDIENTE
//   («pedir» solo sirve a quien no tiene vínculo o lo dio de baja);
//   alumnoB (aprobada solo con B) llega a validar el campo: 422.
// Cobertura: CA-51, CA-62, SEC-06, SEC-09.
import { error, paraTodos, type FilaRpc } from '../../../soporte/matriz';
import { SLUG_A } from '../../../soporte/usuarios';

const sinPermiso = error(401, 403);

export const filas: FilaRpc[] = [
  {
    rpc: 'pedir_inscripcion',
    args: { p_slug: SLUG_A, p_como_llego: '' },
    origen: 'contratos §3, ADR-020, CA-51, CA-62, SEC-06, SEC-09',
    esperado: paraTodos(error(409), {
      anon: sinPermiso,
      ficha_incompleta: error(403),
      alumnoB: error(422),
      profesor: error(403),
      profesorB: error(403),
      administrador: error(403),
    }),
  },
];
