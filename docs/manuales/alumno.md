---
titulo: Manual de usuario · Alumno y visitante
version: 0.1
fecha: 2026-10-22
publico: alumnos y visitantes
---
# Manual de usuario · Alumno y visitante

> Este manual cubre solo lo **construido y verificado** hasta B05: ver la agenda, ingresar, completar la ficha, cargar personas a cargo y ver el estado de la cuenta. Pedir, mover o cancelar clases y ver «Mis clases» se suman cuando se construyan y verifiquen.

## Ver la agenda (sin ingresar)
1. Abrí la página de inicio (`#/`). Se muestra el día de hoy según el huso del profesor, aunque tu dispositivo esté en otro huso.
2. Cada horario aparece como **Libre**, **Ocupado** o **Bloqueado**. No se ven nombres ni observaciones de nadie.
3. Para cambiar de día usá el campo de fecha o pasá al día siguiente o al anterior. Un día sin horarios (por ejemplo un domingo) dice «No hay huecos este día».
4. Si falla la conexión aparece un error con el botón **Reintentar**.

Fuente: `calidad/evidencias/ui/WEB-01/caso.md` (CA-15, CA-16, WEB-01).

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
1. Verificá el mail (ya viene cargado) y escribí nombre, teléfono o WhatsApp, fecha de nacimiento y cómo llegaste.
2. Si falta un dato, no se guarda: el error aparece junto al campo y el foco va a él.
3. Guardá. Ves «Mi ficha» con tus datos y el estado **Pendiente de aprobación**.
4. Si aparece «Intentá de nuevo más tarde», hubo muchas fichas en la última hora: tu cuenta sigue sin ficha completa; probá de nuevo más tarde.

Fuente: `WEB-03/caso.md`, `WEB-03-tope/caso.md` (CA-02, CA-43, ALU-02, ALU-13).

## Agregar personas a cargo
Una vez completada la ficha podés registrar a quien toma las clases en tu lugar (por ejemplo, un hijo o hija menor): en «Mi ficha», agregá nombre y fecha de nacimiento. La persona aparece en tu ficha. Solo se agregan y se editan; no hay opción de borrarlas. Fuente: `WEB-03/caso.md` (ALU-06).

## Estado de tu cuenta
- **Pendiente de aprobación:** el profesor todavía no respondió. Podés ver la agenda, pero no pedir clases.
- **Aprobada:** el profesor te aprobó.
- **Rechazada:** se muestra «Rechazada» y, si el profesor escribió un motivo, «Motivo:» con su texto. Además te llega por mail. Si el profesor te aprueba después, el motivo desaparece.

Fuente: `WEB-03-rechazo/caso.md` (CA-45, ALU-03).

## Bitácora de versiones

| Versión | Fecha | Bolt | IDs | Cambio |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-10-22 | B02-B05 | WEB-01, WEB-02, WEB-03, CA-01, CA-02, CA-15, CA-43, CA-44, CA-45 | Primera versión: agenda pública, ingreso, ficha, personas a cargo y estado de la cuenta |
