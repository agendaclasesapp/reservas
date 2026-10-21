// Spike S02: retorno PKCE a la SPA con rutas hash, sin Google real.
// El canje real se ejercita con el mismo tramo final que usa Google: GoTrue redirige a
// redirect_to + "?code=<auth_code>" y la SPA lo canjea con el code_verifier que guardó supabase-js.
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { loadEnv } from 'vite';

const env = loadEnv('development', process.cwd(), '');
const SPA = 'http://127.0.0.1:5173/reservas/';
const mailUnico = (p: string) => `${p}.${Date.now()}@rtc.test`;

async function consulta<T extends pg.QueryResultRow>(texto: string, params: unknown[]) {
  const db = new pg.Client({ connectionString: env.S02_DB_URL });
  await db.connect();
  try {
    return (await db.query<T>(texto, params)).rows;
  } finally {
    await db.end();
  }
}

async function codigoDeMailpit(to: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const r = await fetch(`${env.S02_MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages } = (await r.json()) as { messages: { ID: string }[] };
    if (messages.length > 0) {
      const m = (await (await fetch(`${env.S02_MAILPIT_URL}/api/v1/message/${messages[0].ID}`)).json()) as { Text: string };
      return /\b(\d{6})\b/.exec(m.Text)![1];
    }
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error(`sin mail para ${to}`);
}

test('S02_WEB_02_google_sale_con_pkce_y_el_code_de_gotrue_vuelve_a_la_ruta_guardada', async ({ page }) => {
  // 1. Salida a Google: la ruta queda guardada y GoTrue redirige a Google con PKCE (Google interceptado).
  // Playwright no intercepta el salto 302 hacia Google: se intercepta /authorize, se le pide a GoTrue
  // la respuesta real sin seguir la redirección y se anota a dónde mandaba.
  let urlGoogle = '';
  await page.route('**/auth/v1/authorize**', async (route) => {
    const r = await route.fetch({ maxRedirects: 0 });
    urlGoogle = r.headers()['location'] ?? '';
    await route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: `Google simulado (GoTrue respondió ${r.status()})` });
  });
  const autorizar = page.waitForRequest((r) => r.url().includes('/auth/v1/authorize'));
  await page.goto('/reservas/#/mis-clases');
  await page.getByRole('button', { name: 'Ingresar desde aquí' }).click();
  await expect(page).toHaveURL(`${SPA}#/ingreso`);
  await page.getByRole('button', { name: 'Ingresar con Google' }).click();
  const urlAutorizar = new URL((await autorizar).url());
  await expect(page.getByText('Google simulado (GoTrue respondió 302)')).toBeVisible();
  expect(urlAutorizar.searchParams.get('redirect_to')).toBe(SPA);
  expect(urlAutorizar.searchParams.get('code_challenge_method')).toBe('s256');
  expect(urlGoogle.startsWith('https://accounts.google.com/o/oauth2/v2/auth?')).toBe(true);
  expect(new URL(urlGoogle).searchParams.get('redirect_uri')).toBe(`${env.VITE_SUPABASE_URL}/auth/v1/callback`);
  await page.unroute('**/auth/v1/authorize**');

  // 2. Vuelta: se pide un código (supabase-js guarda un code_verifier nuevo) y se usa el enlace de
  //    verificación PKCE de GoTrue, que responde 303 a SPA + "?code=..." como el callback de Google.
  await page.goto('/reservas/#/ingreso');
  expect(await page.evaluate(() => sessionStorage.getItem('rtc.ruta-antes-de-ingresar'))).toBe('#/mis-clases');
  const email = mailUnico('pkce');
  await page.getByLabel('Mail').fill(email);
  await page.getByRole('button', { name: 'Enviar código' }).click();
  await expect(page.getByTestId('mensaje')).toHaveText('Te enviamos un código de 6 dígitos.');
  const [{ token_hash }] = await consulta<{ token_hash: string }>(
    `select token_hash from auth.one_time_tokens where relates_to = $1 and token_type = 'confirmation_token'`,
    [email],
  );
  const conCode = page.waitForRequest((r) => r.url().startsWith(`${SPA}?code=`));
  await page.goto(
    `${env.VITE_SUPABASE_URL}/auth/v1/verify?token=${token_hash}&type=signup&redirect_to=${encodeURIComponent(SPA)}`,
  );
  const code = new URL((await conCode).url()).searchParams.get('code');
  expect(code).toMatch(/^[0-9a-f-]{36}$/);

  // 3. La SPA canjeó el code, limpió la query y el router quedó en la ruta guardada.
  await expect(page.getByTestId('sesion')).toHaveText(email);
  await expect(page).toHaveURL(`${SPA}#/mis-clases`);
  await expect(page.getByRole('heading', { name: 'Mis clases' })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('rtc.ruta-antes-de-ingresar'))).toBeNull();
  const [u] = await consulta<{ confirmado: boolean; alumnos: string }>(
    `select u.email_confirmed_at is not null as confirmado, (select count(*) from public.alumno a where a.user_id = u.id) as alumnos
       from auth.users u where u.email = $1`,
    [email],
  );
  expect(u).toEqual({ confirmado: true, alumnos: '1' });
});

test('S02_WEB_02_code_simulado_invalido_muestra_error_y_vuelve_a_la_ruta_guardada', async ({ page }) => {
  await page.goto('/reservas/#/');
  await page.evaluate(() => sessionStorage.setItem('rtc.ruta-antes-de-ingresar', '#/mis-clases'));
  await page.goto('/reservas/?code=00000000-0000-0000-0000-000000000000');
  await expect(page.getByTestId('error-retorno')).not.toBeEmpty();
  await expect(page).toHaveURL(`${SPA}#/mis-clases`);
  await expect(page.getByTestId('sesion')).toHaveText('sin sesión');
});

test('S02_WEB_02_error_description_de_google_se_muestra_y_limpia_la_query', async ({ page }) => {
  await page.goto('/reservas/?error=access_denied&error_description=Acceso%20denegado');
  await expect(page.getByTestId('error-retorno')).toHaveText('Acceso denegado');
  await expect(page).toHaveURL(`${SPA}#/`);
});

test('S02_ALU_01_codigo_por_mail_en_la_spa_erroneo_y_correcto', async ({ page }) => {
  const email = mailUnico('spa');
  await page.goto('/reservas/#/mis-clases');
  await page.getByRole('button', { name: 'Ingresar desde aquí' }).click();
  await page.getByLabel('Mail').fill(email);
  await page.getByRole('button', { name: 'Enviar código' }).click();
  await expect(page.getByTestId('mensaje')).toHaveText('Te enviamos un código de 6 dígitos.');
  const codigo = await codigoDeMailpit(email);
  await page.getByLabel('Código').fill(String((Number(codigo) + 1) % 1_000_000).padStart(6, '0'));
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(page.getByTestId('mensaje')).toHaveText('codigo-incorrecto');
  await page.getByLabel('Código').fill(codigo);
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(page).toHaveURL(`${SPA}#/mis-clases`);
  await expect(page.getByTestId('sesion')).toHaveText(email);
});
