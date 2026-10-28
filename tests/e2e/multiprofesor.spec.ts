// E2E de varios profesores en pantalla (B14, CR-002: WEB-09, WEB-11, ALU-14, AGE-09, AGE-11, PRF-08; CA-47, CA-52,
// CA-53, CA-61, CA-63, SEC-02, SEC-16). Dos profesores del seed (A = profesor-prueba, B = profesora-b): cada uno entra una
// sola vez con el código de Mailpit (el límite de Auth es de 60 s por mail) y la sesión se reutiliza. Las personas se
// preparan por la base con el prefijo `T05 ` y entran por la UI con un mail único. Se escribe contra roles y textos
// accesibles. Corre contra dist/ servido por vite preview.
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '../soporte/evidencia';
import { cerrar, sql } from '../soporte/bd';
import { SITEKEY_PRUEBA } from '../soporte/captcha';
import { esperarMail } from '../soporte/correo';
import { entorno, RAIZ } from '../soporte/entorno';
import { MAIL_PROFESOR, MAIL_PROFESOR_B, SLUG_A, SLUG_B } from '../soporte/usuarios';
import { crearAlumno, inscripcionDe, limpiarT05, mailT05 } from '../integracion/cuentas/ayuda';

const BASE = process.env.RTC_BASE ?? '/reservas/';
const ORIGEN = process.env.BASE_URL ?? `http://127.0.0.1:${process.env.RTC_PREVIEW_PORT || '4173'}`;
const SESION_A = resolve(RAIZ, 'test-results', '.sesion-profesor-e2e-multi-a.json');
const SESION_B = resolve(RAIZ, 'test-results', '.sesion-profesor-e2e-multi-b.json');
const NOMBRE_A = 'Profesor de Prueba';
const NOMBRE_B = 'Profesora B de Prueba';

test.use({ locale: 'es-UY', viewport: { width: 1280, height: 900 } });

async function mailsA(m: string): Promise<number> {
  const r = await fetch(`${entorno().mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${m}"`)}`);
  return ((await r.json()) as { messages: unknown[] }).messages.length;
}

/** Entra con código: reintenta hasta que el widget de prueba entrega el token y lee el código del mail nuevo. */
async function entrar(page: Page, mail: string, hash = '#/ingreso') {
  const antes = await mailsA(mail);
  await page.goto(`${ORIGEN}${BASE}${hash}`);
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

async function sesionDeProfesor(browser: import('@playwright/test').Browser, mail: string, archivo: string) {
  const ctx = await browser.newContext({ locale: 'es-UY', storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await entrar(page, mail);
  await expect(page).not.toHaveURL(/#\/ingreso/, { timeout: 30_000 });
  await page.goto(`${ORIGEN}${BASE}#/lista`);
  await expect(page.getByRole('heading', { name: 'Lista', level: 1 })).toBeVisible({ timeout: 30_000 });
  await ctx.storageState({ path: archivo });
  await ctx.close();
}

async function profesorActivo(slug: string, activo: boolean) {
  await sql('update public.profesor set activo = $2 where slug = $1', [slug, activo]);
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
  await profesorActivo(SLUG_A, true);
  await profesorActivo(SLUG_B, true);
  mkdirSync(resolve(RAIZ, 'test-results'), { recursive: true });
  await sesionDeProfesor(browser, MAIL_PROFESOR, SESION_A);
  await sesionDeProfesor(browser, MAIL_PROFESOR_B, SESION_B);
});

test.afterEach(async () => {
  await profesorActivo(SLUG_A, true);
  await profesorActivo(SLUG_B, true);
  await limpiarT05();
});
test.afterAll(cerrar);

