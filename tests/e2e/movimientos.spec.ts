// E2E de mover y cancelar clases (B08, T08.3 segunda parte): WEB-05 · CA-22 (movimiento pendiente y confirmado), CA-23/CA-24 (cancelación
// «de acá en adelante» de una serie) y CA-63 (profesor inactivo: PROFESOR_INACTIVO visible y anunciado). CA-41 (límite de 10) se cubre en
// pgTAP e integración. Reloj real; fechas relativas a hoy. Datos sintéticos con prefijo `T05 `, que se limpian.
import { execSync } from 'node:child_process';
import type { BrowserContextOptions, Page } from '@playwright/test';
import { expect, test } from '../soporte/evidencia';
import { cerrar, sql } from '../soporte/bd';
import { SITEKEY_PRUEBA } from '../soporte/captcha';
import { esperarMail, contarMails } from '../soporte/correo';
import { entorno, RAIZ } from '../soporte/entorno';
import { MAIL_PROFESOR, SLUG_A } from '../soporte/usuarios';
import { crearAlumno, limpiarT05, mailT05, profesorId } from '../integracion/cuentas/ayuda';

const BASE = process.env.RTC_BASE ?? '/reservas/';
const ORIGEN = process.env.BASE_URL ?? `http://127.0.0.1:${process.env.RTC_PREVIEW_PORT || '4173'}`;
const CTX: BrowserContextOptions = { locale: 'es-UY', timezoneId: 'America/Montevideo', storageState: { cookies: [], origins: [] } };

