---
titulo: Técnica · Base de datos, RPC y errores construidos (B02 a B05)
version: 0.2
fecha: 2026-10-23
publico: equipo técnico
---
# Base de datos, RPC y errores construidos (B02 a B05)

> Estado: **construido y verificado** en los bolts B02 (agenda), B03 (mails), B04 (ingreso) y B05 (cuentas). Es un resumen de lo construido; la fuente completa es `.aidlc/reservatuclase/arquitectura/contratos.md` (§1 errores, §2 lecturas, §3 RPC, §4 función de mails, §5 Auth). Sin valores secretos.

## 1. Migraciones (`supabase/migrations/`)

| Migración | Bolt | Qué hace | IDs |
| --- | --- | --- | --- |
| `202611000201_agenda_tablas` | B02 | Tablas `grilla_tramo` (con la semilla inicial lunes a viernes, 08-13 y 14-18), `bloqueo`, `reserva` y `clase` con la exclusión de RES-01; RLS de lectura; sin políticas de escritura | AGE-01, RES-01, NFR-01 |
| `202611000202_agenda_rpc` | B02 | `agenda_publica`, `guardar_configuracion`, `guardar_grilla` | AGE-07, SEC-09 |
| `202611000301_mail_salida` | B03 | Cola `mail_salida`, vista `v_mails_fallidos` y `privado.encolar_mail` con tope | AVI-07, AVI-08, NFR-07 |
| `202611000302_disparo_y_barrido_mails` | B03 | Disparo a la Edge Function y barrido de envíos sin confirmar | H-017 |
| `202611000303_mail_destinatario_invalido` | B03 | `privado.es_mail_simple`; un destinatario inválido no aborta la operación | H-141 |
| `202611000401_vinculacion_auth` | B04 | Triggers sobre `auth.users` que vinculan usuario con alumno o profesor; límites de entrada de la ficha | ADR-007, ADR-013, SEC-09 |
| `202611000402_sesion_y_ficha` | B04 | `sesion_actual`, `completar_ficha`, `guardar_persona_a_cargo`, tope de fichas | ALU-02, ALU-06, ALU-13 |
| `202611000403_sin_contrasena` | B04 | Trigger que deja vacía la contraseña de `auth.users`: no hay ingreso por contraseña | ALU-01, SEC-14, H-180 |
| `202611000501_union_y_v_alumnos` | B05 | Vista `v_alumnos`, sugerencias y unión | ALU-04, ALU-05, ALU-09 |
| `202611000502_cuentas_mails_y_union` | B05 | `aprobar_cuenta`, `rechazar_cuenta`, mails `cuenta_nueva` y `cuenta_respondida`, `unir_alumnos`, `descartar_union` | ALU-03, AVI-02, AVI-03 |
| `202611000503_alta_y_edicion_alumno` | B05 | `alta_alumno`, `editar_alumno` | ALU-07, ALU-08 |
| `202611000504_v_alumnos_solo_lectura` | B05 | `v_alumnos` de solo lectura (escritura da 401 o 403) | H-210 |

Las migraciones ya aplicadas no se editan: un cambio nuevo va en una migración nueva (por ejemplo 303 sobre 301).

## 2. RPC por bolt

| RPC | Rol | Bolt | Notas |
| --- | --- | --- | --- |
| `agenda_publica(p_dia)` | anon y alumno | B02 | `[{inicio, fin, estado}]` con libre, ocupado o bloqueado; nada más. Día válido entre hoy menos 366 días y hoy más el horizonte más 31 días; fuera de eso, 422 `DATOS_INVALIDOS` con `p_dia` |
| `guardar_configuracion`, `guardar_grilla` | profesor | B02 | Duración 1 a 1440 min; anticipación 0 a 8784 h; huso IANA; hasta 50 tramos sin solape. Sin pantalla aún |
| `sesion_actual()` | sesión | B04 | `{rol, alumno_id, estado, nombre, mail, motivo_rechazo}`; el motivo solo si está rechazado |
| `completar_ficha` | alumno | B04 | `{estado: "pendiente"}`; 409 `FICHA_YA_COMPLETA` (la web lo toma como éxito); 429 `LIMITE_EXCEDIDO` con 10 fichas por hora |
| `guardar_persona_a_cargo` | alumno | B04 | Alta con id nulo, edición con id; sin baja |
| `aprobar_cuenta`, `rechazar_cuenta` | profesor | B05 | Aprobar acepta pendiente o rechazada y borra el motivo anterior (H-037); rechazar, solo pendiente |
| `sugerencias_union`, `unir_alumnos`, `descartar_union` | profesor | B05 | Unir reasigna toda FK hacia `alumno(id)` y borra el alumno sin cuenta en una transacción |
| `alta_alumno`, `editar_alumno` | profesor | B05 | Con mail queda aprobado sin usuario; sin mail, sin cuenta; el mail de una cuenta con usuario no se edita |

