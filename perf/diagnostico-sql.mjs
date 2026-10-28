// Diagnóstico de consultas de la agenda pública (solo lectura de los datos reales; la prueba de escala va dentro de una transacción
// que se revierte). Escribe un .md con los planes EXPLAIN (ANALYZE) y el tiempo de servidor de cada RPC.
// Uso: node perf/diagnostico-sql.mjs <salida.md>
import { writeFileSync, readFileSync } from 'node:fs';
import { conectar } from './lib.mjs';

const datos = JSON.parse(readFileSync('perf/.estado/datos.json', 'utf8'));
const c = await conectar();
const out = ['# Diagnóstico de consultas (CA-36 / NFR-04)', '', `Base local, día ${datos.d1}; datos de \`perf/preparar.mjs\` (2 profesores, ~240 clases).`, ''];
async function plan(titulo, sql, params = []) {
  const { rows } = await c.query(`explain (analyze, buffers, costs off, timing on) ${sql}`, params);
  out.push(`## ${titulo}`, '', '```', ...rows.map((r) => r['QUERY PLAN']), '```', '');
}
async function tiempo(titulo, sql, params, veces = 30) {
  const ms = [];
  for (let i = 0; i < veces; i++) {
    const t = performance.now();
    await c.query(sql, params);
    ms.push(performance.now() - t);
  }
  ms.sort((a, b) => a - b);
  out.push(`- ${titulo}: mediana ${ms[Math.floor(veces / 2)].toFixed(2)} ms, p95 ${ms[Math.floor(veces * 0.95)].toFixed(2)} ms, máx ${ms[veces - 1].toFixed(2)} ms (${veces} ejecuciones, cliente local)`);
}

out.push('## Tiempo de servidor por RPC (sin red; rol anon)', '');
await c.query("set role anon");
await tiempo('`config_publica(slug)`', "select public.config_publica('profesor-prueba')", []);
await tiempo('`agenda_publica(slug, día)`', 'select * from public.agenda_publica($1, $2::date)', ['profesor-prueba', datos.d1]);
await c.query('reset role');
out.push('');
await plan('agenda_publica(slug, día) con los datos reales', "select * from public.agenda_publica('profesor-prueba', $1::date)", [datos.d1]);
await plan('privado.agenda_publica(profesor, día): clases y bloqueos del día (consulta interna)', 'select * from privado.agenda_publica((select id from public.profesor where slug = $1), $2::date)', ['profesor-prueba', datos.d1]);

// Escala: 5000 profesores sintéticos dentro de una transacción que se revierte (nada queda en la base).
out.push('## Búsqueda por slug con muchos profesores (transacción revertida)', '');
await c.query('begin');
await c.query(`insert into public.profesor (nombre, slug, mail) select 'Escala ' || g, 'escala-' || g, 'escala' || g || '@example.test' from generate_series(1, 5000) g`).catch((e) => out.push(`No se pudieron insertar profesores sintéticos: ${e.message}`, ''));
await c.query('analyze public.profesor');
await plan('privado.profesor_por_slug(\'profesor-prueba\') con 5002 profesores', "select privado.profesor_por_slug('profesor-prueba')");
await plan('la misma búsqueda sin función sobre la columna (alternativa: slug citext/lower indexado) - referencia', "select p.id from public.profesor p where p.slug = 'profesor-prueba'");
await tiempo('`profesor_por_slug` con 5002 profesores', "select privado.profesor_por_slug('profesor-prueba')", [], 50);
await tiempo('`select id from profesor where slug = $1` con 5002 profesores (usa profesor_slug_unico)', "select p.id from public.profesor p where p.slug = 'profesor-prueba'", [], 50);
await c.query('rollback');
out.push('');
await c.end();
writeFileSync(process.argv[2], out.join('\n') + '\n');
console.log(out.join('\n'));
