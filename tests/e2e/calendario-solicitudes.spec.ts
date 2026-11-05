// E2E de responder solicitudes y copiar el enlace del día en el calendario del Panel (B19, T19.3): CA-76, CA-84 · INV-03, INV-04 ·
// CAL-12, CAL-20 · DEC-42 A (el destino pendiente de un movimiento es un bloque PENDIENTE; el origen sigue CONFIRMADO) y DEC-43 A (la clase
// con cancelación pendiente se ve CONFIRMADA con «Cancelación pendiente» y se responde desde su detalle).
// Escritorio (1280x900). Reloj real salvo CA-84, que fija el viernes 30/10/2026 (navegador con el desfase de Date de agenda.spec.ts, base con
// `fijarReloj`; page.clock rompe TZDate). Datos sintéticos con prefijo `T05 `, que se limpian; la grilla del profesor A se restaura al final.
// El mail del motivo se lee de la cola `mail_salida` (tipo `solicitud_respondida`, cuerpo_texto), como la prueba de integración de CA-76.
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { expect, test } from '../soporte/evidencia';
import { cerrar, sql } from '../soporte/bd';
import { SITEKEY_PRUEBA } from '../soporte/captcha';
import { esperarMail, contarMails, vaciarBuzon } from '../soporte/correo';
import { entorno, RAIZ } from '../soporte/entorno';
import { fijarReloj, limpiarReloj } from '../soporte/reloj';
import { MAIL_PROFESOR, SLUG_A } from '../soporte/usuarios';
import { crearAlumno, limpiarT05, mailT05 } from '../integracion/cuentas/ayuda';

const BASE = process.env.RTC_BASE ?? '/reservas/';
const ORIGEN = process.env.BASE_URL ?? `http://127.0.0.1:${process.env.RTC_PREVIEW_PORT || '4173'}`;
const TZ = 'America/Montevideo';
const SESION = resolve(RAIZ, 'node_modules', '.cache', 'calendario-solicitudes', 'sesion-profesor.json');
const VIEWPORT = { width: 1280, height: 900 };
const VIERNES = '2026-10-30';
const MENSAJE_VENCIDA = 'Esa solicitud venció: su horario ya pasó.';
const AHORA_VIERNES = '2026-10-30T12:00:00-03:00';

