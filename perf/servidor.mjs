// Servidor estático del bundle compilado (perf/.dist, salida de `vite build`) con gzip, como lo sirve GitHub Pages (DEC-14).
// `vite preview` no comprime las respuestas y con el perfil 4G eso triplicaría los bytes de la medición. Misma base que
// producción (/reservas/). No agrega encabezados de seguridad: la CSP va dentro del propio index.html y se sirve tal cual.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { extname, join, normalize, resolve } from 'node:path';

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };
const COMPRIMIBLES = new Set(['.html', '.js', '.css', '.json', '.svg', '.webmanifest', '.txt']);

export function iniciarServidor({ dist = 'perf/.dist', puerto = 4174, base = '/reservas/' } = {}) {
  const raiz = resolve(dist);
  const cache = new Map();
  const servidor = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      if (!url.pathname.startsWith(base)) {
        res.writeHead(404).end('no encontrado');
        return;
      }
      let rel = decodeURIComponent(url.pathname.slice(base.length)) || 'index.html';
      let ruta = normalize(join(raiz, rel));
      if (!ruta.startsWith(raiz)) {
        res.writeHead(403).end();
        return;
      }
      const s = await stat(ruta).catch(() => null);
      if (!s || s.isDirectory()) {
        rel = 'index.html';
        ruta = join(raiz, rel);
      }
      const ext = extname(ruta);
      let cuerpo = cache.get(ruta);
      if (!cuerpo) {
        const crudo = await readFile(ruta);
        cuerpo = { plano: crudo, gz: COMPRIMIBLES.has(ext) ? gzipSync(crudo, { level: 6 }) : null };
        cache.set(ruta, cuerpo);
      }
      const acepta = /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
      const usa = acepta && cuerpo.gz;
      const datos = usa ? cuerpo.gz : cuerpo.plano;
      res.writeHead(200, {
        'content-type': TIPOS[ext] ?? 'application/octet-stream',
        'content-length': datos.length,
        'cache-control': 'max-age=600',
        ...(usa ? { 'content-encoding': 'gzip', vary: 'Accept-Encoding' } : {}),
      });
      res.end(datos);
    } catch (e) {
      res.writeHead(500).end(String(e));
    }
  });
  return new Promise((ok) => servidor.listen(puerto, '127.0.0.1', () => ok(servidor)));
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`) {
  await iniciarServidor({ puerto: Number(process.env.PUERTO ?? 4174) });
  console.log('sirviendo perf/.dist en http://127.0.0.1:4174/reservas/');
}
