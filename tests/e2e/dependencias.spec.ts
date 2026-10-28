// Verificación · fallo de dependencias (estrategia de pruebas, escenarios de fallo): la web con la API caída muestra un
// mensaje de error y no una pantalla en blanco (NFR-04 / WEB-01 / HUMO-02). Baja el contenedor de Kong (puerta de la API)
// de verdad y lo vuelve a subir en `finally`. No corre en la suite por defecto: solo con RTC_DEPENDENCIAS=1.
// Requiere el stack local (`supabase_kong_reservas`) y `docker` en el PATH.
import { execSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { SLUG_A } from '../soporte/usuarios';

const BASE = process.env.RTC_BASE ?? '/reservas/';
const ORIGEN = process.env.BASE_URL ?? `http://127.0.0.1:${process.env.RTC_PREVIEW_PORT || '4173'}`;
const KONG = 'supabase_kong_reservas';

test.skip(!process.env.RTC_DEPENDENCIAS, 'Opt-in: RTC_DEPENDENCIAS=1 (baja el contenedor Kong del stack local)');

test('DEP-01 con la API caída la agenda pública muestra un error legible, no una pantalla en blanco', async ({ page }) => {
  test.setTimeout(120_000);
  execSync(`docker stop ${KONG}`, { stdio: 'ignore' });
  try {
    for (const hash of [`#/p/${SLUG_A}`, '#/', '#/ingreso']) {
      await page.goto(`${ORIGEN}${BASE}${hash}`);
      await expect(page.locator('body')).not.toHaveText('', { timeout: 20_000 });
      await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 20_000 });
    }
    await page.goto(`${ORIGEN}${BASE}#/p/${SLUG_A}`);
    await expect(page.getByRole('alert').or(page.getByText(/no se pudo|error|intent/i)).first()).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: 'test-results/DEP-01-api-caida.png', fullPage: true });
  } finally {
    execSync(`docker start ${KONG}`, { stdio: 'ignore' });
  }
});