// ---------------------------------------------------------------------------------------------------------------------
// Fechas y datos
// ---------------------------------------------------------------------------------------------------------------------
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const titulo = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;
/** Un miércoles a 8 o más días de hoy. */
function miercoles(): string {
  const d = new Date(Date.now() + 8 * 86_400_000);
  while (new Date(fmt.format(d) + 'T12:00:00Z').getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  return fmt.format(d);
}

type Estado = 'confirmada' | 'pendiente';
/** Una clase de 60 min a las `hora` (Montevideo) del `dia` con su reserva suelta. */
async function crearClaseDe(alumnoId: string, dia: string, hora: string, estado: Estado, observacion: string | null = null): Promise<{ claseId: string; reservaId: string; inicio: string }> {
  const inicio = `${dia}T${hora}:00-03:00`;
  const [r] = await sql<{ id: string }>(
    `insert into public.reserva (profesor_id, alumno_id, tipo, hora_local, dia_semana, duracion_min, estado, desde, origen, observacion)
     values ((select id from public.profesor where slug = $1), $2, 'suelta',
             (($3::timestamptz) at time zone '${TZ}')::time,
             extract(isodow from ($3::timestamptz) at time zone '${TZ}')::smallint,
             60, $4, (($3::timestamptz) at time zone '${TZ}')::date, $5, $6) returning id`,
    [SLUG_A, alumnoId, inicio, estado, estado === 'pendiente' ? 'solicitud' : 'profesor', observacion],
  );
  const [c] = await sql<{ id: string }>(
    `insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado)
     values ((select id from public.profesor where slug = $1), $2, $3, $4::timestamptz, $4::timestamptz + interval '60 minutes', $5) returning id`,
    [SLUG_A, r.id, alumnoId, inicio, estado],
  );
  return { claseId: c.id, reservaId: r.id, inicio };
}
async function crearSolicitud(alumnoId: string, tipo: 'reserva' | 'movimiento' | 'cancelacion', fecha: string, reservaId: string | null, claseId: string | null): Promise<string> {
  const [s] = await sql<{ id: string }>(
    `insert into public.solicitud (profesor_id, alumno_id, tipo, alcance, reserva_id, clase_id, fecha_clase, estado)
     values ((select id from public.profesor where slug = $1), $2, $3, $4, $5, $6, $7::timestamptz, 'pendiente') returning id`,
    [SLUG_A, alumnoId, tipo, tipo === 'reserva' ? null : 'solo_esta', reservaId, claseId, fecha],
  );
  return s.id;
}
/** Alumna con una solicitud de reserva pendiente (reserva y clase PENDIENTES) a las `hora` del `dia`. */
async function reservaPendiente(nombre: string, dia: string, hora: string, observacion: string | null = null) {
  const alumnoId = await alumna(nombre);
  const c = await crearClaseDe(alumnoId, dia, hora, 'pendiente', observacion);
  const solicitudId = await crearSolicitud(alumnoId, 'reserva', c.inicio, c.reservaId, null);
  return { alumnoId, solicitudId, ...c };
}
/** Alumna con un movimiento pendiente: origen CONFIRMADO a `horaOrigen`, destino PENDIENTE a `horaDestino`. */
async function movimientoPendiente(nombre: string, dia: string, horaOrigen: string, horaDestino: string) {
  const alumnoId = await alumna(nombre);
  const origen = await crearClaseDe(alumnoId, dia, horaOrigen, 'confirmada');
  const destino = await crearClaseDe(alumnoId, dia, horaDestino, 'pendiente');
  const solicitudId = await crearSolicitud(alumnoId, 'movimiento', origen.inicio, destino.reservaId, origen.claseId);
  return { alumnoId, solicitudId, origen, destino };
}
/** Alumna con una clase CONFIRMADA y una cancelación pendiente. */
async function cancelacionPendiente(nombre: string, dia: string, hora: string) {
  const alumnoId = await alumna(nombre);
  const c = await crearClaseDe(alumnoId, dia, hora, 'confirmada');
  const solicitudId = await crearSolicitud(alumnoId, 'cancelacion', c.inicio, null, c.claseId);
  return { alumnoId, solicitudId, ...c };
}
const alumna = (nombre: string) => crearAlumno({ nombre, estado: 'aprobado', telefono: '+598 99555444', mail: mailT05('e2e.calsol') });

const estadoSolicitud = async (id: string) => (await sql<{ estado: string; motivo: string | null }>(`select estado::text, motivo from public.solicitud where id = $1`, [id]))[0];
const estadoClase = async (id: string) => (await sql<{ e: string }>(`select estado::text e from public.clase where id = $1`, [id]))[0].e;
/** Estado normalizado de la base para un alumno: clases, reservas y solicitudes. */
async function fotoBase(nombre: string) {
  const al = `(select id from public.alumno where nombre = 'T05 ${nombre}')`;
  const clases = await sql<{ i: string; e: string }>(`select to_char(inicio at time zone '${TZ}','YYYY-MM-DD HH24:MI') i, estado::text e from public.clase where alumno_id = ${al} order by inicio`);
  const reservas = await sql<{ t: string; e: string }>(`select tipo::text t, estado::text e from public.reserva where alumno_id = ${al} order by estado, tipo`);
  const solicitudes = await sql<{ t: string; e: string; m: string | null }>(`select tipo::text t, estado::text e, motivo m from public.solicitud where alumno_id = ${al} order by tipo`);
  return { clases, reservas, solicitudes };
}
/** El mail de respuesta encolado para el alumno: tipo, asunto y cuerpo (el motivo va en el cuerpo, AVI-03). */
async function mailDeRespuesta(nombre: string) {
  const filas = await sql<{ tipo: string; asunto: string | null; cuerpo: string | null; destinatario: string | null }>(
    `select tipo, asunto, cuerpo_texto cuerpo, destinatario from public.mail_salida
      where alumno_id = (select id from public.alumno where nombre = 'T05 ${nombre}') and tipo = 'solicitud_respondida'`,
  );
  return filas;
}

let grillaOriginal: { dia_semana: number; desde: string; hasta: string }[] = [];
const leerGrilla = () => sql<{ dia_semana: number; desde: string; hasta: string }>(`select dia_semana::int, desde::text, hasta::text from public.grilla_tramo where profesor_id = (select id from public.profesor where slug = $1)`, [SLUG_A]);
async function ponerGrilla(tramos: { dia_semana: number; desde: string; hasta: string }[]) {
  const p = `(select id from public.profesor where slug = $1)`;
  await sql(`delete from public.grilla_tramo where profesor_id = ${p}`, [SLUG_A]);
  for (const t of tramos) await sql(`insert into public.grilla_tramo (profesor_id, dia_semana, desde, hasta) values (${p}, $2, $3, $4)`, [SLUG_A, t.dia_semana, t.desde, t.hasta]);
}
/** De lunes a viernes, 08:00-13:00 y 14:00-18:00. */
const GRILLA = [1, 2, 3, 4, 5].flatMap((dia_semana) => [
  { dia_semana, desde: '08:00', hasta: '13:00' },
  { dia_semana, desde: '14:00', hasta: '18:00' },
]);
async function limpiarDatos() {
  await sql(`delete from public.solicitud where alumno_id in (select id from public.alumno where nombre like 'T05 %')`);
  await limpiarT05();
}
async function limpiar() {
  await limpiarReloj();
  await sql(`update public.profesor set activo = true where slug = $1`, [SLUG_A]);
  await limpiarDatos();
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
  mkdirSync(resolve(RAIZ, 'node_modules', '.cache', 'calendario-solicitudes'), { recursive: true });
  await vaciarBuzon(); // Mailpit conserva 500 mensajes: con el buzón lleno el contador de `esperarMail` deja de crecer
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

async function sesion(browser: Browser, permisos: string[] = []) {
  const ctx = await browser.newContext({ locale: 'es-UY', timezoneId: TZ, storageState: SESION, viewport: VIEWPORT, permissions: permisos });
  return { ctx, page: await ctx.newPage() };
}
/** Reloj del navegador en `iso` sin page.clock (rompe TZDate): un Proxy de Date con desfase fijo; el tiempo sigue corriendo. */
async function fijarRelojNavegador(page: Page, iso: string) {
  await page.addInitScript((objetivo: number) => {
    const Real = Date;
    const desfase = objetivo - Real.now();
    window.Date = new Proxy(Real, {
      construct: (t, args, nt) => Reflect.construct(t, args.length ? args : [Real.now() + desfase], nt),
      get: (t, k, r) => (k === 'now' ? () => Real.now() + desfase : Reflect.get(t, k, r)),
    });
  }, Date.parse(iso));
}

// ---------------------------------------------------------------------------------------------------------------------
// Localizadores
// ---------------------------------------------------------------------------------------------------------------------
const h2Dia = (page: Page, dia: string) => page.getByRole('heading', { level: 2, name: titulo(dia) });
const calendario = (page: Page) => page.getByRole('group', { name: /^Calendario, / });
const detalle = (page: Page) => page.getByRole('dialog').or(page.getByRole('complementary'));
const huecoCal = (page: Page, rango: string) => calendario(page).getByRole('button', { name: new RegExp(`${rango}, Libre$`) });
const pendienteCal = (page: Page, nombre: string) => calendario(page).getByRole('button', { name: new RegExp(`Pendiente, .*${nombre}`) });
const confirmadaCal = (page: Page, nombre: string) => calendario(page).getByRole('button', { name: new RegExp(`Confirmada, .*${nombre}`) });
const aviso = (page: Page, texto: string | RegExp) => page.getByRole('status').filter({ hasText: texto });
const marcarPagina = (page: Page) => page.evaluate(() => Object.assign(window, { __sinRecarga: 1 }));
const sigueLaPagina = (page: Page) => page.evaluate(() => (window as unknown as { __sinRecarga?: number }).__sinRecarga === 1);

async function abrir(page: Page, hash: string) {
  await page.goto('about:blank');
  await page.goto(`${ORIGEN}${BASE}${hash}`);
  await expect(page.getByRole('heading', { name: 'Panel', level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect(calendario(page)).toBeVisible({ timeout: 30_000 });
}
async function abrirLista(page: Page) {
  await page.goto('about:blank');
  await page.goto(`${ORIGEN}${BASE}#/lista`);
  await expect(page.getByRole('heading', { name: 'Solicitudes pendientes', level: 2 })).toBeVisible({ timeout: 30_000 });
}
const botonLista = (page: Page, accion: 'Confirmar' | 'Rechazar', nombre: string) => page.getByRole('button', { name: new RegExp(`^${accion} la solicitud de T05 ${nombre}`) });

// ---------------------------------------------------------------------------------------------------------------------
test.describe('calendario Día, solicitudes y enlace · escritorio', () => {
  test('T-CA-76-01 CA-76 CAL-12 confirmar una reserva pendiente desde el calendario la pasa a CONFIRMADA sin recargar y anuncia «Clase confirmada»', async ({ browser, evidencia }) => {
    test.setTimeout(240_000);
    const cu = evidencia({ cu: 'WEB-14-solicitudes-ca76-confirmar', titulo: 'Calendario Día: confirmar una reserva pendiente', criterios: ['CA-76', 'CAL-12', 'WEB-14'], bolt: 'B19' });
    const dia = miercoles();
    const s = await reservaPendiente('Alumna Confirma Cal', dia, '10:00', 'Primera clase E2E');
    const { ctx, page } = await sesion(browser);

    await cu.paso('Abrir el día: la solicitud es un bloque PENDIENTE', async () => {
      await abrir(page, `#/panel?d=${dia}`);
      await expect(pendienteCal(page, 'Alumna Confirma Cal')).toBeVisible();
      await marcarPagina(page);
    }, { esperado: 'La grilla muestra el bloque PENDIENTE de la alumna a las 10:00' });

    await cu.paso('Tocar el bloque ofrece «Confirmar» y «Rechazar»', async () => {
      await pendienteCal(page, 'Alumna Confirma Cal').click();
      await expect(detalle(page).getByRole('button', { name: 'Confirmar', exact: true })).toBeEnabled();
      await expect(detalle(page).getByRole('button', { name: 'Rechazar', exact: true })).toBeEnabled();
    }, { esperado: 'El detalle ofrece «Confirmar» y «Rechazar» habilitados' });

    await cu.paso('Confirmar: pasa a CONFIRMADA sin recargar la página', async () => {
      await detalle(page).getByRole('button', { name: 'Confirmar', exact: true }).click();
      await expect(aviso(page, 'Clase confirmada')).toBeVisible({ timeout: 20_000 });
      await expect(confirmadaCal(page, 'Alumna Confirma Cal')).toBeVisible({ timeout: 20_000 });
      await expect(pendienteCal(page, 'Alumna Confirma Cal')).toHaveCount(0);
      expect(await sigueLaPagina(page), 'la página no se recargó').toBe(true);
      expect((await estadoSolicitud(s.solicitudId)).estado).toBe('confirmada');
      expect(await estadoClase(s.claseId)).toBe('confirmada');
    }, { esperado: 'Aparece «Clase confirmada», el bloque pasa a CONFIRMADA sin recargar y la solicitud y la clase quedan confirmadas en la base' });
    await ctx.close();
  });

  test('T-CA-76-02 CA-76 CAL-12 rechazar con motivo saca el bloque, el hueco vuelve a ser libre y el mail al alumno lleva el motivo', async ({ browser, evidencia }) => {
    test.setTimeout(240_000);
    const cu = evidencia({ cu: 'WEB-14-solicitudes-ca76-rechazar', titulo: 'Calendario Día: rechazar una reserva con motivo', criterios: ['CA-76', 'CAL-12', 'WEB-14'], bolt: 'B19' });
    const dia = miercoles();
    const motivo = 'Estoy de licencia E2E';
    const s = await reservaPendiente('Alumna Rechaza Cal', dia, '10:00');
    const { ctx, page } = await sesion(browser);

    await cu.paso('Rechazar abre el diálogo con «Motivo (opcional)»', async () => {
      await abrir(page, `#/panel?d=${dia}`);
      await pendienteCal(page, 'Alumna Rechaza Cal').click();
      await detalle(page).getByRole('button', { name: 'Rechazar', exact: true }).click();
      const d = page.getByRole('dialog', { name: 'Rechazar la solicitud de T05 Alumna Rechaza Cal' });
      await expect(d).toBeVisible();
      await expect(d.getByRole('textbox', { name: 'Motivo (opcional)' })).toBeVisible();
      await expect(d.getByText('La persona recibe este motivo en el mail de respuesta. Hasta 500 caracteres.')).toBeVisible();
    }, { esperado: 'Se abre «Rechazar la solicitud de <nombre>» con el campo «Motivo (opcional)» y el aviso del mail' });

    await cu.paso('Rechazar con motivo: el bloque desaparece y el hueco vuelve a ser libre', async () => {
      const d = page.getByRole('dialog', { name: 'Rechazar la solicitud de T05 Alumna Rechaza Cal' });
      await d.getByRole('textbox', { name: 'Motivo (opcional)' }).fill(motivo);
      await d.getByRole('button', { name: 'Rechazar solicitud' }).click();
      await expect(aviso(page, 'Clase rechazada')).toBeVisible({ timeout: 20_000 });
      await expect(pendienteCal(page, 'Alumna Rechaza Cal')).toHaveCount(0);
      await expect(huecoCal(page, '10:00 a 11:00')).toBeVisible({ timeout: 20_000 });
      expect(await estadoSolicitud(s.solicitudId)).toEqual({ estado: 'rechazada', motivo });
    }, { esperado: 'Aparece «Clase rechazada», el bloque ya no está, el horario de las 10:00 es un hueco libre y la solicitud queda rechazada con el motivo' });

    await cu.paso('El mail encolado para el alumno lleva el motivo', async () => {
      await expect.poll(async () => (await mailDeRespuesta('Alumna Rechaza Cal')).length, { timeout: 20_000 }).toBeGreaterThan(0);
      const [m] = await mailDeRespuesta('Alumna Rechaza Cal');
      test.info().annotations.push({ type: 'mail al alumno', description: `${m.asunto ?? ''} | ${m.cuerpo ?? ''}`.replace(/\s+/g, ' ') });
      expect(m.cuerpo ?? '').toContain(motivo);
    }, { esperado: 'En la cola de mails hay un «solicitud_respondida» para el alumno cuyo cuerpo contiene el motivo' });
    await ctx.close();
  });

  test('T-CA-76-03 CA-76 CAL-12 DEC-42 movimiento: el destino PENDIENTE se rechaza o confirma desde el calendario y el origen sigue CONFIRMADO hasta responder', async ({ browser, evidencia }) => {
    test.setTimeout(300_000);
    const cu = evidencia({ cu: 'WEB-14-solicitudes-ca76-movimiento', titulo: 'Calendario Día: responder una solicitud de movimiento', criterios: ['CA-76', 'CAL-12', 'DEC-42', 'WEB-14'], bolt: 'B19' });
    const dia = miercoles();
    const { ctx, page } = await sesion(browser);

    for (const decision of ['rechazar', 'confirmar'] as const) {
      await limpiarDatos();
      const nombre = decision === 'rechazar' ? 'Alumna Mueve Rechaza' : 'Alumna Mueve Confirma';
      const m = await movimientoPendiente(nombre, dia, '10:00', '11:00');

      await cu.paso(`Movimiento pendiente (${decision}): el origen sigue CONFIRMADO y el destino es un bloque PENDIENTE`, async () => {
        await abrir(page, `#/panel?d=${dia}`);
        await expect(confirmadaCal(page, nombre)).toBeVisible();
        await expect(pendienteCal(page, nombre)).toBeVisible();
        await confirmadaCal(page, nombre).click();
        await expect(detalle(page).getByRole('button', { name: 'Confirmar', exact: true })).toHaveCount(0);
        await expect(detalle(page).getByRole('button', { name: 'Rechazar', exact: true })).toHaveCount(0);
        await detalle(page).getByRole('button', { name: 'Cerrar' }).click();
        expect(await estadoClase(m.origen.claseId), 'origen confirmado antes de responder').toBe('confirmada');
      }, { esperado: 'El origen a las 10:00 es CONFIRMADO y sin Confirmar/Rechazar; el destino a las 11:00 es PENDIENTE' });

      await cu.paso(`Movimiento pendiente: ${decision} el destino desde el calendario`, async () => {
        await marcarPagina(page);
        await pendienteCal(page, nombre).click();
        if (decision === 'confirmar') {
          await detalle(page).getByRole('button', { name: 'Confirmar', exact: true }).click();
          await expect(aviso(page, 'Clase confirmada')).toBeVisible({ timeout: 20_000 });
          await expect(pendienteCal(page, nombre)).toHaveCount(0, { timeout: 20_000 });
          expect((await estadoSolicitud(m.solicitudId)).estado).toBe('confirmada');
          expect(await estadoClase(m.destino.claseId), 'el destino queda confirmado').toBe('confirmada');
        } else {
          await detalle(page).getByRole('button', { name: 'Rechazar', exact: true }).click();
          await page.getByRole('dialog', { name: `Rechazar la solicitud de T05 ${nombre}` }).getByRole('button', { name: 'Rechazar solicitud' }).click();
          await expect(aviso(page, 'Clase rechazada')).toBeVisible({ timeout: 20_000 });
          await expect(pendienteCal(page, nombre)).toHaveCount(0, { timeout: 20_000 });
          await expect(huecoCal(page, '11:00 a 12:00')).toBeVisible();
          await expect(confirmadaCal(page, nombre)).toBeVisible();
          expect((await estadoSolicitud(m.solicitudId)).estado).toBe('rechazada');
          expect(await estadoClase(m.origen.claseId), 'el origen sigue confirmado').toBe('confirmada');
        }
        expect(await sigueLaPagina(page), 'la página no se recargó').toBe(true);
        const f = await fotoBase(nombre);
        test.info().annotations.push({ type: `base (${decision})`, description: JSON.stringify(f) });
      }, { esperado: decision === 'confirmar' ? 'Aparece «Clase confirmada», el destino deja de ser PENDIENTE y la solicitud queda confirmada' : 'Aparece «Clase rechazada», el destino sale, el hueco de las 11:00 vuelve a ser libre y el origen sigue CONFIRMADO' });
    }
    await ctx.close();
  });

  test('T-CA-76-03 CA-76 CAL-12 DEC-43 cancelación: la clase CONFIRMADA muestra «Cancelación pendiente» y se rechaza o confirma desde su detalle', async ({ browser, evidencia }) => {
    test.setTimeout(300_000);
    const cu = evidencia({ cu: 'WEB-14-solicitudes-ca76-cancelacion', titulo: 'Calendario Día: responder una solicitud de cancelación', criterios: ['CA-76', 'CAL-12', 'DEC-43', 'WEB-14'], bolt: 'B19' });
    const dia = miercoles();
    const a = await cancelacionPendiente('Alumna Cancela Rechaza', dia, '10:00');
    const b = await cancelacionPendiente('Alumna Cancela Confirma', dia, '11:00');
    const { ctx, page } = await sesion(browser);

    await cu.paso('Las dos clases se ven CONFIRMADAS con «Cancelación pendiente»', async () => {
      await abrir(page, `#/panel?d=${dia}`);
      for (const n of ['Alumna Cancela Rechaza', 'Alumna Cancela Confirma']) {
        const bloque = calendario(page).getByRole('button', { name: new RegExp(`Confirmada, Cancelación pendiente, .*${n}`) });
        await expect(bloque).toBeVisible();
        await expect(bloque).toContainText('Cancelación pendiente');
        await expect(pendienteCal(page, n)).toHaveCount(0);
      }
      await marcarPagina(page);
    }, { esperado: 'Ambas clases son CONFIRMADAS (no PENDIENTES) y dicen «Cancelación pendiente» como texto' });

    await cu.paso('Rechazar la cancelación desde el detalle: la clase sigue confirmada y sin la marca', async () => {
      await confirmadaCal(page, 'Alumna Cancela Rechaza').click();
      await expect(detalle(page).getByRole('button', { name: 'Confirmar', exact: true })).toBeEnabled();
      await detalle(page).getByRole('button', { name: 'Rechazar', exact: true }).click();
      await page.getByRole('dialog', { name: 'Rechazar la solicitud de T05 Alumna Cancela Rechaza' }).getByRole('button', { name: 'Rechazar solicitud' }).click();
      await expect(aviso(page, 'Clase rechazada')).toBeVisible({ timeout: 20_000 });
      await expect(calendario(page).getByRole('button', { name: /Confirmada, .*Alumna Cancela Rechaza/ })).toBeVisible();
      await expect(calendario(page).getByRole('button', { name: /Cancelación pendiente, .*Alumna Cancela Rechaza/ })).toHaveCount(0, { timeout: 20_000 });
      expect((await estadoSolicitud(a.solicitudId)).estado).toBe('rechazada');
      expect(await estadoClase(a.claseId)).toBe('confirmada');
    }, { esperado: 'Aparece «Clase rechazada», la clase sigue CONFIRMADA sin «Cancelación pendiente» y la solicitud queda rechazada' });

    await cu.paso('Confirmar la cancelación desde el detalle: la clase sale del calendario', async () => {
      await confirmadaCal(page, 'Alumna Cancela Confirma').click();
      await detalle(page).getByRole('button', { name: 'Confirmar', exact: true }).click();
      await expect(aviso(page, 'Clase confirmada')).toBeVisible({ timeout: 20_000 });
      await expect(calendario(page).getByRole('button', { name: /Alumna Cancela Confirma/ })).toHaveCount(0, { timeout: 20_000 });
      await expect(huecoCal(page, '11:00 a 12:00')).toBeVisible();
      expect((await estadoSolicitud(b.solicitudId)).estado).toBe('confirmada');
      expect(await estadoClase(b.claseId)).toBe('cancelada');
      expect(await sigueLaPagina(page), 'la página no se recargó').toBe(true);
    }, { esperado: 'Aparece «Clase confirmada», la clase queda cancelada en la base, ya no está en la grilla y su horario es un hueco libre' });
    await ctx.close();
  });

  test('T-CA-76-04 CA-76 CAL-12 una solicitud que venció entre la lectura y la respuesta muestra el mismo mensaje que la Lista y relee la agenda', async ({ browser, evidencia }) => {
    test.setTimeout(300_000);
    const cu = evidencia({ cu: 'WEB-14-solicitudes-ca76-vencida', titulo: 'Calendario Día: responder una solicitud vencida', criterios: ['CA-76', 'CAL-12', 'WEB-14'], bolt: 'B19' });
    const dia = miercoles();
    const resultados: string[] = [];
    const { ctx, page } = await sesion(browser);
    let lecturas = 0;
    await page.route(/\/rpc\/agenda_profesor_dias/, async (ruta) => {
      lecturas++;
      await ruta.continue();
    });
    const vencer = (id: string) => sql(`update public.solicitud set fecha_clase = fecha_clase - interval '40 days' where id = $1`, [id]);

    await cu.paso('Calendario: la solicitud vence mientras el detalle está abierto y al confirmar se muestra el mensaje', async () => {
      const s = await reservaPendiente('Alumna Vencida Cal', dia, '10:00');
      await abrir(page, `#/panel?d=${dia}`);
      await pendienteCal(page, 'Alumna Vencida Cal').click();
      await expect(detalle(page).getByRole('button', { name: 'Confirmar', exact: true })).toBeEnabled();
      await vencer(s.solicitudId);
      const antes = lecturas;
      await detalle(page).getByRole('button', { name: 'Confirmar', exact: true }).click();
      const alerta = page.getByRole('alert').filter({ hasText: 'venció' });
      await expect(alerta).toBeVisible({ timeout: 20_000 });
      resultados.push((await alerta.innerText()).replace(/\s+/g, ' ').trim());
      await expect.poll(() => lecturas, { timeout: 20_000 }).toBeGreaterThan(antes);
      expect((await estadoSolicitud(s.solicitudId)).estado, 'no se respondió').toBe('pendiente');
      test.info().annotations.push({ type: 'vencida (calendario)', description: resultados[0] });
    }, { esperado: 'Aparece «Esa solicitud venció: su horario ya pasó.» en una alerta, la agenda se vuelve a leer y la solicitud sigue pendiente en la base' });

    await cu.paso('Lista: la misma solicitud vencida da el mismo mensaje', async () => {
      await limpiarDatos();
      const s = await reservaPendiente('Alumna Vencida Lis', dia, '10:00');
      await abrirLista(page);
      await expect(botonLista(page, 'Confirmar', 'Alumna Vencida Lis')).toBeEnabled();
      await vencer(s.solicitudId);
      await botonLista(page, 'Confirmar', 'Alumna Vencida Lis').click();
      await expect(page.getByText(MENSAJE_VENCIDA).first()).toBeVisible({ timeout: 20_000 });
      test.info().annotations.push({ type: 'vencida (lista)', description: MENSAJE_VENCIDA });
      expect(resultados[0]).toContain(MENSAJE_VENCIDA);
    }, { esperado: 'La Lista muestra el mismo texto «Esa solicitud venció: su horario ya pasó.»' });
    await ctx.close();
  });

  test('T-INV-04-02 INV-04 CA-76 responder desde el calendario y desde la Lista deja el mismo estado y el mismo aviso al alumno, y la Lista sigue mostrando el resto', async ({ browser, evidencia }) => {
    test.setTimeout(300_000);
    const cu = evidencia({ cu: 'WEB-14-solicitudes-inv04-comparar', titulo: 'Confirmar una solicitud: calendario y Lista dan lo mismo', criterios: ['INV-04', 'CA-76', 'CAL-12', 'WEB-14'], bolt: 'B19' });
    const dia = miercoles();
    const { ctx, page } = await sesion(browser);
    const resultados: { foto: Awaited<ReturnType<typeof fotoBase>>; mails: { tipo: string; asunto: string | null; cuerpo: string | null }[] }[] = [];

    for (const via of ['calendario', 'lista'] as const) {
      await cu.paso(`Confirmar la solicitud de las 10:00 desde ${via === 'calendario' ? 'el calendario' : 'la Lista'} con otra solicitud pendiente a las 11:00`, async () => {
        await limpiarDatos();
        await reservaPendiente('Alumna Compara', dia, '10:00', 'Clase comparada');
        await reservaPendiente('Alumna Resto', dia, '11:00');
        if (via === 'calendario') {
          await abrir(page, `#/panel?d=${dia}`);
          await pendienteCal(page, 'Alumna Compara').click();
          await detalle(page).getByRole('button', { name: 'Confirmar', exact: true }).click();
          await expect(aviso(page, 'Clase confirmada')).toBeVisible({ timeout: 20_000 });
        } else {
          await abrirLista(page);
          await botonLista(page, 'Confirmar', 'Alumna Compara').click();
          await expect(page.getByText('Solicitud confirmada. Le avisamos por mail.')).toBeVisible({ timeout: 20_000 });
        }
        await expect.poll(async () => (await mailDeRespuesta('Alumna Compara')).length, { timeout: 20_000 }).toBe(1);
        const mails = (await mailDeRespuesta('Alumna Compara')).map(({ tipo, asunto, cuerpo }) => ({ tipo, asunto, cuerpo }));
        const foto = await fotoBase('Alumna Compara');
        expect(foto.solicitudes).toEqual([{ t: 'reserva', e: 'confirmada', m: null }]);
        expect((await fotoBase('Alumna Resto')).solicitudes, 'la otra solicitud sigue pendiente').toEqual([{ t: 'reserva', e: 'pendiente', m: null }]);
        resultados.push({ foto, mails });
        test.info().annotations.push({ type: `mail (${via})`, description: JSON.stringify(mails) });

        // La Lista sigue mostrando el resto y ya no la respondida.
        await abrirLista(page);
        await expect(page.getByRole('article', { name: 'T05 Alumna Resto' })).toBeVisible();
        await expect(page.getByRole('article', { name: 'T05 Alumna Compara' })).toHaveCount(0);
      }, { esperado: 'La solicitud queda confirmada, se encola un solo mail al alumno, la otra sigue pendiente y la Lista la muestra' });
    }

    await cu.paso('El estado y el mail son idénticos', async () => {
      expect(resultados[1].foto).toEqual(resultados[0].foto);
      expect(resultados[1].mails).toEqual(resultados[0].mails);
    }, { esperado: 'Misma foto de clases, reservas y solicitudes y mismo mail (tipo, asunto y cuerpo) con el calendario y con la Lista' });
    await ctx.close();
  });

  test('T-CA-84-01 T-CA-84-02 T-INV-03-01 CA-84 CAL-20 INV-03 «Copiar enlace de este día» copia …/#/p/<slug>?d=2026-10-30 y ese enlace sin sesión muestra la agenda pública del día sin nombres', async ({ browser, evidencia }) => {
    test.setTimeout(300_000);
    const cu = evidencia({ cu: 'WEB-14-solicitudes-ca84-enlace', titulo: 'Calendario Día: copiar el enlace del día y abrirlo sin sesión', criterios: ['CA-84', 'CAL-20', 'INV-03', 'WEB-14'], bolt: 'B19' });
    await fijarReloj(AHORA_VIERNES);
    const alumnoId = await alumna('Alumna Publica');
    await crearClaseDe(alumnoId, VIERNES, '15:00', 'confirmada');
    const { ctx, page } = await sesion(browser, ['clipboard-read', 'clipboard-write']);
    await fijarRelojNavegador(page, AHORA_VIERNES);
    let copiado = '';

    await cu.paso('Abrir el viernes 30/10/2026 y «Copiar enlace de este día»', async () => {
      await abrir(page, `#/panel?d=${VIERNES}`);
      await expect(h2Dia(page, VIERNES)).toBeVisible();
      await page.getByRole('button', { name: 'Copiar enlace de este día' }).click();
      await expect(aviso(page, 'Enlace copiado')).toBeVisible({ timeout: 10_000 });
      copiado = await page.evaluate(() => navigator.clipboard.readText());
      test.info().annotations.push({ type: 'enlace copiado', description: copiado });
      expect(copiado).toBe(`${ORIGEN}${BASE}#/p/${SLUG_A}?d=${VIERNES}`);
      expect(copiado).toMatch(new RegExp(`/#/p/${SLUG_A}\\?d=2026-10-30$`));
    }, { esperado: `Aparece «Enlace copiado» y el portapapeles tiene …/#/p/${SLUG_A}?d=2026-10-30` });

    const anonimo = await browser.newContext({ locale: 'es-UY', timezoneId: TZ, viewport: VIEWPORT, storageState: { cookies: [], origins: [] } });
    const publica = await anonimo.newPage();
    await fijarRelojNavegador(publica, AHORA_VIERNES);

    await cu.paso('Abrir el enlace sin sesión: agenda pública de ese viernes, sin nombres', async () => {
      await publica.goto(copiado);
      await expect(publica.getByRole('heading', { level: 1, name: /^Agenda de / })).toBeVisible({ timeout: 30_000 });
      await expect(publica.getByRole('heading', { level: 2 })).toContainText(/viernes.*30.*octubre/i, { timeout: 30_000 });
      const lista = publica.getByRole('list', { name: 'Huecos del día' });
      await expect(lista).toBeVisible({ timeout: 30_000 });
      await expect(lista.getByText('Ocupado').first()).toBeVisible();
      await expect(publica.getByText('Alumna Publica')).toHaveCount(0);
      await expect(publica.getByText(/T05 /)).toHaveCount(0);
      await expect(publica).not.toHaveURL(/#\/ingreso/);
    }, { esperado: 'Se ve la agenda pública del viernes 30 de octubre con el hueco de las 15:00 como «Ocupado», sin el nombre de la alumna y sin pedir ingreso' });
    await anonimo.close();
    await ctx.close();
  });
});
