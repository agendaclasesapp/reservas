// Spike S03: kB gzip que descarga la ruta de agenda (#/) = entrada + chunk lazy de agenda + sus imports.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const DIST = process.argv[2] ?? 'dist';

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
const agenda = Object.keys(manifest).find((k) => k.endsWith('rutas/agenda.tsx'));
const archivos = cierre(agenda, cierre(entrada));
let tg = 0, tc = 0;
for (const f of archivos) { tg += gz(f); tc += crudo(f); console.log(`${f.padEnd(40)} ${(crudo(f) / 1024).toFixed(1).padStart(7)} kB  gzip ${(gz(f) / 1024).toFixed(1).padStart(6)} kB`); }
console.log(`RUTA AGENDA: ${(tc / 1024).toFixed(1)} kB crudo, ${(tg / 1024).toFixed(1)} kB gzip (tope 200 kB)`);
const todo = Object.values(manifest).map((e) => e.file).filter((f, i, a) => a.indexOf(f) === i);
console.log(`TODO EL JS: ${(todo.reduce((s, f) => s + gz(f), 0) / 1024).toFixed(1)} kB gzip en ${todo.length} archivos`);
