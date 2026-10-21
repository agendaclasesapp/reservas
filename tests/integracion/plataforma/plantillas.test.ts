// Plantillas de Auth (SEC-12, ADR-007, T-ALU-01): solo `{{ .Token }}`, sin enlaces ni URL.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RAIZ } from '../../soporte/entorno';
import { parsearToml } from '../../soporte/toml';

const dir = resolve(RAIZ, 'supabase/templates');
const t = parsearToml(readFileSync(resolve(RAIZ, 'supabase/config.toml'), 'utf8'));

describe('SEC-12 plantillas de Auth', () => {
  const archivos = readdirSync(dir);
  it('SEC-12_hay_plantillas', () => {
    expect(archivos.length).toBeGreaterThan(0);
  });
  for (const a of archivos) {
    const html = readFileSync(resolve(dir, a), 'utf8');
    it(`SEC-12_${a}_sin_href_ni_url`, () => {
      expect(html).not.toMatch(/href\s*=/i);
      expect(html).not.toMatch(/https?:|:\/\//i);
      expect(html).not.toMatch(/ConfirmationURL|SiteURL|RedirectTo|TokenHash|\.Link/);
    });
    it(`SEC-12_${a}_muestra_el_codigo`, () => {
      expect(html).toContain('{{ .Token }}');
    });
  }
  for (const s of ['confirmation', 'magic_link']) {
    it(`SEC-12_${s}_apunta_a_una_plantilla_existente_con_Token`, () => {
      const ruta = String(t[`auth.email.template.${s}`]?.content_path);
      const html = readFileSync(resolve(RAIZ, ruta.replace(/^\.\//, '')), 'utf8');
      expect(html).toContain('{{ .Token }}');
      expect(html).not.toMatch(/href\s*=|:\/\//i);
    });
  }
});
