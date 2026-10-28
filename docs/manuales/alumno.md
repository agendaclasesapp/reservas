---
titulo: Manual de usuario · Agenda Clases App · Alumno y visitante
version: 0.5
fecha: 2026-10-26
publico: alumnos y visitantes
---
# Manual de usuario · Agenda Clases App · Alumno y visitante

> Este manual cubre solo lo **construido y verificado** hasta B05, B14, B06, B07 y B08: entrar por el enlace de tu profesor, ver la agenda, ingresar, completar la ficha, pedir acceso a otro profesor, elegir profesor, **pedir una clase suelta o una serie**, cargar personas a cargo y ver el estado de tu cuenta con cada profesor. Tras B07 y B08 también está **Mis clases** (`#/mis-clases`), con **Mover** y **Avisar que no voy**.

## Ver la agenda (sin ingresar)
1. Abrí el **enlace que te dio tu profesor** (termina en `#/p/<enlace>`). Se muestra su nombre y la agenda del día de hoy según el huso del profesor, aunque tu dispositivo esté en otro huso.
2. Cada horario aparece como **Libre**, **Ocupado** o **Bloqueado**. No se ven nombres ni observaciones de nadie.
3. Para cambiar de día usá el campo de fecha o pasá al día siguiente o al anterior. Un día sin horarios (por ejemplo un domingo) dice «No hay huecos este día».
4. Si falla la conexión aparece un error con el botón **Reintentar**.

Si el enlace no corresponde a nadie, dice «Enlace no válido, pedile el enlace a tu profesor». Si tu profesor tiene la agenda en pausa, dice «<nombre> no toma reservas por ahora» y no muestra horarios ni permite pedir acceso. Si abrís la página de inicio sin enlace, dice «Pedile el enlace a tu profesor» y ofrece ingresar: la aplicación no lista profesores.
Fuente: `calidad/evidencias/ui/WEB-01/caso.md` (CA-15, CA-16, WEB-01, AGE-09, AGE-11, WEB-09).

## Ingresar
No hay contraseñas. Se entra con Google o con un código que llega por mail.
1. Abrí la pantalla de ingreso. Vas a ver **Continuar con Google** y **Entrar con un código por mail**.
2. Con Google: elegí tu cuenta; nombre y mail llegan precargados.
3. Con código: escribí tu mail, resolvé el desafío de seguridad (CAPTCHA) y pedí el código. Sin resolver el desafío la pantalla te avisa y no se envía nada.
4. Aparece «Ingresá el código» con el mail al que se envió. Escribí los 6 dígitos que te llegaron.
5. Si el código es incorrecto o venció se muestra un mensaje; podés pedir otro, pero hay que esperar un minuto entre pedidos.

Fuente: `WEB-02/caso.md` y `WEB-02-captcha/caso.md` (CA-01, CA-44, ALU-01).

## Completar la ficha
La primera vez que ingresás, toda pantalla te lleva a la ficha hasta que la completes.
1. Verificá el mail (ya viene cargado) y escribí nombre, teléfono o WhatsApp y fecha de nacimiento. Si entraste desde el enlace de un profesor, contestá también «¿Cómo llegaste a <profesor>?»; si entraste sin enlace, la ficha no te hace esa pregunta.
2. Si falta un dato, no se guarda: el error aparece junto al campo y el foco va a él.
3. Guardá. Ves «Mi ficha» con tus datos. Si entraste por el enlace de un profesor, «Tus profesores» muestra un bloque con ese profesor y el estado **Pendiente de aprobación**; si entraste sin enlace no quedás vinculado con nadie y ves «Pedile el enlace a tu profesor».
4. Si aparece «Intentá de nuevo más tarde», hubo muchas fichas en la última hora: tu cuenta sigue sin ficha completa; probá de nuevo más tarde.

Fuente: `WEB-03/caso.md`, `WEB-03-tope/caso.md` (CA-02, CA-43, ALU-02, ALU-13).

## Pedir acceso a otro profesor
Tenés una sola cuenta y una sola ficha para todos tus profesores. Para sumar otro, abrí su enlace con tu sesión iniciada y tocá **Pedir acceso a <nombre>**; contestá «cómo llegaste» y enviá. Ves «Pedido enviado» y la agenda pasa a **Acceso pendiente** hasta que ese profesor responda. Fuente: `WEB-11/caso.md` (ALU-14, DEC-33).

