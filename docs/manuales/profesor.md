---
titulo: Manual de usuario · Agenda Clases App · Profesor
version: 0.4
fecha: 2026-10-23
publico: profesor
---
# Manual de usuario · Agenda Clases App · Profesor

> Este manual cubre solo lo **construido y verificado** hasta B05, B14, B07, B08, B09 y B11: tu enlace, cuentas pendientes, alumnos (incluidos los que ya tienen cuenta con otro profesor), responder solicitudes, el panel con la agenda del día, crear, mover y cancelar clases, borrar alumnos, la agenda en pausa y «Mails fallidos». Los bloqueos (Bloquear y Desbloquear llegan en B10) y el resto de la configuración se suman cuando se construyan y verifiquen. Antes del primer ingreso, el Administrador te da de alta con tu mail, tu nombre y tu enlace (te llega el mail «Tu agenda en Agenda Clases App» con tu enlace); si lo hace quien opera el sistema, ver `tecnica/plataforma.md` §7 y `ops/puesta-en-marcha.md`. Tu nombre es público en tu enlace y tu mail lo ven tus alumnos como dirección de respuesta (DEC-34).

## Tu enlace
En **Configuración** ves tu enlace (`…/reservas/#/p/<enlace>`) con el botón **Copiar enlace**. Es lo que repartís a tus alumnos: quien lo abre ve tu agenda y, al completar su ficha desde ahí, queda pendiente con vos. Solo el Administrador define o cambia el enlace. Si tu cuenta es también la del Administrador, el menú suma **Administración**. Fuente: handoffs de UX y desarrollo de B14 (WEB-08, AGE-09, ADM-04).

## Responder una cuenta pendiente
En `#/lista`, la sección **Cuentas pendientes** muestra cada ficha completa con nombre, teléfono y edad.
1. **Aprobar:** un clic. Si hay un alumno sin cuenta con el mismo teléfono, se abre «Posible alumno repetido» (ver siguiente tarea). El titular recibe un mail.
2. **Rechazar:** se abre un diálogo con «Motivo (opcional)», hasta 500 caracteres, y el aviso «La persona va a ver este motivo en su ficha y en Mis clases, y le llega por mail.». Si pasás de 500 caracteres el diálogo marca el error y la cuenta sigue pendiente.
3. Una cuenta rechazada aparece en la sección Alumnos con el estado Rechazado y un botón **Aprobar**; al aprobar, el motivo anterior se borra.

Fuente: `WEB-07-rechazar/caso.md`, `WEB-03-rechazo/caso.md` (ALU-03, AVI-03, CA-45).

## Unir un alumno repetido
1. Al aprobar una cuenta con el mismo teléfono que un alumno sin cuenta (por ejemplo «099 123-456» y «+598 99123456») se muestran las dos fichas lado a lado.
2. **Unir cuentas:** las clases y el historial pasan a la cuenta y el alumno sin cuenta deja de existir.
3. **No unir:** todo queda igual y no se vuelve a sugerir.
4. **Decidir después:** se cierra el diálogo sin cambios.

Fuente: `WEB-07/caso.md`, `WEB-07-descartar/caso.md` (CA-04, ALU-04, ALU-05).

## Ver y gestionar alumnos
La sección **Alumnos** de `#/lista` es una tabla en pantallas grandes y tarjetas en el celular. Muestra estado (en texto e ícono), ficha y edad calculada; no lista fichas incompletas ni alumnos borrados.
1. **Agregar alumno:** completá nombre, teléfono, fecha de nacimiento y, si querés, el mail. Con mail, la persona entra con ese mail; sin mail aparece el aviso «No podrá ingresar ni recibirá mails.».
2. **Editar:** cambia los datos. El mail no se puede cambiar si la persona ya ingresó. Si el mail ya lo usa otro alumno tuyo, otro profesor o el Administrador, el campo Mail lo indica. Agregar a mano un mail que ya tiene cuenta no asocia a la persona: dice «ese mail ya tiene cuenta». Si le agregás un mail nuevo a un alumno que no tenía cuenta, la persona recibe el aviso «te sumó como alumno» igual que en el alta; no se envía si el mail no cambia, si lo quitás ni si cambiás el de quien ya tenía uno.
3. **Alta con el mail de alguien que ya usa la app:** si el mail es de una persona con cuenta (por ejemplo, alumna de otro profesor), queda como alumna tuya, aprobada, con la ficha que ya tenía; la pantalla dice «Ese mail ya tenía cuenta: la persona quedó como alumna tuya, con la ficha que ya tenía.» y ella recibe un aviso. Con el mail de un profesor o del Administrador el alta se rechaza («Ese mail ya está registrado y no se puede usar acá»).
4. **Ficha no editable:** solo editás las fichas que cargaste vos, sin cuenta y sin otro profesor; las demás dicen «Ficha no editable» (editar la de una persona con cuenta da 403, DEC-32).

