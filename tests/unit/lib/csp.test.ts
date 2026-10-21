// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  aplicarCsp,
  extraerCsp,
  MARCA_ORIGEN_SUPABASE,
  ORIGEN_TURNSTILE,
  origenConexion,
  parsearCsp,
  quitarCsp,
} from '../../../src/lib/csp';

const INDEX = readFileSync(new URL('../../../index.html', import.meta.url), 'utf8');
const ORIGEN = 'https://abcdefghijklmnop.supabase.co';

function directivasCompiladas() {
  const politica = extraerCsp(aplicarCsp(INDEX, ORIGEN));
  if (politica === null) throw new Error('sin CSP');
  return parsearCsp(politica);
}

describe('CSP de index.html (SEC-16)', () => {
  it('SEC_16_index_html_trae_la_politica_de_la_spec', () => {
    const d = directivasCompiladas();
    expect(d.get('default-src')).toEqual(["'self'"]);
    expect(d.get('style-src')).toEqual(["'self'"]);
    expect(d.get('img-src')).toEqual(["'self'", 'data:']);
    expect(d.get('connect-src')).toEqual(["'self'", ORIGEN]);
    expect(d.get('object-src')).toEqual(["'none'"]);
    expect(d.get('base-uri')).toEqual(["'self'"]);
    expect(d.get('form-action')).toEqual(["'self'"]);
  });

  it('SEC_16_turnstile_solo_en_script_src_y_frame_src', () => {
    const d = directivasCompiladas();
    expect(d.get('script-src')).toEqual(["'self'", ORIGEN_TURNSTILE]);
    expect(d.get('frame-src')).toEqual([ORIGEN_TURNSTILE]);
    for (const [nombre, fuentes] of d) {
      if (nombre !== 'script-src' && nombre !== 'frame-src') expect(fuentes).not.toContain(ORIGEN_TURNSTILE);
    }
  });

  it('SEC_16_sin_unsafe_inline_ni_unsafe_eval_ni_comodines', () => {
    const politica = extraerCsp(aplicarCsp(INDEX, ORIGEN)) ?? '';
    expect(politica).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
  });

  it('SEC_16_la_marca_queda_reemplazada_y_falla_si_falta', () => {
    expect(aplicarCsp(INDEX, ORIGEN)).not.toContain(MARCA_ORIGEN_SUPABASE);
    expect(() => aplicarCsp('<html><head></head></html>', ORIGEN)).toThrow(/SEC-16/);
    const sinMarca = INDEX.replace(MARCA_ORIGEN_SUPABASE, '');
    expect(() => aplicarCsp(sinMarca, ORIGEN)).toThrow(/SEC-16/);
  });

  it('SEC_16_en_dev_se_quita_la_meta_csp', () => {
    expect(extraerCsp(INDEX)).not.toBeNull();
    expect(extraerCsp(quitarCsp(INDEX))).toBeNull();
    expect(quitarCsp(INDEX)).toContain('<div id="raiz">');
  });

  it('SEC_16_origen_https_o_http_solo_local', () => {
    expect(origenConexion('https://abc.supabase.co/')).toBe('https://abc.supabase.co');
    expect(origenConexion('http://127.0.0.1:54321')).toBe('http://127.0.0.1:54321');
    expect(() => origenConexion('http://abc.supabase.co')).toThrow(/https/);
    expect(() => origenConexion('ftp://abc.supabase.co')).toThrow(/https/);
    expect(() => origenConexion('no es url')).toThrow(/válida/);
  });
});
