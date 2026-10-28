---
titulo: Técnica · Plataforma (B01)
version: 0.7
fecha: 2026-10-28
publico: equipo técnico
---
# Plataforma (B01)

> Estado: **construido y verificado en B01** (humo en chromium, pruebas de ingreso por código y pipeline). Lo que dependa de bolts posteriores no está aquí. Sin valores secretos: los únicos valores que aparecen son los públicos de prueba de Cloudflare y los locales del stack.

## 1. Estructura del repositorio

| Ruta | Contenido | Fuente |
| --- | --- | --- |
| `src/modulos/<m>/vistas/Pagina.tsx`, `logica/` | Un módulo por pantalla: agenda, ingreso, ficha, solicitud, mis-clases, panel, lista, configuracion. `rutas.tsx` importa cada `Pagina` como `default`; ux-web la completa sin tocar `rutas.tsx`. El título de la ruta va en `handle.titulo` y lo publica `Layout` | `handoff-developer-T01.1` |
| `src/lib/` | `supabase.ts` (`cargarSupabase()`), `rest.ts` (`rest()`), `errores.ts` (`mensajeDeError()`, `traducirError()`), `env.ts`, `csp.ts`, `base.ts`, `fechas.ts` | ADR-017, `componentes.md` §5 |
| `src/ui/` | Componentes compartidos y tokens (sección 5) | `ux/web/componentes.md` |
| `supabase/migrations/`, `supabase/functions/enviar-mail/`, `supabase/tests/`, `supabase/seed.sql`, `supabase/config.toml` | Base, Edge Function, pruebas pgTAP, datos de desarrollo y configuración | ADR-012 |
| `tests/unit`, `tests/integracion`, `tests/e2e`, `tests/soporte` | Suites y utilidades (reloj de prueba, correo, entorno) | `onboarding.md` §4 |
| `scripts/seguridad/` | Controles del pipeline (sección 3) | `operacion/pipeline.md` |
| `.github/workflows/` | `web.yml`, `e2e.yml`, `supabase-deploy.yml`, `keepalive.yml` | `operacion/pipeline.md` |
| `ops/` | Guías de operación y producción | se enlaza, no se copia |

Decisión de carga: `supabase-js` se pide solo con `cargarSupabase()` y la agenda pública usa `rest()` (ADR-017). Los errores de RPC se muestran con `mensajeDeError()` o `traducirError()`.

## 2. Scripts npm

| Script | Qué hace |
| --- | --- |
| `dev` | Servidor de desarrollo de Vite en `127.0.0.1:5173`. Quita la CSP (React Refresh necesita un script en línea) |
| `build` | Compila. Exige `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`; sin ellas falla con un mensaje claro |
| `preview` | Sirve lo compilado en `127.0.0.1:5173` con la CSP real |
| `lint` | ESLint con cero advertencias |
| `typecheck` | `tsc --noEmit` y también `tsconfig.node.json` (archivos de configuración) |
| `test:unit` | Vitest con cobertura |
| `test:integracion` | Vitest en node contra el stack local, un solo proceso |
| `test:bd` | pgTAP con `supabase test db` |
| `test:e2e` | Playwright (chromium) contra el bundle servido por `preview` |
| `seguridad:dist` | Escanea `dist/` (`scripts/seguridad/escanear-dist.mjs`) |

## 3. Pipeline y sus controles

Detalle por workflow en `.aidlc/reservatuclase/operacion/pipeline.md`; puesta en marcha en `ops/puesta-en-marcha.md`, comprobación del repositorio en `ops/verificar-repo.md`.

