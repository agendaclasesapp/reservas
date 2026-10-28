// CA-17 (rama de carga) / T-RES-04 / RES-01: >= 20 alumnos aprobados distintos piden a la vez el mismo hueco de un profesor por
// la API real (supabase-js -> RPC `solicitar_reserva` de PostgREST), repetido en 6 huecos (uno tras otro) y una ráfaga final con
// los 6 huecos de otro día pedidos a la vez por los 24 alumnos (144 llamadas concurrentes). Después verifica en la base que cada
// hueco tiene exactamente una clase activa (pendiente) y una sola solicitud, y que el resto recibió 409 HUECO_NO_LIBRE.
// Las sesiones de los alumnos las firma perf/preparar.mjs con el secreto JWT del stack local (solo local).
// Uso: node perf/concurrencia-ca17.mjs --salida <carpeta>
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { API, anonKey, conectar, percentil } from './lib.mjs';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const SALIDA = resolve(arg('salida', 'perf/resultados/ca17'));
mkdirSync(SALIDA, { recursive: true });
const datos = JSON.parse(readFileSync('perf/.estado/datos.json', 'utf8'));
const jwts = JSON.parse(readFileSync('perf/.estado/jwt.json', 'utf8'));
const profesor = datos.profesores['profesor-prueba'];
const db = await conectar();

