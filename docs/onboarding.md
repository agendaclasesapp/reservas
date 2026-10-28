---
titulo: Onboarding · Agenda Clases App
version: 0.10
fecha: 2026-10-28
publico: equipo nuevo
---
# Onboarding · Agenda Clases App

> Estado: **construidos B01 a B05, B14 (varios profesores), B15 (Administrador) y B06 (pedir clases)**. Lo marcado «(diseñado)» aún no existe. Desde el último hito también están construidos B07 (responder solicitudes, Mis clases), B08 (mover y avisar que no voy), B09 (panel del profesor y gestión directa) y B11 (retención, recordatorios y borrado de alumnos); falta B10 (bloqueos).

## 1. Qué es

**Agenda Clases App** (el nombre visible del producto desde CR-003; el slug interno sigue siendo `reservatuclase`) es una aplicación web gratuita para profesores de tenis. Cada profesor tiene su enlace (`#/p/<slug>`); cualquiera que lo abre ve los huecos libres de su agenda; los alumnos aprobados por ese profesor piden, mueven o cancelan clases; el profesor confirma cada pedido y es el único que ve quién ocupa cada hueco. Hay varios profesores (CR-002): una persona tiene una sola cuenta y un vínculo con cada profesor, y un Administrador, el dueño del servicio, da de alta y pausa profesores (spec §1; ver `funcional/varios-profesores.md` y `tecnica/varios-profesores-b14.md`). Fuera de alcance: pagos, WhatsApp, feriados automáticos, app instalable, dominio propio.

## 2. Actores

Visitante, alumno pendiente, alumno (titular), persona a cargo (no inicia sesión), alumno sin cuenta (no inicia sesión ni recibe mails), profesor (administra solo su agenda), Administrador (dueño del servicio; no ve datos de alumnos), proceso programado (pg_cron) y tarea de mantenimiento (GitHub Actions). Detalle en spec §2.

## 3. Piezas (diseñado)

| Id | Pieza | Qué hace |
| --- | --- | --- |
| C1 | SPA web (React 19, TypeScript, Vite, rutas con `#`, GitHub Pages) | Pantallas WEB-01..08 |
| C2 | Esquema y RLS (Postgres en Supabase) | Tablas, vistas, permisos por rol, restricción que impide dos reservas en un hueco |
| C3 | Funciones RPC | Toda escritura y las lecturas que mezclan filas |
| C4 | Outbox y Edge Function `enviar-mail` | Mails por Gmail (SMTP 465; en local, buzón de prueba) y registro de fallos |
| C5 | Procesos programados (pg_cron) | Recordatorios, series, retención, reintento de mails |
| C6 | Auth | Google (PKCE) y código de 6 dígitos sin enlaces |
| C7 | Pipeline y operación | CI, despliegue, keep-alive cada 3 días |

Fuente: `.aidlc/reservatuclase/arquitectura/componentes.md`; decisiones en `arquitectura/adr/` (ADR-001..021).

## 4. Cómo se levanta en local

Requisitos: Node 22 o superior (`engines` de `package.json`; `.nvmrc` fija la versión del pipeline), Docker en marcha y la CLI de Supabase (se usa con `npx supabase`).

1. `npx supabase start` levanta el stack local con Docker. Al terminar imprime la URL del API (`http://127.0.0.1:54321`) y la clave publicable o anon; `npx supabase status` las vuelve a mostrar.
2. `npx supabase db reset` aplica las migraciones y `seed.sql` (profesor y grilla de desarrollo).
3. `npm install`.
4. Copiar `.env.example` a `.env.local` (ignorado por git) y completar las `VITE_*` (son las únicas permitidas en la web, SEC-20): `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con lo que muestra `status` (nunca la `service_role` ni una `sb_secret_`); `VITE_BASE` queda en `/reservas/` y `VITE_TURNSTILE_SITEKEY` ya trae la clave de prueba pública de Cloudflare. Las demás variables del archivo son de Actions o de la Edge Function: no hacen falta para la web.
5. `npm run dev` y abrir `http://127.0.0.1:5173/reservas/`. Sin las dos variables obligatorias, `npm run build` falla con un mensaje claro.

