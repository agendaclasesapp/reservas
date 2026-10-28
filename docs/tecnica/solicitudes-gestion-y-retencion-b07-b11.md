---
titulo: Técnica · Respuesta, movimientos, gestión del profesor y retención (B07 a B11)
version: 0.1
fecha: 2026-10-23
publico: equipo técnico
---
# Respuesta, movimientos, gestión del profesor y retención (B07, B08, B09, B11)

> Estado: construido y verificado por los testers de cada bolt (pgTAP, integración y E2E). Resumen de lo construido; la fuente completa es `.aidlc/reservatuclase/arquitectura/contratos.md` (§1 errores, §2 lecturas, §3 RPC), `componentes.md` §3 y §4 y ADR-008, ADR-011, ADR-018, ADR-019. DEC-39 está **pendiente del humano** (§7). Sin valores secretos. B10 (bloqueos) aún no se construyó.

## 1. Migraciones (`supabase/migrations/`)

| Migración | Bolt | Qué hace | IDs |
| --- | --- | --- | --- |
| `202611000701_profesor_en_inscripcion` | B07 | `inscripcion` suma `profesor_nombre`, `profesor_slug` y `profesor_zona_horaria` (copias de `profesor`); las mantienen los triggers `inscripcion_datos_profesor` y `profesor_datos_en_inscripcion` | ADR-018 |
| `202611000702_vistas_clases_y_solicitudes` | B07 | Vistas `v_mis_clases`, `v_clases` y `v_solicitudes_pendientes` (solo lectura) | WEB-05, WEB-07 |
| `202611000703_responder_solicitud` | B07 | `responder_solicitud`, `privado.aplicar_respuesta` (rama de reserva) y el mail `solicitud_respondida` | SOL-04..06, AVI-03 |
| `202611000801_solicitar_movimiento_y_cancelacion` | B08 | `solicitar_movimiento`, `solicitar_cancelacion`, `privado.validar_solicitud_sobre_clase`, `exigir_anticipacion`, `clase_origen_vigente`; reemplaza `mail_solicitud_nueva` con la misma firma | SOL-02, SOL-03, SOL-10 |
| `202611000802_responder_movimiento_y_cancelacion` | B08 | `privado.responder_movimiento`, `responder_cancelacion`, `terminar_serie`; reemplaza `aplicar_respuesta` y `mail_solicitud_respondida` con la misma firma | SOL-04..07 |
| `202611000901_agenda_profesor_y_contadores` | B09 | `agenda_profesor` y `contadores` | PRF-05, AVI-01, WEB-06 |
| `202611000902_crear_clase` | B09 | `crear_clase`; mail `clase_creada` | PRF-01, PRF-04, AVI-04 |
| `202611000903_mover_y_cancelar_clase` | B09 | `mover_clase`, `cancelar_clase`; mails `clase_movida` y `clase_cancelada` | PRF-02, PRF-03, AVI-04 |
| `202611001101_ultimo_ingreso_y_vencimiento` | B11 | `privado.vence_inactividad_en`, `privado.vencimientos_inactividad`; el trigger `al_ingresar_usuario` también limpia `aviso_inactividad_en` | ALU-10, ALU-11 |
| `202611001102_anonimizar_y_retencion` | B11 | `privado.cerrar_agenda_alumno`, `privado.anonimizar_alumno`, `privado.retencion` | ALU-10 |
| `202611001103_borrar_alumno` | B11 | RPC `borrar_alumno` | ALU-12 |
| `202611001104_ejecucion_proceso` | B11 | Registro `privado.ejecucion_proceso` y `privado.correr_proceso` | SEC-28 |
| `202611001105_recordatorios` | B11 | Proceso de recordatorios del día anterior | AVI-05 |
| `202611001106_aviso_y_retencion` | B11 | Aviso de inactividad 7 días antes y retención con aviso | AVI-06 |
| `202611001107_programacion_cron` | B11 | Jobs `recordatorios` y `retencion` en `cron.job` (idempotente, con nombre) | ADR-008 |

Las ya aplicadas no se editan: un cambio nuevo va en una migración nueva. `TIPO_SIN_RESPUESTA` (XX000) es el código interno del despachador de B07 que B08 reemplazó (`contratos.md` §1, «Códigos internos»).

