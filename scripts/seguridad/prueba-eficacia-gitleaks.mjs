#!/usr/bin/env node
// Prueba de eficacia del escaneo de secretos (SEC-18): crea en un directorio temporal un archivo con un
// patron FALSO de cada tipo y exige que gitleaks (con .gitleaks.toml) los detecte (exit 1); un archivo
// limpio, con la clave publicable y con una clave demo local, debe pasar (exit 0). Los falsos se arman en
// tiempo de ejecucion: este archivo no tiene ningun literal con forma de secreto.
//   GITLEAKS=<ruta al binario> node scripts/seguridad/prueba-eficacia-gitleaks.mjs   (por defecto `gitleaks`)
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GITLEAKS = process.env.GITLEAKS ?? 'gitleaks';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (p) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(p)}.${'Zq9'.repeat(14)}`;
const letras = 'abcdefghijklmnopqrstuvwxyz';
const alfa = (n, desde = 0) => Array.from({ length: n }, (_, i) => letras[(desde + i * 7) % 26]).join('');

const MALOS = {
  'gmail-app-password-sin-espacios.env': `GMAIL_APP_PASSWORD="${alfa(16)}"\n`,
  'gmail-app-password-con-espacios.env': `GMAIL_APP_PASSWORD=${[0, 4, 8, 12].map((d) => alfa(4, d)).join(' ')}\n`,
  'google-oauth.env': `GOOGLE_SECRET=GOCSPX-${'Ab1_'.repeat(7)}\n`,
  'jwt-service-role.js': `const k = "${jwt({ iss: 'supabase', ref: 'xxxxxxxxxxxxxxxxxxxx', role: 'service_role', iat: 1, exp: 2 })}";\n`,
  'jwt-anon-real.js': `const k = "${jwt({ iss: 'supabase', ref: 'xxxxxxxxxxxxxxxxxxxx', role: 'anon', iat: 1, exp: 2 })}";\n`,
  'supabase-sb-secret.env': `KEY=sb_secret_${'Zk3'.repeat(9)}\n`,
  'supabase-token.env': `TOKEN=sbp_${'0123456789abcdef'.repeat(3).slice(0, 40)}\n`,
};
const BUENOS = {
  'limpio.ts': 'export const suma = (a: number, b: number) => a + b;\n',
  'publicable.env': `VITE_SUPABASE_ANON_KEY=sb_publishable_${'Qw3Er_'.repeat(5)}\n`,
  'config.toml': 'secret = "env(RTC_GOOGLE_SECRET)"\nGMAIL_APP_PASSWORD = "env(GMAIL_APP_PASSWORD)"\n',
  'jwt-demo-local.js': `const k = "${jwt({ iss: 'supabase-demo', role: 'anon', exp: 1983812996 })}";\n`,
};

function gitleaks(dir) {
  return spawnSync(
    GITLEAKS,
    ['detect', '--no-git', '--source', dir, '--config', join(RAIZ, '.gitleaks.toml'), '--redact', '--no-banner', '--exit-code', '1'],
    { encoding: 'utf8' },
  );
}

const base = mkdtempSync(join(tmpdir(), 'eficacia-gitleaks-'));
let fallos = 0;
try {
  for (const [grupo, archivos, esperado] of [['malo', MALOS, 1], ['bueno', BUENOS, 0]]) {
    for (const [nombre, contenido] of Object.entries(archivos)) {
      const dir = join(base, `${grupo}-${nombre}`);
      mkdirSync(dir);
      writeFileSync(join(dir, nombre), contenido);
      const r = gitleaks(dir);
      if (r.error) {
        console.error(`no se pudo ejecutar ${GITLEAKS}: ${r.error.message}`);
        process.exitCode = 2;
        break;
      }
      const ok = r.status === esperado;
      if (!ok) fallos++;
      console.log(`${ok ? 'OK ' : 'FALLA'} ${grupo.padEnd(5)} ${nombre} (exit ${r.status}, esperado ${esperado})`);
    }
  }
} finally {
  rmSync(base, { recursive: true, force: true });
}
if (process.exitCode !== 2) {
  console.log(fallos === 0 ? 'prueba de eficacia: gitleaks detecta todos los patrones y deja pasar los permitidos' : `prueba de eficacia: ${fallos} caso(s) fallaron`);
  process.exitCode = fallos === 0 ? 0 : 1;
}
