# Spike S02 · Resultado (parte local, TS02.2)

Estado: **local cerrada; nube parcial**: triggers en el proyecto y `config diff` hechos; `config push`, mail de Gmail
y Google pendientes (ver «Pendiente (orden)»).
Código: `spikes/S02/codigo/` (descartable). Supabase CLI 2.121.0, supabase-js 2.118, React Router 7.18,
Vite 8.3, stack local `rtc-s02` con puertos 564xx.

## Pregunta
¿Supabase Auth da el código de 6 dígitos con plantilla sin enlaces (y SMTP de Gmail), y Google vuelve con
PKCE a una SPA con rutas hash publicada en Pages? ¿Los triggers sobre `auth.users` vinculan solo con mail
confirmado (H-003, SEC-14)? ¿La configuración remota queda sin `127.0.0.1` (H-005)?

## Método
| Qué | Cómo | Dónde |
| --- | --- | --- |
| Config de Auth | `otp_length = 6`, `otp_expiry = 600`, `max_frequency = "60s"`, `enable_confirmations = true`, `[auth.rate_limit]` explícito, plantillas `confirmation` y `magic_link` → `templates/codigo.html` (solo `{{ .Token }}`), Google con `env()` | `codigo/supabase/config.toml`, `codigo/supabase/templates/codigo.html` |
| Perfil local | `site_url` / `additional_redirect_urls` = `env(RTC_SITE_URL)` / `env(RTC_REDIRECT_URL)`; valores `127.0.0.1` solo en `supabase/.env.development` | `codigo/supabase/.env.development` |
| H-005 | API de gestión simulada (`scripts/api-simulada.mjs`) + perfil de CLI (`--profile scripts/perfil-simulado.yaml`) para capturar el `PATCH` real de `config push` y la salida de `config diff`, sin proyecto | `codigo/scripts/` |
| Código por mail y triggers | Vitest contra el stack local: `signInWithOtp`/`verifyOtp` con cliente PKCE, código leído de la API de Mailpit, estado leído de la base con `pg` | `codigo/tests/local/otp-y-triggers.test.ts` (12 pruebas) |
| Vencimiento 600 s | Se corre hacia atrás `confirmation_sent_at`/`recovery_sent_at` (lo que GoTrue compara con `otp_expiry`): 610 s → vencido, 590 s → vale. No se tocó el reloj del sistema ni se usó un `otp_expiry` corto | `tests/local/soporte.ts` (`envejecerEnvio`) |
| Google | Simulado con `insert` directo en `auth.users` con `email_confirmed_at` ya puesto y `full_name` (como inserta GoTrue un usuario de Google) | prueba `S02_SEC_14_google_simulado_...` |
| SPA | Vite `base: '/reservas/'`, `createHashRouter`, supabase-js `flowType: 'pkce'`, `procesarRetorno` (canje con `exchangeCodeForSession`, limpia la query, restaura la ruta de `sessionStorage`) | `codigo/src/`, `tests/unit/` (8), `tests/e2e/retorno-pkce.spec.ts` (4, Chromium) |
| Retorno PKCE real sin Google | Salida: se intercepta `/auth/v1/authorize` y se verifica que GoTrue responde 302 a `accounts.google.com/o/oauth2/v2/auth` con `redirect_uri=<api>/auth/v1/callback`. Vuelta: `GET /auth/v1/verify?token=<token_hash>&type=signup&redirect_to=<SPA>` de un código pedido con PKCE, que responde 303 a `/reservas/?code=<uuid>`: el mismo último tramo que el callback de Google | e2e prueba 1 |