const clientes = datos.alumnos.map((a) =>
  createClient(API, anonKey(), { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${jwts[a.alumno_id]}` } } }),
);

const instante = async (dia, hora) => (await db.query(`select (($1::date + $2::time) at time zone 'America/Montevideo') as t`, [dia, hora])).rows[0].t.toISOString();
const sumarDia = async (dia, n) => (await db.query(`select to_char($1::date + $2::int, 'YYYY-MM-DD') d`, [dia, n])).rows[0].d;

async function llamar(i, inicio) {
  const t0 = performance.now();
  const { data, error, status } = await clientes[i].rpc('solicitar_reserva', { p_profesor_id: profesor, p_inicio: inicio, p_tipo: 'suelta' });
  return { alumno: datos.alumnos[i].n, inicio, ms: performance.now() - t0, status, ok: !error, mensaje: error?.message ?? null, codigo: error?.code ?? null, hora: new Date().toISOString(), data: error ? null : data };
}

const llamadas = [];
const rondas = [];
async function ronda(nombre, inicios) {
  const pedidos = [];
  const arranque = performance.now();
  for (const inicio of inicios) for (let i = 0; i < clientes.length; i++) pedidos.push(llamar(i, inicio));
  const res = await Promise.all(pedidos);
  llamadas.push(...res.map((r) => ({ ronda: nombre, ...r })));
  rondas.push({ ronda: nombre, huecos: inicios.length, intentos_por_hueco: clientes.length, llamadas: res.length, duracion_ms: Math.round(performance.now() - arranque) });
}

// 6 huecos del día D2, un hueco por ronda (con una pausa para que las series tengan puntos en el tiempo).
const d3 = await sumarDia(datos.d2, 1); // viernes: 6 huecos en una sola ráfaga
for (const h of datos.huecosCA17) {
  await ronda(`hueco ${datos.d2} ${h}`, [await instante(datos.d2, h)]);
  await new Promise((r) => setTimeout(r, 1200));
}
await ronda(`rafaga ${d3}`, await Promise.all(datos.huecosCA17.map((h) => instante(d3, h))));

// Verificación en la base (rol postgres): una sola clase activa pendiente y una sola solicitud por hueco.
const huecos = [...new Set(llamadas.map((l) => l.inicio))];
const verificacion = [];
for (const inicio of huecos) {
  const act = (await db.query(`select count(*)::int n, count(*) filter (where estado='pendiente')::int p from public.clase where profesor_id=$1 and inicio=$2 and estado in ('pendiente','confirmada')`, [profesor, inicio])).rows[0];
  const res = (await db.query(`select count(*)::int n from public.reserva r join public.clase c on c.reserva_id=r.id where c.profesor_id=$1 and c.inicio=$2 and r.estado='pendiente'`, [profesor, inicio])).rows[0];
  const solic = await db.query(`select count(*)::int n from public.solicitud s join public.clase c on c.reserva_id = s.reserva_id where c.profesor_id=$1 and c.inicio=$2`, [profesor, inicio]).then((r) => r.rows[0].n, () => null);
  const mias = llamadas.filter((l) => l.inicio === inicio);
  const exitos = mias.filter((l) => l.ok);
  const rechazos = mias.filter((l) => !l.ok);
  const rechazadasOk = rechazos.filter((l) => l.status === 409 && l.mensaje === 'HUECO_NO_LIBRE');
  const cumple = act.n === 1 && act.p === 1 && res.n === 1 && exitos.length === 1 && rechazadasOk.length === rechazos.length && mias.length === exitos.length + rechazos.length;
  verificacion.push({ inicio, intentos: mias.length, exitos: exitos.length, rechazadas_hueco_no_libre: rechazadasOk.length, otros_resultados: rechazos.length - rechazadasOk.length, clases_activas_en_la_base: act.n, pendientes: act.p, reservas_pendientes: res.n, solicitudes: solic, cumple });
}
await db.end();

const inesperadas = llamadas.filter((l) => !(l.ok || (l.status === 409 && l.mensaje === 'HUECO_NO_LIBRE')));
const huecosIncumplen = verificacion.filter((v) => !v.cumple);
const tiempos = llamadas.map((l) => l.ms);
const total = llamadas.length;
// Error = llamada con un resultado fuera de lo esperado (ni «pendiente» ni 409 HUECO_NO_LIBRE) o llamada de un hueco que no quedó con exactamente una pendiente.
const incumple = new Set(huecosIncumplen.map((v) => v.inicio));
const errores = llamadas.filter((l) => !(l.ok || (l.status === 409 && l.mensaje === 'HUECO_NO_LIBRE')) || incumple.has(l.inicio));
const resumen = {
  intentos_por_hueco: clientes.length,
  huecos: huecos.length,
  rondas,
  llamadas: total,
  exitos: llamadas.filter((l) => l.ok).length,
  rechazadas_hueco_no_libre: llamadas.filter((l) => l.status === 409 && l.mensaje === 'HUECO_NO_LIBRE').length,
  resultados_inesperados: inesperadas.length,
  huecos_que_no_cumplen: huecosIncumplen.length,
  p50_ms: Math.round(percentil(tiempos, 50)),
  p95_ms: Math.round(percentil(tiempos, 95)),
  p99_ms: Math.round(percentil(tiempos, 99)),
  max_ms: Math.round(Math.max(...tiempos)),
  errores_pct: +((errores.length * 100) / total).toFixed(2),
  veredicto: huecosIncumplen.length === 0 && inesperadas.length === 0 ? 'cumple' : 'no-cumple',
  fecha: new Date().toISOString(),
};
const inicio0 = Math.min(...llamadas.map((l) => Date.parse(l.hora)));
const duracion_s = Math.max((Math.max(...llamadas.map((l) => Date.parse(l.hora))) - inicio0) / 1000, 1);
writeFileSync(`${SALIDA}/llamadas.json`, JSON.stringify(llamadas, null, 1));
writeFileSync(`${SALIDA}/verificacion-base.json`, JSON.stringify(verificacion, null, 1));
writeFileSync(`${SALIDA}/resumen-medicion.json`, JSON.stringify(resumen, null, 1));
const lineas = [];
for (const l of llamadas) {
  const mal = errores.includes(l) ? 1 : 0;
  lineas.push(JSON.stringify({ type: 'Point', metric: 'http_req_duration', data: { time: l.hora, value: +l.ms.toFixed(2), tags: {} } }));
  lineas.push(JSON.stringify({ type: 'Point', metric: 'http_req_failed', data: { time: l.hora, value: mal, tags: {} } }));
  lineas.push(JSON.stringify({ type: 'Point', metric: 'vus', data: { time: l.hora, value: clientes.length, tags: {} } }));
}
writeFileSync(`${SALIDA}/puntos.ndjson`, lineas.join('\n') + '\n');
writeFileSync(`${SALIDA}/k6-summary.json`, JSON.stringify({ metrics: {
  http_req_duration: { values: { avg: tiempos.reduce((a, b) => a + b, 0) / total, med: percentil(tiempos, 50), max: Math.max(...tiempos), 'p(90)': percentil(tiempos, 90), 'p(95)': percentil(tiempos, 95), 'p(99)': percentil(tiempos, 99) } },
  http_reqs: { values: { count: total, rate: +(total / duracion_s).toFixed(2) } },
  http_req_failed: { values: { rate: errores.length / total } },
  vus_max: { values: { max: clientes.length, value: clientes.length } },
} }, null, 1));
console.log(JSON.stringify(resumen, null, 1));
console.table(verificacion.map((v) => ({ ...v, inicio: v.inicio.slice(0, 16) })));
process.exit(resumen.veredicto === 'cumple' ? 0 : 1);
