// E2E de la agenda pública de un profesor (WEB-01, AGE-09; CA-15, CA-16, AGE-07, AGE-08; casos T-AGE-15, T-AGE-17), en
// su enlace `#/p/<slug>` (B14): el navegador corre en Asia/Tokyo y el profesor está en America/Montevideo. Reloj fijo en el navegador (page.clock) y en la base
// (ADR-014): lunes 2026-11-02 23:30 de Montevideo, que en Tokio ya es martes 3 a las 11:30 (prueba del
// cambio de día sin desfase). Corre contra dist/ (se reconstruye con la URL local) servido por vite preview.
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { execSync } from 'node:child_process';
import { expect, test } from '../soporte/evidencia';
import { cerrar, sql } from '../soporte/bd';
import { entorno, RAIZ } from '../soporte/entorno';
import { profesorId, SLUG_A, SLUG_B } from '../soporte/usuarios';
import { fijarReloj, limpiarReloj } from '../soporte/reloj';


const BASE = process.env.RTC_BASE ?? '/reservas/';
const AGENDA = `${BASE}#/p/${SLUG_A}`;
const AHORA = '2026-11-03T02:30:00Z'; // lunes 23:30 en Montevideo; martes 11:30 en Tokio
const PREFIJO = 'f3000000-0000-0000-0000-0000000000';
const id = (n: number) => `${PREFIJO}${String(n).padStart(2, '0')}`;

test.use({ timezoneId: 'Asia/Tokyo', locale: 'es-UY', viewport: { width: 1024, height: 800 } });

/**
 * Reloj del navegador en AHORA. No usa page.clock: su Date falso rompe `TZDate` (date-fns/tz, subclase de Date) y la
 * página calcularía "hoy" con el huso del navegador (comprobado con timezoneId Asia/Tokyo). Aquí un Proxy de
 * Date (una subclase tampoco sirve con TZDate) solo desplaza `Date.now()` y `new Date()` por un desfase fijo; el tiempo sigue corriendo.
 */
async function fijarReloj_navegador(page: Page) {
  await page.addInitScript((objetivo: number) => {
    const Real = Date;
    const desfase = objetivo - Real.now();
    window.Date = new Proxy(Real, {
      construct: (t, args, nt) => Reflect.construct(t, args.length ? args : [Real.now() + desfase], nt),
      get: (t, k, r) => (k === 'now' ? () => Real.now() + desfase : Reflect.get(t, k, r)),
    });
  }, Date.parse(AHORA));
}

async function limpiar() {
  await sql('delete from public.clase where id::text like $1', [`${PREFIJO}%`]);
  await sql('delete from public.reserva where id::text like $1', [`${PREFIJO}%`]);
  await sql('delete from public.inscripcion where alumno_id::text like $1', [`${PREFIJO}%`]);
  await sql('delete from public.alumno where id::text like $1', [`${PREFIJO}%`]);
}

test.beforeAll(async () => {
  test.setTimeout(300_000);
  const e = entorno();
  if (!process.env.BASE_URL) {
    // La vista de B02 es posterior al dist de B01: se reconstruye con la URL y la clave del stack local.
    execSync('npm run build', {
      cwd: RAIZ,
      stdio: 'ignore',
      timeout: 240_000,
      env: { ...process.env, VITE_SUPABASE_URL: e.apiUrl, VITE_SUPABASE_ANON_KEY: e.anonKey },
    });
  }
  await limpiar();
  const profesor = await profesorId(SLUG_A);
  await sql("update public.profesor set zona_horaria = 'America/Montevideo', duracion_min = 60 where id = $1", [profesor]);
  // H-460: otras pruebas (reservas, movimientos...) pueden dejar clases de este profesor el lunes 2; la agenda
  // espera ese día con un único ocupado y el índice clase_sin_solape rechaza el hueco de las 10:00. Se vacía el día.
  await sql(
    "delete from public.clase where profesor_id = $1 and inicio < '2026-11-03 00:00-03' and fin > '2026-11-02 00:00-03'",
    [profesor],
  );
  await sql(
    "insert into public.alumno (id, estado, nombre, mail, creado_por) values ($1, 'completa', 'Alumno Agenda E2E', 'agenda.e2e@example.test', $2)",
    [id(1), profesor],
  );
  await sql("insert into public.inscripcion (alumno_id, profesor_id, estado) values ($1, $2, 'sin_cuenta')", [id(1), profesor]);
  await sql(
    `insert into public.reserva (id, profesor_id, alumno_id, tipo, hora_local, dia_semana, duracion_min, observacion, estado, desde, origen)
     values ($1, $2, $3, 'suelta', '10:00', 1, 60, 'Observacion E2E', 'confirmada', '2026-11-02', 'profesor')`,
    [id(2), profesor, id(1)],
  );
  // Clase de las 10:00 de Montevideo (= 13:00 UTC = 22:00 en Tokio).
  await sql(
    `insert into public.clase (id, profesor_id, reserva_id, alumno_id, inicio, fin, estado)
     values ($1, $2, $3, $4, '2026-11-02 10:00-03', '2026-11-02 11:00-03', 'confirmada')`,
    [id(3), profesor, id(2), id(1)],
  );
  await fijarReloj(AHORA);
});

