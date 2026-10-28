// E2E de la solicitud de reserva (B06, T06.3): WEB-01 · CA-46 el visitante que toca un hueco libre ve la invitación a ingresar
// (sin RPC de escritura ni solicitud) y WEB-04 · CA-05, CA-19, T-ALU-14 la persona aprobada pide una serie semanal para su persona a
// cargo y ve la fecha bloqueada como salteada antes de enviar. Dos profesores del seed (A = profesor-prueba, B = profesora-b).
// El visitante usa reloj fijo en el navegador (Proxy de Date, como agenda.spec.ts) y en la base (ADR-014): lunes 2026-11-02 12:00 de
// Montevideo. La persona aprobada usa el reloj real (su JWT vence con la hora real) y fechas relativas a hoy. Corre contra dist/
// servido por vite preview; datos sintéticos con prefijo `T05 ` (se limpian).
import { execSync } from 'node:child_process';
import type { Page } from '@playwright/test';
import { expect, test } from '../soporte/evidencia';
import { cerrar, sql } from '../soporte/bd';
import { SITEKEY_PRUEBA } from '../soporte/captcha';
import { esperarMail, contarMails } from '../soporte/correo';
import { entorno, RAIZ } from '../soporte/entorno';
import { fijarReloj, limpiarReloj } from '../soporte/reloj';
import { profesorId, SLUG_A, SLUG_B } from '../soporte/usuarios';
import { crearAlumno, limpiarT05, mailT05 } from '../integracion/cuentas/ayuda';

const BASE = process.env.RTC_BASE ?? '/reservas/';
const ORIGEN = process.env.BASE_URL ?? `http://127.0.0.1:${process.env.RTC_PREVIEW_PORT || '4173'}`;
const AHORA_VISITANTE = '2026-11-02T15:00:00Z'; // lunes 12:00 en Montevideo
const NOMBRE_A = 'Profesor de Prueba';

test.use({ locale: 'es-UY', timezoneId: 'America/Montevideo', viewport: { width: 1024, height: 800 } });

/** Reloj del navegador desplazado (Proxy de Date: TZDate no soporta page.clock; ver agenda.spec.ts). */
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

async function mailsA(m: string): Promise<number> {
  return contarMails(m);
}

/** Entra con código: reintenta hasta que el widget de prueba entrega el token y lee el código del mail nuevo. */
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

/** Miércoles (hora de Montevideo) a 8 o más días de hoy, como `YYYY-MM-DD`, y el miércoles siguiente. */
function miercoles(): { dia: string; siguiente: string } {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montevideo', year: 'numeric', month: '2-digit', day: '2-digit' });
  const d = new Date(Date.now() + 8 * 86_400_000);
  while (new Date(f.format(d) + 'T12:00:00Z').getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  const sig = new Date(d.getTime() + 7 * 86_400_000);
  return { dia: f.format(d), siguiente: f.format(sig) };
}

async function limpiarSolicitudes() {
  const ids = `select id from public.alumno where nombre like 'T05 %' or mail like 't05.%'`;
  await sql(`delete from public.solicitud where alumno_id in (${ids})`);
  await sql(`delete from public.bloqueo where motivo like 'T06 %'`);
  await limpiarT05();
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
  await limpiarSolicitudes();
  await sql("update public.profesor set activo = true, duracion_min = 60, anticipacion_horas = 24, zona_horaria = 'America/Montevideo'");
  await limpiarReloj();
});
test.afterEach(async () => {
  await limpiarSolicitudes();
  await limpiarReloj();
});
test.afterAll(cerrar);

