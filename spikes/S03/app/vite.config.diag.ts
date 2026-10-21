// Diagnóstico S03: un chunk por paquete para ver cuánto pesa cada dependencia (no es la config propuesta).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist-diag', manifest: true, target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          const m = id.match(/node_modules[\/]((?:@[^\/]+[\/])?[^\/]+)/);
          return m ? 'pkg-' + m[1].replace(/[\/@]/g, '_') : undefined;
        },
      },
    },
  },
});
