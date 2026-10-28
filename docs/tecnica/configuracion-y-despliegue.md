---
titulo: Técnica · Configuración, despliegue y operación local
version: 0.5
fecha: 2026-10-26
publico: equipo técnico, operación
---
# Configuración, despliegue y operación local

> Estado: **diseñado y medido en spikes; la base de B01 ya está construida (ver `plataforma.md`)** (S01, S02, S03; código descartable en `spikes/`). El producto en sí todavía no está construido: lo que sigue es lo que los spikes comprobaron y los ADR dejaron fijado para B01 en adelante. Ningún valor secreto aparece en este documento ni debe aparecer en el repositorio (NFR-02).

## 1. Entornos

| Entorno | Qué es | Fuente |
| --- | --- | --- |
| Local | Supabase CLI 2.x con Docker (`supabase start`, `supabase db reset`) | ADR-012, DEC-17 |
| CI | Mismo stack local dentro de GitHub Actions (job `bd`) | ADR-012, DEC-17 |
| Producción | Proyecto Supabase Free y web en GitHub Pages: `https://agendaclasesapp.github.io/reservas/` | DEC-14, DEC-15 |

No hay entorno `qa` separado (DEC-17: local y CI). El sitio vive en un usuario/organización dedicado (`agendaclasesapp`), por lo que el origen de Pages no se comparte con otros sitios (DEC-14). Spikes medidos con Supabase CLI 2.121, Postgres 17 y supabase-js 2.118 (`spikes/S02/resultado.md`, `spikes/S03/resultado.md`).

## 2. Extensiones y base

btree_gist, pg_cron y pg_net se crean en el stack local sin plan B (S03; `spikes/S03/resultado.md`). La exclusión que impide dos reservas pendientes o confirmadas en un mismo hueco rechazó con `23P01` a 9 de 10 inserciones simultáneas (RES-01, ADR-002). La agenda de un día (`agenda_publica`) midió un p95 de 7,8 ms en local, también con 10 veces más filas (ADR-006; criterio de NFR-04, a medir en B13).

## 3. Correo en local y CI (S01)

- La Edge Function `enviar-mail` envía con `nodemailer` y TLS implícito a `smtp.gmail.com:465` en producción (ADR-005).
- En local y CI el SMTP es el buzón de prueba de Supabase: host `inbucket`, puerto `1025`, **sin TLS** (`SMTP_HOST`, `SMTP_PORT`, `SMTP_TLS=false`). Los nombres de contenedor del tipo `supabase_inbucket_<id>` no resuelven en el edge runtime; hay que usar el alias `inbucket` (`spikes/S01/resultado.md`).
- El disparo del trigger (pg_net) llama a la función desde la base: URL local `http://kong:8000/functions/v1/enviar-mail`. No se usa `host.docker.internal` porque solo existe con Docker Desktop. La URL y el secreto del disparo se guardan en Vault (`url_funcion_mail`, `mail_secreto`): el trigger y `barrer_mails` son iguales en todos los entornos. Sin esos valores el trigger no llama y la fila queda `pendiente` (ADR-005, «Ajustes tras S01»).
- En producción la URL es `https://<ref>.supabase.co/functions/v1/enviar-mail`, cargada **a mano** en Vault; nunca por migración ni `seed.sql` (ADR-012).
- **Firma (H-130, ADR-005):** el disparo no manda el secreto: lleva `x-mail-ts` y `x-mail-firma` (HMAC-SHA256 con `MAIL_SECRETO` de `<ts>.<cuerpo>`); 401 si falta, no coincide o `ts` está a más de 300 s. **La migración `202611001150` y la función `enviar-mail` se despliegan juntas:** con una sola, las llamadas dan 401 y las filas quedan `pendiente` hasta que el barrido (5 min) las vuelve a disparar con las dos ya desplegadas.
- El disparo lleva solo los `ids` de las filas; destinatario, asunto y cuerpo no viajan por `pg_net` y el motivo del fallo queda solo en `mail_salida.motivo_fallo` (SEC-17).
- Tiempos: tope de 15 s por mail y 100 s por llamada; una fila `enviando` de más de 10 minutos pasa a `fallido` con motivo `SIN_CONFIRMACION`, sin reintento (DEC-10 b).
- Tope de mails (AVI-08, CR-001): sobre 20 por hora o 200 por día la fila nace `fallido` con motivo `TOPE` y la operación sigue.

## 4. Secretos

