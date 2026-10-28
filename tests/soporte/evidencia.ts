/**
 * Evidencia de los casos de uso Web y Mobile con Playwright (spec-impl, profiles/tester.md).
 *
 * Cada paso del caso de uso deja una captura de pantalla completa y su resultado en
 *   <AIDLC_EVIDENCIAS>/<CU>/capturas/NN-<paso>.png
 *   <AIDLC_EVIDENCIAS>/<CU>/evidencia.json
 * y `evidencia_cu.py armar` arma con eso el documento del caso (caso.md) que muestra el tablero en
 * Calidad › Pruebas. AIDLC_EVIDENCIAS es la carpeta calidad/evidencias/ui del workspace.
 *
 * Uso, en lugar de `import { test } from "@playwright/test"`:
 *
 *   import { test, expect } from "./evidencia";
 *
 *   test("CU-03 Alta de pedido", async ({ page, evidencia }) => {
 *     const cu = evidencia({ cu: "CU-03", titulo: "Alta de pedido", criterios: ["PED-01", "WEB-02"], bolt: "B02" });
 *     await cu.paso("Abrir el formulario de pedido", async () => {
 *       await page.goto("/pedidos/nuevo");
 *       await expect(page.getByRole("heading", { name: "Nuevo pedido" })).toBeVisible();
 *     }, { esperado: "Se ve el formulario vacío" });
 *     await cu.paso("Guardar con datos válidos", async () => { ... }, { esperado: "Aparece «Pedido creado»" });
 *   });
 *
 * Un paso que falla también deja su captura, queda como «falla» con el error y la prueba falla.
 * La evidencia se reescribe en cada corrida: lo que queda es la última ejecución del caso.
 */
import { test as base, expect, type Page, type TestInfo } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

export { expect };

export interface Paso {
  n: number;
  titulo: string;
  esperado?: string;
  resultado: "ok" | "falla";
  captura: string;
  nota?: string;
  error?: string;
  fecha: string;
  duracion_ms: number;
}

export interface Evidencia {
  cu: string;
  titulo: string;
  componente: "web" | "mobile";
  navegador: string;
  dispositivo?: string;
  bolt?: string;
  criterios?: string[];
  url_base?: string;
  fecha: string;
  pasos: Paso[];
}

export interface DatosCu {
  cu: string;
  titulo: string;
  criterios?: string[];
  bolt?: string;
}

export interface Recorrido {
  paso(titulo: string, accion: () => Promise<void>, opciones?: { esperado?: string; nota?: string }): Promise<void>;
  nota(texto: string): void;
}

const slug = (texto: string) =>
  texto.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "paso";

const carpetaBase = () => path.resolve(process.env.AIDLC_EVIDENCIAS || "evidencias-ui");

function navegadorDe(info: TestInfo): string {
  const uso = info.project.use as { browserName?: string; channel?: string };
  return uso.channel || uso.browserName || "chromium";
}

/**
 * Páginas de la prueba con su última actividad. Las pruebas que abren sus propios contextos
 * (`browser.newContext()`, p. ej. alumna y profesor) navegan en páginas distintas de la `page` del
 * fixture, que queda en about:blank: la captura se toma de la página con actividad más reciente (H-390).
 */
type Registro = { paginas: Map<Page, number> };
function registrar(reg: Registro, pagina: Page) {
  if (reg.paginas.has(pagina)) return;
  const marca = () => reg.paginas.set(pagina, performance.now());
  marca();
  pagina.on("request", marca);
  pagina.on("framenavigated", marca);
  pagina.on("domcontentloaded", marca);
  pagina.on("close", () => reg.paginas.delete(pagina));
}
function paginaActiva(reg: Registro, porDefecto: Page): Page {
  let mejor = porDefecto;
  let t = -1;
  for (const [p, marca] of reg.paginas) {
    if (p.isClosed()) continue;
    const url = p.url();
    const vacia = url === "about:blank" || url === "";
    if (vacia && p !== porDefecto) continue;
    if (p === porDefecto && vacia) { if (t < 0) mejor = p; continue; }
    if (marca >= t) { mejor = p; t = marca; }
  }
  return mejor;
}

function nuevoRecorrido(page: Page, info: TestInfo, datos: DatosCu, reg: Registro): { recorrido: Recorrido; guardar: () => void } {
  const carpeta = path.join(carpetaBase(), datos.cu.replace(/[^\w.-]+/g, "-"));
  const capturas = path.join(carpeta, "capturas");
  fs.rmSync(capturas, { recursive: true, force: true });
  fs.mkdirSync(capturas, { recursive: true });
  const dispositivo = process.env.AIDLC_DISPOSITIVO || undefined;
  const ev: Evidencia = {
    cu: datos.cu,
    titulo: datos.titulo,
    componente: (process.env.AIDLC_COMPONENTE as "web" | "mobile") || (dispositivo ? "mobile" : "web"),
    navegador: navegadorDe(info),
    dispositivo,
    bolt: datos.bolt,
    criterios: datos.criterios,
    url_base: (info.project.use as { baseURL?: string }).baseURL,
    fecha: new Date().toISOString(),
    pasos: [],
  };
  let notaPendiente: string | undefined;
  const guardar = () =>
    fs.writeFileSync(path.join(carpeta, "evidencia.json"), JSON.stringify(ev, null, 2) + "\n", "utf-8");

  const recorrido: Recorrido = {
    nota(texto) {
      notaPendiente = texto;
    },
    async paso(titulo, accion, opciones = {}) {
      const n = ev.pasos.length + 1;
      const archivo = `${String(n).padStart(2, "0")}-${slug(titulo)}.png`;
      const inicio = Date.now();
      let error: unknown;
      await base.step(`${datos.cu} · paso ${n}: ${titulo}`, async () => {
        try {
          await accion();
        } catch (e) {
          error = e;
        }
      });
      await paginaActiva(reg, page).screenshot({ path: path.join(capturas, archivo), fullPage: true }).catch(() => undefined);
      ev.pasos.push({
        n,
        titulo,
        esperado: opciones.esperado,
        resultado: error ? "falla" : "ok",
        captura: `capturas/${archivo}`,
        nota: opciones.nota ?? notaPendiente,
        // Sin los colores ANSI de los mensajes de expect: el error va a un documento.
        error: error ? String((error as Error).message || error).replace(/\u001b\[[0-9;]*m/g, "").slice(0, 500) : undefined,
        fecha: new Date().toISOString(),
        duracion_ms: Date.now() - inicio,
      });
      notaPendiente = undefined;
      guardar();
      if (error) throw error;
    },
  };
  return { recorrido, guardar };
}

export const test = base.extend<{ evidencia: (datos: DatosCu) => Recorrido }>({
  evidencia: async ({ page, browser }, usar, info) => {
    const abiertos: (() => void)[] = [];
    const reg: Registro = { paginas: new Map() };
    registrar(reg, page);
    const newContext = browser.newContext.bind(browser);
    (browser as unknown as { newContext: unknown }).newContext = async (...args: Parameters<typeof newContext>) => {
      const ctx = await newContext(...args);
      ctx.pages().forEach((p) => registrar(reg, p));
      ctx.on("page", (p) => registrar(reg, p));
      return ctx;
    };
    try {
      await usar((datos) => {
        const { recorrido, guardar } = nuevoRecorrido(page, info, datos, reg);
        abiertos.push(guardar);
        return recorrido;
      });
    } finally {
      (browser as unknown as { newContext: unknown }).newContext = newContext;
    }
    abiertos.forEach((guardar) => guardar());
  },
});
