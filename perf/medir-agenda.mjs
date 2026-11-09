// CA-36 / NFR-04 / T-NFR-09: carga en frío de la agenda de un día con Playwright + CDP y el perfil 4G de Chrome.
// Sirve perf/.dist (salida de `vite build --outDir perf/.dist --manifest`) con gzip (perf/servidor.mjs), abre cada carga en un
// contexto nuevo (sin caché ni almacenamiento), con Network.emulateNetworkConditions y Network.setCacheDisabled(true), y mide
// desde el inicio de la navegación hasta «agenda del día completa»:
//   marcador agenda (#/p/<slug>?d=<D1>): el último hueco del día (17:00 a 18:00) está dibujado como <li> y no queda ningún
//     indicador de carga (role=status con aria-busy=true) en la página.
//   marcador panel (B23, CA-88 / NFR-10; sesión del profesor): calendario del Panel `#/panel?v=semana&d=<D1>` (Semana) o
//     `#/panel?v=dia&d=<D1>` (Día). «Carga completa» = la grilla `[data-calendario]` (role=group «Calendario, …») ya no tiene
//     `aria-busy`, no queda ningún `[role=status][aria-busy=true]` (el esqueleto «Cargando»), tiene una columna `[data-columna-dia]`
//     por día de la vista (7 en Semana de escritorio; 3 bajo 60 rem) y dibuja TODAS las clases (`[data-tipo=clase]`, pendientes y
//     confirmadas) y TODOS los bloqueos (`li` con el texto «Bloqueado») del período visible, más al menos un hueco libre
//     (`button[data-inicio]` que no es clase ni bloqueo). Las cantidades esperadas salen de la base (profesor-prueba, huso del profesor).
// Uso: node perf/medir-agenda.mjs --ruta agenda|panel [--vista semana|dia] [--viewport escritorio|celular] --perfil fast4g|slow4g|none --n 40 --salida <carpeta>
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { iniciarServidor } from './servidor.mjs';
import { conectar, firmarJwt, percentil, API } from './lib.mjs';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const RUTA = arg('ruta', 'agenda');
const VISTA = arg('vista', 'semana'); // solo --ruta panel
const VIEWPORT = arg('viewport', RUTA === 'panel' ? 'escritorio' : 'celular');
const VIEWPORTS = { escritorio: { width: 1280, height: 800, mobile: false, dsf: 1 }, celular: { width: 390, height: 844, mobile: true, dsf: 2 } };
if (!VIEWPORTS[VIEWPORT]) throw new Error(`viewport ${VIEWPORT}`);
if (!['semana', 'dia'].includes(VISTA)) throw new Error(`vista ${VISTA}`);
const PERFIL = arg('perfil', 'fast4g');
const N = Number(arg('n', '40'));
const SALIDA = resolve(arg('salida', `perf/resultados/${RUTA === 'panel' ? `panel-${VISTA}-${VIEWPORT}` : RUTA}-${PERFIL}`));
const PUERTO = Number(arg('puerto', '4174'));
const TIMEOUT_MS = Number(arg("timeout", "30000"));
// Valores de los presets de las herramientas de desarrollo de Chrome (front_end/panels/mobile_throttling/ThrottlingPresets.ts):
// bytes/s = kbps * 1000 / 8 * factor; el factor 0,9 (0,8 en 3G lento) y el multiplicador de latencia compensan la sobrecarga de la emulación.
const PERFILES = {
  // «Fast 4G»: 9 Mbit/s bajada, 1,5 Mbit/s subida, 60 ms x 2,75 = 165 ms.
  fast4g: { etiqueta: 'Fast 4G', downloadThroughput: (9 * 1000 * 1000 / 8) * 0.9, uploadThroughput: (1.5 * 1000 * 1000 / 8) * 0.9, latency: 60 * 2.75 },
  // «Slow 4G» (antes «Fast 3G»): 1,6 Mbit/s bajada, 750 kbit/s subida, 150 ms x 3,75 = 562,5 ms.
  slow4g: { etiqueta: 'Slow 4G', downloadThroughput: (1.6 * 1000 * 1000 / 8) * 0.9, uploadThroughput: (750 * 1000 / 8) * 0.9, latency: 150 * 3.75 },
  none: { etiqueta: 'Sin limitación', downloadThroughput: -1, uploadThroughput: -1, latency: 0 },
};
const perfil = PERFILES[PERFIL];
if (!perfil) throw new Error(`perfil ${PERFIL}`);

