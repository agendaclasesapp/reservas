// Spike S02 contra el proyecto real: lectura de .env.nube (URL y clave PUBLICABLE) y conexión a la
// base con SUPABASE_DB_PASSWORD tomada del entorno. Nunca imprime la contraseña ni tokens.
import { readFileSync } from 'node:fs';
import pg from 'pg';

export const REF = 'rmokypmznhobapyghfpi';
export const CASILLA = 'agendaclasesapp+s02@gmail.com';

export function envNube() {
  const url = new URL('../.env.nube', import.meta.url);
  const vars = Object.fromEntries(
    readFileSync(url, 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
  return { url: vars.VITE_SUPABASE_URL, clave: vars.VITE_SUPABASE_ANON_KEY };
}

// Por defecto el pooler en modo sesión (IPv4); S02_NUBE_DB_HOST/PORT/USER lo cambian.
export async function conectar() {
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!password) throw new Error('Falta SUPABASE_DB_PASSWORD en el entorno');
  const host = process.env.S02_NUBE_DB_HOST ?? 'aws-1-sa-east-1.pooler.supabase.com';
  const directo = host.startsWith('db.');
  const cliente = new pg.Client({
    host,
    port: Number(process.env.S02_NUBE_DB_PORT ?? 5432),
    user: process.env.S02_NUBE_DB_USER ?? (directo ? 'postgres' : `postgres.${REF}`),
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  await cliente.connect();
  return cliente;
}

export async function estadoCasilla(db) {
  const u = await db.query(
    `select id, email_confirmed_at is not null as confirmado, last_sign_in_at is not null as ingreso
       from auth.users where email = $1`, [CASILLA]);
  if (u.rowCount === 0) return { usuario: 'no existe' };
  const id = u.rows[0].id;
  const alumno = await db.query('select estado, nombre, ultimo_ingreso is not null as con_ultimo_ingreso from spike_s02.alumno where user_id = $1', [id]);
  const traza = await db.query('select disparador, operacion, confirmado, accion from spike_s02.traza_trigger where user_id = $1 order by id', [id]);
  return {
    usuario: { confirmado: u.rows[0].confirmado, ingreso: u.rows[0].ingreso },
    alumno: alumno.rows,
    traza: traza.rows.map((t) => `${t.disparador} · ${t.operacion} · confirmado=${t.confirmado} · ${t.accion}`),
  };
}