- `web.yml` (push a `main` y pull request): `secretos` (gitleaks sobre el historial), `calidad` (lint, typecheck, `test:unit`), `bd` (stack local, `db reset`, pgTAP, integración) y, solo en `main`, `publicar` (compila, escanea `dist/` y despliega a Pages). Un job rojo bloquea el merge y la publicación.
- `e2e.yml` (pull request y manual): stack local con buzón de prueba, `preview` y Playwright.
- `supabase-deploy.yml` (manual, environment `produccion` con revisor): `db push`, función y `config push` detrás del guardia (`configuracion-y-despliegue.md` §5). El guardia usa `config diff --output-format json` (ADR-012).
- `keepalive.yml`: llamada a `ping` cada 3 días (NFR-09).
- `escanear-dist` admite en `dist/` la clave publicable (`sb_publishable_`) y el JWT anon con el ref esperado; cualquier otra credencial se rechaza.
- Variables del repositorio: conviene cargar `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (la publicable) y `VITE_TURNSTILE_SITEKEY`. Mientras no existan, `web.yml` usa los valores públicos incluidos en el workflow (`PUBLICO_SUPABASE_URL`, `PUBLICO_SUPABASE_CLAVE`). Política general en `SECURITY.md`.

## 4. Sesión y retorno de Google (PKCE)

Como en `configuracion-y-despliegue.md` §6: el retorno llega a la raíz con `?code=`, `iniciarSesion()` lo canjea antes de crear el router y al abrir se valida la sesión guardada con `getUser()`. El ingreso por código de 6 dígitos quedó verificado en B01 con mails `@example.test` y el buzón local (SEC-12, SEC-13): no hay enlaces, el reenvío antes de 60 s da 429 y el mail conocido y el desconocido reciben la misma respuesta.

La base web es `/reservas/` en todos los entornos, también en local (`VITE_BASE`, opcional, por defecto `/reservas/`; ADR-007, DEC-14).

CSP (SEC-16): vive en `index.html`. Al compilar, `connect-src` toma el origen de `VITE_SUPABASE_URL` (https; http solo con `127.0.0.1` o `localhost`). Turnstile aparece solo en `script-src` y `frame-src`.

## 5. Componentes de UI compartidos (`src/ui/`)

Contratos completos en `.aidlc/reservatuclase/ux/web/componentes.md`; tokens en `ux/web/sistema-diseno.md` y `src/ui/tokens.css`.

| Id | Componente | Id | Componente |
| --- | --- | --- | --- |
| C-01 | Boton | C-08 | Cargando |
| C-02 | Campo | C-09 | Vacio |
| C-03 | CampoFecha | C-10 | ErrorCarga |
| C-04 | GrupoOpciones | C-11 | SinPermisos |
| C-05 | Dialogo | C-12 | Pestanas |
| C-06 | Alerta | C-13 | Navegacion |
| C-07 | Insignia | C-15 | AnuncioVivo |

`Layout` es el marco de página y publica el título de la ruta. En C-13 `usuario` es una unión (`{rol:'profesor'}` o `{rol:'alumno', estado}`) y admite `onSalir?`; C-11 recibe `destino` como `{texto, href}` y su encabezado es h1 «Sin permisos» (h2 con `nivel={2}`). Tokens agregados: `--c-error-hover`, `--c-sobre-error`, `--c-velo`, `--medida-minima` y los de tamaño de icono, foco y borde.

Humo verificado en chromium: las 8 rutas con `#` montan bajo `/reservas/` sin errores de consola, sin violaciones de CSP y sin peticiones externas; una ruta desconocida vuelve a `#/` (evidencia en `calidad/evidencias/ui/HUMO-01/`).

## 6. CAPTCHA con claves de prueba

El pedido de código lleva CAPTCHA de Turnstile (ADR-016, DEC-13). `[auth.captcha]` está declarado en `supabase/config.toml` y `signInWithOtp` envía `captchaToken` (contratos §5). En local y CI se usan las **claves de prueba públicas de Cloudflare** que ya trae `.env.example` (`VITE_TURNSTILE_SITEKEY` y `RTC_TURNSTILE_SECRET`; siempre pasan, solo para local y CI). En producción la clave secreta se carga a mano en el panel de Supabase y la pública va como variable del repositorio `VITE_TURNSTILE_SITEKEY`; pasos en `ops/auth.md` y `ops/mails.md`.

## 7. Puesta en marcha del profesor y RPC base

> Desde B14 (CR-002, ADR-018) el alta cambió, y desde B15 la contracción lo dejó así: el operador corre `select privado.configurar_administrador('<mail>');` y los demás profesores se dan de alta desde `#/admin` (`alta_profesor`). `privado.configurar_profesor('<mail>', '<nombre>', '<slug>')` (tres argumentos, devuelve el id; ADR-018) queda como herramienta del operador. `config_publica(p_slug)` y `agenda_publica(p_slug, p_dia)` reciben el slug; las versiones sin slug ya no existen (migración `202611000539`). Ver `varios-profesores-b14.md` y `ops/puesta-en-marcha.md`. Lo siguiente describe B01.