const datos = JSON.parse(readFileSync('perf/.estado/datos.json', 'utf8'));
const SLUGS = ['profesor-prueba', 'profesora-b'];
const base = `http://127.0.0.1:${PUERTO}/reservas/`;

// Sesión del profesor para el panel: la que guarda supabase-js en localStorage (clave sb-<host>-auth-token), con un JWT firmado local.
async function sesionProfesor() {
  const c = await conectar();
  const { rows } = await c.query(`select u.id, u.email from auth.users u join public.profesor p on p.user_id = u.id where p.slug = $1`, [SLUGS[0]]).catch(() => ({ rows: [] }));
  await c.end();
  if (!rows.length) throw new Error('profesor sin usuario de Auth vinculado');
  const { id, email } = rows[0];
  const exp = Math.floor(Date.now() / 1000) + 3 * 3600;
  return {
    access_token: firmarJwt(id, email, 3),
    refresh_token: 'perf-sin-refresco',
    token_type: 'bearer',
    expires_in: 3 * 3600,
    expires_at: exp,
    user: { id, aud: 'authenticated', role: 'authenticated', email, app_metadata: { provider: 'email' }, user_metadata: {} },
  };
}

// Lo que la grilla del período visible tiene que dibujar (clases pendientes y confirmadas, bloqueos), contado en la base.
async function esperadoPanel() {
  const c = await conectar();
  const desde = VISTA === 'semana' ? datos.lunes : datos.d1;
  const dias = VISTA === 'semana' ? 7 : 1;
  const w = `(($2::date) at time zone 'America/Montevideo')`;
  const h = `(($2::date + $3::int) at time zone 'America/Montevideo')`;
  const p = `(select id from public.profesor where slug = $1)`;
  const cl = (await c.query(`select count(*)::int n from public.clase where profesor_id = ${p} and estado in ('pendiente','confirmada') and inicio >= ${w} and inicio < ${h}`, [SLUGS[0], desde, dias])).rows[0].n;
  const bl = (await c.query(`select count(*)::int n from public.bloqueo where profesor_id = ${p} and periodo && tstzrange(${w}, ${h})`, [SLUGS[0], desde, dias])).rows[0].n;
  await c.end();
  const columnas = VISTA === 'semana' ? (VIEWPORT === 'escritorio' ? 7 : 3) : 1;
  return { clases: cl, bloqueos: bl, columnas };
}
const ESPERADO = RUTA === 'panel' ? await esperadoPanel() : null;

const MARCADOR_PANEL = `
  (() => {
    const esperado = ${JSON.stringify(ESPERADO)};
    const conteo = () => {
      const g = document.querySelector('[data-calendario]');
      if (!g) return null;
      const huecos = [...g.querySelectorAll('button[data-inicio]')].filter((b) => !b.hasAttribute('data-tipo') && !/Bloqueado/.test(b.textContent || '')).length;
      const bloqueos = [...g.querySelectorAll('li')].filter((l) => /Bloqueado/.test(l.textContent || '')).length;
      return { columnas: g.querySelectorAll('[data-columna-dia]').length, clases: g.querySelectorAll('[data-tipo="clase"]').length, bloqueos, huecos, g };
    };
    const listo = () => {
      if (document.querySelector('[role="status"][aria-busy="true"]')) return false;
      const k = conteo();
      if (!k || k.g.getAttribute('aria-busy') === 'true') return false;
      return k.columnas === esperado.columnas && k.clases === esperado.clases && k.bloqueos === esperado.bloqueos && k.huecos > 0;
    };
    const chequear = () => {
      if (window.__listo === undefined && listo()) window.__listo = performance.now();
    };
    new MutationObserver(chequear).observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
    window.addEventListener('load', chequear);
    setInterval(chequear, 20);
  })();`;

