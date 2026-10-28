// E2E de la configuración de la agenda y los bloqueos (B10, T10.3): WEB-08 · T-WEB-03 (CA-12, CA-13), T-AGE-11 (CA-14, AGE-05, AGE-06; WEB-06).
// El profesor entra una vez con el código de Mailpit y la sesión se reutiliza. Reloj real (el JWT vence con la hora real); fechas relativas a hoy.
// Se escribe contra roles y textos accesibles. Corre contra dist/ servido por vite preview. La configuración del profesor se restaura al terminar.
// Evidencia de caso de uso: AIDLC_EVIDENCIAS/WEB-08-*/ (fixture de tests/soporte/evidencia.ts).
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '../soporte/evidencia';
import { cerrar, sql } from '../soporte/bd';
import { SITEKEY_PRUEBA } from '../soporte/captcha';
import { contarMails, esperarMail } from '../soporte/correo';
import { entorno, RAIZ } from '../soporte/entorno';
import { MAIL_PROFESOR, rpc, SLUG_A } from '../soporte/usuarios';
import { crearAlumno, limpiarT05, mailT05 } from '../integracion/cuentas/ayuda';

const BASE = process.env.RTC_BASE ?? '/reservas/';
const ORIGEN = process.env.BASE_URL ?? `http://127.0.0.1:${process.env.RTC_PREVIEW_PORT || '4173'}`;
const SESION = resolve(RAIZ, 'test-results', '.sesion-profesor-config-e2e.json');
const CONFIG = `${ORIGEN}${BASE}#/configuracion`;
const PREFIJO_MOTIVO = 'T10 ';

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

async function limpiar() {
  await sql("update public.profesor set duracion_min = 60, anticipacion_horas = 24, zona_horaria = 'America/Montevideo', activo = true where slug = $1", [SLUG_A]);
  await sql(`delete from public.bloqueo where motivo like '${PREFIJO_MOTIVO}%'`);
  await limpiarT05();
}