En B01, antes del primer ingreso del profesor se corría `select privado.configurar_profesor('<mail>', '<nombre>');` (`supabase/migrations/202611000104_rpc_base.sql`); esa firma de dos argumentos **ya no existe**: hoy son `configurar_profesor(mail, nombre, slug)` (ADR-018). Es idempotente; con un mail inválido o sin nombre devuelve 422 `DATOS_INVALIDOS`, y si la fila ya está vinculada a otro usuario, `PROFESOR_YA_VINCULADO` (código interno `PT409`; ADR-015). `config_publica(p_slug)` devuelve (en B01 era sin argumentos) `{zona_horaria, duracion_min, anticipacion_horas, horizonte_semanas}` más los campos de B14 y `ping()` la hora de la aplicación (`app_ahora`). `aprobar_cuenta` sobrescribe `motivo_estado` (contratos §3).

Los topes anti-abuso y el error `LIMITE_EXCEDIDO` están en ADR-016 y contratos §1, §3 y §5; `alumno.user_id` y `profesor.user_id` usan `on delete set null` con revinculación por mail (ADR-013).

**Secreto opcional `url_sitio` (B15).** El mail «Tu agenda en Agenda Clases App» que recibe el profesor dado de alta desde `#/admin` lleva su enlace completo solo si el operador cargó en Vault `url_sitio` (la dirección del sitio publicado, a mano; ADR-012). Sin el secreto el mail trae solo `#/p/<slug>`. Pasos en `ops/mails.md` y `ops/puesta-en-marcha.md`.

## 8. Procesos programados y su registro (B11)

Desde B11 los jobs `recordatorios` (cada 15 minutos) y `retencion` (03:30 UTC) están en `cron.job` y llaman a `call privado.correr_proceso('<nombre>')` (ADR-008). Cada corrida deja una fila en `privado.ejecucion_proceso` (nombre, ahora, inicio, fin, ok, error, cantidades); si falla queda `ok = false` con SQLSTATE y mensaje y `cron.job_run_details` la marca `failed` con `PROCESO_FALLIDO`. `barrer_mails` y `extender_series` siguen con `select privado.<fn>()`. La revisión semanal, el riesgo de una retención parada y la depuración manual de la tabla están en `ops/operacion.md`; el detalle técnico en `solicitudes-gestion-y-retencion-b07-b11.md` §5. Despliegue en un ambiente propio: `despliegue/otro/README.md`.

## 9. Accesibilidad y uso en celular (B12)

Todas las pantallas se verificaron contra WCAG 2.1 AA (NFR-05, CA-37) y a 360 x 740 px y por teclado (NFR-06, CA-38).

- **Componente `EnlaceAccion`** (`src/ui/EnlaceAccion.tsx`, exportado en `src/ui/index.ts`; H-404). Es un `<a>` con `display: inline-flex`, `align-items: center` y `min-block-size: var(--tactil-min)` (44 px, token de `src/ui/tokens.css`). Se usa para los enlaces que están solos en su renglón, no dentro de una oración: «Ver la agenda de {profesor}» en `#/ficha` y `#/mis-clases`, y «Ver la agenda» en Mis clases vacío. Los enlaces dentro de un texto quedan como están (excepción de WCAG 2.5.5).
- **Botón sin fundido de fondo.** `Boton.module.css` ya no anima `background-color`: axe medía el contraste a mitad de la transición y daba un falso positivo intermitente en «Pedir clase». Se pierde el fundido de 150 ms al pasar el puntero o al deshabilitarse.
- **Pruebas.** `tests/e2e/accesibilidad.spec.ts`: 38 pruebas, 61 estados auditados con axe (wcag2a, wcag2aa, wcag21a, wcag21aa), 0 violaciones, sin reglas desactivadas; incluye que cada hueco de la agenda dice su estado en texto y que no depende solo del color (`forced-colors`, escala de grises). `tests/e2e/celular.spec.ts`: 91 pruebas en 360 px; sin desplazamiento horizontal, todo control de al menos 44 x 44 px, recorrido con Tab con foco visible, y en los diálogos entrada y salida del foco con Enter y Escape. Evidencia en `calidad/evidencias/ui/WEB-A11Y-B12/` y `WEB-360-B12/`. Con `RTC_SIN_BUILD=1`, `RTC_REUSAR=1` y `RTC_CONSERVAR=1` se itera `celular.spec.ts` sin recompilar ni rehacer los datos.
- **No cubierto por las pruebas:** 320 px (zoom 400 %), espaciado de texto, lector de pantalla y adopción de un mail ya registrado en el alta de `#/admin`.
- **Pendiente del humano antes de G3:** verificación manual en Safari y Firefox (escritorio y móvil) de `#/`, `#/p/<slug>` con el diálogo «Pedir clase», `#/mis-clases`, `#/ficha`, `#/panel` con las acciones de un hueco, `#/configuracion` («Tu enlace») y `#/admin` (alta e Inactivar): foco visible, tamaño táctil y botón sin parpadeo de fondo; y prueba con lector de pantalla. Las pruebas automáticas corrieron solo en Chromium.
- **Entorno de pruebas (H-405, abierto):** si `turno.py` corta por tiempo, quedan procesos de Playwright y `vite preview` huérfanos contra la misma base y buzón y dan fallos falsos; esperar a que terminen antes de volver a correr.