test.afterAll(async () => {
  await limpiar();
  await limpiarReloj();
  await cerrar();
});

test('WEB-01 la agenda del día muestra las horas del profesor en un navegador de otro huso', async ({ page, evidencia }) => {
  const cu = evidencia({
    cu: 'WEB-01',
    titulo: 'Agenda pública por día en el huso del profesor',
    criterios: ['CA-15', 'CA-16', 'AGE-07', 'AGE-08', 'AGE-09', 'WEB-01'],
    bolt: 'B14',
  });
  await fijarReloj_navegador(page);
  const lista = () => page.getByRole('list', { name: 'Huecos del día' });
  const fila = (rango: string) => lista().getByRole('listitem').filter({ hasText: rango });

  // T-AGE-17: el navegador está en Tokio, pero "hoy" es lunes 2 (Montevideo).
  expect(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe('Asia/Tokyo');

  await cu.paso(
    'Abrir la agenda del profesor por su enlace, sin sesión y con navegador en Asia/Tokyo',
    async () => {
      await page.goto(AGENDA);
      await expect(page.getByRole('heading', { level: 1, name: 'Agenda de Profesor de Prueba' })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2 })).toContainText(/lunes.*2.*noviembre/i);
      await expect(lista()).toBeVisible();
    },
    { esperado: 'La agenda con el nombre del profesor abre en el lunes 2 de noviembre (día del profesor, no el martes 3 de Tokio)' },
  );

  await cu.paso(
    'Ver el huso y la clase de las 10:00',
    async () => {
      await expect(page.getByText('Horarios en el huso America/Montevideo.')).toBeVisible();
      await expect(fila('10:00 a 11:00')).toContainText('Ocupado');
      await expect(fila('08:00 a 09:00')).toContainText('Libre');
      await expect(page.getByText('22:00')).toHaveCount(0); // la hora del navegador no aparece
    },
    { esperado: 'La clase se muestra a las 10:00 (Ocupado), no a las 22:00 de Tokio; el huso configurado está a la vista' },
  );

  await cu.paso(
    'Revisar los 9 huecos y el resumen',
    async () => {
      await expect(lista().getByRole('listitem')).toHaveCount(9);
      await expect(fila('13:00 a')).toHaveCount(0);
      await expect(page.getByText('8 huecos libres de 9.')).toBeAttached();
    },
    { esperado: '9 huecos (08-13 y 14-18, sin 13:00 a 14:00), 8 libres y 1 ocupado, sin nombres ni observaciones' },
  );

  await cu.paso(
    'Comprobar que la página no muestra datos personales',
    async () => {
      const texto = await page.locator('body').innerText();
      expect(texto).not.toMatch(/Alumno Agenda E2E|Observacion E2E|example\.test/);
    },
    { esperado: 'Ni el nombre del alumno ni la observación aparecen en la página (CA-15)' },
  );

  await cu.paso(
    'La agenda de otro profesor no trae la clase de este ni sus datos (CA-15, AGE-09)',
    async () => {
      await page.goto(`${BASE}#/p/${SLUG_B}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Agenda de Profesora B de Prueba' })).toBeVisible();
      await expect(lista()).toBeVisible();
      await expect(lista().getByText('Ocupado')).toHaveCount(0);
      expect(await page.locator('body').innerText()).not.toMatch(/Alumno Agenda E2E|Profesor de Prueba|example\.test/);
      await page.goto(AGENDA);
      await expect(fila('10:00 a 11:00')).toContainText('Ocupado');
    },
    { esperado: 'La agenda de la profesora B muestra su nombre, ningún hueco ocupado y nada de A; la de A sigue con su clase de las 10:00' },
  );

  await cu.paso(
    'Un enlace que no existe no muestra agenda',
    async () => {
      await page.goto(`${BASE}#/p/no-existe-e2e`);
      await expect(page.getByRole('heading', { name: 'Enlace no válido, pedile el enlace a tu profesor' })).toBeVisible();
      await expect(page.getByRole('list', { name: 'Huecos del día' })).toHaveCount(0);
      await page.goto(AGENDA);
      await expect(lista()).toBeVisible();
    },
    { esperado: 'Se lee «Enlace no válido, pedile el enlace a tu profesor» y no hay huecos' },
  );

  await cu.paso(
    'Pasar al día siguiente',
    async () => {
      await page.getByRole('button', { name: 'Día siguiente' }).click();
      await expect(page.getByRole('heading', { level: 2 })).toContainText(/martes.*3.*noviembre/i);
      await expect(lista().getByRole('listitem')).toHaveCount(9);
      await expect(page.getByText('9 huecos libres de 9.')).toBeAttached();
    },
    { esperado: 'Martes 3 de noviembre, con 9 huecos libres' },
  );

  await cu.paso(
    'Volver dos días atrás: domingo sin huecos',
    async () => {
      await page.getByRole('button', { name: 'Día anterior' }).click();
      await page.getByRole('button', { name: 'Día anterior' }).click();
      await expect(page.getByRole('heading', { level: 2, name: /domingo.*1.*noviembre/i })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'No hay huecos este día' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Día siguiente' })).toBeEnabled();
    },
    { esperado: 'Se ve «No hay huecos este día» y el selector sigue disponible' },
  );

  await cu.paso(
    'Ver el estado cargando con una respuesta lenta',
    async () => {
      await page.route('**/rest/v1/rpc/agenda_publica', async (ruta) => {
        await new Promise((r) => setTimeout(r, 1500));
        await ruta.continue();
      });
      await page.getByRole('button', { name: 'Día siguiente' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Cargando los huecos del día' })).toBeAttached();
      await expect(lista()).toBeVisible({ timeout: 10_000 });
      await page.unroute('**/rest/v1/rpc/agenda_publica');
    },
    { esperado: 'Mientras responde se anuncia «Cargando los huecos del día…»; después aparece la lista' },
  );

  await cu.paso(
    'Forzar un error de red y reintentar',
    async () => {
      await page.route('**/rest/v1/rpc/agenda_publica', (ruta) => ruta.abort());
      await page.getByRole('button', { name: 'Día siguiente' }).click();
      const alerta = page.getByRole('alert');
      await expect(alerta).toContainText('No se pudo cargar la agenda');
      await page.unroute('**/rest/v1/rpc/agenda_publica');
      await alerta.getByRole('button', { name: 'Reintentar' }).click();
      await expect(lista()).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
    },
    { esperado: 'Aparece el error con «Reintentar»; al reintentar con red se ve la lista del mismo día' },
  );

  await cu.paso(
    'Un día inválido en la dirección vuelve a hoy',
    async () => {
      await page.goto(`${AGENDA}?d=2999-12-31`);
      await expect(page.getByRole('heading', { level: 2 })).toContainText(/lunes.*2.*noviembre/i);
      await page.goto(`${AGENDA}?d=basura`);
      await expect(page.getByRole('heading', { level: 2 })).toContainText(/lunes.*2.*noviembre/i);
    },
    { esperado: 'Un ?d= fuera de límites o mal formado vuelve a hoy (lunes 2) sin mensaje' },
  );
});

test('WEB-01 accesibilidad: axe con contraste real y reflujo a 320 px', async ({ page, evidencia }) => {
  const cu = evidencia({
    cu: 'WEB-01-A11Y',
    titulo: 'Agenda pública: contraste, reflujo a 320 px y zoom',
    criterios: ['WEB-01', 'NFR-05', 'NFR-06', 'CA-37'],
    bolt: 'B14',
  });
  await fijarReloj_navegador(page);

  await cu.paso(
    'Axe sobre la agenda con huecos (contraste incluido)',
    async () => {
      await page.goto(AGENDA);
      await expect(page.getByRole('list', { name: 'Huecos del día' })).toBeVisible();
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    },
    { esperado: 'Cero violaciones WCAG 2.1 AA, con color-contrast medido en el navegador' },
  );

  await cu.paso(
    'Reflujo a 320 px sin desplazamiento horizontal',
    async () => {
      await page.setViewportSize({ width: 320, height: 700 });
      await expect(page.getByRole('list', { name: 'Huecos del día' })).toBeVisible();
      const desborda = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(desborda).toBe(false);
      await expect(page.getByRole('button', { name: 'Día siguiente' })).toBeVisible();
    },
    { esperado: 'A 320 px el contenido cabe sin scroll horizontal y los controles siguen visibles' },
  );

  await cu.paso(
    'Axe sobre la agenda del domingo (día sin huecos) a 320 px',
    async () => {
      await page.goto(`${AGENDA}?d=2026-11-01`);
      await expect(page.getByRole('heading', { name: 'No hay huecos este día' })).toBeVisible();
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(r.violations.map((v) => v.id)).toEqual([]);
    },
    { esperado: 'Cero violaciones también en el estado sin huecos' },
  );
});
