// Matriz rol x RPC de B04 (SEC-04, SEC-06; contratos.md §3): `sesion_actual`, `completar_ficha` y
// `guardar_persona_a_cargo` son [U] (cualquier sesión), anon no tiene permiso de ejecución (401 o 403). Para no
// cambiar el estado de las sesiones compartidas, las escrituras se llaman con un dato inválido: la RPC valida el
// rol y el estado antes de los campos, así que el resultado distingue a cada rol sin escribir nada.
//   completar_ficha: ficha_incompleta → 422 (nombre vacío); pendiente, rechazado, aprobado → 409; profesor → 403.
//   guardar_persona_a_cargo: ficha_incompleta → 403 (FICHA_INCOMPLETA); el resto de alumnos → 422; profesor → 403.
// Cobertura: CA-02, CA-05 rama ALU-06, SEC-06, SEC-14, SEC-15.
import { expect } from 'vitest';
import { error, ok, paraTodos, type FilaRpc } from '../../../soporte/matriz';

const sinPermiso = error(401, 403);

export const filas: FilaRpc[] = [
  {
    rpc: 'sesion_actual',
    origen: 'contratos §3, ALU-02, WEB-03, SEC-06',
    esperado: paraTodos(
      ok((c) => {
        const o = c as Record<string, unknown>;
        expect(Object.keys(o).sort()).toEqual(['alumno_id', 'estado', 'mail', 'motivo_rechazo', 'nombre', 'rol']);
        if (o.estado !== 'rechazado') expect(o.motivo_rechazo).toBeNull();
      }),
      { anon: sinPermiso },
    ),
  },
  {
    rpc: 'completar_ficha',
    args: { p_nombre: '', p_telefono: '+598 99123456', p_fecha_nacimiento: '2000-01-01', p_como_llego: 'Amigos' },
    origen: 'contratos §3, CA-02, ALU-02, ALU-13, SEC-06, SEC-09',
    esperado: paraTodos(error(409), {
      anon: sinPermiso,
      ficha_incompleta: error(422),
      profesor: error(403),
    }),
  },
  {
    rpc: 'guardar_persona_a_cargo',
    args: { p_id: null, p_nombre: '', p_fecha_nacimiento: '2015-05-05' },
    origen: 'contratos §3, CA-05 (ALU-06), SEC-06, SEC-09, SEC-29',
    esperado: paraTodos(error(422), {
      anon: sinPermiso,
      ficha_incompleta: error(403),
      profesor: error(403),
    }),
  },
];
