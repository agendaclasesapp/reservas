// E2E de la vista Día del calendario del Panel (B17, T17.3): CAL-01, CAL-03, CAL-04, CAL-07, CAL-08, CAL-09, CAL-19 ·
// CA-67 (rama Día), CA-68 (rama Día), CA-69, CA-72 (rama Día), CA-73, CA-83 (rama Día) · INV-01, INV-05.
// Cada caso corre en escritorio (1280x900) y a 360 px de ancho. Reloj real (el JWT vence con la hora real); fechas relativas a
// hoy en el huso del profesor. Datos sintéticos con prefijo `T05 `, que se limpian; la grilla del profesor A se guarda y se
// restaura después de cada prueba. Semana es de B20: aquí solo la vista Día.
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { expect, test } from '../soporte/evidencia';
import { cerrar, sql } from '../soporte/bd';
import { SITEKEY_PRUEBA } from '../soporte/captcha';
import { esperarMail, contarMails } from '../soporte/correo';
import { entorno, RAIZ } from '../soporte/entorno';
import { MAIL_PROFESOR, SLUG_A } from '../soporte/usuarios';
import { crearAlumno, limpiarT05, mailT05 } from '../integracion/cuentas/ayuda';

const BASE = process.env.RTC_BASE ?? '/reservas/';
const ORIGEN = process.env.BASE_URL ?? `http://127.0.0.1:${process.env.RTC_PREVIEW_PORT || '4173'}`;
const TZ = 'America/Montevideo';
const SESION = resolve(RAIZ, 'node_modules', '.cache', 'calendario-dia', 'sesion-profesor.json');

const PANTALLAS = [
  { nombre: 'escritorio', sufijo: 'esc', viewport: { width: 1280, height: 900 } },
  { nombre: '360 px', sufijo: '360', viewport: { width: 360, height: 740 } },
] as const;

