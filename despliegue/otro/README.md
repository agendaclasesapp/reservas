# Despliegue en GitHub Pages + Supabase Free (entornos qa y prod)

Plantillas para el equipo técnico del cliente (NFR-09, spec §8). La solución no corre en contenedores en el
ambiente del cliente: la web es estática (GitHub Pages) y el backend es un proyecto Supabase Free (Postgres, Auth y
la Edge Function `enviar-mail`). No hay manifiestos de Kubernetes ni compose de producción: lo que se despliega son
migraciones, una función, la configuración de Auth y los archivos estáticos. Todo lo que depende de su ambiente es
`${NOMBRE_EN_MAYUSCULAS}` y está en [`PLACEHOLDERS.md`](PLACEHOLDERS.md). Este documento no contiene secretos.

## Qué se despliega y con qué

| Pieza | Dónde vive | Cómo se despliega | Workflow |
| --- | --- | --- | --- |
| Web (Vite, React 19, Node 22) | GitHub Pages, `https://${GH_USUARIO}.github.io/${GH_REPOSITORIO}/` | push a `main` (lint, pruebas, build y `actions/deploy-pages`) | `.github/workflows/web.yml` |
| Base (migraciones) | Supabase, `supabase/migrations/` | `db push` con dry-run y respaldo del esquema | `.github/workflows/supabase-deploy.yml` (manual) |
| Función `enviar-mail` | Supabase Edge Functions | `functions deploy enviar-mail --no-verify-jwt --use-api` (sin Docker) | `supabase-deploy.yml` |
| Configuración de Auth | Supabase, `supabase/config.toml` | `config push` detrás de la guardia de `config diff --output-format json` (ADR-012) | `supabase-deploy.yml` |
| Mantenimiento | GitHub Actions | consulta mínima cada 3 días para que el proyecto Free no se pause | `.github/workflows/keepalive.yml` |

La Supabase CLI se fija en `supabase@2.121.0` (variable `SUPABASE_CLI` del workflow); no se usa `latest`.

## Entornos

| Entorno | Proyecto Supabase | Web | Environment de GitHub |
| --- | --- | --- | --- |
| prod | un proyecto Free (`${PROD_SUPABASE_PROJECT_REF}`) | `${PROD_SITIO_URL}` | `produccion` (con revisor obligatorio) |
| qa | un segundo proyecto Free (`${QA_SUPABASE_PROJECT_REF}`), con datos sintéticos | `${QA_SITIO_URL}` | `${QA_GH_ENVIRONMENT}` (a crear) |

El repositorio hoy solo trae el environment `produccion`: `supabase-deploy.yml` lo tiene fijo y no recibe
entradas. Para qa hay dos caminos y los decide el cliente: (a) un segundo repositorio o fork con el mismo código y
sus propias variables, que no cambia ningún workflow; o (b) parametrizar el workflow por environment, que es un
cambio del repositorio y pasa por pull request. Plan Free: dos proyectos caben, pero cada uno se pausa tras 7 días
sin actividad si no corre `keepalive.yml`.

## Variables y secretos por nombre

Todo se carga en GitHub (Settings, Environments) o en Supabase; ninguno se versiona. Los valores los tiene el
cliente; aquí solo van los nombres. Hay un set por entorno.

**Variables del environment de GitHub (no secretas):**

| Nombre | Para qué | Dónde se lee |
| --- | --- | --- |
| `SUPABASE_PROJECT_REF` | referencia del proyecto Supabase del entorno | `supabase-deploy.yml` |
| `RTC_SITE_URL` | URL pública del sitio (Auth `site_url`) | `supabase-deploy.yml`, `config.toml` |
| `RTC_REDIRECT_URL` | URL de retorno de Auth | `supabase-deploy.yml`, `config.toml` |
| `RTC_GOOGLE_CLIENT_ID` | client id de OAuth de Google | `supabase-deploy.yml`, `config.toml` |
| `VITE_SUPABASE_URL` | URL del proyecto, pública, compilada en la web | `web.yml`, `keepalive.yml` |
| `VITE_SUPABASE_ANON_KEY` | clave pública (anon/publishable), compilada en la web | `web.yml`, `keepalive.yml` |
| `VITE_TURNSTILE_SITEKEY` | sitekey pública de Turnstile (sin ella se publica la de prueba) | `web.yml` |
| `VITE_BASE` | base de rutas de Vite (nombre del repositorio) | `web.yml` |

**Secretos de GitHub (environment):** `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`.

**Secretos que se cargan en Supabase, no en GitHub** (`supabase secrets set`, `ops/mails.md`; el workflow solo
verifica que existan por nombre): `GMAIL_USER`, `GMAIL_APP_PASSWORD` (sin espacios), `MAIL_SECRETO`.

**Secretos que se cargan a mano en el panel de Supabase** (la CLI no los empuja; el workflow los deja vacíos a
propósito, H-022 y ADR-016): el secreto de OAuth de Google (`RTC_GOOGLE_SECRET`) y la clave secreta de Turnstile
(`RTC_TURNSTILE_SECRET`). Con el secreto de prueba de Turnstile el workflow se detiene (H-181).

El administrador inicial es un ajuste del despliegue (`${ADMIN_EMAIL}`); ver `ops/puesta-en-marcha.md`.

## Pasos

1. Crear el proyecto Supabase Free del entorno y anotar `${PROD_SUPABASE_PROJECT_REF}` o `${QA_SUPABASE_PROJECT_REF}`.
2. Crear en GitHub el environment del entorno y cargar variables y secretos de la sección anterior.
3. Cargar los secretos de Supabase y los del panel (Google, Turnstile, SMTP de Gmail); ver `ops/mails.md` y `ops/auth.md`.
4. Activar GitHub Pages con origen "GitHub Actions" y publicar la web con un push a `main` (`web.yml`).
5. Lanzar `supabase-deploy` a mano; el revisor del environment lo aprueba. Revisar en el resumen del job las
   migraciones del dry-run y el diff de configuración antes de aprobar.
6. Humo: abrir `${PROD_SITIO_URL}#/p/<slug>`, ingresar y probar el envío de un mail.
7. Con migraciones de varios tramos, seguir [`tramos-prod.md`](tramos-prod.md): el orden y las etiquetas no se alteran.

## Orden de arranque y espera

Orden fijo del workflow: enlazar, `db push` (dry-run y respaldo del esquema), aplicar, función, verificar secretos,
diff y guardia, `config push`, re-diff. La web no depende de que el backend esté desplegado para publicarse, pero sin
las migraciones no funciona: desplegar primero Supabase y después confirmar la web.

## Vuelta atrás

- Web: volver a ejecutar `web.yml` sobre el commit anterior.
- Base: cada despliegue guarda el artefacto `esquema-previo` (solo estructura); las migraciones inversas del tramo
  de varios profesores están en `ops/vuelta-atras/` y el dump previo es el último recurso.
- Datos: respaldo previo fuera del repositorio (`ops/migracion-multiprofesor.md` §2). El plan Free no ofrece
  restauración de respaldos propia: hay que hacerlos antes de cada tramo.

## Qué queda del lado del cliente

Cuentas de GitHub y Supabase, dominio (si no usan `github.io`), proyecto OAuth de Google, cuenta Gmail dedicada con
contraseña de aplicación, sitekey y secreto de Turnstile, y el respaldo fuera del repositorio. Operación diaria:
`ops/` (`puesta-en-marcha.md`, `rotacion.md`, `incidentes.md`).
