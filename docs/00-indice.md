---
titulo: Índice de la documentación · Agenda Clases App
version: 0.10
fecha: 2026-10-28
publico: todos
---
# Índice de la documentación

Estado: B01 a B05 (plataforma, agenda pública, mails, ingreso y cuentas), B14 (varios profesores), B15 (Administrador), B06 (pedir clases), B07 (responder), B08 (mover), B09 (panel y gestión del profesor) y B11 (retención) construidos; lo funcional sigue describiendo lo **diseñado** hasta que cada bolt lo verifique.

| Documento | Propósito | Público |
| --- | --- | --- |
| [onboarding.md](onboarding.md) | Qué es el sistema, piezas, cómo se levanta, dónde está cada cosa, glosario | Equipo nuevo |
| [funcional/alumnos-y-cuentas.md](funcional/alumnos-y-cuentas.md) | Ingreso, ficha, aprobación, unión, retención | Negocio, equipo |
| [funcional/agenda-reservas-solicitudes.md](funcional/agenda-reservas-solicitudes.md) | Agenda, reservas y solicitudes | Negocio, equipo |
| [funcional/varios-profesores.md](funcional/varios-profesores.md) | Enlace por profesor, vínculos, selector, Administrador, pausa, mails y topes, nombre del producto | Negocio, equipo |
| [funcional/profesor-y-avisos.md](funcional/profesor-y-avisos.md) | Gestión directa, vista lista, avisos y mails | Negocio, equipo |
| [tecnica/configuracion-y-despliegue.md](tecnica/configuracion-y-despliegue.md) | Entornos, correo local, secretos, despliegue, ingreso, carga de la agenda (medido en spikes) | Equipo técnico, operación |
| [tecnica/plataforma.md](tecnica/plataforma.md) | Estructura del repo, scripts npm, pipeline, sesión, UI compartida, CAPTCHA de prueba, puesta en marcha del profesor, accesibilidad y celular (B12) | Equipo técnico |
| [tecnica/base-y-contratos-b02-b05.md](tecnica/base-y-contratos-b02-b05.md) | Migraciones, RPC, errores del catálogo y topes construidos en B02 a B05 | Equipo técnico |
| [tecnica/varios-profesores-b14.md](tecnica/varios-profesores-b14.md) | Modelo multiprofesor, contratos, rutas, mails y topes, nombre visible, migración y vuelta atrás | Equipo técnico, operación |
| [tecnica/configuracion-y-bloqueos-b10.md](tecnica/configuracion-y-bloqueos-b10.md) | `bloquear`, `desbloquear`, configuración de la agenda y huso por reserva (ADR-022) | Equipo técnico |
| [tecnica/solicitudes-gestion-y-retencion-b07-b11.md](tecnica/solicitudes-gestion-y-retencion-b07-b11.md) | Migraciones, RPC, errores, procesos programados y mails de B07, B08, B09 y B11; DEC-39 cerrada | Equipo técnico, operación |
| [secuencias/solicitar-reserva.md](secuencias/solicitar-reserva.md) | Diagrama de secuencia de pedir una reserva, con sus fallos | Equipo técnico |
| [tecnica/decisiones.md](tecnica/decisiones.md) | Resumen de los ADR 001..021 y lo que cambiaron los spikes | Equipo técnico |
| [manuales/alumno.md](manuales/alumno.md) | Ver la agenda, ingresar, ficha, pedir una clase suelta o una serie, Mis clases, mover y avisar que no voy, personas a cargo, estado de la cuenta, borrado de datos | Alumnos, visitantes |
| [manuales/profesor.md](manuales/profesor.md) | Cuentas pendientes, unión, alumnos, responder solicitudes, panel y gestión de clases, borrar alumno, mails fallidos | Profesor |
| [manuales/administrador.md](manuales/administrador.md) | Lista de profesores, alta, pausa y reactivación | Administrador |
| `specs/` | Especificación original (no se modifica desde la documentación) | Equipo |

Pendientes de escribir: resto de la documentación técnica (arquitectura, modelo de datos completo), el resto de los diagramas de secuencia (`responder-solicitud`, `ingreso`, `envio-de-mail`, `recordatorio`) y los manuales de lo que falte construir (bloqueos, B10) (ver `.aidlc/reservatuclase/documentacion/plan.md`).

## Bitácora de versiones

| Versión | Fecha | Bolt | IDs | Cambio |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-10-21 | inception | — | Índice inicial |
| 0.2 | 2026-10-21 | inception | — | Sin documentos nuevos; versiones de onboarding y funcional al día |
| 0.3 | 2026-10-21 | construcción (hito spikes S01-S03 y CR-001) | CR-001 | Dos documentos técnicos nuevos; onboarding y funcional al día |
| 0.4 | 2026-10-21 | B01 | — | Documento técnico nuevo `plataforma.md`; onboarding 0.4 |
| 0.5 | 2026-10-22 | B02-B05 | — | Documento técnico nuevo `base-y-contratos-b02-b05.md`; manuales de alumno y profesor; onboarding 0.5 |
| 0.6 | 2026-10-23 | B14 | CR-002, CR-003 | Documentos nuevos `funcional/varios-profesores.md` y `tecnica/varios-profesores-b14.md`; manuales y onboarding al día; nombre «Agenda Clases App» |
| 0.7 | 2026-10-23 | B15, B06 | ADM-02, WEB-04, WEB-10 | Documento nuevo `manuales/administrador.md`; manual del alumno con pedir clases; resto al día |
| 0.8 | 2026-10-23 | B07, B08, B09, B11 | SOL-02..08, PRF-01..05, ALU-10..12, AVI-05, AVI-06 | Documento técnico nuevo `solicitudes-gestion-y-retencion-b07-b11.md`, secuencia `solicitar-reserva`; manuales y funcional al día; DEC-39 pendiente |
| 0.9 | 2026-10-26 | B03, B10, B11 | AGE-05, AGE-06, AGE-08, WEB-08, ADR-022, H-130, DEC-39 | Documento técnico de B10; manual del profesor con configuración y bloqueos; firma HMAC de mails; DEC-39 cerrada |
| 0.10 | 2026-10-28 | B12 | NFR-05, NFR-06, CA-37, CA-38 | Accesibilidad y uso en celular (B12) en plataforma, manuales y onboarding |
