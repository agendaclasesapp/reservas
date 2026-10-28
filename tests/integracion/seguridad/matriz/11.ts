// Matriz rol x RPC de B11 (SEC-04, SEC-06, SEC-27; contratos.md §3): `borrar_alumno` [P], el borrado de un alumno por su profesor (ALU-12).
// Con un id inexistente no escribe nada y el orden de validación (rol -> inscripción con quien llama) distingue a cada rol: anon sin permiso
// (401/403 de PostgREST); la persona en cualquier estado y el Administrador que no es profesor, 403 PROHIBIDO; los dos profesores, 404
// NO_ENCONTRADO (igual que el alumno de otro profesor: no revela si existe; el caso real con dos profesores está en
// tests/integracion/retencion/borrado.test.ts y en supabase/tests/11_retencion.test.sql).
// Cobertura: CA-10, CA-57, SEC-04, SEC-06, SEC-27, ALU-12.
import { error, paraTodos, type FilaRpc } from '../../../soporte/matriz';

const sinPermiso = error(401, 403);

export const filas: FilaRpc[] = [
  {
    rpc: 'borrar_alumno',
    args: { p_alumno_id: '00000000-0000-0000-0000-00000000dead' },
    origen: 'contratos §3, ALU-12, CA-10, CA-57, SEC-06',
    esperado: paraTodos({ error: [403], message: 'PROHIBIDO' }, {
      anon: sinPermiso,
      profesor: { error: [404], message: 'NO_ENCONTRADO' },
      profesorB: { error: [404], message: 'NO_ENCONTRADO' },
    }),
  },
];