Los mails salen al buzón de prueba local (Mailpit); ahí se ve el código de ingreso de 6 dígitos, que acepta mails `@example.test`. La Edge Function lo alcanza como `inbucket:1025` sin TLS, y la base llama a la función en `http://kong:8000/functions/v1/enviar-mail` (guardada en Vault como `url_funcion_mail`). Los valores locales van en `supabase/.env.development`, nunca en `supabase/.env`. Detalle y motivos: `tecnica/configuracion-y-despliegue.md`; el resto de la plataforma, en `tecnica/plataforma.md`.

**Cómo correr cada suite** (desde la raíz del proyecto):

| Comando | Necesita el stack local | Qué prueba |
| --- | --- | --- |
| `npm run lint`, `npm run typecheck` | No | Estilo y tipos |
| `npm run test:unit` | No | Unitarias con cobertura |
| `npm run test:bd` | Sí | pgTAP sobre la base |
| `npm run test:integracion` | Sí | Vitest contra el stack local (toma el entorno de `supabase status`, nunca de la nube) |
| `npm run build` y luego `npm run test:e2e` | Sí | Playwright en chromium contra el bundle servido por `preview` (puerto 4173 por defecto, `RTC_PREVIEW_PORT`) |
| `npm run seguridad:dist` | No (necesita `dist/`) | Escaneo de credenciales en lo compilado |

**Notas para correr las pruebas (B02 a B05):**
- **CAPTCHA de prueba.** El pedido de código exige el desafío. En local y en CI se usan las claves de prueba públicas de Cloudflare que ya trae `.env.example`; el E2E de ingreso necesita salida a internet porque carga el script de Turnstile.
- **Reiniciar el stack.** `[auth.captcha]` de `supabase/config.toml` solo entra con `npx supabase stop` y `npx supabase start`; si el ingreso no pide desafío, el stack se levantó antes de ese cambio. Tras editar la Edge Function `enviar-mail` en Windows también hay que reiniciar el runtime. Después de un `db reset`, las pruebas de integración parten de una base limpia.
- **Evidencia de UI.** Para que el E2E deje capturas y `caso.md`, exportá `AIDLC_EVIDENCIAS` apuntando a la carpeta `calidad/evidencias/ui` del workspace (no a su carpeta padre) y, si hace falta, `AIDLC_NAVEGADOR=chromium`. Ejemplo: `AIDLC_EVIDENCIAS=.aidlc/reservatuclase/calidad/evidencias/ui npx playwright test tests/e2e/cuentas.spec.ts --project=chromium`.
- Si `supabase status` falla mientras un contenedor se reinicia, las pruebas aceptan `RTC_ANON_KEY` explícita.

**Producción:** proyecto Supabase Free, Gmail 465 desde la cuenta dedicada `agendaclasesapp@gmail.com` (`GMAIL_USER`, `GMAIL_APP_PASSWORD` como secretos, la contraseña sin espacios; DEC-15), web en `https://agendaclasesapp.github.io/reservas/` (DEC-14). El despliegue de la función va sin Docker (`--use-api`), la conexión a la base por el pooler de sesión `aws-1-sa-east-1` y `config push` detrás del guardia de `config diff` (ADR-012). Operación y secretos en `ops/` (ADR-012). Guías de producción: `ops/puesta-en-marcha.md`, `ops/auth.md`, `ops/mails.md`, `ops/rotacion.md`, `ops/incidentes.md` y `ops/verificar-repo.md`; política de seguridad en `SECURITY.md`.

