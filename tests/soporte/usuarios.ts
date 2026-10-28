// Usuarios de prueba por rol (estrategia §3): sesiones reales de Auth local con el código de ingreso leído de
// Mailpit (nunca contraseñas) y el estado del alumno fijado por conexión directa a la base (rol postgres).
// Solo mails @example.test (NFR-02). Las sesiones se guardan en test-results/ (ignorado por git) para no
// agotar los límites de Auth entre archivos de prueba (`max_frequency = 60s`, `sign_in_sign_ups`).
import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from './bd';
import { TOKEN_CAPTCHA } from './captcha';
import { contarMails, esperarMail, mailUnico } from './correo';
import { entorno, RAIZ } from './entorno';

// Dos profesores y el Administrador del seed (ADR-018): A = profesor@example.test, B = profesora.b@example.test.
export type RolAlumno = 'ficha_incompleta' | 'pendiente' | 'rechazado' | 'alumno' | 'alumnoB' | 'dosVinculos';
export type Rol = 'anon' | RolAlumno | 'profesor' | 'profesorB' | 'administrador';
export const ROLES: Rol[] = [
  'anon',
  'ficha_incompleta',
  'pendiente',
  'rechazado',
  'alumno',
  'alumnoB',
  'dosVinculos',
  'profesor',
  'profesorB',
  'administrador',
];

export const MAIL_PROFESOR = 'profesor@example.test'; // profesor A, el mismo que supabase/seed.sql
export const SLUG_A = 'profesor-prueba';
export const MAIL_PROFESOR_B = 'profesora.b@example.test'; // profesora B
export const SLUG_B = 'profesora-b';
export const MAIL_ADMIN = 'admin@example.test';

/** Id del profesor por slug (conexión directa). */
export async function profesorId(slug: string): Promise<string> {
  const f = await sql<{ id: string }>('select id from public.profesor where slug = $1', [slug]);
  if (f.length === 0) throw new Error(`No hay profesor con slug ${slug}: falta el seed`);
  return f[0].id;
}

