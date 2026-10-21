---
titulo: Técnica · Decisiones de arquitectura (resumen)
version: 0.1
fecha: 2026-10-21
publico: equipo técnico
---
# Decisiones de arquitectura (resumen)

Resumen de los ADR vigentes; el texto completo está en `.aidlc/reservatuclase/arquitectura/adr/`. Estado: diseño, con varios ADR ajustados por los spikes.

| ADR | Decisión | Estado |
| --- | --- | --- |
| 001 | RLS como única capa de autorización | Aceptada |
| 002 | Escrituras en funciones transaccionales; exclusión de huecos; errores PTxxx | Aceptada |
| 003 | Series materializadas con horizonte de 26 semanas | Aceptada |
| 004 | Un único huso horario, el del profesor | Aceptada |
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
| 015 | Fila del profesor sin datos personales en el repositorio | Aceptada |
| 016 | Topes anti-abuso configurables | Ver nota abajo |
| 017 | Agenda: postgrest-js y supabase-js diferido | Aceptada (S03) |

Qué cambió con los spikes:

- **ADR-005 (S01):** nodemailer con TLS implícito en producción; en local `inbucket:1025` sin TLS; URL de la función y secreto del disparo en Vault; el disparo lleva solo `ids`; tiempos y `SIN_CONFIRMACION`; contraseña de aplicación sin espacios (H-017, H-018, H-019).
- **ADR-006 (S03):** una clase que solapa en parte un hueco lo marca ocupado; la que no solapa ninguno se agrega como ocupada. `agenda_profesor` muestra cada clase con su inicio y fin reales.
- **ADR-007 (S02):** canje explícito del código de Google, `getUser()` al abrir, errores del código indistinguibles en Supabase Auth (H-020, H-021, H-022, H-023).
- **ADR-012 (S01, S02):** despliegue con `--use-api`, pooler de sesión, guardia de `config diff`, valores locales en `.env.development`.
- **ADR-017 (S03):** lectura pública con cliente REST liviano.
- **ADR-016 y CR-001:** los topes son 5 solicitudes pendientes por alumno, 20 mails por hora, 200 por día y 10 fichas por hora, fijos en la spec (DEC-12), más CAPTCHA en el pedido de código (DEC-13). El texto actual de ADR-016 sigue en «propuesta, sujeta a DEC-12 y DEC-13» y los contratos dicen «sujeto a DEC-12»: el Arquitecto debe actualizarlos (CR-001 §3).

Detalle operativo: `tecnica/configuracion-y-despliegue.md`.

## Bitácora de versiones

| Versión | Fecha | Bolt | IDs | Cambio |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-10-21 | construcción (hito spikes S01-S03 y CR-001) | ADR-001..017, CR-001 | Primera versión del resumen de ADR |
