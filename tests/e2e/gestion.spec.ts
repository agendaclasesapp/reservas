// E2E del panel del profesor (B09, T09.3): WEB-06 · CA-21, CA-28, CA-63, PRF-02. El profesor abre #/panel, ve los contadores en texto, crea una clase
// para una persona aprobada con mail (aviso «Se enviará un mail al titular» y el mail llega con su remitente), la mueve y la cancela; con la agenda
// inactiva Crear y Mover quedan deshabilitados y Cancelar sigue; en móvil el foco tras un éxito queda en la región del resultado.
// Reloj real (el JWT vence con la hora real); fecha relativa a hoy. Datos sintéticos con prefijo `T05 `, que se limpian.
import { execSync } from 'node:child_process';
import type { Page } from '@playwright/test';
import { expect, test } from '../soporte/evidencia';
import { cerrar, sql } from '../soporte/bd';
import { SITEKEY_PRUEBA } from '../soporte/captcha';
import { esperarMail, contarMails } from '../soporte/correo';
import { entorno, RAIZ } from '../soporte/entorno';
import { MAIL_PROFESOR, SLUG_A } from '../soporte/usuarios';
import { crearAlumno, crearClase, esperarMailConAsunto, limpiarT05, mailT05 } from '../integracion/cuentas/ayuda';

