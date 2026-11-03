// E2E de las acciones del calendario Día del Panel (B18, T18.3): CA-70, CA-71, CA-75, CA-79 (rama acciones), CA-82, CA-87 (rama acciones) ·
// INV-01, INV-05 · CAL-03 (H-B17-03, «Elegir día»), CAL-05, CAL-06, CAL-11, CAL-14, CAL-17, CAL-18.
// Escritorio (1280x900) y, donde el caso lo pide, 360 px. Reloj real (el JWT vence con la hora real); fechas relativas a hoy en el huso
// del profesor. Datos sintéticos con prefijo `T05 `, que se limpian; la grilla del profesor A se guarda y se restaura después de cada prueba.
// Los casos comparativos (calendario contra lista) corren el mismo escenario dos veces, limpiando entre una y otra, y comparan el
// mensaje visible y el estado de la base.
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
const SESION = resolve(RAIZ, 'node_modules', '.cache', 'calendario-acciones', 'sesion-profesor.json');

const ESC = { nombre: 'escritorio', sufijo: 'esc', viewport: { width: 1280, height: 900 } } as const;
const PANTALLAS = [ESC, { nombre: '360 px', sufijo: '360', viewport: { width: 360, height: 740 } }] as const;

// ---------------------------------------------------------------------------------------------------------------------
// Fechas (huso del profesor) y datos
// ---------------------------------------------------------------------------------------------------------------------
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
/** Día `YYYY-MM-DD` a `n` días de hoy (huso de Montevideo). */
const hoyMasDias = (n: number) => fmt.format(new Date(Date.now() + n * 86_400_000));
/** `dd/mm/aaaa`: el título del día en la barra del calendario. */
const titulo = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;
const ddmm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const isodow = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay();
/** Un miércoles a 8 o más días de hoy. */
function miercoles(): string {
  const d = new Date(Date.now() + 8 * 86_400_000);
  while (new Date(fmt.format(d) + 'T12:00:00Z').getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  return fmt.format(d);
}
/** El último día de lunes a viernes anterior a hoy. */
function laborablePasado(): string {
  for (let n = 1; n <= 7; n++) {
    const d = hoyMasDias(-n);
    if (isodow(d) >= 1 && isodow(d) <= 5) return d;
  }
  throw new Error('sin día laborable pasado');
}

type EstadoClase = 'confirmada' | 'pendiente';
/** Una clase de `minutos` minutos a las `hora` (HH:MM, Montevideo) del `dia`, con su reserva (`observacion` opcional). */
async function crearClaseDe(alumnoId: string, dia: string, hora: string, minutos: number, estado: EstadoClase, observacion: string | null = null): Promise<string> {
  const inicio = `${dia}T${hora}:00-03:00`;
  const deSolicitud = estado === 'pendiente';
  const [r] = await sql<{ id: string }>(
    `insert into public.reserva (profesor_id, alumno_id, tipo, hora_local, dia_semana, duracion_min, estado, desde, origen, observacion)
     values ((select id from public.profesor where slug = $1), $2, 'suelta',
             (($3::timestamptz) at time zone '${TZ}')::time,
             extract(isodow from ($3::timestamptz) at time zone '${TZ}')::smallint,
             $4, $5, (($3::timestamptz) at time zone '${TZ}')::date, $6, $7) returning id`,
    [SLUG_A, alumnoId, inicio, minutos, estado, deSolicitud ? 'solicitud' : 'profesor', observacion],
  );
  const [c] = await sql<{ id: string }>(
    `insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado)
     values ((select id from public.profesor where slug = $1), $2, $3, $4::timestamptz, $4::timestamptz + ($5::int * interval '1 minute'), $6) returning id`,
    [SLUG_A, r.id, alumnoId, inicio, minutos, estado],
  );
  return c.id;
}
/** Una serie semanal (tres clases confirmadas a las 10:00, a partir de `dia`, un miércoles) del alumno. */
async function crearSerie(alumnoId: string, dia: string): Promise<void> {
  const [r] = await sql<{ id: string }>(
    `insert into public.reserva (profesor_id, alumno_id, tipo, frecuencia_semanas, hora_local, dia_semana, duracion_min, estado, desde, origen, observacion)
     values ((select id from public.profesor where slug = $1), $2, 'serie', 1, '10:00', 3, 60, 'confirmada', $3::date, 'profesor', 'Serie E2E') returning id`,
    [SLUG_A, alumnoId, dia],
  );
  for (let i = 0; i < 3; i++) {
    await sql(
      `insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado)
       values ((select id from public.profesor where slug = $1), $2, $3, (($4::date + $5::int)::text || ' 10:00')::timestamp at time zone '${TZ}',
               (($4::date + $5::int)::text || ' 11:00')::timestamp at time zone '${TZ}', 'confirmada')`,
      [SLUG_A, r.id, alumnoId, dia, i * 7],
    );
  }
}
/** Estado normalizado de la base para el alumno: clases (inicio local, estado) y reservas (tipo, estado, desde, hasta). */
async function fotoBase(nombre: string) {
  const al = `(select id from public.alumno where nombre = 'T05 ${nombre}')`;
  const clases = await sql<{ i: string; f: string; e: string }>(
    `select to_char(inicio at time zone '${TZ}','YYYY-MM-DD HH24:MI') i, to_char(fin at time zone '${TZ}','HH24:MI') f, estado::text e
       from public.clase where alumno_id = ${al} order by inicio`,
  );
  const reservas = await sql<{ t: string; e: string; d: string; h: string | null }>(
    `select tipo::text t, estado::text e, desde::text d, hasta::text h from public.reserva where alumno_id = ${al} order by tipo, desde`,
  );
  return { clases, reservas };
}
const alumna = (nombre: string) => crearAlumno({ nombre, estado: 'aprobado', telefono: '+598 99555333', mail: mailT05('e2e.calacc') });

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
/** Grilla conocida: de lunes a viernes, 08:00-13:00 y 14:00-18:00 (13:00-14:00 queda fuera de la grilla). */
const GRILLA = [1, 2, 3, 4, 5].flatMap((dia_semana) => [
  { dia_semana, desde: '08:00', hasta: '13:00' },
  { dia_semana, desde: '14:00', hasta: '18:00' },
]);
const MOTIVOS = `('Torneo', 'T05 Bloqueo rango')`;
async function limpiarDatos() {
  await sql(`delete from public.bloqueo where motivo in ${MOTIVOS}`);
  await sql(`delete from public.solicitud where alumno_id in (select id from public.alumno where nombre like 'T05 %')`);
  await limpiarT05();
}
async function limpiar() {
  await sql(`update public.profesor set activo = true where slug = $1`, [SLUG_A]);
  await limpiarDatos();
  if (grillaOriginal.length > 0) await ponerGrilla(grillaOriginal);
}
/** Un bloqueo propio del profesor A de `desde` a `hasta` (HH:MM) del `dia`. */
async function crearBloqueo(dia: string, desde: string, hasta: string, motivo: string) {
  await sql(
    `insert into public.bloqueo (profesor_id, periodo, motivo)
     values ((select id from public.profesor where slug = $1), tstzrange($2::timestamptz, $3::timestamptz), $4)`,
    [SLUG_A, `${dia}T${desde}:00-03:00`, `${dia}T${hasta}:00-03:00`, motivo],
  );
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
  mkdirSync(resolve(RAIZ, 'node_modules', '.cache', 'calendario-acciones'), { recursive: true });
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
test.beforeEach(async () => {
  await ponerGrilla(GRILLA);
});
test.afterEach(limpiar);
test.afterAll(cerrar);

// ---------------------------------------------------------------------------------------------------------------------
// Localizadores y utilidades de página
// ---------------------------------------------------------------------------------------------------------------------
const h2Dia = (page: Page, dia: string) => page.getByRole('heading', { level: 2, name: titulo(dia) });
const calendario = (page: Page) => page.getByRole('group', { name: /^Calendario, / });
/** El detalle del elemento tocado: diálogo (< 60 rem) o columna (escritorio). */
const detalle = (page: Page) => page.getByRole('dialog').or(page.getByRole('complementary'));
const huecoCal = (page: Page, rango: string) => calendario(page).getByRole('button', { name: new RegExp(`${rango}, Libre$`) });
const claseCal = (page: Page, nombre: string) => calendario(page).getByRole('button', { name: new RegExp(`Confirmada, .*${nombre}`) });
const huecoLista = (page: Page, prefijo: string) => page.getByRole('button', { name: new RegExp(`^${prefijo}`) });
const exito = (page: Page, texto: RegExp) => page.getByRole('status').filter({ hasText: texto });

/** Abre una dirección del Panel y espera el calendario. */
async function abrir(page: Page, hash: string) {
  await page.goto('about:blank'); // carga completa: un cambio de hash en la misma página no vuelve a leer la configuración
  await page.goto(`${ORIGEN}${BASE}${hash}`);
  await expect(page.getByRole('heading', { name: 'Panel', level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect(calendario(page)).toBeVisible({ timeout: 30_000 });
}
async function abrirLista(page: Page, dia: string) {
  await abrir(page, `#/panel?d=${dia}`);
  await page.getByRole('button', { name: 'Ver como lista' }).click();
  await expect(page.getByRole('list', { name: 'Huecos del día' })).toBeVisible({ timeout: 30_000 });
}
const cerrarDetalle = (page: Page) => detalle(page).getByRole('button', { name: 'Cerrar' }).click();

type Modo = 'calendario' | 'lista';
/** Abre el día en `modo` y toca el hueco libre de `rango` (HH:MM a HH:MM) o la clase del alumno. */
async function tocarLibre(page: Page, modo: Modo, dia: string, rango: string) {
  if (modo === 'calendario') {
    await abrir(page, `#/panel?d=${dia}`);
    await huecoCal(page, rango).click();
  } else {
    await abrirLista(page, dia);
    await huecoLista(page, `${rango} Libre`).click();
  }
}
async function tocarClase(page: Page, modo: Modo, dia: string, rango: string, nombre: string) {
  if (modo === 'calendario') {
    await abrir(page, `#/panel?d=${dia}`);
    await claseCal(page, nombre).click();
  } else {
    await abrirLista(page, dia);
    await huecoLista(page, `${rango} Ocupado`).click();
  }
}

const mensajeDe = async (page: Page, texto: RegExp) => (await page.getByText(texto).first().innerText()).trim();

for (const pantalla of PANTALLAS) {
  test.describe(`calendario Día, acciones · ${pantalla.nombre}`, () => {
    async function sesion(browser: Browser) {
      const ctx = await browser.newContext({ locale: 'es-UY', timezoneId: TZ, storageState: SESION, viewport: pantalla.viewport });
      return { ctx, page: await ctx.newPage() };
    }
    const cuDe = (base: string) => `${base}-${pantalla.sufijo}`;
    const enEscritorio = pantalla === ESC;

    // -------------------------------------------------------------------------------------------------------------------
    test(`T-CA-70-01 T-CA-70-02 CA-70 CAL-05 CAL-11 [${pantalla.nombre}] un hueco libre futuro abre «Crear clase»; uno pasado y la zona fuera de la grilla no abren nada`, async ({ browser, evidencia }) => {
      test.setTimeout(240_000);
      const cu = evidencia({ cu: cuDe('WEB-14-acciones-ca70'), titulo: `Calendario Día: tocar un hueco libre (${pantalla.nombre})`, criterios: ['CA-70', 'CAL-05', 'CAL-11', 'WEB-14'], bolt: 'B18' });
      const dia = miercoles();
      const { ctx, page } = await sesion(browser);

      await cu.paso('Tocar el hueco libre futuro de las 10:00', async () => {
        await abrir(page, `#/panel?d=${dia}`);
        await expect(detalle(page)).toHaveCount(0);
        await huecoCal(page, '10:00 a 11:00').click();
        await expect(detalle(page)).toBeVisible();
        await expect(detalle(page).getByRole('heading', { name: 'Crear clase', level: 3 })).toBeVisible();
        await expect(detalle(page)).toContainText('10:00');
        await expect(page.getByRole('dialog')).toHaveCount(enEscritorio ? 0 : 1);
        await cerrarDetalle(page);
        await expect(detalle(page)).toHaveCount(0);
      }, { esperado: 'Se abre «Crear clase» para el miércoles a las 10:00 (columna en escritorio, diálogo a 360 px) y «Cerrar» lo cierra' });

      await cu.paso('Un hueco libre de un día pasado no se puede tocar', async () => {
        const pasado = laborablePasado();
        await abrir(page, `#/panel?d=${pasado}`);
        await expect(h2Dia(page, pasado)).toBeVisible();
        await expect(calendario(page).getByRole('button')).toHaveCount(0);
        await expect(detalle(page)).toHaveCount(0);
      }, { esperado: 'En un día pasado la grilla no tiene ningún botón: los huecos pasados no abren nada' });

      await cu.paso('Tocar la zona fuera de la grilla (13:00 a 14:00) no abre nada', async () => {
        await abrir(page, `#/panel?d=${dia}`);
        await expect(calendario(page).getByRole('button', { name: /13:00 a 14:00/ })).toHaveCount(0);
        const a = await calendario(page).locator('time', { hasText: '13:00' }).boundingBox();
        const b = await calendario(page).locator('time', { hasText: '14:00' }).boundingBox();
        const g = await calendario(page).boundingBox();
        expect(a && b && g, 'se miden el eje y la grilla').toBeTruthy();
        await page.mouse.click(g!.x + g!.width * 0.7, (a!.y + a!.height / 2 + b!.y + b!.height / 2) / 2);
        await expect(detalle(page)).toHaveCount(0);
        await expect(page.getByRole('heading', { name: 'Crear clase', level: 3 })).toHaveCount(0);
      }, { esperado: 'La franja sombreada fuera de la grilla no tiene botón y tocarla no abre ningún detalle' });
      await ctx.close();
    });

    // -------------------------------------------------------------------------------------------------------------------
    test(`T-CA-71-01 T-CA-71-02 CA-71 CAL-06 CAL-11 [${pantalla.nombre}] un bloqueo «Torneo» se ve rayado con BLOQUEADO y su motivo y se desbloquea`, async ({ browser, evidencia }) => {
      test.setTimeout(240_000);
      const cu = evidencia({ cu: cuDe('WEB-14-acciones-ca71'), titulo: `Calendario Día: bloqueo y «Desbloquear» (${pantalla.nombre})`, criterios: ['CA-71', 'CAL-06', 'CAL-11', 'WEB-14'], bolt: 'B18' });
      const dia = miercoles();
      await crearBloqueo(dia, '10:00', '11:00', 'Torneo');
      const { ctx, page } = await sesion(browser);
      const bloqueo = () => calendario(page).getByRole('button', { name: /10:00 a 11:00, Bloqueado, Torneo/ });

      await cu.paso('Abrir el día con el bloqueo', async () => {
        await abrir(page, `#/panel?d=${dia}`);
        await expect(bloqueo()).toBeVisible();
        const texto = await bloqueo().innerText();
        expect(texto).toContain('BLOQUEADO');
        expect(texto).toContain('Torneo');
        const fondo = await bloqueo().evaluate((el) => getComputedStyle(el.querySelector('div, span') ?? el).backgroundImage);
        test.info().annotations.push({ type: 'fondo del bloqueo', description: fondo });
      }, { esperado: 'El bloque dice BLOQUEADO y «Torneo» como texto (no solo con el rayado)' });

      await cu.paso('Tocar el bloqueo ofrece «Desbloquear»', async () => {
        await bloqueo().click();
        await expect(detalle(page).getByRole('button', { name: 'Desbloquear', exact: true })).toBeVisible();
      }, { esperado: 'El detalle ofrece «Desbloquear»' });

      await cu.paso('Desbloquear deja el hueco libre', async () => {
        await detalle(page).getByRole('button', { name: 'Desbloquear', exact: true }).click();
        await expect(exito(page, /quitaste el bloqueo/)).toBeVisible({ timeout: 20_000 });
        await expect(huecoCal(page, '10:00 a 11:00')).toBeVisible({ timeout: 20_000 });
        await expect(bloqueo()).toHaveCount(0);
        const [n] = await sql<{ n: string }>(`select count(*)::text n from public.bloqueo where motivo = 'Torneo'`);
        expect(n.n).toBe('0');
      }, { esperado: 'Aparece el éxito, el horario de las 10:00 vuelve a ser un hueco libre y el bloqueo ya no está en la base' });
      await ctx.close();
    });

    // -------------------------------------------------------------------------------------------------------------------
    test(`T-CA-75-01 CA-75 CAL-11 [${pantalla.nombre}] una clase confirmada muestra quién la toma, el titular y la observación, con «Mover» y «Cancelar»`, async ({ browser, evidencia }) => {
      test.setTimeout(240_000);
      const cu = evidencia({ cu: cuDe('WEB-14-acciones-ca75'), titulo: `Calendario Día: detalle de una clase (${pantalla.nombre})`, criterios: ['CA-75', 'CAL-11', 'WEB-14'], bolt: 'B18' });
      const dia = miercoles();
      await crearClaseDe(await alumna('Alumna Detalle'), dia, '10:00', 60, 'confirmada', 'Trae la guitarra E2E');
      const { ctx, page } = await sesion(browser);

      await cu.paso('Tocar la clase de las 10:00', async () => {
        await abrir(page, `#/panel?d=${dia}`);
        await claseCal(page, 'Alumna Detalle').click();
        const d = detalle(page);
        await expect(d).toBeVisible();
        await expect(d.getByText('Toma la clase')).toBeVisible();
        await expect(d).toContainText('Alumna Detalle');
        await expect(d.getByText('Titular')).toBeVisible();
        await expect(d).toContainText('Trae la guitarra E2E');
        await expect(d.getByRole('button', { name: 'Mover', exact: true })).toBeEnabled();
        await expect(d.getByRole('button', { name: 'Cancelar', exact: true })).toBeEnabled();
      }, { esperado: 'El detalle dice quién toma la clase, el titular y la observación, y ofrece «Mover» y «Cancelar» habilitados' });
      await ctx.close();
    });

    // -------------------------------------------------------------------------------------------------------------------
    test(`T-CA-79-01 T-INV-05-02 CA-79 INV-05 CAL-14 [${pantalla.nombre}] con el profesor inactivo «Mover» y «Crear clase» están deshabilitados con su porqué, «Cancelar» funciona y nada se arrastra`, async ({ browser, evidencia }) => {
      test.setTimeout(240_000);
      const cu = evidencia({ cu: cuDe('WEB-14-acciones-ca79'), titulo: `Calendario Día con la agenda inactiva: acciones (${pantalla.nombre})`, criterios: ['CA-79', 'INV-05', 'CAL-14', 'WEB-14'], bolt: 'B18' });
      const dia = miercoles();
      const claseId = await crearClaseDe(await alumna('Alumna Inactivo'), dia, '11:00', 60, 'confirmada');
      const { ctx, page } = await sesion(browser);

      await cu.paso('Negativo: con el profesor activo «Crear clase» y «Mover» se habilitan', async () => {
        await abrir(page, `#/panel?d=${dia}`);
        await huecoCal(page, '10:00 a 11:00').click();
        await expect(detalle(page).getByRole('button', { name: 'Crear clase' })).toBeEnabled();
        await cerrarDetalle(page);
        await claseCal(page, 'Alumna Inactivo').click();
        await expect(detalle(page).getByRole('button', { name: 'Mover', exact: true })).toBeEnabled();
        await cerrarDetalle(page);
      }, { esperado: 'Con la agenda activa, «Crear clase» y «Mover» están habilitados' });

      await sql(`update public.profesor set activo = false where slug = $1`, [SLUG_A]);

      await cu.paso('Inactivo: no se arrastra la clase', async () => {
        await abrir(page, `#/panel?d=${dia}`);
        await expect(page.getByRole('status').filter({ hasText: 'Tu agenda está inactiva: no podés crear ni mover clases' })).toBeVisible();
        await claseCal(page, 'Alumna Inactivo').dragTo(huecoCal(page, '10:00 a 11:00'), { force: true });
        const [c] = await sql<{ i: string }>(`select to_char(inicio at time zone '${TZ}','HH24:MI') i from public.clase where id = $1`, [claseId]);
        expect(c.i, 'la clase sigue a las 11:00').toBe('11:00');
      }, { esperado: 'Arrastrar la clase sobre un hueco libre no la mueve: sigue a las 11:00 en la base' });

      await cu.paso('Inactivo: «Crear clase» deshabilitado con su porqué', async () => {
        await abrir(page, `#/panel?d=${dia}`);
        await huecoCal(page, '10:00 a 11:00').click();
        await expect(detalle(page).getByText('Con la agenda inactiva no podés crear clases.')).toBeVisible();
        await expect(detalle(page).getByRole('button', { name: 'Crear clase' })).toBeDisabled();
        await cerrarDetalle(page);
      }, { esperado: 'Aparece «Con la agenda inactiva no podés crear clases.» y «Crear clase» está deshabilitado' });

      await cu.paso('Inactivo: «Mover» deshabilitado y «Cancelar» funciona', async () => {
        await claseCal(page, 'Alumna Inactivo').click();
        await expect(detalle(page).getByText('Con la agenda inactiva no podés mover clases. Sí podés cancelarlas.')).toBeVisible();
        await expect(detalle(page).getByRole('button', { name: 'Mover', exact: true })).toBeDisabled();
        await detalle(page).getByRole('button', { name: 'Cancelar', exact: true }).click();
        await page.getByRole('button', { name: 'Confirmar cancelación' }).click();
        await expect(exito(page, new RegExp(`Clase cancelada: .*Alumna Inactivo, ${ddmm(dia)} 11:00`))).toBeVisible({ timeout: 20_000 });
        const [c] = await sql<{ e: string }>(`select estado::text e from public.clase where id = $1`, [claseId]);
        expect(c.e).toBe('cancelada');
      }, { esperado: '«Mover» deshabilitado con su explicación; «Cancelar» cancela la clase y queda «cancelada» en la base' });
      await ctx.close();
    });

    // -------------------------------------------------------------------------------------------------------------------
    test(`T-CA-82-01 CA-82 CAL-17 WEB-14 [${pantalla.nombre}] la leyenda muestra los cuatro estados y un día sin clases dice «No hay clases este día» con sus huecos libres`, async ({ browser, evidencia }) => {
      test.setTimeout(240_000);
      const cu = evidencia({ cu: cuDe('WEB-14-acciones-ca82'), titulo: `Calendario Día: leyenda y día vacío (${pantalla.nombre})`, criterios: ['CA-82', 'CAL-17', 'WEB-14'], bolt: 'B18' });
      const dia = miercoles();
      const otro = hoyMasDias(0) === dia ? hoyMasDias(1) : dia; // el vacío es otro miércoles
      const vacio = fmt.format(new Date(new Date(`${otro}T12:00:00Z`).getTime() + 7 * 86_400_000));
      await crearClaseDe(await alumna('Alumna Leyenda'), dia, '10:00', 60, 'confirmada');
      const { ctx, page } = await sesion(browser);
      const leyenda = () => page.getByRole('list', { name: 'Leyenda del calendario' });

      await cu.paso('Un día con clases: la leyenda y sin el aviso de vacío', async () => {
        await abrir(page, `#/panel?d=${dia}`);
        await expect(leyenda()).toBeVisible();
        for (const t of ['Confirmada', 'Pendiente', 'Bloqueado', 'Libre']) await expect(leyenda().getByText(t, { exact: true })).toBeVisible();
        await expect(page.getByText('No hay clases este día')).toHaveCount(0);
      }, { esperado: 'La leyenda dice Confirmada, Pendiente, Bloqueado y Libre y no aparece «No hay clases este día»' });

      await cu.paso('Un día sin clases: «No hay clases este día» y los huecos libres', async () => {
        await abrir(page, `#/panel?d=${vacio}`);
        await expect(page.getByText('No hay clases este día')).toBeVisible();
        await expect(leyenda()).toBeVisible();
        await expect(huecoCal(page, '10:00 a 11:00')).toBeVisible();
        expect(await calendario(page).getByRole('button', { name: /, Libre$/ }).count()).toBeGreaterThan(0);
      }, { esperado: 'Se ve «No hay clases este día» y los huecos libres de la grilla siguen tocables' });
      await ctx.close();
    });

    // -------------------------------------------------------------------------------------------------------------------
    test(`T-CA-82-02 CA-82 CAL-18 [${pantalla.nombre}] con la lectura fallida se ve el error y «Reintentar» vuelve a leer la agenda`, async ({ browser, evidencia }) => {
      test.setTimeout(240_000);
      const cu = evidencia({ cu: cuDe('WEB-14-acciones-ca82-error'), titulo: `Calendario Día: error de lectura y «Reintentar» (${pantalla.nombre})`, criterios: ['CA-82', 'CAL-18', 'WEB-14'], bolt: 'B18' });
      const dia = miercoles();
      await crearClaseDe(await alumna('Alumna Reintento'), dia, '10:00', 60, 'confirmada');
      const { ctx, page } = await sesion(browser);
      let fallar = true;
      let lecturas = 0;
      await page.route(/\/rpc\/agenda_profesor_dias/, async (ruta) => {
        lecturas++;
        if (fallar) await ruta.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'falla simulada' }) });
        else await ruta.continue();
      });

      await cu.paso('La lectura falla (RPC 500 simulado)', async () => {
        await page.goto('about:blank');
        await page.goto(`${ORIGEN}${BASE}#/panel?d=${dia}`);
        await expect(page.getByRole('heading', { name: 'Panel', level: 1 })).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText(/No se pudo cargar la agenda/)).toBeVisible({ timeout: 30_000 });
        await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
        await expect(claseCal(page, 'Alumna Reintento')).toHaveCount(0);
      }, { esperado: 'Se ve «No se pudo cargar la agenda» y el botón «Reintentar»; no se dibuja ninguna clase' });

      await cu.paso('«Reintentar» con la lectura ya sana muestra la agenda', async () => {
        fallar = false;
        const antes = lecturas;
        await page.getByRole('button', { name: 'Reintentar' }).click();
        await expect(calendario(page)).toBeVisible({ timeout: 30_000 });
        await expect(claseCal(page, 'Alumna Reintento')).toBeVisible();
        await expect(page.getByText(/No se pudo cargar la agenda/)).toHaveCount(0);
        expect(lecturas, 'reintentar vuelve a leer').toBeGreaterThan(antes);
      }, { esperado: 'La agenda se vuelve a leer, desaparece el error y se ve la clase' });
      await ctx.close();
    });

    // -------------------------------------------------------------------------------------------------------------------
    test(`CAL-03 H-B17-03 [${pantalla.nombre}] «Elegir día» lleva al día elegido y no acepta fuera de hoy ± 366`, async ({ browser, evidencia }) => {
      test.setTimeout(240_000);
      const cu = evidencia({ cu: cuDe('WEB-14-acciones-elegir-dia'), titulo: `Calendario Día: «Elegir día» (${pantalla.nombre})`, criterios: ['CAL-03', 'H-B17-03', 'WEB-14'], bolt: 'B18' });
      const hoy = hoyMasDias(0);
      const { ctx, page } = await sesion(browser);
      const campo = () => page.getByLabel('Elegir día');

      await cu.paso('El campo existe con los límites de hoy ± 366', async () => {
        await abrir(page, '#/panel');
        await expect(h2Dia(page, hoy)).toBeVisible();
        await expect(campo()).toBeVisible();
        await expect(campo()).toHaveAttribute('min', hoyMasDias(-366));
        await expect(campo()).toHaveAttribute('max', hoyMasDias(366));
      }, { esperado: `«Elegir día» está en la barra y acota de ${hoyMasDias(-366)} a ${hoyMasDias(366)}` });

      await cu.paso('Elegir una fecha lleva a ese día y cambia la dirección', async () => {
        const elegido = hoyMasDias(40);
        await campo().fill(elegido);
        await expect(h2Dia(page, elegido)).toBeVisible({ timeout: 20_000 });
        await expect(page).toHaveURL(new RegExp(`d=${elegido}`));
        await expect(calendario(page)).toBeVisible();
      }, { esperado: 'El título pasa al día elegido y la dirección lleva «d=<día elegido>»' });

      await cu.paso('Una fecha fuera de hoy ± 366 no navega y dice por qué', async () => {
        const actual = hoyMasDias(40);
        await campo().fill(hoyMasDias(400));
        await expect(page.getByText(/no está disponible/i)).toBeVisible();
        await expect(h2Dia(page, actual)).toBeVisible();
        await expect(page).toHaveURL(new RegExp(`d=${actual}`));
      }, { esperado: 'Aparece «Ese día no está disponible…», el título y la dirección siguen en el día anterior' });
      await ctx.close();
    });
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Casos comparativos calendario / lista (INV-01): mismo escenario dos veces, mismo resultado. Solo escritorio.
// ---------------------------------------------------------------------------------------------------------------------
test.describe('calendario Día, acciones · comparación con la lista · escritorio', () => {
  async function sesion(browser: Browser) {
    const ctx = await browser.newContext({ locale: 'es-UY', timezoneId: TZ, storageState: SESION, viewport: ESC.viewport });
    return { ctx, page: await ctx.newPage() };
  }

  test('T-CA-75-02 T-INV-01-03 CA-75 INV-01 CAL-11 mover «solo esta clase» de una serie desde el calendario y desde la lista deja lo mismo en la base y da el mismo aviso', async ({ browser, evidencia }) => {
    test.setTimeout(300_000);
    const cu = evidencia({ cu: 'WEB-14-acciones-ca75-serie-esc', titulo: 'Mover «solo esta clase» de una serie: calendario y lista (escritorio)', criterios: ['CA-75', 'INV-01', 'CAL-11', 'WEB-14'], bolt: 'B18' });
    const dia = miercoles();
    const { ctx, page } = await sesion(browser);
    const resultados: { aviso: string; foto: Awaited<ReturnType<typeof fotoBase>> }[] = [];

    for (const modo of ['calendario', 'lista'] as const) {
      await cu.paso(`Mover solo esta clase de las 10:00 a las 11:00 desde ${modo === 'calendario' ? 'el calendario' : 'la lista'}`, async () => {
        await limpiarDatos();
        await crearSerie(await alumna('Alumna Serie Acc'), dia);
        await tocarClase(page, modo, dia, '10:00 a 11:00', 'Alumna Serie Acc');
        await detalle(page).getByRole('button', { name: 'Mover', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Mover la clase', level: 3 })).toBeVisible();
        await expect(page.getByRole('radio', { name: 'Solo esta clase' })).toBeChecked();
        await page.getByRole('radio', { name: '11:00 a 12:00' }).check();
        await page.getByRole('button', { name: 'Mover clase' }).click();
        await expect(exito(page, new RegExp(`Clase movida al ${ddmm(dia)} 11:00`))).toBeVisible({ timeout: 20_000 });
        const aviso = (await exito(page, /Clase movida/).innerText()).trim();
        const foto = await fotoBase('Alumna Serie Acc');
        expect(foto.clases.filter((c) => c.e === 'confirmada').map((c) => c.i.slice(11) + ' ' + c.f), 'clases confirmadas de la serie').toEqual(['11:00 12:00', '10:00 11:00', '10:00 11:00']);
        resultados.push({ aviso, foto });
        test.info().annotations.push({ type: `aviso (${modo})`, description: aviso });
      }, { esperado: `Aparece «Clase movida al ${ddmm(dia)} 11:00»; solo la primera clase de la serie pasa a las 11:00 y las otras dos siguen a las 10:00` });
    }

    await cu.paso('El aviso y la base son idénticos', async () => {
      expect(resultados[1].aviso).toBe(resultados[0].aviso);
      expect(resultados[1].foto).toEqual(resultados[0].foto);
    }, { esperado: 'Mismo aviso y misma foto de clases y reservas con el calendario y con la lista' });
    await ctx.close();
  });

  test('T-CA-87-01 T-INV-01-01 CA-87 INV-01 crear sobre un hueco que otro ocupó se rechaza igual y con el mismo mensaje desde el calendario y desde la lista', async ({ browser, evidencia }) => {
    test.setTimeout(300_000);
    const cu = evidencia({ cu: 'WEB-14-acciones-ca87-crear-esc', titulo: 'Crear sobre un hueco ocupado: calendario y lista (escritorio)', criterios: ['CA-87', 'INV-01', 'WEB-14'], bolt: 'B18' });
    const dia = miercoles();
    const { ctx, page } = await sesion(browser);
    const resultados: { mensaje: string; clases: string[] }[] = [];

    for (const modo of ['calendario', 'lista'] as const) {
      await cu.paso(`Crear la clase de las 10:00 desde ${modo === 'calendario' ? 'el calendario' : 'la lista'} cuando otra persona ya la tomó`, async () => {
        await limpiarDatos();
        await alumna('Alumna Crea Acc');
        const ocupante = await alumna('Alumna Ocupante Acc');
        await tocarLibre(page, modo, dia, '10:00 a 11:00');
        await expect(detalle(page).getByRole('heading', { name: 'Crear clase', level: 3 })).toBeVisible();
        await page.getByRole('searchbox', { name: 'Buscar alumno' }).fill('Alumna Crea Acc');
        await page.getByRole('radio', { name: /Alumna Crea Acc/ }).check();
        await crearClaseDe(ocupante, dia, '10:00', 60, 'confirmada'); // se ocupa mientras el formulario está abierto
        await page.getByRole('button', { name: 'Crear clase' }).click();
        const mensaje = await mensajeDe(page, /ya no está libre/i);
        const clases = (await sql<{ n: string }>(`select a.nombre n from public.clase c join public.alumno a on a.id = c.alumno_id where a.nombre like 'T05 %' order by 1`)).map((r) => r.n);
        expect(clases, 'solo queda la clase de quien ocupó el hueco').toEqual(['T05 Alumna Ocupante Acc']);
        resultados.push({ mensaje, clases });
        test.info().annotations.push({ type: `rechazo (${modo})`, description: mensaje });
      }, { esperado: 'Se rechaza con «Ese horario ya no está libre…» y no se crea ninguna clase nueva en la base' });
    }

    await cu.paso('El mensaje y la base son idénticos', async () => {
      expect(resultados[1]).toEqual(resultados[0]);
    }, { esperado: 'Mismo mensaje y misma base con el calendario y con la lista' });
    await ctx.close();
  });

  test('T-CA-87-02 T-INV-01-02 CA-87 INV-01 bloquear un rango con una clase confirmada se rechaza igual y con el mismo mensaje desde el calendario y desde la lista', async ({ browser, evidencia }) => {
    test.setTimeout(300_000);
    const cu = evidencia({ cu: 'WEB-14-acciones-ca87-bloquear-esc', titulo: 'Bloquear un rango con una clase confirmada: calendario y lista (escritorio)', criterios: ['CA-87', 'INV-01', 'WEB-14'], bolt: 'B18' });
    const dia = miercoles();
    const { ctx, page } = await sesion(browser);
    const resultados: { mensaje: string; conflictos: string; bloqueos: string }[] = [];

    for (const modo of ['calendario', 'lista'] as const) {
      await cu.paso(`Bloquear de 09:00 a 12:00 desde ${modo === 'calendario' ? 'el calendario' : 'la lista'} con una clase confirmada a las 10:00`, async () => {
        await limpiarDatos();
        await crearClaseDe(await alumna('Alumna Bloqueo Acc'), dia, '10:00', 60, 'confirmada');
        if (modo === 'calendario') await abrir(page, `#/panel?d=${dia}`);
        else await abrirLista(page, dia);
        await page.getByRole('button', { name: 'Bloquear horarios' }).click();
        const dlg = page.getByRole('dialog');
        await expect(dlg).toBeVisible();
        await dlg.getByLabel(/^Día \(obligatorio\)/).fill(dia);
        await dlg.getByLabel(/^Desde/).fill('09:00');
        await dlg.getByLabel(/^Hasta/).fill('12:00');
        await dlg.getByLabel(/^Motivo/).fill('T05 Bloqueo rango');
        await dlg.getByRole('button', { name: 'Bloquear', exact: true }).click();
        const alerta = dlg.getByRole('alert').filter({ hasText: 'No se puede bloquear' });
        await expect(alerta).toBeVisible({ timeout: 20_000 });
        const mensaje = (await alerta.innerText()).trim();
        const conflictos = (await dlg.getByRole('list', { name: 'Clases que impiden el bloqueo' }).innerText()).trim();
        expect(conflictos).toContain('Alumna Bloqueo Acc');
        const [b] = await sql<{ n: string }>(`select count(*)::text n from public.bloqueo where motivo = 'T05 Bloqueo rango'`);
        expect(b.n, 'no se crea el bloqueo').toBe('0');
        resultados.push({ mensaje, conflictos, bloqueos: b.n });
        test.info().annotations.push({ type: `rechazo (${modo})`, description: mensaje.replace(/\s+/g, ' ') });
      }, { esperado: 'Se rechaza con «No se puede bloquear», la clase confirmada listada como conflicto y ningún bloqueo en la base' });
    }

    await cu.paso('El mensaje, los conflictos y la base son idénticos', async () => {
      expect(resultados[1]).toEqual(resultados[0]);
    }, { esperado: 'Mismo mensaje, mismos conflictos y misma base con el calendario y con la lista' });
    await ctx.close();
  });
});
