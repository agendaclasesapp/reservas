// Detector de secretos de las pruebas (CA-35, NFR-02, T-NFR-01, T-NFR-02): contraseña de aplicación de Gmail,
// secreto OAuth de Google, clave de servicio de Supabase (JWT con role service_role, o sb_secret_) y todo JWT
// decodificado (H-008). Es independiente de gitleaks y de scripts/seguridad/escanear-dist.mjs: sirve para
// comprobar el repositorio y `dist/`, y se prueba a sí mismo con secretos falsos generados al vuelo
// (ninguno aparece literal en el repositorio).
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface Hallazgo {
  archivo: string;
  tipo: string;
  detalle: string;
}

const RE_JWT = /eyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g;

export function decodificarJwt(jwt: string): Record<string, unknown> | null {
  try {
    const carga = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(carga, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Construye un JWT sin firma real (solo para sembrar pruebas de eficacia). */
export function jwtFalso(role: string, extra: Record<string, unknown> = {}): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'prueba', role, exp: 1983812996, ...extra })}.${Buffer.from('firma-de-prueba-no-valida').toString('base64url')}`;
}

const VALOR_REAL = (v: string) => {
  const t = v.trim().replace(/^["']|["']$/g, '');
  // No es literal: llamada a función o lectura del entorno (p. ej. claveDeServicioLocal(), process.env.X).
  if (/[()]/.test(t) || /^(process\.env|import\.meta\.env|Deno\.env)\b/.test(t)) return false;
  // Texto evidentemente de prueba, separado por guiones: «clave-invalida-de-prueba».
  if (/(^|[-_])(prueba|test|dummy|fake|falso|ficticio|invalida?)([-_]|$)/i.test(t)) return false;
  return t.length >= 8 && !/^(env\(|\$\{|\{\{|<|\*{3,}|x{4,}|changeme|cambiar|tu[-_ ])/i.test(t) && !/secrets\./.test(t);
};

export function escanearTexto(archivo: string, texto: string): Hallazgo[] {
  const h: Hallazgo[] = [];
  for (const jwt of texto.match(RE_JWT) ?? []) {
    const p = decodificarJwt(jwt);
    if (p && String(p.role ?? '') === 'service_role') h.push({ archivo, tipo: 'service_role', detalle: 'JWT con role service_role' });
  }
  if (/\bsb_secret_[A-Za-z0-9_-]{16,}/.test(texto)) h.push({ archivo, tipo: 'service_role', detalle: 'clave sb_secret_' });
  if (/GOCSPX-[A-Za-z0-9_-]{20,}/.test(texto)) h.push({ archivo, tipo: 'oauth', detalle: 'secreto OAuth de Google (GOCSPX-)' });
  const asig = /(GMAIL_APP_PASSWORD|RTC_GOOGLE_SECRET|SERVICE_ROLE_KEY|GOOGLE_CLIENT_SECRET)[ \t]*[:=][ \t]*(["']?)([^\s"'#]+)\2/gi;
  let m: RegExpExecArray | null;
  while ((m = asig.exec(texto))) {
    // Perfil local versionado a propósito (ADR-012): valores ficticios `local-…`; en cualquier otro archivo sí cuentan.
    const perfilLocal = archivo.endsWith('supabase/.env.development') && /^local[-_]/i.test(m[3]);
    if (VALOR_REAL(m[3]) && !perfilLocal) h.push({ archivo, tipo: 'asignacion', detalle: `${m[1]} con valor literal` });
  }
  // Contraseña de aplicación de Gmail en su formato de 16 letras (con o sin espacios) junto a la palabra password.
  if (/app[ _-]?password["']?\s*[:=]\s*["']?[a-z]{4}( ?[a-z]{4}){3}\b/i.test(texto)) {
    h.push({ archivo, tipo: 'gmail', detalle: 'contraseña de aplicación de Gmail' });
  }
  return h;
}

const BINARIOS = /\.(png|jpe?g|gif|ico|webp|woff2?|ttf|otf|pdf|zip|gz|map)$/i;

function recorrer(dir: string, base: string, salida: string[]) {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.git') continue;
    const ruta = join(dir, n);
    if (statSync(ruta).isDirectory()) recorrer(ruta, base, salida);
    else salida.push(relative(base, ruta).replaceAll('\\', '/'));
  }
}

/** Archivos del directorio (recursivo), texto solamente. */
export function escanearDirectorio(dir: string): Hallazgo[] {
  const archivos: string[] = [];
  recorrer(dir, dir, archivos);
  return archivos
    .filter((a) => !BINARIOS.test(a) || a.endsWith('.map'))
    .flatMap((a) => escanearTexto(a, readFileSync(join(dir, a), 'utf8')));
}

/** Archivos versionados o por versionar (no ignorados) del repositorio, menos el workspace `.aidlc/`. */
export function archivosDelRepo(raiz: string): string[] {
  if (existsSync(join(raiz, '.git'))) {
    const salida = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: raiz, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return salida.split('\0').filter((f) => f && !f.startsWith('.aidlc/') && existsSync(join(raiz, f)));
  }
  const todos: string[] = [];
  recorrer(raiz, raiz, todos);
  return todos.filter((f) => !f.startsWith('.aidlc/') && !f.startsWith('dist/'));
}

export function escanearRepo(raiz: string): Hallazgo[] {
  return archivosDelRepo(raiz)
    .filter((a) => !BINARIOS.test(a) && statSync(join(raiz, a)).size < 5 * 1024 * 1024)
    .flatMap((a) => escanearTexto(a, readFileSync(join(raiz, a), 'utf8')));
}