## Resultados locales
| Criterio de `spikes.md` | Resultado |
| --- | --- |
| Llega código de 6 dígitos sin enlaces | **Sí.** Asunto «Tu código de ingreso», 6 dígitos, HTML y texto sin `href` ni `http`, en alta (`confirmation`) y en ingreso siguiente (`magic_link`) |
| `verifyOtp` crea la sesión | **Sí** (`type: 'email'`, cliente PKCE); también desde la SPA (e2e 4) |
| Código erróneo y vencido con errores distinguibles | **No desde GoTrue.** Erróneo, vencido (610 s) y ya usado devuelven lo mismo: `403 otp_expired "Token has expired or is invalid"`. Reenvío antes de 60 s: `429 over_email_send_rate_limit`. **Plan B probado:** la SPA guarda la hora del pedido y clasifica `vencido` si pasaron ≥ 600 s, si no `incorrecto` (`src/codigo.ts`, 3 pruebas unitarias, e2e 4 muestra `codigo-incorrecto`) |
| Tras `signInWithOtp` el usuario existe con `email_confirmed_at` nulo y el trigger no hace nada | **Sí, pero solo con `enable_confirmations = true`.** Traza: `INSERT · confirmado=false · nada: sin confirmar`, cero filas en `alumno`/`profesor`; un código erróneo tampoco crea nada |
| Al `verifyOtp` vincula o crea | **Sí.** Orden observado en la misma transacción: `UPDATE email_confirmed_at` → «crea alumno ficha_incompleta» (o «vincula alumno dado de alta», ALU-07, o «vincula profesor»), y después `UPDATE last_sign_in_at` → «actualiza ultimo_ingreso» (ALU-11 ya en el primer ingreso) |
| Segundo ingreso | Solo dispara `al_ingresar_usuario` (no vuelve a tocar `email_confirmed_at`); sin alumno duplicado |
| Google llega confirmado en el insert | **Sí (simulado):** el `INSERT` ya confirmado crea `alumno` `ficha_incompleta` con `nombre = full_name`; un nuevo update de `email_confirmed_at` → «nada: ya vinculado» (idempotente) |
| Respuesta igual para mail conocido y desconocido | **Sí:** `{ data: { user: null, session: null }, error: null }` en ambos |
| `config push` sin `127.0.0.1` (H-005) | **Sí, con condiciones** (ver abajo) |
| Google vuelve a `/<repo>/?code=…`, canje y ruta guardada | **Sí, con un code real de GoTrue en local:** 303 a `/reservas/?code=<uuid>`, la SPA canjea, queda en `http://127.0.0.1:5173/reservas/#/mis-clases` con sesión, sin query y sin la clave en `sessionStorage`; usuario confirmado y alumno creado por el trigger. Code falso → error visible y misma ruta; `error_description` → se muestra y se limpia la query |
| Build con `base: '/reservas/'` | **Sí:** `dist/index.html` carga `/reservas/assets/index-*.js` |

### H-005: qué carga cada comando de la CLI 2.121 (probado)
| Archivo / origen | `supabase start` | `supabase config push` / `config diff` |
| --- | --- | --- |
| `supabase/.env.development` | se carga (GoTrue quedó con `SITE_URL=http://127.0.0.1:5173/reservas/`) | **no se carga** (con `SUPABASE_ENV` sin definir, `development` o `production`) |
| `supabase/.env` | — | **se carga**: con `127.0.0.1` ahí, el `PATCH /v1/projects/<ref>/config/auth` lleva `site_url` y `uri_allow_list` con `127.0.0.1` |
| Variables del proceso (CI) | — | se resuelven: `PATCH` con la URL de Pages, cero apariciones de `127.0.0.1` |
| Variable sin definir | — | **se empuja el literal** `"site_url":"env(RTC_SITE_URL)"`; `config diff` lo muestra igual (`"local":"env(...)"`) |

Además: `config push` rechaza `rate_limit_anonymous_users = 0` («Expected a value greater than or equal to 1»);
`rate_limit_email_sent` no se empuja ni se compara mientras `[auth.email.smtp]` no esté habilitado.

