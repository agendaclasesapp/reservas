#!/usr/bin/env node
// Endurecimiento de workflows (SEC-21, SEC-31, ADR-012). Node 22, sin dependencias; complementa a zizmor.
//   node scripts/seguridad/revisar-workflows.mjs [raiz]
// Falla (exit 1) ante, en .github/workflows/*.yml:
//  - `pull_request_target`;
//  - un `uses:` sin SHA completo (40 hex) que no sea una accion local (./);
//  - `${{ github.event.* }}`, `github.head_ref` o `inputs.*` dentro de un `run:` (inyeccion);
//  - un workflow sin `permissions:` de primer nivel, o con `write` fuera de lo permitido:
//    `pages` e `id-token` solo en el job `publicar`; `contents: write` nunca;
//  - supabase-deploy.yml con otro disparador que `workflow_dispatch` o sin `environment: produccion`;
//  - SUPABASE_ACCESS_TOKEN / SUPABASE_DB_PASSWORD fuera de supabase-deploy.yml.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// Parser YAML real (js-yaml, ya presente en el arbol por dependencias transitivas; no se agrega dependencia).
const jsYaml = createRequire(import.meta.url)('js-yaml');

const SHA = /^[0-9a-f]{40}$/;

const sangria = (l) => l.match(/^ */)[0].length;
const sinComentario = (l) => l.replace(/\s+#.*$/, '');

/** Lineas dentro de bloques `run:` (con su numero). */
function lineasRun(lineas) {
  const salida = [];
  for (let i = 0; i < lineas.length; i++) {
    const m = lineas[i].match(/^(\s*)(?:-\s+)?run:\s*(.*)$/);
    if (!m) continue;
    const resto = m[2].trim();
    if (resto !== '' && !/^[|>][+-]?\d*$/.test(resto)) {
      salida.push([i + 1, resto]);
      continue;
    }
    const base = sangria(lineas[i]) + (lineas[i].trimStart().startsWith('- ') ? 2 : 0);
    for (let j = i + 1; j < lineas.length; j++) {
      if (lineas[j].trim() !== '' && sangria(lineas[j]) <= base) break;
      salida.push([j + 1, lineas[j]]);
    }
  }
  return salida;
}

/** Nombre del job (clave con sangria 2 bajo `jobs:`) al que pertenece cada linea. */
function jobPorLinea(lineas) {
  const jobs = [];
  let enJobs = false;
  let actual;
  lineas.forEach((l, i) => {
    if (/^jobs:\s*$/.test(l)) enJobs = true;
    else if (/^\S/.test(l) && !/^jobs:/.test(l)) enJobs = false;
    const m = enJobs && l.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (m) actual = m[1];
    jobs[i] = enJobs ? actual : undefined;
  });
  return jobs;
}

/** Bloque `on:` del workflow: devuelve los disparadores. */
function disparadores(lineas) {
  const i = lineas.findIndex((l) => /^(?:on|"on"|'on'):/.test(l));
  if (i < 0) return [];
  const mismaLinea = lineas[i].replace(/^[^:]+:/, '').trim();
  if (mismaLinea.startsWith('[')) return mismaLinea.replace(/[[\]\s]/g, '').split(',').filter(Boolean);
  if (mismaLinea !== '') return [mismaLinea];
  const salida = [];
  for (let j = i + 1; j < lineas.length && (lineas[j].trim() === '' || sangria(lineas[j]) > 0); j++) {
    const m = lineas[j].match(/^ {2}([A-Za-z_]+):/);
    if (m) salida.push(m[1]);
  }
  return salida;
}

export function revisarWorkflow(nombre, texto) {
  const errores = [];
  try {
    jsYaml.load(texto);
  } catch (e) {
    const linea = e.mark ? e.mark.line + 1 : 1;
    return [`${nombre}:${linea}: YAML invalido: ${e.reason ?? e.message}`];
  }
  const lineas = texto.split(/\r?\n/);
  const donde = (n) => `${nombre}:${n}`;

  lineas.forEach((l, i) => {
    const c = sinComentario(l);
    if (/pull_request_target/.test(c)) errores.push(`${donde(i + 1)}: pull_request_target`);
    const u = c.match(/^\s*(?:-\s+)?uses:\s*(\S+)/);
    if (u && !u[1].startsWith('./')) {
      const [, ref] = u[1].split('@');
      if (!ref || !SHA.test(ref)) errores.push(`${donde(i + 1)}: accion sin SHA completo (${u[1]})`);
    }
  });

  for (const [n, linea] of lineasRun(lineas)) {
    if (/\$\{\{\s*(?:github\.event\.|github\.head_ref|inputs\.)/.test(linea)) {
      errores.push(`${donde(n)}: expresion de entrada no confiable dentro de run: (pasarla por env:)`);
    }
  }

  if (!lineas.some((l) => /^permissions:/.test(l))) errores.push(`${nombre}: falta permissions: de primer nivel`);
  const jobs = jobPorLinea(lineas);
  lineas.forEach((l, i) => {
    const c = sinComentario(l);
    const p = c.match(/^\s+(pages|id-token|contents):\s*write\b/);
    if (!p) return;
    if (p[1] === 'contents') errores.push(`${donde(i + 1)}: contents: write`);
    else if (jobs[i] !== 'publicar') errores.push(`${donde(i + 1)}: ${p[1]}: write fuera del job publicar (job ${jobs[i] ?? 'de primer nivel'})`);
  });

  const esDeploy = nombre === 'supabase-deploy.yml';
  const sec = /SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD/;
  if (!esDeploy && lineas.some((l) => sec.test(sinComentario(l)))) {
    errores.push(`${nombre}: SUPABASE_ACCESS_TOKEN/SUPABASE_DB_PASSWORD solo en supabase-deploy.yml`);
  }
  if (esDeploy) {
    const d = disparadores(lineas);
    if (d.length !== 1 || d[0] !== 'workflow_dispatch') errores.push(`${nombre}: debe dispararse solo con workflow_dispatch (tiene ${d.join(', ') || 'ninguno'})`);
    if (!lineas.some((l) => /^\s+environment:\s*produccion\s*$/.test(sinComentario(l)) || /^\s+name:\s*produccion\s*$/.test(sinComentario(l)))) {
      errores.push(`${nombre}: falta environment produccion`);
    }
  }
  return errores;
}

export function revisarWorkflows(raiz = '.') {
  const dir = join(raiz, '.github', 'workflows');
  if (!existsSync(dir)) return [`${dir}: no existe`];
  const archivos = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
  if (archivos.length === 0) return [`${dir}: sin workflows`];
  return archivos.flatMap((f) => revisarWorkflow(f, readFileSync(join(dir, f), 'utf8')));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const errores = revisarWorkflows(process.argv[2] ?? '.');
  if (errores.length > 0) {
    console.error(`revisar-workflows: ${errores.length} problema(s)`);
    for (const e of errores) console.error(`  - ${e}`);
    process.exitCode = 1;
  } else {
    console.log('revisar-workflows: sin problemas');
  }
}
