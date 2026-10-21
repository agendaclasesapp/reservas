# S02 · Operación (TS02.1): Auth, Google y página de prueba en Pages

Sin valores secretos. Fecha 2026-10-21.

## Hecho por el humano (no repetido)
- Auth con Google: Client ID `158722043956-1r7p7l5t3m1hbvu66v81cjpsothmp7cl.apps.googleusercontent.com`; URI de retorno en Google Cloud `https://rmokypmznhobapyghfpi.supabase.co/auth/v1/callback`; proveedor activo en Supabase (skip nonce off, sin email off).
- Site URL y Redirect URL: `https://agendaclasesapp.github.io/reservas/`.
- SMTP de Gmail para Auth (cuenta dedicada `agendaclasesapp@gmail.com`).

## Página de prueba publicada (DevOps)
- Build: `spikes/S02/codigo`, `base: '/reservas/'` (default de `vite.config.ts`), `VITE_SUPABASE_URL=https://rmokypmznhobapyghfpi.supabase.co` y `VITE_SUPABASE_ANON_KEY` = clave **publishable** (`sb_publishable_…`, de `projects api-keys`). Nota Git Bash: no pasar `RTC_BASE=/reservas/` (MSYS lo convierte en una ruta de Windows); el default ya es correcto.
- Comprobación de `dist/`: 0 coincidencias de JWT (`eyJ….….`) y de `sb_secret_<valor>`; la cadena `service_role` no aparece; `sb_secret_` aparece solo como literal de una comprobación de prefijo dentro de supabase-js. Aparece una vez la clave publishable.
- Repositorio `agendaclasesapp/reservas` (clon de trabajo `.pages-spike/`, fuera del árbol del producto): commit `7cc151d` (borra `prueba/` y `pages.yml`, agrega `spike-s02/` con el `dist/`) y `ac866b0` (agrega `.github/workflows/spike-s02.yml`, que sube `spike-s02/` a Pages). Push normal a `main`, sin force. El primer push no tenía el workflow (error mío al armarlo), por eso hay dos commits.
- Run `39676409892` (`ac866b0`): completed / success. `curl -sI https://agendaclasesapp.github.io/reservas/` -> 200; el HTML trae `<title>Spike S02 · ReservaTuClase</title>` y `/reservas/assets/index-CHMhpRqF.js` (200).
- B01: borrar `spike-s02/` y `spike-s02.yml` al crear `web.yml`. Mientras `spike-s02.yml` siga, cada push a `main` republica el spike.

## Probar Google a mano (humano)
1. Abrir `https://agendaclasesapp.github.io/reservas/#/mis-clases`. Debe verse «sin sesión» (`data-testid=sesion`).
2. Pulsar «Ingresar desde aquí» (guarda la ruta `#/mis-clases` en `sessionStorage`) y luego «Ingresar con Google»; elegir la cuenta de Google.
3. Al volver, la URL debe ser `https://agendaclasesapp.github.io/reservas/#/mis-clases` (sin `?code=` en la barra), con tu mail en lugar de «sin sesión». Si aparece un error (`error-retorno`), anotar el texto exacto y pasárselo al developer (TS02.2).
4. Si Google muestra `redirect_uri_mismatch`, falta la URI de retorno del callback en Google Cloud.
5. Opcional: el código por mail (OTP) con una casilla distinta; debe llegar un mail de 6 dígitos sin enlaces desde la cuenta de Gmail.
