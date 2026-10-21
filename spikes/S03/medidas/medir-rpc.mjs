// Spike S03: p95 de 50 llamadas a /rest/v1/rpc/agenda_publica por PostgREST (Kong) como anon.
// Uso: node medir-rpc.mjs [url] ; ANON_KEY por entorno (la del stack local de `supabase status`).
const url = process.argv[2] ?? 'http://127.0.0.1:57421';
const key = process.env.ANON_KEY;
if (!key) { process.stderr.write('Falta ANON_KEY\n'); process.exit(2); }
const N = 50, CALENTAR = 5;
const dia = (i) => new Date(Date.UTC(2025, 10, 3) + i * 13 * 86400000).toISOString().slice(0, 10);
async function llamar(d) {
  const t0 = performance.now();
  const r = await fetch(`${url}/rest/v1/rpc/agenda_publica`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_dia: d }),
  });
  const cuerpo = await r.json();
  return { ms: performance.now() - t0, status: r.status, cuerpo, bytes: JSON.stringify(cuerpo).length };
}
for (let i = 0; i < CALENTAR; i++) await llamar(dia(i));
const ms = [], claves = new Set(), estados = {};
let filas = 0, bytesMax = 0;
for (let i = 0; i < N; i++) {
  const r = await llamar(dia(i));
  if (r.status !== 200) throw new Error(`HTTP ${r.status}: ${JSON.stringify(r.cuerpo)}`);
  ms.push(r.ms); filas += r.cuerpo.length; bytesMax = Math.max(bytesMax, r.bytes);
  for (const f of r.cuerpo) { Object.keys(f).forEach((k) => claves.add(k)); estados[f.estado] = (estados[f.estado] ?? 0) + 1; }
}
ms.sort((a, b) => a - b);
const pct = (p) => ms[Math.min(ms.length - 1, Math.ceil(p * ms.length) - 1)];
const f = (x) => x.toFixed(1);
console.log(`llamadas=${N} (+${CALENTAR} de calentamiento) dias distintos=${N}`);
console.log(`ms: min=${f(ms[0])} p50=${f(pct(0.5))} p95=${f(pct(0.95))} max=${f(ms[ms.length - 1])}`);
console.log(`filas=${filas} estados=${JSON.stringify(estados)} claves=${[...claves].sort().join(',')} bytes_max=${bytesMax}`);
