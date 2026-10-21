// Escribe .env.local (ignorado por git) con la URL y la clave pública del stack local del spike.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const salida = execSync('npx --yes supabase@2.121.0 status -o json', { encoding: 'utf8' });
const s = JSON.parse(salida.slice(salida.indexOf('{')));
writeFileSync(
  '.env.local',
  [
    `VITE_SUPABASE_URL=${s.API_URL}`,
    `VITE_SUPABASE_ANON_KEY=${s.ANON_KEY}`,
    `S02_DB_URL=${s.DB_URL}`,
    `S02_MAILPIT_URL=${s.MAILPIT_URL ?? s.INBUCKET_URL}`,
    '',
  ].join('\n'),
);
console.log('.env.local escrito para', s.API_URL);
