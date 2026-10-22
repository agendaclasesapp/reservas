---
titulo: Índice de la documentación · ReservaTuClase
version: 0.5
fecha: 2026-10-22
publico: todos
---
# Índice de la documentación

Estado: B01 a B05 (plataforma, agenda pública, mails, ingreso y cuentas) construidos; lo funcional sigue describiendo lo **diseñado** hasta que cada bolt lo verifique.

| Documento | Propósito | Público |
| --- | --- | --- |
| [onboarding.md](onboarding.md) | Qué es el sistema, piezas, cómo se levanta, dónde está cada cosa, glosario | Equipo nuevo |
| [funcional/alumnos-y-cuentas.md](funcional/alumnos-y-cuentas.md) | Ingreso, ficha, aprobación, unión, retención | Negocio, equipo |
| [funcional/agenda-reservas-solicitudes.md](funcional/agenda-reservas-solicitudes.md) | Agenda, reservas y solicitudes | Negocio, equipo |
| [funcional/profesor-y-avisos.md](funcional/profesor-y-avisos.md) | Gestión directa, vista lista, avisos y mails | Negocio, equipo |
| [tecnica/configuracion-y-despliegue.md](tecnica/configuracion-y-despliegue.md) | Entornos, correo local, secretos, despliegue, ingreso, carga de la agenda (medido en spikes) | Equipo técnico, operación |
| [tecnica/plataforma.md](tecnica/plataforma.md) | Estructura del repo, scripts npm, pipeline, sesión, UI compartida, CAPTCHA de prueba, puesta en marcha del profesor | Equipo técnico |
| [tecnica/base-y-contratos-b02-b05.md](tecnica/base-y-contratos-b02-b05.md) | Migraciones, RPC, errores del catálogo y topes construidos en B02 a B05 | Equipo técnico |
| [tecnica/decisiones.md](tecnica/decisiones.md) | Resumen de los ADR 001..017 y lo que cambiaron los spikes | Equipo técnico |
| [manuales/alumno.md](manuales/alumno.md) | Ver la agenda, ingresar, ficha, personas a cargo, estado de la cuenta | Alumnos, visitantes |
| [manuales/profesor.md](manuales/profesor.md) | Cuentas pendientes, unión, alumnos, mails fallidos | Profesor |
| `specs/` | Especificación original (no se modifica desde la documentación) | Equipo |

Pendientes de escribir: resto de la documentación técnica (arquitectura, modelo de datos completo), diagramas de secuencia y los manuales de lo que falte construir (ver `.aidlc/reservatuclase/documentacion/plan.md`).

## Bitácora de versiones

| Versión | Fecha | Bolt | IDs | Cambio |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-10-21 | inception | — | Índice inicial |
| 0.2 | 2026-10-21 | inception | — | Sin documentos nuevos; versiones de onboarding y funcional al día |
| 0.3 | 2026-10-21 | construcción (hito spikes S01-S03 y CR-001) | CR-001 | Dos documentos técnicos nuevos; onboarding y funcional al día |
| 0.4 | 2026-10-21 | B01 | — | Documento técnico nuevo `plataforma.md`; onboarding 0.4 |
| 0.5 | 2026-10-22 | B02-B05 | — | Documento técnico nuevo `base-y-contratos-b02-b05.md`; manuales de alumno y profesor; onboarding 0.5 |