test.describe('visitante', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('CA-46 el visitante que toca un hueco libre ve la invitación a ingresar y no se llama a ninguna RPC de escritura', async ({ page, evidencia }) => {
    const cu = evidencia({
      cu: 'WEB-01-visitante',
      titulo: 'Un visitante sin sesión toca un hueco libre: invitación a ingresar',
      criterios: ['CA-46', 'WEB-01', 'SOL-09'],
      bolt: 'B06',
    });
    await fijarReloj(AHORA_VISITANTE);
    await fijarRelojNavegador(page, AHORA_VISITANTE);
    const [{ n: antes }] = await sql<{ n: number }>('select count(*)::int as n from public.solicitud');
    const llamadas: string[] = [];
    page.on('request', (r) => {
      const m = /\/rest\/v1\/(rpc\/)?([a-z_]+)/.exec(r.url());
      if (m) llamadas.push(`${r.method()} ${m[1] ? 'rpc/' : ''}${m[2]}`);
    });

    await cu.paso(
      'Abrir la agenda del profesor sin sesión',
      async () => {
        await page.goto(`${ORIGEN}${BASE}#/p/${SLUG_A}`);
        await expect(page.getByRole('heading', { level: 1, name: `Agenda de ${NOMBRE_A}` })).toBeVisible();
        await expect(page.getByRole('list', { name: 'Huecos del día' })).toBeVisible();
        await expect(page.getByRole('button', { name: /17:00 a 18:00/ })).toBeVisible();
      },
      { esperado: 'La agenda abre en el lunes 2 de noviembre con huecos libres que se pueden tocar' },
    );

    await cu.paso(
      'Tocar el hueco libre de las 17:00',
      async () => {
        await page.getByRole('button', { name: /17:00 a 18:00/ }).click();
        const dialogo = page.getByRole('dialog', { name: 'Ingresá para pedir esta clase' });
        await expect(dialogo).toBeVisible();
        await expect(dialogo).toContainText(`Para pedirle una clase a ${NOMBRE_A} tenés que ingresar`);
        await expect(dialogo.getByRole('link', { name: 'Ingresar' })).toHaveAttribute('href', new RegExp(`#/ingreso\\?volver=.*${SLUG_A}`));
      },
      { esperado: 'Se abre el aviso «Ingresá para pedir esta clase» con el acceso «Ingresar» a #/ingreso que vuelve a esta agenda' },
    );

    await cu.paso(
      'No se llamó a ninguna RPC de escritura ni se creó ninguna solicitud',
      async () => {
        const rpcs = [...new Set(llamadas)];
        expect(rpcs.filter((l) => !/^(GET|POST) rpc\/(agenda_publica|config_publica)$/.test(l)), `llamadas: ${rpcs.join(', ')}`).toEqual([]);
        expect(llamadas.some((l) => /solicitar_reserva|previsualizar_serie|solicitud/.test(l))).toBe(false);
        const [{ n }] = await sql<{ n: number }>('select count(*)::int as n from public.solicitud');
        expect(n).toBe(antes);
      },
      { esperado: 'Solo se leyeron la configuración y la agenda públicas: ni solicitar_reserva ni previsualizar_serie ni la tabla solicitud; sigue habiendo las mismas solicitudes' },
    );

    await cu.paso(
      'Cerrar el aviso con Escape deja la agenda como estaba',
      async () => {
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(page.getByRole('list', { name: 'Huecos del día' })).toBeVisible();
        await expect(page.getByRole('button', { name: /17:00 a 18:00/ })).toBeVisible();
      },
      { esperado: 'El aviso se cierra y el hueco sigue libre' },
    );

    await cu.paso(
      'Tocar de nuevo y entrar por «Ingresar»',
      async () => {
        await page.getByRole('button', { name: /17:00 a 18:00/ }).click();
        await page.getByRole('dialog').getByRole('link', { name: 'Ingresar' }).click();
        await expect(page).toHaveURL(/#\/ingreso/);
        await expect(page.getByRole('button', { name: 'Entrar con un código por mail' })).toBeVisible();
      },
      { esperado: 'Se llega a la pantalla de ingreso (WEB-02)' },
    );
  });

  test('CA-46 el visitante en la agenda de B ve la invitación con el nombre de B', async ({ page }) => {
    await fijarReloj(AHORA_VISITANTE);
    await fijarRelojNavegador(page, AHORA_VISITANTE);
    await page.goto(`${ORIGEN}${BASE}#/p/${SLUG_B}`);
    await page.getByRole('button', { name: /17:00 a 18:00/ }).click();
    const dialogo = page.getByRole('dialog', { name: 'Ingresá para pedir esta clase' });
    await expect(dialogo).toContainText('Profesora B de Prueba');
    await expect(dialogo).not.toContainText(NOMBRE_A);
  });
});

