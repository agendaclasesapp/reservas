#!/usr/bin/env node
// Higiene de variables y secretos fuera de lugar (SEC-20, SEC-31, NFR-02). Node 22, sin dependencias.
//   node scripts/seguridad/revisar-variables.mjs [raiz]
// Falla (exit 1) ante:
//  - una VITE_* distinta de VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_BASE y VITE_TURNSTILE_SITEKEY (clave publica) en workflows, .env.example,
//    src/, index.html o vite.config.*;
//  - un valor en .env.example fuera de la lista de valores locales publicos (los secretos van vacios), o un
//    nombre obligatorio ausente, o un MAIL_SECRETO distinto del de supabase/.env.development;
//  - en supabase/config.toml, un valor que no sea env() en una clave de secreto o un literal con forma de secreto;
//  - en .github/workflows/, un token o una accion de servicios de pago (SEC-31).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

export const VITE_PERMITIDAS = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_BASE', 'VITE_TURNSTILE_SITEKEY'];
// VITE_TURNSTILE_SITEKEY: clave publica del sitio de Cloudflare Turnstile (ADR-016), publica por diseno.

// Valores no secretos que .env.example puede traer (configuracion local del stack de Supabase CLI).
export const VALORES_LOCALES = { VITE_BASE: '/', SMTP_HOST: 'inbucket', SMTP_PORT: '1025', SMTP_TLS: 'false',
  // Claves de PRUEBA publicas de Cloudflare Turnstile (siempre pasan): unico valor admitido para estas dos (ADR-016).
  VITE_TURNSTILE_SITEKEY: '1x00000000000000000000AA', RTC_TURNSTILE_SECRET: '1x0000000000000000000000000000000AA' };

export const NOMBRES_OBLIGATORIOS = [
  'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_BASE', 'SUPABASE_PROJECT_REF',
  'SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD', 'GMAIL_USER', 'GMAIL_APP_PASSWORD', 'MAIL_SECRETO',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_TLS', 'RTC_SITE_URL', 'RTC_REDIRECT_URL', 'RTC_GOOGLE_CLIENT_ID', 'RTC_GOOGLE_SECRET',
];

const FORMAS_SECRETO = [
  /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /GOCSPX-[A-Za-z0-9_-]{20,}/,
  /sb_secret_[A-Za-z0-9_-]{8,}/,
  /\bsbp_[0-9a-f]{40}\b/,
  /["'=]\s*[a-z]{4}(?: ?[a-z]{4}){3}\s*["']/,
];

const PAGOS_TOKENS = ['SNYK_TOKEN', 'SEMGREP_APP_TOKEN', 'GITLEAKS_LICENSE', 'CODECOV_TOKEN', 'SONAR_TOKEN', 'WHITESOURCE', 'CHECKMARX'];
const PAGOS_ACCIONES = [/uses:\s*snyk\//i, /uses:\s*semgrep\//i, /uses:\s*returntocorp\//i, /uses:\s*codecov\//i, /uses:\s*gitleaks\/gitleaks-action/i, /uses:\s*sonarsource\//i, /uses:\s*checkmarx/i];

const leer = (ruta) => readFileSync(ruta, 'utf8');

function listar(dir, filtro) {
  if (!existsSync(dir)) return [];
  const salida = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') salida.push(...listar(ruta, filtro));
    } else if (filtro(ruta)) salida.push(ruta);
  }
  return salida;
}

export function revisarVite(raiz) {
  const errores = [];
  const archivos = [
    ...listar(join(raiz, '.github', 'workflows'), (r) => /\.ya?ml$/.test(r)),
    ...listar(join(raiz, 'src'), (r) => /\.(?:[cm]?[jt]sx?|css|html)$/.test(r)),
    ...['.env.example', 'index.html', 'vite.config.ts', 'vite.config.js'].map((f) => join(raiz, f)).filter(existsSync),
  ];
  for (const ruta of archivos) {
    for (const m of leer(ruta).matchAll(/\bVITE_[A-Z0-9_]+\b/g)) {
      if (!VITE_PERMITIDAS.includes(m[0])) errores.push(`${relative(raiz, ruta)}: variable ${m[0]} no permitida (SEC-20)`);
    }
  }
  return errores;
}

