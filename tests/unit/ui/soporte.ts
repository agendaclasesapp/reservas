import { expect } from 'vitest';
import { axe } from 'vitest-axe';
import * as matchers from 'vitest-axe/matchers';

expect.extend(matchers);

/**
 * jsdom no implementa `CSS.escape`, que React Aria usa al abrir un Modal. Se completa aquí; las vistas que
 * usen componentes de React Aria en sus pruebas deberían mover esto a un `setupFiles` de vitest.config.ts.
 */
if (typeof globalThis.CSS?.escape !== 'function') {
  Object.defineProperty(globalThis, 'CSS', {
    configurable: true,
    value: { ...globalThis.CSS, escape: (valor: string) => valor.replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c) },
  });
}

/**
 * Corre axe sobre un nodo y falla ante cualquier violación (incluidas las serias y críticas).
 * jsdom no calcula estilos reales: `color-contrast` se cubre con tokens.test.ts (A11Y-06) y en Playwright.
 */
export async function sinViolacionesAxe(nodo: Element): Promise<void> {
  const resultado = await axe(nodo, { rules: { 'color-contrast': { enabled: false } } });
  const resumen = resultado.violations.map((v) => `${v.id} (${v.impact ?? 's/impacto'}): ${v.help}`);
  expect(resumen).toEqual([]);
}
