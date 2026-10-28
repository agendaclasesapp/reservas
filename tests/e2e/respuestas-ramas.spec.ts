// E2E en pantalla de las ramas de B07 (T07.3, segunda parte): CA-45 (motivo del profesor que rechazó, como texto, en Mis clases),
// CA-53 (Mis clases con clases de dos profesores en husos distintos) y CA-63 (profesor inactivo: Confirmar deshabilitado, Rechazar
// disponible, clases confirmadas visibles para el alumno). Reloj real; fechas relativas a hoy. Datos sintéticos `T05 `, que se limpian.
import { execSync } from 'node:child_process';
import type { BrowserContextOptions, Page } from '@playwright/test';
import { expect, test } from '../soporte/evidencia';
import { cerrar, sql } from '../soporte/bd';
import { SITEKEY_PRUEBA } from '../soporte/captcha';
import { esperarMail, contarMails } from '../soporte/correo';
import { entorno, RAIZ } from '../soporte/entorno';
import { MAIL_PROFESOR, SLUG_A, SLUG_B } from '../soporte/usuarios';
import { crearAlumno, limpiarT05, mailT05, profesorId } from '../integracion/cuentas/ayuda';

const BASE = process.env.RTC_BASE ?? '/reservas/';
const ORIGEN = process.env.BASE_URL ?? `http://127.0.0.1:${process.env.RTC_PREVIEW_PORT || '4173'}`;
const CTX: BrowserContextOptions = { locale: 'es-UY', timezoneId: 'America/Montevideo', storageState: { cookies: [], origins: [] } };

test.use({ locale: 'es-UY', timezoneId: 'America/Montevideo', viewport: { width: 1280, height: 900 } });

let zonaB = 'Europe/Madrid';