Fuente: handoffs `handoff-tester-a11y.md`, `handoff-tester-celular.md`, `handoff-tester-2.md` y `handoff-ux-web.md` de B12.

## 10. Rendimiento de la agenda y cómo medirlo (B13)

NFR-04 y CA-36 piden que la agenda de un día se vea en menos de 2 s (p95) con el perfil 4G. Por **DEC-41**, «4G» es el preset **Fast 4G** de Chrome DevTools (9 Mbit/s de bajada, 165 ms de latencia); «Slow 4G» (1,6 Mbit/s, 562 ms) queda fuera del criterio y solo se mide como dato.

**Qué hace la carga de `#/p/<slug>` (T13.2, `src/modulos/agenda/logica/precarga.ts`, `src/main.tsx`):**
- Pide `config_publica` y `agenda_publica` **a la vez**, en lugar de una detrás de otra. Como la agenda necesita un día y el día sale de la configuración, usa el que se puede suponer sin ella: el de `?d=` si está entre hoy - 365 y hoy + 30 días, o si no hoy en el huso del navegador.
- Si con la configuración sale otro día, o el profesor está inactivo, o el enlace no es válido, esa respuesta se **descarta sin mostrarse** y se pide el día correcto. La pantalla nunca muestra datos de un día equivocado.
- Cuando la dirección inicial es `#/p/...`, `src/main.tsx` adelanta el código de la ruta y esas lecturas **antes de que se resuelva la sesión**, así no esperan a `supabase-js`.

**Resultado verificado** (PERF-05 y PERF-06; Chromium con CDP, stack local, bundle servido con gzip, sin TLS ni DNS reales):

| Medición | Antes de T13.2 | Después |
| --- | --- | --- |
| Agenda, Fast 4G, 40 cargas en frío (CA-36, umbral p95 2000 ms) | p95 1498 ms | p50 1121, p95 1168, máx 1183 ms, 0 % de errores |
| Agenda, Slow 4G, 30 cargas (informativo) | p95 4505 ms | p95 3453 ms |
| Peso de la ruta de agenda (T-NFR-10, tope 200 kB gzip) | 151,2 kB | 152,9 kB |
| CA-17 bajo carga (24 alumnos por hueco, 12 huecos) | 12 aceptadas, 276 `HUECO_NO_LIBRE`, sin doble reserva | no se repitió |

En producción el tiempo será algo mayor (TLS y DNS de Supabase). El panel del profesor con Fast 4G quedó en p95 2051 ms (informativo, no es requisito).

**Cómo repetir las mediciones** (carpeta `perf/`, necesita el stack local en marcha; los scripts escriben el formato de k6 pero no usan k6):

1. `node perf/preparar.mjs` crea los datos de prueba («PERF …»); al terminar, `node perf/preparar.mjs limpiar` los borra.
2. Compilar a una carpeta aparte: `VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=<anon> npx vite build --outDir perf/.dist --emptyOutDir --manifest`. `perf/servidor.mjs` sirve ese resultado con gzip, como GitHub Pages (`vite preview` no comprime).
3. `node perf/medir-agenda.mjs --ruta agenda --perfil fast4g --n 40 --salida <carpeta>` (también `--perfil slow4g` y `--ruta panel`).
4. `node perf/medir-bundle.mjs perf/.dist <json>` mide el peso; `node perf/cascada.mjs --perfil <p> --salida <md>` dibuja la cascada de carga; `node perf/concurrencia-ca17.mjs` prueba la concurrencia por hueco; `node perf/diagnostico-sql.mjs` muestra los planes EXPLAIN de las consultas.

La evidencia queda en `.aidlc/reservatuclase/calidad/evidencias/performance/PERF-nn/`. `perf/.gitignore` excluye `.dist`, `.estado` (lleva JWT locales) y `resultados`.

