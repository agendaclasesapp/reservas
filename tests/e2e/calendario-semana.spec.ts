// E2E de la vista Semana del calendario del Panel (B20, T20.3): CAL-02, CAL-03, CAL-10, CAL-15, CAL-16, CAL-19 ·
// CA-67 (rama Semana), CA-68 (rama Semana), CA-74, CA-80, CA-81, CA-83 (rama Semana), CA-85, CA-90 (Semana) · INV-02 ·
// SEC-34, SEC-37. Escritorio (1280x900) y 360 px (ventana de 3 días). Datos sintéticos con prefijo `T05 `, que se limpian; la
// grilla del profesor A se guarda y se restaura. El reloj de la base (`fijarReloj`) y el del navegador (desfase de `Date`:
// page.clock rompe TZDate) se fijan en el mismo instante. Una sesión por profesor por archivo (límite de mails de Auth):
// SEC-37 va al final porque cierra la sesión de A (el cierre es global) y pide el código de B en la misma pestaña.
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { expect, test } from '../soporte/evidencia';
import { cerrar, sql } from '../soporte/bd';
import { SITEKEY_PRUEBA } from '../soporte/captcha';
import { esperarMail, contarMails } from '../soporte/correo';
import { entorno, RAIZ } from '../soporte/entorno';
import { fijarReloj, limpiarReloj } from '../soporte/reloj';
import { MAIL_PROFESOR, MAIL_PROFESOR_B, SLUG_A, SLUG_B } from '../soporte/usuarios';
import { crearAlumno, limpiarT05, mailT05 } from '../integracion/cuentas/ayuda';

const BASE = process.env.RTC_BASE ?? '/reservas/';
const ORIGEN = process.env.BASE_URL ?? `http://127.0.0.1:${process.env.RTC_PREVIEW_PORT || '4173'}`;
const TZ = 'America/Montevideo';
const CACHE = resolve(RAIZ, 'node_modules', '.cache', 'calendario-semana');
const SESION_A = resolve(CACHE, 'sesion-profesor-a.json');
const SESION_B = resolve(CACHE, 'sesion-profesor-b.json');

const PANTALLAS = [
  { nombre: 'escritorio', sufijo: 'esc', viewport: { width: 1280, height: 900 }, dias: 7 },
  { nombre: '360 px', sufijo: '360', viewport: { width: 360, height: 740 }, dias: 3 },
] as const;
type Pantalla = (typeof PANTALLAS)[number];

// Viernes 30/10/2026 10:20 (huso del profesor); semana 26/10 a 01/11. Y el lunes 02/11/2026 12:00 para los bordes del rango.
const VIERNES = '2026-10-30T10:20:00-03:00';
const LUNES = '2026-11-02T12:00:00-03:00';

// ---------------------------------------------------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------------------------------------------------
type EstadoClase = 'confirmada' | 'pendiente';
/** Una clase de `minutos` minutos que empieza a las `hora` (HH:MM, huso de Montevideo) del `dia`, del profesor `slug`. */
async function crearClaseDe(slug: string, alumnoId: string, dia: string, hora: string, minutos: number, estado: EstadoClase = 'confirmada') {
  const inicio = `${dia}T${hora}:00-03:00`;
  const deSolicitud = estado === 'pendiente';
  const p = `(select id from public.profesor where slug = $1)`;
  const [r] = await sql<{ id: string }>(
    `insert into public.reserva (profesor_id, alumno_id, tipo, hora_local, dia_semana, duracion_min, estado, desde, origen)
     values (${p}, $2, 'suelta',
             (($3::timestamptz) at time zone '${TZ}')::time,
             extract(isodow from ($3::timestamptz) at time zone '${TZ}')::smallint,
             $4, $5, (($3::timestamptz) at time zone '${TZ}')::date, $6) returning id`,
    [slug, alumnoId, inicio, minutos, estado, deSolicitud ? 'solicitud' : 'profesor'],
  );
  await sql(
    `insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado)
     values (${p}, $2, $3, $4::timestamptz, $4::timestamptz + ($5::int * interval '1 minute'), $6)`,
    [slug, r.id, alumnoId, inicio, minutos, estado],
  );
  if (deSolicitud) {
    await sql(
      `insert into public.solicitud (profesor_id, alumno_id, tipo, reserva_id, fecha_clase, estado)
       values (${p}, $2, 'reserva', $3, $4::timestamptz, 'pendiente')`,
      [slug, alumnoId, r.id, inicio],
    );
  }
}
const alumna = (nombre: string, slug: string = SLUG_A) =>
  crearAlumno({ nombre, estado: 'aprobado', telefono: '+598 99555333', mail: mailT05('e2e.calsem') }, slug);

type Tramo = { dia_semana: number; desde: string; hasta: string };
let grillaOriginal: Tramo[] = [];
async function leerGrilla() {
  return sql<Tramo>(
    `select dia_semana::int, desde::text, hasta::text from public.grilla_tramo where profesor_id = (select id from public.profesor where slug = $1)`,
    [SLUG_A],
  );
}
async function ponerGrilla(tramos: Tramo[]) {
  const p = `(select id from public.profesor where slug = $1)`;
  await sql(`delete from public.grilla_tramo where profesor_id = ${p}`, [SLUG_A]);
  for (const t of tramos) {
    await sql(`insert into public.grilla_tramo (profesor_id, dia_semana, desde, hasta) values (${p}, $2, $3, $4)`, [SLUG_A, t.dia_semana, t.desde, t.hasta]);
  }
}
/** De lunes a viernes, 09:00 a 17:00. */
const laborables = (): Tramo[] => [1, 2, 3, 4, 5].map((dia_semana) => ({ dia_semana, desde: '09:00', hasta: '17:00' }));

