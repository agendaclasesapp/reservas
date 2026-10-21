// Pruebas de escanear-dist.mjs (SEC-19, H-008): `node --test scripts/seguridad/`
// Los JWT son falsos y se arman en tiempo de ejecucion: ningun literal con forma de secreto en el repo.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { escanearDirectorio, escanearTexto, escanearUrl, refEsperado } from './escanear-dist.mjs';

const REF = 'abcdefghijklmnopqrst';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (payload) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.${'f'.repeat(43)}`;
const claveAnon = (ref = REF) => jwt({ iss: 'supabase', ref, role: 'anon', iat: 1, exp: 2 });
const claveServicio = (ref = REF) => jwt({ iss: 'supabase', ref, role: 'service_role', iat: 1, exp: 2 });

const temporales = [];
function distDe(archivos) {
  const dir = mkdtempSync(join(tmpdir(), 'dist-prueba-'));
  temporales.push(dir);
  for (const [nombre, contenido] of Object.entries(archivos)) {
    const ruta = join(dir, nombre);
    mkdirSync(join(ruta, '..'), { recursive: true });
    writeFileSync(ruta, contenido);
  }
  return dir;
}
afterEach(() => {
  while (temporales.length > 0) rmSync(temporales.pop(), { recursive: true, force: true });
});

test('un dist con la clave anon del ref esperado pasa', () => {
  const dir = distDe({ 'index.html': '<script src="a.js"></script>', 'a.js': `const k="${claveAnon()}";` });
  assert.deepEqual(escanearDirectorio(dir, { ref: REF }), []);
});

test('un dist con la clave publicable sb_publishable_ pasa', () => {
  const dir = distDe({ 'index.html': '<html></html>', 'a.js': 'const k="sb_publishable_AbCdEfGhIjKlMnOpQrStUv_0123456789";' });
  assert.deepEqual(escanearDirectorio(dir, { ref: REF }), []);
});

test('un dist con un JWT service_role falso falla (H-008)', () => {
  const dir = distDe({ 'index.html': '<html></html>', 'assets/index-1.js': `const k="${claveServicio()}";` });
  const h = escanearDirectorio(dir, { ref: REF });
  assert.ok(h.some((x) => x.includes('service_role')), h.join('\n'));
});

test('un JWT anon de otro proyecto falla', () => {
  const dir = distDe({ 'index.html': '<html></html>', 'a.js': claveAnon('otroproyectoxxxxxxxxx') });
  assert.equal(escanearDirectorio(dir, { ref: REF }).length, 1);
});

test('un JWT que no se decodifica o sin role falla', () => {
  const sinRole = jwt({ iss: 'supabase', ref: REF });
  const dir = distDe({ 'index.html': '<html></html>', 'a.js': `${sinRole} eyJhbGciOiJIUzI1NiJ9.eyJ%%%.firma12345` });
  assert.ok(escanearDirectorio(dir, { ref: REF }).length >= 1);
});

test('un payload service_role partido o sin encabezado se detecta por su huella base64', () => {
  for (const relleno of ['', 'x', 'xx']) {
    const payload = Buffer.from(`${relleno}{"iss":"supabase","role":"service_role"}`).toString('base64');
    assert.ok(escanearTexto(`const p="${payload}";`, 'a.js', { ref: REF }).length >= 1, `relleno ${relleno.length}`);
  }
});

test('sb_secret_, sbp_ y GOCSPX- fallan', () => {
  assert.equal(escanearTexto(`k="sb_secret_${'A'.repeat(24)}"`, 'a.js', { ref: REF }).length, 1);
  assert.equal(escanearTexto(`k="sbp_${'0'.repeat(40)}"`, 'a.js', { ref: REF }).length, 1);
  assert.equal(escanearTexto(`k="GOCSPX-${'a'.repeat(28)}"`, 'a.js', { ref: REF }).length, 1);
});

test('.map, .env* y supabase/ en dist fallan', () => {
  const dir = distDe({
    'index.html': '<html></html>',
    'assets/a.js.map': '{}',
    '.env.local': 'X=1',
    'supabase/config.toml': 'project_id = "x"',
  });
  const h = escanearDirectorio(dir, { ref: REF }).join('\n');
  assert.match(h, /a\.js\.map: source map/);
  assert.match(h, /\.env\.local: archivo \.env/);
  assert.match(h, /supabase\/: directorio supabase/);
});

test('un dist vacio o inexistente falla', () => {
  assert.equal(escanearDirectorio(distDe({}), { ref: REF }).length, 1);
  assert.equal(escanearDirectorio(join(tmpdir(), 'no-existe-dist-xyz'), { ref: REF }).length, 1);
});

test('refEsperado sale de la URL de Supabase', () => {
  assert.equal(refEsperado({ VITE_SUPABASE_URL: `https://${REF}.supabase.co` }), REF);
  assert.equal(refEsperado({ SUPABASE_PROJECT_REF: 'zzz', VITE_SUPABASE_URL: `https://${REF}.supabase.co` }), 'zzz');
  assert.equal(refEsperado({}), undefined);
});

// --- modo --url, con un servidor simulado ---
function sitio(archivos) {
  return async (url) => {
    const ruta = new URL(url).pathname.replace(/^\/reservas\//, '');
    const cuerpo = archivos[ruta === '' ? 'index.html' : ruta];
    return cuerpo === undefined
      ? { ok: false, status: 404, text: async () => 'no encontrado' }
      : { ok: true, status: 200, text: async () => cuerpo };
  };
}
const BASE = 'https://agendaclasesapp.github.io/reservas/';

test('--url: sitio limpio pasa, sigue los chunks y sondea .map y .env', async () => {
  const pedir = sitio({
    'index.html': '<script type="module" src="/reservas/assets/index-1.js"></script>',
    'assets/index-1.js': `import("./chunk-2.js");const k="${claveAnon()}";`,
    'assets/chunk-2.js': 'export default 1',
  });
  assert.deepEqual(await escanearUrl(BASE, { ref: REF }, pedir), []);
});

test('--url: un secreto en un chunk cargado de forma diferida falla', async () => {
  const pedir = sitio({
    'index.html': '<script type="module" src="/reservas/assets/index-1.js"></script>',
    'assets/index-1.js': 'import("./chunk-2.js")',
    'assets/chunk-2.js': `const k="${claveServicio()}";`,
  });
  const h = await escanearUrl(BASE, { ref: REF }, pedir);
  assert.ok(h.some((x) => x.includes('chunk-2.js') && x.includes('service_role')), h.join('\n'));
});

test('--url: un .map o un .env publicados fallan', async () => {
  const pedir = sitio({
    'index.html': '<script type="module" src="/reservas/assets/index-1.js"></script>',
    'assets/index-1.js': 'x',
    'assets/index-1.js.map': '{}',
    '.env': 'A=1',
  });
  const h = (await escanearUrl(BASE, { ref: REF }, pedir)).join('\n');
  assert.match(h, /index-1\.js\.map: source map/);
  assert.match(h, /\.env: publicado/);
});

test('--url: un sitio que no responde falla', async () => {
  const h = await escanearUrl(BASE, { ref: REF }, sitio({}));
  assert.ok(h.length >= 1);
});