function parsearEnv(texto) {
  const valores = new Map();
  for (const linea of texto.split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z][A-Z0-9_]*)\s*=(.*)$/);
    if (m) valores.set(m[1], m[2].trim().replace(/^["']|["']$/g, ''));
  }
  return valores;
}

export function revisarEnvExample(raiz) {
  const errores = [];
  const ruta = join(raiz, '.env.example');
  if (!existsSync(ruta)) return ['.env.example: no existe'];
  const ejemplo = parsearEnv(leer(ruta));
  for (const n of NOMBRES_OBLIGATORIOS) if (!ejemplo.has(n)) errores.push(`.env.example: falta ${n}`);
  const dev = join(raiz, 'supabase', '.env.development');
  const local = existsSync(dev) ? parsearEnv(leer(dev)) : new Map();
  for (const [nombre, valor] of ejemplo) {
    if (valor === '') continue;
    if (nombre === 'MAIL_SECRETO') {
      if (valor !== local.get('MAIL_SECRETO')) errores.push('.env.example: MAIL_SECRETO debe ser el valor de prueba de supabase/.env.development');
    } else if (nombre === 'VITE_BASE' && /^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(valor)) {
      continue; // ruta base del sitio (ADR-007), no un secreto
    } else if (VALORES_LOCALES[nombre] !== valor) {
      errores.push(`.env.example: ${nombre} trae un valor (solo se admiten los locales publicos y MAIL_SECRETO de prueba; SEC-20)`);
    }
  }
  return errores;
}

export function revisarConfigToml(raiz) {
  const ruta = join(raiz, 'supabase', 'config.toml');
  if (!existsSync(ruta)) return ['supabase/config.toml: no existe'];
  const errores = [];
  leer(ruta).split(/\r?\n/).forEach((linea, i) => {
    if (/^\s*#/.test(linea)) return;
    const m = linea.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*"(.*)"\s*$/);
    if (m && /secret|password|token|(?:api|access|private)_?key/i.test(m[1]) && m[2] !== '' && !/^env\([A-Z0-9_]+\)$/.test(m[2])) {
      errores.push(`supabase/config.toml:${i + 1}: ${m[1]} debe ser env(...) o vacio`);
    }
    if (FORMAS_SECRETO.some((re) => re.test(linea))) errores.push(`supabase/config.toml:${i + 1}: literal con forma de secreto`);
  });
  return errores;
}

export function revisarPago(raiz) {
  const errores = [];
  for (const ruta of listar(join(raiz, '.github', 'workflows'), (r) => /\.ya?ml$/.test(r))) {
    const texto = leer(ruta);
    for (const t of PAGOS_TOKENS) {
      if (texto.includes(t)) errores.push(`${relative(raiz, ruta)}: ${t} (servicio de pago o con cuenta externa, SEC-31)`);
    }
    for (const re of PAGOS_ACCIONES) {
      if (re.test(texto)) errores.push(`${relative(raiz, ruta)}: accion de pago o con cuenta externa (${re.source}, SEC-31)`);
    }
  }
  return errores;
}

export function revisarTodo(raiz = '.') {
  if (!statSync(raiz, { throwIfNoEntry: false })?.isDirectory()) return [`${raiz}: no es un directorio`];
  return [...revisarVite(raiz), ...revisarEnvExample(raiz), ...revisarConfigToml(raiz), ...revisarPago(raiz)];
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const errores = revisarTodo(process.argv[2] ?? '.');
  if (errores.length > 0) {
    console.error(`revisar-variables: ${errores.length} problema(s)`);
    for (const e of errores) console.error(`  - ${e}`);
    process.exitCode = 1;
  } else {
    console.log('revisar-variables: sin problemas');
  }
}
