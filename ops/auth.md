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

## Turnstile (Cloudflare)
- Local y CI: claves de prueba públicas de Cloudflare (sitekey `1x00000000000000000000AA`, secret
  `1x0000000000000000000000000000000AA`; siempre pasan). Son de la documentación pública de Cloudflare.
- Producción: crear un widget real en Cloudflare **antes de B04**. La sitekey es pública (variable del
  repositorio); la secret key se carga solo en Supabase (Auth > Attack Protection > CAPTCHA), nunca en GitHub
  ni en el repo. Dominio del widget: `agendaclasesapp.github.io`.
- Verifica tras activar: un alta sin token es rechazada por Auth.
