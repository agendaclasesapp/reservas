// CSP de index.html (SEC-16, ADR-016). Funciones puras: las usa el plugin de vite.config.ts al compilar
// y las pruebas unitarias. index.html trae la política literal con una marca en `connect-src` que se
// reemplaza por el origen de VITE_SUPABASE_URL (DEC-14: la URL sale del entorno, no del código).

export const MARCA_ORIGEN_SUPABASE = '__RTC_SUPABASE_ORIGEN__';
export const ORIGEN_TURNSTILE = 'https://challenges.cloudflare.com';

const META_CSP = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"\s*\/?>\s*/i;
const HOSTS_LOCALES = new Set(['127.0.0.1', 'localhost']);

/** Origen (`protocolo://host:puerto`) de la URL de Supabase; https, o http solo en local. */
export function origenConexion(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error('VITE_SUPABASE_URL no es una URL válida.');
  }
  if (u.protocol === 'https:' || (u.protocol === 'http:' && HOSTS_LOCALES.has(u.hostname))) {
    return u.origin;
  }
  throw new Error('VITE_SUPABASE_URL debe usar https (http solo en 127.0.0.1 o localhost).');
}

/** Contenido de la meta CSP del HTML, o null si no la tiene. */
export function extraerCsp(html: string): string | null {
  return META_CSP.exec(html)?.[1] ?? null;
}

/** Directivas de una política CSP: nombre → fuentes. */
export function parsearCsp(politica: string): Map<string, string[]> {
  const directivas = new Map<string, string[]>();
  for (const parte of politica.split(';')) {
    const [nombre, ...fuentes] = parte.trim().split(/\s+/);
    if (nombre) directivas.set(nombre.toLowerCase(), fuentes);
  }
  return directivas;
}

/** Completa la marca de `connect-src` con el origen de Supabase. Falla si falta la CSP o la marca. */
export function aplicarCsp(html: string, origenSupabase: string): string {
  const politica = extraerCsp(html);
  if (politica === null || politica.split(MARCA_ORIGEN_SUPABASE).length !== 2) {
    throw new Error(`index.html debe tener una meta CSP con ${MARCA_ORIGEN_SUPABASE} una sola vez (SEC-16).`);
  }
  return html.replace(MARCA_ORIGEN_SUPABASE, origenSupabase);
}

/**
 * Quita la meta CSP. Solo para `vite dev`: el preámbulo de React Refresh es un script en línea y los
 * estilos se inyectan con `<style>`, que `script-src 'self'` y `style-src 'self'` bloquean.
 */
export function quitarCsp(html: string): string {
  return html.replace(META_CSP, '');
}
