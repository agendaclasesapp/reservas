// Matriz rol x RPC y rol x vista de B07 (SEC-04, SEC-06, SEC-02; contratos.md §2 y §3).
//   `filas`: `responder_solicitud` [P]. Los argumentos no escriben nada: con un id inexistente y una decisión válida el orden de
//     validación (rol → decisión → solicitud suya) deja que el resultado distinga a cada rol: anon sin permiso; la persona en
//     cualquier estado y el Administrador que no es profesor 403; los dos profesores 404 (no revelan si existe; CA-55).
//   `vistas`: lo que cada rol ve en `v_mis_clases` (solo personas), `v_clases` y `v_solicitudes_pendientes` (solo profesores) con las
//     sesiones compartidas y dos profesores (CA-53, CA-55, SEC-02): la matriz exige filas por cada vista nueva y la prueba
//     tests/integracion/respuestas/vistas.test.ts la recorre con datos sembrados (cada rol ve solo lo suyo).
// Cobertura: CA-53, CA-55, SEC-02, SEC-04, SEC-06, SEC-09, PRF-07, ALU-03.
import { error, paraTodos, type FilaRpc } from '../../../soporte/matriz';
import type { Rol } from '../../../soporte/usuarios';

const sinPermiso = error(401, 403);

export const filas: FilaRpc[] = [
  {
    rpc: 'responder_solicitud',
    args: { p_solicitud_id: '00000000-0000-0000-0000-00000000dead', p_decision: 'confirmar' },
    origen: 'contratos §3, CA-55, SOL-04, SEC-06, SEC-09',
    esperado: paraTodos(error(403), {
      anon: sinPermiso,
      profesor: error(404),
      profesorB: error(404),
    }),
  },
];

/** Rol → filas que ve en cada vista con la siembra de vistas.test.ts (sembrar: ver ese archivo). */
export type Vista = 'v_mis_clases' | 'v_clases' | 'v_solicitudes_pendientes';
export const VISTAS: Vista[] = ['v_mis_clases', 'v_clases', 'v_solicitudes_pendientes'];

/**
 * Siembra de vistas.test.ts: `alumno` (solo de A) tiene 1 clase confirmada y 1 solicitud pendiente con A; `dosVinculos` tiene 1 clase
 * confirmada con A (y es pendiente con B); `alumnoB` tiene 1 pendiente con B. Lo que cada rol debe ver:
 *   - personas: solo sus clases en v_mis_clases; nada en v_clases ni en v_solicitudes_pendientes.
 *   - profesor A: sus 3 clases (2 confirmadas, 1 pendiente) y su solicitud pendiente; nada en v_mis_clases.
 *   - profesora B: su clase pendiente y su solicitud; nada de A.
 *   - Administrador y anon: nada.
 */
export const VISTAS_ESPERADAS: Record<Rol, Record<Vista, number>> = {
  anon: { v_mis_clases: -1, v_clases: -1, v_solicitudes_pendientes: -1 }, // -1: sin permiso (401/403)
  ficha_incompleta: { v_mis_clases: 0, v_clases: 0, v_solicitudes_pendientes: 0 },
  pendiente: { v_mis_clases: 0, v_clases: 0, v_solicitudes_pendientes: 0 },
  rechazado: { v_mis_clases: 0, v_clases: 0, v_solicitudes_pendientes: 0 },
  alumno: { v_mis_clases: 2, v_clases: 0, v_solicitudes_pendientes: 0 },
  alumnoB: { v_mis_clases: 1, v_clases: 0, v_solicitudes_pendientes: 0 },
  dosVinculos: { v_mis_clases: 1, v_clases: 0, v_solicitudes_pendientes: 0 },
  profesor: { v_mis_clases: 0, v_clases: 3, v_solicitudes_pendientes: 1 },
  profesorB: { v_mis_clases: 0, v_clases: 1, v_solicitudes_pendientes: 1 },
  administrador: { v_mis_clases: 0, v_clases: 0, v_solicitudes_pendientes: 0 },
};
