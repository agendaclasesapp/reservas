// Humo E2E de B01 (CA-39, SEC-16, NFR-09): la SPA publicada abre, las 8 rutas hash montan algo, sin errores de
// página ni violaciones de CSP y sin pedir nada fuera de la propia SPA y de Supabase local.
// Corre contra el bundle compilado (npm run build) servido por `vite preview` con la base de Pages (DEC-14).
import { expect, test } from '../soporte/evidencia';

const BASE = process.env.RTC_BASE ?? '/reservas/';
const RUTAS = ['#/', '#/ingreso', '#/ficha', '#/solicitud', '#/mis-clases', '#/panel', '#/lista', '#/configuracion'];

test('HUMO-01 la SPA vacía abre y las rutas hash montan sin errores de CSP', async ({ page, evidencia }) => {
  const cu = evidencia({ cu: 'HUMO-01', titulo: 'Humo de la plataforma: SPA con rutas hash', criterios: ['CA-39', 'SEC-16', 'NFR-09'], bolt: 'B01' });
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
      },
      { esperado: 'La ruta monta una página (aunque esté vacía) con el router hash, sin pantalla en blanco' },
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
  // src/rutas.tsx: una ruta desconocida vuelve a #/ (agenda).
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