| Secreto | Dónde vive | Cómo se carga |
| --- | --- | --- |
| `url_sitio` (opcional) | Vault de Supabase: dirección del sitio publicado, para el enlace completo del mail de alta de un profesor (B15, ADM-02) | A mano, por quien opera (`ops/mails.md`, `ops/puesta-en-marcha.md`); sin él el mail trae solo `#/p/<slug>` |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `MAIL_SECRETO` | Secretos de Edge Functions y Vault de Supabase | A mano, por quien opera (`ops/mails.md`) |
| Secreto OAuth de Google | Panel de Supabase Auth | A mano; no se declara en `config.toml` |
| SMTP de Auth | Panel de Supabase Auth | A mano; el límite `rate_limit.email_sent` también se fija y verifica en el panel (`ops/auth.md`) |
| Clave secreta del CAPTCHA (Turnstile) | Panel de Supabase | A mano (CR-001, T04.3; `ops/auth.md`, `ops/mails.md`); la clave pública es la variable del repositorio `VITE_TURNSTILE_SITEKEY` |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` | Secretos de GitHub | Para `supabase-deploy.yml` |

Reglas: la contraseña de aplicación de Gmail se carga **sin espacios** y se verifica sin verla, comparando el SHA-256 del valor con el digest que muestra `secrets list` (H-018, ADR-012). La cuenta de envío es la dedicada de DEC-15. Los valores locales van en `supabase/.env.development` (versionado, solo valores ficticios o `127.0.0.1`) y **nunca** en `supabase/.env`; `.env*` está en `.gitignore` salvo esa excepción (ADR-012).

## 5. Despliegue (`supabase-deploy.yml`, manual)

Pasos: `supabase link`, `db push`, despliegue de la función, `config push` (environment `produccion` con revisor requerido).

- **Función sin Docker:** `supabase functions deploy enviar-mail --project-ref <ref> --no-verify-jwt --use-api`. El workflow no carga secretos de la función: hace `secrets list` y falla si falta `GMAIL_USER`, `GMAIL_APP_PASSWORD` o `MAIL_SECRETO`.
- **Conexión a la base del proyecto:** por el pooler de sesión `aws-1-sa-east-1.pooler.supabase.com:5432`, usuario `postgres.<ref>`. El host directo es solo IPv6 y el pooler `aws-0` no conoce el proyecto (S01). El host va como variable del environment.
- **Guardia de `config push`** (S02, H-005, H-022): la CLI 2.121 manda la sección entera y cambia todo lo que `config.toml` no declare igual que el proyecto; una variable `env()` sin definir se empuja como el literal `env(...)`. Por eso el workflow define `RTC_SITE_URL`, `RTC_REDIRECT_URL` y `RTC_GOOGLE_CLIENT_ID` (variables del environment) y deja `RTC_GOOGLE_SECRET` vacía. Antes del push corre `scripts/seguridad/guardia-config.mjs`, que ejecuta `config diff -o json` y falla si la salida contiene `127.0.0.1` o `env(`, o si trae un `update` de un campo fuera de `scripts/seguridad/config-permitida.json`; el diff queda en el resumen del job para el revisor.
- `config.toml` iguala a los valores del proyecto los campos que no son de la app (pooler, `storage.vector`, MFA TOTP). `[auth.captcha]` ya está declarado (CR-001). El guardia usa `config diff --output-format json`. Resto de la plataforma: `plataforma.md`.
- **Guía para el equipo del cliente (B07, H-024):** `despliegue/otro/README.md` explica el despliegue en GitHub Pages y Supabase Free para un ambiente propio, con `PLACEHOLDERS.md` (lo que depende de su ambiente) y `tramos-prod.md`; no contiene secretos.
- Los jobs `recordatorios` y `retencion` de pg_cron se programan con la migración `202611001107` y se revisan cada semana según `ops/operacion.md` (ver `solicitudes-gestion-y-retencion-b07-b11.md` §5).
- El workflow no escribe `supabase/.env` ni ningún `.env*`; `npm run build` en CI corre sin `.env.local`.

## 6. Ingreso (S02)

- Google vuelve a la raíz del sitio con `?code=...` en la query; no hay ruta de callback. Antes de crear el router, `iniciarSesion()` canjea el código con `exchangeCodeForSession` explícito (`detectSessionInUrl: false`), limpia la query y restaura la ruta guardada (ADR-007).
- Al abrir con una sesión guardada, se valida con `getUser()` (va al servidor); si el usuario ya no existe, se cierra la sesión local y la app sigue como visitante (H-020).
- Con `enable_confirmations = true`, Google y el código confirman al usuario en un `UPDATE` posterior al insert; el rol se asigna entonces (ADR-007). Las fixtures que insertan en `auth.users` dejan los campos de token en `''`.
- Errores del código: ver `funcional/alumnos-y-cuentas.md` (403 `otp_expired` indistinguible; reenvío antes de 60 s da 429).
- Rutas de la SPA (ADR-007): `#/` agenda, `#/ingreso`, `#/ficha`, `#/solicitud`, `#/mis-clases`, `#/panel`, `#/lista`, `#/configuracion`.

## 7. Web: carga de la ruta de agenda (S03)

La agenda pública se lee con `@supabase/postgrest-js` (clave anon, sin sesión) y `supabase-js` se carga diferido con `import()` en paralelo. Medido: ruta de agenda 146,9 kB gzip frente a 198,8 kB con supabase-js completo; presupuesto ≤ 200 kB, que se mide en B13 con `spikes/S03/app/medir-bundle.mjs` (ADR-017).

## Bitácora de versiones

| Versión | Fecha | Bolt | IDs | Cambio |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-10-21 | construcción (hito spikes S01-S03 y CR-001) | ADR-005, 006, 007, 012, 017, DEC-14, DEC-15, DEC-17, CR-001, H-018, H-020, H-022 | Primera versión: lo medido en los spikes y lo fijado en los ADR |
| 0.2 | 2026-10-21 | B01 y B04 (parte documental de T04.3) | ADR-012, ADR-016, DEC-13 | `[auth.captcha]` declarado, secreto de Turnstile a mano, variable `VITE_TURNSTILE_SITEKEY`, guardia con salida JSON; enlaces a `ops/` |
| 0.3 | 2026-10-23 | B15 | ADM-02 | Secreto opcional `url_sitio` |
| 0.4 | 2026-10-23 | B07, B11 | NFR-09, ADR-008, SEC-28 | Enlace a la guía de despliegue del cliente; jobs de retención y recordatorios |
| 0.5 | 2026-10-26 | B03 | H-130, ADR-005 | Firma HMAC del disparo y despliegue conjunto de migración y función |
