// CAPTCHA de Turnstile en pruebas (CA-44, ADR-016). El secreto de prueba de Cloudflare
// (supabase/.env.development) acepta cualquier token no vacío; este es el token de prueba que documenta Cloudflare.
// Toda ayuda que llame a `signInWithOtp` lo manda en `options.captchaToken`.
export const TOKEN_CAPTCHA = 'XXXX.DUMMY.TOKEN.XXXX';
/** Sitekey de prueba de Cloudflare que siempre pasa (VITE_TURNSTILE_SITEKEY en E2E). */
export const SITEKEY_PRUEBA = '1x00000000000000000000AA';
