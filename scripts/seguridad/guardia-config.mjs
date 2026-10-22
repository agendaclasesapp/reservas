#!/usr/bin/env node
// Guardia de `supabase config push` (ADR-012, H-005, H-022). Node 22, sin dependencias.
//   npx supabase@2.121.0 config diff --project-ref <ref> --output-format json > diff.json
//   node scripts/seguridad/guardia-config.mjs diff.json [--permitidos <archivo>] [--ref <ref>]
// (la CLI 2.121 no acepta `-o json` en `config diff`: el formato va con `--output-format json`).
// Falla (exit 1) si el diff trae `127.0.0.1` o `env(` (una variable sin definir se empuja como literal), si
// trae un `update` de un campo que no esta en config-permitida.json, o si la salida no es un diff valido.
// Falla tambien si RTC_TURNSTILE_SECRET del entorno es el secreto de prueba de Turnstile (H-181).
// Los `remote_only` (SMTP, secreto de Google) no se tocan en el push y no se juzgan. Deja el diff en el
// resumen del job (GITHUB_STEP_SUMMARY) para el revisor del environment `produccion`.
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const PROHIBIDOS = ['127.0.0.1', 'env('];
// Secretos de PRUEBA de Turnstile (documentacion de Cloudflare): siempre pasan. En produccion anulan el CAPTCHA (H-181).
export const SECRETOS_TURNSTILE_PRUEBA = [
  '1x0000000000000000000000000000000AA',
  '2x0000000000000000000000000000000AA',
  '3x0000000000000000000000000000000AA',
];

/** H-181: falla si RTC_TURNSTILE_SECRET es un secreto de prueba conocido (la CLI lo carga de supabase/.env.development). */
export function evaluarEntorno(env = process.env) {
  const v = (env.RTC_TURNSTILE_SECRET ?? '').trim();
  return SECRETOS_TURNSTILE_PRUEBA.includes(v)
    ? ['RTC_TURNSTILE_SECRET es el secreto de PRUEBA de Turnstile (siempre pasa): un config push lo mandaria a produccion y anularia el CAPTCHA (H-181)']
    : [];
}

/** Extrae el JSON de la salida de la CLI (puede traer lineas de texto antes). */
export function parsearDiff(texto) {
  const i = texto.indexOf('{');
  if (i < 0) throw new Error('la salida no contiene un objeto JSON');
  const d = JSON.parse(texto.slice(i));
  if (!Array.isArray(d.changes)) throw new Error('el JSON no trae `changes[]`: no es la salida de `config diff`');
  return d;
}

/** Evalua el diff. Devuelve { errores, updates, locales }. */
export function evaluarDiff(diff, permitidos, { ref } = {}) {
  const errores = [];
  if (ref && diff.target?.project_ref !== ref) {
    errores.push(`el diff es de ${JSON.stringify(diff.target?.project_ref)}, se esperaba ${ref}`);
  }
  if (!diff.scope?.present?.includes('auth')) errores.push('el diff no comparo Auth (scope.present sin `auth`)');
  const crudo = JSON.stringify(diff);
  for (const p of PROHIBIDOS) {
    if (crudo.includes(p)) errores.push(`el diff contiene ${JSON.stringify(p)}: un valor local llegaria al proyecto`);
  }
  const updates = diff.changes.filter((c) => c.class === 'update').map((c) => c.path.join('.'));
  for (const campo of updates) {
    if (!permitidos.includes(campo)) errores.push(`update fuera de config-permitida.json: ${campo}`);
  }
  return { errores, updates, locales: diff.changes.filter((c) => c.class === 'local_only').length };
}

export function cargarPermitidos(ruta = join(AQUI, 'config-permitida.json')) {
  const j = JSON.parse(readFileSync(ruta, 'utf8'));
  if (!Array.isArray(j.permitidos)) throw new Error(`${ruta}: falta la lista \`permitidos\``);
  return j.permitidos;
}

function resumen(diff, resultado) {
  const filas = diff.changes
    .filter((c) => c.class === 'update')
    .map((c) => `| \`${c.path.join('.')}\` | \`${JSON.stringify(c.remote)}\` | \`${JSON.stringify(c.local)}\` |`);
  return [
    '### Diff de `config push` (lo que cambiaria en el proyecto)',
    '',
    filas.length ? '| Campo | Hoy en el proyecto | Quedaria |\n| --- | --- | --- |\n' + filas.join('\n') : 'Sin cambios (`update`).',
    '',
    `Campos solo locales sin valor remoto: ${resultado.locales}.`,
    resultado.errores.length ? `\n**Guardia: ${resultado.errores.length} error(es)**\n- ${resultado.errores.join('\n- ')}` : '\n**Guardia: aprobado.**',
    '',
  ].join('\n');
}

function main(argv) {
  const args = argv.slice(2);
  let archivo;
  let ref;
  let permitidosRuta;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ref') ref = args[++i];
    else if (args[i] === '--permitidos') permitidosRuta = args[++i];
    else archivo = args[i];
  }
  if (!archivo) {
    console.error('Uso: guardia-config.mjs <diff.json> [--permitidos <archivo>] [--ref <ref>]');
    return 2;
  }
  let diff;
  try {
    diff = parsearDiff(readFileSync(archivo === '-' ? 0 : archivo, 'utf8'));
  } catch (e) {
    console.error(`guardia-config: ${e.message}`);
    return 1;
  }
  const resultado = evaluarDiff(diff, cargarPermitidos(permitidosRuta), { ref });
  resultado.errores.push(...evaluarEntorno());
  const texto = resumen(diff, resultado);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, texto);
  if (resultado.errores.length > 0) {
    console.error('guardia-config: BLOQUEADO');
    for (const e of resultado.errores) console.error(`  - ${e}`);
    return 1;
  }
  console.log(`guardia-config: aprobado (${resultado.updates.length} update permitidos: ${resultado.updates.join(', ') || 'ninguno'})`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main(process.argv);
}
