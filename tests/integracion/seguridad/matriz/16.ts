// Matriz rol x RPC de B16 (SEC-04, SEC-06, SEC-34; contratos.md §2 de calendario-profesor): `agenda_profesor_dias(p_desde, p_hasta)` [P].
// La ejecuta `authenticated` y el rol se comprueba adentro: anon sin permiso (401/403 de PostgREST); la persona en cualquier estado y el
// Administrador que no es profesor reciben 403; los dos profesores leen su agenda (200) y cada uno ve solo lo suyo
// (agenda-dias.test.ts, INV-02, CA-85). La respuesta trae exactamente las 17 columnas del contrato (SEC-34).
// Cobertura: INV-02, CA-85, SEC-04, SEC-06, SEC-34.
import { error, ok, paraTodos, type FilaRpc } from '../../../soporte/matriz';

const sinPermiso = error(401, 403);
const HOY = new Date().toISOString().slice(0, 10); // dentro de hoy ± 366 días del huso de cualquier profesor
const COLUMNAS =
  'bloqueo_id,bloqueo_motivo,clase_estado,clase_fin,clase_id,clase_inicio,dia,estado,fin,inicio,observacion,pasada,quien_toma,reserva_tipo,solicitud_id,solicitud_tipo,titular';

const lectura = ok((cuerpo) => {
  if (!Array.isArray(cuerpo)) throw new Error('agenda_profesor_dias no devolvió una lista');
  for (const f of cuerpo as Record<string, unknown>[]) {
    if (Object.keys(f).sort().join(',') !== COLUMNAS) throw new Error(`columnas inesperadas: ${Object.keys(f)}`);
  }
});

export const filas: FilaRpc[] = [
  {
    rpc: 'agenda_profesor_dias',
    args: { p_desde: HOY, p_hasta: HOY },
    origen: 'contratos §2, CAL-07, INV-02, CA-85, SEC-06, SEC-34',
    esperado: paraTodos(error(403), { anon: sinPermiso, profesor: lectura, profesorB: lectura }),
  },
];
