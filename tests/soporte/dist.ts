// Acceso a `dist/` para las pruebas: si no está construido, lo construye una vez con `npm run build`.
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { entorno, RAIZ } from './entorno';

export const DIST = resolve(RAIZ, process.env.RTC_DIST ?? 'dist');

export function asegurarDist(): string {
  if (!existsSync(resolve(DIST, 'index.html'))) {
    const e = entorno();
    execSync('npm run build', {
      cwd: RAIZ,
      stdio: 'inherit',
      timeout: 240_000,
      env: { ...process.env, VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? e.apiUrl, VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? e.anonKey },
    });
  }
  if (!existsSync(resolve(DIST, 'index.html'))) throw new Error(`No existe ${DIST}/index.html después de npm run build`);
  return DIST;
}
