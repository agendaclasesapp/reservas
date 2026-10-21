---
titulo: Onboarding · ReservaTuClase
version: 0.3
fecha: 2026-10-21
publico: equipo nuevo
---
# Onboarding · ReservaTuClase

> Estado: **diseño de inception**. Todavía no hay código; lo marcado «(diseñado)» se verificará cuando exista.

## 1. Qué es

Aplicación web gratuita para un profesor de tenis. Cualquiera ve los huecos libres de la agenda; los alumnos aprobados piden, mueven o cancelan clases; el profesor confirma cada pedido y es el único que ve quién ocupa cada hueco. Hay un solo profesor, pero todo dato queda asociado a un profesor para sumar más en el futuro (spec §1). Fuera de alcance: pagos, WhatsApp, feriados automáticos, app instalable, dominio propio.

## 2. Actores

Visitante, alumno pendiente, alumno (titular), persona a cargo (no inicia sesión), alumno sin cuenta (no inicia sesión ni recibe mails), profesor (único administrador), proceso programado (pg_cron) y tarea de mantenimiento (GitHub Actions). Detalle en spec §2.

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

Fuente: `.aidlc/reservatuclase/arquitectura/componentes.md`; decisiones en `arquitectura/adr/` (ADR-001..017).

## 4. Cómo se levanta en local (diseñado)

Requisitos: Node, Docker, Supabase CLI 2.x. Pasos previstos:

1. `supabase start` (Docker) y `supabase db reset` (aplica migraciones y `seed.sql`: profesor y grilla de desarrollo).
2. `npm install` y `npm run dev`.
3. Los mails salen al buzón de prueba local (Inbucket/Mailpit); ahí se ve el código de ingreso. La Edge Function lo alcanza como `inbucket:1025` sin TLS, y la base llama a la función en `http://kong:8000/functions/v1/enviar-mail` (guardada en Vault como `url_funcion_mail`). Los valores locales van en `supabase/.env.development`, nunca en `supabase/.env`. Detalle y motivos: `tecnica/configuracion-y-despliegue.md` (medido en los spikes S01 y S02).

Producción: proyecto Supabase Free, Gmail 465 desde la cuenta dedicada `agendaclasesapp@gmail.com` (`GMAIL_USER`, `GMAIL_APP_PASSWORD` como secretos, la contraseña sin espacios; DEC-15), web en `https://agendaclasesapp.github.io/reservas/` (DEC-14). El despliegue de la función va sin Docker (`--use-api`), la conexión a la base por el pooler de sesión `aws-1-sa-east-1` y `config push` detrás del guardia de `config diff` (ADR-012). Operación y secretos en `ops/` (ADR-012). Estos comandos no están verificados: confirmar en el bolt B01.

**Puesta en marcha en producción (diseñado):** antes del primer ingreso del profesor hay que correr a mano `privado.configurar_profesor` con su mail, porque el repositorio es público y no lleva datos personales (ADR-015). Revisar cada semana `privado.ejecucion_proceso` (`ops/operacion.md`).

## 5. Dónde está cada cosa (diseñado)

| Ruta | Contenido |
| --- | --- |
| `src/modulos/<m>/logica/` y `vistas/` | Lógica (developer) y presentación (ux-web) por módulo: agenda, ingreso, ficha, solicitud, mis-clases, panel, lista, configuracion |
| `src/lib/`, `src/ui/`, `src/rutas.tsx` | Cliente Supabase, fechas, errores; sistema de diseño; rutas |
| `supabase/migrations/`, `supabase/functions/enviar-mail/`, `supabase/tests/` | Base, Edge Function, pruebas pgTAP |
| `tests/unit`, `tests/integracion`, `tests/e2e` | Pruebas |
| `.github/workflows/`, `ops/` | Pipeline y guía de operación |
| `docs/` | Esta documentación; `docs/specs/` es la especificación |
| `.aidlc/reservatuclase/` | Artefactos del ciclo: requisitos, arquitectura (ADR-001..017), ux, calidad (plan de 117 casos en `calidad/casos/`), estado |

## 6. Reglas que conviene saber antes de tocar nada

- Los permisos los aplica solo RLS (ADR-001); la SPA no autoriza.
- Un hueco admite una sola reserva pendiente o confirmada, garantizado por la base (RES-01, ADR-002).
- Un solo huso horario: el del profesor (ADR-004).
- Las series se materializan con horizonte de 26 semanas (ADR-003).
- Se anonimiza en lugar de borrar (ADR-011).
- La hora de negocio sale de `public.app_ahora()`, nunca de `now()`; el reloj de prueba solo se habilita en local con `seed.sql` (ADR-014).
- El rol y el vínculo con alumno o profesor se asignan solo con el mail confirmado (ADR-007).
- Topes anti-abuso fijos por CR-001 (DEC-12): 5 solicitudes pendientes por alumno, 10 fichas por hora, 20 mails por hora y 200 por día; cambiarlos exige un CR. El pedido de código lleva CAPTCHA (Turnstile, DEC-13).
- El motivo de rechazo de una cuenta se muestra a esa cuenta y se borra con la retención (DEC-22, ALU-10).
- La agenda pública se lee con `postgrest-js` y `supabase-js` se carga diferido (ADR-017); las rutas de la SPA son `#/`, `#/ingreso`, `#/ficha`, `#/solicitud`, `#/mis-clases`, `#/panel`, `#/lista` y `#/configuracion` (ADR-007).
- Las decisiones DEC-01..23 están cerradas en G1: ver `.aidlc/reservatuclase/analisis/decisiones-abiertas.md` (la tabla de arriba es la vigente). Los cambios que trajeron están en `.aidlc/reservatuclase/cambios/CR-001.md`.

## 7. Glosario

Grilla semanal (tramos horarios por día), tramo, hueco (espacio de una clase), libre/ocupado/bloqueado, bloqueo, anticipación mínima, titular, persona a cargo, alumno sin cuenta, alumno pendiente, ficha, reserva, serie, solicitud, alcance («solo esta clase» / «de acá en adelante»), unión de alumnos, teléfono normalizado, RLS, registro de mails fallidos. Definiciones completas: `.aidlc/reservatuclase/analisis/glosario.md`.

## 8. A quién preguntar

Por área, según los perfiles del ciclo: requisitos (funcional), diseño técnico (arquitecto), pantallas (ux-web), lógica y base (developer), pruebas (tester), pipeline y secretos (devops). Los nombres de personas no constan en los artefactos; completar.

## Bitácora de versiones

| Versión | Fecha | Bolt | IDs | Cambio |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-10-21 | inception | spec §1-2, ADR-001..013 | Primera versión desde el diseño |
| 0.2 | 2026-10-21 | inception | ADR-007, ADR-014..016, DEC-12 | Reglas nuevas, paso manual de puesta en marcha, plan de casos |
| 0.3 | 2026-10-21 | construcción (hito spikes S01-S03 y CR-001) | CR-001, DEC-12..15, DEC-22, ADR-005, 007, 012, 017 | SMTP local, URL de la función, cuenta y sitio de producción, despliegue sin Docker, topes y CAPTCHA fijos, decisiones cerradas |
