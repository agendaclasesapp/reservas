// E2E de la respuesta del profesor (B07, T07.3): WEB-07 · CA-21, CA-55, SOL-05 el profesor confirma una solicitud pendiente desde su lista y
// WEB-05 · CA-20 el alumno la ve primero pendiente y luego confirmada en Mis clases. ESCRITO SIN CORRER (se agotaron los turnos de T07.3):
// los selectores salen de las vistas de T07.2 (TarjetaSolicitud, SolicitudesPendientes, VistaMisClases) y pueden necesitar ajuste.
// Reloj real (el JWT vence con la hora real); fecha relativa a hoy. Datos sintéticos con prefijo `T05 `, que se limpian.
import { execSync } from 'node:child_process';
import type { Page } from '@playwright/test';
import { expect, test } from '../soporte/evidencia';
import { cerrar, sql } from '../soporte/bd';
import { SITEKEY_PRUEBA } from '../soporte/captcha';
import { esperarMail, contarMails } from '../soporte/correo';
import { entorno, RAIZ } from '../soporte/entorno';
import { MAIL_PROFESOR } from '../soporte/usuarios';
import { crearAlumno, limpiarT05, mailT05, profesorId } from '../integracion/cuentas/ayuda';

const BASE = process.env.RTC_BASE ?? '/reservas/';
const ORIGEN = process.env.BASE_URL ?? `http://127.0.0.1:${process.env.RTC_PREVIEW_PORT || '4173'}`;
const NOMBRE = 'T05 Alumna Respuesta';

test.use({ locale: 'es-UY', timezoneId: 'America/Montevideo', viewport: { width: 1280, height: 900 } });