// ---------------------------------------------------------------------------------------------------------------------
// Fechas (huso del profesor) y datos
// ---------------------------------------------------------------------------------------------------------------------
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
/** Día `YYYY-MM-DD` a `n` días de hoy (huso de Montevideo). */
const hoyMasDias = (n: number) => fmt.format(new Date(Date.now() + n * 86_400_000));
/** `dd/mm/aaaa`: el título del día en la barra del calendario. */
const titulo = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;
/** Un miércoles a 8 o más días de hoy. */
function miercoles(): string {
  const d = new Date(Date.now() + 8 * 86_400_000);
  while (new Date(fmt.format(d) + 'T12:00:00Z').getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  return fmt.format(d);
}

type EstadoClase = 'confirmada' | 'pendiente' | 'cancelada' | 'rechazada';
/**
 * Una clase de `minutos` minutos que empieza a las `hora` (HH:MM, huso de Montevideo) del `dia`, con su reserva y, si la clase
 * es `pendiente` o `rechazada`, la solicitud de reserva que la originó (H-371).
 */
async function crearClaseDe(alumnoId: string, dia: string, hora: string, minutos: number, estado: EstadoClase): Promise<string> {
  const inicio = `${dia}T${hora}:00-03:00`;
  const deSolicitud = estado === 'pendiente' || estado === 'rechazada';
  const [r] = await sql<{ id: string }>(
    `insert into public.reserva (profesor_id, alumno_id, tipo, hora_local, dia_semana, duracion_min, estado, desde, origen)
     values ((select id from public.profesor where slug = $1), $2, 'suelta',
             (($3::timestamptz) at time zone '${TZ}')::time,
             extract(isodow from ($3::timestamptz) at time zone '${TZ}')::smallint,
             $4, $5, (($3::timestamptz) at time zone '${TZ}')::date, $6) returning id`,
    [SLUG_A, alumnoId, inicio, minutos, estado, deSolicitud ? 'solicitud' : 'profesor'],
  );
  const [c] = await sql<{ id: string }>(
    `insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado)
     values ((select id from public.profesor where slug = $1), $2, $3, $4::timestamptz, $4::timestamptz + ($5::int * interval '1 minute'), $6) returning id`,
    [SLUG_A, r.id, alumnoId, inicio, minutos, estado],
  );
  if (deSolicitud) {
    await sql(
      `insert into public.solicitud (profesor_id, alumno_id, tipo, reserva_id, fecha_clase, estado, respondida_en)
       values ((select id from public.profesor where slug = $1), $2, 'reserva', $3, $4::timestamptz, $5, $6)`,
      [SLUG_A, alumnoId, r.id, inicio, estado, estado === 'rechazada' ? new Date().toISOString() : null],
    );
  }
  return c.id;
}
const alumna = (nombre: string) => crearAlumno({ nombre, estado: 'aprobado', telefono: '+598 99555333', mail: mailT05('e2e.caldia') });

let grillaOriginal: { dia_semana: number; desde: string; hasta: string }[] = [];
async function leerGrilla() {
  return sql<{ dia_semana: number; desde: string; hasta: string }>(
    `select dia_semana::int, desde::text, hasta::text from public.grilla_tramo where profesor_id = (select id from public.profesor where slug = $1)`,
    [SLUG_A],
  );
}
async function ponerGrilla(tramos: { dia_semana: number; desde: string; hasta: string }[]) {
  const p = `(select id from public.profesor where slug = $1)`;
  await sql(`delete from public.grilla_tramo where profesor_id = ${p}`, [SLUG_A]);
  for (const t of tramos) {
    await sql(`insert into public.grilla_tramo (profesor_id, dia_semana, desde, hasta) values (${p}, $2, $3, $4)`, [SLUG_A, t.dia_semana, t.desde, t.hasta]);
  }
}
/** Los mismos tramos de lunes a viernes. */
const laborables = (...tramos: [string, string][]) => [1, 2, 3, 4, 5].flatMap((dia_semana) => tramos.map(([desde, hasta]) => ({ dia_semana, desde, hasta })));

async function limpiar() {
  await sql(`update public.profesor set activo = true where slug = $1`, [SLUG_A]);
  await sql(`delete from public.solicitud where alumno_id in (select id from public.alumno where nombre like 'T05 %')`);
  await limpiarT05();
  if (grillaOriginal.length > 0) await ponerGrilla(grillaOriginal);
}

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
async function guardarSesion(browser: Browser) {
  mkdirSync(resolve(RAIZ, 'node_modules', '.cache', 'calendario-dia'), { recursive: true });
  const ctx = await browser.newContext({ locale: 'es-UY', timezoneId: TZ, storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await entrar(page, MAIL_PROFESOR);
  await ctx.storageState({ path: SESION });
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
  await guardarSesion(browser);
});
test.afterEach(limpiar);
test.afterAll(cerrar);

// ---------------------------------------------------------------------------------------------------------------------
// Localizadores y utilidades de página
// ---------------------------------------------------------------------------------------------------------------------
const h2Dia = (page: Page, dia: string) => page.getByRole('heading', { level: 2, name: titulo(dia) });
const calendario = (page: Page) => page.getByRole('group', { name: /^Calendario, / });
/** Solo los bloques de clase (confirmada o pendiente): desde B18 la columna también tiene huecos libres y bloqueos. */
const bloques = (page: Page) => calendario(page).locator('ul[aria-label^="Clases del"] > li').filter({ hasText: /Confirmada|Pendiente/ });
const etiquetasEje = (page: Page) => calendario(page).locator('time').allTextContents();
const hueco = (page: Page, prefijo: string) => page.getByRole('button', { name: new RegExp(`^${prefijo}`) });
const horas = (desde: number, hasta: number) => Array.from({ length: hasta - desde + 1 }, (_, i) => `${String(desde + i).padStart(2, '0')}:00`);

/** Abre una dirección del Panel y espera el calendario (o el encabezado, si el calendario no es lo esperado). */
async function abrir(page: Page, hash: string) {
  await page.goto('about:blank'); // carga completa: un cambio de hash en la misma página no vuelve a leer la configuración
  await page.goto(`${ORIGEN}${BASE}${hash}`);
  await expect(page.getByRole('heading', { name: 'Panel', level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect(calendario(page)).toBeVisible({ timeout: 30_000 });
}
const sinDesplazamientoHorizontal = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

for (const pantalla of PANTALLAS) {
  test.describe(`calendario Día · ${pantalla.nombre}`, () => {
    async function sesion(browser: Browser) {
      const ctx = await browser.newContext({ locale: 'es-UY', timezoneId: TZ, storageState: SESION, viewport: pantalla.viewport });
      return { ctx, page: await ctx.newPage() };
    }
    const cuDe = (base: string) => `${base}-${pantalla.sufijo}`;

    test(`T-CA-67-01 T-CA-67-03 CA-67 CAL-01 [${pantalla.nombre}] el Panel abre en el calendario Día de hoy; una vista o un día inválidos también`, async ({ browser, evidencia }) => {
      test.setTimeout(180_000);
      const cu = evidencia({ cu: cuDe('WEB-14-dia-ca67'), titulo: `Calendario Día: vista inicial y direcciones (${pantalla.nombre})`, criterios: ['CA-67', 'CAL-01', 'CAL-02', 'WEB-14'], bolt: 'B17' });
      const hoy = hoyMasDias(0);
      const otro = hoyMasDias(10);
      const { ctx, page } = await sesion(browser);

      await cu.paso('Abrir #/panel sin parámetros', async () => {
        await abrir(page, '#/panel');
        await expect(h2Dia(page, hoy)).toBeVisible();
        await expect(page.getByRole('button', { name: 'Ver como lista' })).toBeVisible();
        await expect(page.getByRole('list', { name: 'Huecos del día' })).toHaveCount(0);
        expect(await sinDesplazamientoHorizontal(page), 'sin desplazamiento horizontal').toBe(true);
      }, { esperado: `Se ve el calendario Día de hoy (${titulo(hoy)}), el botón «Ver como lista» y no la lista de huecos` });

      await cu.paso('Abrir #/panel?v=otra', async () => {
        await abrir(page, `#/panel?d=${otro}`);
        await expect(h2Dia(page, otro)).toBeVisible();
        await abrir(page, '#/panel?v=otra');
        await expect(h2Dia(page, hoy)).toBeVisible();
      }, { esperado: 'Una vista desconocida abre el calendario Día de hoy' });

      await cu.paso('Abrir #/panel?v=dia&d=basura', async () => {
        await abrir(page, `#/panel?d=${otro}`);
        await expect(h2Dia(page, otro)).toBeVisible();
        await abrir(page, '#/panel?v=dia&d=basura');
        await expect(h2Dia(page, hoy)).toBeVisible();
      }, { esperado: 'Un día inválido abre el calendario Día de hoy' });

      await cu.paso('Abrir #/panel?d=<día> sin la vista', async () => {
        await abrir(page, `#/panel?d=${otro}`);
        await expect(h2Dia(page, otro)).toBeVisible();
        await expect(page.getByRole('button', { name: 'Día siguiente' })).toBeEnabled();
      }, { esperado: `Con solo «?d=» se abre el calendario Día de ese día (${titulo(otro)})` });

      await cu.paso('Semana todavía es de B20: ?v=semana abre Día', async () => {
        await abrir(page, `#/panel?v=semana&d=${otro}`);
        await expect(h2Dia(page, otro)).toBeVisible();
      }, { esperado: 'Hasta B20, «v=semana» abre la vista Día de ese día' });
      await ctx.close();
    });

    test(`T-CA-68-01 T-CA-68-03 CA-68 CAL-03 [${pantalla.nombre}] navegar por días y la flecha siguiente deshabilitada en hoy + 366`, async ({ browser, evidencia }) => {
      test.setTimeout(180_000);
      const cu = evidencia({ cu: cuDe('WEB-14-dia-ca68'), titulo: `Calendario Día: navegar por días y límite del rango (${pantalla.nombre})`, criterios: ['CA-68', 'CAL-03', 'A11Y-49', 'WEB-14'], bolt: 'B17' });
      const hoy = hoyMasDias(0);
      const { ctx, page } = await sesion(browser);
      const nav = () => page.getByRole('navigation', { name: 'Navegación del calendario' });

      await cu.paso('Flecha siguiente, «Hoy» y flecha anterior', async () => {
        await abrir(page, '#/panel');
        await expect(h2Dia(page, hoy)).toBeVisible();
        await nav().getByRole('button', { name: 'Día siguiente' }).click();
        await expect(h2Dia(page, hoyMasDias(1))).toBeVisible();
        await expect(calendario(page)).toBeVisible();
        await nav().getByRole('button', { name: 'Hoy' }).click();
        await expect(h2Dia(page, hoy)).toBeVisible();
        await nav().getByRole('button', { name: 'Día anterior' }).click();
        await expect(h2Dia(page, hoyMasDias(-1))).toBeVisible();
        await expect(page.getByLabel('Elegir día')).toHaveCount(1); // repuesto en B18 (H-B17-03)
      }, { esperado: `«Día siguiente» pasa a ${titulo(hoyMasDias(1))}, «Hoy» vuelve a ${titulo(hoy)} y «Día anterior» va a ${titulo(hoyMasDias(-1))}; el campo «Elegir día» está presente (H-B17-03)` });

      await cu.paso('En hoy + 366 la flecha siguiente está deshabilitada y la anterior no', async () => {
        await abrir(page, `#/panel?d=${hoyMasDias(365)}`);
        await expect(nav().getByRole('button', { name: 'Día siguiente', exact: true })).toBeEnabled();
        await nav().getByRole('button', { name: 'Día siguiente', exact: true }).click();
        await expect(h2Dia(page, hoyMasDias(366))).toBeVisible();
        await expect(nav().getByRole('button', { name: 'Día siguiente, no disponible' })).toBeDisabled();
        await expect(nav().getByRole('button', { name: 'Día anterior', exact: true })).toBeEnabled();
      }, { esperado: 'En hoy + 366 «Día siguiente, no disponible» está deshabilitada y «Día anterior» habilitada' });

      await cu.paso('En hoy − 366 la flecha anterior está deshabilitada y la siguiente no', async () => {
        await abrir(page, `#/panel?d=${hoyMasDias(-366)}`);
        await expect(h2Dia(page, hoyMasDias(-366))).toBeVisible();
        await expect(nav().getByRole('button', { name: 'Día anterior, no disponible' })).toBeDisabled();
        await expect(nav().getByRole('button', { name: 'Día siguiente', exact: true })).toBeEnabled();
      }, { esperado: 'En hoy − 366 «Día anterior, no disponible» está deshabilitada y «Día siguiente» habilitada' });
      await ctx.close();
    });

    test(`T-CA-69-01 T-CA-69-02 T-CA-69-03 CA-69 CAL-04 [${pantalla.nombre}] el eje sale de la grilla y se extiende para cubrir una clase fuera de ella (DEC-44 A)`, async ({ browser, evidencia }) => {
      test.setTimeout(240_000);
      const cu = evidencia({ cu: cuDe('WEB-14-dia-ca69'), titulo: `Calendario Día: eje de horas (${pantalla.nombre})`, criterios: ['CA-69', 'CAL-04', 'DEC-44', 'WEB-14'], bolt: 'B17' });
      const dia = miercoles();
      const { ctx, page } = await sesion(browser);

      await cu.paso('Con la grilla inicial el eje va de 08:00 a 18:00', async () => {
        await ponerGrilla(laborables(['08:00', '13:00'], ['14:00', '18:00']));
        await abrir(page, `#/panel?d=${dia}`);
        expect(await etiquetasEje(page)).toEqual(horas(8, 18));
      }, { esperado: 'El eje muestra una etiqueta por hora, de 08:00 a 18:00' });

      await cu.paso('Con un tramo 07:30-12:15 el eje va de 07:00 a 13:00', async () => {
        await ponerGrilla(laborables(['07:30', '12:15']));
        await abrir(page, `#/panel?d=${dia}`);
        expect(await etiquetasEje(page)).toEqual(horas(7, 13));
      }, { esperado: 'El eje va de 07:00 (hora en punto anterior a 07:30) a 13:00 (posterior a 12:15)' });

      await cu.paso('Una clase confirmada a las 19:30 fuera de la grilla extiende el eje hasta 21:00', async () => {
        await ponerGrilla(laborables(['08:00', '13:00'], ['14:00', '18:00']));
        const alumnoId = await alumna('Alumna Cal Tarde');
        await crearClaseDe(alumnoId, dia, '19:30', 60, 'confirmada');
        await abrir(page, `#/panel?d=${dia}`);
        expect(await etiquetasEje(page)).toEqual(horas(8, 21));
        await expect(bloques(page)).toHaveCount(1);
        await expect(bloques(page).first()).toContainText(/Confirmada/i);
        await expect(bloques(page).first()).toContainText(/Alumna Cal Tarde/);
        const caja = await bloques(page).first().boundingBox();
        const grupo = await calendario(page).boundingBox();
        expect(caja && grupo && caja.y >= grupo.y && caja.y + caja.height <= grupo.y + grupo.height + 1, 'la clase queda dentro del calendario').toBe(true);
      }, { esperado: 'El eje se extiende hasta 21:00 y la clase de las 19:30 se dibuja dentro del calendario' });
      await ctx.close();
    });

    test(`T-CA-72-02 T-CA-72-03 CA-72 CAL-07 CAL-08 [${pantalla.nombre}] una clase de 60 min mide el doble que una de 30 y una solicitud de reserva se ve PENDIENTE (DEC-42 A)`, async ({ browser, evidencia }) => {
      test.setTimeout(240_000);
      const cu = evidencia({ cu: cuDe('WEB-14-dia-ca72'), titulo: `Calendario Día: bloques CONFIRMADA y PENDIENTE (${pantalla.nombre})`, criterios: ['CA-72', 'CAL-07', 'CAL-08', 'DEC-42', 'DEC-50', 'WEB-14'], bolt: 'B17' });
      const dia = miercoles();
      const larga = await alumna('Alumna Cal Larga');
      const corta = await alumna('Alumna Cal Corta');
      const pendiente = await alumna('Alumna Cal Pendiente');
      await crearClaseDe(larga, dia, '10:00', 60, 'confirmada');
      await crearClaseDe(corta, dia, '14:00', 30, 'confirmada');
      await crearClaseDe(pendiente, dia, '16:00', 60, 'pendiente');
      const { ctx, page } = await sesion(browser);

      await cu.paso('Abrir el día con tres clases', async () => {
        await abrir(page, `#/panel?d=${dia}`);
        await expect(bloques(page)).toHaveCount(3);
        expect(await sinDesplazamientoHorizontal(page), 'sin desplazamiento horizontal').toBe(true);
      }, { esperado: 'El calendario dibuja tres bloques: dos confirmados y uno pendiente' });

      await cu.paso('La clase de 60 min mide el doble que la de 30 min', async () => {
        const alta = await bloques(page).filter({ hasText: 'Alumna Cal Larga' }).boundingBox();
        const baja = await bloques(page).filter({ hasText: 'Alumna Cal Corta' }).boundingBox();
        expect(alta && baja, 'ambos bloques tienen caja').toBeTruthy();
        const razon = alta!.height / baja!.height;
        test.info().annotations.push({ type: 'alto 60 min / alto 30 min', description: `${alta!.height} / ${baja!.height} = ${razon.toFixed(3)}` });
        expect(razon).toBeGreaterThan(1.9);
        expect(razon).toBeLessThan(2.1);
        expect(baja!.height, 'el bloque de 30 min mide al menos 44 px (DEC-50 A)').toBeGreaterThanOrEqual(43.5);
      }, { esperado: 'Alto(60 min) = 2 x alto(30 min) (con una tolerancia del 5 %) y ningún bloque baja de 44 px' });

      await cu.paso('La confirmada dice CONFIRMADA con borde sólido y la solicitud dice PENDIENTE con borde punteado', async () => {
        const conf = bloques(page).filter({ hasText: 'Alumna Cal Larga' });
        const pend = bloques(page).filter({ hasText: 'Alumna Cal Pendiente' });
        expect(await conf.innerText()).toContain('CONFIRMADA');
        expect(await conf.innerText()).toContain('Alumna Cal Larga');
        expect(await pend.innerText()).toContain('PENDIENTE');
        expect(await pend.innerText()).toContain('Alumna Cal Pendiente');
        const borde = (l: typeof conf) => l.locator('> button, > div').first().evaluate((el) => getComputedStyle(el).borderTopStyle);
        expect(await borde(conf)).toBe('solid');
        expect(await borde(pend)).toBe('dotted');
        expect(await pend.innerText()).not.toContain('CONFIRMADA');
      }, { esperado: 'El estado va como texto (CONFIRMADA / PENDIENTE) y además con borde sólido / punteado, no solo con color' });
      await ctx.close();
    });

    test(`T-CA-73-02 CA-73 CAL-09 [${pantalla.nombre}] una clase cancelada y una solicitud rechazada no se ven y su hueco queda libre`, async ({ browser, evidencia }) => {
      test.setTimeout(240_000);
      const cu = evidencia({ cu: cuDe('WEB-14-dia-ca73'), titulo: `Calendario Día: canceladas y rechazadas no se ven (${pantalla.nombre})`, criterios: ['CA-73', 'CAL-09', 'WEB-14'], bolt: 'B17' });
      const dia = miercoles();
      const a = await alumna('Alumna Cal Cancelada');
      const b = await alumna('Alumna Cal Rechazada');
      await crearClaseDe(a, dia, '10:00', 60, 'cancelada');
      await crearClaseDe(b, dia, '11:00', 60, 'rechazada');
      const { ctx, page } = await sesion(browser);

      await cu.paso('Abrir el día: no hay bloques', async () => {
        await abrir(page, `#/panel?d=${dia}`);
        await expect(bloques(page)).toHaveCount(0);
        await expect(page.getByText('Alumna Cal Cancelada')).toHaveCount(0);
        await expect(page.getByText('Alumna Cal Rechazada')).toHaveCount(0);
      }, { esperado: 'El calendario no dibuja la clase cancelada ni la solicitud rechazada' });

      await cu.paso('En «Ver como lista» sus horarios están libres', async () => {
        await page.getByRole('button', { name: 'Ver como lista' }).click();
        await expect(page.getByRole('list', { name: 'Huecos del día' })).toBeVisible({ timeout: 30_000 });
        await expect(hueco(page, '10:00 a 11:00 Libre')).toBeVisible();
        await expect(hueco(page, '11:00 a 12:00 Libre')).toBeVisible();
      }, { esperado: 'Las 10:00 y las 11:00 aparecen como «Libre» y se pueden tocar' });
      await ctx.close();
    });

    test(`T-CA-83-01 CA-83 CAL-19 INV-01 [${pantalla.nombre}] «Ver como lista» muestra la lista de huecos con las acciones de hoy y «Ver como calendario» vuelve a la grilla`, async ({ browser, evidencia }) => {
      test.setTimeout(240_000);
      const cu = evidencia({ cu: cuDe('WEB-16-dia-ca83'), titulo: `Calendario Día: ver como lista y volver al calendario (${pantalla.nombre})`, criterios: ['CA-83', 'CAL-19', 'INV-01', 'WEB-16'], bolt: 'B17' });
      const dia = miercoles();
      await crearClaseDe(await alumna('Alumna Cal Lista'), dia, '11:00', 60, 'confirmada');
      const { ctx, page } = await sesion(browser);

      await cu.paso('El Panel abre en el calendario con un bloque', async () => {
        await abrir(page, `#/panel?d=${dia}`);
        await expect(bloques(page)).toHaveCount(1);
        await expect(page.getByRole('list', { name: 'Huecos del día' })).toHaveCount(0);
      }, { esperado: 'Se ve el calendario con el bloque de las 11:00 y no la lista de huecos' });

      await cu.paso('«Ver como lista» muestra los huecos del día', async () => {
        await page.getByRole('button', { name: 'Ver como lista' }).click();
        await expect(page.getByRole('list', { name: 'Huecos del día' })).toBeVisible({ timeout: 30_000 });
        await expect(calendario(page)).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Ver como calendario' })).toBeVisible();
        await expect(hueco(page, '10:00 a 11:00 Libre')).toBeVisible();
        await expect(hueco(page, '11:00 a 12:00 Ocupado')).toContainText('Alumna Cal Lista');
        await expect(page).not.toHaveURL(/lista/i);
      }, { esperado: 'Aparece la lista de huecos (10:00 Libre, 11:00 Ocupado con el nombre), el botón pasa a «Ver como calendario» y la dirección no cambia' });

      await cu.paso('Las acciones de la lista siguen: tocar un hueco libre ofrece «Crear clase» y uno ocupado, «Mover» y «Cancelar»', async () => {
        await hueco(page, '10:00 a 11:00 Libre').click();
        await expect(page.getByRole('heading', { name: 'Crear clase', level: 3 })).toBeVisible();
        await page.getByRole('button', { name: 'Cerrar' }).click();
        await hueco(page, '11:00 a 12:00 Ocupado').click();
        await expect(page.getByRole('heading', { name: 'Elegí qué hacer con la clase', level: 3 })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Mover', exact: true })).toBeEnabled();
        await expect(page.getByRole('button', { name: 'Cancelar', exact: true })).toBeEnabled();
        await page.getByRole('button', { name: 'Cerrar' }).click();
      }, { esperado: 'Las acciones son las de siempre: «Crear clase» en un hueco libre; «Mover» y «Cancelar» en una clase' });

      await cu.paso('«Ver como calendario» vuelve a la grilla', async () => {
        await page.getByRole('button', { name: 'Ver como calendario' }).click();
        await expect(calendario(page)).toBeVisible();
        await expect(bloques(page)).toHaveCount(1);
        await expect(page.getByRole('list', { name: 'Huecos del día' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Ver como lista' })).toBeFocused();
      }, { esperado: 'Vuelve el calendario con su bloque, la lista desaparece y el foco queda en el botón de la vista' });
      await ctx.close();
    });

    test(`T-CA-83-01 CA-83 INV-05 [${pantalla.nombre}] con el profesor inactivo el calendario se ve y en la lista Crear y Mover quedan deshabilitados`, async ({ browser, evidencia }) => {
      test.setTimeout(240_000);
      const cu = evidencia({ cu: cuDe('WEB-16-dia-inactivo'), titulo: `Calendario Día con la agenda inactiva (${pantalla.nombre})`, criterios: ['CA-83', 'INV-05', 'PRF-08', 'WEB-16'], bolt: 'B17' });
      const dia = miercoles();
      await crearClaseDe(await alumna('Alumna Cal Inactivo'), dia, '11:00', 60, 'confirmada');
      await sql(`update public.profesor set activo = false where slug = $1`, [SLUG_A]);
      const { ctx, page } = await sesion(browser);

      await cu.paso('El inactivo ve su calendario y el aviso', async () => {
        await abrir(page, `#/panel?d=${dia}`);
        await expect(page.getByRole('status').filter({ hasText: 'Tu agenda está inactiva: no podés crear ni mover clases' })).toBeVisible();
        await expect(bloques(page)).toHaveCount(1);
      }, { esperado: 'El calendario se ve con la clase y el panel avisa que la agenda está inactiva' });

      await cu.paso('En la lista, Crear y Mover deshabilitados y Cancelar habilitado', async () => {
        await page.getByRole('button', { name: 'Ver como lista' }).click();
        await expect(page.getByRole('list', { name: 'Huecos del día' })).toBeVisible({ timeout: 30_000 });
        await hueco(page, '10:00 a 11:00 Libre').click();
        await expect(page.getByRole('button', { name: 'Crear clase' })).toBeDisabled();
        await page.getByRole('button', { name: 'Cerrar' }).click();
        await hueco(page, '11:00 a 12:00 Ocupado').click();
        await expect(page.getByRole('button', { name: 'Mover', exact: true })).toBeDisabled();
        await expect(page.getByRole('button', { name: 'Cancelar', exact: true })).toBeEnabled();
      }, { esperado: '«Crear clase» y «Mover» deshabilitados; «Cancelar» habilitado' });
      await ctx.close();
    });
  });
}
