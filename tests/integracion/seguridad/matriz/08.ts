// Matriz rol x RPC de B08 (SEC-04, SEC-06; contratos.md §3): `solicitar_movimiento` [U] y `solicitar_cancelacion` [U].
// Las llamadas no escriben nada: con una clase inexistente y argumentos válidos, el orden de validación (rol → ficha → clase) deja que
// el resultado distinga a cada rol:
//   anon sin permiso (401/403); profesores y Administrador 403 PROHIBIDO; ficha incompleta 403 FICHA_INCOMPLETA;
//   toda persona con ficha (pendiente, rechazada, aprobada con A o con B) llega a buscar la clase y recibe 404 (no revela si existe).
// Con dos profesores: la profesora B recibe lo mismo que A (403); lo que depende de la pertenencia de una clase real (SOL-09, 403 si es
// de otra persona; CUENTA_NO_APROBADA; PROFESOR_INACTIVO) lo cubre tests/integracion/movimientos/movimientos.test.ts.
// Cobertura: SEC-04, SEC-06, SOL-09.
import { error, paraTodos, type FilaRpc } from '../../../soporte/matriz';

const sinPermiso = error(401, 403);
const CLASE_INEXISTENTE = '00000000-0000-0000-0000-00000000dead';
const base = { anon: sinPermiso, ficha_incompleta: error(403), profesor: error(403), profesorB: error(403), administrador: error(403) };

export const filas: FilaRpc[] = [
  {
    rpc: 'solicitar_movimiento',
    args: { p_clase_id: CLASE_INEXISTENTE, p_destino: '2026-12-01T12:00:00Z', p_alcance: 'solo_esta' },
    origen: 'contratos §3, SOL-02, SOL-09, SEC-04, SEC-06',
    esperado: paraTodos(error(404), base),
  },
  {
    rpc: 'solicitar_cancelacion',
    args: { p_clase_id: CLASE_INEXISTENTE, p_alcance: 'solo_esta' },
    origen: 'contratos §3, SOL-02, SOL-09, SEC-04, SEC-06',
    esperado: paraTodos(error(404), base),
  },
];
