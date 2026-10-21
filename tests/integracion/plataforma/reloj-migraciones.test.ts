// ADR-014: el reloj de prueba solo lo activa supabase/seed.sql (local y CI); ninguna migración puede activarlo.
// Casos: T-ALU-09 y demás casos con hora (CA-07, CA-08, CA-09, CA-13, CA-25, CA-31, CA-32), SEC-30.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RAIZ } from '../../soporte/entorno';

/** Sentencias SQL (sin comentarios) que dejan `permitir_reloj_prueba` en verdadero (set, default o insert). */
export function activaElReloj(sql: string): string[] {
  const limpio = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  return limpio
    .split(';')
    .map((s) => s.trim())
    .filter((s) => {
      if (!/permitir_reloj_prueba/i.test(s)) return false;
      if (/permitir_reloj_prueba\s*=\s*(true|'t'|'true'|'on'|1)\b/i.test(s)) return true; // update ... set / do update set
      if (/permitir_reloj_prueba\s+(boolean|bool)\b[^,)]*\bdefault\s+true\b/i.test(s)) return true; // columna con default true
      if (/column\s+permitir_reloj_prueba\s+set\s+default\s+true\b/i.test(s)) return true;
      const ins = /insert\s+into\s+[\w."]+\s*\(([^)]*)\)\s*values\s*\((.*)\)/is.exec(s);
      if (ins) {
        const cols = ins[1].split(',').map((c) => c.trim().toLowerCase());
        const i = cols.indexOf('permitir_reloj_prueba');
        const vals = ins[2].split(',').map((v) => v.trim().toLowerCase());
        if (i >= 0 && /^(true|'t'|'true'|'on'|1)$/.test(vals[i] ?? '')) return true;
      }
      return false;
    });
}

describe('ADR-014 el reloj de prueba no se activa por migraciones', () => {
  const dir = resolve(RAIZ, 'supabase/migrations');
  const migraciones = readdirSync(dir).filter((f) => f.endsWith('.sql'));

  it('ADR-014_hay_migraciones', () => {
    expect(migraciones.length).toBeGreaterThan(0);
  });

  it('ADR-014_ninguna_migracion_pone_permitir_reloj_prueba_en_true', () => {
    const culpables = migraciones.flatMap((f) => activaElReloj(readFileSync(resolve(dir, f), 'utf8')).map((s) => `${f}: ${s.slice(0, 120)}`));
    expect(culpables).toEqual([]);
  });

  it('ADR-014_el_detector_se_cree_a_si_mismo_update_insert_y_default_true_fallan', () => {
    expect(activaElReloj('update privado.ajustes set permitir_reloj_prueba = true;')).toHaveLength(1);
    expect(activaElReloj('UPDATE privado.ajustes SET permitir_reloj_prueba=TRUE where true;')).toHaveLength(1);
    expect(activaElReloj('alter table privado.ajustes alter column permitir_reloj_prueba set default true;')).toHaveLength(1);
    expect(activaElReloj('insert into privado.ajustes (permitir_reloj_prueba) values (true);')).toHaveLength(1);
    expect(activaElReloj('insert into privado.ajustes (tope, permitir_reloj_prueba) values (5, true);')).toHaveLength(1);
  });

  it('ADR-014_el_detector_deja_pasar_false_y_comentarios', () => {
    expect(activaElReloj('create table privado.ajustes (permitir_reloj_prueba boolean not null default false);')).toEqual([]);
    expect(activaElReloj('create table privado.ajustes (permitir_reloj_prueba boolean not null default false, otra boolean default true);')).toEqual([]);
    expect(activaElReloj('insert into privado.ajustes (tope, permitir_reloj_prueba) values (5, false) on conflict do nothing;')).toEqual([]);
    expect(activaElReloj('-- permitir_reloj_prueba = true solo en seed.sql\nselect 1;')).toEqual([]);
    expect(activaElReloj('/* update ... set permitir_reloj_prueba = true */ select 1;')).toEqual([]);
  });

  it('ADR-014_la_migracion_define_el_permiso_en_false_por_defecto', () => {
    const todo = migraciones.map((f) => readFileSync(resolve(dir, f), 'utf8')).join('\n');
    expect(todo).toMatch(/permitir_reloj_prueba[^;,]*default\s+false/i);
  });

  it('ADR-014_solo_seed_sql_lo_activa', () => {
    const seed = readFileSync(resolve(RAIZ, 'supabase/seed.sql'), 'utf8');
    expect(activaElReloj(seed).length, 'seed.sql debe poner permitir_reloj_prueba en true').toBeGreaterThan(0);
  });
});
