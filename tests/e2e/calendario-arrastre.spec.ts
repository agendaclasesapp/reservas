// E2E del arrastre de clases del calendario del Panel (B21, T21.3): CA-77, CA-78, CA-79 (cierre), CA-87 (cierre) ·
// INV-01, INV-05 · CAL-13, CAL-14 · A11Y-52 (foco al bloque movido).
// Escritorio (1280x900), `page.mouse` (down / move con pasos / up), en las vistas Día y Semana. Reloj real (el JWT vence con la hora
// real); fechas relativas a hoy en el huso del profesor. Datos sintéticos con prefijo `T05 `, que se limpian; la grilla del profesor A
// se guarda, se reemplaza por una conocida (lunes a domingo 08:00-13:00 y 14:00-18:00) y se restaura después de cada prueba.
// Cada caso comprueba la vista Y la base (el estado de las clases), no solo lo que se ve.
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Browser, BrowserContext, Locator, Page } from '@playwright/test';
import { expect, test } from '../soporte/evidencia';
import { cerrar, sql } from '../soporte/bd';
import { fijarReloj, limpiarReloj } from '../soporte/reloj';
import { SITEKEY_PRUEBA } from '../soporte/captcha';
import { esperarMail, contarMails } from '../soporte/correo';
import { entorno, RAIZ } from '../soporte/entorno';
import { MAIL_PROFESOR, SLUG_A } from '../soporte/usuarios';
import { crearAlumno, limpiarT05, mailT05 } from '../integracion/cuentas/ayuda';

const BASE = process.env.RTC_BASE ?? '/reservas/';
const ORIGEN = process.env.BASE_URL ?? `http://127.0.0.1:${process.env.RTC_PREVIEW_PORT || '4173'}`;
const TZ = 'America/Montevideo';
const SESION = resolve(RAIZ, 'node_modules', '.cache', 'calendario-arrastre', 'sesion-profesor.json');
const VIEWPORT = { width: 1280, height: 900 };

