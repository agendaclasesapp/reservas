#!/usr/bin/env node
// Escaneo del sitio publicado (SEC-19, NFR-02, H-008). Node 22, sin dependencias.
//   node scripts/seguridad/escanear-dist.mjs dist [--ref <ref>]
//   node scripts/seguridad/escanear-dist.mjs --url https://<usuario>.github.io/<repo>/ [--ref <ref>]
// Falla (exit 1) ante: archivos .map, .env*, supabase/ en dist; cualquier JWT que no sea role=anon con el
// ref esperado (una clave service_role es base64: el literal no aparece, hay que decodificar); una clave
// sb_secret_ o un token sbp_. La clave publicable sb_publishable_ y el JWT anon con el ref esperado pasan.
// El ref esperado sale de --ref, de SUPABASE_PROJECT_REF o de VITE_SUPABASE_URL (primer label del host).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const RE_JWT = /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g;
const RE_SECRETA = /sb_secret_[A-Za-z0-9_-]{8,}|\bsbp_[0-9a-f]{40}\b|GOCSPX-[A-Za-z0-9_-]{20,}/g;
const EXT_TEXTO = new Set(['.js', '.mjs', '.cjs', '.html', '.htm', '.css', '.json', '.txt', '.svg', '.xml', '.webmanifest', '']);

export function refEsperado(env = process.env) {
  if (env.SUPABASE_PROJECT_REF) return env.SUPABASE_PROJECT_REF;
  try {
    return new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
  } catch {
    return undefined;
  }
}

function decodificarPayload(jwt) {
  const partes = jwt.split('.');
  try {
    return JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
}

// Fragmentos base64 (en las tres alineaciones) del texto `"role":"service_role"`: cubren un payload
// que el regex de JWT no vea entero (partido o con otro encabezado).
function huellasServiceRole() {
  const huellas = new Set();
  for (const texto of ['"role":"service_role"', '"role": "service_role"']) {
    for (let desfase = 0; desfase < 3; desfase++) {
      const b64 = Buffer.from('x'.repeat(desfase) + texto).toString('base64');
      // Se descartan los caracteres del borde que dependen de lo que rodee al texto.
      huellas.add(b64.slice(Math.ceil((desfase * 4) / 3) + 1, -4));
    }
  }
  return [...huellas].filter((h) => h.length >= 12);
}
const HUELLAS = huellasServiceRole();

/** Revisa un texto. Devuelve la lista de hallazgos (vacia si esta limpio). */
export function escanearTexto(texto, origen, { ref } = {}) {
  const hallazgos = [];
  for (const m of texto.matchAll(RE_JWT)) {
    const p = decodificarPayload(m[0]);
    if (!p) {
      hallazgos.push(`${origen}: texto con forma de JWT que no se puede decodificar`);
    } else if (p.role !== 'anon') {
      hallazgos.push(`${origen}: JWT con role=${JSON.stringify(p.role)} (solo se permite anon)`);
    } else if (!ref) {
      hallazgos.push(`${origen}: JWT anon sin ref esperado (definir --ref o VITE_SUPABASE_URL)`);
    } else if (p.ref !== ref) {
      hallazgos.push(`${origen}: JWT anon con ref=${JSON.stringify(p.ref)}, se esperaba ${ref}`);
    }
  }
  for (const h of HUELLAS) {
    if (texto.includes(h)) {
      hallazgos.push(`${origen}: fragmento base64 de un payload con role service_role`);
      break;
    }
  }
  for (const m of texto.matchAll(RE_SECRETA)) {
    hallazgos.push(`${origen}: valor con forma de secreto (${m[0].slice(0, 8)}...)`);
  }
  return hallazgos;
}

function archivosDe(dir) {
  const salida = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) salida.push({ ruta, directorio: true }, ...archivosDe(ruta));
    else salida.push({ ruta, directorio: false });
  }
  return salida;
}