Lecturas nuevas: `v_mails_fallidos` (B03; `id`, `fecha` = `creado_en`, destinatario, tipo, motivo; nunca asunto ni cuerpo) y `v_alumnos` (B05; incluye `con_usuario` y `edad` calculada con `app_ahora()` en el huso del profesor; excluye fichas incompletas y borrados).

Firma interna de B03: `privado.encolar_mail(p_tipo, p_alumno_id, p_destinatario, p_asunto, p_cuerpo) returns uuid`. Con `p_destinatario` nulo usa el titular del alumno; devuelve nulo si el alumno es sin cuenta, borrado o sin mail (AVI-04).

## 3. Errores del catálogo que aparecen en estos bolts

| Código | HTTP | Cuándo |
| --- | --- | --- |
| `FICHA_INCOMPLETA` | 403 | Operación que exige ficha completa (por ejemplo personas a cargo) |
| `FICHA_YA_COMPLETA` | 409 | `completar_ficha` repetido; entró al catálogo en B04 |
| `CUENTA_NO_PENDIENTE` | 409 | Aprobar o rechazar una cuenta que ya no está en ese estado |
| `UNION_NO_VALIDA` | 409 | Par que no es cuenta aprobada más alumno sin cuenta con el mismo teléfono normalizado |
| `MAIL_YA_REGISTRADO` | 409 | Alta o edición con el mail de otro alumno o del profesor |
| `DATOS_INVALIDOS` | 422 | Campo fuera de los límites de `contratos.md` §1, con `details.campo` |
| `LIMITE_EXCEDIDO` | 429 | Tope de fichas (`{"tope":"fichas","limite":10}`); el de 5 solicitudes pendientes llega en B06 |

Sin sesión, una RPC de alumno o profesor responde 401 con `42501` porque no tiene `grant` para anon; la web lo trata como no autenticado.

## 4. Topes

| Tope | Valor | Dónde se aplica | Qué pasa al superarlo |
| --- | --- | --- | --- |
| Fichas completadas | 10 por hora | `completar_ficha` | 429 `LIMITE_EXCEDIDO`; la cuenta sigue sin ficha y no sale mail al profesor (CA-43) |
| Mails encolados | 20 por hora y 200 por día | `privado.encolar_mail` | La fila nace `fallido` con motivo `TOPE`; la operación que la origina se completa (AVI-08). Los destinatarios inválidos nacen `DESTINATARIO_INVALIDO` y no cuentan |

Los valores son fijos por CR-001 y se miden con `app_ahora()`. **Desde B14 los topes son por profesor y hay uno global de 400 mails por día; el de solicitudes pendientes es 10 por alumno y profesor** (ver `varios-profesores-b14.md` §5). Motivos de fallo de un mail: `TOPE`, `SIN_CONFIRMACION` (un envío en curso más de 10 minutos pasa a fallido sin reintento), `DESTINATARIO_INVALIDO` o el texto del servidor SMTP.

## 5. Permisos de `mail_salida` (ADR-005)

El profesor lee de `mail_salida` solo `id`, `tipo`, `destinatario`, `estado`, `motivo_fallo` y `creado_en` (permiso por columna). `service_role` queda con `select` y `update(estado, motivo_fallo)`; `intentado_en` y `enviado_en` los fija un trigger con `app_ahora()`.

## 6. Capa web

- Módulos nuevos o completados: `src/modulos/agenda` (`useAgendaDia`, `useConfigPublica`, `limitesAgenda`, `diaEnLimites`; vistas con `AgendaDia` y su `vista` cargando, error o listo), `ingreso`, `ficha`, `lista` y `configuracion` (sección «Mails fallidos»).
- El campo de fecha de la agenda es el `input type=date` nativo (`CampoFecha`).
- Ingreso: el pedido del código exige el desafío CAPTCHA; los errores visibles son código incorrecto, vencido, «esperá un minuto para pedir otro» y desafío rechazado (`src/modulos/ingreso/logica/codigo.ts`). «Continuar con Google» no carga el desafío.

## Preguntas abiertas para su dueño

- `contratos.md` §3 dice que el mail de `completar_ficha` lo agrega B05; ya está construido (migración 502). Pendiente de que el Arquitecto lo retire de la nota «en B04 no se encola».

## Bitácora de versiones

| Versión | Fecha | Bolt | IDs | Cambio |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-10-22 | B02-B05 | AGE-07, AVI-02, AVI-03, AVI-08, ALU-02..09, ALU-13, NFR-07, ADR-005, ADR-013 | Primera versión: migraciones, RPC, errores y topes construidos |
| 0.2 | 2026-10-23 | B14 | CR-002 | Nota: topes por profesor y global desde B14 |
