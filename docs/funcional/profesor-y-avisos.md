---
titulo: Funcional · Gestión del profesor y avisos
version: 0.1
fecha: 2026-10-21
publico: negocio y equipo
---
# Gestión del profesor y avisos

> Describe el comportamiento **diseñado** (catálogo v1.0); nada está construido ni verificado todavía.

## Gestión directa del profesor
- Crea una clase suelta o una serie para cualquier alumno, con o sin cuenta, en un hueco libre; queda confirmada sin solicitud (PRF-01).
- Mueve una clase («solo esta clase» o «de acá en adelante») y cancela una clase o una serie desde una fecha; el efecto es inmediato y libera huecos (PRF-02, PRF-03).
- La anticipación mínima no limita sus acciones (PRF-04).
- En la agenda por día es el único que ve quién toma la clase, el titular, la observación y el estado (PRF-05, WEB-06).
- Vista lista: solicitudes pendientes por fecha de clase con confirmar/rechazar; clases filtrables por rango de fechas y alumno, incluidas pasadas; cuentas pendientes con sugerencia de unión; lista de alumnos (PRF-06, WEB-07).
- Configuración: grilla, duración, anticipación, huso horario y registro de mails fallidos (WEB-08, NFR-07).

## Avisos

| Aviso | Destinatario | Cuándo | ID |
| --- | --- | --- | --- |
| Contadores en la web | Profesor | Solicitudes y cuentas pendientes | AVI-01 |
| Mail | Profesor | Solicitud nueva o cuenta nueva pendiente | AVI-02 |
| Mail | Titular | El profesor confirma o rechaza su solicitud o cuenta, con motivo si lo hay | AVI-03 |
| Mail | Titular | El profesor crea, mueve o cancela una clase suya | AVI-04 |
| Recordatorio | Titular | 24 h antes de cada clase confirmada, una vez (ventana 24 h a 23 h 45 min) | AVI-05 |
| Mail | Titular | 7 días antes del borrado por inactividad | AVI-06 |

- Todos los mails, incluidos los códigos de ingreso, salen de la casilla Gmail del profesor (AVI-07). Cuota aproximada: 500 mails por día.
- Los alumnos sin cuenta no reciben mails (AVI-04).
- Si Gmail falla, la operación se completa y el envío queda registrado como fallido, visible en Configuración (NFR-07; diseño por outbox, ADR-005).
- Por defecto no se envía recordatorio de clases creadas con menos de 24 h, y superada la cuota el mail se registra como fallido sin reintento automático (DEC-10).

## Bitácora de versiones

| Versión | Fecha | Bolt | IDs | Cambio |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-10-21 | inception | PRF-01..06, AVI-01..07, WEB-06/07/08, NFR-07 | Primera versión |
