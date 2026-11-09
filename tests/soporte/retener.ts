// Retiene las lecturas que una pantalla repite DESPUÉS de una respuesta fallida, para que el mensaje del fallo se pueda
// observar de forma determinista: la Lista y el panel releen su agenda al recibir un rechazo por datos desactualizados
// (HUECO_NO_LIBRE, SOLICITUD_VENCIDA) y la relectura puede reemplazar la tarjeta o el formulario que lo mostraba. Sin
// retener, el mensaje vive solo el tiempo que tarda esa lectura y la prueba depende de la velocidad de la máquina (CI).
import type { Page } from '@playwright/test';

/** Retiene las peticiones que coinciden con `patron` hasta que se llame a la función devuelta. */
export async function retener(page: Page, patron: RegExp): Promise<() => Promise<void>> {
  let liberar!: () => void;
  const espera = new Promise<void>((r) => {
    liberar = r;
  });
  const manejador = async (ruta: import('@playwright/test').Route) => {
    await espera;
    await ruta.continue().catch(() => undefined);
  };
  await page.route(patron, manejador);
  return async () => {
    liberar();
    await page.unroute(patron, manejador).catch(() => undefined);
  };
}

/** Lecturas de agenda y contadores del panel (`agenda_profesor`, `agenda_profesor_dias`, `contadores`). */
export const LECTURAS_PANEL = /\/rpc\/(?:agenda_profesor(?:_dias)?|contadores)(?:[?#]|$)/;
/** Lectura de la Lista de solicitudes pendientes. */
export const LECTURA_SOLICITUDES = /\/v_solicitudes_pendientes(?:[?#]|$)/;