// ---------------------------------------------------------------------------------------------------------------------
// Fechas (huso del profesor) y datos
// ---------------------------------------------------------------------------------------------------------------------
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const hoyMasDias = (n: number) => fmt.format(new Date(Date.now() + n * 86_400_000));
const sumarDias = (dia: string, n: number) => fmt.format(new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * 86_400_000));
const ddmm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const isodow = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay(); // 0 = domingo
/** Un miércoles a 8 o más días de hoy. */
function miercoles(): string {
  const d = new Date(Date.now() + 8 * 86_400_000);
  while (new Date(fmt.format(d) + 'T12:00:00Z').getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  return fmt.format(d);
}

type EstadoClase = 'confirmada' | 'pendiente';
async function crearClaseDe(alumnoId: string, dia: string, hora: string, minutos: number, estado: EstadoClase): Promise<string> {
  const inicio = `${dia}T${hora}:00-03:00`;
  const [r] = await sql<{ id: string }>(
    `insert into public.reserva (profesor_id, alumno_id, tipo, hora_local, dia_semana, duracion_min, estado, desde, origen)
     values ((select id from public.profesor where slug = $1), $2, 'suelta',
             (($3::timestamptz) at time zone '${TZ}')::time,
             extract(isodow from ($3::timestamptz) at time zone '${TZ}')::smallint,
             $4, $5, (($3::timestamptz) at time zone '${TZ}')::date, $6) returning id`,
    [SLUG_A, alumnoId, inicio, minutos, estado, estado === 'pendiente' ? 'solicitud' : 'profesor'],
  );
  const [c] = await sql<{ id: string }>(
    `insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado)
     values ((select id from public.profesor where slug = $1), $2, $3, $4::timestamptz, $4::timestamptz + ($5::int * interval '1 minute'), $6) returning id`,
    [SLUG_A, r.id, alumnoId, inicio, minutos, estado],
  );
  return c.id;
}
/** Una serie semanal (tres clases confirmadas a las 10:00: `desde`, +7 y +14; `desde` es un miércoles). */
async function crearSerie(alumnoId: string, desde: string): Promise<void> {
  const [r] = await sql<{ id: string }>(
    `insert into public.reserva (profesor_id, alumno_id, tipo, frecuencia_semanas, hora_local, dia_semana, duracion_min, estado, desde, origen, observacion)
     values ((select id from public.profesor where slug = $1), $2, 'serie', 1, '10:00', 3, 60, 'confirmada', $3::date, 'profesor', 'Serie E2E') returning id`,
    [SLUG_A, alumnoId, desde],
  );
  for (let i = 0; i < 3; i++) {
    await sql(
      `insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado)
       values ((select id from public.profesor where slug = $1), $2, $3, (($4::date + $5::int)::text || ' 10:00')::timestamp at time zone '${TZ}',
               (($4::date + $5::int)::text || ' 11:00')::timestamp at time zone '${TZ}', 'confirmada')`,
      [SLUG_A, r.id, alumnoId, desde, i * 7],
    );
  }
}
/** Estado de la base de TODAS las clases `T05 …`: alumno, inicio local, fin local y estado. */
async function fotoBase() {
  return sql<{ n: string; i: string; f: string; e: string }>(
    `select a.nombre n, to_char(c.inicio at time zone '${TZ}','YYYY-MM-DD HH24:MI') i, to_char(c.fin at time zone '${TZ}','HH24:MI') f, c.estado::text e
       from public.clase c join public.alumno a on a.id = c.alumno_id where a.nombre like 'T05 %' order by a.nombre, c.inicio`,
  );
}
const alumna = (nombre: string) => crearAlumno({ nombre, estado: 'aprobado', telefono: '+598 99555333', mail: mailT05('e2e.calarr') });
/** Las clases de un alumno como «YYYY-MM-DD HH:MM HH:MM», en orden. */
const clasesDe = async (nombre: string, estado = 'confirmada') => (await fotoBase()).filter((c) => c.n === `T05 ${nombre}` && c.e === estado).map((c) => `${c.i} ${c.f}`);

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
const GRILLA = [1, 2, 3, 4, 5, 6, 7].flatMap((dia_semana) => [
  { dia_semana, desde: '08:00', hasta: '13:00' },
  { dia_semana, desde: '14:00', hasta: '18:00' },
]);
async function limpiarDatos() {
  await sql(`delete from public.bloqueo where motivo in ('Torneo')`);
  await sql(`delete from public.solicitud where alumno_id in (select id from public.alumno where nombre like 'T05 %')`);
  await limpiarT05();
}
async function limpiar() {
  await limpiarReloj();
  await sql(`update public.profesor set activo = true where slug = $1`, [SLUG_A]);
  await limpiarDatos();
  if (grillaOriginal.length > 0) await ponerGrilla(grillaOriginal);
}
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
  mkdirSync(resolve(RAIZ, 'node_modules', '.cache', 'calendario-arrastre'), { recursive: true });
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
// Localizadores y gestos
// ---------------------------------------------------------------------------------------------------------------------
const calendario = (page: Page) => page.getByRole('group', { name: /^Calendario, / });
const columna = (page: Page, dia: string) => calendario(page).locator(`[data-columna-dia="${dia}"]`);
const huecoEn = (page: Page, dia: string, rango: string) => columna(page, dia).getByRole('button', { name: new RegExp(`${rango}, Libre$`) });
const claseEn = (page: Page, dia: string, rango: string) => columna(page, dia).getByRole('button', { name: new RegExp(`${rango}, (Confirmada|Pendiente)`) });
const dialogoMover = (page: Page) => page.getByRole('dialog', { name: 'Mover clase' });
const exito = (page: Page, texto: RegExp) => page.getByRole('status').filter({ hasText: texto });
const botonCancelar = (page: Page) => dialogoMover(page).getByRole('button', { name: 'Cancelar', exact: true }).first();
const botonMover = (page: Page) => dialogoMover(page).getByRole('button', { name: 'Mover', exact: true });

async function abrir(page: Page, hash: string) {
  await page.goto('about:blank');
  await page.goto(`${ORIGEN}${BASE}${hash}`);
  await expect(page.getByRole('heading', { name: 'Panel', level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect(calendario(page)).toBeVisible({ timeout: 30_000 });
}
const abrirDia = (page: Page, dia: string) => abrir(page, `#/panel?v=dia&d=${dia}`);
const abrirSemana = (page: Page, dia: string) => abrir(page, `#/panel?v=semana&d=${dia}`);

type Punto = { x: number; y: number };
async function centro(l: Locator): Promise<Punto> {
  const b = await l.boundingBox();
  expect(b, 'se mide el elemento').toBeTruthy();
  return { x: b!.x + b!.width / 2, y: b!.y + b!.height / 2 };
}
/** Punto del eje de la columna entre dos etiquetas de hora (p. ej. 13:00 y 14:00): la zona fuera de la grilla. */
async function entreHoras(page: Page, dia: string, h1: string, h2: string): Promise<Punto> {
  const a = await calendario(page).locator('time', { hasText: h1 }).first().boundingBox();
  const b = await calendario(page).locator('time', { hasText: h2 }).first().boundingBox();
  const c = await columna(page, dia).boundingBox();
  expect(a && b && c, 'se miden el eje y la columna').toBeTruthy();
  return { x: c!.x + c!.width / 2, y: (a!.y + a!.height / 2 + b!.y + b!.height / 2) / 2 };
}
/** Mouse: baja sobre `origen`, se aleja de a pasos hasta `destino` y (si `soltar`) suelta. */
async function arrastrar(page: Page, origen: Locator, destino: Punto, opciones: { soltar?: boolean; antesDeSoltar?: () => Promise<void> } = {}) {
  const o = await centro(origen);
  await page.mouse.move(o.x, o.y);
  await page.mouse.down();
  await page.mouse.move(o.x + 8, o.y + 8, { steps: 4 });
  await page.mouse.move(destino.x, destino.y, { steps: 25 });
  if (opciones.antesDeSoltar) await opciones.antesDeSoltar();
  if (opciones.soltar ?? true) await page.mouse.up();
}
/** El gesto terminó sin abrir nada y la clase sigue en su sitio (vista) y la base no cambió. */
async function verificarNadaCambio(page: Page, clase: Locator, antes: Awaited<ReturnType<typeof fotoBase>>) {
  await expect(dialogoMover(page)).toHaveCount(0);
  await expect(clase).toBeVisible();
  await expect(calendario(page)).not.toHaveAttribute('data-arrastrando', /.+/);
  expect(await fotoBase(), 'la base no cambió').toEqual(antes);
}

async function sesion(browser: Browser, ahora?: string) {
  const ctx = await browser.newContext({ locale: 'es-UY', timezoneId: TZ, storageState: SESION, viewport: VIEWPORT });
  if (ahora) await fijarRelojNavegador(ctx, ahora);
  return { ctx, page: await ctx.newPage() };
}
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
const mensajeDe = async (page: Page, texto: RegExp) => (await page.getByText(texto).first().innerText()).trim();

// ---------------------------------------------------------------------------------------------------------------------
test.describe('calendario, arrastre de clases · escritorio', () => {
  // CA-77 ---------------------------------------------------------------------------------------------------------------
  test('T-CA-77-01 CA-77 CAL-13 INV-01 [Día] arrastrar una clase de una serie a un hueco libre y confirmar «De acá en adelante» mueve las siguientes; el foco queda en el bloque movido', async ({ browser, evidencia }) => {
    test.setTimeout(240_000);
    const cu = evidencia({ cu: 'CA-77-dia-serie', titulo: 'Arrastre en Día: serie, «De acá en adelante»', criterios: ['CA-77', 'CAL-13', 'INV-01', 'A11Y-52'], bolt: 'B21' });
    const dia = miercoles();
    const previo = sumarDias(dia, -7);
    const sig = sumarDias(dia, 7);
    await crearSerie(await alumna('Alumna Serie Arr'), previo); // previo, dia, sig, todas a las 10:00
    const { ctx, page } = await sesion(browser);

    await cu.paso('Arrastrar la clase de las 10:00 a mitad de gesto resalta los huecos «Soltar acá»', async () => {
      await abrirDia(page, dia);
      const origen = claseEn(page, dia, '10:00 a 11:00');
      const destino = await centro(huecoEn(page, dia, '11:00 a 12:00'));
      await arrastrar(page, origen, destino, {
        soltar: false,
        antesDeSoltar: async () => {
          await expect(calendario(page)).toHaveAttribute('data-arrastrando', 'true');
          await expect(columna(page, dia).locator('[data-destino]').first()).toContainText('Soltar acá');
        },
      });
      await page.mouse.up();
    }, { esperado: 'Durante el arrastre la grilla marca data-arrastrando y los huecos libres muestran «Soltar acá»' });

    await cu.paso('Al soltar se abre «Mover clase» con el texto del movimiento y el alcance, sin cambiar la base', async () => {
      await expect(dialogoMover(page)).toBeVisible();
      await expect(dialogoMover(page)).toContainText(`Mover la clase de T05 Alumna Serie Arr del`);
      await expect(dialogoMover(page)).toContainText('10:00');
      await expect(dialogoMover(page)).toContainText('11:00');
      await expect(dialogoMover(page).getByRole('radio', { name: 'Solo esta clase' })).toBeChecked();
      expect(await clasesDe('Alumna Serie Arr')).toEqual([`${previo} 10:00 11:00`, `${dia} 10:00 11:00`, `${sig} 10:00 11:00`]);
    }, { esperado: 'El diálogo ofrece «Solo esta clase» (marcado) y «De acá en adelante» y la base sigue igual hasta confirmar' });

    await cu.paso('Confirmar con «De acá en adelante» mueve esta clase y las siguientes a las 11:00', async () => {
      await dialogoMover(page).getByRole('radio', { name: 'De acá en adelante' }).check();
      await botonMover(page).click();
      await expect(exito(page, /Serie movida|Clase movida/)).toBeVisible({ timeout: 20_000 });
      await expect(dialogoMover(page)).toHaveCount(0);
      // La RPC rehace la serie hacia adelante (queda materializada hasta el horizonte): todas las de `dia` en adelante, a las 11:00.
      const todas = await clasesDe('Alumna Serie Arr');
      expect(todas[0], 'la anterior sigue a las 10:00').toBe(`${previo} 10:00 11:00`);
      const desdeAca = todas.filter((c) => c.slice(0, 10) >= dia);
      expect(desdeAca.length).toBeGreaterThanOrEqual(2);
      expect(desdeAca.every((c) => c.endsWith(' 11:00 12:00')), 'esta y las siguientes a las 11:00').toBe(true);
      expect(desdeAca.slice(0, 2).map((c) => c.slice(0, 10))).toEqual([dia, sig]);
      expect(todas.filter((c) => c.slice(0, 10) < dia)).toEqual([`${previo} 10:00 11:00`]);
    }, { esperado: 'Aviso de éxito; en la base la clase anterior sigue a las 10:00 y la de este día y la siguiente están a las 11:00' });

    await cu.paso('El foco queda en el bloque movido y la vista lo muestra en el nuevo hueco', async () => {
      await expect(claseEn(page, dia, '11:00 a 12:00')).toBeVisible({ timeout: 20_000 });
      await expect(claseEn(page, dia, '11:00 a 12:00')).toBeFocused({ timeout: 10_000 });
      await expect(claseEn(page, dia, '10:00 a 11:00')).toHaveCount(0);
    }, { esperado: 'La clase aparece a las 11:00, sin bloque a las 10:00, y tiene el foco del teclado (A11Y-52)' });

    await cu.paso('La semana siguiente la serie también está a las 11:00', async () => {
      await abrirDia(page, sig);
      await expect(claseEn(page, sig, '11:00 a 12:00')).toBeVisible();
      await expect(claseEn(page, sig, '10:00 a 11:00')).toHaveCount(0);
    }, { esperado: 'En el día siguiente de la serie la clase se ve a las 11:00' });
    await ctx.close();
  });

  test('T-CA-77-02 CA-77 CAL-13 INV-01 [Día] «Solo esta clase» en una suelta mueve esa clase y el foco queda en el bloque movido', async ({ browser, evidencia }) => {
    test.setTimeout(240_000);
    const cu = evidencia({ cu: 'CA-77-dia-suelta', titulo: 'Arrastre en Día: clase suelta', criterios: ['CA-77', 'CAL-13', 'A11Y-52'], bolt: 'B21' });
    const dia = miercoles();
    await crearClaseDe(await alumna('Alumna Suelta Arr'), dia, '10:00', 60, 'confirmada');
    const { ctx, page } = await sesion(browser);

    await cu.paso('Arrastrar la clase de las 10:00 al hueco de las 15:00 y soltar', async () => {
      await abrirDia(page, dia);
      await arrastrar(page, claseEn(page, dia, '10:00 a 11:00'), await centro(huecoEn(page, dia, '15:00 a 16:00')));
      await expect(dialogoMover(page)).toBeVisible();
      await expect(dialogoMover(page).getByRole('radio')).toHaveCount(0); // una suelta no ofrece alcance
      await expect(dialogoMover(page)).toContainText('15:00');
    }, { esperado: 'Se abre «Mover clase» sin opciones de alcance (es una clase suelta) y el texto dice 15:00' });

    await cu.paso('Confirmar mueve la clase; la base y la vista lo reflejan y el foco queda en el bloque', async () => {
      await botonMover(page).click();
      await expect(exito(page, new RegExp(`Clase movida al ${ddmm(dia)} 15:00`))).toBeVisible({ timeout: 20_000 });
      expect(await clasesDe('Alumna Suelta Arr')).toEqual([`${dia} 15:00 16:00`]);
      await expect(claseEn(page, dia, '15:00 a 16:00')).toBeVisible({ timeout: 20_000 });
      await expect(claseEn(page, dia, '15:00 a 16:00')).toBeFocused({ timeout: 10_000 });
      await expect(claseEn(page, dia, '10:00 a 11:00')).toHaveCount(0);
    }, { esperado: `Aviso «Clase movida al ${ddmm(dia)} 15:00»; en la base la clase está de 15:00 a 16:00 y tiene el foco` });
    await ctx.close();
  });

  test('T-CA-77-03 CA-77 CAL-13 [Semana] arrastrar a otra hora con «De acá en adelante» y a otro día con «Solo esta clase»', async ({ browser, evidencia }) => {
    test.setTimeout(300_000);
    const cu = evidencia({ cu: 'CA-77-semana', titulo: 'Arrastre en Semana: otro día y serie', criterios: ['CA-77', 'CAL-13', 'INV-01', 'A11Y-52'], bolt: 'B21' });
    const dia = miercoles();
    const jueves = sumarDias(dia, 1);
    const sig = sumarDias(dia, 7);
    await crearSerie(await alumna('Alumna Semana Arr'), dia); // dia, sig, sig+7
    const { ctx, page } = await sesion(browser);

    await cu.paso('Arrastrar la clase del miércoles de las 10:00 al hueco de las 16:00 con «De acá en adelante»', async () => {
      await abrirSemana(page, dia);
      await arrastrar(page, claseEn(page, dia, '10:00 a 11:00'), await centro(huecoEn(page, dia, '16:00 a 17:00')));
      await expect(dialogoMover(page)).toBeVisible();
      await dialogoMover(page).getByRole('radio', { name: 'De acá en adelante' }).check();
      await botonMover(page).click();
      await expect(exito(page, /Serie movida|Clase movida/)).toBeVisible({ timeout: 20_000 });
      const todas = await clasesDe('Alumna Semana Arr');
      expect(todas.length).toBeGreaterThanOrEqual(3);
      expect(todas.every((c) => c.endsWith(' 16:00 17:00')), 'todas a las 16:00').toBe(true);
      expect(todas.slice(0, 3).map((c) => c.slice(0, 10))).toEqual([dia, sig, sumarDias(dia, 14)]);
      await expect(claseEn(page, dia, '16:00 a 17:00')).toBeVisible({ timeout: 20_000 });
      await expect(claseEn(page, dia, '16:00 a 17:00')).toBeFocused({ timeout: 10_000 });
    }, { esperado: 'La clase de este miércoles y las siguientes quedan a las 16:00 en la base; en la vista, con el foco' });

    await cu.paso('Arrastrar la clase de las 16:00 al hueco del jueves 11:00 con «Solo esta clase»', async () => {
      await arrastrar(page, claseEn(page, dia, '16:00 a 17:00'), await centro(huecoEn(page, jueves, '11:00 a 12:00')));
      await expect(dialogoMover(page)).toBeVisible();
      await expect(dialogoMover(page)).toContainText(`${ddmm(jueves)} 11:00`);
      await expect(dialogoMover(page).getByRole('radio', { name: 'Solo esta clase' })).toBeChecked();
      await botonMover(page).click();
      await expect(exito(page, new RegExp(`Clase movida al ${ddmm(jueves)} 11:00`))).toBeVisible({ timeout: 20_000 });
      const resto = await clasesDe('Alumna Semana Arr');
      expect(resto[0], 'base: solo la primera pasa al jueves').toBe(`${jueves} 11:00 12:00`);
      expect(resto.slice(1).every((c) => c.endsWith(' 16:00 17:00')), 'las demás siguen a las 16:00').toBe(true);
      expect(resto.slice(1, 3).map((c) => c.slice(0, 10))).toEqual([sig, sumarDias(dia, 14)]);
      await expect(claseEn(page, jueves, '11:00 a 12:00')).toBeVisible({ timeout: 20_000 });
      await expect(claseEn(page, jueves, '11:00 a 12:00')).toBeFocused({ timeout: 10_000 });
      await expect(columna(page, dia).getByRole('button', { name: /Confirmada/ })).toHaveCount(0);
    }, { esperado: 'La clase pasa al jueves 11:00 en la base y en la vista, con el foco; las otras dos siguen a las 16:00' });
    await ctx.close();
  });

  // CA-78 ---------------------------------------------------------------------------------------------------------------
  test('T-CA-78-01 CA-78 CAL-13 INV-01 [Día] soltar sobre ocupado, bloqueado, fuera de la grilla, Escape y «Cancelar»: la clase vuelve y la base no cambia', async ({ browser, evidencia }) => {
    test.setTimeout(300_000);
    const cu = evidencia({ cu: 'CA-78-dia', titulo: 'Arrastre en Día: destinos inválidos y cancelaciones', criterios: ['CA-78', 'CAL-13', 'INV-01', 'A11Y-52'], bolt: 'B21' });
    const dia = miercoles();
    await crearClaseDe(await alumna('Alumna Origen Arr'), dia, '10:00', 60, 'confirmada');
    await crearClaseDe(await alumna('Alumna Ocupa Arr'), dia, '11:00', 60, 'confirmada');
    await crearBloqueo(dia, '09:00', '10:00', 'Torneo');
    const { ctx, page } = await sesion(browser);
    let antes: Awaited<ReturnType<typeof fotoBase>> = [];
    let origen: Locator;

    await cu.paso('Abrir el día: la clase de las 10:00, una ocupada a las 11:00 y un bloqueo a las 09:00', async () => {
      await abrirDia(page, dia);
      origen = claseEn(page, dia, '10:00 a 11:00');
      await expect(origen).toBeVisible();
      await expect(claseEn(page, dia, '11:00 a 12:00')).toBeVisible();
      await expect(columna(page, dia).getByRole('button', { name: /09:00 a 10:00, Bloqueado, Torneo/ })).toBeVisible();
      antes = await fotoBase();
    }, { esperado: 'Se ven la clase a mover, la clase ocupada y el bloqueo «Torneo»' });

    await cu.paso('Soltar sobre una clase ocupada no abre nada y la clase vuelve', async () => {
      await arrastrar(page, origen, await centro(claseEn(page, dia, '11:00 a 12:00')));
      await verificarNadaCambio(page, origen, antes);
    }, { esperado: 'No se abre «Mover clase», la clase sigue a las 10:00 y la base es la misma' });

    await cu.paso('Soltar sobre un bloqueo no abre nada y la clase vuelve', async () => {
      await arrastrar(page, origen, await centro(columna(page, dia).getByRole('button', { name: /09:00 a 10:00, Bloqueado/ })));
      await verificarNadaCambio(page, origen, antes);
    }, { esperado: 'No se abre «Mover clase» y la base es la misma' });

    await cu.paso('Soltar fuera de la grilla (13:00 a 14:00) no abre nada y la clase vuelve', async () => {
      await arrastrar(page, origen, await entreHoras(page, dia, '13:00', '14:00'));
      await verificarNadaCambio(page, origen, antes);
    }, { esperado: 'No se abre «Mover clase» y la base es la misma' });

    await cu.paso('Escape durante el arrastre cancela el gesto aunque el puntero esté sobre un hueco libre', async () => {
      const libre = await centro(huecoEn(page, dia, '15:00 a 16:00'));
      await arrastrar(page, origen, libre, {
        soltar: false,
        antesDeSoltar: async () => {
          await expect(calendario(page)).toHaveAttribute('data-arrastrando', 'true');
          await page.keyboard.press('Escape');
          await expect(calendario(page)).not.toHaveAttribute('data-arrastrando', /.+/);
        },
      });
      await page.mouse.up();
      await verificarNadaCambio(page, origen, antes);
    }, { esperado: 'Con Escape la grilla deja de estar arrastrando; al soltar no se abre nada y la base es la misma' });

    await cu.paso('Soltar sobre un hueco libre y «Cancelar» en el diálogo: no cambia nada y el foco vuelve al bloque', async () => {
      await arrastrar(page, origen, await centro(huecoEn(page, dia, '15:00 a 16:00')));
      await expect(dialogoMover(page)).toBeVisible();
      expect(await fotoBase(), 'antes de confirmar no hay cambios').toEqual(antes);
      await botonCancelar(page).click();
      await expect(dialogoMover(page)).toHaveCount(0);
      await expect(origen).toBeFocused({ timeout: 10_000 });
      await verificarNadaCambio(page, origen, antes);
    }, { esperado: 'Al cancelar el diálogo se cierra, la clase sigue a las 10:00 con el foco y la base es la misma' });

    await cu.paso('Esc en el diálogo también cancela', async () => {
      await arrastrar(page, origen, await centro(huecoEn(page, dia, '15:00 a 16:00')));
      await expect(dialogoMover(page)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialogoMover(page)).toHaveCount(0);
      await verificarNadaCambio(page, origen, antes);
    }, { esperado: 'El diálogo se cierra y la base es la misma' });
    await ctx.close();
  });

  test('T-CA-78-02 CA-78 [Día] una clase pendiente y una pasada no se arrastran', async ({ browser, evidencia }) => {
    test.setTimeout(240_000);
    const cu = evidencia({ cu: 'CA-78-dia-no-arrastrables', titulo: 'Arrastre en Día: pendientes y pasadas', criterios: ['CA-78', 'CAL-14'], bolt: 'B21' });
    const dia = miercoles();
    const ayer = hoyMasDias(-1);
    await crearClaseDe(await alumna('Alumna Pendiente Arr'), dia, '10:00', 60, 'pendiente');
    await crearClaseDe(await alumna('Alumna Pasada Arr'), ayer, '10:00', 60, 'confirmada');
    const { ctx, page } = await sesion(browser);
    const antes = await fotoBase();

    await cu.paso('Arrastrar una clase pendiente a un hueco libre no abre nada', async () => {
      await abrirDia(page, dia);
      const pendiente = claseEn(page, dia, '10:00 a 11:00');
      await expect(pendiente).toContainText('Pendiente');
      await arrastrar(page, pendiente, await centro(huecoEn(page, dia, '15:00 a 16:00')), {
        antesDeSoltar: async () => {
          await expect(calendario(page)).not.toHaveAttribute('data-arrastrando', /.+/);
        },
      });
      // Un clic suelto sobre un bloque que no se arrastra puede abrir su detalle: solo importa que no haya diálogo de movimiento.
      await verificarNadaCambio(page, pendiente, antes);
    }, { esperado: 'No se activa el arrastre, no se abre «Mover clase» y la base es la misma' });

    await cu.paso('Arrastrar una clase pasada no abre nada', async () => {
      await abrirDia(page, ayer);
      const pasada = claseEn(page, ayer, '10:00 a 11:00');
      await expect(pasada).toBeVisible();
      await arrastrar(page, pasada, await entreHoras(page, ayer, '13:00', '14:00'), {
        antesDeSoltar: async () => {
          await expect(calendario(page)).not.toHaveAttribute('data-arrastrando', /.+/);
        },
      });
      await verificarNadaCambio(page, pasada, antes);
    }, { esperado: 'No se activa el arrastre, no se abre «Mover clase» y la base es la misma' });
    await ctx.close();
  });

  test('T-CA-78-03 CA-78 CAL-13 [Semana] soltar sobre un día pasado, una clase ocupada, fuera de la grilla, Escape y «Cancelar»: nada cambia', async ({ browser, evidencia }) => {
    test.setTimeout(300_000);
    // Reloj fijo en un miércoles (2026-11-04 08:00 Montevideo, base y navegador): la semana visible siempre tiene días pasados (lun, mar) y futuros (jue, vie).
    const AHORA = '2026-11-04T08:00:00-03:00';
    const hoy = '2026-11-04';
    await fijarReloj(AHORA);
    const cu = evidencia({ cu: 'CA-78-semana', titulo: 'Arrastre en Semana: destinos inválidos y cancelaciones', criterios: ['CA-78', 'CAL-13', 'INV-01'], bolt: 'B21' });
    const manana = sumarDias(hoy, 1);
    const pasado = sumarDias(hoy, -(isodow(hoy) - 1)); // el lunes de esta semana (anterior a hoy)
    await crearClaseDe(await alumna('Alumna Origen Sem'), manana, '10:00', 60, 'confirmada');
    await crearClaseDe(await alumna('Alumna Ocupa Sem'), manana, '11:00', 60, 'confirmada');
    const { ctx, page } = await sesion(browser, AHORA);
    let antes: Awaited<ReturnType<typeof fotoBase>> = [];
    let origen: Locator;

    await cu.paso('Abrir la semana actual', async () => {
      await abrirSemana(page, hoy);
      origen = claseEn(page, manana, '10:00 a 11:00');
      await expect(origen).toBeVisible();
      await expect(columna(page, pasado)).toBeVisible();
      antes = await fotoBase();
    }, { esperado: 'Se ve la semana con la clase de mañana a las 10:00 y los días anteriores a hoy' });

    await cu.paso('Soltar sobre un día pasado no abre nada', async () => {
      const c = await columna(page, pasado).boundingBox();
      expect(c).toBeTruthy();
      await arrastrar(page, origen, { x: c!.x + c!.width / 2, y: c!.y + c!.height * 0.4 });
      await verificarNadaCambio(page, origen, antes);
    }, { esperado: 'No se abre «Mover clase», la clase sigue en su lugar y la base es la misma' });

    await cu.paso('Soltar sobre una clase ocupada de otra columna o la misma no abre nada', async () => {
      await arrastrar(page, origen, await centro(claseEn(page, manana, '11:00 a 12:00')));
      await verificarNadaCambio(page, origen, antes);
    }, { esperado: 'No se abre «Mover clase» y la base es la misma' });

    await cu.paso('Soltar fuera de la grilla (13:00 a 14:00) no abre nada', async () => {
      await arrastrar(page, origen, await entreHoras(page, manana, '13:00', '14:00'));
      await verificarNadaCambio(page, origen, antes);
    }, { esperado: 'No se abre «Mover clase» y la base es la misma' });

    await cu.paso('Escape durante el arrastre sobre un hueco libre de otro día cancela el gesto', async () => {
      const dos = sumarDias(hoy, 2);
      const libre = await centro(huecoEn(page, dos, '15:00 a 16:00'));
      await arrastrar(page, origen, libre, {
        soltar: false,
        antesDeSoltar: async () => {
          await expect(calendario(page)).toHaveAttribute('data-arrastrando', 'true');
          await page.keyboard.press('Escape');
          await expect(calendario(page)).not.toHaveAttribute('data-arrastrando', /.+/);
        },
      });
      await page.mouse.up();
      await verificarNadaCambio(page, origen, antes);
    }, { esperado: 'La grilla deja de arrastrar con Escape; al soltar no se abre nada y la base es la misma' });

    await cu.paso('Soltar sobre un hueco libre y «Cancelar» en el diálogo: no cambia nada', async () => {
      await arrastrar(page, origen, await centro(huecoEn(page, manana, '15:00 a 16:00')));
      await expect(dialogoMover(page)).toBeVisible();
      await botonCancelar(page).click();
      await expect(dialogoMover(page)).toHaveCount(0);
      await expect(origen).toBeFocused({ timeout: 10_000 });
      await verificarNadaCambio(page, origen, antes);
    }, { esperado: 'El diálogo se cierra, la clase sigue con el foco y la base es la misma' });
    await ctx.close();
  });

  // CA-79 ---------------------------------------------------------------------------------------------------------------
  test('T-CA-79-02 T-INV-05-03 CA-79 INV-05 CAL-14 [Día y Semana] con el profesor inactivo ninguna clase se arrastra', async ({ browser, evidencia }) => {
    test.setTimeout(300_000);
    const cu = evidencia({ cu: 'CA-79-inactivo', titulo: 'Arrastre con la agenda inactiva', criterios: ['CA-79', 'INV-05', 'CAL-14'], bolt: 'B21' });
    const dia = miercoles();
    await crearClaseDe(await alumna('Alumna Inactiva Arr'), dia, '10:00', 60, 'confirmada');
    const { ctx, page } = await sesion(browser);
    const antes = await fotoBase();

    await cu.paso('Negativo: con la agenda activa el mismo gesto abre «Mover clase»', async () => {
      await abrirDia(page, dia);
      await arrastrar(page, claseEn(page, dia, '10:00 a 11:00'), await centro(huecoEn(page, dia, '15:00 a 16:00')));
      await expect(dialogoMover(page)).toBeVisible();
      await botonCancelar(page).click();
      await expect(dialogoMover(page)).toHaveCount(0);
    }, { esperado: 'Con la agenda activa se abre el diálogo (control del caso)' });

    await sql(`update public.profesor set activo = false where slug = $1`, [SLUG_A]);

    for (const vista of ['Día', 'Semana'] as const) {
      await cu.paso(`Inactivo, vista ${vista}: arrastrar la clase a un hueco libre no hace nada`, async () => {
        if (vista === 'Día') await abrirDia(page, dia);
        else await abrirSemana(page, dia);
        const clase = claseEn(page, dia, '10:00 a 11:00');
        await expect(clase).toBeVisible();
        await arrastrar(page, clase, await centro(huecoEn(page, dia, '15:00 a 16:00')), {
          antesDeSoltar: async () => {
            await expect(calendario(page)).not.toHaveAttribute('data-arrastrando', /.+/);
            await expect(columna(page, dia).locator('[data-destino]')).toHaveCount(0);
          },
        });
        await verificarNadaCambio(page, clase, antes);
      }, { esperado: 'No hay «Soltar acá», no se abre «Mover clase» y la clase sigue a las 10:00 en la base' });
    }
    await ctx.close();
  });

  // CA-87 ---------------------------------------------------------------------------------------------------------------
  test('T-CA-87-03 CA-87 INV-01 un destino que otro ocupa con el diálogo abierto se rechaza con el mismo mensaje de «Mover» y nada cambia', async ({ browser, evidencia }) => {
    test.setTimeout(360_000);
    const cu = evidencia({ cu: 'CA-87-arrastre', titulo: 'Arrastre: destino ocupado entre la lectura y la confirmación', criterios: ['CA-87', 'INV-01', 'CAL-13'], bolt: 'B21' });
    const dia = miercoles();
    const { ctx, page } = await sesion(browser);
    const resultados: { mensaje: string; clases: string[] }[] = [];

    await cu.paso('Arrastrar la clase de las 10:00 al hueco libre de las 11:00 y abrir la confirmación', async () => {
      await limpiarDatos();
      await crearClaseDe(await alumna('Alumna Carrera Arr'), dia, '10:00', 60, 'confirmada');
      await abrirDia(page, dia);
      await arrastrar(page, claseEn(page, dia, '10:00 a 11:00'), await centro(huecoEn(page, dia, '11:00 a 12:00')));
      await expect(dialogoMover(page)).toBeVisible();
    }, { esperado: 'Se abre «Mover clase» para el hueco de las 11:00' });

    await cu.paso('Otra persona ocupa las 11:00 con el diálogo abierto y «Mover» se rechaza', async () => {
      await crearClaseDe(await alumna('Alumna Ocupante Arr'), dia, '11:00', 60, 'confirmada');
      await botonMover(page).click();
      await expect(dialogoMover(page).getByText('No se pudo mover; no se cambió nada')).toBeVisible({ timeout: 20_000 });
      const mensaje = await mensajeDe(page, /ya no está libre/i);
      const clases = (await fotoBase()).map((c) => `${c.n} ${c.i} ${c.f} ${c.e}`);
      expect(clases, 'la clase sigue a las 10:00 y solo el ocupante está a las 11:00').toEqual([
        `T05 Alumna Carrera Arr ${dia} 10:00 11:00 confirmada`,
        `T05 Alumna Ocupante Arr ${dia} 11:00 12:00 confirmada`,
      ]);
      resultados.push({ mensaje, clases });
      test.info().annotations.push({ type: 'rechazo (arrastre)', description: mensaje });
    }, { esperado: 'El diálogo sigue abierto con «No se pudo mover; no se cambió nada» y el motivo; la base no cambió' });

    await cu.paso('Cancelar deja la vista releída: la clase en las 10:00 y el ocupante en las 11:00', async () => {
      await botonCancelar(page).click();
      await expect(dialogoMover(page)).toHaveCount(0);
      await expect(claseEn(page, dia, '10:00 a 11:00')).toBeVisible();
      await expect(claseEn(page, dia, '11:00 a 12:00')).toContainText('Alumna Ocupante Arr', { timeout: 20_000 });
    }, { esperado: 'La agenda se volvió a leer y muestra al ocupante a las 11:00' });

    await cu.paso('El mismo escenario con «Mover» del detalle da el mismo mensaje y la misma base', async () => {
      await limpiarDatos();
      await crearClaseDe(await alumna('Alumna Carrera Arr'), dia, '10:00', 60, 'confirmada');
      await abrirDia(page, dia);
      await claseEn(page, dia, '10:00 a 11:00').click();
      await page.getByRole('complementary').getByRole('button', { name: 'Mover', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Mover la clase', level: 3 })).toBeVisible();
      await page.getByRole('radio', { name: '11:00 a 12:00' }).check();
      await crearClaseDe(await alumna('Alumna Ocupante Arr'), dia, '11:00', 60, 'confirmada');
      await page.getByRole('button', { name: 'Mover clase' }).click();
      const mensaje = await mensajeDe(page, /ya no está libre/i);
      const clases = (await fotoBase()).map((c) => `${c.n} ${c.i} ${c.f} ${c.e}`);
      resultados.push({ mensaje, clases });
      test.info().annotations.push({ type: 'rechazo (Mover)', description: mensaje });
      expect(resultados[1]).toEqual(resultados[0]);
    }, { esperado: 'Mismo mensaje y misma base con el arrastre y con «Mover»' });
    await ctx.close();
  });
});
