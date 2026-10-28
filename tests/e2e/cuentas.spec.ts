// E2E de cuentas y alumnos del profesor (WEB-07, WEB-03; CA-04, CA-07, CA-45 rama de ficha, SEC-16; casos T-ALU-12,
// T-ALU-19, T-WEB-01 rama de rechazo). B14: el estado es el de la inscripción con el profesor (DEC-25); la ficha muestra
// «Tus profesores» con un h3 por profesor y quien entra desde el enlace de un profesor responde «Cómo llegaste a {nombre}». El profesor entra una sola vez con el código de Mailpit (el límite de Auth es de 60 s
// por mail) y las pruebas reutilizan esa sesión guardada. Se escribe contra roles y textos accesibles. Los datos se preparan
// por la base y llevan el prefijo `T05 `; la cuenta de la rama de ficha entra por la UI. Reloj de la aplicación fijo en la
// base (la edad sale de `app_ahora()`), restaurado siempre. Corre contra dist/ servido por vite preview.
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '../soporte/evidencia';
import { cerrar, sql } from '../soporte/bd';
import { SITEKEY_PRUEBA } from '../soporte/captcha';
import { esperarMail, mailUnico, contarMails } from '../soporte/correo';
import { entorno, RAIZ } from '../soporte/entorno';
import { fijarReloj, limpiarReloj } from '../soporte/reloj';
import { MAIL_PROFESOR, SLUG_A } from '../soporte/usuarios';
import { crearAlumno, crearClase, inscripcionDe, limpiarT05, mailT05 } from '../integracion/cuentas/ayuda';

const BASE = process.env.RTC_BASE ?? '/reservas/';
const ORIGEN = process.env.BASE_URL ?? `http://127.0.0.1:${process.env.RTC_PREVIEW_PORT || '4173'}`;
const SESION_PROFESOR = resolve(RAIZ, 'test-results', '.sesion-profesor-e2e-cuentas.json');
const HTML = '<img src=x onerror=alert(1)> sin cupo';
const NOMBRE_A = 'Profesor de Prueba';
const estadoDe = async (alumnoId: string) => (await inscripcionDe(alumnoId))?.estado;

test.use({ locale: 'es-UY', viewport: { width: 1280, height: 900 } });

async function mailsA(m: string): Promise<number> {
  return contarMails(m);
}

