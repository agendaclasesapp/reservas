# Puesta en marcha (NFR-02, ADR-012, ADR-015, H-025)

Sin valores secretos en este documento. Orden obligatorio: cada paso depende del anterior.
Responsable de los pasos 1 a 6: el humano (la API de GitHub no estaba disponible para DevOps).

## 1. Environment `produccion`
Repo `agendaclasesapp/reservas` > Settings > Environments > New environment `produccion`, con
Required reviewers (tú).

## 2. Secretos de GitHub (del environment `produccion`)
- `SUPABASE_ACCESS_TOKEN`: token personal de Supabase (Account > Access Tokens).
- `SUPABASE_DB_PASSWORD`: contraseña de la base del proyecto.
No cargues `GMAIL_*`, `MAIL_SECRETO` ni el secreto de Google en GitHub: viven en Supabase (`mails.md`, `auth.md`).

## 3. Variables del repositorio o del environment
- `SUPABASE_PROJECT_REF` = `rmokypmznhobapyghfpi`
- `RTC_SITE_URL` = `https://agendaclasesapp.github.io/reservas/`
- `RTC_REDIRECT_URL` = `https://agendaclasesapp.github.io/reservas/`
- `RTC_GOOGLE_CLIENT_ID` = el Client ID del panel de Google Cloud (no es secreto)
- Opcional: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (clave publicable `sb_publishable_...`, pública);
  si faltan, web.yml usa los valores públicos versionados.
- Host del pooler de sesión: `aws-1-sa-east-1.pooler.supabase.com:5432`.
Revisa con `node scripts/seguridad/revisar-variables.mjs .`.

## 4. GitHub Pages, ruleset y escaneo
- Settings > Pages > Source: **GitHub Actions**.
- Ruleset de `main`: checks requeridos `secretos`, `calidad`, `bd`, `workflows`, `codeql`; bloquear force
  push; las alertas de code scanning altas o críticas bloquean.
- Settings > Code security: secret scanning y push protection activados; alertas de Dependabot activadas.
Comprobación en `verificar-repo.md`.

## 5. Secretos de la función y Vault (a mano, ADR-012)
`GMAIL_USER`, `GMAIL_APP_PASSWORD` (sin espacios) y `MAIL_SECRETO` ya están cargados (S01). Verifica nombres y
digest con `mails.md`. Vault de producción (`url_funcion_mail`, `mail_secreto`) se carga a mano, nunca por
migración ni `seed.sql`.

## 6. Primer `supabase-deploy`
Actions > supabase-deploy > Run workflow; apruébalo como revisor del environment tras mirar el
`db push --dry-run` y el diff de configuración del resumen. Aplica migraciones (crea `public.ping` y la fila
única de `profesor`), despliega la función si existe y empuja la configuración de Auth.
Hasta este paso `keepalive` falla con PGRST202 (H-025); CA-40 depende de él.

## 7. Alta del profesor (ADR-015), antes de su primer ingreso
En el SQL Editor del panel de Supabase, o por `psql` con la cadena del pooler de sesión:

    select privado.configurar_profesor('<mail del profesor>', '<nombre>');

El mail y el nombre no se escriben en el repositorio, en variables de GitHub ni en logs de Actions.
Es idempotente. Si falla por «otro user_id», la fila ya está vinculada a otra cuenta: no la fuerces.

## 8. Keepalive
Actions > keepalive > Run workflow (manual). Debe quedar en verde y el workflow se re-habilita solo
(`state: active`). Luego corre cada 3 días y evita la pausa del plan Free tras 7 días sin actividad.
Si el proyecto se pausó: panel de Supabase > Restore project, y vuelve a lanzar keepalive.

## 9. Verificación tras el primer push
Run de `web.yml` en verde, job `verificar-publicado` en verde, `keepalive` activo y `ops/verificar-repo.md`.