## Contra el proyecto `rmokypmznhobapyghfpi` (TS02.2, nube; 2026-10-21)
Scripts en `codigo/nube/` y `codigo/verificar-codigo.mjs`. La base se toca con `pg` por el pooler en modo sesión
(`aws-1-sa-east-1.pooler.supabase.com:5432`, usuario `postgres.<ref>`, contraseña tomada de `SUPABASE_DB_PASSWORD`).
La URL y la clave **publicable** están en `codigo/.env.nube` (ignorado por git), sacadas con
`supabase projects api-keys -o json` y filtradas para quedarse solo con la publicable.

| Paso | Resultado |
| --- | --- |
| H-005 · `config diff` real | Con `RTC_SITE_URL`/`RTC_REDIRECT_URL` = `https://agendaclasesapp.github.io/reservas/`, `RTC_GOOGLE_CLIENT_ID` = el del panel y `RTC_GOOGLE_SECRET=` (vacío): **0 × `127.0.0.1` y 0 × `env(`**. En 2.121 la salida ya viene en JSON (`changes[]` con `class` `update` / `remote_only` / `local_only`, más `masked` y `unmanaged`) |
| Diferencias ajenas a Auth del spike | La primera corrida también traía `db.pooler.default_pool_size` 20←15, `max_client_conn` 100←600, `storage.vector.enabled` true←false y `auth.mfa.totp.*` false←true. `config push` los habría cambiado en el proyecto que comparte con S01. Se igualaron en `config.toml` a los valores remotos (con comentario) |
| Diff final (lo que se empujaría) | `otp_expiry` 600←3600, `otp_length` 6←**8** (la nube trae 8 por defecto), asuntos de `confirmation`/`magic_link` → «Tu código de ingreso», `rate_limit.sign_in_sign_ups` 20←30, `token_verifications` 20←30, `site_url` → Pages (**la remota seguía en `http://localhost:3000`**). `uri_allow_list`, Google (habilitado y client id) y `enable_confirmations` (`mailer_autoconfirm=false`) ya coinciden. SMTP aparece como `remote_only` (6 campos que el toml no declara) |
| ¿Pisa SMTP o Google? | **No.** Cuerpo del `PATCH` capturado con la API simulada y el mismo entorno: 46 claves, ninguna `smtp_host/port/user/pass/admin_email/sender_name` (solo `smtp_max_frequency`=60, que es `max_frequency`) y sin `external_google_secret` (con el secreto vacío la CLI no lo manda). `external_google_enabled=true` y `external_google_client_id` iguales a los del panel. `rate_limit_email_sent` no viaja (`unmanaged` mientras no haya `[auth.email.smtp]`) |
| `config push` real | **No se ejecutó: el permiso de la sesión lo denegó.** La Management API tampoco se pudo usar: el token de la CLI está en el almacén de credenciales de Windows y leerlo también se denegó. El comando queda listo en «Pendiente (orden)» |
| Triggers en el proyecto | **Sí.** `node nube/sql.mjs nube/triggers-spike_s02.sql` como `postgres`, sin `db push`. Esquema `spike_s02` (profesor, alumno y traza_trigger con RLS, funciones `security definer`) y triggers `spike_s02_al_confirmar_usuario` (`after insert or update of email_confirmed_at`) y `spike_s02_al_ingresar_usuario` (`after update of last_sign_in_at`) creados sobre `auth.users`. Antes no había ningún otro trigger ahí (S01 no tiene). El proyecto alojado deja crearlos |
| `signInWithOtp` a `agendaclasesapp+s02@gmail.com` | **No se ejecutó, a propósito:** sin el push, el mail saldría con la plantilla por defecto (8 dígitos y enlace de confirmación) y el humano no podría juzgar el criterio. `nube/pedir-codigo.mjs` queda listo. La consulta de estado (`estadoCasilla`) se probó contra la base: casilla «no existe», 0 trazas |
| Página de Pages | Variables de build: `VITE_SUPABASE_URL=https://rmokypmznhobapyghfpi.supabase.co` y `VITE_SUPABASE_ANON_KEY` = clave **publicable** (`sb_publishable_…`; la `anon` legada también sirve). `base` = `RTC_BASE`, o `'/reservas/'` por defecto. Se revisó el `dist/` que generó DevOps (`index-CHMhpRqF.js`): solo trae la URL del proyecto y una clave `sb_publishable_`, ningún JWT ni `sb_secret_` (la única aparición de `sb_secret_` es el literal con el que supabase-js distingue prefijos), e `index.html` usa `/reservas/`. Ojo: en `build` Vite también lee `codigo/.env.local` (el del stack local). Las variables del proceso tienen prioridad, pero conviene que ese archivo no exista en CI |

