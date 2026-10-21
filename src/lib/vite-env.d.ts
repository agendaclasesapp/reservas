/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Clave pública de Turnstile (B04, ADR-016). */
  readonly VITE_TURNSTILE_SITEKEY?: string;
  /** Ruta de publicación; por defecto /reservas/ (DEC-14). */
  readonly VITE_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
