# S01 · Operación (TS01.1): proyecto Supabase y secretos de la Edge Function

Sin valores secretos. Fecha 2026-10-21. Pasos hechos por el humano; verificados por DevOps solo en lectura.

## Pasos hechos
1. Proyecto Supabase **Free** `rmokypmznhobapyghfpi` (nombre `agendaclasesapp`, org «agendaclasesapp's Org»), región **sa-east-1**. URL `https://rmokypmznhobapyghfpi.supabase.co`. Data API activa; exposición automática de tablas y RLS automático desactivados.
2. Secretos de Edge Functions cargados: `GMAIL_USER`, `GMAIL_APP_PASSWORD` (contraseña de aplicación de la cuenta dedicada) y `MAIL_SECRETO`. Sin `SMTP_*`: la función usa Gmail 465.
3. La CLI (`supabase@2.121.0`) tiene sesión.

## Verificación (solo lectura)
- `npx --yes supabase@2.121.0 projects list -o json` -> `rmokypmznhobapyghfpi`, región `sa-east-1`, estado `ACTIVE_HEALTHY`.
- `npx --yes supabase@2.121.0 secrets list --project-ref rmokypmznhobapyghfpi` (el campo `value` es el digest SHA-256, no el secreto):

| Nombre | Digest (sha256) | updated_at |
| --- | --- | --- |
| GMAIL_APP_PASSWORD | 670e13de93dcff785fe8db43e121f0532e0046766b27a913a96288556999d9ec | 2026-10-21T21:03:14Z |
| GMAIL_USER | b74d7bc097d5f16fae7454f49fc478ddee562bf86c44be99f79895951cecf897 | 2026-10-21T21:02:36Z |
| MAIL_SECRETO | c5225e825674db26c3a87fc3eaae87d2275458618aa1fa3487ae2c5a1b949a39 | 2026-10-21T21:03:48Z |

- Para comprobar un valor sin verlo: `printf %s "<valor>" | sha256sum` debe dar el digest de la tabla.
- `projects api-keys` lista claves `anon` y `service_role` (legacy) y `publishable` y `secret` (nuevas). El proyecto tiene las nuevas, así que la función puede no recibir `SUPABASE_SERVICE_ROLE_KEY` (a verificar en la prueba de nube de S01).

## Notas para B01 (`supabase-deploy.yml`, environment `produccion`)
- Secretos del environment `produccion` en GitHub: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` (= `rmokypmznhobapyghfpi`). Los secretos de la función (`GMAIL_*`, `MAIL_SECRETO`) viven en Supabase, no en GitHub; si el pipeline los gestiona, se pasan con `secrets set --env-file` desde secretos del environment, nunca versionados.
- El workflow no debe cambiar secretos a ciegas: `secrets list` previo y comparación de nombres.
- `functions deploy enviar-mail --no-verify-jwt` (o `[functions.enviar-mail] verify_jwt = false` en config.toml).
- Free pausa el proyecto tras 7 días sin actividad: el runbook debe decir cómo reactivarlo.
