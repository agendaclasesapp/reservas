// @vitest-environment node
// Las reglas de ESLint de SEC-16 y SEC-17 bloquean de verdad (no solo están escritas).
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const raiz = fileURLToPath(new URL('../../../', import.meta.url));
const eslint = new ESLint({ cwd: raiz });

async function reglas(codigo: string, archivo = 'src/lib/__prueba__.tsx'): Promise<string[]> {
  const [r] = await eslint.lintText(codigo, { filePath: `${raiz}${archivo}` });
  return (r?.messages ?? []).map((m) => m.ruleId ?? m.message);
}

describe('ESLint de seguridad', { timeout: 30000 }, () => {
  it('SEC_16_dangerouslySetInnerHTML_falla', async () => {
    expect(await reglas('export const A = (p: { h: string }) => <div dangerouslySetInnerHTML={{ __html: p.h }} />;')).toContain(
      'react/no-danger',
    );
  });

  it('SEC_16_asignar_innerHTML_o_insertAdjacentHTML_falla', async () => {
    const r = await reglas(
      "export function f(e: HTMLElement, t: string) { e.innerHTML = t; e.insertAdjacentHTML('beforeend', t); }",
      'src/lib/__prueba__.ts',
    );
    expect(r.filter((x) => x === 'no-restricted-syntax')).toHaveLength(2);
  });

  it('SEC_16_eval_y_javascript_url_fallan', async () => {
    const r = await reglas("export const A = () => { eval('1'); return <a href=\"javascript:void 0\">x</a>; };");
    expect(r).toContain('no-eval');
    expect(r).toContain('react/jsx-no-script-url');
  });

  it('SEC_16_target_blank_sin_noreferrer_falla', async () => {
    expect(await reglas('export const A = (p: { u: string }) => <a href={p.u} target="_blank">x</a>;')).toContain(
      'react/jsx-no-target-blank',
    );
  });

  it('SEC_16_codigo_seguro_pasa', async () => {
    expect(
      await reglas(
        'export const A = (p: { u: string; n: string }) => <a href={p.u} target="_blank" rel="noopener noreferrer">{p.n}</a>;',
      ),
    ).toEqual([]);
  });

  it('SEC_17_console_log_en_src_falla_y_console_error_se_permite', async () => {
    const r = await reglas("export function f(s: unknown) { console.log(s); console.info(s); console.error('x'); }", 'src/lib/__prueba__.ts');
    expect(r.filter((x) => x === 'no-console')).toHaveLength(2);
  });
});
