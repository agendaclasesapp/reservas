# Mails: función `enviar-mail` y SMTP de Auth (ADR-012, H-018)

Dos caminos, ambos con la cuenta Gmail dedicada (`agendaclasesapp@gmail.com`).
- Auth (códigos OTP y confirmación): SMTP de Gmail cargado en el panel (Auth > SMTP); no va en `config.toml`.
  El límite `rate_limit.email_sent` se fija y verifica en el panel (`auth.md`).
- Recordatorios y avisos: Edge Function `enviar-mail` (Gmail 465, se activa en B03), desplegada con
  `--no-verify-jwt --use-api` y protegida por `MAIL_SECRETO`.

## Secretos de la función (solo en Supabase)
`GMAIL_USER`, `GMAIL_APP_PASSWORD` (sin espacios), `MAIL_SECRETO`.

    npx supabase@2.121.0 secrets set GMAIL_USER=<...> --project-ref rmokypmznhobapyghfpi
    npx supabase@2.121.0 secrets list --project-ref rmokypmznhobapyghfpi
    printf %s "<valor>" | sha256sum      # debe igualar el digest de secrets list

supabase-deploy solo hace `secrets list` y falla si falta un nombre; nunca los carga.

## Vault de producción
`url_funcion_mail` y `mail_secreto` se cargan a mano en el SQL Editor (nunca por migración ni `seed.sql`).

## Local y CI
Mailpit/Inbucket recibe todo; `MAIL_SECRETO` de prueba en `supabase/.env.development`. Nada sale a Gmail.

## Fallos frecuentes
- `535` de Gmail: contraseña de aplicación revocada o con espacios; rota (`rotacion.md`).
- 401 de la función: `MAIL_SECRETO` distinto entre función y Vault.
- Límite diario de Gmail agotado: espera 24 h y reduce reintentos.
