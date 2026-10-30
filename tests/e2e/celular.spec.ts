// E2E de uso en celular y por teclado (B12, T12.1b; NFR-06, CA-38, WEB-01 a WEB-11, A11Y-08, A11Y-10, A11Y-15, A11Y-18).
// Casos: T-NFR-11 (360x740: sin desplazamiento horizontal y todo control interactivo visible >= 44x44 px), T-WEB-04
// (recorrido por teclado de cada ruta: Tab llega a todos los controles, foco visible, Enter/Escape en diálogos),
// T-WEB-12 y T-ADM-20 (WEB-09, WEB-11 y WEB-10 a 360 px).
//
// Es un DIAGNÓSTICO: no corrige nada. Lo que la interfaz incumple hoy hace fallar la prueba con la lista de controles
// (selector, texto y medida) y la ruta y el rol; ux-web lo corrige en T12.2. Nada se salta ni se marca fixme.
//
// Roles (una sola entrada por rol con el código de Mailpit; la sesión se reutiliza): visitante; persona con sesión sin
// vínculo (ficha incompleta); persona pendiente en A; alumno con un profesor (A); alumno con dos profesores (A y B,
// selector WEB-11); profesor A; Administrador. Corre contra dist/ servido por vite preview.
//
// Excepción WCAG 2.5.5 (objetivo): un enlace en línea dentro de una oración (display inline y texto propio del bloque
// alrededor) no cuenta como fallo de tamaño; se anota como excepción en la prueba (`tamaño: excepción en línea`).
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Browser, Locator, Page } from '@playwright/test';
import { expect, test } from '../soporte/evidencia';
import { cerrar, sql } from '../soporte/bd';
import { SITEKEY_PRUEBA } from '../soporte/captcha';
import { esperarMail, contarMails } from '../soporte/correo';
import { entorno, RAIZ } from '../soporte/entorno';
import { MAIL_ADMIN, MAIL_PROFESOR, SLUG_A, SLUG_B } from '../soporte/usuarios';
import { crearClase } from '../integracion/cuentas/ayuda';
import { crearAlumnoCel, limpiarCel, mailCel } from './celular-datos';

const BASE = process.env.RTC_BASE ?? '/reservas/';
const ORIGEN = process.env.BASE_URL ?? `http://127.0.0.1:${process.env.RTC_PREVIEW_PORT || '4173'}`;
const NOMBRE_B = 'Profesora B de Prueba';
const MIN = 44;

type Rol = 'visitante' | 'sinVinculo' | 'pendiente' | 'rechazado' | 'alumno' | 'dosProfesores' | 'profesor' | 'administrador';
const VACIA = { cookies: [], origins: [] };
const sesionDe = (rol: Rol) => resolve(RAIZ, 'node_modules', '.cache', 'celular', `sesion-${rol}.json`);
// Playwright reinicia el worker tras cada prueba que falla (y vuelve a correr beforeAll): el estado de la corrida (¿ya
// preparada?, casos que fallaron) se guarda en un archivo ligado al proceso que lanzó la corrida (ppid).
const ARCHIVO_ESTADO = resolve(RAIZ, 'node_modules', '.cache', 'celular', 'estado.json');
interface EstadoCorrida {
  ppid: number;
  fallos: string[];
}
function leerEstado(): EstadoCorrida | null {
  if (!existsSync(ARCHIVO_ESTADO)) return null;
  try {
    return JSON.parse(readFileSync(ARCHIVO_ESTADO, 'utf8')) as EstadoCorrida;
  } catch {
    return null;
  }
}
const guardarEstado = (e: EstadoCorrida) => writeFileSync(ARCHIVO_ESTADO, JSON.stringify(e));
const estadoDe = (rol: Rol) => (rol === 'visitante' ? VACIA : sesionDe(rol));