const MARCADOR = RUTA === 'panel' ? MARCADOR_PANEL : `
  (() => {
    const listo = () => {
      if (document.querySelector('[aria-busy="true"]')) return false;
      const li = [...document.querySelectorAll('li')].filter((x) => /17:00/.test(x.textContent || ''));
      return li.length > 0;
    };
    const chequear = () => {
      if (window.__listo === undefined && listo()) window.__listo = performance.now();
    };
    new MutationObserver(chequear).observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
    window.addEventListener('load', chequear);
    setInterval(chequear, 20);
  })();`;

await new Promise((r) => setTimeout(r, 0));
const servidor = await iniciarServidor({ puerto: PUERTO });
const navegador = await chromium.launch({ channel: undefined });
const sesion = RUTA === 'panel' ? await sesionProfesor() : null;
mkdirSync(SALIDA, { recursive: true });
mkdirSync(`${SALIDA}/capturas`, { recursive: true });
const claveStorage = `sb-${new URL(API).hostname.split('.')[0]}-auth-token`;

async function cargar(i) {
  const slug = SLUGS[i % 2];
  const ctx = await navegador.newContext({ viewport: { width: VIEWPORTS[VIEWPORT].width, height: VIEWPORTS[VIEWPORT].height }, deviceScaleFactor: VIEWPORTS[VIEWPORT].dsf, isMobile: VIEWPORTS[VIEWPORT].mobile, locale: 'es-UY', timezoneId: 'America/Montevideo', serviceWorkers: 'block' });
  await ctx.addInitScript(MARCADOR);
  if (sesion) await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [claveStorage, JSON.stringify(sesion)]);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: perfil.latency, downloadThroughput: perfil.downloadThroughput, uploadThroughput: perfil.uploadThroughput });
  const peticiones = [];
  const fallos = [];
  let bytes = 0;
  cdp.on('Network.requestWillBeSent', (e) => peticiones.push({ id: e.requestId, url: e.request.url.replace(/apikey=[^&]+/, 'apikey=…'), t: e.timestamp }));
  cdp.on('Network.loadingFinished', (e) => {
    bytes += e.encodedDataLength;
    const pe = peticiones.find((x) => x.id === e.requestId);
    if (pe) pe.fin = e.timestamp;
  });
  cdp.on('Network.responseReceived', (e) => { if (e.response.status >= 400) fallos.push(`HTTP ${e.response.status} ${e.response.url.slice(0, 120)}`); });
  cdp.on('Network.loadingFailed', (e) => { if (!e.canceled) fallos.push(`red ${e.errorText}`); });
  page.on('pageerror', (e) => fallos.push(`pageerror ${String(e.message).slice(0, 120)}`));
  const hash = RUTA === 'panel' ? `#/panel?v=${VISTA}&d=${datos.d1}` : `#/p/${slug}?d=${datos.d1}`;
  let ms = null;
  let error = null;
  try {
    await page.goto(`${base}${hash}`, { waitUntil: 'commit', timeout: TIMEOUT_MS });
    await page.waitForFunction(() => window.__listo !== undefined, null, { timeout: TIMEOUT_MS, polling: 20 });
    ms = await page.evaluate(() => window.__listo);
  } catch (e) {
    error = String(e.message).split('\n')[0];
  }
  let conteo = null;
  let desglose = null;
  if (RUTA === 'panel') {
    conteo = await page.evaluate(() => {
      const g = document.querySelector('[data-calendario]');
      if (!g) return null;
      return { columnas: g.querySelectorAll('[data-columna-dia]').length, clases: g.querySelectorAll('[data-tipo="clase"]').length, bloqueos: [...g.querySelectorAll('li')].filter((l) => /Bloqueado/.test(l.textContent || '')).length, huecos: [...g.querySelectorAll('button[data-inicio]')].filter((b) => !b.hasAttribute('data-tipo') && !/Bloqueado/.test(b.textContent || '')).length };
    }).catch(() => null);
    // Desglose aproximado (reloj de CDP, relativo a la primera petición): fin del último JS/CSS (bundle) y RPC de la agenda (inicio, fin, duración).
    const t0 = peticiones.length ? Math.min(...peticiones.map((x) => x.t)) : 0;
    const rel = (t) => Math.round((t - t0) * 1000);
    const rpc = peticiones.filter((x) => /agenda_profesor_dias/.test(x.url) && x.fin);
    const est = peticiones.filter((x) => /\.(js|css)(\?|$)/.test(x.url) && x.fin);
    desglose = {
      bundle_fin_ms: est.length ? Math.max(...est.map((x) => rel(x.fin))) : null,
      rpc_inicio_ms: rpc.length ? Math.min(...rpc.map((x) => rel(x.t))) : null,
      rpc_fin_ms: rpc.length ? Math.max(...rpc.map((x) => rel(x.fin))) : null,
      rpc_duracion_ms: rpc.length ? Math.max(...rpc.map((x) => rel(x.fin) - rel(x.t))) : null,
      rpc_peticiones: rpc.length,
      pagina_fin_ms: ((l) => (l.length ? Math.max(...l.map((x) => rel(x.fin))) : null))(peticiones.filter((x) => /\/assets\/Pagina-[^/]*\.js/.test(x.url) && x.fin)),
      auth_user_fin_ms: ((l) => (l.length ? Math.min(...l.map((x) => rel(x.fin))) : null))(peticiones.filter((x) => /auth\/v1\/user/.test(x.url) && x.fin && x.fin - x.t > 0.05)),
      sesion_actual_fin_ms: ((l) => (l.length ? Math.max(...l.map((x) => rel(x.fin))) : null))(peticiones.filter((x) => /rpc\/sesion_actual/.test(x.url) && x.fin)),
      config_publica_fin_ms: ((l) => (l.length ? Math.max(...l.map((x) => rel(x.fin))) : null))(peticiones.filter((x) => /rpc\/config_publica/.test(x.url) && x.fin)),
      profesor_fin_ms: ((l) => (l.length ? Math.max(...l.map((x) => rel(x.fin))) : null))(peticiones.filter((x) => /rest\/v1\/profesor\?/.test(x.url) && x.fin)),
      grilla_tramo_fin_ms: ((l) => (l.length ? Math.max(...l.map((x) => rel(x.fin))) : null))(peticiones.filter((x) => /grilla_tramo/.test(x.url) && x.fin)),
    };
    if (ms !== null && ESPERADO && (!conteo || conteo.clases !== ESPERADO.clases || conteo.bloqueos !== ESPERADO.bloqueos)) error = `grilla incompleta: ${JSON.stringify(conteo)}`;
  }
  if (ms !== null && RUTA !== 'panel') {
    const huecos = await page.locator('li').filter({ hasText: /\d\d:\d\d a \d\d:\d\d/ }).count();
    if (huecos < 9) error = `agenda incompleta: ${huecos} huecos`;
  }
  if (i < 2) await page.screenshot({ path: `${SALIDA}/capturas/carga-${String(i + 1).padStart(2, '0')}-${RUTA}.png`, fullPage: true }).catch(() => {});
  await ctx.close();
  return { i: i + 1, slug: RUTA === 'panel' ? 'panel' : slug, ms: ms === null ? null : Math.round(ms), error, fallos, peticiones: peticiones.length, kB_red: +(bytes / 1024).toFixed(1), conteo, desglose, urls: i < 2 ? peticiones.map((x) => ({ url: x.url, ms: x.fin ? Math.round((x.fin - x.t) * 1000) : null })) : undefined, hora: new Date().toISOString() };
}