Fuente: handoff de UX de B05 y B14, `WEB-07/caso.md`, `WEB-07-alta-asociada/caso.md` (ALU-07, ALU-08, ALU-09, DEC-29, DEC-32, DEC-36).

## Responder solicitudes
En `#/lista` las secciones van en este orden: **Solicitudes pendientes**, **Clases**, **Cuentas pendientes** y **Alumnos**.
1. **Solicitudes pendientes** viene ordenada por la fecha de la clase. Cada fila dice qué se pide: una reserva, un cambio de horario (con la clase de origen y el nuevo horario) o un aviso de que no puede ir, con el alcance («solo esta clase» o «de acá en adelante»).
2. **Confirmar** o **Rechazar**. Al rechazar se abre un diálogo con un motivo opcional de hasta 500 caracteres que le llega a la persona por mail. El motivo llega como texto plano, sin enlaces filtrados.
3. Qué pasa al confirmar: una reserva pasa a confirmada (en una serie, todas sus clases); un cambio de horario lleva la clase al nuevo hueco y libera el original (en «de acá en adelante» termina la serie en esa fecha y nace otra desde el destino, salteando fechas ocupadas o bloqueadas); un «no puedo ir» cancela la clase, o la serie desde esa fecha, y libera los huecos. Al rechazar queda todo como estaba (una reserva libera el hueco).
4. Con la agenda inactiva **Confirmar** queda deshabilitado con «Tu agenda está inactiva…»; **Rechazar** sigue disponible.
5. Una solicitud cuyo horario ya pasó figura como **Pendientes sin respuesta**, sin acciones; no se puede responder.
6. La sección **Clases** lista las de tu agenda, pasadas incluidas, y se filtra por **Desde**, **Hasta** y **Alumno** (en tu huso); anuncia el total.

El alumno recibe un mail con tu nombre como remitente y tu mail en «Responder a», con la fecha y hora en tu huso. Fuente: handoffs de B07 y B08, `tests/integracion/respuestas`, E2E de respuestas (SOL-04..08, PRF-06, WEB-07, AVI-03).

## Panel: la agenda del día y la gestión directa
El **panel** muestra el día elegido con cada hueco: hora, estado y, si está ocupado, quién toma la clase, el titular, la observación y si está **confirmada** o **pendiente de respuesta** (un hueco bloqueado muestra su motivo). Tiene el mismo selector de día que la agenda pública (de un año atrás a un año adelante). Arriba, los avisos «N solicitudes pendientes» y «N cuentas pendientes» con enlace a la lista; solo cuentan las solicitudes que todavía se pueden responder y los accesos pendientes de personas no borradas, y cada profesor ve solo los suyos.

**Crear una clase.** Tocá un hueco libre: se abre «Crear clase».
1. Buscá un alumno aprobado o sin cuenta; si tiene personas a cargo, elegí quién toma la clase.
2. Elegí clase suelta o serie semanal o quincenal y, si querés, una observación.
3. Si el alumno tiene mail, el formulario avisa «Se enviará un mail al titular». Al crear queda **confirmada** al instante y el éxito dice «Le avisamos por mail al titular.» Un alumno sin cuenta, o aprobado sin mail, no recibe mail.
4. No rige la anticipación mínima, pero el horario tiene que ser futuro, de tu grilla y a menos de un año.

**Mover una clase.** Tocá una clase confirmada y **Mover**: elegí día y horario libres de destino y, en una serie, «solo esta clase» o «de acá en adelante». Queda confirmada al instante; «de acá en adelante» corta la serie y crea otra desde el destino, salteando fechas bloqueadas u ocupadas (el mail dice «serie»).

**Cancelar.** Tocá la clase y **Cancelar**: confirmá con el alcance. Libera los huecos.

Después de cada acción el resultado se anuncia en una región de estado y el foco queda ahí, también en el celular. El alumno recibe un mail (`<Profesor> te reservó una clase`, `cambió el horario de tu clase` o `canceló tu clase`) con tu nombre y tu mail en «Responder a».

**Si el alumno tiene un pedido sin responder**, el panel no ofrece mover ni cancelar esa clase: primero respondé el pedido en la lista. Lo mismo pasa con las siguientes de la serie si el pedido es «de acá en adelante». Un pedido vencido ya no traba nada. Mover o cancelar una clase ajena o inexistente da «no encontrada».

