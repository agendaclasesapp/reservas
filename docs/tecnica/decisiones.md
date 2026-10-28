---
titulo: Técnica · Decisiones de arquitectura (resumen)
version: 0.5
fecha: 2026-10-26
publico: equipo técnico
---
# Decisiones de arquitectura (resumen)

Resumen de los ADR vigentes; el texto completo está en `.aidlc/reservatuclase/arquitectura/adr/`. Estado: diseño, con varios ADR ajustados por los spikes.

| ADR | Decisión | Estado |
| --- | --- | --- |
| 001 | RLS como única capa de autorización | Aceptada |
| 002 | Escrituras en funciones transaccionales; exclusión de huecos; errores PTxxx | Aceptada |
| 003 | Series materializadas con horizonte de 26 semanas | Aceptada |
| 004 | Un único huso horario, el del profesor | Aceptada; completada por la 022 |
| 005 | Mails por outbox, Edge Function SMTP y registro de fallos | Aceptada; ajustada tras S01 |
| 006 | Agenda del día en una RPC, pública sin datos personales | Aceptada; confirmada por S03 |
| 007 | Ingreso con Google (PKCE) y código, con rutas hash | Aceptada; ajustada tras S02 |
| 008 | Procesos programados con pg_cron y reloj inyectable | Aceptada |
| 009 | Mantenimiento: consulta cada 3 días | Aceptada |
| 010 | Herramientas y capas del frontend | Aceptada; Datos modificado por ADR-017 |
| 011 | Retención: anonimizar en lugar de borrar | Aceptada |
| 012 | Pipeline, despliegue y secretos | Aceptada; ajustada tras S01 y S02 |
| 013 | Una tabla de alumnos; unión por teléfono | Aceptada |
| 014 | `app_ahora()`; reloj de prueba solo local | Aceptada |
| 015 | Fila del profesor sin datos personales en el repositorio | Reemplazada por la 018 |
| 016 | Topes anti-abuso configurables | Ver nota abajo |
| 017 | Agenda: postgrest-js y supabase-js diferido | Aceptada (S03) |
| 018 | Varios profesores: persona única, inscripción por profesor, enlace, Administrador y pausa | Aceptada (CR-002); **reemplaza a la 015** |
| 019 | Mails y topes por profesor: remitente con su nombre, Reply-To, tope global de 400 por día | Aceptada (CR-002; el nombre del servicio, por CR-003) |
| 020 | Rutas por profesor (`#/p/<slug>`), inicio sin listado, selector y nueva `sesion_actual` | Aceptada (CR-002) |
| 021 | Migración de producción en dos fases y orden de despliegue de B14, B15 y B06 | Aceptada (CR-002) |
| 022 | Una serie conserva el huso con el que se creó (`reserva.zona_horaria`) | Aceptada (B10, H-393; completa ADR-003 y ADR-004) |

Qué cambió con los spikes:

- **ADR-005 (ajuste de B03, 2026-10-25, H-130):** el disparo de `enviar-mail` ya no manda el secreto: lleva `x-mail-ts` y `x-mail-firma` (HMAC-SHA256 con `MAIL_SECRETO` de `<ts>.<cuerpo>`); 401 si falta, no coincide o `ts` está a más de 300 s. Detalle en `base-y-contratos-b02-b05.md` §5.
- **ADR-022 (B10, H-393):** cada reserva guarda el huso con el que se creó; ver `configuracion-y-bloqueos-b10.md`.
- **ADR-005 (S01):** nodemailer con TLS implícito en producción; en local `inbucket:1025` sin TLS; URL de la función y secreto del disparo en Vault; el disparo lleva solo `ids`; tiempos y `SIN_CONFIRMACION`; contraseña de aplicación sin espacios (H-017, H-018, H-019).
- **ADR-006 (S03):** una clase que solapa en parte un hueco lo marca ocupado; la que no solapa ninguno se agrega como ocupada. `agenda_profesor` muestra cada clase con su inicio y fin reales.
- **ADR-007 (S02):** canje explícito del código de Google, `getUser()` al abrir, errores del código indistinguibles en Supabase Auth (H-020, H-021, H-022, H-023).
- **ADR-012 (S01, S02):** despliegue con `--use-api`, pooler de sesión, guardia de `config diff`, valores locales en `.env.development`.
- **ADR-017 (S03):** lectura pública con cliente REST liviano.
- **ADR-016 y CR-001:** los topes son 5 solicitudes pendientes por alumno, 20 mails por hora, 200 por día y 10 fichas por hora, fijos en la spec (DEC-12), más CAPTCHA en el pedido de código (DEC-13). El texto actual de ADR-016 sigue en «propuesta, sujeta a DEC-12 y DEC-13» y los contratos dicen «sujeto a DEC-12»: el Arquitecto debe actualizarlos (CR-001 §3).

- **ADR-018 a ADR-021 (CR-002, B14, B15, B06):** resumen y estado en `varios-profesores-b14.md`. ADR-018 suma «Anulación al inactivar» (B06: al pausar a un profesor se anulan sus solicitudes pendientes, DEC-35, DEC-37) y ADR-021 el despliegue por tramos `prod-b14`, `prod-b15a`, `prod-b15b`, `prod-b06` con la contracción comprobada por `P0004`. La 016 pasa a topes por profesor y globales (10 pendientes por alumno y profesor, 400 mails por día).

- **ADR-008 (B11):** `retencion` y `recordatorios` corren con `call privado.correr_proceso('<nombre>')` y registran cada corrida en `privado.ejecucion_proceso`; error `PROCESO_FALLIDO`. Ver `solicitudes-gestion-y-retencion-b07-b11.md` §5.
- **ADR-011 (B11, DEC-26):** la retención anonimiza; el plazo de 6 meses es de la persona con todos sus profesores; borrar un alumno limpia lo suyo con ese profesor. **DEC-39** (período de gracia si el proceso estuvo parado) quedó **cerrada con la opción (a)**: se borra igual a quien venció y el control es la revisión manual del runbook; no se adoptó la gracia de 7 días recomendada.
- **ADR-018 y ADR-019 (B07, B08):** `inscripcion` copia nombre, slug y huso del profesor (triggers); los mails de respuesta, movimiento y cancelación salen con el nombre del profesor y Reply-To.

Detalle operativo: `tecnica/configuracion-y-despliegue.md`.

## Bitácora de versiones

| Versión | Fecha | Bolt | IDs | Cambio |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-10-21 | construcción (hito spikes S01-S03 y CR-001) | ADR-001..017, CR-001 | Primera versión del resumen de ADR |
| 0.2 | 2026-10-23 | B14 | ADR-018..021, CR-002 | ADR-018 a 021; la 015 queda reemplazada |
| 0.3 | 2026-10-23 | B15, B06 | ADR-018, ADR-021, DEC-35, DEC-37 | Anulación al inactivar y despliegue por tramos |
| 0.4 | 2026-10-23 | B07, B08, B11 | ADR-008, ADR-011, ADR-018, ADR-019, DEC-26, DEC-39 | Procesos programados, retención con DEC-39 pendiente y datos del profesor en la inscripción |
| 0.5 | 2026-10-26 | B03, B10, B11 | ADR-005, ADR-022, DEC-39, H-130 | Firma HMAC del disparo de mails, ADR-022 y DEC-39 cerrada |
