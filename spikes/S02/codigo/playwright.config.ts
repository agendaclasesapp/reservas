import { defineConfig, devices } from '@playwright/test';

// Corre contra el bundle compilado con base /reservas/ (npm run build) servido por vite preview.
export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'npm run preview', url: 'http://127.0.0.1:5173/reservas/', reuseExistingServer: false },
});
