// E2E con teclado del calendario del Panel (B22, T22.2): CA-89 (recorrido solo con teclado) · NFR-11 · A11Y-35, A11Y-36, A11Y-37,
// A11Y-38, A11Y-39, A11Y-52. Escritorio (1280x900); ninguna interacción usa el mouse: Tab llega a la grilla, las flechas llegan a una
// clase, su nombre accesible dice hora, estado y nombre, y se la mueve con «Mover» (detalle → formulario → «Mover clase»).
// Los nombres accesibles son los de ux/web/accesibilidad.md A11Y-36. Datos sintéticos `CEL Cal …` (celular-datos.ts), que se limpian;
// la grilla del profesor A se guarda, se reemplaza por una conocida y se restaura. Cada caso comprueba la vista Y la base.
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Browser, Locator, Page } from '@playwright/test';
import { expect, test } from '../soporte/evidencia';
import { cerrar, sql } from '../soporte/bd';
import { SITEKEY_PRUEBA } from '../soporte/captcha';
import { esperarMail, contarMails } from '../soporte/correo';
import { entorno, RAIZ } from '../soporte/entorno';
import { MAIL_PROFESOR } from '../soporte/usuarios';
import { GRILLA_PANEL, TZ_PANEL, datosCalendarioCel, leerGrillaPanel, limpiarCalendarioCel, miercolesFuturo, ponerGrillaPanel } from './celular-datos';

const BASE = process.env.RTC_BASE ?? '/reservas/';
const ORIGEN = process.env.BASE_URL ?? `http://127.0.0.1:${process.env.RTC_PREVIEW_PORT || '4173'}`;
const SESION = resolve(RAIZ, 'node_modules', '.cache', 'calendario-teclado', 'sesion-profesor.json');
const VIEWPORT = { width: 1280, height: 900 };
const ddmm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

let grillaOriginal: Awaited<ReturnType<typeof leerGrillaPanel>> = [];
let dia = '';

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
  mkdirSync(resolve(RAIZ, 'node_modules', '.cache', 'calendario-teclado'), { recursive: true });
  const ctx = await browser.newContext({ locale: 'es-UY', timezoneId: TZ_PANEL, storageState: { cookies: [], origins: [] } });
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
  grillaOriginal = await leerGrillaPanel();
  await limpiarCalendarioCel();
  await guardarSesion(browser);
});
test.beforeEach(async () => {
  dia = miercolesFuturo();
  await ponerGrillaPanel(GRILLA_PANEL);
  await datosCalendarioCel(dia);
});
test.afterEach(async () => {
  await limpiarCalendarioCel();
  if (grillaOriginal.length > 0) await ponerGrillaPanel(grillaOriginal);
});
test.afterAll(cerrar);

// ---------------------------------------------------------------------------------------------------------------------
const calendario = (page: Page) => page.getByRole('group', { name: /^Calendario, / });
const claseAna = (page: Page) => calendario(page).getByRole('button', { name: /^\S+ \d\d\/\d\d, 10:00 a 11:00, Confirmada, CEL Cal Ana Pérez$/ });
const claseBeto = (page: Page) => calendario(page).getByRole('button', { name: /11:00 a 12:00, Pendiente, CEL Cal Beto Gómez$/ });
const detalle = (page: Page) => page.getByRole('dialog').or(page.getByRole('complementary'));
const exito = (page: Page, texto: RegExp) => page.getByRole('status').filter({ hasText: texto });

async function abrirDia(page: Page, d: string, vista: 'dia' | 'semana' = 'dia') {
  await page.goto('about:blank');
  await page.goto(`${ORIGEN}${BASE}#/panel?v=${vista}&d=${d}`);
  await expect(page.getByRole('heading', { name: 'Panel', level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect(calendario(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /10:00 a 11:00, Confirmada, CEL Cal Ana Pérez/ })).toBeVisible({ timeout: 30_000 });
}
/** ¿El foco está dentro de `contenedor`? */
const focoEn = (contenedor: Locator) => contenedor.evaluate((el) => el.contains(document.activeElement));
/** ¿El foco está en un ítem de la grilla (hueco, clase, solicitud o bloqueo: «… hh:mm a hh:mm, estado …»)? */
const focoEnItem = async (page: Page) => (await focoEn(calendario(page))) && /\d\d:\d\d a \d\d:\d\d, /.test(await nombreConFoco(page));
/** Nombre accesible aproximado del elemento con foco (aria-label, o texto). */
const nombreConFoco = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return (el?.getAttribute('aria-label') || el?.innerText || '').replace(/\s+/g, ' ').trim();
  });
