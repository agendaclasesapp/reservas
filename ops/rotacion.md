# Rotación de secretos (SEC-30)

Regla común: el valor nuevo no pasa por el repositorio, el chat ni los logs. Se verifica comparando el SHA-256
con el digest de `npx supabase@2.121.0 secrets list --project-ref rmokypmznhobapyghfpi`.

## MAIL_SECRETO (Edge Function y Vault)
1. Genera un valor aleatorio largo (`openssl rand -hex 32`).
2. `supabase secrets set MAIL_SECRETO=<nuevo> --project-ref rmokypmznhobapyghfpi`.
3. En el SQL Editor actualiza el Vault `mail_secreto` con el mismo valor (`vault.update_secret`).
4. Envía un mail de prueba y confirma que llega; con el secreto viejo la función responde 401.
5. Ensayo local obligatorio antes de G4: repite 1 a 4 contra `supabase start` con `supabase/.env.development`.

## GMAIL_APP_PASSWORD
1. Cuenta Google dedicada > Seguridad > Contraseñas de aplicación: crea otra y revoca la vieja.
2. `supabase secrets set GMAIL_APP_PASSWORD=<sin espacios>`; compara el digest.
3. En el panel, Auth > SMTP: actualiza la misma contraseña. Prueba un código OTP y un recordatorio.

## Secreto OAuth de Google
1. Google Cloud > Credenciales > cliente OAuth: agrega un secreto nuevo; deshabilita el viejo tras probar.
2. Panel de Supabase > Auth > Providers > Google: pega el secreto nuevo. No va a `config.toml` ni a GitHub
   (`RTC_GOOGLE_SECRET` queda vacío).
3. Prueba el ingreso con Google desde Pages.

## Tokens de Supabase
- `SUPABASE_ACCESS_TOKEN`: crea uno nuevo en Account > Access Tokens, actualízalo en el environment
  `produccion`, borra el viejo.
- `SUPABASE_DB_PASSWORD`: Project Settings > Database > Reset password; actualiza el secreto de GitHub y las
  cadenas de conexión locales. Corre supabase-deploy para confirmar.
- Claves del proyecto: la publicable es pública; si rota, actualiza `VITE_SUPABASE_ANON_KEY` y vuelve a
  publicar. La secret/service_role no sale de Supabase.