**Guardia `esLocal`.** Los scripts de `perf/` firman JWT con el secreto por defecto del stack local, y las pruebas hacen lo mismo con la clave de servicio. Para que eso no apunte a la nube por error, `esLocal(url)` (`perf/lib.mjs`) acepta solo los nombres de host `127.0.0.1`, `localhost` y `::1`; `perf/lib.mjs` exige API y base locales y `tests/soporte/entorno.ts` hace lo mismo con `apiUrl` y `dbUrl` (prueba `tests/unit/soporte/entorno-local.test.ts`). Con una URL remota lanzan error (H-420, H-408). `eslint.config.js` ignora `perf/.dist/`, `perf/.estado/` y `perf/resultados/`.

**Conocido:** H-421 (abierto, baja): en E2E, dos ingresos del mismo profesor con menos de 60 s de diferencia reciben 429 de Auth y el test espera el mail hasta agotar 15 s. No es del producto; cada prueba pasa sola.

Fuente: handoffs del Developer (T13.2), `handoff-tester.md` y `handoff-tester-2.md` de B13, `PERF-05/informe.md`.

## 11. Prueba de fallos de dependencias (opt-in)

`tests/e2e/dependencias.spec.ts` comprueba que, con la API caída, la web muestra un mensaje de error y no una pantalla en blanco (DEP-C, WEB-01, WEB-02). **No corre con la suite**: baja de verdad el contenedor `supabase_kong_reservas` (y lo sube en `finally`), así que solo se ejecuta si se pide:

    RTC_DEPENDENCIAS=1 npx playwright test tests/e2e/dependencias.spec.ts --project=chromium

Recorre `#/p/profesor-prueba`, `#/` e `#/ingreso`: el encabezado queda visible y la agenda dice «No se pudo cargar la agenda. No hay conexión con el servidor. Revisá tu conexión y probá de nuevo.» con **Reintentar**. Necesita el stack local en marcha y el bundle compilado; no usarla contra la nube. Captura: `.aidlc/reservatuclase/calidad/evidencias/dependencias/DEP-01-api-caida.png`.

Los otros dos casos de la verificación son manuales (comandos en `verificacion/informe-pruebas.md` §3):
- **DEP-A, correo caído:** `docker stop supabase_inbucket_reservas`, encolar un mail con `privado.encolar_mail(...)` y mirar a los 12 s: la fila queda `fallido` con el motivo del servidor y aparece en `v_mails_fallidos`; no se reintenta sola (DEC-10).
- **DEP-B, reinicio de la base:** `docker restart supabase_db_reservas` con una reserva y un mail pendientes: todo sigue, `privado.barrer_mails()` reenvía el mail y los 4 jobs de pg_cron siguen activos.

Otras notas de la verificación: `npm run seguridad:dist` falla tras una E2E que recompila `dist/` con la clave JWT demo (H-442; reconstruir con la clave `sb_publishable_` y `VITE_SUPABASE_URL` local antes de escanear), y H-440 (prueba unitaria intermitente de `precarga.test.tsx`) era del test y está corregida.

Fuente: `verificacion/informe-pruebas.md` §1, §3 y §5, `handoff-tester.md`.

## Bitácora de versiones

| Versión | Fecha | Bolt | IDs | Cambio |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-10-21 | B01 | SEC-12, SEC-13, SEC-16, ADR-007, 012, 013, 015, 016, 017, NFR-09 | Primera versión: estructura, scripts, pipeline, sesión, UI compartida, CAPTCHA y puesta en marcha |
| 0.2 | 2026-10-23 | B14 | ADR-018 | Nota de puesta en marcha con Administrador y slug |
| 0.3 | 2026-10-23 | B15 | ADR-018, ADR-021, ADM-02 | `configurar_profesor` con tres argumentos tras la contracción, funciones sin slug eliminadas, secreto opcional `url_sitio` |
| 0.4 | 2026-10-23 | B07, B11 | ADR-008, SEC-28, ALU-10, AVI-05 | Procesos programados y su registro de corridas; enlace a la guía de despliegue del cliente |
| 0.5 | 2026-10-28 | B12 | NFR-05, NFR-06, CA-37, CA-38, H-404, H-405 | Accesibilidad y uso en celular: `EnlaceAccion`, botón sin transición, pruebas y verificación manual pendiente |
| 0.6 | 2026-10-28 | B13 | NFR-04, CA-36, CA-17, DEC-41, H-420, H-408, H-421 | Rendimiento: lecturas en paralelo y carga adelantada, mediciones con `perf/`, perfil Fast 4G, guardia `esLocal` |
| 0.7 | 2026-10-28 | verificación | WEB-01, WEB-02, NFR-07, H-440, H-442 | Prueba opt-in de fallos de dependencias (`RTC_DEPENDENCIAS=1`) y casos DEP-A y DEP-B |