// Calentamiento (no cuenta): primera conexión al servidor y arranque del navegador.
await cargar(0).catch(() => {});
const cargas = [];
const inicio = Date.now();
for (let i = 0; i < N; i++) {
  const r = await cargar(i);
  cargas.push(r);
  process.stdout.write(`${r.i}:${r.ms ?? 'ERR'} `);
}
const duracion_s = (Date.now() - inicio) / 1000;
await navegador.close();
servidor.close();

const ok = cargas.filter((c) => c.ms !== null && !c.error && c.fallos.length === 0);
const con = cargas.filter((c) => c.ms !== null && !c.error);
const tiempos = con.map((c) => c.ms);
const resumen = {
  ruta: RUTA === 'panel' ? `#/panel?v=${VISTA}&d=${datos.d1}` : `#/p/<slug>?d=${datos.d1}`,
  vista: RUTA === 'panel' ? VISTA : 'agenda-dia',
  viewport: VIEWPORT,
  esperado: ESPERADO,
  profesores: RUTA === 'panel' ? [SLUGS[0]] : SLUGS,
  perfil: { clave: PERFIL, ...perfil },
  cargas: N,
  con_error: cargas.length - ok.length,
  errores_pct: +(((cargas.length - ok.length) * 100) / cargas.length).toFixed(2),
  p50_ms: Math.round(percentil(tiempos, 50)),
  p90_ms: Math.round(percentil(tiempos, 90)),
  p95_ms: Math.round(percentil(tiempos, 95)),
  p99_ms: Math.round(percentil(tiempos, 99)),
  min_ms: Math.min(...tiempos),
  max_ms: Math.max(...tiempos),
  promedio_ms: Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length),
  desglose_mediana: RUTA === 'panel' ? Object.fromEntries(['bundle_fin_ms', 'pagina_fin_ms', 'auth_user_fin_ms', 'sesion_actual_fin_ms', 'config_publica_fin_ms', 'rpc_inicio_ms', 'rpc_fin_ms', 'rpc_duracion_ms', 'profesor_fin_ms', 'grilla_tramo_fin_ms'].map((k) => [k, Math.round(percentil(con.map((c) => c.desglose?.[k]).filter((v) => v != null), 50))])) : undefined,
  peticiones_por_carga: Math.round(cargas.reduce((a, c) => a + c.peticiones, 0) / cargas.length),
  kB_red_por_carga: +(cargas.reduce((a, c) => a + c.kB_red, 0) / cargas.length).toFixed(1),
  duracion_s: Math.round(duracion_s),
  fecha: new Date().toISOString(),
};
writeFileSync(`${SALIDA}/cargas.json`, JSON.stringify(cargas, null, 1));
writeFileSync(`${SALIDA}/resumen-medicion.json`, JSON.stringify(resumen, null, 1));
// Salida en el formato de puntos de k6 (--out json) para perf_resumen.py: http_req_duration = ms hasta «agenda completa» por carga.
const lineas = [];
for (const c of cargas) {
  const t = c.hora;
  lineas.push(JSON.stringify({ type: 'Point', metric: 'http_req_duration', data: { time: t, value: c.ms ?? TIMEOUT_MS, tags: { slug: c.slug } } }));
  lineas.push(JSON.stringify({ type: 'Point', metric: 'http_req_failed', data: { time: t, value: c.ms === null || c.error || c.fallos.length ? 1 : 0, tags: {} } }));
  lineas.push(JSON.stringify({ type: 'Point', metric: 'vus', data: { time: t, value: 1, tags: {} } }));
}
writeFileSync(`${SALIDA}/puntos.ndjson`, lineas.join('\n') + '\n');
const k6 = {
  metrics: {
    http_req_duration: { values: { avg: resumen.promedio_ms, min: resumen.min_ms, med: resumen.p50_ms, max: resumen.max_ms, 'p(90)': resumen.p90_ms, 'p(95)': resumen.p95_ms, 'p(99)': resumen.p99_ms } },
    http_reqs: { values: { count: N, rate: +(N / duracion_s).toFixed(3) } },
    http_req_failed: { values: { rate: resumen.con_error / N } },
    vus_max: { values: { max: 1, value: 1 } },
  },
};
writeFileSync(`${SALIDA}/k6-summary.json`, JSON.stringify(k6, null, 1));
console.log(`\n${JSON.stringify(resumen)}`);
