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
digest con `mails.md`. Vault de producción (`url_funcion_mail`, `mail_secreto` y `url_sitio`) se carga a mano, nunca por
migración ni `seed.sql`. `url_sitio` es la dirección del sitio publicado (enlace del mail de alta del profesor,
ADM-02) y se carga **antes del alta de profesores en `#/admin`** (§7b):

    select vault.create_secret('https://agendaclasesapp.github.io/reservas/', 'url_sitio');

Detalle y actualización: `mails.md`.

## 6. Primer `supabase-deploy`
Actions > supabase-deploy > Run workflow; apruébalo como revisor del environment (la aprobación es previa al job: el
`db push --dry-run` se mira antes, en local, desde el mismo árbol; el del workflow queda como evidencia) tras mirar el
`db push --dry-run` y el diff de configuración del resumen. Aplica migraciones (crea `public.ping` y la fila
única de `profesor`), despliega la función si existe y empuja la configuración de Auth.
**No corras `supabase config push` a mano (H-181):** la CLI carga `supabase/.env.development` con el secreto de
PRUEBA de Turnstile y lo mandaría a producción, anulando el CAPTCHA. Solo `supabase-deploy`. Tras activar el
CAPTCHA, verifica que un pedido de código con el token dummy sea rechazado (`ops/auth.md`, paso 6b).
Hasta este paso `keepalive` falla con PGRST202 (H-025); CA-40 depende de él.

## 7. Alta del Administrador y de los profesores (ADM-01, ADR-018), antes de su primer ingreso
En el SQL Editor del panel de Supabase, o por `psql` con la cadena del pooler de sesión. Primero el Administrador:

    select privado.configurar_administrador('<mail del Administrador>');

Hay una sola fila (otro mail reemplaza al anterior); falla con 409 `MAIL_YA_REGISTRADO` si el mail es el de una persona
con ficha completa. Los profesores los da de alta el Administrador en `#/admin` (B15). **Hasta B15** los da de alta el
operador, con tres argumentos (devuelve el id):

    select privado.configurar_profesor('<mail del profesor>', '<nombre>', '<slug>');

Los mails y el nombre no se escriben en el repositorio, en variables de GitHub ni en logs de Actions.
Es idempotente. Si falla por «otro user_id», la fila ya está vinculada a otra cuenta: no la fuerces.
Instalación que viene de B01 a B05 con un profesor ya configurado: `ops/migracion-multiprofesor.md`.

## 7b. Alta del profesor actual y contracción (B15, ADM-01, ADM-02; ADR-021)
Con la expansión de B14 desplegada y el humo en verde (`migracion-multiprofesor.md` §3 y §4), en este orden:

1. Cargar `url_sitio` en Vault (§5).
2. Migraciones `202611000526`, `0530` y `0531` desde la etiqueta `prod-b15a` (el dry-run lista exactamente esas tres).
3. Leer el mail de la fila provisional (`migracion-multiprofesor.md` §5.1 paso 3). El Administrador ingresa y en `#/admin`
   da de alta al profesor actual con ese mail, nombre y **slug definitivo** (adopta la fila de slug provisional,
   `adoptado: true`; con `adoptado: false` parar e inactivar el profesor nuevo; el enlace provisional deja de valer: avisar antes).
4. Humo con el slug nuevo y contracción `202611000539` desde `prod-b15b`: `migracion-multiprofesor.md` §5.1 y §5.2. Solo
   con la web de B14 publicada y el humo en verde, y **siempre antes de cualquier migración `2026110006*`** (B06, etiqueta
   `prod-b06`): `db push` va sin `--include-all`. Desde la contracción `inversa-b14.sql` no sirve: solo el dump.

## 8. Keepalive
Actions > keepalive > Run workflow (manual). Debe quedar en verde y el workflow se re-habilita solo
(`state: active`). Luego corre cada 3 días y evita la pausa del plan Free tras 7 días sin actividad.
Si el proyecto se pausó: panel de Supabase > Restore project, y vuelve a lanzar keepalive.

## 9. Verificación tras el primer push
Run de `web.yml` en verde, job `verificar-publicado` en verde, `keepalive` activo y `ops/verificar-repo.md`.
- [ ] Pendiente (H-358): `show cron.use_background_workers;` devuelve `off` en el proyecto alojado (`ops/operacion.md` §1).