## 2. Esquema y modelo

- **`inscripcion` con datos del profesor (B07).** El alumno lee `profesor_nombre`, `profesor_slug` y `profesor_zona_horaria` de su vínculo sin tocar `profesor`; los triggers mantienen la copia (ADR-018, «Ajustes de T07.1»).
- **Fecha de la solicitud.** En un movimiento `fecha_clase = least(origen, destino)`; una solicitud vence cuando `fecha_clase <= app_ahora()`.
- **Fin de serie «de acá en adelante».** `hasta` = día previo a la clase (o el mismo día si es la primera); una serie cancelada desde su primera clase queda con la reserva cancelada; movida desde la primera conserva su estado; `movida_a` solo en la clase de origen (`componentes.md` §4, H-361). La serie nueva del destino saltea fechas ocupadas o bloqueadas.
- **Solicitud vencida.** No cuenta para el tope ni traba nada. Si el alumno pide mover o cancelar esa misma clase, la vencida se anula sin mail y su destino se cancela; responderla da `SOLICITUD_YA_RESPONDIDA` (H-360). La anulación se deshace con cualquier error del pedido nuevo.
- **Retención.** `privado.vence_inactividad_en` calcula el vencimiento por persona, con todos sus profesores (DEC-26): 6 meses desde la última clase con cualquier profesor y sin clases futuras con ninguno; sin clases, desde el registro o la última aprobación. Cada ingreso renueva el plazo y el trigger `al_ingresar_usuario` limpia `aviso_inactividad_en`. Si una clase posterior corre el vencimiento después de un aviso, llega un aviso nuevo con la fecha nueva. `privado.anonimizar_alumno` borra nombre, mail, teléfono, nacimiento, cómo llegó, motivo de rechazo, personas a cargo, observaciones, motivos de solicitud, los datos de los mails que la nombran y la cuenta de ingreso (lo que Auth guarda del usuario); las clases pasadas quedan. Un mail suyo `pendiente` o `enviando` pasa a `fallido`, sin destinatario, asunto, cuerpo ni motivo, y no se envía.
- **Persona sin datos para el profesor.** `v_clases.titular` y `quien_toma` salen nulos cuando la inscripción está en `baja` o la persona fue anonimizada; la web muestra «Alumno dado de baja».

## 3. RPC y lecturas

| Objeto | Rol | Bolt | Notas |
| --- | --- | --- | --- |
| `responder_solicitud(p_solicitud_id, p_decision, p_motivo)` | profesor | B07, B08 | Orden: rol, decisión, solicitud suya, activo (solo confirmar), pendiente, no vencida, motivo (hasta 500 tras `btrim`). Reserva: confirmar pasa reserva y clases a confirmada; rechazar libera el hueco. Movimiento: confirmar ocupa el destino y deja el origen `movida`, o termina la serie desde esa fecha; rechazar deja todo. Cancelación: confirmar cancela la clase o la serie desde esa fecha. Encola `solicitud_respondida` con nombre del profesor y Reply-To. Errores: 404 (inexistente o de otro profesor, igual), 409 `PROFESOR_INACTIVO`, `SOLICITUD_YA_RESPONDIDA`, `SOLICITUD_VENCIDA`, `CLASE_NO_MODIFICABLE`, 422 `motivo` |
| `solicitar_movimiento(p_clase_id, p_destino, p_alcance)` | alumno | B08 | Crea la reserva destino (pendiente, ocupa), la solicitud y el mail `solicitud_nueva`; el origen sigue confirmado. Orden: rol, ficha, clase, vínculo, activo, tope, alcance, clase modificable, en curso, destino, grilla, anticipación (origen y luego destino), hueco |
| `solicitar_cancelacion(p_clase_id, p_alcance)` | alumno | B08 | Solo crea la solicitud y el mail; el mismo orden hasta «en curso» y luego la anticipación del origen |
| `agenda_profesor(p_dia)` | profesor | B09 | Un año atrás a un año adelante. Por hueco: quién toma la clase, titular, observación, estado, motivo del bloqueo y, al final, `reserva_tipo` y `pasada`. `solicitud_id` coincide con lo que `mover_clase` y `cancelar_clase` rechazan |
| `contadores()` | profesor | B09 | `{solicitudes_pendientes, cuentas_pendientes}`: solicitudes pendientes todavía respondibles y cuentas pendientes de personas no borradas; las vencidas siguen en la lista, aparte |
| `crear_clase(...)` | profesor | B09 | Persona con vínculo `aprobado` o `sin_cuenta`; sin anticipación mínima; horario futuro hasta 366 días en el huso del profesor (422 en `p_inicio` si no); queda confirmada; mail `clase_creada` solo con vínculo aprobado. Con una persona sin vínculo vigente da siempre el mismo 403, que no revela si existe (SEC-06, CA-52, H-370) |
| `mover_clase(p_clase_id, p_destino, p_alcance)` | profesor | B09 | Nace una reserva confirmada desde el destino (mismo rango, 422 en `p_destino`); el origen pasa a `movida`; mail `clase_movida`. Clase ajena o inexistente: 404 |
| `cancelar_clase(p_clase_id, p_alcance)` | profesor | B09 | Libera huecos; mail `clase_cancelada`. No exige agenda activa (PRF-08) |
| `borrar_alumno(p_alumno_id)` | profesor | B11 | Sin mails: anula solicitudes pendientes, cancela clases futuras, cierra series, limpia observaciones y motivos, deja la inscripción en `baja` y, sin usuario ni otro vínculo, anonimiza. Devuelve `{clases_canceladas, solicitudes_anuladas}`. No exige agenda activa; 404 si no existe, es de otro profesor o ya está en `baja` |

