// SEC-04 (catálogo): la lista de funciones por bolt (supabase/tests/lista_rpc/BB.txt) y la lista incrustada en
// el pgTAP 00_catalogo deben coincidir; si un bolt agrega una función y no corre la sincronización, falla aquí.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RAIZ } from '../../soporte/entorno';
// @ts-expect-error módulo .mjs sin tipos
import { bloque, incrustar, leerLista } from '../../soporte/sincronizar-lista-rpc.mjs';

describe('SEC-04 lista de RPC', () => {
  const filas = leerLista(resolve(RAIZ, 'supabase/tests/lista_rpc')) as [string, string][];

  it('SEC-04_la_lista_unida_tiene_ping_config_publica_y_app_ahora', () => {
    const m = new Map(filas);
    expect(m.get('ping')).toBe('anon');
    expect(m.get('config_publica')).toBe('anon');
    expect(m.get('app_ahora')).toBe('authenticated');
  });

  it('SEC-04_B14_la_lista_trae_pedir_inscripcion_para_authenticated_y_ninguna_RPC_de_alta_de_profesor_o_Administrador', () => {
    const m = new Map(filas);
    expect(m.get('pedir_inscripcion')).toBe('authenticated');
    expect(m.get('completar_ficha')).toBe('authenticated');
    expect(filas.map(([f]) => f).filter((f) => /administrador|alta_profesor|configurar/.test(f))).toEqual([]); // CA-49
  });

  it('SEC-04_anon_solo_ping_config_publica_y_agenda_publica', () => {
    const anon = filas.filter(([, r]) => r === 'anon').map(([f]) => f);
    expect(anon.filter((f) => !['ping', 'config_publica', 'agenda_publica'].includes(f))).toEqual([]);
  });

  it('SEC-04_00_catalogo_tiene_incrustada_la_lista_actual_corre_node_tests_soporte_sincronizar_lista_rpc_mjs', () => {
    const actual = readFileSync(resolve(RAIZ, 'supabase/tests/00_catalogo.test.sql'), 'utf8');
    expect(incrustar(actual, filas)).toBe(actual);
  });

  it('SEC-04_el_bloque_generado_es_sql_valido_aun_con_lista_vacia', () => {
    expect(bloque([])).toContain('delete from lista_rpc where rol is null');
    expect(bloque([['ping', 'anon']])).toContain("('anon', 'ping')");
  });
});
