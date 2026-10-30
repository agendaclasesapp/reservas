// E2E de ingreso y ficha (WEB-02, WEB-03; CA-01 rama código, CA-02, CA-05 rama ALU-06, CA-43, CA-44, CA-65, H-021;
// casos T-ALU-01, T-ALU-03, T-ALU-04, T-ALU-15, T-WEB-01). B14: se entra desde el enlace de un profesor `#/p/<slug>`
// (queda como profesor de origen: «Cómo llegaste a {nombre}» y la inscripción nace pendiente con él) y el ingreso
// de una persona con vínculo vuelve al enlace. Código de 6 dígitos leído de Mailpit, widget de prueba de
// Turnstile (sitekey 1x00000000000000000000AA, VITE_TURNSTILE_SITEKEY) y la ficha obligatoria. Se escribe contra roles
// y textos accesibles. La rama Google de CA-01/CA-02 es evidencia manual. Corre contra dist/ servido por vite preview.
// El widget de Turnstile carga su script de challenges.cloudflare.com: este E2E necesita salida a internet.
import { execSync } from 'node:child_process';
import type { Page } from '@playwright/test';
import { expect, test } from '../soporte/evidencia';
import { cerrar, sql } from '../soporte/bd';
import { SITEKEY_PRUEBA } from '../soporte/captcha';
import { esperarMail, mailUnico, remitenteDe, contarMails } from '../soporte/correo';
import { entorno, RAIZ } from '../soporte/entorno';
import { fijarReloj, limpiarReloj } from '../soporte/reloj';
import { profesorId, SLUG_A } from '../soporte/usuarios';

const BASE = process.env.RTC_BASE ?? '/reservas/';
const ENLACE = `${BASE}#/p/${SLUG_A}`;
const NOMBRE_A = 'Profesor de Prueba';
const creados: string[] = [];
const rellenos: string[] = [];

test.use({ locale: 'es-UY', viewport: { width: 1024, height: 900 } });

async function limpiar() {
  if (rellenos.length) {
    const ids = rellenos.splice(0);
    await sql('delete from public.inscripcion where alumno_id = any($1::uuid[])', [ids]);
    await sql('delete from public.alumno where id = any($1::uuid[])', [ids]);
  }
  for (const m of creados.splice(0)) {
    const propios = '(select id from public.alumno where mail = $1)';
    await sql(`delete from public.persona_a_cargo where alumno_id in ${propios}`, [m]);
    await sql(`delete from public.mail_salida where alumno_id in ${propios}`, [m]);
    await sql(`delete from public.inscripcion where alumno_id in ${propios}`, [m]);
    await sql('delete from public.alumno where mail = $1', [m]);
    await sql('delete from auth.users where email = $1', [m]);
  }
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
});

test.afterEach(async () => {
  await limpiarReloj();
  await limpiar();
});
test.afterAll(cerrar);

async function mailsA(m: string): Promise<number> {
  return contarMails(m);
}

/** Elige el código por mail, escribe el mail y pide el código; reintenta hasta que el widget de prueba entrega el token. */
async function pedirCodigo(page: Page, mail: string) {
  await page.getByRole('button', { name: 'Entrar con un código por mail' }).click();
  await page.getByLabel(/^Mail/).fill(mail);
  await expect(async () => {
    await page.getByRole('button', { name: 'Pedir código' }).click();
    await expect(page.getByRole('heading', { name: 'Ingresá el código' })).toBeVisible({ timeout: 2_500 });
  }).toPass({ timeout: 60_000, intervals: [1_000, 2_000, 3_000] });
}

