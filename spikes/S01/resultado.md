# S01 · Resultado del spike de mails (Edge Function + pg_net)

Tarea TS01.2 (developer) · ADR-005 · base de AVI-07, NFR-02, NFR-07 · fecha 2026-10-21
Estado: **cumplido en local y en el proyecto `rmokypmznhobapyghfpi`; falta solo que el humano confirme
la llegada de los mails a la bandeja (asuntos en «Mails a confirmar»)**.

## Pregunta
¿Una Edge Function (Deno) envía por `smtp.gmail.com:465` con contraseña de aplicación, y un trigger
`after insert` con `pg_net` la invoca solo tras el commit, con el secreto en Vault?

## Método (local)
- Proyecto propio `spikes/S01/codigo/` (`project_id = "rtc-s01"`, puertos 554xx), Supabase CLI
  2.121.0, edge-runtime 1.77.4 (Deno 2.1.4). Stack sin studio, imgproxy, vector, logflare,
  storage-api, realtime, postgres-meta ni supavisor.
- `supabase/functions/enviar-mail/index.ts`: `npm:nodemailer@6.9.16`, TLS implícito, lee
  `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `MAIL_SECRETO`, `SMTP_HOST|PORT|TLS`, `SMTP_TIMEOUT_MS`
  (10 s) del entorno; exige la cabecera `x-mail-secreto` (comparación en tiempo constante,
  `verify_jwt = false`); devuelve 200 con `messageId` o 502 con el texto del error y lo anota en
  la fila (`PATCH /rest/v1/mail_prueba` con `SUPABASE_SERVICE_ROLE_KEY`). Sin defaults de SMTP,
  apunta a Gmail 465.
- `supabase/migrations/20261021000001_s01_mail_prueba.sql`: tabla `public.mail_prueba` (RLS sin
  políticas) y trigger `after insert` que lee `url_funcion_mail` y `mail_secreto` de
  `vault.decrypted_secrets` y llama `net.http_post(..., timeout_milliseconds := 20000)`.
- `s01.sh preparar` genera `supabase/.env` (no versionado) con un `MAIL_SECRETO` aleatorio y SMTP de
  Mailpit; `[edge_runtime.secrets]` de `config.toml` lo toma con `env()`. `s01.sh vault` copia el
  secreto y la URL a Vault.
- Contraseña inválida: `functions serve --env-file` con un archivo temporal (fuera del repo) con
  usuario y contraseña falsos contra `smtp.gmail.com:465`, y otro con un host que no responde.

## Resultados locales
| Criterio | Resultado | Evidencia |
| --- | --- | --- |
| Envío con From = `GMAIL_USER` (Mailpit) | Cumplido | 200 en 0,5-0,9 s; Mailpit: `profesor.prueba@example.com -> alumno.prueba@example.com` |
| Llamada sin cabecera o con secreto erróneo | 401 `No autorizado` | curl directo |
| Trigger + Vault dispara tras commit | Cumplido | fila `enviado`, `net._http_response` 200, mail en Mailpit en < 5 s |
| No dispara antes del commit | Cumplido | con la transacción abierta 6 s: Mailpit y `net._http_response` sin cambios; tras commit, llega |
| Rollback no dispara | Cumplido | dentro de la tx `net.http_request_queue` = 1; tras rollback cola 0, sin respuesta nueva, 0 mails «ROLLBACK» (solo se consume un valor de la secuencia de pg_net) |
| Contraseña inválida contra Gmail real | Cumplido: 502 en **1,4 s** | `EAUTH`, `responseCode 535`, texto «Invalid login: 535-5.7.8 Username and Password not accepted…» |
| SMTP que no responde | Cumplido: 502 en **10,0 s** | `ETIMEDOUT` «Connection timeout»; por trigger la fila queda `fallido` con ese motivo |
| URL de la función desde el contenedor de la base | **`http://kong:8000/functions/v1/enviar-mail`** | `net.http_get`: kong → 405 (ruteo ok), `host.docker.internal:55421` → 405, `127.0.0.1:55421` → «Couldn't connect to server» |

Además: el handshake TLS implícito con `smtp.gmail.com:465` desde el edge runtime funciona con
nodemailer (se llegó al 535 de AUTH); `denomailer` no hace falta.

