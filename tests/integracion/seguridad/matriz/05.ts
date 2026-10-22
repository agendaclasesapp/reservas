// Matriz rol x RPC de B05 (SEC-04, SEC-06; contratos.md §3): las siete RPC son [P] (solo el profesor), anon no tiene
// permiso de ejecución (401 o 403) y cualquier alumno, sea cual sea su estado, recibe 403. Para no cambiar nada en las
// sesiones compartidas el profesor las llama con un id inexistente (404) o con un dato inválido (422): el rol se valida antes
// que los campos y que la búsqueda, así que el resultado distingue a cada rol sin escribir.
// Cobertura: CA-04, CA-06, ALU-03, ALU-04, ALU-05, ALU-07, ALU-08, SEC-06, SEC-09.
import { error, paraTodos, type FilaRpc } from '../../../soporte/matriz';

const sinPermiso = error(401, 403);
const INEXISTENTE = '00000000-0000-0000-0000-00000000dead';

const soloProfesor = (alProfesor: number[]) => paraTodos(error(403), { anon: sinPermiso, profesor: error(...alProfesor) });

export const filas: FilaRpc[] = [
  { rpc: 'aprobar_cuenta', args: { p_alumno_id: INEXISTENTE }, origen: 'contratos §3, ALU-03, SEC-06', esperado: soloProfesor([404]) },
  { rpc: 'rechazar_cuenta', args: { p_alumno_id: INEXISTENTE }, origen: 'contratos §3, ALU-03, SEC-06', esperado: soloProfesor([404]) },
  { rpc: 'sugerencias_union', args: { p_alumno_id: INEXISTENTE }, origen: 'contratos §3, ALU-04, SEC-06', esperado: soloProfesor([404]) },
  {
    rpc: 'unir_alumnos',
    args: { p_cuenta_id: INEXISTENTE, p_sin_cuenta_id: INEXISTENTE },
    origen: 'contratos §3, ALU-05, CA-04, SEC-06',
    esperado: soloProfesor([404]),
  },
  {
    rpc: 'descartar_union',
    args: { p_cuenta_id: INEXISTENTE, p_sin_cuenta_id: INEXISTENTE },
    origen: 'contratos §3, ALU-04, CA-04, SEC-06',
    esperado: soloProfesor([404]),
  },
  {
    rpc: 'alta_alumno',
    args: { p_nombre: '', p_telefono: '+598 99123456', p_fecha_nacimiento: '2000-01-01', p_mail: null },
    origen: 'contratos §3, ALU-07, ALU-08, CA-06, SEC-06, SEC-09',
    esperado: soloProfesor([422]),
  },
  {
    rpc: 'editar_alumno',
    args: { p_alumno_id: INEXISTENTE, p_nombre: 'X', p_telefono: '+598 99123456', p_fecha_nacimiento: '2000-01-01', p_mail: null },
    origen: 'contratos §3, ALU-07, ALU-08, SEC-06',
    esperado: soloProfesor([404]),
  },
];
