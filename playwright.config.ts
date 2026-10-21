// E2E con Playwright, navegador del ciclo: chromium (AIDLC_NAVEGADOR). Corre contra el bundle compilado
// (npm run build) servido por `vite preview`, con la base de Pages (/reservas/ por defecto, DEC-14).
import { defineConfig, devices } from '@playwright/test';

const navegador = process.env.AIDLC_NAVEGADOR || 'chromium';
const puerto = process.env.RTC_PREVIEW_PORT || '4173';
const base = process.env.RTC_BASE ?? '/reservas/';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL || `http://127.0.0.1:${puerto}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], browserName: navegador as 'chromium' } },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: `npm run preview -- --host 127.0.0.1 --port ${puerto} --strictPort`,
        url: `http://127.0.0.1:${puerto}${base}`,
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