async function mailsA(m: string): Promise<number> {
  return contarMails(m);
}
async function entrar(page: Page, mail: string) {
  const antes = await mailsA(mail);
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
/** Reserva suelta y su clase a las 10:00 del huso `zona` en la fecha `dia`, con el profesor del slug. Devuelve la reserva. */
async function clase(alumnoId: string, slug: string, dia: string, zona: string, estado: 'confirmada' | 'pendiente', obs: string): Promise<string> {
  const [r] = await sql<{ id: string }>(
    `insert into public.reserva (profesor_id, alumno_id, tipo, hora_local, dia_semana, duracion_min, estado, desde, origen, observacion)
     values ((select id from public.profesor where slug = $2), $1, 'suelta', '10:00', 3, 60, $4, $3::date, 'solicitud', $5) returning id`,
    [alumnoId, slug, dia, estado, obs]);
  await sql(
    `insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado)
     values ((select id from public.profesor where slug = $2), $1, $3, (($4::text || ' 10:00')::timestamp at time zone $5),
             (($4::text || ' 10:00')::timestamp at time zone $5) + interval '1 hour', $6)`,
    [r.id, slug, alumnoId, dia, zona, estado]);
  return r.id;
}
async function limpiar() {
  await sql(`delete from public.solicitud where alumno_id in (select id from public.alumno where nombre like 'T05 %')`);
  await limpiarT05();
  await sql('update public.profesor set activo = true where slug = $1', [SLUG_A]);
  await sql('update public.profesor set zona_horaria = $2 where slug = $1', [SLUG_B, zonaB]);
}

test.beforeAll(async () => {
  test.setTimeout(300_000);
  const e = entorno();
  zonaB = (await sql<{ zona_horaria: string }>('select zona_horaria from public.profesor where slug = $1', [SLUG_B]))[0].zona_horaria;
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

test('WEB-05 CA-45 el motivo del profesor que rechazó aparece junto a ese profesor como texto, y sin motivo solo el estado', async ({ browser, evidencia }) => {
  test.setTimeout(300_000);
  const cu = evidencia({ cu: 'WEB-05-motivo-rechazo', titulo: 'Mis clases: el motivo del rechazo junto al profesor, como texto', criterios: ['CA-45', 'ALU-03', 'SEC-16', 'WEB-05'], bolt: 'B07' });
  const html = '<img src=x onerror=alert(1)> sin cupo';
  const mail = mailT05('e2e.motivo');
  const alumnoId = await crearAlumno({ nombre: 'Alumna Rechazada', estado: 'rechazado', telefono: '+598 99555333', mail });
  const A = await profesorId();
  // Con solo rechazos Mis clases dice «Sin permisos» (el motivo se ve en la ficha): con B aprobado, la pantalla muestra a los dos.
  await sql(`insert into public.inscripcion (alumno_id, profesor_id, estado, aprobado_en) values ($1, (select id from public.profesor where slug = $2), 'aprobado', now())`, [alumnoId, SLUG_B]);
  await sql(`update public.inscripcion set motivo_estado = $3 where alumno_id = $1 and profesor_id = $2`, [alumnoId, A, html]);
  const ctx = await browser.newContext(CTX);
  const page = await ctx.newPage();
  let dialogos = 0;
  page.on('dialog', async (d) => {
    dialogos++;
    await d.dismiss();
  });
  await entrar(page, mail);

  await cu.paso('Abrir Mis clases con el rechazo y su motivo', async () => {
    await page.goto(`${ORIGEN}${BASE}#/mis-clases`);
    await expect(page.getByRole('heading', { name: 'Mis clases', level: 1 })).toBeVisible({ timeout: 30_000 });
    const profes = page.getByRole('region', { name: 'Tus profesores' });
    const tarjeta = profes.getByRole('article', { name: 'Profesor de Prueba' });
    await expect(tarjeta).toContainText('Rechazado');
    await expect(tarjeta).toContainText('Motivo:');
    await expect(tarjeta).toContainText(html);
    await expect(profes.getByRole('article', { name: 'Profesora B de Prueba' })).not.toContainText('Motivo');
    await expect(tarjeta.locator('img')).toHaveCount(0);
    expect(dialogos).toBe(0);
  }, { esperado: 'Junto al profesor figura «Rechazado», «Motivo:» y el texto literal con las marcas HTML visibles; no hay etiquetas img ni alertas' });

  await cu.paso('Sin motivo, solo el estado', async () => {
    await sql(`update public.inscripcion set motivo_estado = null where alumno_id = $1 and profesor_id = $2`, [alumnoId, A]);
    await page.reload();
    const tarjeta = page.getByRole('region', { name: 'Tus profesores' }).getByRole('article', { name: 'Profesor de Prueba' });
    await expect(tarjeta).toContainText('Rechazado', { timeout: 30_000 });
    await expect(tarjeta).not.toContainText('Motivo');
  }, { esperado: 'Figura «Rechazado» y no existe el texto «Motivo»' });
  await ctx.close();
});

test('WEB-05 CA-53 Mis clases con clases de dos profesores en husos distintos, cada una con su profesor y su huso', async ({ browser, evidencia }) => {
  test.setTimeout(300_000);
  const cu = evidencia({ cu: 'WEB-05-dos-profesores', titulo: 'Mis clases con dos profesores y dos husos', criterios: ['CA-53', 'RES-06', 'ALU-03', 'WEB-05'], bolt: 'B07' });
  const mail = mailT05('e2e.dos');
  const alumnoId = await crearAlumno({ nombre: 'Alumna Dos Profesores', estado: 'aprobado', telefono: '+598 99555444', mail });
  const B = await profesorId(SLUG_B);
  await sql(`insert into public.inscripcion (alumno_id, profesor_id, estado, aprobado_en) values ($1, $2, 'aprobado', now())`, [alumnoId, B]);
  await sql(`update public.profesor set zona_horaria = 'Europe/Madrid' where id = $1`, [B]);
  await clase(alumnoId, SLUG_A, miercoles(), 'America/Montevideo', 'confirmada', 'Clase con A');
  await clase(alumnoId, SLUG_B, miercoles(1), 'Europe/Madrid', 'confirmada', 'Clase con B');
  const ctx = await browser.newContext(CTX);
  const page = await ctx.newPage();
  await entrar(page, mail);

  await cu.paso('Abrir Mis clases y ver los dos profesores', async () => {
    await page.goto(`${ORIGEN}${BASE}#/mis-clases`);
    await expect(page.getByRole('heading', { name: 'Mis clases', level: 1 })).toBeVisible({ timeout: 30_000 });
    const profes = page.getByRole('region', { name: 'Tus profesores' });
    await expect(profes.getByRole('article', { name: 'Profesor de Prueba' })).toContainText('Aprobado');
    await expect(profes.getByRole('article', { name: 'Profesora B de Prueba' })).toContainText('Aprobado');
  }, { esperado: 'En «Tus profesores» figuran los dos profesores con su estado Aprobado' });

  await cu.paso('Cada clase con su profesor y su huso', async () => {
    const clases = page.getByRole('region', { name: 'Tus clases' });
    const deA = clases.getByRole('article', { name: /10:00 a 11:00 \(America\/Montevideo\)$/ });
    const deB = clases.getByRole('article', { name: /10:00 a 11:00 \(Europe\/Madrid\)$/ });
    await expect(deA).toHaveCount(1);
    await expect(deB).toHaveCount(1);
    await expect(deA).toContainText('Profesor de Prueba');
    await expect(deA).toContainText('Confirmada');
    await expect(deB).toContainText('Profesora B de Prueba');
    await expect(deB).toContainText('Confirmada');
  }, { esperado: 'Dos clases confirmadas: la de A termina en (America/Montevideo) con su profesor y la de B en (Europe/Madrid) con la suya, ambas a las 10:00 de su huso' });
  await ctx.close();
});

test('WEB-07 CA-63 con el profesor inactivo Confirmar queda deshabilitado, Rechazar sigue y las clases confirmadas siguen en Mis clases', async ({ browser, evidencia }) => {
  test.setTimeout(300_000);
  const cu = evidencia({ cu: 'WEB-07-agenda-inactiva', titulo: 'Con la agenda inactiva el profesor rechaza pero no confirma', criterios: ['CA-63', 'PRF-08', 'SOL-05', 'WEB-07'], bolt: 'B07' });
  const mail = mailT05('e2e.inactivo');
  const nombre = 'T05 Alumna Inactivo';
  const alumnoId = await crearAlumno({ nombre: 'Alumna Inactivo', estado: 'aprobado', telefono: '+598 99555555', mail });
  const A = await profesorId();
  await clase(alumnoId, SLUG_A, miercoles(1), 'America/Montevideo', 'confirmada', 'Clase ya confirmada');
  const pend = await clase(alumnoId, SLUG_A, miercoles(), 'America/Montevideo', 'pendiente', 'Clase pendiente');
  await sql(
    `insert into public.solicitud (profesor_id, alumno_id, tipo, reserva_id, fecha_clase, estado)
     values ($1, $2, 'reserva', $3, (select inicio from public.clase where reserva_id = $3), 'pendiente')`, [A, alumnoId, pend]);
  await sql('update public.profesor set activo = false where id = $1', [A]);
  const ctxA = await browser.newContext(CTX);
  const ctxP = await browser.newContext(CTX);
  const alumno = await ctxA.newPage();
  const profe = await ctxP.newPage();
  await entrar(profe, MAIL_PROFESOR);
  await entrar(alumno, mail);

  await cu.paso('Abrir la lista con la agenda inactiva', async () => {
    await profe.goto(`${ORIGEN}${BASE}#/lista`);
    await expect(profe.getByRole('heading', { name: 'Solicitudes pendientes', level: 2 })).toBeVisible({ timeout: 30_000 });
    const t = profe.getByRole('article', { name: nombre });
    await expect(t).toBeVisible();
    await expect(profe.getByText(/Tu agenda está inactiva: no podés confirmar solicitudes/)).toBeVisible();
    const confirmar = t.getByRole('button', { name: /^Confirmar la solicitud de .*no disponible con la agenda inactiva$/ });
    await expect(confirmar).toBeDisabled();
    await expect(t.getByRole('button', { name: /^Rechazar la solicitud de / })).toBeEnabled();
  }, { esperado: 'La tarjeta sale con Confirmar deshabilitado, el aviso de agenda inactiva y Rechazar habilitado' });

  await cu.paso('Rechazar con motivo desde el diálogo', async () => {
    await profe.getByRole('button', { name: /^Rechazar la solicitud de / }).click();
    const d = profe.getByRole('dialog', { name: `Rechazar la solicitud de ${nombre}` });
    await expect(d).toBeVisible();
    await d.getByLabel('Motivo (opcional)').fill('Estoy de licencia');
    await d.getByRole('button', { name: 'Rechazar solicitud' }).click();
    await expect(profe.getByText('Solicitud rechazada. Le avisamos por mail.')).toBeVisible({ timeout: 20_000 });
    await expect(profe.getByRole('article', { name: nombre })).toHaveCount(0);
    const [s] = await sql<{ estado: string; motivo: string | null }>('select estado, motivo from public.solicitud where alumno_id = $1', [alumnoId]);
    expect(s).toMatchObject({ estado: 'rechazada', motivo: 'Estoy de licencia' });
  }, { esperado: 'Aparece «Solicitud rechazada…», la tarjeta sale y la solicitud queda rechazada con el motivo' });

  await cu.paso('Las clases confirmadas siguen en Mis clases del alumno', async () => {
    await alumno.goto(`${ORIGEN}${BASE}#/mis-clases`);
    await alumno.reload();
    await expect(alumno.getByRole('heading', { name: 'Próximas clases' })).toBeVisible({ timeout: 30_000 });
    await expect(alumno.getByRole('article', { name: /10:00 a 11:00/ }).filter({ hasText: 'Confirmada' })).toHaveCount(1);
    await expect(alumno.getByRole('region', { name: 'Tus profesores' }).getByRole('article', { name: 'Profesor de Prueba' })).toContainText('No toma reservas por ahora.');
  }, { esperado: 'La clase confirmada sigue en «Próximas clases» con su profesor, que figura «No toma reservas por ahora.»' });
  await ctxA.close();
  await ctxP.close();
});