**Puesta en marcha en producción:** el repositorio es público y no lleva datos personales: antes del primer ingreso el operador corre a mano `privado.configurar_administrador('<mail>')`; los profesores se dan de alta desde `#/admin` (B15) y `privado.configurar_profesor('<mail>', '<nombre>', '<slug>')` queda como herramienta del operador. Opcional: el secreto de Vault `url_sitio` para que el mail de alta lleve el enlace completo. Pasos en `ops/puesta-en-marcha.md`. Para pasar una instalación de un solo profesor a varios, seguir `ops/migracion-multiprofesor.md` (migración en dos fases, desplegada por tramos `prod-b14` → `prod-b15a` → `prod-b15b` → `prod-b06`, con vuelta atrás ensayada hasta la contracción). Revisar cada semana `privado.ejecucion_proceso`.

## 5. Dónde está cada cosa

| Ruta | Contenido |
| --- | --- |
| `src/modulos/<m>/logica/` y `vistas/` | Lógica (developer) y presentación (ux-web) por módulo: agenda, ingreso, ficha, solicitud, mis-clases, panel, lista, configuracion |
| `src/lib/`, `src/ui/`, `src/rutas.tsx` | Cliente Supabase, fechas, errores; sistema de diseño; rutas |
| `supabase/migrations/`, `supabase/functions/enviar-mail/`, `supabase/tests/` | Base, Edge Function, pruebas pgTAP |
| `tests/unit`, `tests/integracion`, `tests/e2e` | Pruebas |
| `.github/workflows/`, `scripts/seguridad/`, `ops/` | Pipeline y guía de operación |
| `docs/` | Esta documentación; `docs/specs/` es la especificación |
| `.aidlc/reservatuclase/` | Artefactos del ciclo: requisitos, arquitectura (ADR-001..021), ux, calidad (plan de 117 casos en `calidad/casos/`), estado |

## 6. Reglas que conviene saber antes de tocar nada

- Los permisos los aplica solo RLS (ADR-001); la SPA no autoriza.
- Un hueco admite una sola reserva pendiente o confirmada, garantizado por la base (RES-01, ADR-002).
- Un solo huso horario por profesor (ADR-004); cada reserva guarda el huso con que se creó, así que cambiar el huso no mueve clases ni series ya pactadas (ADR-022).
- Las series se materializan con horizonte de 26 semanas (ADR-003).
- Se anonimiza en lugar de borrar (ADR-011): a los 6 meses de la última clase con cualquier profesor, con aviso 7 días antes (ALU-10, AVI-06). DEC-39 (período de gracia si el proceso estuvo parado) se cerró sin gracia: si el proceso estuvo parado más de 7 días, quien opera revisa a mano antes de reactivarlo (`ops/operacion.md` §5).
- Los procesos programados `recordatorios` y `retencion` se revisan cada semana con `ops/operacion.md`.
- La hora de negocio sale de `public.app_ahora()`, nunca de `now()`; el reloj de prueba solo se habilita en local con `seed.sql` (ADR-014).
- El rol y el vínculo con alumno o profesor se asignan solo con el mail confirmado (ADR-007).
- Topes anti-abuso fijos (DEC-12, DEC-27): 10 solicitudes pendientes por alumno con cada profesor, 10 fichas por hora por profesor de origen, 20 mails por hora y 200 por día por profesor y 400 por día en toda la aplicación; cambiarlos exige un CR. El pedido de código lleva CAPTCHA (Turnstile, DEC-13).
- El motivo de rechazo de una cuenta se muestra a esa cuenta y se borra con la retención (DEC-22, ALU-10).
- La agenda pública se lee con `postgrest-js` y `supabase-js` se carga diferido (ADR-017); las rutas de la SPA son `#/`, `#/p/<slug>` (agenda de un profesor), `#/ingreso`, `#/ficha`, `#/solicitud`, `#/mis-clases`, `#/panel`, `#/lista`, `#/configuracion` y `#/admin` (ADR-007, ADR-020).
- Una persona es una sola ficha; el vínculo con cada profesor es una `inscripcion` y los permisos por profesor los aplica RLS (ADR-018). Nunca se lista a los profesores: se entra por el enlace.
- Los mails de un profesor salen con su nombre y Reply-To; los de la aplicación y los códigos de ingreso, como «Agenda Clases App» (ADR-019, CR-003).
- Las decisiones DEC-01..23 están cerradas en G1: ver `.aidlc/reservatuclase/analisis/decisiones-abiertas.md` (la tabla de arriba es la vigente). Los cambios que trajeron están en `.aidlc/reservatuclase/cambios/CR-001.md`.

