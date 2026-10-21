// Variante V2 de S03: postgrest-js en la ruta de agenda y supabase-js (auth) en chunk aparte.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'v2',
  base: './',
  plugins: [react()],
  build: { outDir: '../dist-v2', emptyOutDir: true, manifest: true, target: 'es2022' },
});