const BASE = process.env.RTC_BASE ?? '/reservas/';
const ORIGEN = process.env.BASE_URL ?? `http://127.0.0.1:${process.env.RTC_PREVIEW_PORT || '4173'}`;
const PROFESOR_NOMBRE = 'Profesor de Prueba';

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
/** Un miércoles (hora de Montevideo) a 8 o más días de hoy, `YYYY-MM-DD`. */
function miercoles(): string {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montevideo', year: 'numeric', month: '2-digit', day: '2-digit' });
  const d = new Date(Date.now() + 8 * 86_400_000);
  while (new Date(f.format(d) + 'T12:00:00Z').getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  return f.format(d);
}
const ddmm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
async function limpiar() {
  await sql(`update public.profesor set activo = true where slug = $1`, [SLUG_A]);
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

async function abrirPanel(page: Page, dia: string) {
  await page.goto(`${ORIGEN}${BASE}#/panel?d=${dia}`);
  await expect(page.getByRole('heading', { name: 'Panel', level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('list', { name: 'Huecos del día' })).toBeVisible({ timeout: 30_000 });
}
const hueco = (page: Page, prefijo: string) => page.getByRole('button', { name: new RegExp(`^${prefijo}`) });
const exito = (page: Page, texto: RegExp) => page.getByRole('status').filter({ hasText: texto });

/** Crear la clase de las 10:00 con el alumno aprobado con mail (el aviso del mail se comprueba antes de crear). */
async function crearDesdeHueco(page: Page, dia: string) {
  await hueco(page, '10:00 a 11:00 Libre').click();
  await expect(page.getByRole('heading', { name: 'Crear clase', level: 3 })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Buscar alumno' }).fill('Alumna Gestion');
  await page.getByRole('radio', { name: /Alumna Gestion/ }).check();
  await expect(page.getByText('Se enviará un mail al titular')).toBeVisible();
  await page.getByRole('textbox', { name: 'Observación' }).fill('Clase creada desde el E2E');
  await page.getByRole('button', { name: 'Crear clase' }).click();
  await expect(exito(page, new RegExp(`Clase creada para .*Alumna Gestion el ${ddmm(dia)} 10:00`))).toBeVisible({ timeout: 20_000 });
}

test('WEB-06 CA-21 CA-28 PRF-02 el profesor ve los contadores, crea una clase con aviso de mail, la mueve y la cancela', async ({ browser, evidencia }) => {
  test.setTimeout(300_000);
  const cu = evidencia({ cu: 'WEB-06', titulo: 'Panel del profesor: contadores, crear, mover y cancelar una clase', criterios: ['CA-21', 'CA-28', 'PRF-02', 'WEB-06', 'AVI-01', 'AVI-04'], bolt: 'B09' });
  const dia = miercoles();
  const mail = mailT05('e2e.gestion');
  await crearAlumno({ nombre: 'Alumna Gestion', estado: 'aprobado', telefono: '+598 99555333', mail });
  await crearAlumno({ nombre: 'Cuenta Pendiente Gestion', estado: 'pendiente', telefono: '+598 99555334', mail: mailT05('e2e.gestion.pend') });
  const ctx = await browser.newContext({ locale: 'es-UY', timezoneId: 'America/Montevideo', storageState: { cookies: [], origins: [] }, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await entrar(page, MAIL_PROFESOR);
  const asunto = `${PROFESOR_NOMBRE} te reservó una clase`;

  await cu.paso('Abrir el panel y ver los contadores en texto', async () => {
    await abrirPanel(page, dia);
    const pendientes = page.getByRole('region', { name: 'Pendientes' });
    await expect(pendientes).toBeVisible();
    await expect(pendientes.getByRole('link', { name: /\d+ cuentas? pendientes?/ })).toHaveAttribute('href', '#/lista');
    await expect(pendientes).toContainText(/solicitudes? pendientes?/);
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
  }, { esperado: 'El panel muestra los avisos «N cuentas pendientes» y las solicitudes, como texto con enlace a la lista, y la agenda del día' });

  await cu.paso('Crear una clase para una persona aprobada con mail', async () => {
    await crearDesdeHueco(page, dia);
    await expect(page.getByText('Le avisamos por mail al titular.')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Clase creada' })).toBeFocused();
    await expect(hueco(page, '10:00 a 11:00 Ocupado')).toContainText('Clase creada desde el E2E');
  }, { esperado: 'Se ve «Se enviará un mail al titular» antes de crear, el éxito se anuncia, el foco queda en la región del resultado y el hueco pasa a Ocupado con la observación' });

  await cu.paso('El mail llega al titular con el nombre del profesor como remitente', async () => {
    const m = await esperarMailConAsunto(mail, asunto);
    expect(m.From.Name).toContain(PROFESOR_NOMBRE);
    expect(m.ReplyTo?.map((x) => x.Address)).toEqual([MAIL_PROFESOR]);
  }, { esperado: 'Mailpit tiene «<Profesor> te reservó una clase» con remitente del profesor y Reply-To a su mail' });

  await cu.paso('Mover la clase a otro horario del mismo día', async () => {
    await hueco(page, '10:00 a 11:00 Ocupado').click();
    await expect(page.getByRole('heading', { name: 'Elegí qué hacer con la clase', level: 3 })).toBeVisible();
    await page.getByRole('button', { name: 'Mover', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Mover la clase', level: 3 })).toBeVisible();
    await page.getByRole('radio', { name: '11:00 a 12:00' }).check();
    await page.getByRole('button', { name: 'Mover clase' }).click();
    await expect(exito(page, new RegExp(`Clase movida al ${ddmm(dia)} 11:00`))).toBeVisible({ timeout: 20_000 });
    await expect(hueco(page, '11:00 a 12:00 Ocupado')).toBeVisible();
    await expect(hueco(page, '10:00 a 11:00 Libre')).toBeVisible();
  }, { esperado: 'Aparece «Clase movida al <fecha> 11:00»; la agenda muestra la clase a las 11:00 y las 10:00 libres' });

  await cu.paso('Cancelar la clase', async () => {
    await hueco(page, '11:00 a 12:00 Ocupado').click();
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Cancelar la clase', level: 3 })).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar cancelación' }).click();
    await expect(exito(page, new RegExp(`Clase cancelada: .*Alumna Gestion, ${ddmm(dia)} 11:00`))).toBeVisible({ timeout: 20_000 });
    await expect(hueco(page, '11:00 a 12:00 Libre')).toBeVisible();
  }, { esperado: 'Aparece «Clase cancelada: …» y el horario queda libre' });

  await ctx.close();
});

test('WEB-06 CA-63 PRF-08 con el profesor inactivo, Crear y Mover quedan deshabilitados y Cancelar sigue disponible', async ({ browser, evidencia }) => {
  test.setTimeout(300_000);
  const cu = evidencia({ cu: 'WEB-06-inactivo', titulo: 'Panel con la agenda inactiva: solo se puede cancelar', criterios: ['CA-63', 'PRF-08', 'WEB-06'], bolt: 'B09' });
  const dia = miercoles();
  const alumnoId = await crearAlumno({ nombre: 'Alumna Gestion', estado: 'aprobado', telefono: '+598 99555333', mail: mailT05('e2e.inactivo') });
  await crearClase(alumnoId, `${dia}T11:00:00-03:00`);
  await sql(`update public.profesor set activo = false where slug = $1`, [SLUG_A]);
  const ctx = await browser.newContext({ locale: 'es-UY', timezoneId: 'America/Montevideo', storageState: { cookies: [], origins: [] }, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await entrar(page, MAIL_PROFESOR);

  await cu.paso('Abrir el panel con la agenda inactiva', async () => {
    await abrirPanel(page, dia);
    await expect(page.getByRole('status').filter({ hasText: 'Tu agenda está inactiva: no podés crear ni mover clases' })).toBeVisible();
  }, { esperado: 'El panel avisa que la agenda está inactiva y que solo se puede cancelar' });

  await cu.paso('Crear clase queda deshabilitado en un hueco libre', async () => {
    await hueco(page, '10:00 a 11:00 Libre').click();
    await expect(page.getByText('Con la agenda inactiva no podés crear clases.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crear clase' })).toBeDisabled();
    await page.getByRole('button', { name: 'Cerrar' }).click();
  }, { esperado: 'Aparece la explicación y el botón «Crear clase» está deshabilitado' });

  await cu.paso('Mover queda deshabilitado y Cancelar disponible en una clase', async () => {
    await hueco(page, '11:00 a 12:00 Ocupado').click();
    await expect(page.getByText('Con la agenda inactiva no podés mover clases. Sí podés cancelarlas.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mover', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Cancelar', exact: true })).toBeEnabled();
  }, { esperado: '«Mover» deshabilitado con su explicación y «Cancelar» habilitado' });

  await cu.paso('Cancelar la clase con la agenda inactiva', async () => {
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar cancelación' }).click();
    await expect(exito(page, new RegExp(`Clase cancelada: .*Alumna Gestion, ${ddmm(dia)} 11:00`))).toBeVisible({ timeout: 20_000 });
    const [c] = await sql<{ estado: string }>('select estado from public.clase where alumno_id = $1', [alumnoId]);
    expect(c.estado).toBe('cancelada');
  }, { esperado: 'La cancelación se confirma y la clase queda cancelada en la base' });

  await ctx.close();
});

test('WEB-06 PRF-02 en móvil el foco tras un éxito queda en la región del resultado', async ({ browser, evidencia }) => {
  test.setTimeout(300_000);
  const cu = evidencia({ cu: 'WEB-06-movil', titulo: 'Panel en móvil: el foco tras crear una clase queda en el resultado', criterios: ['WEB-06', 'PRF-02', 'NFR-08'], bolt: 'B09' });
  const dia = miercoles();
  await crearAlumno({ nombre: 'Alumna Gestion', estado: 'aprobado', telefono: '+598 99555333', mail: mailT05('e2e.movil') });
  const ctx = await browser.newContext({ locale: 'es-UY', timezoneId: 'America/Montevideo', storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await entrar(page, MAIL_PROFESOR);

  await cu.paso('Tocar un hueco libre abre un diálogo en móvil', async () => {
    await abrirPanel(page, dia);
    await hueco(page, '10:00 a 11:00 Libre').click();
    await expect(page.getByRole('dialog', { name: /^Hueco libre del/ })).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar' }).click();
  }, { esperado: 'Se abre el diálogo «Hueco libre del …»' });

  await cu.paso('Crear la clase y ver dónde queda el foco', async () => {
    await crearDesdeHueco(page, dia);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const region = page.getByRole('status').filter({ hasText: 'Clase creada' });
    await expect(region).toBeFocused({ timeout: 5_000 });
  }, { esperado: 'El diálogo se cierra, el éxito se anuncia y el foco queda en la región del resultado y no en el disparador' });

  await ctx.close();
});
