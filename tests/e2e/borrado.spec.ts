// E2E de B11 (T11.3) · ALU-12: el profesor borra a un alumno desde su lista con el diálogo de confirmación. CA-10, CA-57, ALU-12, DEC-26 A.
// Reloj real (el JWT vence con la hora real); la clase futura es relativa a hoy. Datos sintéticos `T11 …` (@example.test), que se limpian.
// Un alumno sin cuenta y solo de A: el diálogo avisa que sus datos se borran, la clase futura se cancela y el hueco queda libre; la persona
// sale de la lista y en la base queda anonimizada (su historial sigue sin nombre).
import { execSync } from 'node:child_process';
import type { Page } from '@playwright/test';
import { expect, test } from '../soporte/evidencia';
import { cerrar, sql } from '../soporte/bd';
import { SITEKEY_PRUEBA } from '../soporte/captcha';
import { esperarMail, contarMails } from '../soporte/correo';
import { entorno, RAIZ } from '../soporte/entorno';
import { MAIL_PROFESOR } from '../soporte/usuarios';
import { clase, idsProfesores, limpiar, persona } from '../integracion/retencion/ayuda';

const BASE = process.env.RTC_BASE ?? '/reservas/';
const ORIGEN = process.env.BASE_URL ?? `http://127.0.0.1:${process.env.RTC_PREVIEW_PORT || '4173'}`;
const NOMBRE = 'T11 Borrar Sin Cuenta';

test.use({ locale: 'es-UY', timezoneId: 'America/Montevideo', viewport: { width: 1280, height: 900 } });

async function entrar(page: Page, mail: string) {
  const antes = await contarMails(mail);
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
/** Un miércoles (hora de Montevideo) lejano (45 o más días), `YYYY-MM-DD`: otras suites usan días cercanos. */
function miercoles(): string {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montevideo', year: 'numeric', month: '2-digit', day: '2-digit' });
  const d = new Date(Date.now() + 45 * 86_400_000);
  while (new Date(f.format(d) + 'T12:00:00Z').getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  return f.format(d);
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
});
test.afterAll(async () => {
  await limpiar();
  await cerrar();
});

test('ALU-12 CA-10 CA-57 el profesor borra a un alumno sin cuenta desde la lista y se cancelan sus clases futuras', async ({ page, evidencia }) => {
  test.setTimeout(300_000);
  const cu = evidencia({
    cu: 'ALU-12',
    titulo: 'El profesor borra a un alumno desde su lista, con confirmación y resumen de lo cancelado',
    criterios: ['CA-10', 'CA-57', 'ALU-12', 'DEC-26'],
    bolt: 'B11',
  });
  const ids = await idsProfesores();
  const dia = miercoles();
  const hora = `${String(6 + (process.pid % 16)).padStart(2, '0')}:${String(Date.now() % 60).padStart(2, '0')}`; // horario propio, derivado de valores únicos: no choca con otras suites en paralelo
  const alumno = await persona('t11e2e', NOMBRE, ids, { cuenta: false, mail: null, con: { PA: 'sin_cuenta' }, telefono: '099 411 411' });
  await sql('update public.alumno set creado_por = $2 where id = $1', [alumno.id, ids.PA]); // lo dio de alta A: ficha solo suya
  const futura = await clase(ids.PA, alumno.id, `${dia}T${hora}:00-03:00`);
  await entrar(page, MAIL_PROFESOR);

  await cu.paso('Abrir la lista y ver al alumno', async () => {
    await page.goto(`${ORIGEN}${BASE}#/lista`);
    await expect(page.getByRole('button', { name: `Borrar a ${NOMBRE}` })).toBeVisible({ timeout: 30_000 });
  }, { esperado: 'El alumno figura en la lista con sus botones, entre ellos «Borrar»' });

  await cu.paso('Abrir el diálogo de borrado', async () => {
    await page.getByRole('button', { name: `Borrar a ${NOMBRE}` }).click();
    const dialogo = page.getByRole('dialog', { name: `Borrar a ${NOMBRE}` });
    await expect(dialogo).toBeVisible();
    await expect(dialogo).toContainText('Esto no se puede deshacer. Qué pasa si lo borrás:');
    await expect(dialogo).toContainText('Sus clases futuras con vos se cancelan y esos horarios quedan libres.');
    await expect(dialogo).toContainText('No tiene cuenta ni otro profesor: sus datos y sus personas a cargo se borran y no se pueden recuperar.');
    await expect(dialogo).toContainText('No le avisamos por mail.');
  }, { esperado: 'El diálogo explica el efecto, que se borran sus datos (sin cuenta ni otro profesor) y que no se le avisa por mail' });

  await cu.paso('Cancelar no borra nada', async () => {
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const [a] = await sql<{ nombre: string | null }>('select nombre from public.alumno where id = $1', [alumno.id]);
    expect(a.nombre).toBe(NOMBRE);
  }, { esperado: 'El diálogo se cierra y el alumno sigue intacto' });

  await cu.paso('Confirmar el borrado', async () => {
    await page.getByRole('button', { name: `Borrar a ${NOMBRE}` }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Borrar alumno' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Alumno borrado: se canceló 1 clase.' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: `Borrar a ${NOMBRE}` })).toHaveCount(0);
    const [a] = await sql<{ nombre: string | null; estado: string; telefono: string | null }>('select nombre, estado, telefono from public.alumno where id = $1', [alumno.id]);
    expect(a).toEqual({ nombre: null, estado: 'borrado', telefono: null });
    const [c] = await sql<{ estado: string }>('select estado from public.clase where id = $1', [futura]);
    expect(c.estado).toBe('cancelada');
    const [m] = await sql<{ n: string }>('select count(*)::text as n from public.mail_salida where alumno_id = $1', [alumno.id]);
    expect(m.n).toBe('0');
  }, { esperado: 'Aparece «Alumno borrado: se canceló 1 clase.», el alumno sale de la lista, queda anonimizado, su clase futura cancelada y sin mails' });

  await cu.paso('Recargar: el alumno no vuelve', async () => {
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(NOMBRE)).toHaveCount(0);
  }, { esperado: 'Tras recargar la lista no aparece el alumno' });
});
