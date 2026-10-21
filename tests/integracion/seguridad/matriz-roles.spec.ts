// SEC-06 / SEC-04: matriz rol x RPC contra PostgREST local. Une matriz/*.ts (un fragmento por bolt) y exige que
// toda función de supabase/tests/lista_rpc/*.txt tenga fila: una RPC sin fila hace fallar la prueba.
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cerrar } from '../../soporte/bd';
import { RAIZ } from '../../soporte/entorno';
import type { Esperado, FilaRpc } from '../../soporte/matriz';
import { ROLES, rpc, sesionDe } from '../../soporte/usuarios';
// @ts-expect-error módulo .mjs sin tipos
import { leerLista } from '../../soporte/sincronizar-lista-rpc.mjs';

const modulos = import.meta.glob<{ filas: FilaRpc[] }>('./matriz/*.ts', { eager: true });
const filas = Object.entries(modulos).flatMap(([, m]) => m.filas);

beforeAll(async () => {
  for (const r of ROLES) await sesionDe(r);
}, 300_000);
afterAll(cerrar);

function comprobar(r: { status: number; cuerpo: unknown }, e: Esperado, etiqueta: string) {
  if ('ok' in e) {
    expect(r.status, `${etiqueta}: ${JSON.stringify(r.cuerpo)}`).toBeGreaterThanOrEqual(200);
    expect(r.status, `${etiqueta}: ${JSON.stringify(r.cuerpo)}`).toBeLessThan(300);
    e.forma?.(r.cuerpo);
  } else {
    expect(e.error, `${etiqueta}: estado ${r.status} ${JSON.stringify(r.cuerpo)}`).toContain(r.status);
    if (e.message) expect((r.cuerpo as { message?: string }).message).toBe(e.message);
  }
}

describe('SEC-06 cobertura de la matriz', () => {
  it('SEC-06_toda_funcion_de_lista_rpc_tiene_fila_en_la_matriz', () => {
    const lista = (leerLista(resolve(RAIZ, 'supabase/tests/lista_rpc')) as [string, string][]).map(([f]) => f);
    const conFila = new Set(filas.map((f) => f.rpc));
    expect(lista.filter((f) => !conFila.has(f)), 'RPC sin fila en tests/integracion/seguridad/matriz/BB.ts').toEqual([]);
  });
  it('SEC-06_toda_fila_define_todos_los_roles', () => {
    for (const f of filas) for (const r of ROLES) expect(f.esperado[r], `${f.rpc} sin resultado para ${r}`).toBeDefined();
  });
  it('SEC-06_no_hay_filas_de_funciones_que_no_estan_en_la_lista', () => {
    const lista = new Set((leerLista(resolve(RAIZ, 'supabase/tests/lista_rpc')) as [string, string][]).map(([f]) => f));
    expect(filas.map((f) => f.rpc).filter((f) => !lista.has(f))).toEqual([]);
  });
});

describe('SEC-06 / SEC-04 rol x RPC', () => {
  for (const fila of filas) {
    for (const rol of ROLES) {
      it(`SEC-06_${fila.rpc}_como_${rol}`, async () => {
        const r = await rpc(rol, fila.rpc, fila.args ?? {});
        comprobar(r, fila.esperado[rol], `${fila.rpc} como ${rol} (${fila.origen})`);
      });
    }
  }
});