test.describe('persona aprobada', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('CA-05 CA-19 T-ALU-14 la persona aprobada pide una serie semanal para su persona a cargo y ve la fecha bloqueada como salteada', async ({ page, evidencia }) => {
    test.setTimeout(240_000);
    const cu = evidencia({
      cu: 'WEB-04',
      titulo: 'Pedir una serie semanal para una persona a cargo, con una fecha bloqueada',
      criterios: ['CA-05', 'CA-19', 'WEB-04', 'RES-03', 'RES-05', 'SOL-01'],
      bolt: 'B06',
    });
    const { dia, siguiente } = miercoles();
    const A = await profesorId(SLUG_A);
    const mail = mailT05('e2e.pide');
    const alumnoId = await crearAlumno({ nombre: 'Alumna que pide', estado: 'aprobado', telefono: '+598 99555111', mail });
    await sql(`insert into public.persona_a_cargo (alumno_id, nombre, fecha_nacimiento) values ($1, 'T05 Hija E2E', '2015-05-05')`, [alumnoId]);
    await sql(`insert into public.bloqueo (profesor_id, periodo, motivo) values ($1, tstzrange($2::timestamptz, $3::timestamptz, '[)'), 'T06 Bloqueo E2E')`, [
      A,
      `${siguiente}T08:00:00-03:00`,
      `${siguiente}T13:00:00-03:00`,
    ]);

    await cu.paso(
      'Ingresar con el código del mail',
      async () => {
        await entrar(page, mail);
      },
      { esperado: 'La persona, aprobada con el profesor A, entra con su código' },
    );

    await cu.paso(
      `Abrir la agenda de A el miércoles ${dia} y tocar el hueco de las 10:00`,
      async () => {
        await page.goto(`${ORIGEN}${BASE}#/p/${SLUG_A}?d=${dia}`);
        await expect(page.getByRole('heading', { level: 1, name: `Agenda de ${NOMBRE_A}` })).toBeVisible({ timeout: 30_000 });
        await page.getByRole('button', { name: /10:00 a 11:00/ }).click({ timeout: 20_000 });
        await expect(page.getByRole('dialog', { name: `Pedir clase a ${NOMBRE_A}` })).toBeVisible();
      },
      { esperado: 'Se abre el formulario «Pedir clase a Profesor de Prueba» (con el vínculo aprobado, no la invitación a ingresar)' },
    );

    await cu.paso(
      'Elegir a la persona a cargo y la serie semanal: la fecha bloqueada figura salteada',
      async () => {
        const dialogo = page.getByRole('dialog');
        await dialogo.getByRole('radio', { name: 'T05 Hija E2E' }).check();
        await dialogo.getByRole('radio', { name: /Serie semanal/ }).check();
        const salteadas = dialogo.getByRole('list', { name: /saltean|salteada/i });
        await expect(salteadas).toBeVisible({ timeout: 30_000 });
        await expect(salteadas).toContainText(/10:00/);
        await expect(dialogo.getByRole('button', { name: 'Pedir clase' })).toBeEnabled();
      },
      { esperado: 'Antes de enviar se lista la fecha del miércoles siguiente (bloqueada) como una que se saltea; el botón «Pedir clase» está habilitado' },
    );

    await cu.paso(
      'Escribir una observación y pedir la clase',
      async () => {
        const dialogo = page.getByRole('dialog');
        await dialogo.getByLabel(/Observaci/).fill('Primera clase E2E');
        await dialogo.getByRole('button', { name: 'Pedir clase' }).click();
        await expect(page.getByRole('dialog', { name: 'Pedido enviado' })).toBeVisible({ timeout: 30_000 });
        await expect(page.getByRole('dialog')).toContainText('Pedido enviado');
        await expect(page.getByRole('dialog')).toContainText(/no se pidi/);
      },
      { esperado: 'Aparece «Pedido enviado» con el profesor, el horario y la fecha que no se pidió' },
    );

    await cu.paso(
      'La solicitud quedó pendiente a nombre de la persona a cargo y el hueco ocupado',
      async () => {
        const [s] = await sql<{ estado: string; profesor_id: string; tipo: string }>(
          'select estado, profesor_id, tipo from public.solicitud where alumno_id = $1', [alumnoId]);
        expect(s).toEqual({ estado: 'pendiente', profesor_id: A, tipo: 'reserva' });
        const [r] = await sql<{ tipo: string; frecuencia_semanas: number; observacion: string; persona: string }>(
          `select r.tipo, r.frecuencia_semanas, r.observacion, p.nombre as persona
             from public.reserva r join public.persona_a_cargo p on p.id = r.persona_a_cargo_id where r.alumno_id = $1`, [alumnoId]);
        expect(r).toEqual({ tipo: 'serie', frecuencia_semanas: 1, observacion: 'Primera clase E2E', persona: 'T05 Hija E2E' });
        const [c] = await sql<{ n: number; bloqueada: number }>(
          `select count(*)::int as n, count(*) filter (where inicio = $2::timestamptz)::int as bloqueada from public.clase where alumno_id = $1`,
          [alumnoId, `${siguiente}T10:00:00-03:00`]);
        expect(c.n).toBeGreaterThan(20);
        expect(c.bloqueada).toBe(0);
        await page.getByRole('button', { name: 'Cerrar' }).first().click().catch(() => page.keyboard.press('Escape'));
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(page.getByRole('list', { name: 'Huecos del día' }).getByRole('listitem').filter({ hasText: '10:00 a 11:00' })).toContainText('Ocupado');
      },
      { esperado: 'Hay una solicitud pendiente con A, una serie semanal a nombre de «T05 Hija E2E» con la observación, ninguna clase en la fecha bloqueada, y el hueco de las 10:00 figura Ocupado' },
    );
  });
});