### Qué buscar en el mail (después del push)
- Remitente: `Reservas <agendaclasesapp@gmail.com>` (SMTP del panel). Asunto exacto: **`Tu código de ingreso`**.
- Cuerpo: «ReservaTuClase / Tu código de ingreso es: NNNNNN / Vence en 10 minutos…». **6 dígitos y ningún enlace**
  (`templates/codigo.html` no tiene `href` ni URL). Si llega «Confirm your email address» con un enlace u 8 dígitos,
  el push no se aplicó.
- El primer pedido usa la plantilla `confirmation` (alta) y los siguientes, con la cuenta ya confirmada, `magic_link`.
  El asunto es el mismo en los dos casos.

## Pendiente (orden)
1. **Push** (lo corre quien tenga el permiso, desde `spikes/S02/codigo/`):
   ```
   RTC_SITE_URL=https://agendaclasesapp.github.io/reservas/ RTC_REDIRECT_URL=https://agendaclasesapp.github.io/reservas/ \
   RTC_GOOGLE_CLIENT_ID=158722043956-1r7p7l5t3m1hbvu66v81cjpsothmp7cl.apps.googleusercontent.com RTC_GOOGLE_SECRET= \
   npx --yes supabase@2.121.0 config push --project-ref rmokypmznhobapyghfpi --yes
   ```
   Antes del push, `config diff` con el mismo entorno debe mostrar solo los 7 `update` de arriba (más el SMTP
   `remote_only` y `password_requirements` `local_only`). Después, `config diff` de nuevo no debe traer ningún
   `update`, y en el panel SMTP y Google deben seguir activos.
2. Con `SUPABASE_DB_PASSWORD` en el entorno, `node nube/pedir-codigo.mjs`. Debe imprimir `OK pedido` y la respuesta
   `{"user":null,"session":null}`, y en la base `usuario.confirmado=false`, `alumno: []` y la traza
   `al_confirmar_usuario · INSERT · confirmado=false · nada: sin confirmar` (H-003, SEC-14).
3. El humano lee el código y se corre `node verificar-codigo.mjs <codigo>`. Debe imprimir
   `OK sesión=sí usuario_confirmado=sí` y las trazas `UPDATE · confirmado=true · crea alumno ficha_incompleta` y
   `al_ingresar_usuario · … · actualiza ultimo_ingreso`. Un código erróneo imprime `ERROR 403 otp_expired …`, igual
   que en local.
4. Google desde Pages (DevOps y humano): debe volver a `https://agendaclasesapp.github.io/reservas/?code=…` y quedar
   en `#/mis-clases`. En la base,
   `node nube/sql.mjs -c "select disparador, operacion, confirmado, accion, email from spike_s02.traza_trigger order by id"`
   tiene que mostrar `INSERT · confirmado=true · crea alumno ficha_incompleta` para la cuenta de Google.

## Limpieza de `spike_s02` (no ejecutada; `codigo/nube/limpieza-spike_s02.sql`)
```sql
begin;
drop trigger if exists spike_s02_al_confirmar_usuario on auth.users;
drop trigger if exists spike_s02_al_ingresar_usuario on auth.users;
drop schema if exists spike_s02 cascade;
delete from auth.users where email = 'agendaclasesapp+s02@gmail.com';
commit;
```
Se corre con `node nube/sql.mjs nube/limpieza-spike_s02.sql`. Si la cuenta de Google del paso 4 se usó solo para
el spike, se borra a mano.