test.describe('visitante', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('WEB-09 el inicio sin enlace no lista profesores ni muestra agenda', async ({ page, evidencia }) => {
    const cu = evidencia({
      cu: 'WEB-09',
      titulo: 'Inicio sin enlace de profesor: solo «Pedile el enlace a tu profesor»',
      criterios: ['WEB-09', 'AGE-09', 'CA-47'],
      bolt: 'B14',
    });
    await cu.paso(
      'Abrir el inicio sin enlace ni sesión',
      async () => {
        await page.goto(`${ORIGEN}${BASE}#/`);
        await expect(page.getByRole('heading', { level: 1, name: 'Pedile el enlace a tu profesor' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Ingresar' }).first()).toBeVisible();
        await expect(page).toHaveTitle('Inicio · Agenda Clases App');
      },
      { esperado: 'Un mensaje fijo, «Pedile el enlace a tu profesor», con el acceso al ingreso y el título «Inicio · Agenda Clases App»' },
    );
    await cu.paso(
      'No hay agenda, ni lista, ni nombres de profesores',
      async () => {
        await expect(page.getByRole('list', { name: 'Huecos del día' })).toHaveCount(0);
        await expect(page.getByRole('navigation', { name: 'Tus profesores' })).toHaveCount(0);
        const texto = await page.locator('body').innerText();
        expect(texto).not.toContain(NOMBRE_A);
        expect(texto).not.toContain(NOMBRE_B);
        // El menú del visitante ofrece «Inicio» e «Ingresar», no «Agenda».
        const menu = page.getByRole('navigation').first();
        await expect(menu.getByRole('link', { name: 'Inicio' })).toBeVisible();
        await expect(menu.getByRole('link', { name: 'Agenda', exact: true })).toHaveCount(0);
      },
      { esperado: 'La página no nombra a ningún profesor ni muestra huecos; el menú dice «Inicio» e «Ingresar»' },
    );
  });

  test('CA-63 el enlace de un profesor inactivo dice que no toma reservas y no muestra su agenda (AGE-11)', async ({ page, evidencia }) => {
    const cu = evidencia({
      cu: 'WEB-01-inactivo',
      titulo: 'Agenda de un profesor inactivo: no toma reservas',
      criterios: ['CA-63', 'AGE-11', 'WEB-01'],
      bolt: 'B14',
    });
    await cu.paso(
      'El enlace del profesor activo muestra su agenda',
      async () => {
        await page.goto(`${ORIGEN}${BASE}#/p/${SLUG_B}`);
        await expect(page.getByRole('heading', { level: 1, name: `Agenda de ${NOMBRE_B}` })).toBeVisible();
        await expect(page.getByRole('list', { name: 'Huecos del día' })).toBeVisible();
      },
      { esperado: 'Con la profesora activa se ve su agenda con huecos' },
    );
    await cu.paso(
      'Con la profesora inactiva el mismo enlace dice que no toma reservas',
      async () => {
        await profesorActivo(SLUG_B, false);
        await page.reload();
        await expect(page.getByText(`${NOMBRE_B} no toma reservas por ahora`)).toBeVisible();
        await expect(page.getByRole('list', { name: 'Huecos del día' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Pedir acceso' })).toHaveCount(0);
      },
      { esperado: 'Se lee «Profesora B de Prueba no toma reservas por ahora», sin huecos ni «Pedir acceso»' },
    );
    await cu.paso(
      'El enlace de la otra profesora sigue igual',
      async () => {
        await page.goto(`${ORIGEN}${BASE}#/p/${SLUG_A}`);
        await expect(page.getByRole('heading', { level: 1, name: `Agenda de ${NOMBRE_A}` })).toBeVisible();
        await expect(page.getByRole('list', { name: 'Huecos del día' })).toBeVisible();
      },
      { esperado: 'La agenda de A no cambia porque B esté inactiva' },
    );
    await cu.paso(
      'Al reactivarla el enlace vuelve a mostrar la agenda',
      async () => {
        await profesorActivo(SLUG_B, true);
        // La agenda guarda la configuración del enlace mientras la pestaña sigue abierta: se recarga la página.
        await page.goto(`${ORIGEN}${BASE}#/p/${SLUG_B}`);
        await page.reload();
        await expect(page.getByRole('list', { name: 'Huecos del día' })).toBeVisible();
        await expect(page.getByText('no toma reservas por ahora')).toHaveCount(0);
      },
      { esperado: 'Reactivada, el mismo enlace muestra otra vez la agenda' },
    );
  });
});

test.describe('profesores', () => {
  test('SEC-02 CA-52 cada profesor ve en pantalla solo a sus alumnos y a sus cuentas pendientes', async ({ browser, evidencia }) => {
    await crearAlumno({ nombre: 'Alumna de A', estado: 'aprobado', telefono: '+598 99111111', mail: mailT05('a.aprobada') });
    await crearAlumno({ nombre: 'Pendiente de A', estado: 'pendiente', telefono: '+598 99222222', mail: mailT05('a.pendiente') });
    await crearAlumno({ nombre: 'Alumno de B', estado: 'aprobado', telefono: '+598 99333333', mail: mailT05('b.aprobado') }, SLUG_B);
    await crearAlumno({ nombre: 'Pendiente de B', estado: 'pendiente', telefono: '+598 99444444', mail: mailT05('b.pendiente') }, SLUG_B);
    const cu = evidencia({
      cu: 'WEB-07-aislamiento',
      titulo: 'Lista del profesor: cada profesor ve solo a sus alumnos',
      criterios: ['CA-52', 'CA-47', 'SEC-02', 'WEB-07'],
      bolt: 'B14',
    });
    const ctxA = await browser.newContext({ locale: 'es-UY', storageState: SESION_A });
    const ctxB = await browser.newContext({ locale: 'es-UY', storageState: SESION_B });
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    try {
      await cu.paso(
        'El profesor A abre su lista',
        async () => {
          await pageA.goto(`${ORIGEN}${BASE}#/lista`);
          await expect(pageA.getByRole('article', { name: 'T05 Pendiente de A' })).toBeVisible({ timeout: 30_000 });
          await expect(pageA.getByRole('row', { name: /T05 Alumna de A/ })).toBeVisible();
        },
        { esperado: 'A ve a «Alumna de A» en la lista y a «Pendiente de A» en cuentas pendientes' },
      );
      await cu.paso(
        'A no ve ni nombres ni teléfonos ni mails de los alumnos de B',
        async () => {
          const texto = await pageA.locator('main').innerText();
          expect(texto).not.toMatch(/T05 (Alumno|Pendiente) de B|99333333|99444444|b\.aprobado|b\.pendiente/);
          await expect(pageA.getByRole('row', { name: /de B/ })).toHaveCount(0);
          await expect(pageA.getByRole('article', { name: /de B/ })).toHaveCount(0);
        },
        { esperado: 'La página de A no contiene ningún dato de los alumnos de B' },
      );
      await cu.paso(
        'La profesora B abre su lista y ve solo lo suyo',
        async () => {
          await pageB.goto(`${ORIGEN}${BASE}#/lista`);
          await expect(pageB.getByRole('article', { name: 'T05 Pendiente de B' })).toBeVisible({ timeout: 30_000 });
          await expect(pageB.getByRole('row', { name: /T05 Alumno de B/ })).toBeVisible();
          const texto = await pageB.locator('main').innerText();
          expect(texto).not.toMatch(/T05 (Alumna|Pendiente) de A|99111111|99222222|a\.aprobada|a\.pendiente/);
        },
        { esperado: 'B ve solo a «Alumno de B» y «Pendiente de B»' },
      );
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('CA-61 el alta con el mail de una persona existente la asocia sin tocar su ficha y se avisa; con el de un profesor, error', async ({ browser, evidencia }) => {
    const mail = mailT05('persona.dos');
    const persona = await crearAlumno({ nombre: 'Persona de A', estado: 'aprobado', telefono: '+598 99555555', mail });
    const cu = evidencia({
      cu: 'WEB-07-alta-asociada',
      titulo: 'Alta de un alumno con el mail de una persona que ya existe',
      criterios: ['CA-61', 'ALU-07', 'WEB-07'],
      bolt: 'B14',
    });
    const ctx = await browser.newContext({ locale: 'es-UY', storageState: SESION_B });
    const page = await ctx.newPage();
    const llenar = async (nombre: string, telefono: string, mailAlta: string) => {
      const dialogo = page.getByRole('dialog', { name: 'Agregar alumno' });
      await dialogo.getByLabel('Nombre y apellido').fill(nombre);
      await dialogo.getByLabel('Teléfono o WhatsApp').fill(telefono);
      await dialogo.getByLabel('Fecha de nacimiento').fill('1991-02-03');
      await dialogo.getByLabel(/^Mail/).fill(mailAlta);
      await dialogo.getByRole('button', { name: 'Agregar alumno', exact: true }).click();
    };
    try {
      await cu.paso(
        'La profesora B da de alta con el mail de la persona de A',
        async () => {
          await page.goto(`${ORIGEN}${BASE}#/lista`);
          await expect(page.getByRole('heading', { name: 'Lista', level: 1 })).toBeVisible({ timeout: 30_000 });
          await page.getByRole('button', { name: 'Agregar alumno' }).click();
          await llenar('Otro nombre B', '+598 99000000', mail);
          await expect(page.getByText('Ese mail ya tenía cuenta: la persona quedó como alumna tuya, con la ficha que ya tenía.')).toBeVisible({
            timeout: 15_000,
          });
        },
        { esperado: 'Se lee «Ese mail ya tenía cuenta: la persona quedó como alumna tuya, con la ficha que ya tenía.»' },
      );
      await cu.paso(
        'La persona figura en la lista de B con su ficha original, aprobada con B y con A',
        async () => {
          await expect(page.getByRole('row', { name: /T05 Persona de A/ })).toBeVisible({ timeout: 15_000 });
          await expect(page.getByText('Otro nombre B')).toHaveCount(0);
          expect((await inscripcionDe(persona, SLUG_B))?.estado).toBe('aprobado');
          expect((await inscripcionDe(persona, SLUG_A))?.estado).toBe('aprobado');
          const [a] = await sql<{ nombre: string; telefono: string }>('select nombre, telefono from public.alumno where id = $1', [persona]);
          expect(a).toEqual({ nombre: 'T05 Persona de A', telefono: '+598 99555555' });
          expect((await sql('select 1 from public.alumno where mail = $1', [mail])).length).toBe(1);
        },
        { esperado: 'Una sola persona con ese mail, ficha sin cambios, aprobada con los dos profesores; la lista de B la muestra con su nombre original' },
      );
      await cu.paso(
        'El alta con el mail de un profesor da error y no crea nada',
        async () => {
          const antes = (await sql<{ n: number }>('select count(*)::int n from public.alumno'))[0].n;
          await page.getByRole('button', { name: 'Agregar alumno' }).click();
          await llenar('Intento con mail de profesor', '+598 99000001', MAIL_PROFESOR);
          await expect(page.getByText('Ese mail ya está registrado y no se puede usar acá.')).toBeVisible({ timeout: 15_000 });
          expect((await sql<{ n: number }>('select count(*)::int n from public.alumno'))[0].n).toBe(antes);
          expect(await sql('select 1 from public.alumno where nombre = $1', ['Intento con mail de profesor'])).toEqual([]);
        },
        { esperado: 'Se lee «Ese mail ya está registrado y no se puede usar acá.» en el campo mail y no nace ningún alumno' },
      );
    } finally {
      await ctx.close();
    }
  });

  test('CA-63 el profesor inactivo ve el aviso en su lista y no puede aprobar ni dar de alta (PRF-08)', async ({ browser, evidencia }) => {
    await crearAlumno({ nombre: 'Pendiente inactivo', estado: 'pendiente', telefono: '+598 99666666', mail: mailT05('inactivo.pend') }, SLUG_B);
    const cu = evidencia({
      cu: 'WEB-07-inactivo',
      titulo: 'Lista de un profesor inactivo: aviso y acciones deshabilitadas',
      criterios: ['CA-63', 'PRF-08', 'WEB-07'],
      bolt: 'B14',
    });
    const ctx = await browser.newContext({ locale: 'es-UY', storageState: SESION_B });
    const page = await ctx.newPage();
    try {
      await cu.paso(
        'Con la profesora inactiva, la lista avisa y deshabilita «Agregar alumno»',
        async () => {
          await profesorActivo(SLUG_B, false);
          await page.goto(`${ORIGEN}${BASE}#/lista`);
          await expect(page.getByRole('heading', { name: 'Lista', level: 1 })).toBeVisible({ timeout: 30_000 });
          await expect(page.getByText(/Tu agenda está inactiva: no podés aprobar accesos ni dar de alta alumnos/)).toBeVisible();
          await expect(page.getByRole('button', { name: 'Agregar alumno' })).toBeDisabled();
        },
        { esperado: 'Aviso de agenda inactiva y «Agregar alumno» deshabilitado' },
      );
      await cu.paso(
        'La cuenta pendiente sigue visible y rechazar sigue disponible; no queda aprobada',
        async () => {
          await expect(page.getByRole('article', { name: 'T05 Pendiente inactivo' })).toBeVisible();
          await expect(page.getByRole('button', { name: 'Rechazar cuenta de T05 Pendiente inactivo' })).toBeEnabled();
          const aprobar = page.getByRole('button', { name: 'Aprobar cuenta de T05 Pendiente inactivo' });
          if ((await aprobar.count()) > 0) await expect(aprobar).toBeDisabled();
        },
        { esperado: 'Se puede rechazar pero no aprobar con la agenda inactiva' },
      );
    } finally {
      await ctx.close();
    }
  });
});

test.describe('persona con vínculos', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('CA-53 ALU-14 pide acceso desde el enlace de otro profesor y con dos vínculos aparece el selector', async ({ page, evidencia }) => {
    const mail = mailT05('persona.selector');
    const persona = await crearAlumno({ nombre: 'Persona selector', estado: 'aprobado', telefono: '+598 99777777', mail });
    const cu = evidencia({
      cu: 'WEB-11',
      titulo: 'Pedir acceso al enlace de otro profesor y selector con dos vínculos',
      criterios: ['CA-53', 'CA-61', 'ALU-14', 'WEB-11', 'WEB-01'],
      bolt: 'B14',
    });
    const selector = () => page.getByRole('navigation', { name: 'Tus profesores' });

    await cu.paso(
      'Entrar con un solo vínculo: sin selector',
      async () => {
        await entrar(page, mail, `#/ingreso?volver=${encodeURIComponent(`/p/${SLUG_A}`)}`);
        await expect(page.getByRole('heading', { level: 1, name: `Agenda de ${NOMBRE_A}` })).toBeVisible({ timeout: 30_000 });
        await expect(selector()).toHaveCount(0);
      },
      { esperado: 'Con un solo vínculo aprobado se ve la agenda de A y no el selector de profesores' },
    );

    await cu.paso(
      'Abrir el enlace de la profesora B: ofrece «Pedir acceso»',
      async () => {
        await page.goto(`${ORIGEN}${BASE}#/p/${SLUG_B}`);
        await expect(page.getByRole('heading', { level: 1, name: `Agenda de ${NOMBRE_B}` })).toBeVisible({ timeout: 20_000 });
        await expect(page.getByRole('heading', { level: 2, name: `Pedir acceso a ${NOMBRE_B}` })).toBeVisible();
        await expect(page.getByRole('list', { name: 'Huecos del día' })).toBeVisible();
      },
      { esperado: 'La agenda de B se ve y arriba aparece «Pedir acceso a Profesora B de Prueba» con el campo «Cómo llegaste a …»' },
    );

    await cu.paso(
      'Pedir acceso sin contar cómo llegó: error en el campo',
      async () => {
        await page.getByRole('button', { name: 'Pedir acceso', exact: true }).click();
        await expect(page.getByLabel(`Cómo llegaste a ${NOMBRE_B}`)).toHaveAccessibleDescription(/\S/);
        expect(await inscripcionDe(persona, SLUG_B)).toBeNull();
      },
      { esperado: 'No se envía; el error queda asociado al campo y no nace ninguna inscripción' },
    );

    await cu.paso(
      'Pedir acceso con el «cómo llegaste»',
      async () => {
        await page.getByLabel(`Cómo llegaste a ${NOMBRE_B}`).fill('Me pasó el enlace una compañera');
        await page.getByRole('button', { name: 'Pedir acceso', exact: true }).click();
        await expect(page.getByText('Acceso pendiente')).toBeVisible({ timeout: 20_000 });
        const [i] = await sql<{ estado: string; como_llego: string }>(
          `select i.estado, i.como_llego from public.inscripcion i join public.profesor p on p.id = i.profesor_id where i.alumno_id = $1 and p.slug = $2`,
          [persona, SLUG_B],
        );
        expect(i).toEqual({ estado: 'pendiente', como_llego: 'Me pasó el enlace una compañera' });
        expect((await inscripcionDe(persona, SLUG_A))?.estado).toBe('aprobado');
      },
      { esperado: 'La agenda de B dice «Acceso pendiente»; la inscripción con B nace pendiente y la de A sigue aprobada' },
    );

    await cu.paso(
      'Con dos vínculos aparece el selector con el estado de cada profesor',
      async () => {
        await page.reload();
        await expect(selector()).toBeVisible({ timeout: 20_000 });
        await expect(selector().getByRole('link')).toHaveCount(2);
        await expect(selector().getByRole('link', { name: new RegExp(NOMBRE_A) })).toBeVisible();
        await expect(selector().getByRole('link', { name: new RegExp(NOMBRE_B) })).toHaveAttribute('aria-current', 'page');
      },
      { esperado: 'El selector «Tus profesores» lista a los dos, con B como el profesor actual' },
    );

    await cu.paso(
      'Elegir al profesor A en el selector abre su agenda',
      async () => {
        await selector().getByRole('link', { name: new RegExp(NOMBRE_A) }).click();
        await expect(page.getByRole('heading', { level: 1, name: `Agenda de ${NOMBRE_A}` })).toBeVisible();
        expect(await page.evaluate(() => location.hash)).toBe(`#/p/${SLUG_A}`);
        await expect(selector()).toBeVisible();
      },
      { esperado: 'Se abre la agenda de A y el selector sigue arriba' },
    );

    await cu.paso(
      'La ficha muestra el estado con cada profesor',
      async () => {
        await page.goto(`${ORIGEN}${BASE}#/ficha`);
        await expect(page.getByRole('heading', { level: 2, name: 'Tus profesores' })).toBeVisible({ timeout: 20_000 });
        await expect(page.getByRole('heading', { level: 3, name: NOMBRE_A })).toBeVisible();
        await expect(page.getByRole('heading', { level: 3, name: NOMBRE_B })).toBeVisible();
        const vinculos = page.getByRole('region', { name: 'Tus profesores' });
        await expect(vinculos.getByText('Aprobada', { exact: true })).toBeVisible();
        await expect(vinculos.getByText('Pendiente de aprobación', { exact: true })).toBeVisible();
      },
      { esperado: 'Un h3 por profesor: A «Aprobada» y B «Pendiente de aprobación»' },
    );
  });
});
