---
titulo: Funcional · Agenda, reservas y solicitudes
version: 0.2
fecha: 2026-10-21
publico: negocio y equipo
---
# Agenda, reservas y solicitudes

> Describe el comportamiento **diseñado** (catálogo v1.0); nada está construido ni verificado todavía.

## Agenda y disponibilidad
- El profesor define la grilla semanal (uno o más tramos por día; inicial lunes a viernes 08:00-13:00 y 14:00-18:00) y una duración única de clase; los huecos salen consecutivos desde el inicio de cada tramo y un resto menor que la duración no genera hueco (AGE-01, AGE-02).
- Cambiar grilla o duración no altera clases confirmadas ni solicitudes pendientes (AGE-03; series: DEC-06).
- **Anticipación mínima**: el alumno no puede pedir, mover ni cancelar clases que empiezan antes del plazo, y recibe el motivo; no limita al profesor (AGE-04, PRF-04). En un movimiento rige para origen y destino (DEC-07, opción por defecto).
- Bloqueos de un hueco, un rango de horas o días completos, con motivo opcional; se rechazan si cubren una clase confirmada o solicitud pendiente, indicando cuáles; quitarlos libera los huecos (AGE-05, AGE-06).
- Un único huso horario configurable para todo (AGE-08, DEC-08).
- **Calendario público**: cualquiera ve cada hueco como libre, ocupado o bloqueado, sin nombres, observaciones ni motivos; un hueco con solicitud pendiente se ve ocupado (AGE-07, WEB-01).

## Reservas
- Cada hueco admite una sola reserva pendiente o confirmada; ante dos pedidos simultáneos, el segundo ve que el hueco ya no está libre (RES-01).
- Una reserva es una clase suelta o una serie semanal o quincenal sin fecha de fin hasta cancelarse; sus fechas futuras ocupan los huecos (RES-02; el diseño las materializa 26 semanas hacia adelante, ADR-003).
- Indica quién toma la clase (titular o persona a cargo) y admite una observación de texto libre (RES-03, RES-04). No hay reglas distintas para clases grupales: un hueco, una reserva.
- Al pedir una serie, las fechas ocupadas o bloqueadas se saltean y se muestran antes de enviar (RES-05, WEB-04).
- El alumno ve sus clases futuras y pasadas con fecha, hora, quién la toma y estado (RES-06, WEB-05).

## Solicitudes

| Tipo | Quién | Mientras está pendiente | Si el profesor confirma | Si rechaza |
| --- | --- | --- | --- | --- |
| Reserva (SOL-01) | Alumno aprobado | El hueco queda ocupado | Pasa a confirmada | Libera el hueco |
| Movimiento (SOL-02) | Alumno, alcance «solo esta clase» o «de acá en adelante» | Destino ocupado; la clase sigue confirmada en el origen | La clase va al destino y el origen se libera | Se libera el destino; la clase queda |
| Cancelación (SOL-03) | Alumno, con alcance si es serie | La clase sigue confirmada | Se cancela y se libera | La clase sigue confirmada |

- El profesor confirma o rechaza con motivo opcional, que llega por mail (SOL-04, SOL-05, SOL-06). Confirmar es atómico (NFR-03).
- «De acá en adelante» confirmado termina la serie en esa fecha; en un movimiento nace una serie nueva desde el destino con la misma frecuencia, salteando fechas ocupadas o bloqueadas (SOL-07).
- La solicitud no vence: si pasa el horario queda en el historial como «pendiente sin respuesta»; por defecto ya no se puede responder (SOL-08, DEC-09).
- El alumno solo ve y gestiona lo suyo; sobre lo ajeno la operación se rechaza (SOL-09, NFR-01).

## Topes anti-abuso (propuesta)
El diseño prevé topes (solicitudes pendientes por alumno, mails por hora y por día, cuentas nuevas por hora) con el error `LIMITE_EXCEDIDO` (429), pero están **desactivados** hasta que se resuelva DEC-12; exige un pedido de cambio porque la spec no los incluye (ADR-016, SEC-10, SOL-01).

## Bitácora de versiones

| Versión | Fecha | Bolt | IDs | Cambio |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-10-21 | inception | AGE-01..08, RES-01..06, SOL-01..09, WEB-01/04/05 | Primera versión |
| 0.2 | 2026-10-21 | inception | SOL-01, SEC-10, DEC-12, ADR-016 | Topes anti-abuso como propuesta desactivada |
