// T-NFR-10 (CA-36, NFR-04, ADR-017): kB gzip (nivel 9) que descarga la ruta de agenda `#/p/<slug>` = entrada + chunk de la
// agenda + sus imports estáticos y CSS. Mismo método que spikes/S03/app/medir-bundle.mjs, con la ruta actual de la agenda
// (src/modulos/agenda/vistas/Pagina.tsx). Informa además, aparte, el chunk diferido de supabase-js (ADR-017: se pide en
// paralelo para la sesión) y el total de JS.
// B23 (CA-88, NFR-10): con `--ruta panel` mide la ruta `#/panel` (src/modulos/panel/vistas/Pagina.tsx) = entrada + chunk del panel + sus imports estáticos y CSS,
// y con `--base <dist de main>` la compara con la base del ciclo (build de main con el mismo método): chunk propio de la página, cierre gzip y delta.
// Uso: node perf/medir-bundle.mjs [--ruta agenda|panel] [--base <dist>] [dist=perf/.dist] [salida.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const flag = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const posicionales = process.argv.slice(2).filter((a, i, v) => !a.startsWith('--') && !(i > 0 && v[i - 1].startsWith('--')));
const RUTA = flag('ruta') ?? 'agenda';
const BASE = flag('base');
const DIST = posicionales[0] ?? 'perf/.dist';
const SALIDA = posicionales[1];
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
const agenda = Object.keys(manifest).find((k) => k.endsWith(RUTA === 'panel' ? 'modulos/panel/vistas/Pagina.tsx' : 'modulos/agenda/vistas/Pagina.tsx'));
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
  // El tope de 200 kB gzip es de la ruta de agenda (ADR-017, CA-36); `#/panel` no tiene tope propio en la spec: se informa como referencia.
  tope_kB: RUTA === 'panel' ? null : 200,
  referencia_tope_agenda_kB: 200,
  cumple: RUTA === 'panel' ? null : tg / 1024 <= 200,
  archivos: filas,
};
console.log(`RUTA ${RUTA.toUpperCase()}: ${resultado.ruta_agenda_crudo_kB} kB crudo, ${resultado.ruta_agenda_gzip_kB} kB gzip (${RUTA === 'panel' ? 'sin tope propio; referencia de la agenda 200 kB' : `tope 200 kB -> ${resultado.cumple ? 'CUMPLE' : 'NO CUMPLE'}`})`);
console.log(`RUTA ${RUTA.toUpperCase()} + supabase-js diferido: ${resultado.con_supabase_js_diferido_gzip_kB} kB gzip`);
console.log(`TODO EL JS: ${resultado.todo_el_js_gzip_kB} kB gzip en ${resultado.archivos_js_total} archivos`);
resultado.ruta = RUTA;
resultado.pagina = { archivo: manifest[agenda].file, crudo_kB: +(crudo(manifest[agenda].file) / 1024).toFixed(1), gzip_kB: +(gz(manifest[agenda].file) / 1024).toFixed(1), css: (manifest[agenda].css ?? []).map((f) => ({ archivo: f, gzip_kB: +(gz(f) / 1024).toFixed(1) })) };
if (BASE) {
  // Misma medición sobre el build de la base (main). Las claves del manifest son rutas de fuente, así que son comparables.
  const m = JSON.parse(readFileSync(`${BASE}/.vite/manifest.json`, 'utf8'));
  const gzB = (f) => gzipSync(readFileSync(`${BASE}/${f}`), { level: 9 }).length;
  const cierreB = (clave, vistos = new Set()) => {
    const e = m[clave];
    if (!e || vistos.has(e.file)) return vistos;
    vistos.add(e.file);
    for (const css of e.css ?? []) vistos.add(css);
    for (const imp of e.imports ?? []) cierreB(imp, vistos);
    return vistos;
  };
  const entradaB = Object.keys(m).find((k) => m[k].isEntry);
  const claveB = Object.keys(m).find((k) => k.endsWith(RUTA === 'panel' ? 'modulos/panel/vistas/Pagina.tsx' : 'modulos/agenda/vistas/Pagina.tsx'));
  const arch = [...cierreB(claveB, cierreB(entradaB))].filter((f) => !f.endsWith('.html'));
  const tgB = arch.reduce((a, f) => a + gzB(f), 0);
  const paginaB = m[claveB].file;
  resultado.base_main = {
    ruta_gzip_kB: +(tgB / 1024).toFixed(1),
    pagina: { archivo: paginaB, gzip_kB: +(gzB(paginaB) / 1024).toFixed(1) },
    archivos_js_total: Object.values(m).map((e) => e.file).filter((f, i, a) => a.indexOf(f) === i).length,
    todo_el_js_gzip_kB: +(Object.values(m).map((e) => e.file).filter((f, i, a) => a.indexOf(f) === i).reduce((a, f) => a + gzB(f), 0) / 1024).toFixed(1),
  };
  resultado.delta = {
    ruta_gzip_kB: +(resultado.ruta_agenda_gzip_kB - resultado.base_main.ruta_gzip_kB).toFixed(1),
    pagina_gzip_kB: +(resultado.pagina.gzip_kB - resultado.base_main.pagina.gzip_kB).toFixed(1),
    todo_el_js_gzip_kB: +(resultado.todo_el_js_gzip_kB - resultado.base_main.todo_el_js_gzip_kB).toFixed(1),
  };
  console.log(`BASE (main): ruta ${resultado.base_main.ruta_gzip_kB} kB gzip; chunk de la página ${resultado.base_main.pagina.gzip_kB} kB (ahora ${resultado.pagina.gzip_kB} kB); delta ruta ${resultado.delta.ruta_gzip_kB} kB, chunk ${resultado.delta.pagina_gzip_kB} kB`);
}
if (SALIDA) writeFileSync(SALIDA, JSON.stringify(resultado, null, 2));