// ---------------------------------------------------------------------------------------------------------------------
// Entrada y datos
// ---------------------------------------------------------------------------------------------------------------------
async function entrar(page: Page, mail: string, hash = '#/ingreso') {
  const antes = await contarMails(mail);
  await page.goto(`${ORIGEN}${BASE}${hash}`);
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

async function guardarSesion(browser: Browser, mail: string, rol: Rol) {
  const ctx = await browser.newContext({ locale: 'es-UY', storageState: VACIA });
  const page = await ctx.newPage();
  await entrar(page, mail);
  await expect(page).not.toHaveURL(/#\/ingreso/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
  await ctx.storageState({ path: sesionDe(rol) });
  await ctx.close();
}

async function profesorActivo(slug: string, activo: boolean) {
  await sql('update public.profesor set activo = $2 where slug = $1', [slug, activo]);
}

const MAIL = {
  sinVinculo: mailCel('sinvinculo'),
  pendiente: mailCel('pendiente'),
  rechazado: mailCel('rechazado'),
  alumno: mailCel('alumno'),
  dos: mailCel('dos'),
};

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
  await profesorActivo(SLUG_A, true);
  await profesorActivo(SLUG_B, true);
  mkdirSync(resolve(RAIZ, 'node_modules', '.cache', 'celular'), { recursive: true });
  if (leerEstado()?.ppid === process.ppid) return; // otro worker de esta misma corrida ya preparó todo
  guardarEstado({ ppid: process.ppid, fallos: [] });
  // RTC_REUSAR=1: reutiliza los datos y las sesiones de una corrida anterior (las entradas con código tardan; solo para iterar).
  if (process.env.RTC_REUSAR) return;
  await limpiarCel();

  // Datos sintéticos: una cuenta pendiente y un alumno aprobado en A (lista del profesor), el alumno con una clase
  // futura, y la persona con dos profesores.
  await crearAlumnoCel({ nombre: 'Cel pendiente', estado: 'pendiente', telefono: '+598 99000001', mail: MAIL.pendiente });
  await crearAlumnoCel({ nombre: 'Cel rechazado', estado: 'rechazado', telefono: '+598 99000004', mail: MAIL.rechazado });
  const idAlumno = await crearAlumnoCel({ nombre: 'Cel alumno', estado: 'aprobado', telefono: '+598 99000002', mail: MAIL.alumno });
  const dia = new Date(Date.now() + (7 + Math.floor(Math.random() * 20)) * 86_400_000).toISOString().slice(0, 10);
  await crearClase(idAlumno, `${dia}T13:00:00Z`);
  const idDos = await crearAlumnoCel({ nombre: 'Cel dos profesores', estado: 'aprobado', telefono: '+598 99000003', mail: MAIL.dos });
  await sql(
    `insert into public.inscripcion (alumno_id, profesor_id, estado, como_llego)
     values ($1, (select id from public.profesor where slug = $2), 'aprobado', 'Prueba de celular')`,
    [idDos, SLUG_B],
  );

  await guardarSesion(browser, MAIL.sinVinculo, 'sinVinculo');
  await guardarSesion(browser, MAIL.pendiente, 'pendiente');
  await guardarSesion(browser, MAIL.rechazado, 'rechazado');
  await guardarSesion(browser, MAIL.alumno, 'alumno');
  await guardarSesion(browser, MAIL.dos, 'dosProfesores');
  await guardarSesion(browser, MAIL_PROFESOR, 'profesor');
  await guardarSesion(browser, MAIL_ADMIN, 'administrador');
});

test.afterEach(async () => {
  await profesorActivo(SLUG_A, true);
  await profesorActivo(SLUG_B, true);
});
// La limpieza va en la última prueba del archivo (afterAll corre también al reiniciarse el worker tras un fallo).
test.afterAll(cerrar);

// ---------------------------------------------------------------------------------------------------------------------
// Medición en la página
// ---------------------------------------------------------------------------------------------------------------------
interface Chico {
  selector: string;
  texto: string;
  ancho: number;
  alto: number;
  excepcion?: string;
  contexto?: string;
}
interface Medida {
  scrollWidth: number;
  clientWidth: number;
  desbordan: string[];
  total: number;
  chicos: Chico[];
}

const INTERACTIVOS =
  'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=link], [role=radio], [role=checkbox], [role=switch], [role=combobox], [tabindex]:not([tabindex="-1"])';