Vistas (solo lectura; POST, PATCH y DELETE dan 42501): `v_mis_clases` (clases de todos los profesores, cada una con `profesor_nombre`, `profesor_slug` y `zona_horaria`, `solicitud_pendiente` y `pasada`; el estado del vínculo y el motivo de rechazo salen de `sesion_actual()`), `v_clases` (las del profesor, pasadas incluidas, filtrables por `inicio` y `alumno_id`) y `v_solicitudes_pendientes` (ordenada por `fecha_clase`, con `vencida`, origen y destino). Un bolt posterior puede sumar columnas al final, no quitar ni renombrar (`contratos.md` §2).

## 4. Errores nuevos o ampliados

| Código | HTTP | Cuándo |
| --- | --- | --- |
| `SOLICITUD_EN_CURSO` | 409 | Hay un pedido vigente sobre esa clase o, en una serie, uno «de acá en adelante» pendiente de una clase anterior (o lo nuevo es «de acá en adelante» y hay pedidos en las siguientes). También lo dan `mover_clase` y `cancelar_clase`: el profesor responde primero. Las vencidas no cuentan |
| `SOLICITUD_YA_RESPONDIDA` | 409 | Responder una solicitud ya respondida o anulada (incluida la vencida que se anula al pedir otra) |
| `SOLICITUD_VENCIDA` | 409 | Responder una solicitud cuya `fecha_clase` ya pasó (DEC-09) |
| `CLASE_NO_MODIFICABLE` | 409 | La clase no está confirmada o ya empezó |
| `ANTICIPACION_INSUFICIENTE` | 422 | El detalle `inicio` dice si falla el origen o el destino |
| `PROCESO_FALLIDO` | — | Interno de `privado.correr_proceso` (§5) |

Una clase ajena en `solicitar_movimiento` o `solicitar_cancelacion` da 403 `PROHIBIDO`, lo que revela que el uuid existe. Hay que documentar que se acepta por ser un uuid v4 no listable, o pasarlo a 404 (H-365, pendiente de su dueño). El tope de 10 cuenta solicitudes: una «de acá en adelante» suma 1 aunque abarque una serie (H-366).

## 5. Procesos programados y operación (ADR-008, SEC-28)

| Job | Horario | Qué hace |
| --- | --- | --- |
| `recordatorios` | cada 15 min (`*/15 * * * *`) | Recordatorio al titular de cada clase confirmada, de 24 h a 23 h 45 min antes (AVI-05) |
| `retencion` | 03:30 UTC | Aviso 7 días antes del vencimiento (AVI-06) y anonimización de los vencidos (ALU-10) |
| `barrer_mails`, `extender_series` | — | Siguen con `select privado.<fn>()` |

