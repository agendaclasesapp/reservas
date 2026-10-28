// Matriz rol x RPC de B10 (SEC-06, SEC-09; contratos.md §3). `bloquear` y `desbloquear` son [P]: las ejecuta `authenticated` y el rol se
// comprueba adentro. Las filas no escriben nada: con `p_hasta` igual a `p_desde` el profesor recibe 422 y con un id inexistente 404,
// así que el resultado distingue a cada rol sin dejar bloqueos (el camino feliz y el 409 están en configuracion/configuracion.test.ts):
//   - anon: sin permiso (401/403). La persona en cualquier estado y el Administrador que no es profesor: 403.
//   - `bloquear` con `p_hasta` = `p_desde`: los dos profesores 422 (`p_hasta`; SEC-09).
//   - `desbloquear` con un bloqueo inexistente: los dos profesores 404 (CA-52; es el mismo 404 que da uno ajeno).
// Cobertura: CA-14, CA-52, CA-54, SEC-06, SEC-09, AGE-05, AGE-06.
import { error, paraTodos, type FilaRpc } from '../../../soporte/matriz';

const sinPermiso = error(401, 403);
const INEXISTENTE = '00000000-0000-0000-0000-00000000dead';
const MANANA = new Date(Date.now() + 86_400_000).toISOString();

export const filas: FilaRpc[] = [
  {
    rpc: 'bloquear',
    args: { p_desde: MANANA, p_hasta: MANANA, p_motivo: null },
    origen: 'contratos §3, AGE-05, CA-14, SEC-06, SEC-09',
    esperado: paraTodos(error(403), { anon: sinPermiso, profesor: error(422), profesorB: error(422) }),
  },
  {
    rpc: 'desbloquear',
    args: { p_bloqueo_id: INEXISTENTE },
    origen: 'contratos §3, AGE-06, CA-14, CA-52, SEC-06',
    esperado: paraTodos(error(403), { anon: sinPermiso, profesor: error(404), profesorB: error(404) }),
  },
];
