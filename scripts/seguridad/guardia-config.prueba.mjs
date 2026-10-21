// Pruebas de guardia-config.mjs (ADR-012, H-022): `node --test "scripts/seguridad/*.prueba.mjs"`
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { cargarPermitidos, evaluarDiff, parsearDiff } from './guardia-config.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const PAGES = 'https://agendaclasesapp.github.io/reservas/';
const permitidos = cargarPermitidos();

const cambio = (path, clase, local, remote, extra = {}) => ({ path: path.split('.'), class: clase, declared: true, local, remote, ...extra });
const diffDe = (changes, project_ref = 'rmokypmznhobapyghfpi') => ({
  schema_version: 1,
  target: { project_ref, local_scope: 'base' },
  scope: { present: ['auth', 'pooler'], missing: [] },
  changes,
  masked: [['auth', 'external', 'google', 'secret']],
  unmanaged: [],
});

// Forma real de `config diff --output-format json` con la CLI 2.121 (capturada con la API simulada, S02).
const diffBueno = () =>
  diffDe([
    cambio('auth.site_url', 'update', PAGES, 'http://localhost:3000', { env_variables: ['RTC_SITE_URL'] }),
    cambio('auth.email.otp_expiry', 'update', 600, 3600),
    cambio('auth.email.otp_length', 'update', 6, 8),
    cambio('auth.rate_limit.sign_in_sign_ups', 'update', 20, 30),
    cambio('auth.additional_redirect_urls', 'local_only', [PAGES], null, { env_variables: ['RTC_REDIRECT_URL'] }),
    cambio('auth.smtp.host', 'remote_only', null, 'smtp.gmail.com'),
  ]);

test('el diff esperado de produccion pasa', () => {
  const r = evaluarDiff(diffBueno(), permitidos, { ref: 'rmokypmznhobapyghfpi' });
  assert.deepEqual(r.errores, []);
  assert.equal(r.updates.length, 4);
});

test('un diff con 127.0.0.1 falla', () => {
  const d = diffBueno();
  d.changes[0].local = 'http://127.0.0.1:5173/reservas/';
  const r = evaluarDiff(d, permitidos);
  assert.ok(r.errores.some((e) => e.includes('127.0.0.1')), r.errores.join('\n'));
});

test('un diff con env( (variable sin definir) falla', () => {
  const d = diffBueno();
  d.changes[0].local = 'env(RTC_SITE_URL)';
  const r = evaluarDiff(d, permitidos);
  assert.ok(r.errores.some((e) => e.includes('env(')), r.errores.join('\n'));
});

test('un update fuera de config-permitida.json falla', () => {
  const d = diffBueno();
  d.changes.push(cambio('auth.mfa.totp.enroll_enabled', 'update', true, false));
  const r = evaluarDiff(d, permitidos);
  assert.deepEqual(r.errores, ['update fuera de config-permitida.json: auth.mfa.totp.enroll_enabled']);
});

test('el pooler y storage.vector igualados no aparecen y un cambio en ellos falla', () => {
  assert.deepEqual(evaluarDiff(diffDe([]), permitidos).errores, []);
  const d = diffDe([cambio('pooler.default_pool_size', 'update', 20, 15), cambio('storage.vector.enabled', 'update', true, false)]);
  assert.equal(evaluarDiff(d, permitidos).errores.length, 2);
});

test('un diff de otro proyecto o sin Auth falla', () => {
  assert.equal(evaluarDiff(diffBueno(), permitidos, { ref: 'otroproyecto' }).errores.length, 1);
  const sinAuth = diffBueno();
  sinAuth.scope.present = ['pooler'];
  assert.ok(evaluarDiff(sinAuth, permitidos).errores.some((e) => e.includes('Auth')));
});

test('parsearDiff tolera lineas previas y rechaza lo que no es un diff', () => {
  assert.equal(parsearDiff(`Comparing against project x\n${JSON.stringify(diffBueno())}`).changes.length, 6);
  assert.throws(() => parsearDiff('sin json'));
  assert.throws(() => parsearDiff('{"otra":1}'));
});

function correr(contenido, extra = []) {
  const dir = mkdtempSync(join(tmpdir(), 'guardia-'));
  try {
    const archivo = join(dir, 'diff.json');
    writeFileSync(archivo, contenido);
    return spawnSync(process.execPath, [join(AQUI, 'guardia-config.mjs'), archivo, ...extra], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('el comando sale con 0 con el diff esperado y con 1 ante cada violacion', () => {
  assert.equal(correr(JSON.stringify(diffBueno())).status, 0);
  const local = diffBueno();
  local.changes[0].local = 'http://127.0.0.1:5173/reservas/';
  assert.equal(correr(JSON.stringify(local)).status, 1);
  const envSinDefinir = diffBueno();
  envSinDefinir.changes[1].local = 'env(X)';
  assert.equal(correr(JSON.stringify(envSinDefinir)).status, 1);
  const fuera = diffBueno();
  fuera.changes.push(cambio('auth.jwt_expiry', 'update', 100, 3600));
  assert.equal(correr(JSON.stringify(fuera)).status, 1);
  assert.equal(correr('basura').status, 1);
});
