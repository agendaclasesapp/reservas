// Utilidades comunes de las mediciones de B13 (T13.1). Solo stack local (127.0.0.1); datos sintéticos con prefijo «PERF ».
import { createHmac } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

export const RAIZ = process.cwd();
export const API = process.env.RTC_API_URL ?? 'http://127.0.0.1:54321';
export const DB = process.env.RTC_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
// Secreto JWT por defecto del stack local de Supabase (documentado, solo local). Con él se firman las sesiones sintéticas.
export const JWT_SECRET = process.env.RTC_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long';
export const PREFIJO = 'PERF ';
export const SLUGS = ['profesor-prueba', 'profesora-b'];

// H-420: la guardia mira el host de la URL analizada, no el texto (un «localhost» en usuario, parámetro o subdominio no cuenta).
const HOSTS_LOCALES = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
export function esLocal(url) {
  try {
    return HOSTS_LOCALES.has(new URL(url).hostname);
  } catch {
    return false;
  }
}
if (!esLocal(API) || !esLocal(DB)) throw new Error('Solo contra el stack local (API y base en 127.0.0.1, localhost o ::1)');
if (process.env.RTC_JWT_SECRET && !(esLocal(API) && esLocal(DB))) throw new Error('RTC_JWT_SECRET solo con el stack local');

export function anonKey() {
  if (process.env.RTC_ANON_KEY) return process.env.RTC_ANON_KEY;
  const f = resolve(RAIZ, '.env.local');
  if (existsSync(f)) {
    const m = /^VITE_SUPABASE_ANON_KEY=(.+)$/m.exec(readFileSync(f, 'utf8'));
    if (m) return m[1].trim();
  }
  throw new Error('Define RTC_ANON_KEY (clave anon del stack local)');
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export function firmarJwt(sub, email, horas = 2) {
  const ahora = Math.floor(Date.now() / 1000);
  const cuerpo = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase-demo', aud: 'authenticated', role: 'authenticated', sub, email, iat: ahora, exp: ahora + horas * 3600 })}`;
  return `${cuerpo}.${createHmac('sha256', JWT_SECRET).update(cuerpo).digest('base64url')}`;
}

export async function conectar() {
  const c = new pg.Client({ connectionString: DB });
  await c.connect();
  return c;
}

export function percentil(valores, p) {
  const v = [...valores].sort((a, b) => a - b);
  if (!v.length) return null;
  const k = (p / 100) * (v.length - 1);
  const f = Math.floor(k), c = Math.ceil(k);
  return v[f] + (v[c] - v[f]) * (k - f);
}
