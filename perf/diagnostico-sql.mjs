// Diagnóstico de consultas de la agenda pública (solo lectura de los datos reales; la prueba de escala va dentro de una transacción
// que se revierte). Escribe un .md con los planes EXPLAIN (ANALYZE) y el tiempo de servidor de cada RPC.
// B23 (CA-88, NFR-10): con `--dias` mide solo `agenda_profesor_dias(p_desde, p_hasta)` de 7 días (la semana de D1, lunes a domingo) como el profesor
// (rol authenticated y claims del JWT), EXPLAIN (ANALYZE, BUFFERS) y tiempos de cliente local frente al statement_timeout de 8 s del rol; además guarda
// los datos crudos en <salida>.json. Sin `--dias` es el diagnóstico de la agenda pública de CA-36.
// Uso: node perf/diagnostico-sql.mjs [--dias] <salida.md>
import { writeFileSync, readFileSync } from 'node:fs';
import { conectar } from './lib.mjs';

const DIAS = process.argv.includes('--dias');
const SALIDA = process.argv.filter((a) => !a.startsWith('--')).at(-1);
const datos = JSON.parse(readFileSync('perf/.estado/datos.json', 'utf8'));
const c = await conectar();
async function diasB23() {
  const sumar = async (d, n) => (await c.query(`select to_char($1::date + $2::int, 'YYYY-MM-DD') x`, [d, n])).rows[0].x;
  const desde = datos.lunes, hasta = await sumar(desde, 6);
  const { rows: [pf] } = await c.query(`select p.id, u.id uid, u.email from public.profesor p join auth.users u on u.id = p.user_id where p.slug = 'profesor-prueba'`);
  const claims = JSON.stringify({ sub: pf.uid, role: 'authenticated', email: pf.email, aud: 'authenticated' });
  const { rows: [lim] } = await c.query(`select coalesce((select split_part(c, '=', 2) from pg_roles r, unnest(r.rolconfig) c where r.rolname = 'authenticated' and c like 'statement_timeout=%'), current_setting('statement_timeout')) as st`);
  const stMs = /ms$/.test(lim.st) ? parseFloat(lim.st) : /s$/.test(lim.st) ? parseFloat(lim.st) * 1000 : lim.st === '0' ? 0 : parseFloat(lim.st);
  const [{ n_clases, n_bloq }] = (await c.query(`select (select count(*)::int from public.clase where profesor_id = $1 and inicio >= $2::date at time zone 'America/Montevideo' and inicio < ($3::date + 1) at time zone 'America/Montevideo') n_clases,
     (select count(*)::int from public.bloqueo where profesor_id = $1 and periodo && tstzrange($2::date at time zone 'America/Montevideo', ($3::date + 1) at time zone 'America/Montevideo')) n_bloq, 0 n_filas`, [pf.id, desde, hasta])).rows;
  const sesion = async () => { await c.query('begin'); await c.query('set local role authenticated'); await c.query(`select set_config('request.jwt.claims', $1, true)`, [claims]); };
  const crudo = { componente: 'bd-agenda', rpc: 'agenda_profesor_dias', desde, hasta, dias: 7, profesor: 'profesor-prueba', clases_en_la_semana: n_clases, bloqueos_en_la_semana: n_bloq, statement_timeout_authenticated: lim.st, statement_timeout_ms: stMs };
  out.length = 0;
  out.push('# Diagnóstico de `agenda_profesor_dias` de 7 días (B23, CA-88 / NFR-10)', '', `Base local, semana ${desde} a ${hasta} del profesor-prueba (${n_clases} clases y ${n_bloq} bloqueos; datos de \`perf/preparar.mjs\`), rol authenticated con los claims del profesor. \`statement_timeout\` del rol authenticated: ${lim.st}.`, '');
  const sql = 'select * from public.agenda_profesor_dias($1::date, $2::date)';
  await sesion();
  const filas = (await c.query(sql, [desde, hasta])).rows.length;
  crudo.filas_devueltas = filas;
  await c.query('rollback');
  for (const [titulo, sqlp] of [['Plan de `public.agenda_profesor_dias(desde, hasta)` (7 días)', `explain (analyze, buffers, costs off, timing on) ${sql}`]]) {
    await sesion();
    const { rows } = await c.query(sqlp, [desde, hasta]);
    await c.query('rollback');
    out.push(`## ${titulo}`, '', '```', ...rows.map((r) => r['QUERY PLAN']), '```', '');
    const ex = rows.map((r) => r['QUERY PLAN']).find((l) => /^Execution Time/.test(l));
    crudo.execution_time_ms_explain = ex ? parseFloat(ex.split(':')[1]) : null;
  }
  // La función es plpgsql: el EXPLAIN de arriba no abre su interior; se mide también la consulta interna (privado.agenda_profesor_dias) y 1 día.
  await c.query('begin');
  const { rows: planInt } = await c.query(`explain (analyze, buffers, costs off, timing on) select * from privado.agenda_profesor_dias($1::uuid, $2::date, $3::date)`, [pf.id, desde, hasta]);
  await c.query('rollback');
  out.push('## Plan de `privado.agenda_profesor_dias(profesor, desde, hasta)` (consulta interna, como postgres)', '', '```', ...planInt.map((r) => r['QUERY PLAN']), '```', '');
  async function veces(titulo, d, h, n = 40) {
    const ms = [];
    for (let i = 0; i < n; i++) {
      await sesion();
      const t = performance.now();
      await c.query(sql, [d, h]);
      ms.push(performance.now() - t);
      await c.query('rollback');
    }
    const v = [...ms].sort((a, b) => a - b);
    const r = { n, p50_ms: +v[Math.floor(n * 0.5)].toFixed(2), p95_ms: +v[Math.floor(n * 0.95)].toFixed(2), max_ms: +v[n - 1].toFixed(2), minimo_ms: +v[0].toFixed(2) };
    out.push(`- ${titulo}: p50 ${r.p50_ms} ms, p95 ${r.p95_ms} ms, máx ${r.max_ms} ms (${n} ejecuciones, cliente local, rol authenticated)`);
    return r;
  }
  out.push('## Tiempo de servidor (sin red)', '');
  crudo.siete_dias = await veces(`7 días (${desde} a ${hasta})`, desde, hasta);
  crudo.un_dia = await veces(`1 día (${datos.d1})`, datos.d1, datos.d1);
  crudo.fraccion_del_timeout_p95 = stMs ? +(crudo.siete_dias.p95_ms / stMs).toFixed(5) : null;
  out.push('', `Frente al \`statement_timeout\` (${lim.st} = ${stMs} ms): el p95 de 7 días usa ${(crudo.fraccion_del_timeout_p95 * 100).toFixed(3)} % del límite (margen ${(stMs / crudo.siete_dias.p95_ms).toFixed(0)} veces).`, '');
  await c.end();
  writeFileSync(SALIDA, out.join('\n') + '\n');
  writeFileSync(SALIDA.replace(/\.md$/, '') + '.json', JSON.stringify(crudo, null, 2));
  console.log(out.join('\n'));
  console.log(JSON.stringify(crudo));
  process.exit(0);
}
const out = ['# Diagnóstico de consultas (CA-36 / NFR-04)', '', `Base local, día ${datos.d1}; datos de \`perf/preparar.mjs\` (2 profesores, ~240 clases).`, ''];
if (DIAS) await diasB23();
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
writeFileSync(SALIDA, out.join('\n') + '\n');
console.log(out.join('\n'));
