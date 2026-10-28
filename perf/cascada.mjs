// Diagnóstico: cascada de red de una carga en frío de la agenda con un perfil de Chrome (qué pide y cuándo).
// Uso: node perf/cascada.mjs --perfil fast4g|slow4g [--salida archivo.md]
import { writeFileSync, readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { iniciarServidor } from './servidor.mjs';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const PERFILES = {
  fast4g: { downloadThroughput: (9e6 / 8) * 0.9, uploadThroughput: (1.5e6 / 8) * 0.9, latency: 165 },
  slow4g: { downloadThroughput: (1.6e6 / 8) * 0.9, uploadThroughput: (750e3 / 8) * 0.9, latency: 562.5 },
};
const p = PERFILES[arg('perfil', 'slow4g')];
const datos = JSON.parse(readFileSync('perf/.estado/datos.json', 'utf8'));
const servidor = await iniciarServidor({ puerto: 4175 });
const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await ctx.addInitScript(`(() => { const ok = () => !document.querySelector('[aria-busy="true"]') && [...document.querySelectorAll('li')].some((x) => /17:00/.test(x.textContent||'')); const c = () => { if (window.__listo === undefined && ok()) window.__listo = performance.now(); }; new MutationObserver(c).observe(document,{childList:true,subtree:true,attributes:true}); setInterval(c,20); })()`);
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
await cdp.send('Network.emulateNetworkConditions', { offline: false, ...p });
const r = new Map();
let t0 = null;
cdp.on('Network.requestWillBeSent', (e) => {
  t0 ??= e.timestamp;
  r.set(e.requestId, { url: e.request.url.replace('http://127.0.0.1:4175/reservas/', '/').replace('http://127.0.0.1:54321', 'API'), ini: (e.timestamp - t0) * 1000, tipo: e.type });
});
cdp.on('Network.loadingFinished', (e) => {
  const x = r.get(e.requestId);
  if (x) {
    x.fin = (e.timestamp - t0) * 1000;
    x.kB = +(e.encodedDataLength / 1024).toFixed(1);
  }
});
await page.goto(`http://127.0.0.1:4175/reservas/#/p/profesor-prueba?d=${datos.d1}`, { waitUntil: 'commit' });
await page.waitForFunction(() => window.__listo !== undefined, null, { timeout: 30000, polling: 20 });
const listo = Math.round(await page.evaluate(() => window.__listo));
await page.waitForTimeout(500);
const filas = [...r.values()].sort((a, b) => a.ini - b.ini);
const md = [`Cascada de una carga en frío (${arg('perfil', 'slow4g')}); agenda completa a los ${listo} ms desde el inicio de la navegación.`, '', '| inicio ms | fin ms | kB red | tipo | recurso |', '| ---: | ---: | ---: | --- | --- |', ...filas.map((x) => `| ${Math.round(x.ini)} | ${x.fin ? Math.round(x.fin) : ''} | ${x.kB ?? ''} | ${x.tipo} | ${x.url.slice(0, 90)} |`)].join('\n');
console.log(md);
if (arg('salida')) writeFileSync(arg('salida'), md + '\n');
await nav.close();
servidor.close();
