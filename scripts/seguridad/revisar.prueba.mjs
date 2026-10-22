// Pruebas de revisar-workflows.mjs (SEC-21, SEC-31) y revisar-variables.mjs (SEC-20).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { cargarPermitidos, evaluarDiff } from './guardia-config.mjs';
import { revisarWorkflow } from './revisar-workflows.mjs';
import { revisarConfigToml, revisarEnvExample, revisarPago, revisarTodo, revisarVite } from './revisar-variables.mjs';

const SHA = 'a'.repeat(40);
const BUENO = `name: ok
on:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  calidad:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@${SHA} # v7
      - run: npm ci
  publicar:
    runs-on: ubuntu-24.04
    permissions:
      contents: read
      pages: write
      id-token: write
    steps:
      - uses: ./.github/acciones/local
      - run: |
          echo "$TITULO"
        env:
          TITULO: \${{ github.event.head_commit.message }}
`;

test('workflows: uno bien hecho no tiene hallazgos', () => {
  assert.deepEqual(revisarWorkflow('web.yml', BUENO), []);
});

test('workflows: un YAML que no parsea falla con archivo y linea (name: a: b)', () => {
  const r = revisarWorkflow('web.yml', BUENO.replace('      - run: npm ci', '      - name: a: b\n        run: npm ci'));
  assert.equal(r.length, 1);
  assert.match(r[0], /^web\.yml:\d+: YAML invalido/);
});

test('workflows: pull_request_target falla', () => {
  assert.equal(revisarWorkflow('web.yml', BUENO.replace('push:', 'pull_request_target:')).length, 1);
});

test('workflows: uses sin SHA (version o rama) falla', () => {
  const h = revisarWorkflow('web.yml', BUENO.replace(SHA, 'v4'));
  assert.match(h[0], /sin SHA completo/);
  assert.equal(revisarWorkflow('web.yml', BUENO.replace(`@${SHA}`, '')).length, 1);
});

test('workflows: expresion de github.event dentro de run falla, en env no', () => {
  const malo = BUENO.replace('run: npm ci', 'run: echo "${{ github.event.pull_request.title }}"');
  assert.match(revisarWorkflow('web.yml', malo)[0], /entrada no confiable/);
  const mutilinea = BUENO.replace('echo "$TITULO"', 'echo "${{ github.head_ref }}"');
  assert.match(revisarWorkflow('web.yml', mutilinea)[0], /entrada no confiable/);
});

test('workflows: sin permissions de primer nivel o con write fuera de publicar falla', () => {
  assert.match(revisarWorkflow('web.yml', BUENO.replace('permissions:\n  contents: read\njobs:', 'jobs:'))[0], /falta permissions/);
  const malo = BUENO.replace('  calidad:\n    runs-on: ubuntu-24.04\n', '  calidad:\n    runs-on: ubuntu-24.04\n    permissions:\n      id-token: write\n');
  assert.match(revisarWorkflow('web.yml', malo)[0], /id-token: write fuera del job publicar/);
  assert.match(revisarWorkflow('web.yml', BUENO.replace('contents: read\njobs', 'contents: write\njobs'))[0], /contents: write/);
});

test('workflows: los secretos de Supabase solo en supabase-deploy.yml, que solo es manual y con environment', () => {
  const conSecreto = `${BUENO}      - run: echo\n        env:\n          T: \${{ secrets.SUPABASE_ACCESS_TOKEN }}\n`;
  assert.match(revisarWorkflow('web.yml', conSecreto).join('\n'), /solo en supabase-deploy\.yml/);
  const deploy = `name: d
on:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  desplegar:
    runs-on: ubuntu-24.04
    environment: produccion
    steps:
      - run: echo
        env:
          T: \${{ secrets.SUPABASE_ACCESS_TOKEN }}
`;
  assert.deepEqual(revisarWorkflow('supabase-deploy.yml', deploy), []);
  assert.match(revisarWorkflow('supabase-deploy.yml', deploy.replace('workflow_dispatch:', 'workflow_dispatch:\n  push:'))[0], /solo con workflow_dispatch/);
  assert.match(revisarWorkflow('supabase-deploy.yml', deploy.replace('    environment: produccion\n', ''))[0], /falta environment produccion/);
});

// --- variables ---
const temporales = [];
function repo(archivos) {
  const dir = mkdtempSync(join(tmpdir(), 'repo-prueba-'));
  temporales.push(dir);
  for (const [nombre, contenido] of Object.entries(archivos)) {
    mkdirSync(join(dir, nombre, '..'), { recursive: true });
    writeFileSync(join(dir, nombre), contenido);
  }
  return dir;
}
afterEach(() => {
  while (temporales.length > 0) rmSync(temporales.pop(), { recursive: true, force: true });
});