/** Mide el desplazamiento horizontal y la caja de cada control interactivo visible y habilitado. */
async function medir(page: Page): Promise<Medida> {
  return page.evaluate(
    ({ sel, min }) => {
      const describir = (el: Element): string => {
        const e = el as HTMLElement;
        const rol = e.getAttribute('role');
        const tipo = e instanceof HTMLInputElement ? `[type=${e.type}]` : '';
        const clase = (typeof e.className === 'string' ? e.className : '').split(/\s+/).filter(Boolean)[0] ?? '';
        const dentro = e.closest('[role=dialog], dialog') ? ' (en diálogo)' : '';
        return `${e.tagName.toLowerCase()}${tipo}${rol ? `[role=${rol}]` : ''}${clase ? `.${clase}` : ''}${dentro}`;
      };
      const textoDe = (el: Element): string => {
        const e = el as HTMLElement;
        const t = e.getAttribute('aria-label') || e.innerText || (e as HTMLInputElement).value || e.getAttribute('placeholder') || '';
        return t.replace(/\s+/g, ' ').trim().slice(0, 50);
      };
      const visible = (el: HTMLElement, r: DOMRect): boolean => {
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
        if (r.width === 0 && r.height === 0) return false;
        if (r.right <= 0 || r.bottom <= 0) return false; // fuera de pantalla a la izquierda o arriba (enlace «Ir al contenido»)
        return true;
      };
      const cw = document.documentElement.clientWidth;
      const chicos: Chico[] = [];
      let total = 0;
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
        if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') continue;
        if (el.closest('[inert]')) continue;
        let r = el.getBoundingClientRect();
        let medido: HTMLElement = el;
        // Solo para lectores de pantalla: un ancestro recortado a 1 px (clip / clip-path), p. ej. el botón oculto del diálogo.
        let soloLectores = false;
        for (let a: HTMLElement | null = el.parentElement; a && a !== document.body; a = a.parentElement) {
          const cs = getComputedStyle(a);
          if ((cs.clipPath && cs.clipPath !== 'none' && a.getBoundingClientRect().width <= 1) || (cs.overflow === 'hidden' && a.getBoundingClientRect().width <= 1 && a.getBoundingClientRect().height <= 1)) {
            soloLectores = true;
            break;
          }
        }
        if (soloLectores) continue;
        // Radio o casilla oculta visualmente: el objetivo es su etiqueta (WCAG 2.5.5).
        if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) {
          const etiqueta = el.closest('label') ?? (el.id ? document.querySelector<HTMLElement>(`label[for="${CSS.escape(el.id)}"]`) : null);
          if (!etiqueta && (r.width <= 1 || r.height <= 1)) continue;
          if (etiqueta) {
            const re = etiqueta.getBoundingClientRect();
            if (re.width * re.height >= r.width * r.height) {
              medido = etiqueta;
              r = re;
            }
          }
        } else if ((r.width <= 1 || r.height <= 1) && getComputedStyle(el).position === 'absolute') {
          continue; // solo para lectores de pantalla
        }
        if (!visible(medido, r)) continue;
        total++;
        if (r.width + 0.5 >= min && r.height + 0.5 >= min) continue;
        const item: Chico = { selector: describir(el), texto: textoDe(el), ancho: Math.round(r.width * 10) / 10, alto: Math.round(r.height * 10) / 10 };
        if (!(typeof el.className === 'string' && el.className)) item.contexto = (el.parentElement?.outerHTML ?? '').replace(/\s+/g, ' ').slice(0, 200);
        if (el instanceof HTMLAnchorElement && getComputedStyle(el).display === 'inline') {
          const padre = el.parentElement;
          const resto = padre ? (padre.innerText || '').replace(el.innerText, '').replace(/\s+/g, ' ').trim() : '';
          if (resto.length >= 3 && !(padre && padre.matches('nav, li') && padre.children.length === 1 && resto.length < 3)) {
            item.excepcion = 'enlace en línea dentro de una oración (WCAG 2.5.5)';
          }
        }
        chicos.push(item);
      }
      const desbordan: string[] = [];
      for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > cw + 1 && getComputedStyle(el).position !== 'fixed' && desbordan.length < 6) {
          desbordan.push(`${describir(el)} «${textoDe(el)}» right=${Math.round(r.right)}`);
        }
      }
      return { scrollWidth: document.documentElement.scrollWidth, clientWidth: cw, desbordan, total, chicos };
    },
    { sel: INTERACTIVOS, min: MIN },
  );
}

/** Texto del fallo (vacío si cumple). */
function informe(m: Medida): string[] {
  const falla: string[] = [];
  if (m.scrollWidth > m.clientWidth) {
    falla.push(`DESPLAZAMIENTO HORIZONTAL scrollWidth=${m.scrollWidth} > clientWidth=${m.clientWidth}; desbordan: ${m.desbordan.join(' | ') || '(ninguno por caja)'}`);
  }
  for (const c of m.chicos.filter((x) => !x.excepcion)) {
    falla.push(`CONTROL < ${MIN}px ${c.selector} «${c.texto}» mide ${c.ancho}x${c.alto}${c.contexto ? ` contexto: ${c.contexto}` : ''}`);
  }
  return falla;
}

// ---------------------------------------------------------------------------------------------------------------------
// Teclado (T-WEB-04)
// ---------------------------------------------------------------------------------------------------------------------
interface Foco {
  descripcion: string;
  visible: boolean;
  estilo: string;
  enDialogo: boolean;
  repetido: boolean;
  /** Primer tab stop del elemento: un input de fecha tiene varios y el navegador resalta cada segmento. */
  primera: boolean;
}

async function marcarFoco(page: Page): Promise<Foco | null> {
  return page.evaluate((idx) => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body || el === document.documentElement) return null;
    const w = window as unknown as { __ultimoFoco?: Element };
    const primera = !el.hasAttribute('data-tab-visto');
    const repetido = el.hasAttribute('data-tab-visto') && w.__ultimoFoco !== el; // un input de fecha tiene varios tab stops
    w.__ultimoFoco = el;
    el.setAttribute('data-tab-visto', String(idx));
    const cs = getComputedStyle(el);
    const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
    const sombra = cs.boxShadow !== 'none';
    const rol = el.getAttribute('role');
    const t = (el.getAttribute('aria-label') || el.innerText || (el as HTMLInputElement).value || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    return {
      descripcion: `${el.tagName.toLowerCase()}${el instanceof HTMLInputElement ? `[type=${el.type}${el.name ? ` name=${el.name}` : ''}${el.id ? ` id=${el.id.replace(/^_r_\w+_-/, '')}` : ''}]` : ''}${rol ? `[role=${rol}]` : ''} «${t}»`,
      visible: outline || sombra,
      estilo: `outline=${cs.outlineStyle} ${cs.outlineWidth}; box-shadow=${sombra ? 'sí' : 'no'}`,
      enDialogo: !!el.closest('[role=dialog], dialog'),
      repetido,
      primera,
    };
  }, Date.now() % 1e6);
}

