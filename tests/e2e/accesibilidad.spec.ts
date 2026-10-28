// Diagnóstico de accesibilidad WCAG 2.1 AA de todas las rutas y estados de ux/web/accesibilidad.md §1 (B12, T12.1a;
// CA-37, NFR-05; T-NFR-07, T-NFR-08, T-WEB-12 y T-ADM-20 en su parte de axe; WEB-01 a WEB-11). En cada ruta, por rol,
// corre @axe-core/playwright con wcag2a, wcag2aa, wcag21a y wcag21aa y exige CERO violaciones (umbral de CA-37). Es un
// diagnóstico: las violaciones que encuentra axe quedan como pruebas que fallan (no hay skip, fixme ni reglas
// desactivadas), y cada una queda anotada con regla, selector y HTML en `violaciones.jsonl` de la evidencia
// WEB-A11Y-B12. Roles: visitante, persona nueva (primer ingreso), persona con ficha (sin vínculo, pendiente, rechazada,
// aprobada con un profesor y con dos: selector WEB-11), profesor y Administrador. Las sesiones entran una sola vez con
// el código de Mailpit y se reutilizan; los vínculos de la persona se cambian por la base entre pruebas (prefijo `T05 `).
// Los estados cargando, error y vacío se obtienen interceptando la red con page.route. Corre contra dist/ servido por
// vite preview. Sin datos personales reales: solo @example.test.
import AxeBuilder from '@axe-core/playwright';
import { execSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { expect, test } from '../soporte/evidencia';
import { cerrar, sql } from '../soporte/bd';
import { SITEKEY_PRUEBA } from '../soporte/captcha';
import { esperarMail, contarMails } from '../soporte/correo';
import { entorno, RAIZ } from '../soporte/entorno';
import { MAIL_ADMIN, MAIL_PROFESOR, SLUG_A, SLUG_B } from '../soporte/usuarios';
import { crearAlumno, crearClase, limpiarT05, mailT05 } from '../integracion/cuentas/ayuda';

const BASE = process.env.RTC_BASE ?? '/reservas/';
const ORIGEN = process.env.BASE_URL ?? `http://127.0.0.1:${process.env.RTC_PREVIEW_PORT || '4173'}`;
const RUTA = (hash: string) => `${ORIGEN}${BASE}${hash}`;
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const NOMBRE_A = 'Profesor de Prueba';
const NOMBRE_B = 'Profesora B de Prueba';
const SES = (n: string) => resolve(RAIZ, 'test-results', `.sesion-a11y-${n}.json`);
const CARPETA = resolve(process.env.AIDLC_EVIDENCIAS || resolve(RAIZ, '.aidlc/reservatuclase/calidad/evidencias/ui'), 'WEB-A11Y-B12');

test.use({ locale: 'es-UY', viewport: { width: 1280, height: 900 } });

// ---------------------------------------------------------------------------------------------------------------
// Auditoría: axe sobre el estado actual, captura y registro; falla si hay una sola violación.
// ---------------------------------------------------------------------------------------------------------------
interface Violacion {
  regla: string;
  impacto: string | null | undefined;
  ayuda: string;
  selector: string;
  html: string;
}
interface Resultado {
  rol: string;
  ruta: string;
  estado: string;
  violaciones: Violacion[];
  captura: string;
}
const resultados: Resultado[] = [];
let ordinal = 0;
const slug = (t: string) =>
  t.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

async function auditar(page: Page, rol: string, ruta: string, estado: string) {
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const violaciones: Violacion[] = r.violations.flatMap((v) =>
    v.nodes.map((n) => ({ regla: v.id, impacto: v.impact, ayuda: v.help, selector: n.target.join(' '), html: n.html.slice(0, 200) })),
  );
  ordinal = existsSync(resolve(CARPETA, 'violaciones.jsonl')) ? readFileSync(resolve(CARPETA, 'violaciones.jsonl'), 'utf8').split('\n').filter(Boolean).length + 1 : 1;
  const archivo = `${String(ordinal).padStart(2, '0')}-${slug(`${rol} ${ruta} ${estado}`)}.png`;
  await page.screenshot({ path: resolve(CARPETA, 'capturas', archivo), fullPage: true }).catch(() => undefined);
  const res: Resultado = { rol, ruta, estado, violaciones, captura: `capturas/${archivo}` };
  resultados.push(res);
  appendFileSync(resolve(CARPETA, 'violaciones.jsonl'), JSON.stringify(res) + '\n');
  expect(
    violaciones.map((v) => `${v.regla} [${v.impacto}] ${v.selector}`),
    `axe en ${rol} · ${ruta} · ${estado}`,
  ).toEqual([]);
}

// ---------------------------------------------------------------------------------------------------------------
// Entrada con código y sesiones.
// ---------------------------------------------------------------------------------------------------------------
async function entrar(page: Page, mail: string, hash = '#/ingreso') {
  const antes = await contarMails(mail);
  await page.goto(RUTA(hash));
  await page.getByRole('button', { name: 'Entrar con un código por mail' }).click();
  await page.getByLabel(/^Mail/).fill(mail);
  await expect(async () => {
    await page.getByRole('button', { name: 'Pedir código' }).click();
    await expect(page.getByRole('heading', { name: 'Ingresá el código' })).toBeVisible({ timeout: 2_500 });
  }).toPass({ timeout: 90_000, intervals: [1_000, 2_000, 3_000] });
  const codigo = (await esperarMail(mail, antes + 1)).codigo!;
  await page.getByLabel('Código de 6 dígitos').fill(codigo);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}

async function guardarSesion(browser: Browser, mail: string, archivo: string, previo?: string) {
  const ctx = await browser.newContext({ locale: 'es-UY', storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  if (previo) await page.goto(RUTA(previo));
  await entrar(page, mail);
  await expect(page).not.toHaveURL(/#\/ingreso/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
  await ctx.storageState({ path: archivo });
  await ctx.close();
}

interface Vinculo {
  slug: string;
  estado: 'pendiente' | 'aprobado' | 'rechazado';
  motivo?: string;
}
/** Deja a la persona con exactamente estos vínculos (por la base, rol postgres). */
async function vinculos(alumnoId: string, lista: Vinculo[]) {
  await sql('delete from public.inscripcion where alumno_id = $1', [alumnoId]);
  for (const v of lista) {
    await sql(
      `insert into public.inscripcion (alumno_id, profesor_id, estado, motivo_estado, como_llego)
       values ($1, (select id from public.profesor where slug = $2), $3, $4, 'Por un enlace de prueba')`,
      [alumnoId, v.slug, v.estado, v.estado === 'rechazado' ? (v.motivo ?? 'Motivo de prueba') : null],
    );
  }
}
const profesorActivo = (slugP: string, activo: boolean) => sql('update public.profesor set activo = $2 where slug = $1', [slugP, activo]);

// Playwright reinicia el worker tras cada prueba que falla (y falla por diseño: es un diagnóstico), y el módulo y
// beforeAll se vuelven a ejecutar. El estado de la corrida (mails, hora de inicio) vive en un archivo para que los
// workers siguientes reutilicen sesiones y evidencia en lugar de rehacerlas. Una corrida dura menos de 25 min.
const ESTADO = resolve(RAIZ, 'test-results', '.a11y-corrida.json');
interface Corrida {
  t: number;
  alumna: string;
  origen: string;
  sin: string;
}
mkdirSync(resolve(RAIZ, 'test-results'), { recursive: true });
let corrida: Corrida | null = null;
let nueva = false;
try {
  if (existsSync(ESTADO)) corrida = JSON.parse(readFileSync(ESTADO, 'utf8')) as Corrida;
} catch {
  corrida = null;
}
if (!corrida || Date.now() - corrida.t > 25 * 60_000) {
  corrida = { t: Date.now(), alumna: mailT05('a11y.alumna'), origen: mailT05('a11y.nueva.origen'), sin: mailT05('a11y.nueva.sin') };
  writeFileSync(ESTADO, JSON.stringify(corrida));
  nueva = true;
}
const MAIL_ALUMNA = corrida.alumna;
const MAIL_NUEVA_ORIGEN = corrida.origen;
const MAIL_NUEVA_SIN = corrida.sin;
let alumnaId = '';

test.beforeAll(async ({ browser }) => {
  test.setTimeout(420_000);
  const e = entorno();
  if (!process.env.BASE_URL) {
    execSync('npm run build', {
      cwd: RAIZ,
      stdio: 'ignore',
      timeout: 240_000,
      env: { ...process.env, VITE_SUPABASE_URL: e.apiUrl, VITE_SUPABASE_ANON_KEY: e.anonKey, VITE_TURNSTILE_SITEKEY: SITEKEY_PRUEBA },
    });
  }
  if (nueva) rmSync(CARPETA, { recursive: true, force: true });
  mkdirSync(resolve(CARPETA, 'capturas'), { recursive: true });
  await profesorActivo(SLUG_A, true);
  await profesorActivo(SLUG_B, true);
  await sql('select privado.configurar_administrador($1)', [MAIL_ADMIN]);
  const ya = await sql<{ id: string }>('select id from public.alumno where mail = $1', [MAIL_ALUMNA]);
  if (ya.length && !nueva) {
    alumnaId = ya[0].id;
    return; // sesiones de esta corrida ya guardadas
  }
  await limpiarT05();
  alumnaId = await crearAlumno({ nombre: 'Alumna A11y', estado: 'aprobado', telefono: '+598 99555000', mail: MAIL_ALUMNA });
  await guardarSesion(browser, MAIL_ALUMNA, SES('alumna'));
  await guardarSesion(browser, MAIL_NUEVA_ORIGEN, SES('nueva-origen'));
  await guardarSesion(browser, MAIL_NUEVA_SIN, SES('nueva-sin'));
  await guardarSesion(browser, MAIL_PROFESOR, SES('profesor'));
  await guardarSesion(browser, MAIL_ADMIN, SES('admin'));
});

test.afterEach(async () => {
  await profesorActivo(SLUG_A, true);
  await profesorActivo(SLUG_B, true);
});

test.afterAll(async () => {
  const filas = existsSync(resolve(CARPETA, 'violaciones.jsonl'))
    ? readFileSync(resolve(CARPETA, 'violaciones.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Resultado)
    : [];
  const pasos = filas.map((r, i) => ({
    n: i + 1,
    titulo: `${r.rol} · ${r.ruta} · ${r.estado}`,
    esperado: 'Cero violaciones axe WCAG 2.1 AA (CA-37)',
    resultado: r.violaciones.length ? 'falla' : 'ok',
    captura: r.captura,
    nota: r.violaciones.length ? `${r.violaciones.length} nodo(s): ${[...new Set(r.violaciones.map((v) => v.regla))].join(', ')}` : undefined,
    fecha: new Date().toISOString(),
    duracion_ms: 0,
  }));
  writeFileSync(
    resolve(CARPETA, 'evidencia.json'),
    JSON.stringify(
      {
        cu: 'WEB-A11Y-B12',
        titulo: 'Diagnóstico axe WCAG 2.1 AA de todas las rutas y estados (B12, T12.1a)',
        componente: 'web',
        navegador: process.env.AIDLC_NAVEGADOR || 'chromium',
        bolt: 'B12',
        criterios: ['CA-37', 'NFR-05', 'WEB-01', 'WEB-09', 'WEB-10', 'WEB-11'],
        url_base: ORIGEN,
        fecha: new Date().toISOString(),
        pasos,
      },
      null,
      2,
    ) + '\n',
  );
  await cerrar();
});

/** Una página nueva con la sesión guardada, que se cierra al terminar el cuerpo. */
async function con(browser: Browser, sesion: string | null, cuerpo: (page: Page) => Promise<void>, opciones: { viewport?: { width: number; height: number } } = {}) {
  const ctx = await browser.newContext({
    locale: 'es-UY',
    viewport: opciones.viewport ?? { width: 1280, height: 900 },
    storageState: sesion ? SES(sesion) : { cookies: [], origins: [] },
  });
  const page = await ctx.newPage();
  try {
    await cuerpo(page);
  } finally {
    await ctx.close();
  }
}

const h1 = (page: Page, nombre?: string | RegExp) =>
  expect(nombre ? page.getByRole('heading', { level: 1, name: nombre }) : page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 30_000 });

// ---------------------------------------------------------------------------------------------------------------
// Visitante
// ---------------------------------------------------------------------------------------------------------------
test.describe('visitante', () => {
  test('CA-37 WEB-09 #/ inicio sin enlace', async ({ browser }) => {
    await con(browser, null, async (page) => {
      await page.goto(RUTA('#/'));
      await h1(page, 'Pedile el enlace a tu profesor');
      await auditar(page, 'visitante', '#/', 'sin enlace (WEB-09)');
    });
  });

  test('CA-37 #/ inicio cargando', async ({ browser }) => {
    await con(browser, null, async (page) => {
      await page.route('**/rest/v1/rpc/sesion_actual', async (r) => {
        await new Promise((x) => setTimeout(x, 2_500));
        await r.continue();
      });
      await page.goto(RUTA('#/'));
      await auditar(page, 'visitante', '#/', 'cargando');
    });
  });

  test('CA-37 WEB-01 #/p/<slug> agenda ok', async ({ browser }) => {
    await con(browser, null, async (page) => {
      await page.goto(RUTA(`#/p/${SLUG_A}`));
      await h1(page, `Agenda de ${NOMBRE_A}`);
      await expect(page.getByRole('list', { name: 'Huecos del día' })).toBeVisible();
      await auditar(page, 'visitante', '#/p/<slug>', 'ok');
    });
  });

  test('CA-37 WEB-01 #/p/<slug> cargando', async ({ browser }) => {
    await con(browser, null, async (page) => {
      await page.route('**/rest/v1/rpc/agenda_publica', async (r) => {
        await new Promise((x) => setTimeout(x, 3_000));
        await r.continue();
      });
      await page.goto(RUTA(`#/p/${SLUG_A}`));
      await expect(page.getByRole('status').filter({ hasText: 'Cargando' }).first()).toBeAttached({ timeout: 10_000 });
      await auditar(page, 'visitante', '#/p/<slug>', 'cargando');
    });
  });

  test('CA-37 WEB-01 #/p/<slug> día vacío', async ({ browser }) => {
    await con(browser, null, async (page) => {
      await page.route('**/rest/v1/rpc/agenda_publica', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
      await page.goto(RUTA(`#/p/${SLUG_A}`));
      await expect(page.getByText('No hay huecos este día')).toBeVisible({ timeout: 20_000 });
      await auditar(page, 'visitante', '#/p/<slug>', 'vacío');
    });
  });

  test('CA-37 WEB-01 #/p/<slug> error de red', async ({ browser }) => {
    await con(browser, null, async (page) => {
      await page.route('**/rest/v1/rpc/agenda_publica', (r) => r.abort());
      await page.goto(RUTA(`#/p/${SLUG_A}`));
      await expect(page.getByRole('alert')).toContainText('No se pudo cargar la agenda', { timeout: 20_000 });
      await auditar(page, 'visitante', '#/p/<slug>', 'error');
    });
  });

  test('CA-37 WEB-01 #/p/<slug> enlace no válido', async ({ browser }) => {
    await con(browser, null, async (page) => {
      await page.goto(RUTA('#/p/no-existe-a11y'));
      await h1(page);
      await auditar(page, 'visitante', '#/p/<slug>', 'enlace no válido');
    });
  });

  test('CA-37 WEB-01 #/p/<slug> profesor inactivo', async ({ browser }) => {
    await profesorActivo(SLUG_B, false);
    await con(browser, null, async (page) => {
      await page.goto(RUTA(`#/p/${SLUG_B}`));
      await expect(page.getByText(`${NOMBRE_B} no toma reservas por ahora`)).toBeVisible({ timeout: 20_000 });
      await auditar(page, 'visitante', '#/p/<slug>', 'profesor inactivo');
    });
  });

  test('CA-37 WEB-02 #/ingreso paso mail', async ({ browser }) => {
    await con(browser, null, async (page) => {
      await page.goto(RUTA('#/ingreso'));
      await h1(page);
      await auditar(page, 'visitante', '#/ingreso', 'inicio (opciones de ingreso)');
      await page.getByRole('button', { name: 'Entrar con un código por mail' }).click();
      await expect(page.getByLabel(/^Mail/)).toBeVisible();
      await auditar(page, 'visitante', '#/ingreso', 'paso mail');
    });
  });

  test('CA-37 WEB-02 #/ingreso paso código y error de código', async ({ browser }) => {
    const mail = mailT05('a11y.codigo');
    await con(browser, null, async (page) => {
      await page.goto(RUTA('#/ingreso'));
      await page.getByRole('button', { name: 'Entrar con un código por mail' }).click();
      await page.getByLabel(/^Mail/).fill(mail);
      await expect(async () => {
        await page.getByRole('button', { name: 'Pedir código' }).click();
        await expect(page.getByRole('heading', { name: 'Ingresá el código' })).toBeVisible({ timeout: 2_500 });
      }).toPass({ timeout: 90_000, intervals: [1_000, 2_000, 3_000] });
      await auditar(page, 'visitante', '#/ingreso', 'paso código');
      await page.getByLabel('Código de 6 dígitos').fill('000000');
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await expect(page.getByRole('alert')).toBeVisible({ timeout: 20_000 });
      await auditar(page, 'visitante', '#/ingreso', 'error de código');
    });
  });

  test('CA-37 sin permisos: visitante en #/panel', async ({ browser }) => {
    await con(browser, null, async (page) => {
      await page.goto(RUTA('#/panel'));
      await h1(page);
      await auditar(page, 'visitante', '#/panel', 'sin permisos');
    });
  });

  test('CA-37 WEB-10 sin permisos: visitante en #/admin', async ({ browser }) => {
    await con(browser, null, async (page) => {
      await page.goto(RUTA('#/admin'));
      await h1(page);
      await auditar(page, 'visitante', '#/admin', 'sin permisos');
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Persona nueva: primer ingreso, ficha obligatoria
// ---------------------------------------------------------------------------------------------------------------
test.describe('persona nueva', () => {
  test('CA-37 WEB-03 #/ficha primer ingreso con profesor de origen, y con errores', async ({ browser }) => {
    await con(browser, 'nueva-origen', async (page) => {
      // El profesor de origen se anota al visitar su enlace (ADR-020); la guarda lleva a la ficha.
      await page.goto(RUTA(`#/p/${SLUG_A}`));
      await expect(page).toHaveURL(/#\/ficha/, { timeout: 20_000 });
      await h1(page);
      await expect(page.getByLabel(new RegExp(`Cómo llegaste a ${NOMBRE_A}`))).toBeVisible({ timeout: 20_000 });
      await auditar(page, 'persona nueva', '#/ficha', 'primer ingreso con profesor de origen');
      await page.getByRole('button', { name: /^Guardar/ }).click();
      await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible();
      await auditar(page, 'persona nueva', '#/ficha', 'primer ingreso con errores de formulario');
    });
  });

  test('CA-37 WEB-03 #/ficha primer ingreso sin profesor de origen', async ({ browser }) => {
    await con(browser, 'nueva-sin', async (page) => {
      await page.goto(RUTA('#/ficha'));
      await h1(page);
      await expect(page.getByLabel('Nombre y apellido')).toBeVisible({ timeout: 20_000 });
      await auditar(page, 'persona nueva', '#/ficha', 'primer ingreso sin profesor de origen');
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Persona con ficha: alumna con distintos vínculos
// ---------------------------------------------------------------------------------------------------------------
test.describe('alumna', () => {
  test('CA-37 WEB-09 #/ sin vínculos y #/p/<slug> con «Pedir acceso»', async ({ browser }) => {
    await vinculos(alumnaId, []);
    await con(browser, 'alumna', async (page) => {
      await page.goto(RUTA('#/'));
      await h1(page, 'Pedile el enlace a tu profesor');
      await auditar(page, 'alumna sin vínculo', '#/', 'sin enlace (WEB-09)');
      await page.goto(RUTA(`#/p/${SLUG_A}`));
      await expect(page.getByRole('heading', { level: 2, name: `Pedir acceso a ${NOMBRE_A}` })).toBeVisible({ timeout: 20_000 });
      await auditar(page, 'alumna sin vínculo', '#/p/<slug>', 'con «Pedir acceso»');
      await page.getByRole('button', { name: 'Pedir acceso', exact: true }).click();
      await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible();
      await auditar(page, 'alumna sin vínculo', '#/p/<slug>', '«Pedir acceso» con error de formulario');
    });
  });

  test('CA-37 #/ficha y #/mis-clases sin vínculos', async ({ browser }) => {
    await vinculos(alumnaId, []);
    await con(browser, 'alumna', async (page) => {
      await page.goto(RUTA('#/ficha'));
      await h1(page);
      await page.waitForLoadState('networkidle');
      await auditar(page, 'alumna sin vínculo', '#/ficha', 'sin vínculos');
      await page.goto(RUTA('#/mis-clases'));
      await h1(page);
      await auditar(page, 'alumna sin vínculo', '#/mis-clases', 'sin vínculos');
    });
  });

  test('CA-37 #/p/<slug> con aviso pendiente', async ({ browser }) => {
    await vinculos(alumnaId, [{ slug: SLUG_A, estado: 'pendiente' }]);
    await con(browser, 'alumna', async (page) => {
      await page.goto(RUTA(`#/p/${SLUG_A}`));
      await expect(page.getByText('Acceso pendiente').first()).toBeVisible({ timeout: 20_000 });
      await auditar(page, 'alumna pendiente', '#/p/<slug>', 'con aviso pendiente');
      await page.goto(RUTA('#/ficha'));
      await expect(page.getByRole('heading', { level: 2, name: 'Tus profesores' })).toBeVisible({ timeout: 20_000 });
      await auditar(page, 'alumna pendiente', '#/ficha', 'con un vínculo pendiente');
    });
  });

  test('CA-37 #/p/<slug> con aviso rechazado', async ({ browser }) => {
    await vinculos(alumnaId, [{ slug: SLUG_A, estado: 'rechazado', motivo: 'No hay lugar este semestre' }]);
    await con(browser, 'alumna', async (page) => {
      await page.goto(RUTA(`#/p/${SLUG_A}`));
      await expect(page.getByText('No hay lugar este semestre').first()).toBeVisible({ timeout: 20_000 });
      await auditar(page, 'alumna rechazada', '#/p/<slug>', 'con aviso rechazado');
      await page.goto(RUTA('#/ficha'));
      await expect(page.getByRole('heading', { level: 2, name: 'Tus profesores' })).toBeVisible({ timeout: 20_000 });
      await auditar(page, 'alumna rechazada', '#/ficha', 'con un vínculo rechazado');
    });
  });

  test('CA-37 WEB-01 alumna aprobada con un profesor: agenda, diálogo de solicitud, mis clases y ficha', async ({ browser }) => {
    await vinculos(alumnaId, [{ slug: SLUG_A, estado: 'aprobado' }]);
    await con(browser, 'alumna', async (page) => {
      await page.goto(RUTA(`#/p/${SLUG_A}`));
      await h1(page, `Agenda de ${NOMBRE_A}`);
      await expect(page.getByRole('navigation', { name: 'Tus profesores' })).toHaveCount(0);
      await expect(page.getByRole('list', { name: 'Huecos del día' })).toBeVisible({ timeout: 20_000 });
      await auditar(page, 'alumna aprobada (un profesor)', '#/p/<slug>', 'ok, sin selector');
      await page.getByRole('list', { name: 'Huecos del día' }).getByRole('button', { name: /Libre/ }).first().click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 20_000 });
      // Boton.module.css anima background-color (--mov): axe medía el color a mitad de la transición del botón
      // «Pedir clase» (falso positivo de color-contrast, 2 de 3 corridas). Se espera al color final del token --c-primario.
      const pedir = page.getByRole('dialog').getByRole('button', { name: 'Pedir clase', exact: true });
      await expect(pedir).toBeEnabled();
      await expect.poll(() => pedir.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(29, 78, 216)');
      await auditar(page, 'alumna aprobada (un profesor)', '#/p/<slug>', 'diálogo de solicitud suelta abierto');
      await page.keyboard.press('Escape');
    });
  });

  test('CA-37 #/mis-clases ok y vacío, #/ficha y #/solicitud de la alumna aprobada', async ({ browser }) => {
    await vinculos(alumnaId, [{ slug: SLUG_A, estado: 'aprobado' }]);
    await con(browser, 'alumna', async (page) => {
      await page.goto(RUTA('#/mis-clases'));
      await h1(page);
      await expect(page.getByRole('status').first().or(page.getByRole('heading', { level: 2 }).first())).toBeVisible({ timeout: 20_000 });
      await auditar(page, 'alumna aprobada (un profesor)', '#/mis-clases', 'vacío');
      const inicio = new Date(Date.now() + 5 * 24 * 3600 * 1000);
      inicio.setUTCHours(13, 0, 0, 0);
      await crearClase(alumnaId, inicio.toISOString());
      await page.goto(RUTA('#/mis-clases'));
      await h1(page);
      await page.waitForTimeout(1_500);
      await auditar(page, 'alumna aprobada (un profesor)', '#/mis-clases', 'con una clase');
      await page.goto(RUTA('#/ficha'));
      await expect(page.getByRole('heading', { level: 2, name: 'Tus profesores' })).toBeVisible({ timeout: 20_000 });
      await auditar(page, 'alumna aprobada (un profesor)', '#/ficha', 'con un profesor aprobado');
      await page.goto(RUTA('#/solicitud'));
      await h1(page);
      await auditar(page, 'alumna aprobada (un profesor)', '#/solicitud', 'ruta');
    });
  });

  test('CA-37 WEB-11 alumna con dos profesores: selector en #/p/<slug>, #/mis-clases y #/ficha', async ({ browser }) => {
    await vinculos(alumnaId, [
      { slug: SLUG_A, estado: 'aprobado' },
      { slug: SLUG_B, estado: 'pendiente' },
    ]);
    await con(browser, 'alumna', async (page) => {
      await page.goto(RUTA(`#/p/${SLUG_A}`));
      await expect(page.getByRole('navigation', { name: 'Tus profesores' })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole('list', { name: 'Huecos del día' })).toBeVisible({ timeout: 20_000 });
      await auditar(page, 'alumna con dos profesores', '#/p/<slug>', 'selector WEB-11, profesor aprobado');
      await page.goto(RUTA(`#/p/${SLUG_B}`));
      await expect(page.getByRole('heading', { level: 1, name: `Agenda de ${NOMBRE_B}` })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText('Acceso pendiente').first()).toBeVisible({ timeout: 20_000 });
      await auditar(page, 'alumna con dos profesores', '#/p/<slug>', 'selector WEB-11, profesor pendiente');
      await page.goto(RUTA('#/mis-clases'));
      await h1(page);
      await auditar(page, 'alumna con dos profesores', '#/mis-clases', 'con selector');
      await page.goto(RUTA('#/ficha'));
      await expect(page.getByRole('heading', { level: 3, name: NOMBRE_B })).toBeVisible({ timeout: 20_000 });
      await auditar(page, 'alumna con dos profesores', '#/ficha', 'con varios profesores y estados');
    });
  });

  test('CA-37 WEB-11 selector con un profesor inactivo («No toma reservas») a 360 px', async ({ browser }) => {
    await vinculos(alumnaId, [
      { slug: SLUG_A, estado: 'aprobado' },
      { slug: SLUG_B, estado: 'aprobado' },
    ]);
    await profesorActivo(SLUG_B, false);
    await con(
      browser,
      'alumna',
      async (page) => {
        await page.goto(RUTA(`#/p/${SLUG_B}`));
        await expect(page.getByText(`${NOMBRE_B} no toma reservas por ahora`)).toBeVisible({ timeout: 20_000 });
        await expect(page.getByRole('navigation', { name: 'Tus profesores' }).getByText(/No toma reservas/)).toBeVisible();
        await auditar(page, 'alumna con dos profesores (360 px)', '#/p/<slug>', 'profesor inactivo con selector');
        await page.goto(RUTA(`#/p/${SLUG_A}`));
        await expect(page.getByRole('list', { name: 'Huecos del día' })).toBeVisible({ timeout: 20_000 });
        await auditar(page, 'alumna con dos profesores (360 px)', '#/p/<slug>', 'agenda con selector a 360 px');
      },
      { viewport: { width: 360, height: 740 } },
    );
  });
});

// ---------------------------------------------------------------------------------------------------------------
// T-NFR-08: libre, ocupado y bloqueado se distinguen sin color
// ---------------------------------------------------------------------------------------------------------------
test.describe('estados sin color', () => {
  const HUECOS = [
    { inicio: '2026-11-02T11:00:00Z', fin: '2026-11-02T12:00:00Z', estado: 'libre' },
    { inicio: '2026-11-02T12:00:00Z', fin: '2026-11-02T13:00:00Z', estado: 'ocupado' },
    { inicio: '2026-11-02T13:00:00Z', fin: '2026-11-02T14:00:00Z', estado: 'bloqueado' },
  ];
  const ESTADOS = ['Libre', 'Ocupado', 'Bloqueado'];

  async function abrir(page: Page) {
    await page.route('**/rest/v1/rpc/agenda_publica', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(HUECOS) }));
    await page.goto(RUTA(`#/p/${SLUG_A}`));
    await expect(page.getByRole('list', { name: 'Huecos del día' }).getByRole('listitem')).toHaveCount(3, { timeout: 20_000 });
  }

  test('T-NFR-08 CA-37 NFR-05 A11Y-05 cada hueco dice su estado en texto y nombre accesible', async ({ browser }) => {
    await con(browser, null, async (page) => {
      await abrir(page);
      const items = page.getByRole('list', { name: 'Huecos del día' }).getByRole('listitem');
      for (let i = 0; i < 3; i++) {
        await expect(items.nth(i)).toContainText(ESTADOS[i]);
        // el nombre accesible del elemento (o de su control) incluye el estado
        const nombre = await items.nth(i).evaluate((el) => {
          const control = el.querySelector('button, a, [role]') ?? el;
          return (control.getAttribute('aria-label') ?? control.textContent ?? '') + ' ' + (el.getAttribute('aria-label') ?? '');
        });
        expect(nombre, `nombre accesible del hueco ${i + 1}`).toContain(ESTADOS[i]);
      }
      await auditar(page, 'visitante', '#/p/<slug>', 'huecos libre, ocupado y bloqueado');
    });
  });

  test('T-NFR-08 CA-37 con forced-colors y escala de grises los tres estados se siguen leyendo distintos', async ({ browser }) => {
    await con(browser, null, async (page) => {
      await abrir(page);
      await page.emulateMedia({ forcedColors: 'active' });
      const items = page.getByRole('list', { name: 'Huecos del día' }).getByRole('listitem');
      const textos = await items.allInnerTexts();
      expect(textos[0]).toContain('Libre');
      expect(textos[1]).toContain('Ocupado');
      expect(textos[2]).toContain('Bloqueado');
      expect(new Set(textos.map((t) => t.replace(/\s+/g, ' ').trim())).size).toBe(3);
      await page.emulateMedia({ forcedColors: 'none' });
      await page.evaluate(() => document.documentElement.style.setProperty('filter', 'grayscale(1)', 'important')); // CSSOM: la CSP prohíbe <style> en línea
      // Sin color, el patrón de borde (punteado u otro estilo) o el ícono distingue el estado además del texto.
      const borde = await items.evaluateAll((els) => els.map((el) => getComputedStyle(el.querySelector('button, a') ?? el).borderStyle + '|' + getComputedStyle(el).borderStyle));
      expect(new Set(borde).size, `estilos de borde por estado: ${borde.join(' / ')}`).toBeGreaterThan(1);
      await auditar(page, 'visitante', '#/p/<slug>', 'huecos en escala de grises');
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Profesor
// ---------------------------------------------------------------------------------------------------------------
test.describe('profesor', () => {
  test('CA-37 WEB-05 #/panel ok y con acciones abiertas', async ({ browser }) => {
    await con(browser, 'profesor', async (page) => {
      await page.goto(RUTA('#/panel'));
      await h1(page, 'Panel');
      await expect(page.getByRole('list', { name: 'Huecos del día' })).toBeVisible({ timeout: 20_000 });
      await auditar(page, 'profesor', '#/panel', 'ok');
      const acciones = page.getByRole('button', { name: /^(Crear clase|Bloquear|Agregar clase|Bloquear horario)/ });
      const n = await acciones.count();
      expect(n, 'el panel ofrece acciones (crear clase, bloquear)').toBeGreaterThan(0);
      await acciones.first().click();
      await auditar(page, 'profesor', '#/panel', 'con una acción abierta');
    });
  });

  test('CA-37 WEB-07 #/lista con el profesor activo y diálogo «Agregar alumno»', async ({ browser }) => {
    await con(browser, 'profesor', async (page) => {
      await page.goto(RUTA('#/lista'));
      await h1(page, 'Lista');
      await page.waitForTimeout(1_500);
      await auditar(page, 'profesor', '#/lista', 'con el profesor activo');
      await page.getByRole('button', { name: 'Agregar alumno' }).click();
      await expect(page.getByRole('dialog', { name: 'Agregar alumno' })).toBeVisible();
      await auditar(page, 'profesor', '#/lista', 'diálogo «Agregar alumno» abierto');
    });
  });

  test('CA-37 WEB-07 #/lista con alumnos (pendiente, aprobado, ficha no editable) y con el profesor inactivo', async ({ browser }) => {
    await crearAlumno({ nombre: 'Aprobada Lista', estado: 'aprobado', telefono: '+598 99111222', mail: mailT05('a11y.lista.a') });
    await crearAlumno({ nombre: 'Pendiente Lista', estado: 'pendiente', telefono: '+598 99111333', mail: mailT05('a11y.lista.p') });
    await crearAlumno({ nombre: 'Sin cuenta Lista', estado: 'sin_cuenta', telefono: '+598 99111444' });
    await con(browser, 'profesor', async (page) => {
      await page.goto(RUTA('#/lista'));
      await h1(page, 'Lista');
      await expect(page.getByRole('row', { name: /T05 Aprobada Lista/ })).toBeVisible({ timeout: 20_000 });
      await auditar(page, 'profesor', '#/lista', 'con alumnos aprobado, pendiente y sin cuenta');
      await profesorActivo(SLUG_A, false);
      await page.goto(RUTA('#/lista'));
      await h1(page, 'Lista');
      await expect(page.getByRole('row', { name: /T05 Aprobada Lista/ })).toBeVisible({ timeout: 20_000 });
      await auditar(page, 'profesor', '#/lista', 'con el profesor inactivo (botones deshabilitados con aviso)');
    });
  });

  test('CA-37 WEB-08 #/configuracion con «Tu enlace», copiado y no copiado', async ({ browser }) => {
    await con(browser, 'profesor', async (page) => {
      await page.goto(RUTA('#/configuracion'));
      await h1(page, 'Configuración');
      await expect(page.getByRole('button', { name: /Copiar enlace/ })).toBeVisible({ timeout: 20_000 });
      await auditar(page, 'profesor', '#/configuracion', 'con «Tu enlace», no copiado');
      // Sin permiso de portapapeles el intento falla y el aviso lo dice.
      await page.getByRole('button', { name: /Copiar enlace/ }).click();
      await expect(page.getByRole('status').filter({ hasText: /\S/ }).first()).toBeVisible({ timeout: 10_000 });
      await auditar(page, 'profesor', '#/configuracion', 'tras copiar (resultado anunciado)');
    });
    const ctx = await browser.newContext({ locale: 'es-UY', storageState: SES('profesor'), permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    try {
      await page.goto(RUTA('#/configuracion'));
      await h1(page, 'Configuración');
      await page.getByRole('button', { name: /Copiar enlace/ }).click();
      await expect(page.getByRole('status').filter({ hasText: /copi/i }).first()).toBeVisible({ timeout: 10_000 });
      await auditar(page, 'profesor', '#/configuracion', 'enlace copiado (con portapapeles)');
    } finally {
      await ctx.close();
    }
  });

  test('CA-37 WEB-10 profesor (no Administrador) en #/admin: sin permisos', async ({ browser }) => {
    await con(browser, 'profesor', async (page) => {
      await page.goto(RUTA('#/admin'));
      await h1(page);
      await auditar(page, 'profesor', '#/admin', 'sin permisos');
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Administrador: #/admin (WEB-10; T-ADM-20)
// ---------------------------------------------------------------------------------------------------------------
test.describe('administrador', () => {
  test('CA-37 WEB-10 #/admin lista y cargando', async ({ browser }) => {
    await con(browser, 'admin', async (page) => {
      await page.goto(RUTA('#/admin'));
      await h1(page, 'Administración');
      await expect(page.getByRole('heading', { level: 3 }).first()).toBeVisible({ timeout: 20_000 });
      await auditar(page, 'administrador', '#/admin', 'lista');
    });
    await con(browser, 'admin', async (page) => {
      await page.route('**/rest/v1/rpc/listar_profesores', async (r) => {
        await new Promise((x) => setTimeout(x, 3_000));
        await r.continue();
      });
      await page.goto(RUTA('#/admin'));
      await h1(page, 'Administración');
      await auditar(page, 'administrador', '#/admin', 'cargando');
    });
  });

  test('CA-37 WEB-10 #/admin vacío y error', async ({ browser }) => {
    await con(browser, 'admin', async (page) => {
      await page.route('**/rest/v1/rpc/listar_profesores', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
      await page.goto(RUTA('#/admin'));
      await h1(page, 'Administración');
      await expect(page.getByRole('heading', { level: 2, name: 'Dar de alta a un profesor' })).toBeVisible({ timeout: 20_000 });
      await auditar(page, 'administrador', '#/admin', 'vacío');
    });
    await con(browser, 'admin', async (page) => {
      await page.route('**/rest/v1/rpc/listar_profesores', (r) => r.abort());
      await page.goto(RUTA('#/admin'));
      await h1(page, 'Administración');
      await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 20_000 });
      await auditar(page, 'administrador', '#/admin', 'error');
    });
  });

  test('CA-37 WEB-10 #/admin diálogo de confirmación abierto (inactivar)', async ({ browser }) => {
    await con(browser, 'admin', async (page) => {
      await page.goto(RUTA('#/admin'));
      await h1(page, 'Administración');
      await page.getByRole('button', { name: /^Inactivar a / }).first().click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await auditar(page, 'administrador', '#/admin', 'diálogo de confirmación abierto');
      await page.keyboard.press('Escape');
    });
  });

  test('CA-37 WEB-10 #/admin alta con errores de formulario', async ({ browser }) => {
    await con(browser, 'admin', async (page) => {
      await page.goto(RUTA('#/admin'));
      await h1(page, 'Administración');
      await page.getByLabel('Mail del profesor').fill('no-es-un-mail');
      await page.getByLabel('Enlace del profesor').fill(SLUG_A);
      await page.getByRole('button', { name: 'Dar de alta' }).click();
      await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible({ timeout: 20_000 });
      await auditar(page, 'administrador', '#/admin', 'alta con errores');
    });
  });

  test('CA-37 WEB-10 #/admin alta con éxito', async ({ browser }) => {
    const u = `${Date.now().toString(36)}`;
    const mail = `e2e.adm.a11y.${u}@example.test`;
    try {
      await con(browser, 'admin', async (page) => {
        await page.goto(RUTA('#/admin'));
        await h1(page, 'Administración');
        await page.getByLabel('Mail del profesor').fill(mail);
        await page.getByLabel('Nombre del profesor').fill(`Profe A11y ${u}`);
        await page.getByLabel('Enlace del profesor').fill(`e2e-adm-a11y-${u}`);
        await page.getByRole('button', { name: 'Dar de alta' }).click();
        await expect(page.getByRole('status').filter({ hasText: /Profesor dado de alta|adopt/i }).first()).toBeVisible({ timeout: 20_000 });
        await auditar(page, 'administrador', '#/admin', 'alta con éxito');
      });
    } finally {
      const ids = `select id from public.profesor where mail = '${mail}'`;
      await sql(`delete from public.mail_salida where profesor_id in (${ids}) or destinatario = '${mail}'`);
      await sql(`delete from public.grilla_tramo where profesor_id in (${ids})`);
      await sql(`delete from public.profesor where mail = '${mail}'`);
      await sql('delete from auth.users where email = $1', [mail]);
    }
  });

  test('CA-37 CA-38 WEB-10 T-ADM-20 #/admin a 360 px', async ({ browser }) => {
    await con(
      browser,
      'admin',
      async (page) => {
        await page.goto(RUTA('#/admin'));
        await h1(page, 'Administración');
        await expect(page.getByRole('heading', { level: 3 }).first()).toBeVisible({ timeout: 20_000 });
        await auditar(page, 'administrador (360 px)', '#/admin', 'lista');
      },
      { viewport: { width: 360, height: 740 } },
    );
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Diálogo de solicitud: serie con fechas salteadas y error (CA-37, matriz §1 `#/solicitud`); lista con ficha no editable
// ---------------------------------------------------------------------------------------------------------------
/** Primer miércoles a 7 días o más (huso fijo de Montevideo, UTC-3) y el miércoles siguiente. */
function miercoles() {
  const d = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  while (new Date(d.getTime() - 3 * 3600 * 1000).getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  const f = (x: Date) => new Date(x.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const sig = new Date(d.getTime() + 7 * 24 * 3600 * 1000);
  return { dia: f(d), siguiente: f(sig) };
}

/** Red de seguridad: el botón ya no anima el fondo (Boton.module.css), pero se espera igual al color final del botón primario para que axe no mida un estado intermedio. */
async function botonPedirEstable(page: Page) {
  const pedir = page.getByRole('dialog').getByRole('button', { name: 'Pedir clase', exact: true });
  await expect(pedir).toBeEnabled({ timeout: 30_000 });
  await expect.poll(() => pedir.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(29, 78, 216)');
}

test.describe('solicitud y lista (estados restantes)', () => {
  test.setTimeout(120_000);
  test.afterEach(async () => {
    await sql(`delete from public.bloqueo where motivo like 'T12 %'`);
  });

  test('CA-37 WEB-04 diálogo de solicitud: serie semanal con fechas salteadas', async ({ browser }) => {
    await vinculos(alumnaId, [{ slug: SLUG_A, estado: 'aprobado' }]);
    const { dia, siguiente } = miercoles();
    await sql(
      `insert into public.bloqueo (profesor_id, periodo, motivo)
       values ((select id from public.profesor where slug = $1), tstzrange($2::timestamptz, $3::timestamptz, '[)'), 'T12 Bloqueo a11y')`,
      [SLUG_A, `${siguiente}T08:00:00-03:00`, `${siguiente}T13:00:00-03:00`],
    );
    await con(browser, 'alumna', async (page) => {
      await page.goto(RUTA(`#/p/${SLUG_A}?d=${dia}`));
      await page.getByRole('button', { name: /10:00 a 11:00/ }).click({ timeout: 30_000 });
      const dialogo = page.getByRole('dialog', { name: `Pedir clase a ${NOMBRE_A}` });
      await expect(dialogo).toBeVisible();
      await dialogo.getByRole('radio', { name: /Serie semanal/ }).check();
      await expect(dialogo.getByRole('list', { name: /saltean|salteada/i })).toBeVisible({ timeout: 30_000 });
      await botonPedirEstable(page);
      await auditar(page, 'alumna aprobada (un profesor)', '#/p/<slug>', 'diálogo de solicitud: serie con fechas salteadas');
    });
  });

  test('CA-37 WEB-04 diálogo de solicitud: error porque el hueco ya no está libre', async ({ browser }) => {
    await vinculos(alumnaId, [{ slug: SLUG_A, estado: 'aprobado' }]);
    const { dia } = miercoles();
    const otra = await crearAlumno({ nombre: 'Ocupa el hueco', estado: 'aprobado', telefono: '+598 99555999', mail: mailT05('a11y.ocupa') });
    await con(browser, 'alumna', async (page) => {
      await page.goto(RUTA(`#/p/${SLUG_A}?d=${dia}`));
      await page.getByRole('button', { name: /10:00 a 11:00/ }).click({ timeout: 30_000 });
      const dialogo = page.getByRole('dialog', { name: `Pedir clase a ${NOMBRE_A}` });
      await expect(dialogo).toBeVisible();
      await botonPedirEstable(page);
      // Otra persona toma el hueco mientras el formulario está abierto.
      await crearClase(otra, `${dia}T10:00:00-03:00`);
      await dialogo.getByRole('button', { name: 'Pedir clase', exact: true }).click();
      await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(800); // red de seguridad: el fondo ya no se anima, pero se deja asentar el render antes de medir contraste
      await auditar(page, 'alumna aprobada (un profesor)', '#/p/<slug>', 'diálogo de solicitud: error (hueco ya ocupado)');
    });
  });

  test('CA-37 WEB-07 #/lista con una ficha no editable (persona con dos profesores)', async ({ browser }) => {
    await vinculos(alumnaId, [
      { slug: SLUG_A, estado: 'aprobado' },
      { slug: SLUG_B, estado: 'aprobado' },
    ]);
    await con(browser, 'profesor', async (page) => {
      await page.goto(RUTA('#/lista'));
      await h1(page, 'Lista');
      await expect(page.getByText('Ficha no editable').first()).toBeVisible({ timeout: 20_000 });
      await auditar(page, 'profesor', '#/lista', 'con una ficha no editable');
    });
  });
});