const NOMBRES = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_BASE', 'SUPABASE_PROJECT_REF', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD', 'GMAIL_USER', 'GMAIL_APP_PASSWORD', 'MAIL_SECRETO', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_TLS', 'RTC_SITE_URL', 'RTC_REDIRECT_URL', 'RTC_GOOGLE_CLIENT_ID', 'RTC_GOOGLE_SECRET', 'VITE_TURNSTILE_SITEKEY', 'RTC_TURNSTILE_SECRET'];
const PRUEBA_SITEKEY = '1x00000000000000000000AA';
const PRUEBA_SECRETO = '1x0000000000000000000000000000000AA';
const ejemplo = (cambios = {}) =>
  NOMBRES.map((n) => `${n}=${cambios[n] ?? { VITE_BASE: '/', MAIL_SECRETO: 'prueba-local', SMTP_HOST: 'inbucket', SMTP_PORT: '1025', SMTP_TLS: 'false', VITE_TURNSTILE_SITEKEY: PRUEBA_SITEKEY, RTC_TURNSTILE_SECRET: PRUEBA_SECRETO }[n] ?? ''}`).join('\n');
const DEV = 'MAIL_SECRETO=prueba-local\n';

test('variables: un .env.example correcto pasa', () => {
  assert.deepEqual(revisarEnvExample(repo({ '.env.example': ejemplo(), 'supabase/.env.development': DEV })), []);
});

test('variables: un valor en .env.example (secreto) falla', () => {
  const dir = repo({ '.env.example': ejemplo({ GMAIL_APP_PASSWORD: 'algo' }), 'supabase/.env.development': DEV });
  assert.match(revisarEnvExample(dir)[0], /GMAIL_APP_PASSWORD trae un valor/);
});

test('variables: falta un nombre o MAIL_SECRETO difiere del local', () => {
  const sinNombre = ejemplo().replace('SMTP_TLS=false', '');
  assert.match(revisarEnvExample(repo({ '.env.example': sinNombre, 'supabase/.env.development': DEV }))[0], /falta SMTP_TLS/);
  assert.match(revisarEnvExample(repo({ '.env.example': ejemplo(), 'supabase/.env.development': 'MAIL_SECRETO=otro\n' }))[0], /MAIL_SECRETO debe ser/);
});

test('variables: otra VITE_* en src, workflow o .env.example falla', () => {
  const dir = repo({
    'src/a.ts': 'const x = import.meta.env.VITE_SERVICE_KEY; const b = import.meta.env.VITE_BASE;',
    '.github/workflows/w.yml': 'env:\n  VITE_OTRA: 1\n',
  });
  const e = revisarVite(dir);
  assert.equal(e.length, 2);
  assert.match(e.join('\n'), /VITE_SERVICE_KEY/);
});

test('variables: VITE_TURNSTILE_SITEKEY (clave publica) esta permitida, otra desconocida falla (SEC-20)', () => {
  const ok = repo({ 'src/lib/vite-env.d.ts': 'readonly VITE_TURNSTILE_SITEKEY: string;' });
  assert.deepEqual(revisarVite(ok), []);
  const mal = repo({ 'src/lib/vite-env.d.ts': 'readonly VITE_TURNSTILE_SECRET: string;' });
  assert.match(revisarVite(mal)[0], /VITE_TURNSTILE_SECRET/);
});