/** Escanea un directorio dist/. */
export function escanearDirectorio(dir, opciones = {}) {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [`${dir}: no existe o no es un directorio`];
  const hallazgos = [];
  let archivos = 0;
  for (const { ruta, directorio } of archivosDe(dir)) {
    const rel = relative(dir, ruta).split(sep).join('/');
    const nombre = basename(ruta);
    if (directorio) {
      if (nombre === 'supabase') hallazgos.push(`${rel}/: directorio supabase/ en el sitio`);
      continue;
    }
    archivos++;
    if (nombre.endsWith('.map')) hallazgos.push(`${rel}: source map publicado`);
    if (nombre === '.env' || nombre.startsWith('.env.')) hallazgos.push(`${rel}: archivo .env`);
    if (EXT_TEXTO.has(extname(nombre).toLowerCase())) {
      hallazgos.push(...escanearTexto(readFileSync(ruta, 'utf8'), rel, opciones));
    }
  }
  if (archivos === 0) hallazgos.push(`${dir}: vacio, no hay nada que publicar`);
  return hallazgos;
}

const RE_ASSET = /(?:src|href)=["']([^"']+)["']|["'`]((?:\.\/|\/)?[A-Za-z0-9_./-]*[A-Za-z0-9_-]+\.(?:js|mjs|css))["'`]/g;

/** Escanea el sitio publicado: baja index.html, sus assets, los chunks que citan y sondea archivos prohibidos. */
export async function escanearUrl(base, opciones = {}, pedir = fetch) {
  const hallazgos = [];
  const raiz = base.endsWith('/') ? base : `${base}/`;
  const vistos = new Set();
  const cola = [raiz];
  while (cola.length > 0 && vistos.size < 200) {
    const url = cola.shift();
    if (vistos.has(url)) continue;
    vistos.add(url);
    const r = await pedir(url, { redirect: 'follow' });
    if (!r.ok) {
      hallazgos.push(`${url}: respuesta ${r.status}`);
      continue;
    }
    const texto = await r.text();
    hallazgos.push(...escanearTexto(texto, url, opciones));
    for (const m of texto.matchAll(RE_ASSET)) {
      const cita = m[1] ?? m[2];
      if (!cita || !/\.(?:js|mjs|css|html)(?:[?#].*)?$/.test(cita)) continue;
      let destino;
      try {
        destino = new URL(cita, url);
      } catch {
        continue;
      }
      destino.hash = '';
      if (destino.href.startsWith(raiz)) cola.push(destino.href);
    }
  }
  for (const url of vistos) {
    if (!url.endsWith('.js')) continue;
    const r = await pedir(`${url}.map`, { redirect: 'follow' });
    if (r.status === 200) hallazgos.push(`${url}.map: source map publicado`);
  }
  for (const ruta of ['.env', '.env.local', '.env.example', 'supabase/config.toml', 'supabase/.env.development']) {
    const r = await pedir(new URL(ruta, raiz).href, { redirect: 'follow' });
    if (r.status === 200) hallazgos.push(`${ruta}: publicado en el sitio`);
  }
  if (vistos.size < 2) hallazgos.push(`${raiz}: no se encontro ningun asset que revisar`);
  return hallazgos;
}

async function main(argv) {
  const args = argv.slice(2);
  const opciones = { ref: refEsperado() };
  let url;
  let dir;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url') url = args[++i];
    else if (args[i] === '--ref') opciones.ref = args[++i];
    else dir = args[i];
  }
  if (!url && !dir) {
    console.error('Uso: escanear-dist.mjs <dist> | --url <https://...> [--ref <ref>]');
    return 2;
  }
  if (!opciones.ref) {
    console.error('Falta el ref esperado: --ref, SUPABASE_PROJECT_REF o VITE_SUPABASE_URL');
    return 2;
  }
  const hallazgos = url ? await escanearUrl(url, opciones) : escanearDirectorio(dir, opciones);
  if (hallazgos.length > 0) {
    console.error(`escanear-dist: ${hallazgos.length} hallazgo(s)`);
    for (const h of hallazgos) console.error(`  - ${h}`);
    return 1;
  }
  console.log(`escanear-dist: limpio (${url ?? dir}, ref ${opciones.ref})`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main(process.argv);
}