## Columna «Resultado» propuesta para `spikes.md` (S02)
> Local: código de 6 dígitos sin enlaces y `verifyOtp` con sesión; los triggers vinculan solo con el mail confirmado
> (H-003/SEC-14) y Google simulado llega confirmado; retorno PKCE con un `?code=` real y la ruta hash restaurada.
> GoTrue no distingue código erróneo de vencido (403 `otp_expired` en ambos casos): plan B en la SPA con la hora del
> pedido. Nube: triggers creados sobre `auth.users` del proyecto; `config diff` sin `127.0.0.1` ni `env(`, y el push
> no toca SMTP ni el secreto de Google, pero obliga a declarar en `config.toml` lo que el proyecto ya tiene (pooler,
> `storage.vector`, MFA TOTP). [Completar después del push: mail de Gmail con asunto «Tu código de ingreso» y
> 6 dígitos; Google desde Pages.]

## Qué cambia para B01 y B04
- **B01 (config, DevOps):** `enable_confirmations = true` es obligatorio para H-003/SEC-14 (con `false`, el alta por código nace confirmada). Plantillas `confirmation` **y** `magic_link` con `{{ .Token }}`. `rate_limit.anonymous_users >= 1`. Los valores locales van en `supabase/.env.development`, **no** en `supabase/.env` (que `config push` sí lee): corregir la redacción de ADR-007. El workflow que empuja debe correr `config diff -o json` y fallar si aparece `127.0.0.1` o `env(` antes del `config push`.
- **B01 (config push, probado contra el proyecto):** la CLI 2.121 manda el cuerpo de Auth completo, así que cambia
  todo lo que `config.toml` no declare igual que el proyecto (así aparecieron el pooler, `storage.vector` y MFA TOTP).
  El guardia de CI tiene que fallar con `127.0.0.1` o `env(` y también con cualquier `update` que no esté en la lista
  de campos esperados. Sin `[auth.email.smtp]` el push no toca SMTP, y con `RTC_GOOGLE_SECRET` vacío no manda el
  secreto de Google. La nube trae por defecto `otp_length = 8` y `site_url = http://localhost:3000`.
- **B01 (cliente, T01.1):** con `exchangeCodeForSession` explícito el cliente va con `detectSessionInUrl: false` (si no, supabase-js canjea al iniciar y el segundo canje falla). ADR-007 dice `true` + `getSession()`: elegir uno; el spike prueba el explícito. `procesarRetorno` corre antes de crear el router; la ruta guardada solo se acepta si empieza con `#/`.
- **B04 (lógica de ingreso, WEB-02):** GoTrue no distingue código erróneo de vencido; la SPA lo hace con la hora del pedido y 600 s (plan B de `src/codigo.ts`). El reenvío dentro de 60 s da 429. Los triggers del spike (`privado.al_confirmar_usuario`, `privado.al_ingresar_usuario`) sirven de base; `ultimo_ingreso` ya queda puesto en el primer ingreso porque GoTrue confirma antes de actualizar `last_sign_in_at`. Un insert directo en `auth.users` (fixtures) necesita los tokens en `''`, si no GoTrue falla con «Database error finding user».

## Cómo reproducir (desde `spikes/S02/codigo/`; `start` aplica la migración y `supabase/seed.sql`)
```
npx --yes supabase@2.121.0 start -x studio,imgproxy,vector,logflare,storage-api,realtime,edge-runtime,postgres-meta,supavisor
npm install && node scripts/env-local.mjs
npx vitest run --project unit && npx vitest run --project local
npm run build && npx playwright test --project=chromium
npx --yes supabase@2.121.0 stop --no-backup
```
H-005: `node scripts/api-simulada.mjs 56499 <log>` y, con `SUPABASE_ACCESS_TOKEN=sbp_000…` falso,
`npx supabase@2.121.0 --profile scripts/perfil-simulado.yaml config push --project-ref aaaaaaaaaaaaaaaaaaaa --yes`; el cuerpo del `PATCH` queda en `<log>`.
