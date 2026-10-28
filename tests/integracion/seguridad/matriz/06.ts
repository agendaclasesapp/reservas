// Matriz rol x RPC de B06 (SEC-04, SEC-06; contratos.md §3): `solicitar_reserva` [U] y `previsualizar_serie` [U,P].
// Las llamadas no escriben nada: el orden de validación de cada RPC deja que el resultado distinga a cada rol y a cada vínculo
// con un dato inválido que se evalúa después de ellos.
//   solicitar_reserva(A, …, p_tipo 'otra'): rol → ficha → inscripción aprobada con A → campos.
//     anon sin permiso; profesores y Administrador 403; ficha incompleta 403 FICHA_INCOMPLETA; pendiente, rechazado y alumnoB
//     (solo de B) 403 CUENTA_NO_APROBADA; alumno y dosVinculos (aprobados con A) llegan a validar el campo: 422 (CA-03, CA-51, CA-52).
//   previsualizar_serie(A, …, p_frecuencia 3): persona o profesor (la frecuencia se valida antes que la grilla): 422; Administrador 403.
// Cobertura: CA-03, CA-51, CA-52, SEC-04, SEC-06, SEC-09, SOL-09.
import { error, paraTodos, type FilaRpc } from '../../../soporte/matriz';
import { profesorId, SLUG_A } from '../../../soporte/usuarios';

const sinPermiso = error(401, 403);
const A = await profesorId(SLUG_A);
const INICIO = '2026-12-01T12:00:00Z';

export const filas: FilaRpc[] = [
  {
    rpc: 'solicitar_reserva',
    args: { p_profesor_id: A, p_inicio: INICIO, p_tipo: 'otra' },
    origen: 'contratos §3, CA-03, CA-51, CA-52, SOL-09, SEC-06, SEC-09',
    esperado: paraTodos(error(403), {
      anon: sinPermiso,
      alumno: error(422),
      dosVinculos: error(422),
    }),
  },
  {
    rpc: 'previsualizar_serie',
    args: { p_profesor_id: A, p_inicio: INICIO, p_frecuencia: 3 },
    origen: 'contratos §3, RES-05, SEC-06, SEC-09',
    esperado: paraTodos(error(422), { anon: sinPermiso, administrador: error(403) }),
  },
];