/** Controles que deberían recibir foco con Tab y no lo recibieron. */
async function sinAlcanzar(page: Page): Promise<string[]> {
  return page.evaluate((sel) => {
    const grupos = new Set<string>();
    document.querySelectorAll<HTMLInputElement>('input[type=radio]').forEach((r) => {
      if (r.hasAttribute('data-tab-visto')) grupos.add(r.name || r.id);
    });
    const falta: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') continue;
      if (el.getAttribute('tabindex') === '-1' || el.closest('[inert], [aria-hidden=true]')) continue;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (r.width === 0 && r.height === 0) continue;
      if (el instanceof HTMLInputElement && el.type === 'radio' && grupos.has(el.name || el.id)) continue;
      if (el.getAttribute('role') === 'tab' && el.getAttribute('aria-selected') !== 'true') continue; // tabindex móvil: flechas
      if (el.hasAttribute('data-tab-visto')) continue;
      const t = (el.getAttribute('aria-label') || el.innerText || (el as HTMLInputElement).value || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      falta.push(`${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : ''} «${t}»`);
    }
    return falta;
  }, INTERACTIVOS);
}

/** Recorre la página con Tab: foco visible en cada parada y todos los controles alcanzados. */
async function recorrerTeclado(page: Page, tope = 150): Promise<string[]> {
  const falla: string[] = [];
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    document.querySelectorAll('[data-tab-visto]').forEach((e) => e.removeAttribute('data-tab-visto'));
    window.scrollTo(0, 0);
  });
  // La navegación arranca desde donde quedó el foco (el h1 al cambiar de ruta): se da la vuelta completa, pasando por el
  // navegador (activeElement = body) una vez, hasta volver a un control ya visitado.
  let salidas = 0;
  const paradas: string[] = [];
  for (let i = 0; i < tope; i++) {
    await page.keyboard.press('Tab');
    const f = await marcarFoco(page);
    if (!f) {
      if (++salidas >= 2) break;
      continue;
    }
    paradas.push(f.descripcion);
    if (f.repetido) break;
    if (f.primera && !f.visible) falla.push(`FOCO NO VISIBLE ${f.descripcion} (${f.estilo})`);
  }
  const faltan = await sinAlcanzar(page);
  for (const falta of faltan) falla.push(`SIN ALCANZAR CON TAB ${falta}`);
  if (faltan.length > 0) falla.push(`(Tab hizo ${paradas.length} paradas; las últimas: ${paradas.slice(-3).join(' > ')})`);
  return falla;
}

/** Diálogo con teclado: Enter en el disparador lo abre, el foco entra y queda atrapado, Escape lo cierra y el foco vuelve. */
async function dialogoPorTeclado(page: Page, disparador: Locator): Promise<string[]> {
  const falla: string[] = [];
  await disparador.focus();
  await page.keyboard.press('Enter');
  const dialogo = page.getByRole('dialog');
  try {
    await expect(dialogo).toBeVisible({ timeout: 8_000 });
  } catch {
    return ['ENTER NO ABRE EL DIÁLOGO desde el disparador con foco'];
  }
  const dentro = () => page.evaluate(() => !!document.activeElement?.closest('[role=dialog], dialog'));
  if (!(await dentro())) falla.push('FOCO NO ENTRA AL DIÁLOGO al abrirse');
  const n = await dialogo.locator(INTERACTIVOS).count();
  for (let i = 0; i < n + 3; i++) {
    await page.keyboard.press('Tab');
    const f = await marcarFoco(page);
    if (!f || !f.enDialogo) {
      falla.push(`TRAMPA DE FOCO ROTA: Tab #${i + 1} sale del diálogo (${f ? f.descripcion : 'documento'})`);
      break;
    }
    if (f.primera && !f.visible) falla.push(`FOCO NO VISIBLE en el diálogo ${f.descripcion} (${f.estilo})`);
  }
  await page.keyboard.press('Escape');
  try {
    await expect(dialogo).toBeHidden({ timeout: 5_000 });
  } catch {
    falla.push('ESCAPE NO CIERRA EL DIÁLOGO');
    return falla;
  }
  const volvio = await disparador.evaluate((el) => document.activeElement === el);
  if (!volvio) falla.push('EL FOCO NO VUELVE AL DISPARADOR al cerrar con Escape');
  return falla;
}

// ---------------------------------------------------------------------------------------------------------------------
// Matriz de rutas y estados (accesibilidad.md §1)
// ---------------------------------------------------------------------------------------------------------------------
interface Caso {
  rol: Rol;
  id: string;
  ruta: string;
  /** Antes de navegar (interceptar red, desactivar un profesor). */
  antes?: (page: Page) => Promise<void>;
  /** Después de cargar la ruta y antes de medir. */
  esperar?: (page: Page) => Promise<void>;
  /** Botón que abre un diálogo: se mide con el diálogo abierto y se recorre con Enter/Escape. */
  disparador?: (page: Page) => Locator;
  /** Corresponde a la evidencia de otros WEB. */
  web?: string;
}

