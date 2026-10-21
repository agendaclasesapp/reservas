// Pruebas de integración y de plataforma: Vitest en node contra el stack Supabase local (T01.5).
// `npm run test:integracion` = vitest run --config vitest.integracion.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'integracion',
    environment: 'node',
    include: ['tests/integracion/**/*.{test,spec}.ts'],
    // Un solo proceso: comparten el stack local y el reloj de prueba (ADR-014).
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    reporters: ['default'],
  },
});