- `retencion` y `recordatorios` corren con `call privado.correr_proceso('<nombre>')`. Cada corrida deja una fila en `privado.ejecucion_proceso` (nombre, ahora, inicio, fin, ok, error, cantidades). Si falla queda `ok = false` con SQLSTATE y mensaje, y `cron.job_run_details` la marca `failed` con `PROCESO_FALLIDO`.
- La tabla crece unas 97 filas por día y no se depura sola: se depura a mano (`ops/operacion.md` §6).
- Pendiente de verificar en el proyecto alojado: `cron.use_background_workers` en `off` (H-358, `ops/operacion.md` §1).
- Runbook de la revisión semanal: `ops/operacion.md`.

## 6. Mails nuevos (`ops/mails.md`)

| Tipo | Destinatario | Asunto | Remitente |
| --- | --- | --- | --- |
| `solicitud_respondida` | titular | «<Profesor> confirmó o rechazó tu solicitud de reserva» (también «de cambio de horario» y «de cancelación») | nombre del profesor, Reply-To a su mail |
| `solicitud_nueva` (movimiento y cancelación) | profesor | «Solicitud de cambio de horario: <alumno>», «Aviso de que no puede ir: <alumno>» | Agenda Clases App |
| `clase_creada`, `clase_movida`, `clase_cancelada` | titular con cuenta | «<Profesor> te reservó una clase», «<Profesor> cambió el horario de tu clase», «<Profesor> canceló tu clase» | nombre del profesor, Reply-To a su mail |
| recordatorio | titular | recordatorio de clase | nombre del profesor, Reply-To a su mail |
| aviso de inactividad | persona | aviso con la fecha del borrado (huso de la aplicación) | Agenda Clases App |

El cuerpo trae fecha y hora en el huso del profesor con su nombre, quién toma la clase y, en una serie, las fechas salteadas; nunca fechas de nacimiento (SEC-29). Del recordatorio, la persona a cargo aporta solo el nombre. El motivo del profesor llega al alumno como texto plano sin filtrar enlaces (H-350, baja, sin corregir; alcanza también a los mails de movimiento y cancelación); el asunto y el remitente sí pasan por `privado.nombre_remitente` y `encolar_mail`. Un alumno sin cuenta no recibe mails.

## 7. DEC-39 pendiente del humano

Si `retencion` estuvo parada más de 7 días, la primera corrida al volver anonimiza a quienes vencieron sin haber recibido el aviso, y el borrado no se deshace. **Comportamiento actual (opción a):** se borra igual; el runbook pide revisar a quién alcanzaría antes de reactivar (`ops/operacion.md` §5). El Arquitecto y SecDevOps recomiendan la opción (b), un período de gracia de 7 días tras el aviso. Si no se decide, queda para G3; SEC-27 se reescribe cuando se decida. Detalle: `.aidlc/reservatuclase/aprobacion/DEC-39-borrado-sin-aviso.md`.

## 8. Capa web

Módulos: `mis-clases` (pestañas, Mover y Avisar que no voy), `lista` (solicitudes, clases filtradas, Borrar) y `panel` (agenda del profesor, avisos, Crear, Mover y Cancelar). El mensaje «Pedido enviado» con las fechas salteadas es un texto de interfaz nuevo que no está en la spec ni en el catálogo de textos.

## Preguntas abiertas para su dueño

- DEC-39 (humano) y H-365 (403 o 404 en clase ajena).
- ADR-016 y algunos pasajes de `contratos.md` aún dicen 5 pendientes: el Arquitecto debe conciliarlos con SOL-10.

## Bitácora de versiones

| Versión | Fecha | Bolt | IDs | Cambio |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-10-23 | B07, B08, B09, B11 | SOL-02..08, PRF-01..05, AVI-01, AVI-04..06, ALU-10..12, SEC-28, ADR-008, ADR-011, DEC-39 | Primera versión: migraciones, RPC, errores, procesos programados, mails y DEC-39 |
