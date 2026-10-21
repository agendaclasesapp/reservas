import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Unitarias y de componente (tests/unit/**). La integración usa vitest.integracion.config.ts (T01.5).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    // globals: true para que Testing Library limpie el DOM después de cada prueba.
    globals: true,
    env: {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: 'clave-anon-de-prueba',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/main.tsx'],
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
    },
  },
});