test.use({ locale: 'es-UY', timezoneId: 'America/Montevideo', viewport: { width: 1280, height: 900 } });

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
}
/** Un miércoles (hora de Montevideo) a 8 o más días de hoy, más `extra` semanas, `YYYY-MM-DD`. */
function miercoles(extra = 0): string {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montevideo', year: 'numeric', month: '2-digit', day: '2-digit' });
  const d = new Date(Date.now() + 8 * 86_400_000);
  while (new Date(f.format(d) + 'T12:00:00Z').getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCDate(d.getUTCDate() + 7 * extra);
  return f.format(d);
}
/** Reconoce la fecha y la hora en el nombre de la tarjeta: «… 4 de noviembre, 10:00 a 11:00». */
function fechaRx(dia: string, hora: string): RegExp {
  const t = new Intl.DateTimeFormat('es-UY', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(new Date(dia + 'T12:00:00Z'));
  return new RegExp(`\\b${t},? ${hora}`);
}

async function reserva(alumnoId: string, tipo: 'suelta' | 'serie', dia: string): Promise<string> {
  const [r] = await sql<{ id: string }>(
    `insert into public.reserva (profesor_id, alumno_id, tipo, frecuencia_semanas, hora_local, dia_semana, duracion_min, estado, desde, origen, observacion)
     values ((select id from public.profesor where slug = $2), $1, $3, $4, '10:00', 3, 60, 'confirmada', $5::date, 'solicitud', 'Clase E2E') returning id`,
    [alumnoId, SLUG_A, tipo, tipo === 'serie' ? 1 : null, dia]);
  return r.id;
}
async function claseConfirmada(alumnoId: string, reservaId: string, dia: string) {
  await sql(
    `insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado)
     values ((select id from public.profesor where slug = $2), $1, $3, (($4::text || ' 10:00')::timestamp at time zone 'America/Montevideo'),
             (($4::text || ' 10:00')::timestamp at time zone 'America/Montevideo') + interval '1 hour', 'confirmada')`,
    [reservaId, SLUG_A, alumnoId, dia]);
}
async function limpiar() {
  await sql(`delete from public.solicitud where alumno_id in (select id from public.alumno where nombre like 'T05 %')`);
  await limpiarT05();
  await sql('update public.profesor set activo = true where slug = $1', [SLUG_A]);
}

test.beforeAll(async () => {
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
});
test.afterEach(limpiar);
test.afterAll(cerrar);

test('WEB-05 CA-22 la alumna pide mover una clase, queda «Movimiento pendiente», el profesor lo confirma y la ve en el horario nuevo', async ({ browser, evidencia }) => {
  test.setTimeout(300_000);
  const cu = evidencia({ cu: 'WEB-05-mover-clase', titulo: 'Mis clases: mover una clase confirmada a otro horario libre', criterios: ['CA-22', 'SOL-02', 'SOL-05', 'WEB-05'], bolt: 'B08' });
  const dia = miercoles();
  const nombre = 'T05 Alumna Mover';
  const mail = mailT05('e2e.mover');
  const alumnoId = await crearAlumno({ nombre: 'Alumna Mover', estado: 'aprobado', telefono: '+598 99555666', mail });
  await claseConfirmada(alumnoId, await reserva(alumnoId, 'suelta', dia), dia);
  const ctxA = await browser.newContext(CTX);
  const ctxP = await browser.newContext(CTX);
  const alumna = await ctxA.newPage();
  const profe = await ctxP.newPage();
  await entrar(alumna, mail);
  await entrar(profe, MAIL_PROFESOR);
  const tarjeta = (p: Page, hora: string) => p.getByRole('article', { name: fechaRx(dia, hora) });

  await cu.paso('Abrir Mis clases con la clase confirmada', async () => {
    await alumna.goto(`${ORIGEN}${BASE}#/mis-clases`);
    await expect(alumna.getByRole('heading', { name: 'Próximas clases' })).toBeVisible({ timeout: 30_000 });
    await expect(tarjeta(alumna, '10:00 a 11:00')).toContainText('Confirmada');
    await expect(tarjeta(alumna, '10:00 a 11:00').getByRole('button', { name: 'Mover' })).toBeVisible();
    await expect(tarjeta(alumna, '10:00 a 11:00').getByRole('button', { name: 'Avisar que no voy' })).toBeVisible();
  }, { esperado: 'La clase figura Confirmada con los botones «Mover» y «Avisar que no voy»' });

  await cu.paso('Elegir el horario nuevo y pedir el cambio', async () => {
    await tarjeta(alumna, '10:00 a 11:00').getByRole('button', { name: 'Mover' }).click();
    const d = alumna.getByRole('dialog', { name: 'Mover la clase' });
    await expect(d).toBeVisible();
    await d.getByLabel('Elegir día').fill(dia);
    await d.getByRole('button', { name: '12:00 a 13:00 Libre' }).click({ timeout: 30_000 });
    await expect(d.getByText(/^Horario elegido: .*12:00 a 13:00\.$/)).toBeVisible();
    await d.getByRole('button', { name: 'Pedir el cambio' }).click();
    await expect(d).toBeHidden({ timeout: 30_000 });
    await expect(tarjeta(alumna, '10:00 a 11:00').getByText('Pedido enviado')).toBeVisible({ timeout: 5_000 });
    await expect(tarjeta(alumna, '10:00 a 11:00')).toContainText('Pediste cambiarla de horario');
  }, { esperado: 'El diálogo se cierra y la tarjeta muestra «Pedido enviado» y que la clase sigue en su horario actual' });

  await cu.paso('Recargar: la clase sigue confirmada con «Movimiento pendiente»', async () => {
    await alumna.reload();
    const t = tarjeta(alumna, '10:00 a 11:00');
    await expect(t).toContainText('Movimiento pendiente', { timeout: 30_000 });
    await expect(t).toContainText('Confirmada');
    await expect(t.getByRole('button', { name: 'Mover' })).toHaveCount(0);
    await expect(t.getByRole('button', { name: 'Avisar que no voy' })).toHaveCount(0);
  }, { esperado: 'La tarjeta de las 10:00 dice Confirmada y «Movimiento pendiente», sin los botones de acción' });

  await cu.paso('El profesor ve el pedido y lo confirma', async () => {
    await profe.goto(`${ORIGEN}${BASE}#/lista`);
    const t = profe.getByRole('article', { name: nombre });
    await expect(t).toBeVisible({ timeout: 30_000 });
    await expect(t).toContainText('Nuevo horario');
    await profe.getByRole('button', { name: new RegExp(`^Confirmar la solicitud de ${nombre}`) }).click();
    await expect(profe.getByText('Solicitud confirmada. Le avisamos por mail.')).toBeVisible({ timeout: 20_000 });
    await expect(profe.getByRole('article', { name: nombre })).toHaveCount(0);
  }, { esperado: 'La tarjeta indica el nuevo horario; al confirmar aparece «Solicitud confirmada…» y sale de la lista' });

  await cu.paso('La alumna ve la clase en el horario nuevo', async () => {
    await alumna.reload();
    await expect(tarjeta(alumna, '12:00 a 13:00')).toBeVisible({ timeout: 30_000 });
    await expect(tarjeta(alumna, '12:00 a 13:00')).toContainText('Confirmada');
    await expect(tarjeta(alumna, '10:00 a 11:00')).toContainText('Cambiada de horario');
    await expect(tarjeta(alumna, '10:00 a 11:00')).not.toContainText('Confirmada');
  }, { esperado: 'Mis clases muestra la clase de 12:00 a 13:00 Confirmada y la de las 10:00 como «Cambiada de horario», ya no Confirmada' });
  await ctxA.close();
  await ctxP.close();
});

test('WEB-05 CA-23 CA-24 «Avisar que no voy» con «De acá en adelante» queda como cancelación pendiente y, al confirmarla, las clases siguientes salen de Próximas', async ({ browser, evidencia }) => {
  test.setTimeout(300_000);
  const cu = evidencia({ cu: 'WEB-05-cancelar-serie', titulo: 'Mis clases: avisar que no voy a una serie desde una fecha en adelante', criterios: ['CA-23', 'CA-24', 'SOL-03', 'SOL-07', 'WEB-05'], bolt: 'B08' });
  const nombre = 'T05 Alumna Serie';
  const mail = mailT05('e2e.serie');
  const alumnoId = await crearAlumno({ nombre: 'Alumna Serie', estado: 'aprobado', telefono: '+598 99555777', mail });
  const dias = [miercoles(), miercoles(1), miercoles(2), miercoles(3)];
  const rid = await reserva(alumnoId, 'serie', dias[0]);
  for (const d of dias) await claseConfirmada(alumnoId, rid, d);
  const ctxA = await browser.newContext(CTX);
  const ctxP = await browser.newContext(CTX);
  const alumna = await ctxA.newPage();
  const profe = await ctxP.newPage();
  await entrar(alumna, mail);
  await entrar(profe, MAIL_PROFESOR);
  const tarjeta = (p: Page, d: string) => p.getByRole('article', { name: fechaRx(d, '10:00 a 11:00') });

  await cu.paso('Abrir Mis clases con las cuatro clases de la serie', async () => {
    await alumna.goto(`${ORIGEN}${BASE}#/mis-clases`);
    await expect(alumna.getByRole('heading', { name: 'Próximas clases' })).toBeVisible({ timeout: 30_000 });
    for (const d of dias) await expect(tarjeta(alumna, d)).toBeVisible();
  }, { esperado: 'Las cuatro clases semanales figuran en Próximas clases' });

  await cu.paso('Avisar que no voy desde la segunda clase en adelante', async () => {
    await tarjeta(alumna, dias[1]).getByRole('button', { name: 'Avisar que no voy' }).click();
    const d = alumna.getByRole('dialog', { name: 'Avisar que no voy' });
    await expect(d).toBeVisible();
    await expect(d.getByRole('radio', { name: 'Solo esta clase' })).toBeChecked();
    await d.getByRole('radio', { name: 'De acá en adelante' }).check();
    await d.getByRole('button', { name: 'Enviar aviso' }).click();
    await expect(d).toBeHidden({ timeout: 30_000 });
    await expect(alumna.getByText('Pedido enviado').first()).toBeVisible({ timeout: 5_000 });
    await alumna.reload();
    await expect(tarjeta(alumna, dias[1])).toContainText('Cancelación pendiente', { timeout: 30_000 });
    await expect(tarjeta(alumna, dias[1])).toContainText('Confirmada');
  }, { esperado: 'La segunda clase queda Confirmada con «Cancelación pendiente»' });

  await cu.paso('El profesor confirma la cancelación', async () => {
    await profe.goto(`${ORIGEN}${BASE}#/lista`);
    await expect(profe.getByRole('article', { name: nombre })).toBeVisible({ timeout: 30_000 });
    await profe.getByRole('button', { name: new RegExp(`^Confirmar la solicitud de ${nombre}`) }).click();
    await expect(profe.getByText('Solicitud confirmada. Le avisamos por mail.')).toBeVisible({ timeout: 20_000 });
  }, { esperado: 'Aparece «Solicitud confirmada…»' });

  await cu.paso('Las clases siguientes salen de Próximas', async () => {
    await alumna.reload();
    await expect(tarjeta(alumna, dias[0])).toBeVisible({ timeout: 30_000 });
    await expect(tarjeta(alumna, dias[0])).toContainText('Confirmada');
    for (const d of dias.slice(1)) {
      await expect(tarjeta(alumna, d)).toContainText('Cancelada');
      await expect(tarjeta(alumna, d)).not.toContainText('Confirmada');
    }
  }, { esperado: 'La primera clase sigue Confirmada; la segunda y las siguientes pasan a «Cancelada» y dejan de figurar como confirmadas en Próximas' });
  await ctxA.close();
  await ctxP.close();
});

test('WEB-05 CA-63 con el profesor inactivo el aviso da PROFESOR_INACTIVO como alerta visible con el foco, y mover lo avisa antes de enviar', async ({ browser, evidencia }) => {
  test.setTimeout(300_000);
  const cu = evidencia({ cu: 'WEB-05-profesor-inactivo', titulo: 'Mis clases: el profesor no toma reservas, error visible y anunciado', criterios: ['CA-63', 'SOL-01', 'WEB-05'], bolt: 'B08' });
  const dia = miercoles();
  const mail = mailT05('e2e.inactivo.mov');
  const alumnoId = await crearAlumno({ nombre: 'Alumna Inactivo Mov', estado: 'aprobado', telefono: '+598 99555888', mail });
  await claseConfirmada(alumnoId, await reserva(alumnoId, 'suelta', dia), dia);
  await sql('update public.profesor set activo = false where id = $1', [await profesorId()]);
  const ctx = await browser.newContext(CTX);
  const alumna = await ctx.newPage();
  await entrar(alumna, mail);
  const tarjeta = alumna.getByRole('article', { name: fechaRx(dia, '10:00 a 11:00') });
  const INACTIVO = 'Este profesor no toma reservas por ahora: no podés mover ni cancelar clases con él. Tus clases confirmadas siguen en pie.';

  await cu.paso('Abrir Mover con el profesor inactivo', async () => {
    await alumna.goto(`${ORIGEN}${BASE}#/mis-clases`);
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await tarjeta.getByRole('button', { name: 'Mover' }).click();
    const d = alumna.getByRole('dialog', { name: 'Mover la clase' });
    await expect(d.getByText('No toma reservas por ahora', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(d.getByText(INACTIVO)).toBeVisible();
    await expect(d.getByRole('button', { name: 'Pedir el cambio' })).toBeDisabled();
    await d.getByRole('button', { name: 'Volver' }).click();
    await expect(d).toBeHidden();
  }, { esperado: 'El diálogo avisa «No toma reservas por ahora» con el texto de PROFESOR_INACTIVO y «Pedir el cambio» está deshabilitado' });

  await cu.paso('Avisar que no voy: el pedido da PROFESOR_INACTIVO', async () => {
    await tarjeta.getByRole('button', { name: 'Avisar que no voy' }).click();
    const d = alumna.getByRole('dialog', { name: 'Avisar que no voy' });
    await d.getByRole('button', { name: 'Enviar aviso' }).click();
    const alerta = d.getByRole('alert');
    await expect(alerta).toBeVisible({ timeout: 30_000 });
    await expect(alerta).toContainText('No se pudo enviar el pedido');
    await expect(alerta).toContainText(INACTIVO);
    await expect(alerta.locator('..')).toBeFocused(); // el contenedor del alert recibe el foco
    await expect(d.getByRole('button', { name: 'Enviar aviso' })).toBeEnabled();
    const [s] = await sql<{ n: string }>('select count(*) n from public.solicitud where alumno_id = $1', [alumnoId]);
    expect(Number(s.n)).toBe(0);
  }, { esperado: 'Un alert con «No se pudo enviar el pedido» y el texto de PROFESOR_INACTIVO, con el foco; el diálogo sigue abierto, el botón activo y no se creó ninguna solicitud' });
  await ctx.close();
});
