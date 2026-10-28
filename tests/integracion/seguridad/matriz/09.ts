// Matriz rol x RPC de B09 (SEC-06, SEC-09; contratos.md §3). Las cinco RPC son [P]: las ejecuta `authenticated` y el rol se comprueba adentro.
// Con ids inexistentes y argumentos válidos el orden de validación deja que el resultado distinga a cada rol:
//   - anon: sin permiso (401/403). La persona en cualquier estado y el Administrador que no es profesor: 403.
//   - `crear_clase` con una persona inexistente: los dos profesores 403 (no revela si existe; CA-52).
//   - `mover_clase` y `cancelar_clase` con una clase inexistente: los dos profesores 404 (CA-52, CA-55).
//   - `agenda_profesor` y `contadores`: los dos profesores 200 (cada uno ve solo lo suyo: gestion/panel.test.ts).
// Cobertura: CA-52, CA-55, SEC-06, SEC-09, PRF-07.
import { error, ok, paraTodos, type FilaRpc } from '../../../soporte/matriz';

const sinPermiso = error(401, 403);
const INEXISTENTE = '00000000-0000-0000-0000-00000000dead';
const HOY = new Date().toISOString().slice(0, 10); // dentro de hoy ± 366 días del huso de cualquier profesor
const EN_UNA_SEMANA = new Date(Date.now() + 7 * 86_400_000).toISOString();

export const filas: FilaRpc[] = [
  {
    rpc: 'agenda_profesor',
    args: { p_dia: HOY },
    origen: 'contratos §3, CA-28, CA-52, SEC-06, SEC-09',
    esperado: paraTodos(error(403), { anon: sinPermiso, profesor: ok(), profesorB: ok() }),
  },
  {
    rpc: 'contadores',
    args: {},
    origen: 'contratos §3, CA-21, CA-55, SEC-06',
    esperado: paraTodos(error(403), { anon: sinPermiso, profesor: ok(), profesorB: ok() }),
  },
  {
    rpc: 'crear_clase',
    args: { p_alumno_id: INEXISTENTE, p_inicio: EN_UNA_SEMANA, p_tipo: 'suelta' },
    origen: 'contratos §3, CA-27, CA-52, PRF-01, PRF-07, SEC-06, SEC-09',
    esperado: paraTodos(error(403), { anon: sinPermiso }),
  },
  {
    rpc: 'mover_clase',
    args: { p_clase_id: INEXISTENTE, p_destino: EN_UNA_SEMANA, p_alcance: 'solo_esta' },
    origen: 'contratos §3, CA-27, CA-52, PRF-03, SEC-06, SEC-09',
    esperado: paraTodos(error(403), { anon: sinPermiso, profesor: error(404), profesorB: error(404) }),
  },
  {
    rpc: 'cancelar_clase',
    args: { p_clase_id: INEXISTENTE, p_alcance: 'solo_esta' },
    origen: 'contratos §3, CA-27, CA-52, PRF-03, SEC-06, SEC-09',
    esperado: paraTodos(error(403), { anon: sinPermiso, profesor: error(404), profesorB: error(404) }),
  },
];
