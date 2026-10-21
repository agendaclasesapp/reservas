import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { normalizarBase } from './src/lib/base.ts';
import { aplicarCsp, origenConexion, quitarCsp } from './src/lib/csp.ts';

// CSP de SEC-16: al compilar completa connect-src con el origen de VITE_SUPABASE_URL; en `vite dev`
// la quita (React Refresh usa un script en línea). `vite preview` sirve dist/ con la CSP real.
function cspSupabase(supabaseUrl: string | undefined): Plugin {
  return {
    name: 'rtc-csp',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (ctx.server) return quitarCsp(html);
        return aplicarCsp(html, origenConexion(supabaseUrl ?? ''));
      },
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  if (command === 'build') {
    for (const nombre of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
      if (!env[nombre]) throw new Error(`${nombre} es obligatoria para compilar (CSP de SEC-16 y cliente, DEC-14).`);
    }
  }
  return {
    // GitHub Pages publica en /reservas/ (DEC-14); VITE_BASE lo cambia.
    base: normalizarBase(env.VITE_BASE),
    plugins: [react(), cspSupabase(env.VITE_SUPABASE_URL)],
    // 127.0.0.1:5173 es la URL local permitida para el retorno de Google (supabase/.env.development).
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
    preview: { host: '127.0.0.1', port: 5173, strictPort: true },
    build: { target: 'es2022', sourcemap: false },
  };
});