async function mailsA(m: string): Promise<number> {
  return contarMails(m);
}
async function entrar(page: Page, mail: string) {
  const antes = await mailsA(mail);
  await page.goto(`${ORIGEN}${BASE}#/ingreso`);
  await page.getByRole('button', { name: 'Entrar con un código por mail' }).click();
  await page.getByLabel(/^Mail/).fill(mail);
  await expect(async () => {
    await page.getByRole('button', { name: 'Pedir código' }).click();
    await expect(page.getByRole('heading', { name: 'Ingresá el código' })).toBeVisible({ timeout: 2_500 });
  }).toPass({ timeout: 90_000, intervals: [1_000, 2_000, 3_000] });
  const codigo = (await esperarMail(mail, antes + 1)).codigo!;
  await page.getByLabel('Código de 6 dígitos').fill(codigo);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).not.toHaveURL(/#\/ingreso/, { timeout: 30_000 });
}
/** Un miércoles (hora de Montevideo) a 8 o más días de hoy, `YYYY-MM-DD`. */
function miercoles(): string {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montevideo', year: 'numeric', month: '2-digit', day: '2-digit' });
  const d = new Date(Date.now() + 8 * 86_400_000);
  while (new Date(f.format(d) + 'T12:00:00Z').getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  return f.format(d);
}
async function limpiar() {
  await sql(`delete from public.solicitud where alumno_id in (select id from public.alumno where nombre like 'T05 %')`);
  await limpiarT05();
}

test.beforeAll(async () => {
  test.setTimeout(300_000);
  const e = entorno();
  if (!process.env.BASE_URL) {
    execSync('npm run build', {
      cwd: RAIZ,
      stdio: 'ignore',
      timeout: 240_000,
      env: { ...process.env, VITE_SUPABASE_URL: e.apiUrl, VITE_SUPABASE_ANON_KEY: e.anonKey, VITE_TURNSTILE_SITEKEY: SITEKEY_PRUEBA },
    });
  }
  await limpiar();
});
test.afterEach(limpiar);
test.afterAll(cerrar);

test('WEB-07 WEB-05 CA-20 CA-21 CA-55 el profesor confirma una solicitud y el alumno la ve confirmada en Mis clases', async ({ browser, evidencia }) => {
  test.setTimeout(300_000);
  const cu7 = evidencia({ cu: 'WEB-07-responder', titulo: 'El profesor confirma una solicitud pendiente desde su lista', criterios: ['CA-21', 'CA-55', 'SOL-05', 'PRF-06', 'WEB-07'], bolt: 'B07' });
  const cu5 = evidencia({ cu: 'WEB-05', titulo: 'Mis clases: la solicitud pasa de pendiente a confirmada', criterios: ['CA-20', 'RES-06', 'ALU-03', 'WEB-05'], bolt: 'B07' });
  const dia = miercoles();
  const mail = mailT05('e2e.resp');
  const alumnoId = await crearAlumno({ nombre: 'Alumna Respuesta', estado: 'aprobado', telefono: '+598 99555222', mail });
  const A = await profesorId();
  const inicio = `${dia}T10:00:00-03:00`;
  const [r] = await sql<{ id: string }>(
    `insert into public.reserva (profesor_id, alumno_id, tipo, hora_local, dia_semana, duracion_min, estado, desde, origen, observacion)
     values ($1, $2, 'suelta', '10:00', 3, 60, 'pendiente', $3::date, 'solicitud', 'Primera clase E2E') returning id`, [A, alumnoId, dia]);
  await sql(`insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado) values ($1, $2, $3, $4::timestamptz, $4::timestamptz + interval '1 hour', 'pendiente')`, [A, r.id, alumnoId, inicio]);
  await sql(`insert into public.solicitud (profesor_id, alumno_id, tipo, reserva_id, fecha_clase, estado) values ($1, $2, 'reserva', $3, $4::timestamptz, 'pendiente')`, [A, alumnoId, r.id, inicio]);

  const ctxAlumno = await browser.newContext({ locale: 'es-UY', timezoneId: 'America/Montevideo', storageState: { cookies: [], origins: [] } });
  const ctxProfesor = await browser.newContext({ locale: 'es-UY', timezoneId: 'America/Montevideo', storageState: { cookies: [], origins: [] } });
  const alumno = await ctxAlumno.newPage();
  const profe = await ctxProfesor.newPage();
  await entrar(alumno, mail);
  await entrar(profe, MAIL_PROFESOR);

  await cu5.paso('Abrir Mis clases con la solicitud pendiente', async () => {
    await alumno.goto(`${ORIGEN}${BASE}#/mis-clases`);
    await expect(alumno.getByRole('heading', { name: 'Mis clases', level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(alumno.getByRole('heading', { name: 'Solicitudes pendientes' })).toBeVisible();
    await expect(alumno.getByText('Profesor de Prueba').first()).toBeVisible();
    await expect(alumno.getByText('Esperando que el profesor confirme')).toBeVisible();
  }, { esperado: 'La clase figura en «Solicitudes pendientes» con el profesor y el aviso de que espera la confirmación' });

  await cu7.paso('Abrir la lista del profesor y ver la solicitud pendiente', async () => {
    await profe.goto(`${ORIGEN}${BASE}#/lista`);
    await expect(profe.getByRole('heading', { name: 'Solicitudes pendientes', level: 2 })).toBeVisible({ timeout: 30_000 });
    await expect(profe.getByRole('article', { name: NOMBRE })).toBeVisible();
    await expect(profe.getByRole('article', { name: NOMBRE })).toContainText('Primera clase E2E');
  }, { esperado: 'La tarjeta de la alumna muestra tipo, fecha, hora y observación como texto, con Confirmar y Rechazar' });

  await cu7.paso('Confirmar la solicitud', async () => {
    await profe.getByRole('button', { name: new RegExp(`^Confirmar la solicitud de ${NOMBRE}`) }).click();
    await expect(profe.getByText('Solicitud confirmada. Le avisamos por mail.')).toBeVisible({ timeout: 20_000 });
    await expect(profe.getByRole('article', { name: NOMBRE })).toHaveCount(0);
    const [s] = await sql<{ estado: string }>('select estado from public.solicitud where alumno_id = $1', [alumnoId]);
    expect(s.estado).toBe('confirmada');
  }, { esperado: 'Aparece «Solicitud confirmada…», la tarjeta sale de la lista y la solicitud queda confirmada' });

  await cu5.paso('Recargar Mis clases: la clase figura confirmada', async () => {
    await alumno.goto(`${ORIGEN}${BASE}#/mis-clases`);
    await alumno.reload();
    await expect(alumno.getByRole('heading', { name: 'Próximas clases' })).toBeVisible({ timeout: 30_000 });
    await expect(alumno.getByText('Confirmada').first()).toBeVisible();
    await expect(alumno.getByText('Esperando que el profesor confirme')).toHaveCount(0);
  }, { esperado: 'La clase pasa a «Próximas clases» como Confirmada, con su profesor' });

  await ctxAlumno.close();
  await ctxProfesor.close();
});
