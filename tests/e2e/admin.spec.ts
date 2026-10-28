// E2E de la pantalla del Administrador `#/admin` (B15, WEB-10, ADM-02, ADM-03, ADM-05, DEC-34; CA-49, CA-50, CA-63,
// CA-64, SEC-09, SEC-16). El Administrador (admin@example.test, que no es profesor) entra una sola vez con el código de
// Mailpit y la sesión se reutiliza. Los profesores del test llevan el prefijo `e2e-adm-` y se borran al terminar.
// Se escribe contra roles y textos accesibles. Corre contra dist/ servido por vite preview.
import AxeBuilder from '@axe-core/playwright';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '../soporte/evidencia';
import { cerrar, sql } from '../soporte/bd';
import { SITEKEY_PRUEBA } from '../soporte/captcha';
import { esperarMail, contarMails } from '../soporte/correo';
import { entorno, RAIZ } from '../soporte/entorno';
import { MAIL_ADMIN, SLUG_A } from '../soporte/usuarios';

const BASE = process.env.RTC_BASE ?? '/reservas/';
const ORIGEN = process.env.BASE_URL ?? `http://127.0.0.1:${process.env.RTC_PREVIEW_PORT || '4173'}`;
const SESION = resolve(RAIZ, 'test-results', '.sesion-admin-e2e.json');
const ADMIN = `${ORIGEN}${BASE}#/admin`;
const PREFIJO_SLUG = 'e2e-adm-';
const PREFIJO_MAIL = 'e2e.adm.';
const unico = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

test.use({ locale: 'es-UY', viewport: { width: 1280, height: 900 } });

async function mailsA(m: string): Promise<number> {
  return contarMails(m);
}

/** Entra con código: reintenta hasta que el widget de prueba entrega el token y lee el código del mail nuevo. */
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
}

async function limpiar() {
  const ids = `select id from public.profesor where slug like '${PREFIJO_SLUG}%' or mail like '${PREFIJO_MAIL}%'`;
  await sql(`delete from public.mail_salida where profesor_id in (${ids}) or destinatario like '${PREFIJO_MAIL}%'`);
  await sql(`delete from public.grilla_tramo where profesor_id in (${ids})`);
  await sql(`delete from public.profesor where id in (${ids})`);
  await sql(`delete from auth.users where email like '${PREFIJO_MAIL}%'`);
}

/** Un profesor activo de prueba, como lo deja el alta. */
async function crearProfesor(nombre: string) {
  const u = unico();
  const slug = `${PREFIJO_SLUG}${u}`;
  const mail = `${PREFIJO_MAIL}${u}@example.test`;
  await sql('select privado.configurar_profesor($1, $2, $3)', [mail, nombre, slug]);
  return { slug, mail, nombre };
}

