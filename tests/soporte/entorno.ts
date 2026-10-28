// Entorno de las pruebas de integración y E2E contra el stack Supabase local (compartido).
// Orden de resolución: variables de proceso, `.env.local` (lo escribe el script de entorno), y
// `supabase status -o json`. Nunca contra la nube ni con secretos reales (NFR-02).
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Las pruebas corren desde la raíz del proyecto (npm run ...). */
export const RAIZ = process.cwd();

function leerEnvArchivo(ruta: string): Record<string, string> {
  if (!existsSync(ruta)) return {};
  const salida: Record<string, string> = {};
  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(linea);
    if (m && !linea.trim().startsWith('#')) salida[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return salida;
}

let estadoCache: Record<string, string> | null = null;
function estadoSupabase(): Record<string, string> {
  if (estadoCache) return estadoCache;
  try {
    const txt = execSync('npx --yes supabase@2.121.0 status -o json', { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 90_000 });
    estadoCache = JSON.parse(txt.slice(txt.indexOf('{')));
  } catch {
    estadoCache = {};
  }
  return estadoCache!;
}

const HOSTS_LOCALES = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
export function esLocal(url: string): boolean {
  try {
    return HOSTS_LOCALES.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

export interface Entorno {
  apiUrl: string;
  anonKey: string;
  dbUrl: string;
  mailpitUrl: string;
}

let entornoCache: Entorno | null = null;

export function entorno(): Entorno {
  if (entornoCache) return entornoCache;
  const local = leerEnvArchivo(resolve(RAIZ, '.env.local'));
  const pick = (...claves: string[]) => {
    for (const c of claves) {
      const v = process.env[c] ?? local[c];
      if (v) return v;
    }
    return undefined;
  };
  let apiUrl = pick('RTC_API_URL', 'API_URL', 'VITE_SUPABASE_URL');
  let anonKey = pick('RTC_ANON_KEY', 'ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
  let dbUrl = pick('RTC_DB_URL', 'DB_URL');
  let mailpitUrl = pick('RTC_MAILPIT_URL', 'MAILPIT_URL');
  if (!apiUrl || !anonKey || !dbUrl || !mailpitUrl) {
    const s = estadoSupabase();
    apiUrl ??= s.API_URL;
    anonKey ??= s.ANON_KEY ?? s.PUBLISHABLE_KEY;
    dbUrl ??= s.DB_URL;
    mailpitUrl ??= s.MAILPIT_URL ?? s.INBUCKET_URL;
  }
  apiUrl ??= 'http://127.0.0.1:54321';
  dbUrl ??= 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  mailpitUrl ??= 'http://127.0.0.1:54324';
  if (!anonKey) throw new Error('Sin clave anon del stack local: levanta Supabase local o define RTC_ANON_KEY');
  // Guardia (H-408): la API y la base tienen que ser locales; se mira el host de la URL analizada, no el texto.
  if (!esLocal(apiUrl)) {
    throw new Error(`Las pruebas de integración solo corren contra el stack local, no contra ${apiUrl}`);
  }
  if (!esLocal(dbUrl)) {
    throw new Error('Las pruebas de integración solo limpian datos en la base local (RTC_DB_URL con host 127.0.0.1, localhost o ::1)');
  }
  entornoCache = { apiUrl, anonKey, dbUrl, mailpitUrl };
  return entornoCache;
}
