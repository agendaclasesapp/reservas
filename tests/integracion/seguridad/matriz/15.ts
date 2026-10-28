// Matriz rol x RPC de B15 (SEC-04, SEC-06, SEC-09; contratos.md §3, ADR-018): las tres RPC `[Adm]` del Administrador.
// Las ejecuta `authenticated` y el rol se comprueba adentro: anon sin permiso (401/403 de PostgREST); persona en cualquier
// estado, profesor A y profesor B reciben 403 PROHIBIDO (CA-49, CA-64); solo el Administrador pasa.
// Para que la matriz no escriba nada, las dos RPC de escritura se llaman con un campo inválido: el rol se evalúa antes
// que los campos (403 al resto) y el Administrador llega a la validación (422 `DATOS_INVALIDOS`, SEC-09).
// Cobertura: CA-49, CA-50, CA-64, SEC-04, SEC-06, SEC-09.
import { error, ok, paraTodos } from '../../../soporte/matriz';
import type { FilaRpc } from '../../../soporte/matriz';

const sinPermiso = error(401, 403);
const prohibido = { error: [403], message: 'PROHIBIDO' };

export const filas: FilaRpc[] = [
  {
    rpc: 'alta_profesor',
    args: { p_mail: 'matriz15@example.test', p_nombre: 'Matriz', p_slug: 'MAL_SLUG' },
    origen: 'contratos §3, ADM-02, CA-49, SEC-06, SEC-09',
    esperado: paraTodos(prohibido, { anon: sinPermiso, administrador: error(422) }),
  },
  {
    rpc: 'listar_profesores',
    args: {},
    origen: 'contratos §3, ADM-03, CA-50, SEC-06',
    esperado: paraTodos(prohibido, {
      anon: sinPermiso,
      administrador: ok((cuerpo) => {
        if (!Array.isArray(cuerpo)) throw new Error('listar_profesores no devolvió una lista');
        for (const f of cuerpo as Record<string, unknown>[]) {
          if (Object.keys(f).sort().join(',') !== 'activo,creado_en,mail,nombre,profesor_id,slug') throw new Error(`columnas inesperadas: ${Object.keys(f)}`);
        }
      }),
    }),
  },
  {
    rpc: 'cambiar_estado_profesor',
    args: { p_profesor_id: '00000000-0000-0000-0000-000000000015', p_activo: null },
    origen: 'contratos §3, ADM-05, CA-64, SEC-06, SEC-09',
    esperado: paraTodos(prohibido, { anon: sinPermiso, administrador: error(422) }),
  },
];
