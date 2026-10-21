// Workflows (CA-35, CA-39, CA-40; T-NFR-03, T-NFR-05; SEC-19, SEC-21, SEC-23, ADR-012). Pruebas estáticas del YAML:
// la ejecución en verde en el runner (push a main, keepalive manual, `active`) la verifica el informe después del push.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RAIZ } from '../../soporte/entorno';

const leer = (f: string) => readFileSync(resolve(RAIZ, '.github/workflows', f), 'utf8');

describe('CA-39 web.yml publica en Pages sin pasos manuales (T-NFR-03)', () => {
  const y = leer('web.yml');
  it('CA-39_se_dispara_por_push_a_main', () => {
    expect(y).toMatch(/^on:\s*$/m);
    expect(y).toMatch(/push:\s*\n\s+branches:\s*\[\s*main\s*\]|push:\s*\n\s+branches:\s*\n\s+- main/);
  });
  it('CA-39_publica_con_las_acciones_oficiales_de_Pages', () => {
    expect(y).toMatch(/actions\/upload-pages-artifact@/);
    expect(y).toMatch(/actions\/deploy-pages@/);
    expect(y).toMatch(/pages:\s*write/);
    expect(y).toMatch(/id-token:\s*write/);
  });
  it('CA-39_el_despliegue_no_exige_aprobacion_manual', () => {
    // La publicación no puede estar tras un environment con revisores (ese es solo de supabase-deploy.yml).
    const bloque = y.slice(y.search(/deploy-pages@/) - 600, y.search(/deploy-pages@/));
    expect(bloque).not.toMatch(/environment:\s*produccion/);
  });
  it('CA-39_hay_verificar_publicado', () => {
    expect(y).toMatch(/verificar-publicado/);
  });
  it('CA-35_escanea_secretos_en_el_repo_y_en_dist_antes_de_publicar', () => {
    expect(y).toMatch(/gitleaks/i);
    expect(y).toMatch(/escanear-dist\.mjs|seguridad:dist/);
    const iDeploy = y.search(/deploy-pages@/);
    const iEscaneo = y.search(/escanear-dist\.mjs|seguridad:dist/);
    expect(iEscaneo).toBeGreaterThan(-1);
    expect(iEscaneo).toBeLessThan(iDeploy);
  });
  it('SEC-23_codeql_y_bd_lint', () => {
    expect(y).toMatch(/github\/codeql-action/);
    expect(y).toMatch(/db lint/);
    expect(y).toMatch(/test db|test:bd/);
  });
  it('CA-39_ninguna_accion_sin_fijar_a_sha_o_version_mayor', () => {
    const usos = [...y.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm)].map((m) => m[1]).filter((u) => !u.startsWith('./'));
    expect(usos.length).toBeGreaterThan(0);
    for (const u of usos) expect(u, `acción sin versión: ${u}`).toMatch(/@\S+/);
  });
});

describe('CA-40 keepalive.yml (T-NFR-05)', () => {
  const y = leer('keepalive.yml');
  it('CA-40_corre_cada_3_dias', () => {
    expect(y).toMatch(/schedule:/);
    const cron = /cron:\s*["']([^"']+)["']/.exec(y);
    expect(cron, 'sin cron').not.toBeNull();
    const campos = cron![1].trim().split(/\s+/);
    expect(campos).toHaveLength(5);
    expect(campos[2]).toMatch(/^(\*|1)\/3$|^1,4,7|^\*\/3$/);
  });
  it('CA-40_tambien_por_disparo_manual', () => {
    expect(y).toMatch(/workflow_dispatch:/);
  });
  it('CA-40_hace_la_consulta_ping_con_los_secretos_sin_imprimirlos', () => {
    expect(y).toMatch(/rpc\/ping/);
    expect(y).toMatch(/\$\{\{[^}]*\b(secrets|vars)\.[A-Z_]+/);
    expect(y).not.toMatch(/set -x|--verbose|\s-v\s|echo\s+["']?\$\{?\{?\{?\s*(secrets|vars)/);
    expect(y).toMatch(/::add-mask::|env:/);
  });
  it('CA-40_falla_si_la_respuesta_no_es_correcta', () => {
    expect(y).toMatch(/--fail|curl\s+-\w*f|exit 1/);
  });
});

describe('Pipeline general', () => {
  const archivos = readdirSync(resolve(RAIZ, '.github/workflows'));
  it('ADR-012_existen_los_cuatro_workflows_y_spike_s02_ya_no', () => {
    for (const f of ['web.yml', 'e2e.yml', 'supabase-deploy.yml', 'keepalive.yml']) expect(archivos, f).toContain(f);
    expect(archivos).not.toContain('spike-s02.yml');
    expect(existsSync(resolve(RAIZ, 'spike-s02'))).toBe(false);
  });
  it('SEC-21_todos_declaran_permisos_minimos', () => {
    for (const f of archivos.filter((n) => n.endsWith('.yml'))) {
      expect(leer(f), f).toMatch(/^permissions:/m);
    }
  });
  it('ADR-012_supabase_deploy_usa_el_environment_produccion_la_guardia_y_deploy_sin_verify_jwt', () => {
    const y = leer('supabase-deploy.yml');
    expect(y).toMatch(/environment:\s*produccion/);
    expect(y).toMatch(/guardia-config\.mjs/);
    expect(y).toMatch(/config diff/);
    expect(y).toMatch(/functions deploy enviar-mail --no-verify-jwt --use-api/);
    expect(y).toMatch(/secrets list/);
    expect(y.indexOf('guardia-config.mjs')).toBeLessThan(y.indexOf('config push --project-ref'));
    expect(y).toMatch(/RTC_GOOGLE_SECRET:\s*["']{2}/);
  });
  it('SEC-22_dependabot_y_gitleaks_toml_existen', () => {
    expect(existsSync(resolve(RAIZ, '.github/dependabot.yml'))).toBe(true);
    expect(existsSync(resolve(RAIZ, '.gitleaks.toml'))).toBe(true);
  });
});