type Slug = typeof SLUG_A | typeof SLUG_B;
interface Vinculo {
  con: Slug;
  estado: 'pendiente' | 'aprobado' | 'rechazado';
}
// Perfil de cada persona de prueba: ficha y vínculos (DEC-25: la persona es única y se inscribe con cada profesor).
const PERFIL: Record<RolAlumno, { ficha: boolean; origen: Slug | null; vinculos: Vinculo[] }> = {
  ficha_incompleta: { ficha: false, origen: null, vinculos: [] },
  pendiente: { ficha: true, origen: SLUG_A, vinculos: [{ con: SLUG_A, estado: 'pendiente' }] },
  rechazado: { ficha: true, origen: SLUG_A, vinculos: [{ con: SLUG_A, estado: 'rechazado' }] },
  alumno: { ficha: true, origen: SLUG_A, vinculos: [{ con: SLUG_A, estado: 'aprobado' }] },
  alumnoB: { ficha: true, origen: SLUG_B, vinculos: [{ con: SLUG_B, estado: 'aprobado' }] },
  dosVinculos: {
    ficha: true,
    origen: SLUG_A,
    vinculos: [
      { con: SLUG_A, estado: 'aprobado' },
      { con: SLUG_B, estado: 'pendiente' },
    ],
  },
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
    const r = await c.auth.signInWithOtp({ email: mail, options: { shouldCreateUser: true, captchaToken: TOKEN_CAPTCHA } });
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

async function vigente(s: Sesion & { exp: number; apiUrl: string }): Promise<boolean> {
  if (s.apiUrl !== entorno().apiUrl || s.exp * 1000 < Date.now() + 5 * 60_000 || !s.userId) return false;
  const u = await sql('select 1 from auth.users where id = $1', [s.userId]);
  if (u.length === 0) return false;
  if (s.rol === 'profesor' || s.rol === 'profesorB') {
    const p = await sql('select 1 from public.profesor where user_id = $1', [s.userId]);
    return p.length > 0;
  }
  if (s.rol === 'administrador') return (await sql('select 1 from privado.administrador where user_id = $1', [s.userId])).length > 0;
  const a = await sql('select 1 from public.alumno where user_id = $1', [s.userId]);
  return a.length > 0;
}

/** Fija la ficha y los vínculos de la persona del rol (idempotente: cada archivo de prueba parte del mismo estado). */
async function aplicarPerfil(rol: RolAlumno, alumnoId: string): Promise<void> {
  const perfil = PERFIL[rol];
  const origen = perfil.origen ? await profesorId(perfil.origen) : null;
  await sql(
    `update public.alumno
        set estado = $2, nombre = $3, telefono = $4, fecha_nacimiento = $5,
            ficha_completada_en = $6::timestamptz, ficha_origen_profesor_id = $7
      where id = $1`,
    [
      alumnoId,
      perfil.ficha ? 'completa' : 'ficha_incompleta',
      perfil.ficha ? `Alumno ${rol}` : null,
      perfil.ficha ? '+598 99123456' : null,
      perfil.ficha ? '2000-01-01' : null,
      perfil.ficha ? '2026-11-01T12:00:00Z' : null,
      origen,
    ],
  );
  const ids: string[] = [];
  for (const v of perfil.vinculos) ids.push(await profesorId(v.con));
  await sql('delete from public.inscripcion where alumno_id = $1 and not (profesor_id = any($2::uuid[]))', [alumnoId, ids]);
  for (const [i, v] of perfil.vinculos.entries()) {
    await sql(
      `insert into public.inscripcion (alumno_id, profesor_id, estado, motivo_estado, como_llego, aprobado_en)
       values ($1, $2, $3, $4, 'Amigos', $5::timestamptz)
       on conflict (alumno_id, profesor_id)
       do update set estado = excluded.estado, motivo_estado = excluded.motivo_estado, aprobado_en = excluded.aprobado_en`,
      [alumnoId, ids[i], v.estado, v.estado === 'rechazado' ? 'Motivo de prueba' : null, v.estado === 'aprobado' ? '2026-11-01T12:00:00Z' : null],
    );
  }
}

async function crear(rol: Exclude<Rol, 'anon'>): Promise<Sesion> {
  if (rol === 'profesor' || rol === 'profesorB' || rol === 'administrador') {
    const mail = rol === 'profesor' ? MAIL_PROFESOR : rol === 'profesorB' ? MAIL_PROFESOR_B : MAIL_ADMIN;
    const { accessToken, userId } = await ingresarPorCodigo(mail);
    // El disparador de Auth vincula al usuario confirmado con la fila del seed (ADR-013); si no lo hizo, se repite
    // con las mismas funciones que usa el operador (ADR-015, ADM-01).
    if (rol === 'administrador') {
      await sql('select privado.configurar_administrador($1)', [mail]);
    } else {
      const [nombre, slug] = rol === 'profesor' ? ['Profesor de Prueba', SLUG_A] : ['Profesora B de Prueba', SLUG_B];
      await sql('select privado.configurar_profesor($1, $2, $3)', [mail, nombre, slug]);
    }
    return { rol, mail, userId, accessToken };
  }
  const mail = mailUnico(rol.toLowerCase());
  const { accessToken, userId } = await ingresarPorCodigo(mail);
  // El disparador de ingreso (B04) crea la ficha vacía; si no, se inserta.
  const existente = await sql<{ id: string }>('select id from public.alumno where user_id = $1', [userId]);
  let alumnoId: string;
  if (existente.length) {
    alumnoId = existente[0].id;
  } else {
    const [f] = await sql<{ id: string }>('insert into public.alumno (user_id, mail) values ($1, $2) returning id', [userId, mail]);
    alumnoId = f.id;
  }
  await aplicarPerfil(rol, alumnoId);
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
    if (previa.alumnoId && rol in PERFIL) await aplicarPerfil(rol as RolAlumno, previa.alumnoId);
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
