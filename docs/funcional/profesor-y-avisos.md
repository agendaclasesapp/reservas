---
titulo: Funcional · Gestión del profesor y avisos
version: 0.4
fecha: 2026-10-23
publico: negocio y equipo
---
# Gestión del profesor y avisos

> Estado tras B03 y B05: **construido** el envío de mails (cola, tope, fallos), la sección «Mails fallidos» de Configuración, los mails de cuenta nueva y cuenta respondida y, en la lista, cuentas pendientes y alumnos. Sigue **diseñado**: gestión directa de clases, solicitudes, recordatorio y resto de la configuración. Pendiente de G3: la prueba con la casilla Gmail real (T-AVI-11).

## Gestión directa del profesor
- Crea una clase suelta o una serie para cualquier alumno, con o sin cuenta, en un hueco libre; queda confirmada sin solicitud (PRF-01).
- Mueve una clase («solo esta clase» o «de acá en adelante») y cancela una clase o una serie desde una fecha; el efecto es inmediato y libera huecos (PRF-02, PRF-03).
- La anticipación mínima no limita sus acciones (PRF-04).
- En la agenda por día es el único que ve quién toma la clase, el titular, la observación y el estado (PRF-05, WEB-06).
- Vista lista: solicitudes pendientes por fecha de clase con confirmar/rechazar; clases filtrables por rango de fechas y alumno, incluidas pasadas; cuentas pendientes con sugerencia de unión; lista de alumnos (PRF-06, WEB-07).
- Configuración: grilla, duración, anticipación, huso horario y registro de mails fallidos (WEB-08, NFR-07).

## Construido en B03 y B05
- **Mails (B03).** Los mails se encolan en la misma operación que los origina y salen por SMTP desde la casilla configurada. Con el stack local salen `cuenta_nueva`, `solicitud_nueva` y `recordatorio` con remitente `GMAIL_USER` (CA-33). Con credenciales SMTP inválidas la fila queda fallida con el texto del servidor (por ejemplo 535) y el profesor la ve; el alumno no ve ninguna (CA-34).
- **«Mails fallidos» en Configuración (WEB-08, NFR-07).** Tabla con fecha (en el huso del profesor), destinatario, tipo en palabras y motivo en palabras: tope superado, envío sin confirmar tras 10 minutos, dirección inválida o el texto del servidor SMTP (con una pista cuando son las credenciales). Nunca muestra asunto ni cuerpo. Solo el profesor la ve.
- **Mails de cuentas (B05).** `cuenta_nueva` al profesor cuando se completa una ficha (AVI-02) y `cuenta_respondida` al titular al aprobar o rechazar, con el motivo si lo hay (AVI-03). No se encolan mails a alumnos sin cuenta, borrados o sin mail (AVI-04).
- **Lista del profesor (`#/lista`, B05).** Secciones «Cuentas pendientes» (Aprobar, Rechazar) y «Alumnos» (Agregar alumno, Editar); detalle en `alumnos-y-cuentas.md` y en el manual del profesor.

## Avisos

| Aviso | Destinatario | Cuándo | ID |
| --- | --- | --- | --- |
| Contadores en la web | Profesor | Solicitudes y cuentas pendientes | AVI-01 |
| Mail | Profesor | Solicitud nueva o cuenta nueva pendiente | AVI-02 |
| Mail | Titular | El profesor confirma o rechaza su solicitud o cuenta, con motivo si lo hay | AVI-03 |
| Mail | Titular | El profesor crea, mueve o cancela una clase suya | AVI-04 |
| Recordatorio | Titular | 24 h antes de cada clase confirmada, una vez (ventana 24 h a 23 h 45 min) | AVI-05 |
| Mail | Titular | 7 días antes del borrado por inactividad | AVI-06 |

- **Remitente (CR-002, CR-003, AVI-07):** los mails de un profesor a su alumno salen con el nombre del profesor y su mail como «Responder a»; los avisos al profesor y los códigos de ingreso, como «Agenda Clases App».
- Todos los mails, incluidos los códigos de ingreso, salen de una casilla Gmail (AVI-07); la decisión DEC-15 fija una cuenta de Google dedicada, `agendaclasesapp@gmail.com`, y no la personal del profesor. Cuota aproximada: 500 mails por día.
- **Tope de mails (CR-001, DEC-12, AVI-08, CA-42):** el sistema encola como máximo **20 mails por hora y 200 por día por profesor** y, desde CR-002, **400 por día en toda la aplicación** (motivo `TOPE_GLOBAL`), porque la cuota de Gmail es una sola. Un mail que supera el tope no se envía: queda registrado como fallido con motivo de tope (visible en Configuración, NFR-07) y la operación que lo originó se completa igual. Los códigos de ingreso que envía Supabase Auth no cuentan en este tope (tienen su propio límite). Estado: construido en B03 (la fila nace fallida con motivo `TOPE`; las direcciones inválidas no cuentan para el tope). El tope se mide con la hora de la aplicación.
- Al rechazar una cuenta, el profesor puede escribir un motivo; la persona lo recibe por mail y lo ve en pantalla (CR-001, DEC-22, AVI-03, ALU-03).
- Los alumnos sin cuenta no reciben mails (AVI-04).
- Si Gmail falla, la operación se completa y el envío queda registrado como fallido, visible en Configuración (NFR-07; diseño por outbox, ADR-005).
- Por defecto no se envía recordatorio de clases creadas con menos de 24 h, y superada la cuota el mail se registra como fallido sin reintento automático (DEC-10).

## Bitácora de versiones

| Versión | Fecha | Bolt | IDs | Cambio |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-10-21 | inception | PRF-01..06, AVI-01..07, WEB-06/07/08, NFR-07 | Primera versión |
| 0.2 | 2026-10-21 | construcción (hito spikes S01-S03 y CR-001) | CR-001, AVI-08, AVI-03, CA-42, DEC-12, DEC-15, DEC-22 | Tope de mails, casilla dedicada, motivo de rechazo |
| 0.3 | 2026-10-22 | B03, B05 | AVI-02, AVI-03, AVI-04, AVI-08, CA-33, CA-34, NFR-07, WEB-07, WEB-08 | Mails con cola y tope, «Mails fallidos», mails de cuentas y lista de cuentas y alumnos construidos |
| 0.4 | 2026-10-23 | B14 | CR-002, CR-003, AVI-07, AVI-08 | Remitente por profesor, tope global de 400 mails por día |