/** Abre el enlace del profesor y toca «Ingresar»: así llega quien recibió el enlace (queda como profesor de origen). */
async function irAlIngresoDesdeElEnlace(page: Page) {
  await page.goto(ENLACE);
  await expect(page.getByRole('heading', { level: 1, name: `Agenda de ${NOMBRE_A}` })).toBeVisible();
  await page.getByRole('link', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Ingresar', level: 1 })).toBeVisible();
}

async function entrar(page: Page, mail: string, destino: 'enlace' | string = 'enlace') {
  if (destino === 'enlace') await irAlIngresoDesdeElEnlace(page);
  else await page.goto(`${BASE}${destino}`);
  await pedirCodigo(page, mail);
  const codigo = (await esperarMail(mail)).codigo!;
  await page.getByLabel('Código de 6 dígitos').fill(codigo);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}

async function llenarFicha(page: Page, nombre = 'Ana Pérez') {
  await page.getByLabel('Nombre y apellido').fill(nombre);
  await page.getByLabel('Teléfono o WhatsApp').fill('+598 99123456');
  await page.getByLabel('Fecha de nacimiento').fill('2000-01-01');
  await page.getByLabel(`Cómo llegaste a ${NOMBRE_A}`).fill('Me recomendó una amiga');
}

test('WEB-02 ingreso con código de 6 dígitos y CAPTCHA, sin contraseña, desde el enlace del profesor', async ({ page, evidencia }) => {
  const mail = mailUnico('b14.e2e.codigo');
  creados.push(mail);
  const cu = evidencia({
    cu: 'WEB-02',
    titulo: 'Ingreso con código por mail y CAPTCHA de prueba, desde el enlace de un profesor',
    criterios: ['CA-01', 'CA-02', 'CA-44', 'CA-65', 'ALU-01', 'WEB-02', 'H-021'],
    bolt: 'B14',
  });

  await cu.paso(
    'Abrir la pantalla de ingreso desde el enlace del profesor',
    async () => {
      await irAlIngresoDesdeElEnlace(page);
      await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible();
      await expect(page.locator('input[type=password]')).toHaveCount(0);
      await expect(page.locator('iframe[src*="challenges.cloudflare.com"]'), 'Google no carga el desafío').toHaveCount(0);
    },
    { esperado: 'Se ven «Continuar con Google» y «Entrar con un código por mail»; no hay campo de contraseña ni desafío' },
  );

  await cu.paso(
    'Pedir el código con el desafío de prueba resuelto',
    async () => {
      await pedirCodigo(page, mail);
      await expect(page.getByText(mail)).toBeVisible();
    },
    { esperado: 'Aparece «Ingresá el código» con el mail al que se envió' },
  );

  await cu.paso(
    'El código llega con el remitente «Agenda Clases App»',
    async () => {
      const de = await remitenteDe(mail);
      expect(de.nombre).toBe('Agenda Clases App');
    },
    { esperado: 'El mail del código sale de «Agenda Clases App» (CA-65)' },
  );

  await cu.paso(
    'Código incorrecto: mensaje de incorrecto',
    async () => {
      const real = (await esperarMail(mail)).codigo!;
      expect(real).toMatch(/^\d{6}$/);
      const otro = String((Number(real) + 1) % 1_000_000).padStart(6, '0');
      await page.getByLabel('Código de 6 dígitos').fill(otro);
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await expect(page.getByText('El código no es correcto. Revisalo y probá de nuevo.')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Ingresá el código' })).toBeVisible();
    },
    { esperado: 'Se lee «El código no es correcto…» (H-021) y no se inicia sesión' },
  );

  await cu.paso(
    'Escribir el código correcto',
    async () => {
      const codigo = (await esperarMail(mail)).codigo!;
      await page.getByLabel('Código de 6 dígitos').fill(codigo);
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await expect(page.getByText('Completá tus datos para pedir clases.')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole('heading', { name: 'Ficha', level: 1 })).toBeVisible();
      await expect(page.getByLabel(`Cómo llegaste a ${NOMBRE_A}`)).toBeVisible();
      await expect(page.locator('input[type=password]')).toHaveCount(0);
    },
    {
      esperado:
        'Sesión iniciada y, al ser cuenta nueva, se muestra la ficha («Completá tus datos…») con «Cómo llegaste a Profesor de Prueba» (sin contraseña en ningún paso)',
    },
  );
});

test('WEB-02 sin enlace de profesor la ficha no pregunta cómo llegaste (CA-02)', async ({ page, evidencia }) => {
  const mail = mailUnico('b14.e2e.sinorigen');
  creados.push(mail);
  const cu = evidencia({
    cu: 'WEB-02-sin-origen',
    titulo: 'Ingreso sin enlace de profesor: la ficha no pregunta cómo llegó',
    criterios: ['CA-02', 'ALU-02', 'WEB-02', 'WEB-03'],
    bolt: 'B14',
  });
  await cu.paso(
    'Ingresar directo, sin pasar por el enlace de un profesor',
    async () => {
      await entrar(page, mail, '#/ingreso');
      await expect(page.getByText('Completá tus datos para pedir clases.')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByLabel('Nombre y apellido')).toBeVisible();
      await expect(page.getByLabel(/Cómo llegaste/)).toHaveCount(0);
    },
    { esperado: 'La ficha pide nombre, teléfono y nacimiento, pero no «Cómo llegaste a …»' },
  );
});

test('WEB-02 sin desafío resuelto no se pide el código: Mailpit vacío y sin usuario (CA-44)', async ({ page, evidencia }) => {
  const mail = mailUnico('b04.e2e.sincaptcha');
  creados.push(mail);
  const cu = evidencia({
    cu: 'WEB-02-captcha',
    titulo: 'Pedido del código sin desafío resuelto',
    criterios: ['CA-44', 'WEB-02', 'ALU-01'],
    bolt: 'B14',
  });
  await page.route('**/challenges.cloudflare.com/**', (r) => r.abort());

  await cu.paso(
    'Intentar pedir el código con el desafío bloqueado',
    async () => {
      await page.goto(`${BASE}#/ingreso`);
      await page.getByRole('button', { name: 'Entrar con un código por mail' }).click();
      await page.getByLabel(/^Mail/).fill(mail);
      await page.getByRole('button', { name: 'Pedir código' }).click();
      await expect(page.getByRole('alert').first()).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Ingresá el código' })).toHaveCount(0);
    },
    { esperado: 'La pantalla avisa del desafío y no avanza al paso del código' },
  );

  await cu.paso(
    'Comprobar que no salió mail ni nació usuario',
    async () => {
      await new Promise((r) => setTimeout(r, 1500));
      expect(await mailsA(mail)).toBe(0);
      expect(await sql('select 1 from auth.users where email = $1', [mail])).toEqual([]);
    },
    { esperado: 'Mailpit no tiene mails para ese mail y auth.users no tiene al usuario' },
  );
});

test('WEB-03 ficha obligatoria, errores por campo, estado pendiente con el profesor y persona a cargo', async ({ page, evidencia }) => {
  const mail = mailUnico('b14.e2e.ficha');
  creados.push(mail);
  const cu = evidencia({
    cu: 'WEB-03',
    titulo: 'Ficha obligatoria, vínculo pendiente con el profesor del enlace y personas a cargo',
    criterios: ['CA-02', 'CA-05', 'ALU-02', 'ALU-06', 'WEB-03'],
    bolt: 'B14',
  });

  await cu.paso(
    'Entrar desde el enlace del profesor y llegar a la ficha',
    async () => {
      await entrar(page, mail);
      await expect(page.getByText('Completá tus datos para pedir clases.')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByLabel(/^Mail/)).toHaveValue(mail);
    },
    { esperado: 'La ficha aparece con el mail del ingreso ya cargado' },
  );

  await cu.paso(
    'Intentar ir a la agenda y a otra ruta sin completar la ficha',
    async () => {
      for (const ruta of [`#/p/${SLUG_A}`, '#/', '#/configuracion', '#/panel']) {
        await page.goto(`${BASE}${ruta}`);
        await expect(page.getByText('Completá tus datos para pedir clases.'), ruta).toBeVisible({ timeout: 15_000 });
      }
    },
    { esperado: 'Toda ruta redirige a la ficha (CA-02), también el enlace del profesor' },
  );

  await cu.paso(
    'Guardar con un campo vacío',
    async () => {
      await llenarFicha(page);
      await page.getByLabel('Teléfono o WhatsApp').fill('');
      await page.getByRole('button', { name: 'Guardar ficha' }).click();
      await expect(page.getByLabel('Teléfono o WhatsApp')).toHaveAccessibleDescription(/\S/);
      await expect(page.getByLabel('Teléfono o WhatsApp')).toBeFocused();
      await expect(page.getByText('Completá tus datos para pedir clases.')).toBeVisible();
    },
    { esperado: 'No se guarda; el error queda asociado al campo teléfono y el foco va a él' },
  );

  await cu.paso(
    'Completar la ficha y guardar',
    async () => {
      await llenarFicha(page);
      await page.getByRole('button', { name: 'Guardar ficha' }).click();
      await expect(page.getByRole('heading', { name: 'Ficha', level: 1 })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('heading', { level: 2, name: 'Tus profesores' })).toBeVisible();
      await expect(page.getByRole('heading', { level: 3, name: NOMBRE_A })).toBeVisible();
      await expect(page.getByText('Pendiente de aprobación', { exact: true })).toBeVisible();
      await expect(page.locator('#contenido').getByText('Ana Pérez')).toBeVisible();
      const [i] = await sql<{ estado: string; como_llego: string }>(
        `select i.estado, i.como_llego from public.inscripcion i
           join public.alumno a on a.id = i.alumno_id join public.profesor p on p.id = i.profesor_id
          where a.mail = $1 and p.slug = $2`,
        [mail, SLUG_A],
      );
      expect(i).toEqual({ estado: 'pendiente', como_llego: 'Me recomendó una amiga' });
    },
    {
      esperado:
        'Se sale de la ficha: «Tus profesores» con «Profesor de Prueba» (h3) y «Pendiente de aprobación»; la inscripción con ese profesor nace pendiente con el «cómo llegó»',
    },
  );

  await cu.paso(
    'Agregar una persona a cargo',
    async () => {
      await page.getByRole('button', { name: 'Agregar persona' }).click();
      const dialogo = page.getByRole('dialog');
      await dialogo.getByLabel('Nombre', { exact: false }).first().fill('Hija de Ana');
      await dialogo.getByLabel('Fecha de nacimiento').fill('2015-05-05');
      await dialogo.getByRole('button', { name: /Guardar|Agregar/ }).click();
      await expect(page.getByText('Persona guardada.')).toBeVisible();
      await expect(page.getByText('Hija de Ana')).toBeVisible();
    },
    { esperado: 'La persona a cargo aparece en la ficha del titular (ALU-06)' },
  );
});

test('WEB-02 una persona con vínculo aprobado que ingresa desde una ruta con ?volver= vuelve al enlace del profesor (CA-01)', async ({ page, evidencia }) => {
  const mail = mailUnico('b14.e2e.retorno');
  creados.push(mail);
  const cu = evidencia({
    cu: 'WEB-02-retorno',
    titulo: 'Ingreso de una persona con vínculo: vuelve al enlace del profesor',
    criterios: ['CA-01', 'CA-07', 'WEB-02', 'WEB-01'],
    bolt: 'B14',
  });
  const profesor = await profesorId(SLUG_A);
  const [{ id: alumno }] = await sql<{ id: string }>(
    `insert into public.alumno (estado, nombre, telefono, fecha_nacimiento, mail, ficha_completada_en, ficha_origen_profesor_id, creado_por)
     values ('completa', 'Retorno E2E', '+598 99123456', '1990-01-01', $1, '2026-01-01T12:00:00Z', $2, $2) returning id`,
    [mail, profesor],
  );
  await sql("insert into public.inscripcion (alumno_id, profesor_id, estado, aprobado_en) values ($1, $2, 'aprobado', now())", [alumno, profesor]);

  await cu.paso(
    'Ingresar con el código desde `?volver=/p/<slug>`',
    async () => {
      await entrar(page, mail, `#/ingreso?volver=${encodeURIComponent(`/p/${SLUG_A}`)}`);
      await expect(page.getByRole('heading', { level: 1, name: `Agenda de ${NOMBRE_A}` })).toBeVisible({ timeout: 20_000 });
      expect(await page.evaluate(() => location.hash)).toBe(`#/p/${SLUG_A}`);
    },
    { esperado: 'Después del código se abre la agenda del profesor del enlace, no la ficha ni otra pantalla' },
  );

  await cu.paso(
    'Con un solo vínculo no aparece el selector de profesores',
    async () => {
      await expect(page.getByRole('navigation', { name: 'Tus profesores' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Pedir acceso' })).toHaveCount(0);
    },
    { esperado: 'La agenda del profesor aprobado no ofrece «Pedir acceso» ni selector (CA-53, un solo vínculo)' },
  );

  await cu.paso(
    'Ir a `#/` redirige a la agenda del único profesor',
    async () => {
      await page.goto(`${BASE}#/`);
      await expect(page.getByRole('heading', { level: 1, name: `Agenda de ${NOMBRE_A}` })).toBeVisible({ timeout: 20_000 });
    },
    { esperado: 'El inicio de quien tiene un solo vínculo lleva a la agenda de ese profesor' },
  );
});

test('WEB-03 tope de fichas: la ficha número 11 en una hora muestra el mensaje de límite (CA-43)', async ({ page, evidencia }) => {
  const mail = mailUnico('b14.e2e.tope');
  creados.push(mail);
  const cu = evidencia({ cu: 'WEB-03-tope', titulo: 'Tope de fichas por hora', criterios: ['CA-43', 'ALU-13', 'WEB-03'], bolt: 'B14' });

  await cu.paso(
    'Entrar por el enlace y completar la ficha con 10 fichas del profesor en la última hora',
    async () => {
      const ahora = new Date();
      await fijarReloj(ahora);
      // Las fichas de otras pruebas dentro de la última hora (o con fecha futura) salen del conteo del tope.
      await sql("update public.alumno set ficha_completada_en = '2026-01-01T12:00:00Z' where ficha_completada_en > now() - interval '1 hour'");
      const profesor = await profesorId(SLUG_A);
      const r = await sql<{ id: string }>(
        `insert into public.alumno (estado, nombre, telefono, fecha_nacimiento, ficha_completada_en, ficha_origen_profesor_id, creado_por)
         select 'completa', 'Relleno E2E ' || g, '+598 99123456', '2000-01-01', now() - interval '5 minutes', $1, $1
           from generate_series(1, 10) g returning id`,
        [profesor],
      );
      rellenos.push(...r.map((f) => f.id));
      await sql(
        "insert into public.inscripcion (alumno_id, profesor_id, estado, como_llego) select id, $2, 'pendiente', 'Amigos' from unnest($1::uuid[]) id",
        [rellenos, profesor],
      );
      await entrar(page, mail);
      await expect(page.getByText('Completá tus datos para pedir clases.')).toBeVisible({ timeout: 20_000 });
      await llenarFicha(page);
      await page.getByRole('button', { name: 'Guardar ficha' }).click();
      await expect(page.getByText(/Intentá de nuevo más tarde/)).toBeVisible();
      await expect(page.getByText('Completá tus datos para pedir clases.')).toBeVisible();
    },
    { esperado: 'Se lee «Intentá de nuevo más tarde» y la cuenta sigue en la ficha (ficha_incompleta)' },
  );

  await cu.paso(
    'La cuenta sigue en ficha_incompleta, sin vínculo y sin mail al profesor',
    async () => {
      const [a] = await sql<{ id: string; estado: string }>('select id, estado from public.alumno where mail = $1', [mail]);
      expect(a.estado).toBe('ficha_incompleta');
      expect(await sql('select 1 from public.inscripcion where alumno_id = $1', [a.id])).toEqual([]);
      expect(await sql('select 1 from public.mail_salida where alumno_id = $1', [a.id])).toEqual([]);
    },
    { esperado: 'El alumno sigue en ficha_incompleta, sin inscripción, y mail_salida no tiene un aviso de esa ficha' },
  );
});