test('variables: VITE_BASE con ruta pasa; con forma de secreto o sin ruta falla', () => {
  const dev = { 'supabase/.env.development': DEV };
  assert.deepEqual(revisarEnvExample(repo({ '.env.example': ejemplo({ VITE_BASE: '/reservas/' }), ...dev })), []);
  for (const v of ['abc123', ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', 'abcdefghijk'].join('.'), '/a b/', 'https://x.com/']) {
    assert.match(revisarEnvExample(repo({ '.env.example': ejemplo({ VITE_BASE: v }), ...dev }))[0], /VITE_BASE trae un valor/);
  }
});

test('variables: config.toml con literal de secreto falla; env() y vacio pasan', () => {
  const bueno = 'secret = "env(RTC_GOOGLE_SECRET)"\nclient_id = "env(X)"\nauth_token = ""\n# secret = "literal"\n';
  assert.deepEqual(revisarConfigToml(repo({ 'supabase/config.toml': bueno })), []);
  assert.equal(revisarConfigToml(repo({ 'supabase/config.toml': 'secret = "literal"\n' })).length, 1);
  assert.equal(revisarConfigToml(repo({ 'supabase/config.toml': `x = "GOCSPX-${'a'.repeat(28)}"\n` })).length, 1);
  assert.equal(revisarConfigToml(repo({ 'supabase/config.toml': 'x = "abcd efgh ijkl mnop"\n' })).length, 1);
});

test('variables: tokens o acciones de pago en workflows fallan (SEC-31)', () => {
  const dir = repo({ '.github/workflows/w.yml': 'steps:\n  - uses: snyk/actions/node@x\n    env:\n      SNYK_TOKEN: x\n' });
  assert.equal(revisarPago(dir).length, 2);
  assert.deepEqual(revisarPago(repo({ '.github/workflows/w.yml': 'steps:\n  - run: ok\n' })), []);
  for (const t of ['SEMGREP_APP_TOKEN', 'GITLEAKS_LICENSE', 'CODECOV_TOKEN']) {
    assert.equal(revisarPago(repo({ '.github/workflows/w.yml': `env: ${t}\n` })).length, 1, t);
  }
});

test('variables: revisarTodo de un repo vacio falla', () => {
  assert.ok(revisarTodo(repo({ 'x.txt': '1' })).length > 0);
});

test('variables: Turnstile en .env.example solo con las claves de PRUEBA de Cloudflare; el secreto real falla (ADR-016, SEC-13)', () => {
  const dev = { 'supabase/.env.development': DEV };
  assert.deepEqual(revisarEnvExample(repo({ '.env.example': ejemplo(), ...dev })), []);
  const vacia = revisarEnvExample(repo({ '.env.example': ejemplo({ RTC_TURNSTILE_SECRET: '' }), ...dev }));
  assert.deepEqual(vacia, []);
  const real = revisarEnvExample(repo({ '.env.example': ejemplo({ RTC_TURNSTILE_SECRET: '0x4AAAAAAAreal_secreto_de_produccion' }), ...dev }));
  assert.match(real[0], /RTC_TURNSTILE_SECRET trae un valor/);
  const sitekey = revisarEnvExample(repo({ '.env.example': ejemplo({ VITE_TURNSTILE_SITEKEY: '0x4AAAAAAAreal' }), ...dev }));
  assert.match(sitekey[0], /VITE_TURNSTILE_SITEKEY trae un valor/);
});

test('variables: config.toml con [auth.captcha] y secret = env() pasa; con el secreto literal falla (SEC-13)', () => {
  const toml = (secret) => `[auth.captcha]
enabled = true
provider = "turnstile"
secret = "${secret}"
`;
  assert.deepEqual(revisarConfigToml(repo({ 'supabase/config.toml': toml('env(RTC_TURNSTILE_SECRET)') })), []);
  assert.match(revisarConfigToml(repo({ 'supabase/config.toml': toml('0x4AAAAAAAliteral') }))[0], /secret debe ser env/);
});

// CAPTCHA y `config push` (ADR-012, ADR-016, SEC-13). Forma real de `config diff --output-format json` (CLI 2.121,
// API simulada): `auth.captcha.secret` figura en `masked` (no se compara ni viaja si RTC_TURNSTILE_SECRET esta vacia).
test('config diff: activar el CAPTCHA (enabled y provider) pasa la guardia; su secreto nunca como update (SEC-13)', () => {
  const cambio = (path, clase, local, remote) => ({ path: path.split('.'), class: clase, declared: true, local, remote });
  const diffDe = (changes) => ({ schema_version: 1, target: { project_ref: 'rmokypmznhobapyghfpi' }, scope: { present: ['auth'], missing: [] }, changes, masked: [['auth', 'captcha', 'secret']], unmanaged: [] });
  const permitidos = cargarPermitidos();
  const activar = diffDe([cambio('auth.captcha.enabled', 'update', true, false), cambio('auth.captcha.provider', 'update', 'turnstile', 'hcaptcha')]);
  assert.deepEqual(evaluarDiff(activar, permitidos).errores, []);
  const yaIgual = diffDe([]);
  assert.deepEqual(evaluarDiff(yaIgual, permitidos).errores, []);
  const conSecreto = diffDe([cambio('auth.captcha.secret', 'update', '1x0000000000000000000000000000000AA', 'hash')]);
  assert.deepEqual(evaluarDiff(conSecreto, permitidos).errores, ['update fuera de config-permitida.json: auth.captcha.secret']);
  const literal = diffDe([cambio('auth.captcha.secret', 'local_only', 'env(RTC_TURNSTILE_SECRET)', null)]);
  assert.ok(evaluarDiff(literal, permitidos).errores.some((e) => e.includes('env(')));
});
