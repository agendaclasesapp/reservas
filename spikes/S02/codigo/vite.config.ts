import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Pages publica en https://<usuario>.github.io/<repo>/ ; el spike usa /reservas/ (DEC-14).
export default defineConfig({
  base: process.env.RTC_BASE ?? '/reservas/',
  plugins: [react()],
  test: {
    projects: [
      { extends: true, test: { name: 'unit', environment: 'jsdom', include: ['tests/unit/**/*.test.ts'] } },
      {
        extends: true,
        test: { name: 'local', environment: 'node', include: ['tests/local/**/*.test.ts'], testTimeout: 30000, fileParallelism: false },
      },
    ],
  },
});