async function limpiar() {
  await limpiarReloj();
  await sql(`update public.profesor set activo = true where slug = $1`, [SLUG_A]);
  await sql(`delete from public.solicitud where alumno_id in (select id from public.alumno where nombre like 'T05 %')`);
  await limpiarT05();
  if (grillaOriginal.length > 0) await ponerGrilla(grillaOriginal);
}

// ---------------------------------------------------------------------------------------------------------------------
// Sesiones
// ---------------------------------------------------------------------------------------------------------------------
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
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
}
async function guardarSesion(browser: Browser, mail: string, archivo: string) {
  mkdirSync(CACHE, { recursive: true });
  const ctx = await browser.newContext({ locale: 'es-UY', timezoneId: TZ, storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await entrar(page, mail);
  await ctx.storageState({ path: archivo });
  await ctx.close();
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(420_000);
  const e = entorno();
  if (!process.env.BASE_URL && !process.env.RTC_SIN_BUILD) {
    execSync('npm run build', {
      cwd: RAIZ,
      stdio: 'ignore',
      timeout: 240_000,
      env: { ...process.env, VITE_SUPABASE_URL: e.apiUrl, VITE_SUPABASE_ANON_KEY: e.anonKey, VITE_TURNSTILE_SITEKEY: SITEKEY_PRUEBA },
    });
  }
  grillaOriginal = await leerGrilla();
  await limpiar();
  await guardarSesion(browser, MAIL_PROFESOR, SESION_A);
  await guardarSesion(browser, MAIL_PROFESOR_B, SESION_B);
});
test.afterEach(limpiar);
test.afterAll(cerrar);

/** Reloj del navegador en `iso` sin page.clock (rompe TZDate): un Proxy de Date con desfase fijo; el tiempo sigue corriendo. */
async function fijarRelojNavegador(ctx: BrowserContext, iso: string) {
  await ctx.addInitScript((objetivo: number) => {
    const Real = Date;
    const desfase = objetivo - Real.now();
    window.Date = new Proxy(Real, {
      construct: (t, args, nt) => Reflect.construct(t, args.length ? args : [Real.now() + desfase], nt),
      get: (t, k, r) => (k === 'now' ? () => Real.now() + desfase : Reflect.get(t, k, r)),
    });
  }, Date.parse(iso));
}

type Opciones = { sesion?: string; ahora?: string; tactil?: boolean };
/** Contexto del profesor con el reloj de la base y el del navegador en `ahora`, si se da. */
async function contexto(browser: Browser, pantalla: Pantalla, o: Opciones = {}) {
  const ctx = await browser.newContext({
    locale: 'es-UY',
    timezoneId: TZ,
    storageState: o.sesion ?? SESION_A,
    viewport: pantalla.viewport,
    hasTouch: o.tactil ?? false,
  });
  if (o.ahora) {
    await fijarReloj(o.ahora);
    await fijarRelojNavegador(ctx, o.ahora);
  }
  return { ctx, page: await ctx.newPage() };
}

/** Cuenta las lecturas de `agenda_profesor_dias`: rango pedido y cuerpo de cada respuesta. */
function espiar(page: Page) {
  const lecturas = { rangos: [] as { desde: string; hasta: string }[], respuestas: [] as string[] };
  void page.route(/\/rpc\/agenda_profesor_dias/, async (ruta) => {
    if (ruta.request().method() === 'POST') {
      const cuerpo = JSON.parse(ruta.request().postData() ?? '{}') as { p_desde: string; p_hasta: string };
      lecturas.rangos.push({ desde: cuerpo.p_desde, hasta: cuerpo.p_hasta });
    }
    await ruta.continue();
  });
  page.on('response', (r) => {
    if (/\/rpc\/agenda_profesor_dias/.test(r.url()) && r.request().method() === 'POST') {
      void r.text().then((t) => lecturas.respuestas.push(t)).catch(() => undefined);
    }
  });
  return lecturas;
}

// ---------------------------------------------------------------------------------------------------------------------
// Localizadores y utilidades
// ---------------------------------------------------------------------------------------------------------------------
const calendario = (page: Page) => page.getByRole('group', { name: /^Calendario, / });
const nav = (page: Page) => page.getByRole('navigation', { name: 'Navegación del calendario' });
const h2 = (page: Page, texto: string) => page.getByRole('heading', { level: 2, name: texto });
/** Encabezado de un día de la Semana: «Abrir el Lun 26/10, vista Día» (en hoy, «…, hoy, vista Día»). */
const encabezado = (page: Page, corto: string) => page.getByRole('button', { name: new RegExp(`^Abrir el ${corto.replace('/', '\\/')}\\b`) });
const encabezadoFuera = (page: Page, corto: string) => page.getByRole('button', { name: `${corto}, no disponible` });
const columnas = (page: Page) => calendario(page).locator('ul[aria-label^="Clases del"]');
const huecos = (page: Page) => calendario(page).getByRole('button', { name: /, Libre$/ });
const sinDesplazamientoHorizontal = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

async function abrir(page: Page, hash: string) {
  await page.goto('about:blank'); // carga completa: un cambio de hash en la misma página no vuelve a leer la configuración
  await page.goto(`${ORIGEN}${BASE}${hash}`);
  await expect(page.getByRole('heading', { name: 'Panel', level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect(calendario(page)).toBeVisible({ timeout: 30_000 });
}

/** Desliza con el dedo (eventos táctiles reales por CDP; el navegador los convierte en Pointer Events táctiles). */
async function deslizar(page: Page, sentido: 'izquierda' | 'derecha') {
  await calendario(page).evaluate((el) => el.scrollIntoView({ block: 'start' })); // el calendario puede empezar bajo el pliegue
  const caja = (await calendario(page).boundingBox())!;
  const y = Math.max(caja.y, 0) + 200;
  const [de, a] = sentido === 'izquierda' ? [caja.x + caja.width * 0.8, caja.x + caja.width * 0.3] : [caja.x + caja.width * 0.3, caja.x + caja.width * 0.8];
  await page.evaluate(() => {
    const w = window as unknown as { __punteros: string[] };
    w.__punteros = [];
    for (const t of ['pointerdown', 'pointerup', 'pointercancel']) {
      document.addEventListener(t, (e) => w.__punteros.push(`${t}:${(e as PointerEvent).pointerType}:${Math.round((e as PointerEvent).clientX)},${Math.round((e as PointerEvent).clientY)}`), true);
    }
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: de, y }] });
  for (let i = 1; i <= 6; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: de + ((a - de) * i) / 6, y }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  const punteros = await page.evaluate(() => (window as unknown as { __punteros: string[] }).__punteros);
  test.info().annotations.push({ type: `deslizar ${sentido}`, description: `desde x=${Math.round(de)} a x=${Math.round(a)}, y=${Math.round(y)}; eventos: ${punteros.join(' ')}` });
}

/** Por columna del calendario: ¿es la de hoy (`data-hoy`)? y cuántas líneas de la hora actual tiene. */
const lineasPorColumna = (page: Page) =>
  columnas(page).evaluateAll((uls) =>
    uls.map((ul) => {
      const col = ul.parentElement!;
      const lineas = Array.from(col.children).filter((h) => h.tagName === 'DIV' && h.getAttribute('aria-hidden') === 'true' && (h as HTMLElement).style.cssText.includes('--cal-arriba'));
      return { hoy: col.getAttribute('data-hoy') === 'true', lineas: lineas.length, nombre: ul.getAttribute('aria-label') };
    }),
  );

/** Lo que hay en `localStorage` y `sessionStorage` de la página (clave y valor). */
const almacenes = (page: Page) =>
  page.evaluate(() => ({
    local: Object.entries(localStorage),
    sesion: Object.entries(sessionStorage),
  }));

// ---------------------------------------------------------------------------------------------------------------------
// Casos por pantalla
// ---------------------------------------------------------------------------------------------------------------------
for (const pantalla of PANTALLAS) {
  test.describe(`calendario Semana · ${pantalla.nombre}`, () => {
    const cuDe = (base: string) => `${base}-${pantalla.sufijo}`;
    const escritorio = pantalla.dias === 7;

    test(`T-CA-67-02 CA-67 CAL-02 [${pantalla.nombre}] ?v=semana&d=2026-10-30 muestra la semana 26/10 a 01/11 y recargar la deja igual; una sola lectura`, async ({ browser, evidencia }) => {
      test.setTimeout(180_000);
      const cu = evidencia({ cu: cuDe('WEB-15-semana-ca67'), titulo: `Calendario Semana: dirección y recarga (${pantalla.nombre})`, criterios: ['CA-67', 'CAL-02', 'CAL-15', 'WEB-15'], bolt: 'B20' });
      await ponerGrilla(laborables());
      const { ctx, page } = await contexto(browser, pantalla, { ahora: VIERNES });
      const lecturas = espiar(page);

      await cu.paso('Abrir #/panel?v=semana&d=2026-10-30', async () => {
        await abrir(page, '#/panel?v=semana&d=2026-10-30');
        if (escritorio) {
          await expect(h2(page, '26/10/2026 - 01/11/2026')).toBeVisible();
          for (const d of ['Lun 26/10', 'Mar 27/10', 'Mié 28/10', 'Jue 29/10', 'Vie 30/10', 'Sáb 31/10', 'Dom 01/11']) await expect(encabezado(page, d)).toHaveCount(1);
        } else {
          for (const d of ['Vie 30/10', 'Sáb 31/10', 'Dom 01/11']) await expect(encabezado(page, d)).toHaveCount(1);
          await expect(encabezado(page, 'Lun 26/10')).toHaveCount(0);
        }
        await expect(columnas(page)).toHaveCount(pantalla.dias);
        await expect(page.getByRole('group', { name: 'Vista del calendario' }).getByRole('button', { name: 'Semana' })).toHaveAttribute('aria-pressed', 'true');
        expect(await sinDesplazamientoHorizontal(page), 'sin desplazamiento horizontal').toBe(true);
        expect(lecturas.rangos, 'una sola lectura de agenda_profesor_dias').toHaveLength(1);
        test.info().annotations.push({ type: 'lectura', description: `rango pedido ${JSON.stringify(lecturas.rangos[0])}` });
      }, {
        esperado: escritorio
          ? 'Siete columnas, Lun 26/10 a Dom 01/11, título 26/10/2026 - 01/11/2026, una sola lectura'
          : 'Ventana de 3 días: Vie 30/10, Sáb 31/10, Dom 01/11, sin desplazamiento horizontal, una sola lectura',
      });

      await cu.paso('Recargar la página', async () => {
        await page.reload();
        await expect(calendario(page)).toBeVisible({ timeout: 30_000 });
        if (escritorio) await expect(h2(page, '26/10/2026 - 01/11/2026')).toBeVisible();
        await expect(columnas(page)).toHaveCount(pantalla.dias);
        await expect(encabezado(page, 'Vie 30/10')).toHaveCount(1);
        expect(page.url()).toContain('v=semana');
        expect(page.url()).toContain('d=2026-10-30');
      }, { esperado: 'La dirección y la vista quedan iguales tras recargar' });
      await ctx.close();
    });

    test(`T-CA-74-01 CA-74 CAL-10 [${pantalla.nombre}] línea de la hora actual solo en hoy y columna de hoy resaltada (reloj 30/10/2026 10:20)`, async ({ browser, evidencia }) => {
      test.setTimeout(180_000);
      const cu = evidencia({ cu: cuDe('WEB-15-semana-ca74'), titulo: `Calendario Semana: hoy y línea de la hora actual (${pantalla.nombre})`, criterios: ['CA-74', 'CAL-10', 'WEB-15'], bolt: 'B20' });
      await ponerGrilla(laborables());
      const { ctx, page } = await contexto(browser, pantalla, { ahora: VIERNES });

      await cu.paso('Abrir la Semana de hoy', async () => {
        await abrir(page, '#/panel?v=semana&d=2026-10-30');
        const cols = await lineasPorColumna(page);
        expect(cols).toHaveLength(pantalla.dias);
        expect(cols.filter((c) => c.hoy), 'una sola columna resaltada').toHaveLength(1);
        expect(cols.find((c) => c.hoy)?.nombre).toContain('30');
        expect(cols.find((c) => c.hoy)?.lineas, 'la columna de hoy tiene la línea').toBe(1);
        expect(cols.filter((c) => !c.hoy).every((c) => c.lineas === 0), 'las demás no tienen línea').toBe(true);
        await expect(page.getByText('Ahora', { exact: true })).toHaveCount(1);
        await expect(page.getByText('10:20', { exact: true })).toHaveCount(1);
        await expect(page.locator('button[aria-current="date"]')).toHaveCount(1);
        await expect(page.locator('button[aria-current="date"]')).toContainText('Vie 30/10');
        await expect(page.locator('button[aria-current="date"]')).toContainText('Hoy');
        test.info().annotations.push({ type: 'columnas', description: JSON.stringify(cols) });
      }, { esperado: 'Solo la columna de hoy lleva data-hoy y la línea «Ahora 10:20»; el encabezado de hoy tiene aria-current=date y «Hoy»' });

      await cu.paso('Abrir la vista Día de hoy', async () => {
        await abrir(page, '#/panel?v=dia&d=2026-10-30');
        const cols = await lineasPorColumna(page);
        expect(cols).toHaveLength(1);
        expect(cols[0].lineas, 'la vista Día tiene la línea de la hora actual').toBe(1);
        expect(cols[0].hoy, 'sin resaltado de columna en Día (CAL-10)').toBe(false);
      }, { esperado: 'La vista Día de hoy tiene la línea y no resalta la columna' });
      await ctx.close();
    });

    test(`T-CA-83-02 CA-83 CAL-19 [${pantalla.nombre}] «Ver como lista» agrupa los huecos por día con las mismas acciones`, async ({ browser, evidencia }) => {
      test.setTimeout(180_000);
      const cu = evidencia({ cu: cuDe('WEB-16-semana-ca83'), titulo: `Calendario Semana: lista agrupada por día (${pantalla.nombre})`, criterios: ['CA-83', 'CAL-19', 'WEB-16'], bolt: 'B20' });
      await ponerGrilla(laborables());
      const al = await alumna('Alumna Lista');
      await crearClaseDe(SLUG_A, al, '2026-10-30', '15:00', 60);
      const { ctx, page } = await contexto(browser, pantalla, { ahora: VIERNES });
      const lecturas = espiar(page);

      await cu.paso('Ver la Semana como lista', async () => {
        await abrir(page, '#/panel?v=semana&d=2026-10-30');
        await page.getByRole('button', { name: 'Ver como lista' }).click();
        const titulos = page.getByRole('heading', { level: 3 });
        await expect(titulos).toHaveCount(pantalla.dias);
        await expect(page.getByRole('heading', { level: 3, name: /Vie 30\/10.*Hoy/ })).toHaveCount(1);
        const lista = page.getByRole('list', { name: 'Huecos del Vie 30/10' });
        await expect(lista).toBeVisible();
        expect(await lista.getByRole('listitem').count(), 'el día con grilla tiene huecos').toBeGreaterThan(0);
        expect(await lista.getByRole('button').count(), 'los huecos tienen su acción').toBeGreaterThan(0);
        await expect(page.getByText('No hay huecos este día').first()).toBeVisible(); // sábado y domingo no tienen grilla
        await expect(calendario(page)).toHaveCount(0);
        expect(lecturas.rangos, 'la lista reusa la lectura de la Semana').toHaveLength(1);
      }, { esperado: `Un h3 por día (${pantalla.dias}), «Vie 30/10 · Hoy» con su lista de huecos y acciones; sábado y domingo sin huecos; sin releer` });

      await cu.paso('Volver al calendario', async () => {
        await page.getByRole('button', { name: 'Ver como calendario' }).click();
        await expect(columnas(page)).toHaveCount(pantalla.dias);
        await expect(page.getByRole('heading', { level: 3 })).toHaveCount(0);
      }, { esperado: 'La grilla vuelve con sus columnas' });
      await ctx.close();
    });

    test(`T-CA-85-02 CA-85 INV-02 SEC-34 [${pantalla.nombre}] cada profesor ve solo su agenda en Día y Semana`, async ({ browser, evidencia }) => {
      test.setTimeout(240_000);
      const cu = evidencia({ cu: cuDe('WEB-15-semana-ca85'), titulo: `Calendario: dos profesores, Día y Semana (${pantalla.nombre})`, criterios: ['CA-85', 'INV-02', 'SEC-34', 'WEB-15'], bolt: 'B20' });
      await ponerGrilla(laborables());
      const alA = await alumna('Alumna Sem Uno', SLUG_A);
      const alB = await alumna('Alumna Sem Dos', SLUG_B);
      await crearClaseDe(SLUG_A, alA, '2026-10-30', '12:00', 60);
      await crearClaseDe(SLUG_B, alB, '2026-10-30', '12:00', 60);

      for (const quien of [
        { clave: 'A', sesion: SESION_A, propia: 'Alumna Sem Uno', ajena: 'Alumna Sem Dos', idAjeno: alB },
        { clave: 'B', sesion: SESION_B, propia: 'Alumna Sem Dos', ajena: 'Alumna Sem Uno', idAjeno: alA },
      ]) {
        const { ctx, page } = await contexto(browser, pantalla, { ahora: VIERNES, sesion: quien.sesion });
        const lecturas = espiar(page);
        for (const vista of ['dia', 'semana'] as const) {
          await cu.paso(`Sesión del profesor ${quien.clave}: vista ${vista === 'dia' ? 'Día' : 'Semana'}`, async () => {
            await abrir(page, `#/panel?v=${vista}&d=2026-10-30`);
            await expect(page.getByRole('button', { name: new RegExp(`Confirmada, .*${quien.propia}`) })).toHaveCount(1);
            await expect(page.getByText(quien.ajena)).toHaveCount(0);
            await expect(page.getByRole('button', { name: new RegExp(quien.ajena) })).toHaveCount(0);
            await expect.poll(() => lecturas.respuestas.length).toBeGreaterThan(0);
            for (const cuerpo of lecturas.respuestas) {
              expect(cuerpo, 'la respuesta de la base no trae nada del otro profesor').not.toContain(quien.ajena);
              expect(cuerpo).not.toContain(quien.idAjeno);
            }
            test.info().annotations.push({ type: `profesor ${quien.clave} ${vista}`, description: `respuestas=${lecturas.respuestas.length}; rango ${JSON.stringify(lecturas.rangos.at(-1))}` });
          }, { esperado: `Solo el bloque de «${quien.propia}»; ningún dato de «${quien.ajena}» en pantalla ni en la respuesta de agenda_profesor_dias` });
        }
        await ctx.close();
      }
    });
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Casos de una sola pantalla
// ---------------------------------------------------------------------------------------------------------------------
const ESC = PANTALLAS[0];
const CEL = PANTALLAS[1];

test.describe('calendario Semana · escritorio · navegación', () => {
  test('T-CA-68-02 CA-68 CAL-03 [escritorio] las flechas cambian de a una semana y «Hoy» vuelve; una lectura por semana', async ({ browser, evidencia }) => {
    test.setTimeout(180_000);
    const cu = evidencia({ cu: 'WEB-15-semana-ca68-esc', titulo: 'Calendario Semana: flechas y «Hoy» (escritorio)', criterios: ['CA-68', 'CAL-03', 'A11Y-49', 'WEB-15'], bolt: 'B20' });
    const { ctx, page } = await contexto(browser, ESC, { ahora: VIERNES });
    const lecturas = espiar(page);

    await cu.paso('Semana siguiente', async () => {
      await abrir(page, '#/panel?v=semana&d=2026-10-30');
      await expect(h2(page, '26/10/2026 - 01/11/2026')).toBeVisible();
      await nav(page).getByRole('button', { name: 'Semana siguiente' }).click();
      await expect(h2(page, '02/11/2026 - 08/11/2026')).toBeVisible();
      await expect(encabezado(page, 'Lun 02/11')).toHaveCount(1);
      await expect(columnas(page)).toHaveCount(7);
      await expect.poll(() => lecturas.rangos.length).toBe(2);
    }, { esperado: 'Pasa a la semana 02/11 a 08/11 con una lectura más (2 en total)' });

    await cu.paso('Semana anterior dos veces', async () => {
      await nav(page).getByRole('button', { name: 'Semana anterior' }).click();
      await expect(h2(page, '26/10/2026 - 01/11/2026')).toBeVisible();
      await nav(page).getByRole('button', { name: 'Semana anterior' }).click();
      await expect(h2(page, '19/10/2026 - 25/10/2026')).toBeVisible();
      await expect.poll(() => lecturas.rangos.length).toBe(4);
    }, { esperado: 'Pasa a 26/10 a 01/11 y luego a 19/10 a 25/10; una lectura por semana (4 en total)' });

    await cu.paso('«Hoy»', async () => {
      await nav(page).getByRole('button', { name: 'Hoy' }).click();
      await expect(h2(page, '26/10/2026 - 01/11/2026')).toBeVisible();
      await expect(page.locator('button[aria-current="date"]')).toContainText('Vie 30/10');
      expect(page.url()).toContain('v=semana');
      test.info().annotations.push({ type: 'rangos pedidos', description: JSON.stringify(lecturas.rangos) });
    }, { esperado: 'Vuelve a la semana actual (26/10 a 01/11) y sigue en la vista Semana' });
    await ctx.close();
  });

  test('T-CA-68-04 CA-68 CAL-03 DEC-45 H-475 [escritorio] en el borde de hoy ± 366 la flecha se habilita si algún día queda dentro y lleva al primer día dentro', async ({ browser, evidencia }) => {
    test.setTimeout(240_000);
    const cu = evidencia({ cu: 'WEB-15-semana-ca68-borde-esc', titulo: 'Calendario Semana: bordes del rango (escritorio)', criterios: ['CA-68', 'CAL-03', 'DEC-45', 'A11Y-49', 'WEB-15'], bolt: 'B20' });
    await ponerGrilla(laborables());
    // Hoy = lunes 02/11/2026: hoy + 366 = miércoles 03/11/2027 y hoy - 366 = sábado 01/11/2025.
    const { ctx, page } = await contexto(browser, ESC, { ahora: LUNES });
    const lecturas = espiar(page);

    await cu.paso('Borde posterior: la flecha siguiente lleva al lunes 01/11/2027', async () => {
      await abrir(page, '#/panel?v=semana&d=2027-10-27');
      await expect(h2(page, '25/10/2027 - 31/10/2027')).toBeVisible();
      const siguiente = nav(page).getByRole('button', { name: 'Semana siguiente' });
      await expect(siguiente).toBeEnabled();
      await siguiente.click();
      await expect(h2(page, '01/11/2027 - 07/11/2027')).toBeVisible();
      expect(page.url()).toContain('d=2027-11-01');
      for (const d of ['Lun 01/11', 'Mar 02/11', 'Mié 03/11']) await expect(encabezado(page, d)).toHaveCount(1);
      for (const d of ['Jue 04/11', 'Vie 05/11', 'Sáb 06/11', 'Dom 07/11']) await expect(encabezadoFuera(page, d)).toBeDisabled();
      await expect(columnas(page), 'los días fuera se ven vacíos: sin columna con huecos').toHaveCount(3);
      await expect(nav(page).getByRole('button', { name: 'Semana siguiente, no disponible' })).toBeDisabled();
      await expect(nav(page).getByRole('button', { name: 'Semana anterior' })).toBeEnabled();
      const ultima = lecturas.rangos.at(-1)!;
      expect(ultima, 'no se piden días fuera del rango').toEqual({ desde: '2027-11-01', hasta: '2027-11-03' });
      expect(lecturas.rangos).toHaveLength(2);
    }, { esperado: 'La flecha se habilita, lleva a 01/11/2027, Jue a Dom quedan deshabilitados y vacíos, la siguiente queda no disponible y se pide solo 01/11 a 03/11 (una lectura)' });

    await cu.paso('Borde anterior: la flecha anterior lleva al sábado 01/11/2025', async () => {
      await abrir(page, '#/panel?v=semana&d=2025-11-05');
      await expect(h2(page, '03/11/2025 - 09/11/2025')).toBeVisible();
      const anterior = nav(page).getByRole('button', { name: 'Semana anterior' });
      await expect(anterior).toBeEnabled();
      const antes = lecturas.rangos.length;
      await anterior.click();
      await expect(h2(page, '27/10/2025 - 02/11/2025')).toBeVisible();
      expect(page.url()).toContain('d=2025-11-01');
      for (const d of ['Sáb 01/11', 'Dom 02/11']) await expect(encabezado(page, d)).toHaveCount(1);
      for (const d of ['Lun 27/10', 'Mar 28/10', 'Mié 29/10', 'Jue 30/10', 'Vie 31/10']) await expect(encabezadoFuera(page, d)).toBeDisabled();
      await expect(columnas(page)).toHaveCount(2);
      await expect(nav(page).getByRole('button', { name: 'Semana anterior, no disponible' })).toBeDisabled();
      await expect(nav(page).getByRole('button', { name: 'Semana siguiente' })).toBeEnabled();
      expect(lecturas.rangos.at(-1), 'no se piden días fuera del rango').toEqual({ desde: '2025-11-01', hasta: '2025-11-02' });
      expect(lecturas.rangos.length - antes, 'una lectura por la flecha').toBe(1);
    }, { esperado: 'La flecha anterior se habilita, lleva a 01/11/2025, Lun a Vie quedan deshabilitados y vacíos, la anterior queda no disponible y se pide solo 01/11 a 02/11' });

    await cu.paso('Un día fuera del rango no abre la vista Día', async () => {
      await expect(encabezadoFuera(page, 'Vie 31/10')).toBeDisabled();
      expect(page.url()).toContain('v=semana');
      await encabezado(page, 'Sáb 01/11').click();
      await expect(h2(page, '01/11/2025')).toBeVisible();
      expect(page.url()).toContain('v=dia');
    }, { esperado: 'El encabezado fuera de rango no se puede tocar; el de un día dentro abre la vista Día de ese día' });
    await ctx.close();
  });

  test('T-CA-80-01 CA-80 CAL-15 WEB-15 [escritorio] siete columnas lun a dom y tocar «Vie 30/10» abre la vista Día', async ({ browser, evidencia }) => {
    test.setTimeout(180_000);
    const cu = evidencia({ cu: 'WEB-15-semana-ca80-esc', titulo: 'Calendario Semana: encabezados que abren Día (escritorio)', criterios: ['CA-80', 'CAL-15', 'WEB-15'], bolt: 'B20' });
    await ponerGrilla(laborables());
    const { ctx, page } = await contexto(browser, ESC, { ahora: VIERNES });

    await cu.paso('Ver los siete encabezados', async () => {
      await abrir(page, '#/panel?v=semana&d=2026-10-26');
      await expect(columnas(page)).toHaveCount(7);
      const nombres = await page.locator('button[aria-label^="Abrir el "]').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')));
      expect(nombres).toEqual([
        'Abrir el Lun 26/10, vista Día',
        'Abrir el Mar 27/10, vista Día',
        'Abrir el Mié 28/10, vista Día',
        'Abrir el Jue 29/10, vista Día',
        'Abrir el Vie 30/10, hoy, vista Día',
        'Abrir el Sáb 31/10, vista Día',
        'Abrir el Dom 01/11, vista Día',
      ]);
      await expect(page.locator('button[aria-current="date"]')).toHaveCount(1);
    }, { esperado: 'Siete encabezados de lunes a domingo («Lun 26/10» a «Dom 01/11»); el de hoy dice «Hoy»' });

    await cu.paso('Tocar «Vie 30/10»', async () => {
      await encabezado(page, 'Vie 30/10').click();
      await expect(h2(page, '30/10/2026')).toBeVisible();
      expect(page.url()).toContain('v=dia');
      expect(page.url()).toContain('d=2026-10-30');
      await expect(columnas(page)).toHaveCount(1);
      await expect(page.getByRole('button', { name: 'Día', exact: true })).toHaveAttribute('aria-pressed', 'true');
    }, { esperado: 'Se abre la vista Día del 30/10/2026' });
    await ctx.close();
  });
});

test.describe('calendario Semana · 360 px · ventana de 3 días', () => {
  test('T-CA-81-01 CA-81 CAL-16 NFR-12 [360 px] 3 días; la flecha y el deslizamiento a la izquierda corren 3 días; sin desplazamiento horizontal', async ({ browser, evidencia }) => {
    test.setTimeout(240_000);
    const cu = evidencia({ cu: 'WEB-15-semana-ca81-360', titulo: 'Calendario Semana: ventana de 3 días (360 px)', criterios: ['CA-81', 'CAL-16', 'NFR-12', 'A11Y-44', 'WEB-15'], bolt: 'B20' });
    await ponerGrilla(laborables());
    const { ctx, page } = await contexto(browser, CEL, { ahora: VIERNES, tactil: true });
    const lecturas = espiar(page);
    const ventana = async (dias: string[]) => {
      for (const d of dias) await expect(encabezado(page, d)).toHaveCount(1);
      await expect(page.locator('button[aria-label^="Abrir el "]')).toHaveCount(3);
      await expect(columnas(page)).toHaveCount(3);
      expect(await sinDesplazamientoHorizontal(page), 'sin desplazamiento horizontal').toBe(true);
    };

    await cu.paso('Abrir la Semana a 360 px', async () => {
      await abrir(page, '#/panel?v=semana&d=2026-10-30');
      await ventana(['Vie 30/10', 'Sáb 31/10', 'Dom 01/11']);
      await expect(nav(page).getByRole('button', { name: '3 días anteriores' })).toBeVisible();
      await expect(nav(page).getByRole('button', { name: '3 días siguientes' })).toBeVisible();
      expect(lecturas.rangos).toHaveLength(1);
    }, { esperado: 'Tres días (30/10, 31/10, 01/11), flechas «3 días anteriores/siguientes», sin desplazamiento horizontal, una lectura' });

    await cu.paso('Flecha «3 días siguientes»', async () => {
      await nav(page).getByRole('button', { name: '3 días siguientes' }).click();
      await ventana(['Lun 02/11', 'Mar 03/11', 'Mié 04/11']);
      expect(page.url()).toContain('d=2026-11-02');
      await expect.poll(() => lecturas.rangos.length).toBe(2);
    }, { esperado: 'La ventana corre 3 días: 02/11, 03/11, 04/11 con una lectura más' });

    await cu.paso('Deslizar a la izquierda', async () => {
      await deslizar(page, 'izquierda');
      await ventana(['Jue 05/11', 'Vie 06/11', 'Sáb 07/11']);
      expect(page.url()).toContain('d=2026-11-05');
      await expect.poll(() => lecturas.rangos.length).toBe(3);
    }, { esperado: 'El deslizamiento táctil a la izquierda corre otros 3 días: 05/11, 06/11, 07/11' });

    await cu.paso('Deslizar a la derecha y flecha «3 días anteriores»', async () => {
      await deslizar(page, 'derecha');
      await ventana(['Lun 02/11', 'Mar 03/11', 'Mié 04/11']);
      await nav(page).getByRole('button', { name: '3 días anteriores' }).click();
      await ventana(['Vie 30/10', 'Sáb 31/10', 'Dom 01/11']);
      await expect.poll(() => lecturas.rangos.length).toBe(5);
      test.info().annotations.push({ type: 'rangos pedidos', description: JSON.stringify(lecturas.rangos) });
    }, { esperado: 'Volver: el deslizamiento a la derecha y la flecha anterior corren 3 días hacia atrás; una lectura por ventana (5 en total)' });
    await ctx.close();
  });

  test('T-CA-90-01 CA-90 NFR-12 A11Y-44 [360 px] Semana: botones, encabezados y huecos de al menos 44 px (excepción H-472)', async ({ browser, evidencia }) => {
    test.setTimeout(180_000);
    const cu = evidencia({ cu: 'WEB-15-semana-ca90-360', titulo: 'Calendario Semana: objetivos táctiles (360 px)', criterios: ['CA-90', 'NFR-12', 'A11Y-44', 'WEB-15'], bolt: 'B20' });
    await ponerGrilla(laborables());
    const al = await alumna('Alumna Tactil');
    await crearClaseDe(SLUG_A, al, '2026-10-30', '12:00', 60);
    const { ctx, page } = await contexto(browser, CEL, { ahora: VIERNES });

    await cu.paso('Medir los controles de la Semana', async () => {
      await abrir(page, '#/panel?v=semana&d=2026-10-30');
      const cajas = async (loc: ReturnType<Page['locator']>) => loc.evaluateAll((els) => els.map((e) => ({ n: e.getAttribute('aria-label') ?? e.textContent ?? '', w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height })));
      const controles = [
        ...(await cajas(nav(page).locator('button'))),
        ...(await cajas(page.locator('button[aria-label^="Abrir el "]'))),
        ...(await cajas(page.getByRole('button', { name: 'Ver como lista' }))),
      ];
      expect(controles.length).toBeGreaterThanOrEqual(6);
      const chicos = controles.filter((c) => c.w < 43.5 || c.h < 43.5);
      expect(chicos, 'botones, flechas y encabezados de al menos 44 x 44 px').toEqual([]);

      // Huecos: «Vie 30/10, 13:00 a 17:00, Libre». Desde 10 min de duración, al menos 44 px de alto; debajo de eso, excepción H-472.
      const todos = await cajas(huecos(page));
      expect(todos.length).toBeGreaterThan(0);
      const minutos = (n: string) => {
        const m = /(\d\d):(\d\d) a (\d\d):(\d\d)/.exec(n);
        return m ? Number(m[3]) * 60 + Number(m[4]) - (Number(m[1]) * 60 + Number(m[2])) : 0;
      };
      const cortos = todos.filter((h) => minutos(h.n) < 10);
      const normales = todos.filter((h) => minutos(h.n) >= 10);
      expect(normales.filter((h) => h.h < 43.5 || h.w < 43.5), 'huecos de 10 min o más: al menos 44 x 44 px').toEqual([]);
      test.info().annotations.push({
        type: 'H-472',
        description: `Excepción: debajo de 10 min un hueco puede medir menos de 44 px (alternativa «Ver como lista», ADR-024 A-2). Huecos medidos: ${todos.length}; de menos de 10 min: ${cortos.length} ${JSON.stringify(cortos)}`,
      });
      test.info().annotations.push({ type: 'medidas', description: JSON.stringify({ controles, huecos: todos.slice(0, 6) }) });
      expect(await sinDesplazamientoHorizontal(page)).toBe(true);
    }, { esperado: 'Flechas, «Hoy», encabezados y «Ver como lista» de al menos 44 x 44 px; huecos de 10 min o más de al menos 44 x 44 px (debajo de 10 min, excepción H-472)' });
    await ctx.close();
  });
});

const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
/** Un miércoles a 8 o más días de hoy (hoy real, huso del profesor). */
function proximoMiercoles(): string {
  const d = new Date(Date.now() + 8 * 86_400_000);
  while (new Date(fmtDia.format(d) + 'T12:00:00Z').getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  return fmtDia.format(d);
}

// ---------------------------------------------------------------------------------------------------------------------
// SEC-37: la última, porque cierra la sesión de A
// ---------------------------------------------------------------------------------------------------------------------
test('T-SEC-37-01 SEC-37 INV-02 [escritorio] sesión de A en Día y Semana, cierre de sesión e inicio de la de B en la misma pestaña: B no ve nada de A y el navegador no guarda agenda', async ({ browser, evidencia }) => {
  test.setTimeout(300_000);
  const cu = evidencia({ cu: 'WEB-15-semana-sec37-esc', titulo: 'Calendario: cambio de profesor en la misma pestaña (escritorio)', criterios: ['SEC-37', 'INV-02', 'SEC-34', 'WEB-15'], bolt: 'B20' });
  await ponerGrilla(laborables());
  const dia = proximoMiercoles();
  const alA = await alumna('Alumna Sec Uno', SLUG_A);
  const alB = await alumna('Alumna Sec Dos', SLUG_B);
  await crearClaseDe(SLUG_A, alA, dia, '12:00', 60);
  await crearClaseDe(SLUG_B, alB, dia, '13:00', 60);
  // Sin reloj fijado: el desafío de seguridad (Turnstile) del ingreso de B falla con el desfase de Date. Día real (huso del profesor).
  const { ctx, page } = await contexto(browser, ESC);

  /** Nada de agenda en el navegador: ni claves de agenda ni nombres, horas o ids de las clases (la sesión de Auth sí puede estar). */
  const sinAgendaEnElNavegador = async (paso: string) => {
    const a = await almacenes(page);
    const filas = [...a.local, ...a.sesion];
    const agenda = filas.filter(([k, v]) => /agenda|clase|hueco|reserva|bloqueo|calendario/i.test(k) || /Alumna Sec|T05 |"inicio"|clase_id/.test(v));
    test.info().annotations.push({ type: `almacenes ${paso}`, description: `claves: ${JSON.stringify(filas.map(([k]) => k))}` });
    expect(agenda, `localStorage y sessionStorage sin filas de agenda (${paso})`).toEqual([]);
  };
  const veSoloLoPropio = async (propia: string, ajena: string) => {
    for (const vista of ['dia', 'semana'] as const) {
      await abrir(page, `#/panel?v=${vista}&d=${dia}`);
      await expect(page.getByRole('button', { name: new RegExp(`Confirmada, .*${propia}`) })).toHaveCount(1);
      await expect(page.getByText(ajena)).toHaveCount(0);
    }
  };

  await cu.paso('Sesión de A: Día y Semana', async () => {
    await veSoloLoPropio('Alumna Sec Uno', 'Alumna Sec Dos');
    await sinAgendaEnElNavegador('A en Semana');
    await abrir(page, `#/panel?v=dia&d=${dia}`);
    await sinAgendaEnElNavegador('A en Día');
  }, { esperado: 'A ve su clase en Día y Semana; localStorage y sessionStorage no tienen filas de agenda' });

  await cu.paso('A cierra la sesión', async () => {
    await abrir(page, `#/panel?v=semana&d=${dia}`);
    await page.getByRole('button', { name: 'Salir' }).click();
    await expect(page.getByRole('heading', { name: 'Panel', level: 1 })).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText('Alumna Sec Uno')).toHaveCount(0);
    await sinAgendaEnElNavegador('tras Salir');
  }, { esperado: 'Tras «Salir» no queda la agenda de A a la vista y el navegador no guarda filas de agenda' });

  await cu.paso('B inicia sesión en la misma pestaña', async () => {
    await entrar(page, MAIL_PROFESOR_B);
    await expect(page.getByText('Alumna Sec Uno')).toHaveCount(0);
    await veSoloLoPropio('Alumna Sec Dos', 'Alumna Sec Uno');
    await sinAgendaEnElNavegador('B en Día y Semana');
  }, { esperado: 'B ve solo su clase en Día y Semana, nada de A; sin filas de agenda en el navegador' });

  await cu.paso('B relee la Semana', async () => {
    await page.reload();
    await expect(calendario(page)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Confirmada, .*Alumna Sec Dos/ })).toHaveCount(1);
    await expect(page.getByText('Alumna Sec Uno')).toHaveCount(0);
    await sinAgendaEnElNavegador('B tras recargar');
    await abrir(page, `#/panel?v=dia&d=${dia}`);
    await expect(page.getByText('Alumna Sec Uno')).toHaveCount(0);
  }, { esperado: 'Tras recargar, B sigue sin ver nada de A y el navegador sin filas de agenda' });
  await ctx.close();
});