/** Solo Tab: avanza hasta que `meta` es verdadera o se agota el tope (falla con el recorrido hecho). */
async function tabHasta(page: Page, meta: () => Promise<boolean>, descripcion: string, tope = 60) {
  const visto: string[] = [];
  for (let i = 0; i < tope; i++) {
    if (await meta()) return i;
    await page.keyboard.press('Tab');
    visto.push(await nombreConFoco(page));
  }
  throw new Error(`Con Tab no se llegó a ${descripcion} en ${tope} pulsaciones. Recorrido: ${visto.join(' | ')}`);
}
/** Solo la flecha indicada: avanza hasta que `meta` es verdadera (falla con el recorrido hecho). */
async function flechaHasta(page: Page, tecla: string, meta: () => Promise<boolean>, descripcion: string, tope = 25) {
  const visto: string[] = [];
  for (let i = 0; i < tope; i++) {
    if (await meta()) return i;
    await page.keyboard.press(tecla);
    visto.push(await nombreConFoco(page));
  }
  throw new Error(`Con ${tecla} no se llegó a ${descripcion} en ${tope} pulsaciones. Recorrido: ${visto.join(' | ')}`);
}
async function sesion(browser: Browser) {
  const ctx = await browser.newContext({ locale: 'es-UY', timezoneId: TZ_PANEL, storageState: SESION, viewport: VIEWPORT });
  return { ctx, page: await ctx.newPage() };
}
const horaDeAna = async () =>
  (await sql<{ i: string }>(`select to_char(c.inicio at time zone '${TZ_PANEL}','YYYY-MM-DD HH24:MI') i from public.clase c join public.alumno a on a.id = c.alumno_id where a.nombre = 'CEL Cal Ana Pérez' and c.estado = 'confirmada'`)).map((r) => r.i);