/** Entrar con código: reintenta hasta que el widget de prueba entrega el token y lee el código del mail nuevo. */
async function entrar(page: Page, mail: string, desdeEnlace = false) {
  const antes = await mailsA(mail);
  if (desdeEnlace) {
    // Como quien recibió el enlace de su profesor: abre `#/p/<slug>` (queda como profesor de origen) y toca «Ingresar».
    await page.goto(`${ORIGEN}${BASE}#/p/${SLUG_A}`);
    await expect(page.getByRole('heading', { level: 1, name: `Agenda de ${NOMBRE_A}` })).toBeVisible();
    await page.getByRole('link', { name: 'Ingresar' }).click();
  } else {
    await page.goto(`${ORIGEN}${BASE}#/ingreso`);
  }
  await page.getByRole('button', { name: 'Entrar con un código por mail' }).click();
  await page.getByLabel(/^Mail/).fill(mail);
  await expect(async () => {
    await page.getByRole('button', { name: 'Pedir código' }).click();
    await expect(page.getByRole('heading', { name: 'Ingresá el código' })).toBeVisible({ timeout: 2_500 });
  }).toPass({ timeout: 90_000, intervals: [1_000, 2_000, 3_000] });
  const codigo = (await esperarMail(mail, antes + 1)).codigo!;
  await page.getByLabel('Código de 6 dígitos').fill(codigo);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
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
  await limpiarT05();
  mkdirSync(resolve(RAIZ, 'test-results'), { recursive: true });
  const ctx = await browser.newContext({ locale: 'es-UY', storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await entrar(page, MAIL_PROFESOR);
  await expect(page).not.toHaveURL(/#\/ingreso/, { timeout: 30_000 });
  await page.goto(`${ORIGEN}${BASE}#/lista`);
  await expect(page.getByRole('heading', { name: 'Lista', level: 1 })).toBeVisible({ timeout: 30_000 });
  await ctx.storageState({ path: SESION_PROFESOR });
  await ctx.close();
});

test.afterEach(async () => {
  await limpiarReloj();
  await limpiarT05();
});
test.afterAll(cerrar);

test.describe('profesor', () => {
  test.use({ storageState: SESION_PROFESOR });

  test('WEB-07 el profesor aprueba una cuenta, une con el alumno sin cuenta (CA-04) y ve estado y edad (CA-07)', async ({ page, evidencia }) => {
    await fijarReloj('2026-10-21T15:00:00Z');
    const cuenta = await crearAlumno({ nombre: 'Uno <i>E2E</i>', estado: 'pendiente', telefono: '099 123-456', mail: mailT05('e2e.cuenta'), fecha_nacimiento: '2000-10-21' });
    const sinCuenta = await crearAlumno({ nombre: 'Viejo sin cuenta', estado: 'sin_cuenta', telefono: '+598 99123456', fecha_nacimiento: '1990-01-01' });
    const clase = await crearClase(sinCuenta, '2026-12-03T13:00:00Z');
    const nombre = 'T05 Uno <i>E2E</i>';
    const cu = evidencia({
      cu: 'WEB-07',
      titulo: 'Lista del profesor: aprobar una cuenta, unir con el alumno sin cuenta y ver estado y edad',
      criterios: ['CA-04', 'CA-07', 'ALU-03', 'ALU-04', 'ALU-05', 'ALU-09', 'SEC-16', 'WEB-07'],
      bolt: 'B14',
    });

    await cu.paso(
      'Abrir la lista y ver la cuenta pendiente con su ficha como texto',
      async () => {
        await page.goto(`${ORIGEN}${BASE}#/lista`);
        await expect(page.getByRole('heading', { name: 'Cuentas pendientes', level: 2 })).toBeVisible({ timeout: 30_000 });
        const tarjeta = page.getByRole('article', { name: nombre });
        await expect(tarjeta).toBeVisible();
        await expect(tarjeta.getByText('099 123-456')).toBeVisible();
        await expect(page.locator('article i'), 'el nombre con HTML no crea elementos').toHaveCount(0);
      },
      { esperado: 'La tarjeta de la cuenta muestra el nombre con las marcas «<i>» como texto, el teléfono y los botones Aprobar y Rechazar' },
    );

    await cu.paso(
      'Aprobar la cuenta: aparece la sugerencia de unión',
      async () => {
        await page.getByRole('button', { name: `Aprobar cuenta de ${nombre}` }).click();
        await expect(page.getByRole('dialog', { name: 'Posible alumno repetido' })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole('dialog', { name: 'Posible alumno repetido' }).getByText('T05 Viejo sin cuenta').first()).toBeVisible();
        await expect.poll(() => estadoDe(cuenta)).toBe('aprobado');
      },
      { esperado: 'La cuenta queda aprobada y un diálogo compara «Cuenta aprobada» con «Alumno sin cuenta» (mismo teléfono normalizado)' },
    );

    await cu.paso(
      'Confirmar la unión',
      async () => {
        await page.getByRole('button', { name: 'Unir cuentas: T05 Viejo sin cuenta' }).click();
        await expect(page.getByRole('dialog', { name: 'Posible alumno repetido' })).toBeHidden({ timeout: 15_000 });
        await expect(page.getByText('Uniste a T05 Viejo sin cuenta', { exact: false })).toBeVisible();
        await expect.poll(async () => (await sql('select 1 from public.alumno where id = $1', [sinCuenta])).length).toBe(0);
        expect((await sql<{ alumno_id: string }>('select alumno_id from public.clase where id = $1', [clase]))[0].alumno_id).toBe(cuenta);
      },
      { esperado: 'Aparece «Uniste a…», el alumno sin cuenta ya no existe y su clase quedó en la cuenta' },
    );

    await cu.paso(
      'La lista de alumnos muestra estado y edad calculada',
      async () => {
        const fila = page.getByRole('row', { name: /T05 Uno/ });
        await expect(fila).toBeVisible();
        await expect(fila.getByText('Aprobado')).toBeVisible();
        await expect(fila.getByText('26 años')).toBeVisible();
      },
      { esperado: 'La fila de la cuenta dice «Aprobado» y «26 años» (nacida el 2000-10-21, reloj de la aplicación 2026-10-21)' },
    );
  });

  test('WEB-07 el profesor descarta la unión sugerida y nada cambia (CA-04)', async ({ page, evidencia }) => {
    const cuenta = await crearAlumno({ nombre: 'Dos', estado: 'pendiente', telefono: '099 765-432', mail: mailT05('e2e.dos') });
    const sinCuenta = await crearAlumno({ nombre: 'Gemelo sin cuenta', estado: 'sin_cuenta', telefono: '+598 99765432' });
    const clase = await crearClase(sinCuenta, '2026-12-04T13:00:00Z');
    const cu = evidencia({
      cu: 'WEB-07-descartar',
      titulo: 'Lista del profesor: descartar la sugerencia de unión',
      criterios: ['CA-04', 'ALU-04', 'WEB-07'],
      bolt: 'B14',
    });
    await cu.paso(
      'Aprobar la cuenta y ver la sugerencia',
      async () => {
        await page.goto(`${ORIGEN}${BASE}#/lista`);
        await page.getByRole('button', { name: 'Aprobar cuenta de T05 Dos' }).click();
        await expect(page.getByRole('dialog', { name: 'Posible alumno repetido' })).toBeVisible({ timeout: 30_000 });
      },
      { esperado: 'Se abre la comparación con «Gemelo sin cuenta»' },
    );
    await cu.paso(
      'Elegir «No unir»',
      async () => {
        await page.getByRole('button', { name: 'No unir: T05 Gemelo sin cuenta' }).click();
        await expect(page.getByRole('dialog', { name: 'Posible alumno repetido' })).toBeHidden({ timeout: 15_000 });
        await expect(page.getByText('No se unió a T05 Gemelo sin cuenta', { exact: false })).toBeVisible();
        expect(await estadoDe(sinCuenta)).toBe('sin_cuenta');
        expect((await sql<{ alumno_id: string }>('select alumno_id from public.clase where id = $1', [clase]))[0].alumno_id).toBe(sinCuenta);
        expect(await estadoDe(cuenta)).toBe('aprobado');
      },
      { esperado: 'Aparece «No se unió a…» y el alumno sin cuenta conserva su clase; la cuenta sigue aprobada' },
    );
  });

  test('WEB-07 el profesor rechaza una cuenta con un motivo con HTML y se ve como texto (SEC-16)', async ({ page, evidencia }) => {
    const cuenta = await crearAlumno({ nombre: 'Tres', estado: 'pendiente', telefono: '+598 94 000 333', mail: mailT05('e2e.tres') });
    const cu = evidencia({
      cu: 'WEB-07-rechazar',
      titulo: 'Lista del profesor: rechazar una cuenta con motivo',
      criterios: ['ALU-03', 'AVI-03', 'CA-45', 'SEC-09', 'SEC-16', 'WEB-07'],
      bolt: 'B14',
    });
    await cu.paso(
      'Abrir el diálogo de rechazo',
      async () => {
        await page.goto(`${ORIGEN}${BASE}#/lista`);
        await page.getByRole('button', { name: 'Rechazar cuenta de T05 Tres' }).click();
        await expect(page.getByRole('dialog', { name: 'Rechazar la cuenta de T05 Tres' })).toBeVisible({ timeout: 30_000 });
        await expect(page.getByLabel('Motivo (opcional)')).toBeVisible();
      },
      { esperado: 'El diálogo pide un motivo opcional y avisa que la persona lo verá' },
    );
    await cu.paso(
      'Motivo de más de 500 caracteres: error en el campo',
      async () => {
        await page.getByLabel('Motivo (opcional)').fill('x'.repeat(501));
        await page.getByRole('button', { name: 'Rechazar cuenta', exact: true }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        expect(await estadoDe(cuenta)).toBe('pendiente');
      },
      { esperado: 'El diálogo sigue abierto con el error del campo y la cuenta sigue pendiente' },
    );
    await cu.paso(
      'Rechazar con un motivo que trae HTML',
      async () => {
        await page.getByLabel('Motivo (opcional)').fill(HTML);
        await page.getByRole('button', { name: 'Rechazar cuenta', exact: true }).click();
        await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15_000 });
        await expect(page.getByText('Rechazaste la cuenta de T05 Tres', { exact: false })).toBeVisible();
        const fila = page.getByRole('row', { name: /T05 Tres/ });
        await expect(fila.getByText('Rechazado')).toBeVisible();
        await expect(fila.getByText(`Motivo del rechazo: ${HTML}`)).toBeVisible();
        await expect(page.locator('img[src="x"]'), 'el motivo no crea elementos').toHaveCount(0);
        expect((await inscripcionDe(cuenta))?.motivo_estado).toBe(HTML);
      },
      { esperado: 'La fila queda «Rechazado» y el motivo aparece como texto literal, sin imagen' },
    );
  });
});

test.describe('cuenta rechazada', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('WEB-03 la ficha de una cuenta rechazada muestra el motivo como texto, sin motivo solo el estado, y aprobada sin motivo (CA-45)', async ({ page, evidencia }) => {
    const mail = mailUnico('t05.e2e.ficha');
    const cu = evidencia({
      cu: 'WEB-03-rechazo',
      titulo: 'Ficha de la cuenta: estado y motivo de rechazo como texto',
      criterios: ['CA-45', 'ALU-03', 'SEC-16', 'WEB-03'],
      bolt: 'B14',
    });
    await cu.paso(
      'Entrar con una cuenta nueva y completar la ficha',
      async () => {
        await entrar(page, mail, true);
        await expect(page.getByText('Completá tus datos para pedir clases.')).toBeVisible({ timeout: 30_000 });
        await page.getByLabel('Nombre y apellido').fill('T05 Ficha E2E');
        await page.getByLabel('Teléfono o WhatsApp').fill('+598 99123456');
        await page.getByLabel('Fecha de nacimiento').fill('2000-01-01');
        await page.getByLabel(`Cómo llegaste a ${NOMBRE_A}`).fill('Una amiga');
        await page.getByRole('button', { name: 'Guardar ficha' }).click();
        await expect(page.getByRole('heading', { level: 2, name: 'Tus profesores' })).toBeVisible({ timeout: 30_000 });
        await expect(page.getByRole('heading', { level: 3, name: NOMBRE_A })).toBeVisible();
        await expect(page.getByText('Pendiente de aprobación', { exact: true })).toBeVisible();
      },
      { esperado: 'La ficha queda guardada y «Tus profesores» muestra a «Profesor de Prueba» con «Pendiente de aprobación»' },
    );
    await cu.paso(
      'Rechazada con un motivo con HTML: se ve como texto',
      async () => {
        await sql(
          `update public.inscripcion set estado = 'rechazado', motivo_estado = $2
            where alumno_id = (select id from public.alumno where mail = $1)`,
          [mail, HTML],
        );
        await page.reload();
        await expect(page.getByText('Rechazada', { exact: true })).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText(HTML)).toBeVisible();
        await expect(page.locator('img[src="x"]')).toHaveCount(0);
      },
      { esperado: 'Se ve «Rechazada» y «Motivo:» con el HTML escrito literalmente, sin imagen' },
    );
    await cu.paso(
      'Rechazada sin motivo: solo el estado',
      async () => {
        await sql(`update public.inscripcion set motivo_estado = null where alumno_id = (select id from public.alumno where mail = $1)`, [mail]);
        await page.reload();
        await expect(page.getByText('Rechazada', { exact: true })).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText('Motivo:')).toHaveCount(0);
      },
      { esperado: 'Se ve «Rechazada» y ninguna línea de motivo' },
    );
    await cu.paso(
      'Aprobada tras el rechazo: sin motivo',
      async () => {
        await sql(
          `update public.inscripcion set estado = 'aprobado', motivo_estado = null, aprobado_en = now()
            where alumno_id = (select id from public.alumno where mail = $1)`,
          [mail],
        );
        await page.reload();
        await expect(page.getByText('Aprobada', { exact: true })).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText('Motivo:')).toHaveCount(0);
      },
      { esperado: 'Se ve «Aprobada» sin motivo' },
    );
  });
});
