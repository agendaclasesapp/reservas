// Matriz rol x RPC de B01 (SEC-04, SEC-06; contratos.md §3). `ping` y `config_publica` son [A]; `app_ahora` es [U,P]
// y anon no la ejecuta (ADR-014: execute solo para authenticated).
import { expect } from 'vitest';
import { error, ok, paraTodos, type FilaRpc } from '../../../soporte/matriz';

export const filas: FilaRpc[] = [
  {
    rpc: 'ping',
    origen: 'contratos §3, CA-40, T-NFR-05',
    esperado: paraTodos(ok((c) => expect(typeof c === 'string' && !Number.isNaN(Date.parse(c as string))).toBe(true))),
  },
  {
    rpc: 'config_publica',
    origen: 'contratos §3, SEC-04',
    esperado: paraTodos(
      ok((c) => {
        const o = c as Record<string, unknown>;
        expect(Object.keys(o).sort()).toEqual(['anticipacion_horas', 'duracion_min', 'horizonte_semanas', 'zona_horaria']);
        expect(o.zona_horaria).toBe('America/Montevideo');
      }),
    ),
  },
  {
    rpc: 'app_ahora',
    origen: 'ADR-014, SEC-04',
    esperado: paraTodos(ok((c) => expect(Number.isNaN(Date.parse(c as string))).toBe(false)), { anon: error(401, 403) }),
  },
];