## Elegir profesor
Con más de un profesor aparece arriba el selector **Tus profesores** con el estado de cada vínculo. Elegí uno para ver su agenda; el menú «Agenda» te lleva al último elegido. Con un solo profesor no hay selector y se abre su agenda. Si un profesor tiene la agenda en pausa, el selector lo indica. Fuente: `WEB-11/caso.md` (WEB-11, DEC-28).

## Pedir una clase
Para pedir una clase tenés que estar **aprobado por ese profesor**.
1. Abrí la agenda del profesor y tocá un horario **Libre**. Se abre «Pedir clase a <profesor>».
2. Elegí **quién toma la clase**: **Yo** o una persona a cargo.
3. Elegí **Clase suelta** o **Serie semanal** o **quincenal**. Podés escribir una observación opcional de hasta 500 caracteres.
4. En una serie, antes de enviar ves la lista de **fechas que se saltean** porque están ocupadas o bloqueadas (por ejemplo «miércoles, 11 de noviembre, 10:00 (bloqueada)»); solo dice si está ocupada o bloqueada, nunca por qué ni quién.
5. Enviá. Aparece «Pedido enviado», la clase queda **pendiente** de que el profesor responda y el horario figura **Ocupado**. El profesor recibe un aviso.

Qué más puede pasar:
- Se pide con al menos 24 horas de anticipación (24 exactas se aceptan, 23 no).
- Podés tener hasta **10 pedidos pendientes con cada profesor**, sumando reservas, cambios de horario y avisos de que no vas. Con 10, el mensaje dice el límite; cuando el profesor responde alguno podés pedir de nuevo. Los pedidos con un profesor no cuentan para otro.
- Con el acceso pendiente o rechazado, tocar el horario te lleva al aviso del estado de tu cuenta con ese profesor.
- Sin haber ingresado, tocar un horario libre muestra «Ingresá para pedir esta clase» con el acceso **Ingresar**; al ingresar volvés a la misma agenda. No se envía ningún pedido ni dato.
- Si el profesor pausa su agenda, sus pedidos pendientes se anulan sin aviso por mail; cuando la reactive, tenés que pedir de nuevo.

Fuente: `calidad/evidencias/ui/WEB-04/caso.md`, `WEB-01-visitante/caso.md`, `test-results/evidencia-reservas.jsonl` (SOL-01, SOL-10, WEB-01, WEB-04, CA-41, CA-46).

## Mis clases
En **Mis clases** (`#/mis-clases`) ves tus clases con todos tus profesores.
1. Arriba, **Tus profesores** muestra el estado de tu vínculo con cada uno; bajo el que te rechazó aparece «Motivo:» con el texto tal cual lo escribió (sin interpretar marcas HTML). Si todos tus profesores te rechazaron ves «Sin permisos» y el motivo se lee en la ficha.
2. Dos pestañas: **Próximas** (las solicitudes pendientes quedan destacadas arriba) y **Pasadas**.
3. Cada clase muestra fecha y hora en el huso **de su profesor**, el profesor, quién toma la clase, si es de una serie y la observación. Si tenés clases en más de un huso, la hora lleva el nombre del huso (por ejemplo «10:00 (America/Montevideo)» y «10:00 (Europe/Madrid)»).
4. Una solicitud cuyo horario ya pasó sin que el profesor respondiera figura «Pendiente sin respuesta».

Fuente: handoffs de UX y pruebas de B07 (SOL-04, WEB-05, RES-06, CA-45).

## Mover una clase
Solo en una clase **confirmada** que todavía no empezó y sin otro pedido pendiente.
1. En Mis clases tocá **Mover**. Se abre un diálogo con la agenda **del mismo profesor**, por día y en su huso.
2. Tocá un horario libre. En una serie elegí **Solo esta clase** (por defecto) o **De acá en adelante**.
3. Tocá **Pedir el cambio**. Aparece «Pedido enviado»; si en una serie «de acá en adelante» hay fechas ocupadas o bloqueadas, el aviso las lista como salteadas.
4. La clase sigue **Confirmada** en su horario con la marca **Movimiento pendiente** hasta que el profesor responde. Si confirma, la clase figura en el horario nuevo y la original como **Cambiada de horario**; si rechaza, queda todo como estaba. Te llega un mail con su nombre y podés responderle.

Reglas: rige la anticipación del profesor para el horario original **y** para el nuevo, y el aviso dice cuál falla; con el profesor en pausa dice «No toma reservas por ahora» y no se envía. Si la clase tenía un pedido vencido (sin respuesta), se anula al hacer el nuevo.

