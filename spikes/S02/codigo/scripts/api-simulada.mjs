// API de gestión simulada (H-005): registra lo que `supabase config push` mandaría al proyecto,
// sin proyecto real. Uso: node scripts/api-simulada.mjs <puerto> <archivo-registro>
import { appendFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';

const [puerto, registro] = [Number(process.argv[2] ?? 56499), process.argv[3] ?? 'api-simulada.log'];
writeFileSync(registro, '');

// Estado "remoto" de partida: un proyecto nuevo con la configuración por defecto de Auth.
// Sobre de la API v2 que acepta la CLI 2.121 (averiguado por prueba y error: data.attributes).
const configV2 = {
  data: { attributes: { auth: { site_url: 'http://localhost:3000', additional_redirect_urls: [], email: { otp_expiry: 3600, otp_length: 6 } } } },
};
const authRemota = { site_url: 'http://localhost:3000', uri_allow_list: '', mailer_otp_exp: 3600, mailer_otp_length: 6 };

createServer((req, res) => {
  let cuerpo = '';
  req.on('data', (c) => (cuerpo += c));
  req.on('end', () => {
    appendFileSync(registro, `${req.method} ${req.url} ${cuerpo}\n`);
    res.setHeader('content-type', 'application/json');
    if (req.url.endsWith('/v2/projects/aaaaaaaaaaaaaaaaaaaa/config') && req.method === 'GET') return res.end(JSON.stringify(configV2));
    if (req.url.endsWith('/config/auth')) return res.end(JSON.stringify(req.method === 'GET' ? authRemota : { ...authRemota, ...JSON.parse(cuerpo || '{}') }));
    if (/\/v1\/projects\/[a-z]+$/.test(req.url)) return res.end(JSON.stringify({ id: 'aaaaaaaaaaaaaaaaaaaa', ref: 'aaaaaaaaaaaaaaaaaaaa', name: 'simulado', status: 'ACTIVE_HEALTHY', region: 'sa-east-1', organization_id: 'x', created_at: '2026-10-21T00:00:00Z', database: { host: 'db.simulado', version: '17' } }));
    res.end('{}');
  });
}).listen(puerto, '127.0.0.1', () => console.log(`api simulada en ${puerto}`));
