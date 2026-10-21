// Matriz rol x RPC de B02 (SEC-04, SEC-06; contratos.md §3). `agenda_publica` es [A]: la ejecutan todos los roles y
// devuelve solo inicio, fin y estado (SEC-07). `guardar_configuracion` y `guardar_grilla` son [P]: un alumno recibe 403
// y anon no tiene permiso de ejecución (PostgREST responde 401 con 42501; se acepta 401 o 403). Las llamadas del
// profesor repiten los valores iniciales (AGE-01, 60 min, 24 h, Montevideo) para no alterar la configuración.
import { expect } from 'vitest';
import { error, ok, paraTodos, type FilaRpc } from '../../../soporte/matriz';

const hoy = new Date().toISOString().slice(0, 10);

const TRAMOS_INICIALES = [1, 2, 3, 4, 5].flatMap((d) => [
  { dia_semana: d, desde: '08:00', hasta: '13:00' },
  { dia_semana: d, desde: '14:00', hasta: '18:00' },
]);

const prohibido = error(403);
const sinPermiso = error(401, 403);

export const filas: FilaRpc[] = [
  {
    rpc: 'agenda_publica',
    args: { p_dia: hoy },
    origen: 'contratos §3, CA-15, SEC-07',
    esperado: paraTodos(
      ok((c) => {
        expect(Array.isArray(c)).toBe(true);
        for (const h of c as Record<string, unknown>[]) expect(Object.keys(h).sort()).toEqual(['estado', 'fin', 'inicio']);
      }),
    ),
  },
  {
    rpc: 'guardar_configuracion',
    args: { p_duracion_min: 60, p_anticipacion_horas: 24, p_zona_horaria: 'America/Montevideo' },
    origen: 'contratos §3, AGE-02, AGE-04, AGE-08, SEC-06',
    esperado: paraTodos(prohibido, {
      anon: sinPermiso,
      profesor: ok((c) => {
        const o = c as Record<string, unknown>;
        expect(o.zona_horaria).toBe('America/Montevideo');
        expect(o.duracion_min).toBe(60);
      }),
    }),
  },
  {
    rpc: 'guardar_grilla',
    args: { p_tramos: TRAMOS_INICIALES },
    origen: 'contratos §3, AGE-01, SEC-06, SEC-09',
    esperado: paraTodos(prohibido, {
      anon: sinPermiso,
      profesor: ok((c) => expect(c as unknown[]).toHaveLength(10)),
    }),
  },
];