## Hallazgos técnicos
1. **URL local:** usar `http://kong:8000` (alias de red del proyecto; no depende del puerto del
   host ni de Docker Desktop, sirve también en CI Linux). `host.docker.internal` funciona solo con
   Docker Desktop.
2. **DNS en el edge runtime:** los nombres de contenedor con `_` (`supabase_inbucket_<id>`) no
   resuelven (nodemailer: `EDNS queryA UNKNOWN`; `dns.lookup`: `ENOTFOUND`; `Deno.resolveDns`:
   «Label contains invalid characters»). Usar el alias **`inbucket`**, puerto **1025**, sin TLS.
3. **Hot reload en Windows:** con el bind mount de Windows el edge runtime no recarga al editar;
   hace falta `docker restart supabase_edge_runtime_<id>` o `supabase stop && start`.
4. **`functions serve --env-file`** reemplaza el contenedor del edge runtime y al cortarlo queda
   con ese entorno; para volver al de `config.toml` hay que reiniciar el stack.
5. **Tiempos:** `timeout_milliseconds` de `net.http_post` debe superar `SMTP_TIMEOUT_MS` (20 s vs
   10 s); si no, pg_net corta antes y la fila queda `pendiente` hasta el barrido.
6. El texto del error SMTP sale en la respuesta HTTP: la lee solo pg_net (`net._http_response`,
   con TTL propio de pg_net); en B03 debe quedar en `mail_salida.motivo` y llegar a la web solo por
   `v_mails_fallidos` (SEC-17). La cabecera con el secreto vive en `net.http_request_queue` hasta
   que el worker la procesa (esquema `net`, no expuesto por la API).

## Resultados contra la nube (2026-10-21, 21:10-21:13 UTC)
Proyecto Free `rmokypmznhobapyghfpi` (sa-east-1, PostgreSQL 17.11), CLI 2.121.0. Los secretos se
leyeron de las variables de usuario de Windows sin imprimirse; ningún valor quedó en el repo.

| Criterio | Resultado | Evidencia |
| --- | --- | --- |
| Mail real desde local (`functions serve --env-file`, Gmail 465) | Cumplido: 200 en 3,3 s | `messageId` `<747b8838…@gmail.com>`; env-file en el scratchpad, borrado al terminar |
| Despliegue | Cumplido | `functions deploy enviar-mail --no-verify-jwt --use-api` (sin Docker); `functions list`: ACTIVE, `verify_jwt false` |
| Llamada directa a la función del proyecto | Cumplido: 200 en 3,2 s (4,2 s total) | sin cabecera 401; con secreto `messageId` `<2a920194…@gmail.com>` |
| Trigger + pg_net + Vault en el proyecto | Cumplido | fila 1 → `net._http_response` 200, `messageId` `<07ee1902…@gmail.com>`, en < 12 s |
| Rollback no dispara (proyecto) | Cumplido | en la tx `net.http_request_queue` = 2 (la anterior aún sin procesar + la nueva); tras rollback cola 0, `net._http_response` = 1 fila (solo la del commit), 0 filas «ROLLBACK» |
| Contraseña inválida en el proyecto | Cumplido: 502 en **2,2 s** | `clave_invalida: true` (ver abajo): `EAUTH`, 535 «Invalid login: 535-5.7.8 Username and Password not accepted…»; local igual en 1,3 s |
| Variables que recibe la función (H-011) | `SUPABASE_SERVICE_ROLE_KEY` **sí** | presentes: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS` (y `SUPABASE_JWKS` en `secrets list`); el PATCH con la service role pasó el gateway (404 de tabla inexistente en `public`, no 401) |

Cómo se hizo, sin `db push` ni cambio de secretos:
- `codigo/nube/s01_nube.sql`: mismo trigger que la migración local, pero en el esquema `spike_s01`
  y con secretos de Vault `s01_mail_secreto` y `s01_url_funcion_mail`
  (`https://rmokypmznhobapyghfpi.supabase.co/functions/v1/enviar-mail`). Instala `pg_net` en
  `extensions` (el proyecto no lo tenía).
- `codigo/nube/s01_nube.cjs` (`node` + `pg`, `NODE_PATH` fuera del repo): `aplicar`, `vault`,
  `insertar`, `rollback`, `estado`, `limpiar`. Conexión por el pooler de sesión
  **`aws-1-sa-east-1.pooler.supabase.com:5432`**, usuario `postgres.<ref>` (`aws-0-…` responde
  «tenant/user not found»).
