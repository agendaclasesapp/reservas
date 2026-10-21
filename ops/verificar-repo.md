# Verificar la configuración del repositorio (SEC-20 a SEC-23, SEC-30)

Requiere `gh` autenticado con permiso de administración. Solo lectura. Repo: `agendaclasesapp/reservas`.

    R=agendaclasesapp/reservas
    gh api repos/$R --jq '.visibility, .security_and_analysis'
    gh api repos/$R/rulesets --jq '.[] | {id,name,enforcement}'
    gh api repos/$R/rulesets/<id> --jq '.rules[] | select(.type=="required_status_checks") | .parameters.required_status_checks[].context'
    gh api repos/$R/pages --jq '{build_type, html_url}'
    gh api repos/$R/environments/produccion --jq '.protection_rules'
    gh api repos/$R/actions/permissions/workflow --jq .default_workflow_permissions
    gh api repos/$R/actions/workflows/keepalive.yml --jq .state
    gh variable list -R $R
    gh secret list -R $R
    gh secret list -R $R --env produccion

## Resultado esperado
- `visibility` public; `secret_scanning` y `secret_scanning_push_protection` = enabled.
- Ruleset de `main` activo con checks `secretos`, `calidad`, `bd`, `workflows`, `codeql` y bloqueo de
  alertas de code scanning altas o críticas.
- Pages: `build_type` = `workflow`.
- Environment `produccion` con regla `required_reviewers`.
- Permiso por defecto del token: `read`.
- `keepalive.yml`: `active`.
- Variables: `SUPABASE_PROJECT_REF`, `RTC_SITE_URL`, `RTC_REDIRECT_URL`, `RTC_GOOGLE_CLIENT_ID`.
- Secretos: solo `SUPABASE_ACCESS_TOKEN` y `SUPABASE_DB_PASSWORD`. Ninguno llamado `GMAIL_*`, `MAIL_SECRETO`,
  `SERVICE_ROLE` ni `GOOGLE_SECRET`.
Lo que no coincida se corrige en GitHub y se anota en el checklist de `operacion/` (SEC-30).
