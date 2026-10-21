// Usuarios de prueba por rol (estrategia §3): sesiones reales de Auth local con el código de ingreso leído de
// Mailpit (nunca contraseñas) y el estado del alumno fijado por conexión directa a la base (rol postgres).
// Solo mails @example.test (NFR-02). Las sesiones se guardan en test-results/ (ignorado por git) para no
// agotar los límites de Auth entre archivos de prueba (`max_frequency = 60s`, `sign_in_sign_ups`).
import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from './bd';
import { esperarMail, mailUnico } from './correo';
import { entorno, RAIZ } from './entorno';

export type RolAlumno = 'ficha_incompleta' | 'pendiente' | 'rechazado' | 'alumno' | 'alumnoB';
export type Rol = 'anon' | RolAlumno | 'profesor';
export const ROLES: Rol[] = ['anon', 'ficha_incompleta', 'pendiente', 'rechazado', 'alumno', 'profesor'];

export const MAIL_PROFESOR = 'profesor@example.test'; // el mismo que supabase/seed.sql

const ESTADO: Record<RolAlumno, string> = {
  ficha_incompleta: 'ficha_incompleta',
  pendiente: 'pendiente',
  rechazado: 'rechazado',
  alumno: 'aprobado',
  alumnoB: 'aprobado',
};

export interface Sesion {
  rol: Rol;
  mail: string | null;
  userId: string | null;
  accessToken: string;
  alumnoId?: string;
}

const CACHE = resolve(RAIZ, 'test-results', '.sesiones-integracion.json');

function memoria(): SupportedStorage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

export function clienteAnon() {
  const e = entorno();
  return createClient(e.apiUrl, e.anonKey, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storage: memoria() },
  });
}

function leerCache(): Record<string, Sesion & { exp: number; apiUrl: string }> {
  try {
    return existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
  } catch {
    return {};
  }
}

function guardarCache(c: Record<string, unknown>) {
  mkdirSync(resolve(RAIZ, 'test-results'), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(c));
}

/** Ingreso por código de 6 dígitos (ALU-01): devuelve el token de acceso y el id del usuario de Auth. */
export async function ingresarPorCodigo(mail: string): Promise<{ accessToken: string; userId: string }> {
  const c = clienteAnon();
  for (let intento = 0; intento < 2; intento++) {
    const antes = await contarMails(mail);
    const r = await c.auth.signInWithOtp({ email: mail, options: { shouldCreateUser: true } });
    if (r.error?.status === 429 && intento === 0) {
      // max_frequency = 60s por mail: una repetición dentro del minuto espera a que venza.
      await new Promise((res) => setTimeout(res, 62_000));
      continue;
    }
    if (r.error) throw new Error(`signInWithOtp ${mail}: ${r.error.message}`);
    const mensaje = await esperarMail(mail, antes + 1);
    if (!mensaje.codigo) throw new Error(`El mail a ${mail} no trae código de 6 dígitos`);
    const v = await c.auth.verifyOtp({ email: mail, token: mensaje.codigo, type: 'email' });
    if (v.error || !v.data.session) throw new Error(`verifyOtp ${mail}: ${v.error?.message}`);
    return { accessToken: v.data.session.access_token, userId: v.data.user!.id };
  }
  throw new Error(`No se pudo ingresar ${mail}`);
}

