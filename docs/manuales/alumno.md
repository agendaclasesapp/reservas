---
titulo: Manual de usuario · Agenda Clases App · Alumno y visitante
version: 0.2
fecha: 2026-10-23
publico: alumnos y visitantes
---
# Manual de usuario · Agenda Clases App · Alumno y visitante

> Este manual cubre solo lo **construido y verificado** hasta B05 y B14: entrar por el enlace de tu profesor, ver la agenda, ingresar, completar la ficha, pedir acceso a otro profesor, elegir profesor, cargar personas a cargo y ver el estado de tu cuenta con cada profesor. Pedir, mover o cancelar clases y ver «Mis clases» se suman cuando se construyan y verifiquen.

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

## Agregar personas a cargo
Una vez completada la ficha podés registrar a quien toma las clases en tu lugar (por ejemplo, un hijo o hija menor): en «Mi ficha», agregá nombre y fecha de nacimiento. La persona aparece en tu ficha. Solo se agregan y se editan; no hay opción de borrarlas. Fuente: `WEB-03/caso.md` (ALU-06).

## Estado de tu cuenta con cada profesor
Cada profesor te aprueba o te rechaza por separado: podés estar aprobado con uno y rechazado con otro, y el motivo de cada rechazo es solo de ese profesor.
- **Pendiente de aprobación:** el profesor todavía no respondió. Podés ver la agenda, pero no pedir clases.
- **Aprobada:** el profesor te aprobó. También quedás aprobado si él te da de alta con tu mail: te llega un aviso («te sumó como alumno en Agenda Clases App») y tu ficha no cambia.
- **Rechazada:** se muestra «Rechazada» y, si el profesor escribió un motivo, «Motivo:» con su texto. Además te llega por mail. Si el profesor te aprueba después, el motivo desaparece.

Fuente: `WEB-03-rechazo/caso.md` (CA-45, ALU-03, ALU-07).

Los mails de tu profesor te llegan con su nombre y podés responderle directamente; los códigos de ingreso y los avisos de la aplicación llegan como «Agenda Clases App».

## Bitácora de versiones

| Versión | Fecha | Bolt | IDs | Cambio |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-10-22 | B02-B05 | WEB-01, WEB-02, WEB-03, CA-01, CA-02, CA-15, CA-43, CA-44, CA-45 | Primera versión: agenda pública, ingreso, ficha, personas a cargo y estado de la cuenta |
| 0.2 | 2026-10-23 | B14 | CR-002, CR-003, AGE-09, AGE-11, ALU-14, WEB-09, WEB-11, WEB-12, CA-63 | Entrada por enlace, inicio sin enlace, pedir acceso, selector, estado por profesor, profesor en pausa; nombre del producto |
