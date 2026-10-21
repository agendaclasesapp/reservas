#!/usr/bin/env node
// `npm audit` con excepciones vencibles (SEC-22). Node 22, sin dependencias.
//   node scripts/seguridad/auditar.mjs            (produccion: alta o critica bloquea)
//   node scripts/seguridad/auditar.mjs --dev      (todo el arbol: solo critica bloquea)
// Lee seguridad/excepciones-audit.json: { "excepciones": [{ "id": "GHSA-xxxx-xxxx-xxxx", "motivo": "...",
// "aprobada": "AAAA-MM-DD", "vence": "AAAA-MM-DD", "aceptadaPor": "..." }] }. Una excepcion sin motivo, sin
// aceptacion, vencida o con mas de 30 dias entre `aprobada` y `vence` hace fallar el comando, aunque el
// aviso ya no exista (hay que borrarla). Las excepciones las acepta el humano (aprobacion/riesgos.md).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIA = 86_400_000;

export function validarExcepciones(excepciones, hoy = new Date()) {
  const errores = [];
  for (const e of excepciones) {
    const id = e.id ?? '(sin id)';
    if (!/^GHSA(?:-[a-z0-9]{4}){3}$/.test(e.id ?? '')) errores.push(`${id}: el id debe ser un GHSA-xxxx-xxxx-xxxx`);
    if (!e.motivo) errores.push(`${id}: falta el motivo`);
    if (!e.aceptadaPor) errores.push(`${id}: falta quien la acepta (el humano)`);
    const aprobada = Date.parse(e.aprobada);
    const vence = Date.parse(e.vence);
    if (Number.isNaN(aprobada) || Number.isNaN(vence)) {
      errores.push(`${id}: aprobada y vence deben ser fechas AAAA-MM-DD`);
      continue;
    }
    if (vence - aprobada > 30 * DIA) errores.push(`${id}: vigencia mayor a 30 dias`);
    if (vence < Date.parse(hoy.toISOString().slice(0, 10))) errores.push(`${id}: excepcion vencida el ${e.vence} (renovar con aceptacion o corregir la dependencia)`);
  }
  return errores;
}

/** Avisos (id GHSA, paquete, severidad) de la salida JSON de `npm audit` (formato v2). */
export function avisosDe(auditoria) {
  const avisos = [];
  for (const [paquete, v] of Object.entries(auditoria.vulnerabilities ?? {})) {
    for (const via of v.via ?? []) {
      if (typeof via === 'string') continue;
      const ghsa = (via.url ?? '').match(/GHSA(?:-[a-z0-9]{4}){3}/)?.[0];
      avisos.push({ id: ghsa ?? `source-${via.source}`, paquete: via.name ?? paquete, severidad: via.severity, titulo: via.title });
    }
  }
  return avisos;
}

const ORDEN = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

export function evaluar(auditoria, excepciones, { minimo = 'high', hoy = new Date() } = {}) {
  const errores = validarExcepciones(excepciones, hoy);
  const exceptuados = new Set(excepciones.map((e) => e.id));
  const bloqueantes = avisosDe(auditoria).filter((a) => ORDEN[a.severidad] >= ORDEN[minimo]);
  const vistos = new Set();
  for (const a of bloqueantes) {
    if (exceptuados.has(a.id) || vistos.has(`${a.id}${a.paquete}`)) continue;
    vistos.add(`${a.id}${a.paquete}`);
    errores.push(`${a.severidad} en ${a.paquete}: ${a.titulo ?? ''} (${a.id})`);
  }
  return errores;
}

function main(argv) {
  const dev = argv.includes('--dev');
  const ruta = join(RAIZ, 'seguridad', 'excepciones-audit.json');
  const excepciones = existsSync(ruta) ? JSON.parse(readFileSync(ruta, 'utf8')).excepciones ?? [] : [];
  const args = ['audit', '--json', ...(dev ? [] : ['--omit=dev'])];
  const r = spawnSync('npm', args, { encoding: 'utf8', cwd: RAIZ, shell: process.platform === 'win32' });
  let auditoria;
  try {
    auditoria = JSON.parse(r.stdout);
  } catch {
    console.error(`auditar: npm audit no devolvio JSON (${r.stderr?.trim().slice(0, 300)})`);
    return 1;
  }
  if (auditoria.error) {
    console.error(`auditar: ${auditoria.error.summary ?? 'error de npm audit'}`);
    return 1;
  }
  const errores = evaluar(auditoria, excepciones, { minimo: dev ? 'critical' : 'high' });
  if (errores.length > 0) {
    console.error(`auditar: ${errores.length} problema(s)`);
    for (const e of errores) console.error(`  - ${e}`);
    return 1;
  }
  console.log(`auditar: sin avisos bloqueantes (${dev ? 'todo el arbol, critica' : 'produccion, alta'}; ${excepciones.length} excepcion(es) vigente(s))`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main(process.argv.slice(2));
}
