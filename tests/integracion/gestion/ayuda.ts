// Apoyo de las pruebas de B09 (T09.3): reloj fijo y datos de las sesiones compartidas como en B06/B07, limpieza de lo que crea la gestión
// directa (clases, reservas, mails de gestión y personas cargadas con alta_alumno) y registro de entrada y salida de cada caso.
// Reloj de la aplicación (ADR-014) fijo en lunes 2026-11-02 12:00 de Montevideo. Solo @example.test (NFR-02).
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from '../../soporte/bd';
import { contarMails, esperarMail } from '../../soporte/correo';
import { RAIZ } from '../../soporte/entorno';
import { clienteAnon, rpc, MAIL_PROFESOR, SLUG_A, type Rol } from '../../soporte/usuarios';
import { entorno } from '../../soporte/entorno';
import { TOKEN_CAPTCHA } from '../../soporte/captcha';
import { limpiarT05, PREFIJO_NOMBRE } from '../cuentas/ayuda';
import { limpiarB06 } from '../reservas/ayuda';
import {
  AHORA,
  alumnoDe,
  detalle,
  esperarMailCon,
  idsProfesores,
  leer,
  mailsA,
  mensaje,
  pedirReserva,
  prepararB07,
  slot,
  terminarB07,
  type Ids,
  type MailPlano,
} from '../respuestas/ayuda';

export { AHORA, alumnoDe, detalle, idsProfesores, leer, mailsA, mensaje, pedirReserva, slot, PREFIJO_NOMBRE, type Ids, type MailPlano };

const TIPOS = `('clase_creada', 'clase_movida', 'clase_cancelada')`;

export async function limpiarB09(): Promise<void> {
  await sql(`delete from public.mail_salida where tipo in ${TIPOS}`);
  await limpiarB06(); // clases, reservas y solicitudes de las sesiones compartidas y las personas a cargo «T06 …», en ese orden
  await limpiarT05();
}
export async function prepararB09(): Promise<void> {
  await limpiarB09();
  await prepararB07();
}
export async function terminarB09(): Promise<void> {
  await limpiarB09();
  await terminarB07();
}

export const crear = (rol: Rol, args: Record<string, unknown>) => rpc(rol, 'crear_clase', args);

/** Id de la clase viva (confirmada o pendiente) de la persona con ese inicio, por conexión directa. */
export async function claseDe(alumnoId: string, inicio: string): Promise<string> {
  const f = await sql<{ id: string }>(`select id from public.clase where alumno_id = $1 and inicio = $2::timestamptz and estado in ('confirmada', 'pendiente')`, [alumnoId, inicio]);
  if (f.length !== 1) throw new Error(`No hay una clase viva de ${alumnoId} en ${inicio}`);
  return f[0].id;
}
export async function estados(alumnoId: string): Promise<Record<string, string>> {
  const f = await sql<{ dia: string; estado: string }>(
    `select to_char(inicio at time zone 'America/Montevideo', 'MM-DD HH24:MI') as dia, estado from public.clase where alumno_id = $1 order by inicio`,
    [alumnoId],
  );
  return Object.fromEntries(f.map((x) => [x.dia, x.estado]));
}

/** Espera el mail nuevo (el más reciente) a `para` con ese asunto, después de que había `antes`; devuelve remitente, Reply-To y texto. */
export async function esperarNuevo(para: string, asunto: string, antes: number): Promise<MailPlano> {
  for (let i = 0; i < 120 && (await mailsA(para, asunto)) <= antes; i++) await new Promise((r) => setTimeout(r, 250));
  return esperarMailCon(para, asunto, '');
}

/** Entrada usada y salida obtenida de cada caso: test-results/evidencia-gestion.jsonl (sin secretos). */
export function registrar(caso: string, entrada: unknown, salida: unknown): void {
  const dir = resolve(RAIZ, 'test-results');
  mkdirSync(dir, { recursive: true });
  appendFileSync(resolve(dir, 'evidencia-gestion.jsonl'), JSON.stringify({ caso, entrada, salida, fecha: new Date().toISOString() }) + '\n');
}

/**
 * Deja en la caché de sesiones (test-results/.sesiones-integracion.json) una sesión vigente del profesor A. `ingresarPorCodigo` de
 * soporte/usuarios.ts cuenta los mails con la búsqueda por defecto de Mailpit (50) y, con más de 50 mails al profesor, toma uno viejo
 * que no trae código (defecto H de soporte, aviso en el informe). Aquí se cuenta con `contarMails` de soporte/correo.ts, que pagina.
 */
export async function asegurarSesionProfesor(): Promise<void> {
  const archivo = resolve(RAIZ, 'test-results', '.sesiones-integracion.json');
  const cache = (existsSync(archivo) ? JSON.parse(readFileSync(archivo, 'utf8')) : {}) as Record<string, { exp: number; apiUrl: string; userId: string | null }>;
  const previa = cache.profesor;
  if (previa && previa.apiUrl === entorno().apiUrl && previa.exp * 1000 > Date.now() + 5 * 60_000 && previa.userId) return;
  const c = clienteAnon();
  let antes = await contarMails(MAIL_PROFESOR);
  let r = await c.auth.signInWithOtp({ email: MAIL_PROFESOR, options: { shouldCreateUser: true, captchaToken: TOKEN_CAPTCHA } });
  if (r.error?.status === 429) {
    await new Promise((res) => setTimeout(res, 62_000)); // max_frequency = 60 s por mail
    antes = await contarMails(MAIL_PROFESOR);
    r = await c.auth.signInWithOtp({ email: MAIL_PROFESOR, options: { shouldCreateUser: true, captchaToken: TOKEN_CAPTCHA } });
  }
  if (r.error) throw new Error(`signInWithOtp ${MAIL_PROFESOR}: ${r.error.message}`);
  const m = await esperarMail(MAIL_PROFESOR, antes + 1);
  const v = await c.auth.verifyOtp({ email: MAIL_PROFESOR, token: m.codigo!, type: 'email' });
  if (v.error || !v.data.session) throw new Error(`verifyOtp ${MAIL_PROFESOR}: ${v.error?.message}`);
  await sql('select privado.configurar_profesor($1, $2, $3)', [MAIL_PROFESOR, 'Profesor de Prueba', SLUG_A]);
  const token = v.data.session.access_token;
  const exp = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).exp as number;
  cache.profesor = { rol: 'profesor', mail: MAIL_PROFESOR, userId: v.data.user!.id, accessToken: token, exp, apiUrl: entorno().apiUrl } as never;
  mkdirSync(resolve(RAIZ, 'test-results'), { recursive: true });
  writeFileSync(archivo, JSON.stringify(cache));
}
