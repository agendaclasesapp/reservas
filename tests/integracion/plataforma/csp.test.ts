// CSP del index.html (SEC-16, ADR-016): `index.html` de la raíz y `dist/index.html` publicado.
// Turnstile (https://challenges.cloudflare.com) solo en script-src y frame-src; nada de unsafe-*.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { asegurarDist, DIST } from '../../soporte/dist';
import { RAIZ } from '../../soporte/entorno';

const TURNSTILE = 'https://challenges.cloudflare.com';

function csp(html: string): Record<string, string[]> {
  const meta = /<meta\b[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i.exec(html);
  expect(meta, 'index.html sin <meta http-equiv="Content-Security-Policy">').not.toBeNull();
  const contenido = /content=(?:"([^"]*)"|'([^']*)')/i.exec(meta![0]);
  expect(contenido, 'la meta de CSP no tiene content').not.toBeNull();
  const salida: Record<string, string[]> = {};
  for (const d of (contenido![1] ?? contenido![2]).split(';')) {
    const [nombre, ...fuentes] = d.trim().split(/\s+/);
    if (nombre) salida[nombre.toLowerCase()] = fuentes;
  }
  return salida;
}

function reglas(nombre: string, leer: () => string, fuente = false) {
  describe(`SEC-16 CSP de ${nombre}`, () => {
    let p: Record<string, string[]>;
    beforeAll(() => {
      p = csp(leer());
    });
    it('SEC-16_directivas_base', () => {
      expect(p['default-src']).toEqual(["'self'"]);
      expect(p['object-src']).toEqual(["'none'"]);
      expect(p['base-uri']).toEqual(["'self'"]);
      expect(p['form-action']).toEqual(["'self'"]);
      expect(p['img-src']).toEqual(expect.arrayContaining(["'self'", 'data:']));
    });
    it('SEC-16_script_src_sin_unsafe_y_con_self', () => {
      expect(p['script-src']).toContain("'self'");
      expect(p['script-src'].join(' ')).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
    });
    it('SEC-16_style_src_self_sin_unsafe_eval', () => {
      expect(p['style-src']).toContain("'self'");
      expect(p['style-src'].join(' ')).not.toMatch(/unsafe-eval/);
    });
    it('SEC-16_connect_src_self_y_solo_supabase', () => {
      expect(p['connect-src']).toContain("'self'");
      const otras = p['connect-src'].filter((f) => f !== "'self'");
      expect(otras.length).toBeGreaterThan(0);
      // Compilado contra el stack local el origen es http://127.0.0.1:<puerto>; el index.html fuente trae el marcador.
      const valido = (o: string) =>
        /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(o) || /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(o) || (fuente && o === '__RTC_SUPABASE_ORIGEN__');
      for (const o of otras) expect(valido(o), `connect-src solo admite el origen de Supabase: ${o}`).toBe(true);
    });
    it('ADR-016_Turnstile_solo_en_script_src_y_frame_src', () => {
      const con = Object.entries(p).filter(([, f]) => f.includes(TURNSTILE)).map(([d]) => d).sort();
      expect(con).toEqual(['frame-src', 'script-src']);
    });
    it('SEC-16_sin_comodines_ni_http_plano', () => {
      for (const [d, f] of Object.entries(p)) {
        for (const x of f) {
          expect(x, `${d}: fuente ${x}`).not.toMatch(/^(\*|http:(?!\/\/(127\.0\.0\.1|localhost):))/);
        }
      }
    });
  });
}

reglas('index.html (fuente)', () => readFileSync(resolve(RAIZ, 'index.html'), 'utf8'), true);

describe('SEC-16 dist/index.html construido', () => {
  beforeAll(() => {
    asegurarDist();
  }, 300_000);
  reglas('dist/index.html', () => readFileSync(resolve(DIST, 'index.html'), 'utf8'));
});
