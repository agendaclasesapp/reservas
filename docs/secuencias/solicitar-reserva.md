---
titulo: Secuencia · Pedir una reserva
version: 0.1
fecha: 2026-10-23
publico: equipo técnico
---
# Secuencia · Pedir una reserva (SOL-01, RES-05, SOL-10)

Cruza la SPA, la base (RPC y RLS), la cola de mails y la Edge Function, y tiene reglas de negocio (vínculo aprobado, tope, anticipación, hueco libre). Los nombres son los de `arquitectura/contratos.md` §3 y §4.

## Flujo principal

```mermaid
sequenceDiagram
    autonumber
    actor A as Alumno
    participant W as SPA (módulo solicitud)
    participant R as RPC previsualizar_serie / solicitar_reserva
    participant D as Base (reserva, clase, solicitud)
    participant M as mail_salida
    participant F as Edge Function enviar-mail
    actor P as Profesor

    A->>W: Toca un hueco libre de la agenda del profesor
    W->>R: previsualizar_serie(p_profesor_id, p_inicio, p_frecuencia) [solo serie]
    R-->>W: [{inicio, estado reservable/salteada, motivo ocupado/bloqueado}]
    W-->>A: Lista de fechas que se saltean
    A->>W: Envía el pedido
    W->>R: solicitar_reserva(p_profesor_id, p_inicio, p_tipo, p_frecuencia, p_persona_a_cargo_id, p_observacion)
    R->>R: Valida en orden: rol, ficha, vínculo aprobado, profesor activo, tope de 10, campos, persona a cargo, grilla, anticipación
    R->>D: Crea reserva pendiente, sus clases pendientes (ocupan el hueco) y la solicitud
    D-->>R: Exclusión RES-01: hueco libre o 409 HUECO_NO_LIBRE
    R->>M: privado.encolar_mail(solicitud_nueva al profesor, sin la observación)
    R-->>W: {solicitud_id, reserva_id, fechas, salteadas}
    W-->>A: «Pedido enviado»; el horario figura Ocupado
    M-->>F: Disparo (pg_net) al confirmar la transacción
    F->>P: Mail por SMTP; si falla, fila fallida visible en Configuración
```

La operación se completa aunque el mail falle: el mail se encola en la misma transacción y la Edge Function lo envía después (ADR-005; `varios-profesores-b14.md` §5 para remitente y topes).

## Fallos que maneja el flujo

| Paso | Error | Efecto | Lo que ve el alumno |
| --- | --- | --- | --- |
| 5 | 403 `FICHA_INCOMPLETA` | No se escribe nada | Lo lleva a la ficha |
| 5 | 403 `CUENTA_NO_APROBADA` | No se escribe nada | Aviso del estado de su cuenta con ese profesor |
| 5 | 409 `PROFESOR_INACTIVO` | No se escribe nada | «No toma reservas por ahora» |
| 5 | 429 `LIMITE_EXCEDIDO` `{"tope":"pendientes","limite":10}` | No se escribe nada | El mensaje dice el límite |
| 5 | 422 `FUERA_DE_GRILLA` o `ANTICIPACION_INSUFICIENTE` | No se escribe nada | Motivo en el formulario |
| 6 | 409 `HUECO_NO_LIBRE` (también un `23P01`) | La transacción se deshace, nada queda ocupado | «El horario ya no está libre» |

Ejemplo de la serie: semanal desde el lunes 23/11 con el 01/12 bloqueado: `fechas` trae las reservables y `salteadas` trae el 01/12; la serie se materializa hasta hoy más el horizonte y `extender_series` (03:10 UTC) la sigue extendiendo.

## Qué pasa después (otras secuencias)

El profesor responde con `responder_solicitud` (`confirmar` pasa reserva y clases a confirmada; `rechazar` las pasa a rechazada y libera el hueco) y el alumno recibe `solicitud_respondida` con el nombre del profesor y Reply-To. Ver `tecnica/solicitudes-gestion-y-retencion-b07-b11.md` §3.

Fuente: `contratos.md` §3 (`solicitar_reserva`, `previsualizar_serie`) y §4; manual del alumno (`manuales/alumno.md`, «Pedir una clase»).

## Bitácora de versiones

| Versión | Fecha | Bolt | IDs | Cambio |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-10-23 | B07-B11 (hito) | SOL-01, SOL-10, RES-01, RES-05, AVI-02, ADR-005 | Primera versión, pendiente del hito de B06 |