const activo = async (slug: string) => (await sql<{ activo: boolean }>('select activo from public.profesor where slug = $1', [slug]))[0]?.activo;

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
  await sql('select privado.configurar_administrador($1)', [MAIL_ADMIN]);
  mkdirSync(resolve(RAIZ, 'test-results'), { recursive: true });
  const ctx = await browser.newContext({ locale: 'es-UY', storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await entrar(page, MAIL_ADMIN);
  await expect(page).toHaveURL(/#\/admin/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Administración', level: 1 })).toBeVisible({ timeout: 30_000 });
  await ctx.storageState({ path: SESION });
  await ctx.close();
});

test.afterEach(limpiar);
test.afterAll(async () => {
  await limpiar();
  await cerrar();
});

test.describe('administrador', () => {
  test.use({ storageState: SESION });

  test('WEB-10 alta de un profesor: aviso de datos públicos, éxito y aparece en la lista (CA-49, DEC-34, SEC-16)', async ({ page, evidencia }) => {
    const cu = evidencia({
      cu: 'WEB-10-alta',
      titulo: 'El Administrador da de alta a un profesor',
      criterios: ['WEB-10', 'ADM-02', 'CA-49', 'DEC-34', 'SEC-16'],
      bolt: 'B15',
    });
    const u = unico();
    const slug = `${PREFIJO_SLUG}${u}`;
    const mail = `${PREFIJO_MAIL}${u}@example.test`;
    const nombre = `Profe <b>Nuevo</b> ${u}`;
    await cu.paso(
      'Abrir la administración',
      async () => {
        await page.goto(ADMIN);
        await expect(page.getByRole('heading', { name: 'Administración', level: 1 })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Dar de alta a un profesor', level: 2 })).toBeVisible();
        await expect(page.getByText('El nombre del profesor es público', { exact: false })).toBeVisible();
      },
      { esperado: 'Se ve «Administración», la lista de profesores, el formulario de alta y el aviso de que el nombre es público y el mail lo ven los alumnos (DEC-34)' },
    );
    await cu.paso(
      'Completar mail, nombre y enlace y dar de alta',
      async () => {
        await page.getByLabel('Mail del profesor').fill(mail);
        await page.getByLabel('Nombre del profesor').fill(nombre);
        await page.getByLabel('Enlace del profesor').fill(slug);
        await page.getByRole('button', { name: 'Dar de alta' }).click();
        await expect(page.getByText('Profesor dado de alta.', { exact: false })).toBeVisible();
      },
      { esperado: 'Aparece «Profesor dado de alta. Ya puede entrar con ese mail y se le avisa por mail con su enlace.» y el formulario queda vacío' },
    );
    await cu.paso(
      'El profesor nuevo figura en la lista como activo, con su enlace, y su nombre se muestra como texto',
      async () => {
        const tarjeta = page.getByRole('listitem').filter({ has: page.getByRole('heading', { level: 3, name: nombre }) });
        await expect(tarjeta).toBeVisible();
        await expect(tarjeta.getByText('Activo', { exact: true })).toBeVisible();
        await expect(tarjeta.getByText(mail)).toBeVisible();
        await expect(tarjeta.getByRole('textbox', { name: `Enlace de ${nombre}` })).toHaveValue(new RegExp(`#/p/${slug}$`));
        // SEC-16: el HTML del nombre no se interpreta.
        await expect(page.locator('main b', { hasText: 'Nuevo' })).toHaveCount(0);
        await expect(page.getByLabel('Mail del profesor')).toHaveValue('');
      },
      { esperado: 'La tarjeta muestra el nombre literal (con «<b>» como texto), el mail, «Activo» y el enlace terminado en #/p/<enlace>' },
    );
    await cu.paso(
      'La base tiene al profesor activo con su enlace y un mail de aviso',
      async () => {
        const f = await sql<{ activo: boolean; nombre: string }>('select activo, nombre from public.profesor where slug = $1', [slug]);
        expect(f).toEqual([{ activo: true, nombre }]);
        await expect.poll(async () => (await sql('select 1 from public.mail_salida where destinatario = $1', [mail])).length).toBeGreaterThan(0);
      },
      { esperado: 'Existe el profesor activo y hay un mail encolado a su dirección' },
    );
  });

  test('WEB-10 errores del alta en su campo: enlace repetido, reservado y formato (CA-49, SEC-09)', async ({ page, evidencia }) => {
    const cu = evidencia({
      cu: 'WEB-10-alta-errores',
      titulo: 'Alta de profesor: errores en su campo',
      criterios: ['WEB-10', 'ADM-02', 'CA-49', 'SEC-09'],
      bolt: 'B15',
    });
    const u = unico();
    const mail = `${PREFIJO_MAIL}${u}@example.test`;
    await page.goto(ADMIN);
    await expect(page.getByRole('heading', { name: 'Dar de alta a un profesor', level: 2 })).toBeVisible();
    const [antes] = await sql<{ n: string }>('select count(*)::text n from public.profesor');
    await cu.paso(
      'Dar de alta con el enlace de un profesor que ya existe',
      async () => {
        await page.getByLabel('Mail del profesor').fill(mail);
        await page.getByLabel('Nombre del profesor').fill('Repetido');
        await page.getByLabel('Enlace del profesor').fill(SLUG_A);
        await page.getByRole('button', { name: 'Dar de alta' }).click();
        await expect(page.getByText('Ese enlace ya lo usa otro profesor. Elegí otro.')).toBeVisible();
        await expect(page.getByLabel('Enlace del profesor')).toBeFocused();
        await expect(page.getByLabel('Enlace del profesor')).toHaveAttribute('aria-invalid', 'true');
      },
      { esperado: 'Bajo el campo Enlace: «Ese enlace ya lo usa otro profesor. Elegí otro.», con el foco en el campo y sin crear nada' },
    );
    await cu.paso(
      'Un enlace reservado por la aplicación',
      async () => {
        await page.getByLabel('Enlace del profesor').fill('admin');
        await page.getByRole('button', { name: 'Dar de alta' }).click();
        await expect(page.getByText('Ese enlace está reservado por la aplicación. Elegí otro.')).toBeVisible();
      },
      { esperado: '«Ese enlace está reservado por la aplicación. Elegí otro.» en el campo Enlace' },
    );
    await cu.paso(
      'Un enlace demasiado corto',
      async () => {
        await page.getByLabel('Enlace del profesor').fill('ab');
        await page.getByRole('button', { name: 'Dar de alta' }).click();
        await expect(page.getByText('El enlace va de 3 a 30 caracteres', { exact: false })).toBeVisible();
      },
      { esperado: 'El mensaje de formato del enlace (3 a 30 caracteres: minúsculas, números y guiones)' },
    );
    await cu.paso(
      'Un mail inválido y un nombre vacío',
      async () => {
        await page.getByLabel('Enlace del profesor').fill(`${PREFIJO_SLUG}${u}`);
        await page.getByLabel('Mail del profesor').fill('no-es-un-mail');
        await page.getByRole('button', { name: 'Dar de alta' }).click();
        await expect(page.getByText('Escribí un mail válido.')).toBeVisible();
        await page.getByLabel('Mail del profesor').fill(mail);
        await page.getByLabel('Nombre del profesor').fill('');
        await page.getByRole('button', { name: 'Dar de alta' }).click();
        await expect(page.getByText('Escribí el nombre del profesor.')).toBeVisible();
        const [despues] = await sql<{ n: string }>('select count(*)::text n from public.profesor');
        expect(despues.n).toBe(antes.n);
      },
      { esperado: '«Escribí un mail válido.» y «Escribí el nombre del profesor.» en sus campos; ningún error creó un profesor' },
    );
  });

  test('WEB-10 inactivar y reactivar con confirmación (CA-49, CA-63, CA-64, ADM-05)', async ({ page, evidencia }) => {
    const cu = evidencia({
      cu: 'WEB-10-pausa',
      titulo: 'El Administrador inactiva y reactiva a un profesor',
      criterios: ['WEB-10', 'ADM-03', 'ADM-05', 'CA-49', 'CA-63', 'CA-64'],
      bolt: 'B15',
    });
    const p = await crearProfesor(`Profe pausa ${unico()}`);
    const nombre = p.nombre;
    await cu.paso(
      'La lista muestra al profesor activo con la acción «Inactivar»',
      async () => {
        await page.goto(ADMIN);
        await expect(page.getByRole('heading', { level: 3, name: nombre })).toBeVisible();
        await expect(page.getByRole('button', { name: `Inactivar a ${nombre}` })).toBeEnabled();
      },
      { esperado: 'La tarjeta del profesor dice «Activo» y ofrece «Inactivar»' },
    );
    await cu.paso(
      'Pedir inactivar abre la confirmación; «Cancelar» no cambia nada',
      async () => {
        await page.getByRole('button', { name: `Inactivar a ${nombre}` }).click();
        const dialogo = page.getByRole('dialog', { name: `Inactivar a ${nombre}` });
        await expect(dialogo).toBeVisible();
        await expect(dialogo.getByText('Es una pausa: no se borran clases ni datos.', { exact: false })).toBeVisible();
        await dialogo.getByRole('button', { name: 'Cancelar' }).click();
        await expect(dialogo).toHaveCount(0);
        expect(await activo(p.slug)).toBe(true);
      },
      { esperado: 'El diálogo explica que es una pausa que conserva clases y datos; al cancelar se cierra y el profesor sigue activo' },
    );
    await cu.paso(
      'Confirmar «Inactivar»: queda inactivo',
      async () => {
        await page.getByRole('button', { name: `Inactivar a ${nombre}` }).click();
        await page.getByRole('dialog', { name: `Inactivar a ${nombre}` }).getByRole('button', { name: 'Inactivar', exact: true }).click();
        await expect(page.getByText(`${nombre} quedó inactivo.`)).toBeVisible();
        await expect(page.getByRole('button', { name: `Reactivar a ${nombre}` })).toBeVisible();
        const tarjeta = page.getByRole('listitem').filter({ has: page.getByRole('heading', { level: 3, name: nombre }) });
        await expect(tarjeta.getByText('Inactivo', { exact: true })).toBeVisible();
        expect(await activo(p.slug)).toBe(false);
      },
      { esperado: 'Aviso «<nombre> quedó inactivo.», la tarjeta dice «Inactivo» y ofrece «Reactivar»; en la base activo = false' },
    );
    await cu.paso(
      'Su enlace público dice que no toma reservas (CA-63)',
      async () => {
        const otra = await page.context().newPage();
        await otra.goto(`${ORIGEN}${BASE}#/p/${p.slug}`);
        await expect(otra.getByText(/no toma reservas/i).first()).toBeVisible();
        await otra.close();
      },
      { esperado: 'El enlace del profesor inactivo avisa que no toma reservas' },
    );
    await cu.paso(
      'Reactivar con confirmación',
      async () => {
        await page.getByRole('button', { name: `Reactivar a ${nombre}` }).click();
        const dialogo = page.getByRole('dialog', { name: `Reactivar a ${nombre}` });
        await expect(dialogo.getByText('Todo queda como estaba', { exact: false })).toBeVisible();
        await dialogo.getByRole('button', { name: 'Reactivar', exact: true }).click();
        await expect(page.getByText(`${nombre} quedó activo.`)).toBeVisible();
        await expect(page.getByRole('button', { name: `Inactivar a ${nombre}` })).toBeVisible();
        expect(await activo(p.slug)).toBe(true);
      },
      { esperado: 'Aviso «<nombre> quedó activo.», la tarjeta vuelve a «Activo» y el profesor está activo en la base' },
    );
  });

  test('WEB-10 accesibilidad a 360 px: axe y sin desplazamiento horizontal (NFR-05, NFR-06)', async ({ page, evidencia }) => {
    const cu = evidencia({
      cu: 'WEB-10-A11Y',
      titulo: 'Administración en móvil: contraste, reflujo y diálogo',
      criterios: ['WEB-10', 'NFR-05', 'NFR-06'],
      bolt: 'B15',
    });
    const p = await crearProfesor(`Profe móvil ${unico()}`);
    await page.setViewportSize({ width: 360, height: 740 });
    await cu.paso(
      'Axe sobre la lista y el formulario',
      async () => {
        await page.goto(ADMIN);
        await expect(page.getByRole('heading', { level: 3, name: p.nombre })).toBeVisible();
        const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
        const desborda = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
        expect(desborda).toBe(false);
      },
      { esperado: 'Cero violaciones WCAG 2.1 AA y sin scroll horizontal a 360 px' },
    );
    await cu.paso(
      'Axe con la confirmación abierta',
      async () => {
        await page.getByRole('button', { name: `Inactivar a ${p.nombre}` }).click();
        await expect(page.getByRole('dialog', { name: `Inactivar a ${p.nombre}` })).toBeVisible();
        const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
        await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
      },
      { esperado: 'El diálogo de confirmación también cumple WCAG 2.1 AA' },
    );
  });
});

test.describe('sin permisos', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('CA-64 un visitante que abre #/admin no ve la administración', async ({ page, evidencia }) => {
    const cu = evidencia({
      cu: 'WEB-10-sin-permiso',
      titulo: 'Sin sesión, #/admin no muestra la administración',
      criterios: ['WEB-10', 'CA-64'],
      bolt: 'B15',
    });
    await cu.paso(
      'Abrir #/admin sin sesión',
      async () => {
        await page.goto(ADMIN);
        await expect(page.getByRole('heading', { name: 'Administración', level: 1 })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Dar de alta' })).toHaveCount(0);
      },
      { esperado: 'No aparece la lista de profesores ni el formulario de alta: se pide ingresar' },
    );
  });
});
