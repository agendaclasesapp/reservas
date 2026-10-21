#!/usr/bin/env bash
# Spike S01: utilidades locales. Uso: bash s01.sh <preparar|vault|psql "SQL"|mailpit>
# No escribe secretos reales: el MAIL_SECRETO local es aleatorio y vive en supabase/.env
# (no versionado); GMAIL_USER local es una casilla ficticia.
set -euo pipefail
cd "$(dirname "$0")"
PROYECTO=rtc-s01
DB="supabase_db_${PROYECTO}"
MAILPIT_API="http://127.0.0.1:55424/api/v1"
# URL de la funcion vista desde el contenedor de la base (resultado del spike).
URL_LOCAL="${URL_LOCAL:-http://kong:8000/functions/v1/enviar-mail}"

psql_db() { docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At "$@"; }

case "${1:-}" in
  preparar)
    # Genera supabase/.env para el edge runtime local (SMTP de Mailpit, sin AUTH).
    secreto=$(od -An -tx1 -N32 /dev/urandom | tr -d ' \n')
    cat > supabase/.env <<EOF
GMAIL_USER=profesor.prueba@example.com
GMAIL_APP_PASSWORD=
MAIL_SECRETO=${secreto}
SMTP_HOST=inbucket
SMTP_PORT=1025
SMTP_TLS=false
EOF
    echo "supabase/.env generado (MAIL_SECRETO aleatorio de 64 hex)"
    ;;
  vault)
    # Copia MAIL_SECRETO y la URL local a Vault (idempotente).
    secreto=$(grep '^MAIL_SECRETO=' supabase/.env | cut -d= -f2-)
    psql_db <<SQL
select vault.create_secret('${secreto}', 'mail_secreto')
  where not exists (select 1 from vault.secrets where name = 'mail_secreto');
select vault.update_secret(id, '${secreto}') from vault.secrets where name = 'mail_secreto';
select vault.create_secret('${URL_LOCAL}', 'url_funcion_mail')
  where not exists (select 1 from vault.secrets where name = 'url_funcion_mail');
select vault.update_secret(id, '${URL_LOCAL}') from vault.secrets where name = 'url_funcion_mail';
SQL
    echo "Vault: mail_secreto y url_funcion_mail=${URL_LOCAL}"
    ;;
  psql)
    shift; psql_db -c "$*"
    ;;
  mailpit)
    curl -s "${MAILPIT_API}/messages?limit=5"
    ;;
  *)
    echo "uso: bash s01.sh <preparar|vault|psql \"SQL\"|mailpit>" >&2; exit 2
    ;;
esac
