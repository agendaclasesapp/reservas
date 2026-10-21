import { describe, expect, it } from 'vitest';
import { BASE_POR_DEFECTO, normalizarBase } from '../../../src/lib/base';
import { ErrorDeConfiguracion, leerEnv } from '../../../src/lib/env';

describe('base de publicación (NFR-09: GitHub Pages, DEC-14)', () => {
  it('NFR_09_base_por_defecto_es_reservas', () => {
    expect(BASE_POR_DEFECTO).toBe('/reservas/');
    expect(normalizarBase(undefined)).toBe('/reservas/');
    expect(normalizarBase('  ')).toBe('/reservas/');
  });

  it('NFR_09_vite_base_se_normaliza_con_barras', () => {
    expect(normalizarBase('otra')).toBe('/otra/');
    expect(normalizarBase('/a/b')).toBe('/a/b/');
    expect(normalizarBase('/')).toBe('/');
  });

  it('NFR_09_vite_base_rechaza_dominios_y_puntos', () => {
    for (const v of ['https://x.github.io/reservas/', '/../x/', '/a//b/', '/a b/']) {
      expect(() => normalizarBase(v)).toThrow(/VITE_BASE/);
    }
  });
});

describe('variables VITE_* (DEC-14, NFR-02)', () => {
  it('NFR_02_lee_url_y_clave_anon_y_quita_la_barra_final', () => {
    expect(leerEnv({ VITE_SUPABASE_URL: 'https://abc.supabase.co/', VITE_SUPABASE_ANON_KEY: 'anon' })).toEqual({
      supabaseUrl: 'https://abc.supabase.co',
      supabaseAnonKey: 'anon',
    });
  });

  it('NFR_02_falta_una_variable_y_el_mensaje_no_trae_valores', () => {
    expect(() => leerEnv({ VITE_SUPABASE_ANON_KEY: 'clave-x' })).toThrow(ErrorDeConfiguracion);
    expect(() => leerEnv({ VITE_SUPABASE_URL: 'https://abc.supabase.co' })).toThrow(/VITE_SUPABASE_ANON_KEY/);
    try {
      leerEnv({ VITE_SUPABASE_URL: 'http://remoto.example.com', VITE_SUPABASE_ANON_KEY: 'clave-secreta-x' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ErrorDeConfiguracion);
      expect((e as Error).message).not.toContain('clave-secreta-x');
    }
  });
});
