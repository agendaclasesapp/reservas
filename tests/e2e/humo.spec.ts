// Humo E2E de B01 y B14 (CA-39, SEC-16, NFR-09, CA-65, WEB-12): la SPA publicada abre, las rutas hash (incluida la
// agenda de un profesor `#/p/<slug>` y `#/admin`) montan algo, sin errores de página ni violaciones de CSP y sin pedir
// nada fuera de la propia SPA y de Supabase local. CA-65: título de pestaña y encabezado con «Agenda Clases App» e
// ícono en cada ruta, favicon servido bajo la base y remitente «Agenda Clases App» del código de ingreso en Mailpit.
// Corre contra el bundle compilado (npm run build) servido por `vite preview` con la base de Pages (DEC-14).
import { expect, test } from '../soporte/evidencia';
import { cerrar } from '../soporte/bd';
import { TOKEN_CAPTCHA } from '../soporte/captcha';
import { mailUnico, remitenteDe } from '../soporte/correo';
import { clienteAnon, SLUG_A } from '../soporte/usuarios';

const BASE = process.env.RTC_BASE ?? '/reservas/';
const NOMBRE = 'Agenda Clases App';
const RUTAS = [
  '#/',
  `#/p/${SLUG_A}`,
  '#/ingreso',
  '#/ficha',
  '#/solicitud',
  '#/mis-clases',
  '#/panel',
  '#/lista',
  '#/configuracion',
  '#/admin',
];

test.afterAll(cerrar);

test('HUMO-01 la SPA vacía abre y las rutas hash montan sin errores de CSP', async ({ page, evidencia }) => {
  const cu = evidencia({ cu: 'HUMO-01', titulo: 'Humo de la plataforma: SPA con rutas hash', criterios: ['CA-39', 'CA-65', 'WEB-12', 'SEC-16', 'NFR-09'], bolt: 'B14' });
  const problemas: string[] = [];
  const externos: string[] = [];
  page.on('pageerror', (e) => problemas.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' || /Content Security Policy|Refused to/i.test(m.text())) problemas.push(`console.${m.type()}: ${m.text()}`);
  });
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!/^(127\.0\.0\.1|localhost)$/.test(u.hostname) && u.protocol.startsWith('http')) externos.push(r.url());
  });

  await cu.paso(
    'Abrir la SPA en la base de publicación',
    async () => {
      const r = await page.goto(BASE);
      expect(r?.status()).toBe(200);
      await expect(page.locator('#raiz')).not.toBeEmpty();
      await expect(page).toHaveTitle(/\S/);
    },
    { esperado: 'La página responde 200, #raiz tiene contenido y el título no está vacío' },
  );

  for (const ruta of RUTAS) {
    await cu.paso(
      `Abrir la ruta ${ruta}`,
      async () => {
        await page.goto(`${BASE}${ruta}`);
        await expect(page.locator('#raiz')).not.toBeEmpty();
        // El router hash conserva la ruta o redirige a otra #/ (guardas de ruta de B04); nunca deja la página en blanco.
        await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#\//);
        await expect(page.locator('body')).not.toHaveText(/^\s*$/);
        // CA-65, WEB-12: en cada ruta, título de pestaña con el nombre de la app y encabezado con ícono y nombre.
        await expect(page).toHaveTitle(new RegExp(`${NOMBRE}$`));
        await expect(page.locator('header').getByText(NOMBRE, { exact: true })).toBeVisible();
        await expect(page.locator('header img[alt=""]')).toBeVisible();
      },
      { esperado: 'La ruta monta una página con el router hash, sin pantalla en blanco; el título termina en «Agenda Clases App» y el encabezado trae el ícono y el nombre' },
    );
  }

  await cu.paso(
    'Revisar la consola y las peticiones del recorrido',
    async () => {
      expect(problemas, problemas.join('\n')).toEqual([]);
      expect(externos, `peticiones fuera del origen local: ${externos.join(', ')}`).toEqual([]);
    },
    { esperado: 'Sin errores de página, sin violaciones de CSP y sin peticiones a hosts externos' },
  );
});

test('HUMO-02 una ruta hash desconocida no deja la página en blanco', async ({ page }) => {
  await page.goto(`${BASE}#/ruta-que-no-existe`);
  await expect(page.locator('#raiz')).not.toBeEmpty();
  // src/rutas.tsx: una ruta desconocida vuelve a #/ (WEB-09: «Pedile el enlace a tu profesor» para el visitante).
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('HUMO-03 CA-65 título por pantalla, favicon bajo la base y remitente del código de ingreso', async ({ page, evidencia }) => {
  const cu = evidencia({
    cu: 'HUMO-03',
    titulo: 'Nombre e ícono de la app: pestaña, encabezado, favicon y remitente del código',
    criterios: ['CA-65', 'WEB-12'],
    bolt: 'B14',
  });

  await cu.paso(
    'Título de pestaña de la agenda de un profesor y del ingreso',
    async () => {
      await page.goto(`${BASE}#/p/${SLUG_A}`);
      await expect(page.getByRole('heading', { level: 1, name: /^Agenda de / })).toBeVisible();
      await expect(page).toHaveTitle(`Agenda · ${NOMBRE}`);
      await page.goto(`${BASE}#/ingreso`);
      await expect(page.getByRole('heading', { level: 1, name: 'Ingresar' })).toBeVisible();
      await expect(page).toHaveTitle(`Ingreso · ${NOMBRE}`);
    },
    { esperado: 'La pestaña dice «Agenda · Agenda Clases App» y «Ingreso · Agenda Clases App»' },
  );

  await cu.paso(
    'Encabezado con ícono decorativo y nombre en texto',
    async () => {
      const icono = page.locator('header img');
      await expect(icono).toHaveAttribute('alt', '');
      await expect(icono).toHaveAttribute('src', `${BASE}icono-192.png`);
      expect(await icono.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
      await expect(page.locator('header').getByText(NOMBRE, { exact: true })).toBeVisible();
    },
    { esperado: 'El ícono se carga bajo la base, con alt vacío, junto al nombre «Agenda Clases App» en texto' },
  );

  await cu.paso(
    'El favicon responde 200 bajo la base',
    async () => {
      const href = await page.locator('link[rel="icon"]').getAttribute('href');
      expect(href).toBe(`${BASE}favicon-32.png`);
      const r = await page.request.get(new URL(href!, page.url()).toString());
      expect(r.status()).toBe(200);
      expect(r.headers()['content-type']).toMatch(/image\/png/);
      const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
      expect((await page.request.get(new URL(apple!, page.url()).toString())).status()).toBe(200);
    },
    { esperado: '`link[rel=icon]` apunta a /reservas/favicon-32.png y el archivo se sirve (200, image/png); lo mismo el apple-touch-icon' },
  );

  await cu.paso(
    'El código de ingreso llega a Mailpit con el remitente «Agenda Clases App»',
    async () => {
      const mail = mailUnico('b14.humo.remitente');
      const r = await clienteAnon().auth.signInWithOtp({ email: mail, options: { shouldCreateUser: true, captchaToken: TOKEN_CAPTCHA } });
      expect(r.error).toBeNull();
      const de = await remitenteDe(mail);
      expect(de.nombre).toBe(NOMBRE);
    },
    { esperado: 'El remitente visible del mail del código es «Agenda Clases App»' },
  );
});