## Avisar que no voy
1. En una clase confirmada que no empezó tocá **Avisar que no voy** y confirmá. En una serie elegí **Solo esta clase** o **De acá en adelante**.
2. La clase sigue confirmada, con la marca **Cancelación pendiente**, hasta que el profesor responda. Si confirma, la clase (o ella y las siguientes) pasa a **Cancelada** y las anteriores siguen confirmadas; si rechaza, sigue todo igual.

Fuente: `calidad/evidencias/ui` de B08 (WEB-05-mover-clase, WEB-05-cancelar-serie, WEB-05-profesor-inactivo), pgTAP e integración (SOL-02, SOL-03, SOL-07, SOL-10, CA-22).

## Agregar personas a cargo
Una vez completada la ficha podés registrar a quien toma las clases en tu lugar (por ejemplo, un hijo o hija menor): en «Mi ficha», agregá nombre y fecha de nacimiento. La persona aparece en tu ficha. Solo se agregan y se editan; no hay opción de borrarlas. Fuente: `WEB-03/caso.md` (ALU-06).

## Estado de tu cuenta con cada profesor
Cada profesor te aprueba o te rechaza por separado: podés estar aprobado con uno y rechazado con otro, y el motivo de cada rechazo es solo de ese profesor.
- **Pendiente de aprobación:** el profesor todavía no respondió. Podés ver la agenda, pero no pedir clases.
- **Aprobada:** el profesor te aprobó. También quedás aprobado si él te da de alta con tu mail: te llega un aviso («te sumó como alumno en Agenda Clases App») y tu ficha no cambia.
- **Rechazada:** se muestra «Rechazada» y, si el profesor escribió un motivo, «Motivo:» con su texto. Además te llega por mail. Si el profesor te aprueba después, el motivo desaparece.

Fuente: `WEB-03-rechazo/caso.md` (CA-45, ALU-03, ALU-07).

Los mails de tu profesor (respuesta a tus pedidos, clase creada, movida o cancelada por él y el recordatorio del día anterior a cada clase confirmada) te llegan con su nombre y podés responderle directamente; el recordatorio llega entre 24 h y 23 h 45 min antes y no llega si la clase se confirmó con menos de 24 h de anticipación; los códigos de ingreso y los avisos de la aplicación llegan como «Agenda Clases App».

## Tus datos y su borrado
Si pasan **6 meses** desde tu última clase con cualquier profesor (y no tenés clases futuras con ninguno; sin clases, desde que te registraste o te aprobaron), se borran tus datos personales, tus personas a cargo y tu cuenta de ingreso. **7 días antes** te llega un mail de «Agenda Clases App» con la fecha. Entrar a la aplicación vuelve a contar el plazo y, si una clase nueva corre la fecha, recibís un aviso nuevo. Tus clases pasadas quedan sin tus datos. Fuente: ALU-10, ALU-11, AVI-06, ADR-011. Si tu profesor te borra de su lista, se cancelan tus clases futuras con él sin mail; tu cuenta y lo tuyo con otros profesores siguen.

> DEC-39 (cerrada, opción a): si el proceso de borrado estuvo parado más de 7 días, la primera corrida al volver puede borrar sin aviso previo a quien venció en el medio; el control es la revisión manual del runbook antes de reactivarlo.

## Bitácora de versiones

| Versión | Fecha | Bolt | IDs | Cambio |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-10-22 | B02-B05 | WEB-01, WEB-02, WEB-03, CA-01, CA-02, CA-15, CA-43, CA-44, CA-45 | Primera versión: agenda pública, ingreso, ficha, personas a cargo y estado de la cuenta |
| 0.2 | 2026-10-23 | B14 | CR-002, CR-003, AGE-09, AGE-11, ALU-14, WEB-09, WEB-11, WEB-12, CA-63 | Entrada por enlace, inicio sin enlace, pedir acceso, selector, estado por profesor, profesor en pausa; nombre del producto |
| 0.3 | 2026-10-23 | B06 | SOL-01, SOL-10, WEB-01, WEB-04, CA-41, CA-46, ADM-05 | Pedir una clase suelta o una serie, vista previa de fechas salteadas, tope de 10, visitante sin sesión, pedidos anulados por pausa |
| 0.4 | 2026-10-23 | B07, B08, B11 | SOL-02, SOL-03, SOL-07, SOL-10, WEB-05, RES-06, AVI-05, AVI-06, ALU-10, ALU-11, DEC-39 | Mis clases, Mover, Avisar que no voy, recordatorio, retención y borrado |
| 0.5 | 2026-10-26 | B11 | ALU-10, AVI-06, DEC-39 | DEC-39 cerrada: se acepta el borrado sin aviso tras una parada larga |