const libres = (page: Page) => page.getByRole('list', { name: 'Huecos del día' }).getByRole('button').first();
/** Estado «cargando»: las lecturas de datos no responden nunca. */
const colgarRed = async (page: Page) => {
  await page.route('**/rest/v1/**', () => new Promise<void>(() => undefined));
};
const colgarListaProfesores = async (page: Page) => {
  await page.route('**/rest/v1/rpc/listar_profesores', () => new Promise<void>(() => undefined));
};
const esperarUnSegundo = async (page: Page) => {
  await page.waitForTimeout(1_000);
};
const proximoDomingo = () => {
  const d = new Date(Date.now() + 86_400_000);
  while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
/**
 * Próximo día hábil desde mañana: la grilla de AGE-01 es de lunes a viernes y, en ese día, todos sus huecos están por
 * delante. «Hoy» deja de servir pasadas las 18:00 de Uruguay, cuando ya no le quedan huecos libres.
 */
const proximoHabil = () => {
  const d = new Date(Date.now() + 86_400_000);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const encabezado = (page: Page) => expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
const agendaCargada = async (page: Page) => {
  await encabezado(page);
  await expect(page.getByRole('list', { name: 'Huecos del día' })).toBeVisible({ timeout: 30_000 });
};

const CASOS: Caso[] = [
  // Visitante
  { rol: 'visitante', id: 'WEB-09 inicio sin enlace', ruta: '#/', web: 'WEB-09' },
  { rol: 'visitante', id: 'WEB-02 ingreso paso mail', ruta: '#/ingreso' },
  { rol: 'visitante', id: 'WEB-01 agenda de A (visitante)', ruta: `#/p/${SLUG_A}`, esperar: agendaCargada, web: 'WEB-01' },
  {
    rol: 'visitante',
    id: 'WEB-01 agenda de A con diálogo «Ingresá para pedir esta clase»',
    ruta: `#/p/${SLUG_A}`,
    esperar: agendaCargada,
    disparador: libres,
    web: 'WEB-01',
  },
  { rol: 'visitante', id: 'WEB-01 enlace no válido', ruta: '#/p/enlace-que-no-existe', esperar: encabezado, web: 'WEB-01' },
  {
    rol: 'visitante',
    id: 'WEB-01 profesor inactivo',
    ruta: `#/p/${SLUG_B}`,
    antes: () => profesorActivo(SLUG_B, false),
    esperar: async (p) => {
      await expect(p.getByText(`${NOMBRE_B} no toma reservas por ahora`)).toBeVisible({ timeout: 30_000 });
    },
    web: 'WEB-01',
  },
  {
    rol: 'visitante',
    id: 'WEB-01 error de carga de la agenda',
    ruta: `#/p/${SLUG_A}`,
    antes: async (p) => {
      await p.route('**/rest/v1/**', (r) => r.abort());
    },
    esperar: async (p) => {
      await expect(p.getByRole('alert').first()).toBeVisible({ timeout: 30_000 });
    },
    web: 'WEB-01',
  },
  // Persona con sesión sin vínculo
  { rol: 'sinVinculo', id: 'WEB-03 ficha primer ingreso (sin profesor de origen)', ruta: '#/ficha', esperar: encabezado, web: 'WEB-03' },
  { rol: 'sinVinculo', id: 'WEB-03 inicio con sesión y sin vínculo', ruta: '#/', esperar: encabezado, web: 'WEB-09' },
  // Con la ficha incompleta la guarda (CA-02) lleva a la ficha: se mide a dónde llega.
  { rol: 'sinVinculo', id: 'WEB-01 enlace de A con la ficha incompleta (la guarda lleva a la ficha)', ruta: `#/p/${SLUG_A}`, esperar: encabezado, web: 'WEB-01' },
  // Persona pendiente
  { rol: 'pendiente', id: 'WEB-01 agenda de A con aviso «Acceso pendiente»', ruta: `#/p/${SLUG_A}`, esperar: agendaCargada, web: 'WEB-01' },
  { rol: 'pendiente', id: 'WEB-03 ficha de persona pendiente', ruta: '#/ficha', esperar: encabezado, web: 'WEB-03' },
  // Alumno con un profesor
  { rol: 'alumno', id: 'WEB-01 agenda de A (alumno)', ruta: `#/p/${SLUG_A}`, esperar: agendaCargada, web: 'WEB-01' },
  {
    rol: 'alumno',
    id: 'WEB-04 agenda con diálogo «Pedir clase»',
    ruta: `#/p/${SLUG_A}`,
    esperar: agendaCargada,
    disparador: libres,
    web: 'WEB-04',
  },
  { rol: 'alumno', id: 'WEB-04 solicitud', ruta: '#/solicitud', esperar: encabezado, web: 'WEB-04' },
  { rol: 'alumno', id: 'WEB-05 mis clases con una clase', ruta: '#/mis-clases', esperar: encabezado, web: 'WEB-05' },
  {
    rol: 'alumno',
    id: 'WEB-05 mis clases con diálogo «Mover la clase»',
    ruta: '#/mis-clases',
    esperar: encabezado,
    disparador: (p) => p.getByRole('button', { name: /^Mover/ }).first(),
    web: 'WEB-05',
  },
  { rol: 'alumno', id: 'WEB-03 ficha del alumno', ruta: '#/ficha', esperar: encabezado, web: 'WEB-03' },
  {
    rol: 'alumno',
    id: 'WEB-03 ficha con diálogo «Agregar persona a cargo»',
    ruta: '#/ficha',
    esperar: encabezado,
    disparador: (p) => p.getByRole('button', { name: 'Agregar persona' }).first(),
    web: 'WEB-03',
  },
  { rol: 'alumno', id: 'WEB-01 agenda de B sin vínculo («Pedir acceso»)', ruta: `#/p/${SLUG_B}`, esperar: agendaCargada, web: 'WEB-01' },
  // Alumno con dos profesores (selector WEB-11)
  {
    rol: 'dosProfesores',
    id: 'WEB-11 inicio con selector de profesores',
    ruta: '#/',
    esperar: async (p) => {
      await expect(p.getByRole('navigation', { name: 'Tus profesores' })).toBeVisible({ timeout: 30_000 });
    },
    web: 'WEB-11',
  },
  {
    rol: 'dosProfesores',
    id: 'WEB-11 agenda de B con selector',
    ruta: `#/p/${SLUG_B}`,
    esperar: agendaCargada,
    web: 'WEB-11',
  },
  { rol: 'dosProfesores', id: 'WEB-03 ficha con varios profesores', ruta: '#/ficha', esperar: encabezado, web: 'WEB-03' },
  { rol: 'dosProfesores', id: 'WEB-05 mis clases vacío', ruta: '#/mis-clases', esperar: encabezado, web: 'WEB-05' },
  // Profesor
  { rol: 'profesor', id: 'WEB-06 panel', ruta: '#/panel', esperar: encabezado, web: 'WEB-06' },
  {
    rol: 'profesor',
    id: 'WEB-06 panel con diálogo «Bloquear horarios»',
    ruta: '#/panel',
    esperar: encabezado,
    disparador: (p) => p.getByRole('button', { name: 'Bloquear horarios' }).first(),
    web: 'WEB-06',
  },
  {
    rol: 'profesor',
    id: 'WEB-06 panel con acciones de un hueco abiertas',
    ruta: `#/panel?d=${proximoHabil()}`,
    esperar: agendaCargada,
    disparador: libres,
    web: 'WEB-06',
  },
  { rol: 'profesor', id: 'WEB-07 lista', ruta: '#/lista', esperar: encabezado, web: 'WEB-07' },
  {
    rol: 'profesor',
    id: 'WEB-07 lista con diálogo «Agregar alumno»',
    ruta: '#/lista',
    esperar: encabezado,
    disparador: (p) => p.getByRole('button', { name: 'Agregar alumno' }).first(),
    web: 'WEB-07',
  },
  {
    rol: 'profesor',
    id: 'WEB-07 lista con diálogo de rechazo de cuenta',
    ruta: '#/lista',
    esperar: encabezado,
    disparador: (p) => p.getByRole('button', { name: /^Rechazar cuenta de/ }).first(),
    web: 'WEB-07',
  },
  {
    rol: 'profesor',
    id: 'WEB-07 lista con profesor inactivo',
    ruta: '#/lista',
    antes: () => profesorActivo(SLUG_A, false),
    esperar: async (p) => {
      await expect(p.getByText(/Tu agenda está inactiva/)).toBeVisible({ timeout: 30_000 });
    },
    web: 'WEB-07',
  },
  { rol: 'profesor', id: 'WEB-08 configuración con «Tu enlace»', ruta: '#/configuracion', esperar: encabezado, web: 'WEB-08' },
  { rol: 'profesor', id: 'WEB-01 agenda de A (profesor)', ruta: `#/p/${SLUG_A}`, esperar: agendaCargada, web: 'WEB-01' },
  // Administrador
  {
    rol: 'administrador',
    id: 'WEB-10 administración: lista',
    ruta: '#/admin',
    esperar: async (p) => {
      await expect(p.getByRole('button', { name: /^Inactivar a/ }).first()).toBeVisible({ timeout: 30_000 });
    },
    web: 'WEB-10',
  },
  {
    rol: 'administrador',
    id: 'WEB-10 administración con diálogo «Inactivar»',
    ruta: '#/admin',
    esperar: async (p) => {
      await expect(p.getByRole('button', { name: /^Inactivar a/ }).first()).toBeVisible({ timeout: 30_000 });
    },
    disparador: (p) => p.getByRole('button', { name: /^Inactivar a/ }).first(),
    web: 'WEB-10',
  },
  {
    rol: 'administrador',
    id: 'WEB-10 administración: alta con errores',
    ruta: '#/admin',
    esperar: async (p) => {
      await expect(p.getByRole('button', { name: 'Dar de alta' })).toBeVisible({ timeout: 30_000 });
      await p.getByRole('button', { name: 'Dar de alta' }).click();
      await expect(p.locator('input[aria-invalid=true]').first()).toBeVisible({ timeout: 10_000 });
    },
    web: 'WEB-10',
  },
  // Estado rechazado (B12: faltaba en la primera pasada)
  { rol: 'rechazado', id: 'WEB-01 agenda de A con aviso «Acceso rechazado»', ruta: `#/p/${SLUG_A}`, esperar: agendaCargada, web: 'WEB-01' },
  { rol: 'rechazado', id: 'WEB-03 ficha de persona rechazada', ruta: '#/ficha', esperar: encabezado, web: 'WEB-03' },
  // Estados cargando y vacío (la red se intercepta) y día sin huecos
  { rol: 'visitante', id: 'WEB-01 agenda cargando', ruta: `#/p/${SLUG_A}`, antes: colgarRed, esperar: esperarUnSegundo, web: 'WEB-01' },
  {
    rol: 'visitante',
    id: 'WEB-01 agenda de un día sin huecos (vacío)',
    ruta: `#/p/${SLUG_A}`,
    esperar: async (p) => {
      await agendaCargada(p);
      await p.locator('input[type=date]').first().fill(proximoDomingo());
      await expect(p.getByText('No hay huecos este día')).toBeVisible({ timeout: 15_000 });
    },
    web: 'WEB-01',
  },
  { rol: 'administrador', id: 'WEB-10 administración cargando', ruta: '#/admin', antes: colgarListaProfesores, esperar: esperarUnSegundo, web: 'WEB-10' },
  {
    rol: 'administrador',
    id: 'WEB-10 administración con error de carga',
    ruta: '#/admin',
    antes: async (p) => {
      await p.route('**/rest/v1/rpc/listar_profesores', (r) => r.abort());
    },
    esperar: async (p) => {
      await expect(p.getByRole('alert').first()).toBeVisible({ timeout: 30_000 });
    },
    web: 'WEB-10',
  },
  {
    rol: 'administrador',
    id: 'WEB-10 administración vacío (sin profesores)',
    ruta: '#/admin',
    antes: async (p) => {
      await p.route('**/rest/v1/rpc/listar_profesores', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    },
    esperar: async (p) => {
      await expect(p.getByRole('heading', { name: 'Dar de alta a un profesor' })).toBeVisible({ timeout: 30_000 });
      await p.waitForTimeout(500);
    },
    web: 'WEB-10',
  },
  {
    rol: 'administrador',
    id: 'WEB-10 administración: alta con éxito',
    ruta: '#/admin',
    esperar: async (p) => {
      const u = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
      await expect(p.getByRole('button', { name: 'Dar de alta' })).toBeVisible({ timeout: 30_000 });
      await p.getByLabel('Mail del profesor').fill(`cel.adm.${u}@example.test`);
      await p.getByLabel('Nombre del profesor').fill(`Cel Profe ${u}`);
      await p.getByLabel('Enlace del profesor').fill(`cel-adm-${u}`);
      await p.getByRole('button', { name: 'Dar de alta' }).click();
      await expect(p.getByRole('status').filter({ hasText: /dado de alta|ya existía|adopt/i }).first()).toBeVisible({ timeout: 30_000 });
    },
    web: 'WEB-10',
  },
];

/** Casos que fallaron en 360 px, para la evidencia resumen (en archivo: el worker se reinicia tras un fallo). */
const registrarFallo = (c: Caso) => {
  const e = leerEstado() ?? { ppid: process.ppid, fallos: [] };
  if (!e.fallos.includes(`${c.rol}|${c.id}`)) e.fallos.push(`${c.rol}|${c.id}`);
  guardarEstado(e);
};

async function preparar(page: Page, c: Caso) {
  if (c.antes) await c.antes(page);
  await page.goto(`${ORIGEN}${BASE}${c.ruta}`);
  if (c.esperar) await c.esperar(page);
  else await encabezado(page);
  await page.waitForLoadState('networkidle', { timeout: 4_000 }).catch(() => undefined);
  await page.waitForTimeout(300);
}

async function abrirDialogo(page: Page, c: Caso) {
  if (!c.disparador) return;
  const d = c.disparador(page);
  if ((await d.count()) === 0) {
    const botones = await page.getByRole('button').evaluateAll((bs) => bs.map((b) => (b.getAttribute('aria-label') || (b as HTMLElement).innerText || '').trim()));
    throw new Error(`no se encontró el disparador del diálogo en ${c.ruta}; botones: ${botones.join(' | ')}; texto: ${(await page.locator('main').innerText()).slice(0, 300)}`);
  }
  await d.click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(300);
}

for (const rol of ['visitante', 'sinVinculo', 'pendiente', 'rechazado', 'alumno', 'dosProfesores', 'profesor', 'administrador'] as Rol[]) {
  test.describe(`celular · ${rol}`, () => {
    test.use({ locale: 'es-UY', viewport: { width: 360, height: 740 }, storageState: estadoDe(rol) });

    for (const c of CASOS.filter((x) => x.rol === rol)) {
      test(`T-NFR-11 CA-38 NFR-06 ${c.web ?? ''} [${rol}] ${c.id} (${c.ruta}) a 360 px: sin desplazamiento horizontal y controles >= 44 px`, async ({ page }) => {
        await preparar(page, c);
        await abrirDialogo(page, c);
        const m = await medir(page);
        const excepciones = m.chicos.filter((x) => x.excepcion);
        for (const e of excepciones) test.info().annotations.push({ type: 'tamaño: excepción en línea', description: `${e.selector} «${e.texto}» ${e.ancho}x${e.alto}: ${e.excepcion}` });
        test.info().annotations.push({ type: 'controles medidos', description: String(m.total) });
        const falla = informe(m);
        if (falla.length > 0) registrarFallo(c);
        expect(falla, `${rol} · ${c.id} · ${c.ruta} (${m.total} controles medidos)\n${falla.join('\n')}`).toEqual([]);
      });

      test(`T-WEB-04 CA-38 ${c.web ?? ''} [${rol}] ${c.id} (${c.ruta}) recorrido por teclado: Tab, foco visible${c.disparador ? ', Enter y Escape en el diálogo' : ''}`, async ({ page }) => {
        await preparar(page, c);
        const falla = c.disparador ? await dialogoPorTeclado(page, c.disparador(page).first()) : await recorrerTeclado(page);
        expect(falla, `${rol} · ${c.id} · ${c.ruta}\n${falla.join('\n')}`).toEqual([]);
      });
    }
  });
}

// Ingreso: paso del código y error de código (WEB-02), que dependen de la acción y no de una ruta.
test.describe('celular · visitante · ingreso por pasos', () => {
  test.use({ locale: 'es-UY', viewport: { width: 360, height: 740 }, storageState: VACIA });

  test('T-NFR-11 CA-38 NFR-06 WEB-02 [visitante] ingreso paso código y error de código a 360 px: sin desplazamiento y controles >= 44 px', async ({ page }) => {
    const mail = mailCel('ingreso');
    await page.goto(`${ORIGEN}${BASE}#/ingreso`);
    await page.getByRole('button', { name: 'Entrar con un código por mail' }).click();
    await page.getByLabel(/^Mail/).fill(mail);
    const falla: string[] = [];
    const sumar = async (paso: string) => {
      await page.waitForTimeout(300);
      const m = await medir(page);
      informe(m).forEach((f) => falla.push(`[${paso}] ${f}`));
    };
    await sumar('paso mail con el campo lleno');
    await expect(async () => {
      await page.getByRole('button', { name: 'Pedir código' }).click();
      await expect(page.getByRole('heading', { name: 'Ingresá el código' })).toBeVisible({ timeout: 2_500 });
    }).toPass({ timeout: 90_000, intervals: [1_000, 2_000, 3_000] });
    await sumar('paso código');
    await page.getByLabel('Código de 6 dígitos').fill('000000');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 20_000 });
    await sumar('error de código');
    expect(falla, `visitante · ingreso por pasos\n${falla.join('\n')}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Evidencia resumen: capturas a 360 px de las rutas que fallaron (WEB-360-B12). Va al final del archivo; no falla por sí sola.
// ---------------------------------------------------------------------------------------------------------------------
test.describe('evidencia resumen a 360 px', () => {
  test.use({ locale: 'es-UY' });

  test('WEB-360-B12 capturas de las rutas con fallos a 360 px', async ({ browser, evidencia }) => {
    test.setTimeout(420_000);
    const cu = evidencia({
      cu: 'WEB-360-B12',
      titulo: 'Diagnóstico a 360 px: rutas con desplazamiento horizontal o controles menores de 44 px',
      criterios: ['CA-38', 'NFR-06', 'WEB-01'],
      bolt: 'B12',
    });
    const unicos = new Map<string, Caso>();
    for (const clave of leerEstado()?.fallos ?? []) {
      const c = CASOS.find((x) => `${x.rol}|${x.id}` === clave);
      if (c) unicos.set(clave, c);
    }
    test.info().annotations.push({ type: 'rutas con fallo a 360 px', description: String(unicos.size) });
    if (unicos.size === 0) {
      await cu.paso(
        'Sin fallos a 360 px',
        async () => {
          const ctx = await browser.newContext({ locale: 'es-UY', viewport: { width: 360, height: 740 }, storageState: VACIA });
          const p = await ctx.newPage();
          await p.goto(`${ORIGEN}${BASE}#/`);
          await encabezado(p);
          await ctx.close();
        },
        { esperado: 'Ninguna ruta de la matriz falla a 360 px' },
      );
      return;
    }
    for (const c of unicos.values()) {
      const ctx = await browser.newContext({ locale: 'es-UY', viewport: { width: 360, height: 740 }, storageState: estadoDe(c.rol) });
      const page = await ctx.newPage();
      try {
        await cu.paso(
          `[${c.rol}] ${c.id} (${c.ruta})`,
          async () => {
            await preparar(page, c);
            await abrirDialogo(page, c);
          },
          { esperado: 'La pantalla entra en 360 px de ancho y todos sus controles miden al menos 44x44 px (hoy falla: ver la prueba T-NFR-11 de esta ruta)' },
        );
      } finally {
        await ctx.close();
      }
    }
  });
});

// Última prueba del archivo: borra los datos sintéticos `CEL ` / `cel.*` (salvo RTC_REUSAR o RTC_CONSERVAR, que los dejan
// para iterar sin repetir las entradas con código).
test('limpieza de los datos sintéticos de celular.spec.ts', async () => {
  if (process.env.RTC_REUSAR || process.env.RTC_CONSERVAR) return;
  await limpiarCel();
});
