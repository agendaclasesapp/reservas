// T-NFR-10 (CA-36, NFR-04, ADR-017): kB gzip (nivel 9) que descarga la ruta de agenda `#/p/<slug>` = entrada + chunk de la
// agenda + sus imports estáticos y CSS. Mismo método que spikes/S03/app/medir-bundle.mjs, con la ruta actual de la agenda
// (src/modulos/agenda/vistas/Pagina.tsx). Informa además, aparte, el chunk diferido de supabase-js (ADR-017: se pide en
// paralelo para la sesión) y el total de JS.
// Uso: node perf/medir-bundle.mjs [dist=perf/.dist] [salida.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const DIST = process.argv[2] ?? 'perf/.dist';
const SALIDA = process.argv[3];
const manifest = JSON.parse(readFileSync(`${DIST}/.vite/manifest.json`, 'utf8'));
const gz = (f) => gzipSync(readFileSync(`${DIST}/${f}`), { level: 9 }).length;
const crudo = (f) => readFileSync(`${DIST}/${f}`).length;

function cierre(clave, vistos = new Set()) {
  const e = manifest[clave];
  if (!e || vistos.has(e.file)) return vistos;
  vistos.add(e.file);
  for (const css of e.css ?? []) vistos.add(css);
  for (const imp of e.imports ?? []) cierre(imp, vistos);
  return vistos;
}
const entrada = Object.keys(manifest).find((k) => manifest[k].isEntry);
const agenda = Object.keys(manifest).find((k) => k.endsWith('modulos/agenda/vistas/Pagina.tsx'));
const supa = Object.keys(manifest).find((k) => k.includes('supabase-cliente'));
const archivos = cierre(agenda, cierre(entrada));
const filas = [];
let tg = 0, tc = 0;
for (const f of archivos) {
  if (f.endsWith('.html')) continue;
  tg += gz(f);
  tc += crudo(f);
  filas.push({ archivo: f, crudo_kB: +(crudo(f) / 1024).toFixed(1), gzip_kB: +(gz(f) / 1024).toFixed(1) });
  console.log(`${f.padEnd(44)} ${(crudo(f) / 1024).toFixed(1).padStart(7)} kB  gzip ${(gz(f) / 1024).toFixed(1).padStart(6)} kB`);
}
const conSupa = new Set(archivos);
if (supa) cierre(supa, conSupa);
let tgSupa = 0;
for (const f of conSupa) if (!f.endsWith('.html')) tgSupa += gz(f);
const todo = Object.values(manifest).map((e) => e.file).filter((f, i, a) => a.indexOf(f) === i);
const resultado = {
  ruta_agenda_gzip_kB: +(tg / 1024).toFixed(1),
  ruta_agenda_crudo_kB: +(tc / 1024).toFixed(1),
  con_supabase_js_diferido_gzip_kB: +(tgSupa / 1024).toFixed(1),
  todo_el_js_gzip_kB: +(todo.reduce((s, f) => s + gz(f), 0) / 1024).toFixed(1),
  archivos_js_total: todo.length,
  tope_kB: 200,
  cumple: tg / 1024 <= 200,
  archivos: filas,
};
console.log(`RUTA AGENDA: ${resultado.ruta_agenda_crudo_kB} kB crudo, ${resultado.ruta_agenda_gzip_kB} kB gzip (tope 200 kB) -> ${resultado.cumple ? 'CUMPLE' : 'NO CUMPLE'}`);
console.log(`RUTA AGENDA + supabase-js diferido: ${resultado.con_supabase_js_diferido_gzip_kB} kB gzip`);
console.log(`TODO EL JS: ${resultado.todo_el_js_gzip_kB} kB gzip en ${resultado.archivos_js_total} archivos`);
if (SALIDA) writeFileSync(SALIDA, JSON.stringify(resultado, null, 2));