test.beforeAll(async ({ browser }) => {
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
  mkdirSync(resolve(RAIZ, 'test-results'), { recursive: true });
  const ctx = await browser.newContext({ locale: 'es-UY', storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await entrar(page, MAIL_PROFESOR);
  await page.goto(CONFIG);
  await expect(page.getByRole('heading', { name: 'Configuración', level: 1 })).toBeVisible({ timeout: 30_000 });
  await ctx.storageState({ path: SESION });
  await ctx.close();
});
test.afterEach(limpiar);
test.afterAll(cerrar);

test.describe('profesor', () => {
  test.use({ storageState: SESION });

  test('WEB-08 T-WEB-03 configurar anticipación y huso, con errores por campo, y que persista al recargar (CA-12, CA-13)', async ({ page, evidencia }) => {
    test.setTimeout(240_000);
    const cu = evidencia({
      cu: 'WEB-08-configuracion',
      titulo: 'El profesor configura la duración, la anticipación mínima y el huso de su agenda',
      criterios: ['WEB-08', 'T-WEB-03', 'AGE-02', 'AGE-03', 'AGE-04', 'AGE-08', 'CA-12', 'CA-13', 'H-140'],
      bolt: 'B10',
    });
    const anticipacion = () => page.getByLabel(/^Anticipación mínima \(horas\)/);
    const duracion = () => page.getByLabel(/^Duración de la clase \(minutos\)/);
    const exito = () => page.getByRole('status').filter({ hasText: 'Listo: guardamos la configuración de tu agenda.' });

    await cu.paso(
      'Abrir Configuración',
      async () => {
        await page.goto(CONFIG);
        await expect(page.getByRole('heading', { name: 'Configuración', level: 1 })).toBeVisible({ timeout: 30_000 });
        for (const t of ['Duración de clase', 'Anticipación mínima', 'Huso horario']) await expect(page.getByRole('heading', { name: t, level: 2 })).toBeVisible();
        await expect(duracion()).toHaveValue('60');
        await expect(anticipacion()).toHaveValue('24');
        await expect(page.locator('#config-huso')).toHaveValue('America/Montevideo');
      },
      { esperado: 'Se ven la grilla y las secciones Duración, Anticipación y Huso, con los valores guardados (60 min, 24 h, America/Montevideo)' },
    );
    await cu.paso(
      'Una duración de 0 muestra el error junto al campo y no guarda',
      async () => {
        await duracion().fill('0');
        await page.getByRole('button', { name: 'Guardar duración' }).click();
        await expect(page.getByText('La duración tiene que ser un número entero de minutos', { exact: false })).toBeVisible();
        await expect(duracion()).toHaveAttribute('aria-invalid', 'true');
        expect((await sql<{ d: number }>('select duracion_min as d from public.profesor where slug = $1', [SLUG_A]))[0].d).toBe(60);
        await duracion().fill('60');
      },
      { esperado: 'Aparece «La duración tiene que ser un número entero de minutos entre 1 y 1440», el campo queda marcado como inválido y la base sigue en 60' },
    );
    await cu.paso(
      'Una anticipación negativa o mayor que 8784 muestra el error junto al campo y no guarda',
      async () => {
        for (const valor of ['-1', '8785']) {
          await anticipacion().fill(valor);
          await page.getByRole('button', { name: 'Guardar anticipación' }).click();
          await expect(page.getByText('La anticipación tiene que ser un número entero de horas', { exact: false })).toBeVisible();
          await expect(anticipacion()).toHaveAttribute('aria-invalid', 'true');
        }
        expect((await sql<{ a: number }>('select anticipacion_horas as a from public.profesor where slug = $1', [SLUG_A]))[0].a).toBe(24);
      },
      { esperado: 'Con -1 y con 8785 aparece «La anticipación tiene que ser un número entero de horas entre 0 y 8784» y la base sigue en 24' },
    );
    await cu.paso(
      'Guardar la anticipación en 12 horas',
      async () => {
        await anticipacion().fill('12');
        await page.getByRole('button', { name: 'Guardar anticipación' }).click();
        await expect(exito()).toBeVisible({ timeout: 20_000 });
        expect((await sql<{ a: number }>('select anticipacion_horas as a from public.profesor where slug = $1', [SLUG_A]))[0].a).toBe(12);
      },
      { esperado: 'Aparece «Listo: guardamos la configuración de tu agenda.» y la base tiene 12 horas' },
    );
    await cu.paso(
      'Cambiar el huso pide confirmación y la advertencia dice que solo cambia su agenda',
      async () => {
        await page.locator('#config-huso').selectOption('America/Sao_Paulo');
        await page.getByRole('button', { name: 'Guardar huso horario' }).click();
        const dialogo = page.getByRole('dialog', { name: 'Cambiar el huso horario' });
        await expect(dialogo).toBeVisible();
        await expect(dialogo).toContainText('Solo cambia tu agenda, no la de otros profesores');
        await dialogo.getByRole('button', { name: 'Cambiar huso' }).click();
        await expect(dialogo).toBeHidden({ timeout: 20_000 });
        await expect.poll(async () => (await sql<{ z: string }>('select zona_horaria as z from public.profesor where slug = $1', [SLUG_A]))[0].z, { timeout: 20_000 }).toBe('America/Sao_Paulo');
      },
      { esperado: 'Se abre «Cambiar el huso horario» con la advertencia; al confirmar aparece el éxito y la base tiene el huso nuevo' },
    );
    await cu.paso(
      'Recargar: los valores quedaron persistidos',
      async () => {
        await page.reload();
        await expect(page.getByRole('heading', { name: 'Configuración', level: 1 })).toBeVisible({ timeout: 30_000 });
        await expect(anticipacion()).toHaveValue('12');
        await expect(page.locator('#config-huso')).toHaveValue('America/Sao_Paulo');
        await expect(duracion()).toHaveValue('60');
      },
      { esperado: 'Después de recargar: anticipación 12, huso São Paulo y duración 60' },
    );
  });

  test('T-AGE-11 CA-14 AGE-05 AGE-06 el profesor bloquea un horario, figura bloqueado en la vista pública y al quitarlo vuelve a libre', async ({ page, evidencia }) => {
    test.setTimeout(240_000);
    const cu = evidencia({
      cu: 'WEB-08-bloqueo',
      titulo: 'El profesor bloquea un horario desde el panel y lo desbloquea',
      criterios: ['WEB-06', 'WEB-08', 'T-AGE-11', 'CA-14', 'AGE-05', 'AGE-06'],
      bolt: 'B10',
    });
    const dia = miercoles();
    const inicioUtc = (await sql<{ i: string }>(`select ((($1::date + time '10:00') at time zone 'America/Montevideo') at time zone 'UTC')::text as i`, [dia]))[0].i;
    const estadoPublico = async () => {
      const r = await rpc('anon', 'agenda_publica', { p_slug: SLUG_A, p_dia: dia });
      expect(r.status).toBe(200);
      const fila = (r.cuerpo as { inicio: string; estado: string }[]).find((f) => new Date(f.inicio).getTime() === Date.parse(`${inicioUtc.replace(' ', 'T')}Z`));
      return fila?.estado;
    };
    const hueco = (prefijo: string) => page.getByRole('button', { name: new RegExp(`^${prefijo}`) });

    await cu.paso(
      'Abrir el panel del día y tocar el hueco libre de las 10:00',
      async () => {
        await page.goto(`${ORIGEN}${BASE}#/panel?d=${dia}`);
        await expect(page.getByRole('list', { name: 'Huecos del día' })).toBeVisible({ timeout: 30_000 });
        await hueco('10:00 a 11:00 Libre').click();
        await expect(page.getByRole('button', { name: 'Bloquear este horario' })).toBeVisible();
        expect(await estadoPublico()).toBe('libre');
      },
      { esperado: 'El hueco de las 10:00 está Libre (también en la vista pública) y el panel ofrece «Bloquear este horario»' },
    );
    await cu.paso(
      'Bloquear el horario con un motivo',
      async () => {
        await page.getByRole('button', { name: 'Bloquear este horario' }).click();
        await expect(page.getByRole('heading', { name: 'Bloquear el horario', level: 3 })).toBeVisible();
        await page.getByLabel(/^Motivo/).fill(`${PREFIJO_MOTIVO}Médico`);
        await page.getByRole('button', { name: 'Bloquear', exact: true }).click();
        await expect(page.getByRole('status').filter({ hasText: 'Listo: el horario quedó bloqueado' })).toBeVisible({ timeout: 20_000 });
        await expect(hueco('10:00 a 11:00 Bloqueado')).toBeVisible();
      },
      { esperado: 'Aparece «Listo: el horario quedó bloqueado…» y el hueco de las 10:00 pasa a Bloqueado' },
    );
    await cu.paso(
      'La vista pública muestra el hueco bloqueado y no el motivo',
      async () => {
        expect(await estadoPublico()).toBe('bloqueado');
        const r = await rpc('anon', 'agenda_publica', { p_slug: SLUG_A, p_dia: dia });
        expect(JSON.stringify(r.cuerpo)).not.toContain(PREFIJO_MOTIVO);
      },
      { esperado: 'agenda_publica devuelve el hueco de las 10:00 como bloqueado y ningún motivo' },
    );
    await cu.paso(
      'Desbloquear: el horario vuelve a libre',
      async () => {
        await hueco('10:00 a 11:00 Bloqueado').click();
        await expect(page.getByRole('heading', { name: 'Desbloquear el horario', level: 3 })).toBeVisible();
        await page.getByRole('button', { name: 'Desbloquear', exact: true }).click();
        await expect(page.getByRole('status').filter({ hasText: 'Listo: quitaste el bloqueo' })).toBeVisible({ timeout: 20_000 });
        await expect(hueco('10:00 a 11:00 Libre')).toBeVisible();
        expect(await estadoPublico()).toBe('libre');
      },
      { esperado: 'Aparece «Listo: quitaste el bloqueo y esos horarios vuelven a estar libres.», el hueco queda Libre en el panel y en la vista pública' },
    );
  });
});

test('WEB-08 T-WEB-03 una persona (alumno) no accede a la ruta de configuración', async ({ browser, evidencia }) => {
  test.setTimeout(240_000);
  const cu = evidencia({
    cu: 'WEB-08-acceso-alumno',
    titulo: 'Un alumno no accede a la pantalla de configuración del profesor',
    criterios: ['WEB-08', 'T-WEB-03', 'SEC-06', 'CA-12'],
    bolt: 'B10',
  });
  const mail = mailT05('e2e.config.alumno');
  await crearAlumno({ nombre: 'Alumna Config', estado: 'aprobado', telefono: '+598 99555777', mail });
  const ctx = await browser.newContext({ locale: 'es-UY', timezoneId: 'America/Montevideo', storageState: { cookies: [], origins: [] }, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await cu.paso(
    'Entrar como alumno',
    async () => {
      await entrar(page, mail);
    },
    { esperado: 'La persona ingresa con su código y llega a su pantalla de inicio' },
  );
  await cu.paso(
    'Abrir #/configuracion: la guarda lo rechaza y no hay formulario',
    async () => {
      await page.goto(CONFIG);
      await expect(page.getByText('Esta pantalla es solo para el profesor.')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('heading', { name: 'Duración de clase', level: 2 })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Guardar duración' })).toHaveCount(0);
    },
    { esperado: 'Se lee «Esta pantalla es solo para el profesor.» y no aparece ninguna sección de configuración' },
  );
  await ctx.close();
});