Con la **agenda inactiva**, Crear y Mover quedan deshabilitados con su explicación y **Cancelar** sigue; el panel sigue funcionando.

Fuente: handoffs de B09 (PRF-01..05, PRF-08, AVI-01, AVI-04, WEB-06, CA-52, CA-55). Bloquear y Desbloquear llegan en B10.

## Borrar un alumno
En la sección **Alumnos** cada fila tiene **Borrar**. Se abre un diálogo que explica qué pasa: se cancelan sus clases futuras con vos y se liberan los horarios; sus solicitudes pendientes se anulan; sus series se cierran; **no se avisa por mail**. Si la persona **tiene cuenta**, su cuenta y su ficha siguen y deja de figurar en tu lista (lo suyo con otros profesores no cambia); si **no tenía cuenta** ni otro profesor, se borran sus datos y sus personas a cargo. Confirmá con **Borrar alumno**; la pantalla anuncia el resumen de clases canceladas. Sus clases pasadas quedan como **Alumno dado de baja**, igual que cuando una persona se borra por inactividad (6 meses; ver `funcional/alumnos-y-cuentas.md`). Borrar sigue disponible con la agenda inactiva. Fuente: handoffs de B11 (ALU-12, DEC-05, DEC-26, CA-57).

## Si el Administrador pausa tu agenda
Tu enlace pasa a decir que no tomás reservas por ahora; nadie te pide acceso ni crea solicitudes nuevas. Todas tus solicitudes pendientes, también las vencidas, se anulan (sin mail a los alumnos) y los huecos que ocupaban se liberan; las reservas y clases confirmadas se mantienen. En tu panel seguís viendo todo y podés cancelar clases o series y rechazar; la lista avisa que tu agenda está inactiva, no deja aprobar accesos y «Agregar alumno» queda deshabilitado. Al reactivarte todo vuelve como estaba, y los huecos que ocupaban las solicitudes anuladas vuelven a figurar libres para pedirse de nuevo, pero **las solicitudes anuladas no se restablecen**; recargá la página para ver tu agenda activa. Mientras estás inactivo tu agenda pública no se muestra. La pausa la aplica el Administrador (`manuales/administrador.md`). Fuente: `WEB-01-inactivo/` y `WEB-07-inactivo/` (AGE-11, PRF-08, ADM-05, DEC-35, DEC-37).

## Revisar los mails fallidos
En **Configuración**, la sección «Mails fallidos» lista fecha (en tu huso), destinatario, tipo y motivo de cada mail que no salió: tope de envío superado, envío sin confirmar, dirección inválida o un error del servidor de correo (con pista cuando son las credenciales). La operación que originó el mail se completó igual. No se muestran asunto ni cuerpo. Los mails que mandás a tus alumnos (respuestas, clases creadas, movidas o canceladas y el recordatorio del día anterior a cada clase confirmada) salen con tu nombre y con tu mail en «Responder a». Cada profesor puede encolar 20 mails por hora y 200 por día, y toda la aplicación 400 por día: pasado un tope el mail queda fallido con motivo «tope» (AVI-08). Estado: construida y verificada con pruebas automáticas; la prueba con la casilla Gmail real está pendiente de G3. Fuente: handoff de UX y de pruebas de B03 (NFR-07, CA-34).

## Bitácora de versiones

| Versión | Fecha | Bolt | IDs | Cambio |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-10-22 | B03, B05 | WEB-07, WEB-08, ALU-03..09, AVI-03, CA-04, CA-34, CA-45, NFR-07 | Primera versión: cuentas, unión, alumnos y mails fallidos |
| 0.2 | 2026-10-23 | B14 | CR-002, CR-003, AGE-09, AGE-11, ALU-07, ALU-08, PRF-08, WEB-08, AVI-08, DEC-29, DEC-32, DEC-35..37 | Tu enlace, alta con persona existente, ficha no editable, agenda en pausa, remitente y topes por profesor; nombre del producto |
| 0.3 | 2026-10-23 | B15, B06 | ADM-02, ADM-05, DEC-38, AVI-04, CA-63 | Alta por el Administrador, aviso al sumar un mail, pausa que anula pendientes |
| 0.4 | 2026-10-23 | B07, B08, B09, B11 | SOL-04..08, PRF-01..06, AVI-01, AVI-04, AVI-05, ALU-10, ALU-12, WEB-06, WEB-07, CA-52, CA-55, CA-57 | Responder solicitudes, cambios y avisos de ausencia, panel con agenda del día y gestión directa, borrar alumno, remitente de mails |