- Contraseña inválida: la función acepta `clave_invalida: true` en el cuerpo (solo con
  `x-mail-secreto` válido) y usa una contraseña fija equivocada; el secreto real no se tocó:
  `secrets list` al final muestra `GMAIL_APP_PASSWORD` con el mismo digest (`670e13de93dc…`) y
  `updated_at` 21:03:14Z, anterior a las pruebas. Es solo del spike: B03 no debe llevarlo.
- La respuesta incluye `entorno` (solo nombres de variables con `true/false`, nunca valores).

Observación: el digest de `GMAIL_APP_PASSWORD` del proyecto no coincide con el SHA-256 del valor de
la variable de usuario de Windows (sí coinciden `GMAIL_USER` y `MAIL_SECRETO`); las dos contraseñas
autentican en Gmail. Conviene que el humano confirme cuál es la vigente antes de B03.

## Mails a confirmar en agendaclasesapp@gmail.com
Deben llegar, con From = `agendaclasesapp@gmail.com` (hora local -03):
1. `[S01] proyecto directo 18:10` (llamada directa a la función desplegada)
2. `[S01] proyecto 18:10` (trigger `after insert` + pg_net + Vault)
3. `[S01] local 18:13` (`functions serve` local contra Gmail)

No deben llegar: `[S01] ROLLBACK 18:10` y `[S01] no debe llegar` (pruebas de contraseña inválida).

## Limpieza del proyecto (la ejecuta el orquestador tras la confirmación)
`codigo/nube/limpieza.sql` (o `node codigo/nube/s01_nube.cjs limpiar`):

```sql
drop schema if exists spike_s01 cascade;
delete from vault.secrets where name in ('s01_mail_secreto', 's01_url_funcion_mail');
```

No toca `pg_net` (lo usa B03), ni `spike_s02`, ni los secretos de Edge Functions. La función
`enviar-mail` del spike queda desplegada; B03 la reemplaza con el mismo nombre (o borrarla con
`npx --yes supabase@2.121.0 functions delete enviar-mail --project-ref rmokypmznhobapyghfpi`).

## Columna «Resultado» propuesta para `arquitectura/spikes.md` (fila S01)
cumplido (2026-10-21): mail con From = `GMAIL_USER` desde local (`functions serve`, 3,3 s) y desde
el proyecto (directo y por trigger pg_net + Vault); contraseña inválida → 502 con el texto `EAUTH 535`
en 1,3 s (local) y 2,2 s (proyecto); SMTP mudo → 502 en 10 s; URL local
`http://kong:8000/functions/v1/enviar-mail`; rollback no dispara (local y proyecto); el proyecto
inyecta `SUPABASE_SERVICE_ROLE_KEY` y también `SUPABASE_SECRET_KEYS`. Ver `spikes/S01/resultado.md`.

## Qué cambia para B01 y B03
- **B01 (`supabase/config.toml`, devops):** `[functions.enviar-mail] verify_jwt = false`;
  `[edge_runtime.secrets]` con `env()` para `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `MAIL_SECRETO`,
  `SMTP_HOST = inbucket`, `SMTP_PORT = 1025`, `SMTP_TLS = false` en local y CI; `seed.sql` carga en
  Vault `url_funcion_mail = http://kong:8000/functions/v1/enviar-mail` y un `mail_secreto` local.
- **B03 (`enviar-mail`, trigger, barrido):** la URL va en Vault (`url_funcion_mail`), no en el
  código, así el trigger es igual en local y en el proyecto; `net.http_post` con
  `timeout_milliseconds` > `SMTP_TIMEOUT_MS`; nodemailer 6.9.16 por `npm:` confirmado (sin plan B);
  el motivo de fallo se guarda en `mail_salida.motivo`; el proyecto sí inyecta
  `SUPABASE_SERVICE_ROLE_KEY` (H-011 sin ajuste), y también `SUPABASE_SECRET_KEYS` por si se
  migra a las claves nuevas; despliegue con `--use-api` (no necesita Docker en CI).
- B01/devops: conexión a la base del proyecto por `aws-1-sa-east-1.pooler.supabase.com:5432`.
- ADR-005 se sostiene sin cambios de diseño.