// ---------------------------------------------------------------------------------------------------------------------
test.describe('calendario del Panel · solo teclado (CA-89)', () => {
  test.setTimeout(240_000);

  test('T-CA-89-02 CA-89 NFR-11 A11Y-35 A11Y-36 A11Y-37 A11Y-39 A11Y-52 [Día] Tab llega a la grilla, las flechas a una clase con su nombre (hora, estado y nombre) y se la mueve con «Mover» solo con teclado', async ({ browser, evidencia }) => {
    const cu = evidencia({ cu: 'CA-89-teclado', titulo: 'Calendario: recorrido solo con teclado hasta mover una clase', criterios: ['CA-89', 'NFR-11', 'A11Y-36', 'A11Y-37', 'A11Y-39', 'A11Y-52'], bolt: 'B22' });
    const { ctx, page } = await sesion(browser);

    await cu.paso('Con Tab se llega a la grilla; tiene un solo tope de Tab y su ayuda de teclado', async () => {
      await abrirDia(page, dia);
      await page.locator('body').press('Home'); // sin mouse: el foco parte del documento
      await tabHasta(page, () => focoEnItem(page), 'un ítem de la grilla del calendario');
      expect(await focoEnItem(page), 'el foco está en un ítem de la grilla').toBe(true);
      await expect(calendario(page)).toHaveAttribute('aria-describedby', /.+/);
      const ayuda = await calendario(page).evaluate((el) => (el.getAttribute('aria-describedby') ?? '').split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' '));
      expect(ayuda, 'la ayuda describe el teclado (P-2)').toMatch(/Tab entra en la grilla y las flechas cambian de horario/);
      test.info().annotations.push({ type: 'ayuda de teclado', description: ayuda.trim() });
    }, { esperado: 'Tab entra en la grilla (role=group «Calendario, …») y su descripción dice «Con el teclado, Tab entra en la grilla y las flechas cambian de horario»' });

    await cu.paso('Con las flechas se llega a la clase de las 10:00 y su nombre accesible tiene hora, estado y nombre', async () => {
      await flechaHasta(page, 'ArrowDown', () => claseAna(page).evaluate((el) => el === document.activeElement).catch(() => false), 'la clase de las 10:00');
      await expect(claseAna(page)).toBeFocused();
      const nombre = await nombreConFoco(page);
      expect(nombre).toBe(`${nombre.split(',')[0]}, 10:00 a 11:00, Confirmada, CEL Cal Ana Pérez`);
      expect(nombre.split(',')[0], 'día corto con la fecha dd/mm').toBe(`${nombre.split(' ')[0]} ${ddmm(dia)}`);
      test.info().annotations.push({ type: 'nombre accesible', description: nombre });
    }, { esperado: 'La clase enfocada se llama «<día> dd/mm, 10:00 a 11:00, Confirmada, CEL Cal Ana Pérez»' });

    await cu.paso('Enter abre el detalle y con Tab se llega a «Mover»', async () => {
      await page.keyboard.press('Enter');
      await expect(detalle(page).getByRole('button', { name: 'Mover', exact: true })).toBeVisible({ timeout: 15_000 });
      await tabHasta(page, async () => (await nombreConFoco(page)) === 'Mover', '«Mover»');
      await expect(detalle(page).getByRole('button', { name: 'Mover', exact: true })).toBeFocused();
    }, { esperado: 'El detalle muestra «Mover» y se alcanza solo con Tab' });

    await cu.paso('Enter en «Mover» abre el formulario; con Tab y las flechas se elige el hueco de las 14:00', async () => {
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: 'Mover la clase', level: 3 })).toBeVisible({ timeout: 15_000 });
      const destino = page.getByRole('radio', { name: '14:00 a 15:00' });
      await tabHasta(page, () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute('role') === 'radio' || (document.activeElement as HTMLInputElement | null)?.type === 'radio'), 'un hueco del formulario');
      await flechaHasta(page, 'ArrowDown', () => destino.evaluate((el) => el === document.activeElement), 'el hueco de las 14:00', 30);
      await expect(destino).toBeChecked();
    }, { esperado: 'El hueco «14:00 a 15:00» queda enfocado y marcado, sin mouse' });

    await cu.paso('Con Tab hasta «Mover clase» y Enter, la clase se mueve a las 14:00 y el foco queda en su bloque', async () => {
      await tabHasta(page, async () => (await nombreConFoco(page)) === 'Mover clase', '«Mover clase»');
      await page.keyboard.press('Enter');
      await expect(exito(page, new RegExp(`Clase movida al ${ddmm(dia)} 14:00`))).toBeVisible({ timeout: 20_000 });
      expect(await horaDeAna(), 'la base: la clase está a las 14:00').toEqual([`${dia} 14:00`]);
      await expect(page.getByRole('button', { name: /14:00 a 15:00, Confirmada, CEL Cal Ana Pérez/ })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole('button', { name: /10:00 a 11:00, Confirmada, CEL Cal Ana Pérez/ })).toHaveCount(0);
      // A11Y-52: tras mover, el foco va al bloque movido (o, si no existe, al contenedor de la grilla).
      const movida = page.getByRole('button', { name: /14:00 a 15:00, Confirmada, CEL Cal Ana Pérez/ });
      await expect(async () => {
        const enBloque = await movida.evaluate((el) => el === document.activeElement);
        const enGrilla = await focoEn(calendario(page));
        expect(enBloque || enGrilla, `foco tras mover: «${await nombreConFoco(page)}» (${await page.evaluate(() => document.activeElement?.tagName)})`).toBe(true);
      }).toPass({ timeout: 10_000 });
      test.info().annotations.push({ type: 'foco tras mover', description: `bloque movido: ${await movida.evaluate((el) => el === document.activeElement)}; dentro de la grilla: ${await focoEn(calendario(page))}; activo: «${await nombreConFoco(page)}»` });
    }, { esperado: 'Aviso «Clase movida al dd/mm 14:00»; en la base la clase está a las 14:00; el bloque movido tiene el foco' });
    await ctx.close();
  });

  test('T-CA-89-03 CA-89 A11Y-37 A11Y-38 [Día] Inicio/Fin y flechas recorren la grilla, Enter abre el detalle, Esc devuelve el foco al bloque y Tab sale de la grilla sin trampa', async ({ browser, evidencia }) => {
    const cu = evidencia({ cu: 'CA-89-teclado-grilla', titulo: 'Calendario: flechas, Inicio/Fin, Esc y salida con Tab', criterios: ['CA-89', 'A11Y-37', 'A11Y-38'], bolt: 'B22' });
    const { ctx, page } = await sesion(browser);

    await cu.paso('Las flechas ↓ y ↑ pasan por la clase y la pendiente en orden de hora; Fin e Inicio van al último y al primer ítem', async () => {
      await abrirDia(page, dia);
      await tabHasta(page, () => focoEnItem(page), 'un ítem de la grilla del calendario');
      await page.keyboard.press('Home');
      const primero = await nombreConFoco(page);
      await page.keyboard.press('End');
      const ultimo = await nombreConFoco(page);
      expect(primero, 'Inicio: primer ítem del día (más temprano)').not.toBe(ultimo);
      const hora = (n: string) => /(\d\d):(\d\d) a/.exec(n)?.[0] ?? n;
      expect(hora(primero) < hora(ultimo), `Inicio (${primero}) es antes que Fin (${ultimo})`).toBe(true);
      await page.keyboard.press('Home');
      await flechaHasta(page, 'ArrowDown', () => claseAna(page).evaluate((el) => el === document.activeElement), 'la clase de las 10:00');
      await page.keyboard.press('ArrowDown');
      await expect(claseBeto(page), 'la siguiente es la pendiente de las 11:00 (A11Y-37: orden por hora)').toBeFocused();
      await page.keyboard.press('ArrowUp');
      await expect(claseAna(page)).toBeFocused();
    }, { esperado: 'Inicio/Fin llegan al primer y último ítem; ↓ pasa de la clase de las 10:00 a la pendiente de las 11:00 y ↑ vuelve' });

    await cu.paso('Enter abre el detalle y Esc lo cierra devolviendo el foco al bloque', async () => {
      await page.keyboard.press('Enter');
      await expect(detalle(page).getByRole('button', { name: 'Mover', exact: true })).toBeVisible({ timeout: 15_000 });
      await page.keyboard.press('Escape');
      await expect(detalle(page).getByRole('button', { name: 'Mover', exact: true })).toHaveCount(0);
      await expect(claseAna(page)).toBeFocused({ timeout: 10_000 });
    }, { esperado: 'Esc cierra el detalle y el foco vuelve a la clase de las 10:00 (A11Y-38)' });

    await cu.paso('Tab sale de la grilla: sin trampas de teclado', async () => {
      await tabHasta(page, async () => !(await focoEn(calendario(page))), 'un control fuera de la grilla', 10);
      expect(await focoEn(calendario(page)), 'el foco salió de la grilla').toBe(false);
    }, { esperado: 'Una pulsación de Tab lleva el foco fuera de la grilla (un solo tope de Tab, A11Y-37)' });
    await ctx.close();
  });

  test('T-CA-89-04 CA-89 A11Y-37 [Semana] ← y → pasan a la clase del mismo horario del día contiguo', async ({ browser, evidencia }) => {
    const cu = evidencia({ cu: 'CA-89-teclado-semana', titulo: 'Calendario Semana: flechas entre días', criterios: ['CA-89', 'A11Y-37'], bolt: 'B22' });
    const { ctx, page } = await sesion(browser);
    const sig = (() => {
      const d = new Date(`${dia}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    })();
    await cu.paso('En Semana, → desde la clase de las 10:00 llega al ítem del mismo horario del día contiguo (un hueco libre) y ← vuelve', async () => {
      await abrirDia(page, dia, 'semana');
      await tabHasta(page, () => focoEnItem(page), 'un ítem de la grilla del calendario');
      await flechaHasta(page, 'ArrowRight', async () => (await nombreConFoco(page)).includes(ddmm(dia)), `la columna del ${ddmm(dia)}`, 8);
      await flechaHasta(page, 'ArrowDown', () => claseAna(page).evaluate((el) => el === document.activeElement), 'la clase de las 10:00');
      const antes = await nombreConFoco(page);
      await page.keyboard.press('ArrowRight');
      const despues = await nombreConFoco(page);
      expect(despues, 'el foco cambió de día').not.toBe(antes);
      expect(despues.split(',')[0], `el ítem está en el día contiguo (${ddmm(sig)})`).toContain(ddmm(sig));
      await page.keyboard.press('ArrowLeft');
      await expect(claseAna(page)).toBeFocused();
      expect(await horaDeAna(), 'la base no cambió').toEqual([`${dia} 10:00`]);
    }, { esperado: '→ lleva al día contiguo (dd/mm del día siguiente) y ← regresa a la clase de las 10:00; la base queda igual' });
    await ctx.close();
  });
});
