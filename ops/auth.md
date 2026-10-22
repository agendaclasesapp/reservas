# Auth: Google y Turnstile (ADR-007, SEC-30)

## Google (proveedor activo; el Client ID está en el panel de Google Cloud)
- URI de retorno autorizada en el cliente OAuth: `https://rmokypmznhobapyghfpi.supabase.co/auth/v1/callback`.
- Pantalla de consentimiento (Google Auth Platform > Branding):
  - Página de inicio: `https://agendaclasesapp.github.io/reservas/`
  - Política de privacidad: `https://agendaclasesapp.github.io/reservas/privacidad.html` (fuente `public/privacidad.html`)
  - Condiciones del servicio: `https://agendaclasesapp.github.io/reservas/condiciones.html` (fuente `public/condiciones.html`)
  - Dominios autorizados: `agendaclasesapp.github.io` y `rmokypmznhobapyghfpi.supabase.co`
  - Alcances: solo `openid`, `email`, `profile`.
- Estado de publicación: pasar de «Testing» a «In production» antes de abrir a los alumnos; en Testing solo
  entran los usuarios de prueba y los tokens caducan a los 7 días.
- Las dos páginas públicas deben seguir publicadas: `verificar-publicado` compara su contenido con `public/`.
- El secreto OAuth se carga en el panel de Supabase (Providers > Google), nunca en el repo.
  `RTC_GOOGLE_SECRET` queda vacío.

## Supabase Auth
- Site URL y Redirect URL: `https://agendaclasesapp.github.io/reservas/`. Los empuja `config push` y los
  comprueba `scripts/seguridad/verificar-auth.mjs`.
- Verificar en el panel (no viajan en `config.toml`): SMTP propio activo y `rate_limit.email_sent` (H-022).
- OTP de 6 dígitos con expiración de 600 s, `max_frequency` de 60 s, confirmaciones activas.

## Turnstile (Cloudflare) (ADR-016, WEB-02, CA-44, SEC-13)
- Local y CI: claves de prueba públicas de Cloudflare, de su documentación (siempre pasan; no son secretos):
  sitekey `1x00000000000000000000AA` (`VITE_TURNSTILE_SITEKEY` en `.env.example` y, si falta la variable del
  repositorio, en `web.yml`) y secret `1x0000000000000000000000000000000AA` (`RTC_TURNSTILE_SECRET` en
  `supabase/.env.development`). `[auth.captcha]` está activo en `config.toml` con `provider = "turnstile"` y
  `secret = "env(RTC_TURNSTILE_SECRET)"`. Las ayudas de prueba mandan el token `XXXX.DUMMY.TOKEN.XXXX`.
- `config push` y el secreto (probado con `config diff` y `config push` contra la API simulada, sin tocar la nube):
  `auth.captcha.secret` figura en `masked` del diff (no se compara) y, con `RTC_TURNSTILE_SECRET` vacío o sin
  definir, el `PATCH` lleva `security_captcha_enabled` y `security_captcha_provider` pero **no** el secreto, así
  que no lo manda ni pisa el del panel. `config-permitida.json` admite `auth.captcha.enabled` y
  `auth.captcha.provider`; cualquier `update` de `auth.captcha.secret` bloquea el despliegue.
  `supabase-deploy.yml` debe definir `RTC_TURNSTILE_SECRET: ''` en el `env` del job, como `RTC_GOOGLE_SECRET`.

### Pasos del humano (antes de G4 y de abrir el ingreso por código a los alumnos)
1. Entrá a https://dash.cloudflare.com > Turnstile > **Add widget** (cuenta gratuita).
2. Nombre `ReservaTuClase`; **Hostname**: `agendaclasesapp.github.io` (solo ese dominio); modo **Managed**.
3. Creá el widget y copiá la **Site Key** (pública) y la **Secret Key** (privada).
4. Site Key: GitHub > Settings > Secrets and variables > Actions > pestaña **Variables** > `VITE_TURNSTILE_SITEKEY`.
   Sin esa variable el build publica la sitekey de prueba y el CAPTCHA real rechazaría todo pedido de código.
   Volvé a publicar (push a `main` o *Run workflow* de `web`).
5. Secret Key: panel de Supabase > Authentication > Attack Protection > **Enable Captcha protection** >
   proveedor **Cloudflare Turnstile** > pegar la Secret Key > Save. Nunca en GitHub, `.env*` ni el repo.
6. Verificar: en `https://agendaclasesapp.github.io/reservas/` el widget aparece al elegir «código» y el código llega;
   con curl sin `captchaToken` a `/auth/v1/otp` Auth responde `captcha_failed` (400/422) y no nace usuario;
   `config diff` posterior no muestra `auth.captcha.secret`.
7. Si rotás la Secret Key: repetir el paso 5; no hay nada que cambiar en el repositorio.