- **Accesibilidad y celular (B12).** Todo control táctil mide al menos 44 px (`--tactil-min`); un enlace que va solo en su renglón usa `EnlaceAccion` de `src/ui/`, no un `<a>` suelto. Las pruebas `accesibilidad.spec.ts` y `celular.spec.ts` fallan si una pantalla nueva rompe axe, desborda a 360 px o tiene controles chicos. Detalle y verificación manual pendiente en `tecnica/plataforma.md` §9.

## 7. Glosario

Enlace del profesor, vínculo, serie (clases que se repiten cada semana o cada quince días), solicitud pendiente (pedido de clase que espera respuesta), profesor inactivo (pausa), Administrador, Agenda Clases App, grilla semanal (tramos horarios por día), tramo, hueco (espacio de una clase), libre/ocupado/bloqueado, bloqueo, anticipación mínima, titular, persona a cargo, alumno sin cuenta, alumno pendiente, ficha, reserva, serie, solicitud, alcance («solo esta clase» / «de acá en adelante»), unión de alumnos, teléfono normalizado, RLS, registro de mails fallidos. Definiciones completas: `.aidlc/reservatuclase/analisis/glosario.md`.

## 8. A quién preguntar

Por área, según los perfiles del ciclo: requisitos (funcional), diseño técnico (arquitecto), pantallas (ux-web), lógica y base (developer), pruebas (tester), pipeline y secretos (devops). Los nombres de personas no constan en los artefactos; completar.

## Bitácora de versiones

| Versión | Fecha | Bolt | IDs | Cambio |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-10-21 | inception | spec §1-2, ADR-001..013 | Primera versión desde el diseño |
| 0.2 | 2026-10-21 | inception | ADR-007, ADR-014..016, DEC-12 | Reglas nuevas, paso manual de puesta en marcha, plan de casos |
| 0.3 | 2026-10-21 | construcción (hito spikes S01-S03 y CR-001) | CR-001, DEC-12..15, DEC-22, ADR-005, 007, 012, 017 | SMTP local, URL de la función, cuenta y sitio de producción, despliegue sin Docker, topes y CAPTCHA fijos, decisiones cerradas |
| 0.4 | 2026-10-21 | B01 | SEC-12, SEC-13, SEC-16, SEC-20, ADR-007, 012, 016, 017 | Arranque local (`npx supabase`, `.env.example`, scripts), cómo correr cada suite, enlaces a `ops/` y `tecnica/plataforma.md` |
| 0.5 | 2026-10-22 | B02-B05 | SEC-16, CA-44 | Notas para correr las pruebas: CAPTCHA de prueba, reinicio del stack, `AIDLC_EVIDENCIAS` |
| 0.6 | 2026-10-23 | B14 | CR-002, CR-003, ADR-018..021, ADM-01, WEB-12, DEC-25..37 | Varios profesores, Administrador, enlace por profesor, topes nuevos, puesta en marcha y migración; nombre «Agenda Clases App» |
| 0.7 | 2026-10-23 | B15, B06 | ADM-02, ADM-05, SOL-10, ADR-021, DEC-38 | Estado de los bolts construidos, alta de profesores desde `#/admin`, secreto `url_sitio`, despliegue por tramos, glosario |
| 0.8 | 2026-10-23 | B07, B08, B09, B11 | ALU-10, AVI-05, AVI-06, DEC-39, SEC-28 | Estado de los bolts construidos, retención y runbook de operación |
| 0.9 | 2026-10-26 | B10, B11 | AGE-08, DEC-39, ADR-022 | Huso por reserva y DEC-39 cerrada |
| 0.10 | 2026-10-28 | B12 | NFR-05, NFR-06, CA-37, CA-38 | Regla de accesibilidad y uso en celular |