async function contarMails(mail: string): Promise<number> {
  const r = await fetch(`${entorno().mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${mail}"`)}`);
  return ((await r.json()) as { messages: unknown[] }).messages.length;
}

async function vigente(s: Sesion & { exp: number; apiUrl: string }): Promise<boolean> {
  if (s.apiUrl !== entorno().apiUrl || s.exp * 1000 < Date.now() + 5 * 60_000 || !s.userId) return false;
  const u = await sql('select 1 from auth.users where id = $1', [s.userId]);
  if (u.length === 0) return false;
  if (s.rol === 'profesor') {
    const p = await sql('select 1 from public.profesor where user_id = $1', [s.userId]);
    return p.length > 0;
  }
  const a = await sql<{ estado: string }>('select estado from public.alumno where user_id = $1', [s.userId]);
  return a.length > 0;
}

async function crear(rol: Exclude<Rol, 'anon'>): Promise<Sesion> {
  if (rol === 'profesor') {
    const { accessToken, userId } = await ingresarPorCodigo(MAIL_PROFESOR);
    // ADR-015: la misma función del seed vincula al usuario confirmado con la fila del profesor.
    await sql('select privado.configurar_profesor($1, $2)', [MAIL_PROFESOR, 'Profesor de Prueba']);
    return { rol, mail: MAIL_PROFESOR, userId, accessToken };
  }
  const mail = mailUnico(rol.toLowerCase());
  const { accessToken, userId } = await ingresarPorCodigo(mail);
  // Si el disparador de ingreso (B04) ya creó la fila se actualiza; si no (B01), se inserta.
  const existente = await sql<{ id: string }>('select id from public.alumno where user_id = $1', [userId]);
  let alumnoId: string;
  if (existente.length) {
    alumnoId = existente[0].id;
  } else {
    const [f] = await sql<{ id: string }>(
      'insert into public.alumno (profesor_id, user_id, mail) values ((select id from public.profesor), $1, $2) returning id',
      [userId, mail],
    );
    alumnoId = f.id;
  }
  const estado = ESTADO[rol];
  const ficha = estado === 'ficha_incompleta';
  await sql(
    `update public.alumno
        set estado = $2, nombre = $3, telefono = $4, fecha_nacimiento = $5,
            ficha_completada_en = $6::timestamptz, motivo_estado = $7
      where id = $1`,
    [
      alumnoId,
      estado,
      ficha ? null : `Alumno ${rol}`,
      ficha ? null : '+598 99123456',
      ficha ? null : '2000-01-01',
      ficha ? null : '2026-11-01T12:00:00Z',
      estado === 'rechazado' ? 'Motivo de prueba' : null,
    ],
  );
  return { rol, mail, userId, accessToken, alumnoId };
}

const memo = new Map<Rol, Sesion>();

/** Sesión del rol (cacheada en memoria y en disco mientras el usuario siga existiendo). */
export async function sesionDe(rol: Rol): Promise<Sesion> {
  if (rol === 'anon') return { rol, mail: null, userId: null, accessToken: entorno().anonKey };
  const m = memo.get(rol);
  if (m) return m;
  const cache = leerCache();
  const previa = cache[rol];
  if (previa && (await vigente(previa))) {
    memo.set(rol, previa);
    return previa;
  }
  const nueva = await crear(rol);
  const exp = JSON.parse(Buffer.from(nueva.accessToken.split('.')[1], 'base64url').toString('utf8')).exp as number;
  cache[rol] = { ...nueva, exp, apiUrl: entorno().apiUrl };
  guardarCache(cache);
  memo.set(rol, nueva);
  return nueva;
}

export interface RespuestaApi {
  status: number;
  cuerpo: unknown;
}

async function pedir(rol: Rol, metodo: string, ruta: string, cuerpo?: unknown, cabeceras: Record<string, string> = {}): Promise<RespuestaApi> {
  const s = await sesionDe(rol);
  const r = await fetch(`${entorno().apiUrl}${ruta}`, {
    method: metodo,
    headers: { apikey: entorno().anonKey, Authorization: `Bearer ${s.accessToken}`, 'Content-Type': 'application/json', ...cabeceras },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  let json: unknown = texto;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    /* cuerpo no JSON */
  }
  return { status: r.status, cuerpo: json };
}

/** POST /rest/v1/rpc/<nombre> con la sesión del rol. */
export const rpc = (rol: Rol, nombre: string, args: Record<string, unknown> = {}) => pedir(rol, 'POST', `/rest/v1/rpc/${nombre}`, args);
/** Petición REST directa a una tabla o vista (para probar lecturas por RLS y escrituras rechazadas). */
export const rest = (rol: Rol, metodo: string, ruta: string, cuerpo?: unknown, cabeceras?: Record<string, string>) =>
  pedir(rol, metodo, `/rest/v1/${ruta}`, cuerpo, cabeceras);
