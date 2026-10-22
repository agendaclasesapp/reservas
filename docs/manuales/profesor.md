---
titulo: Manual de usuario · Profesor
version: 0.1
fecha: 2026-10-22
publico: profesor
---
# Manual de usuario · Profesor

> Este manual cubre solo lo **construido y verificado** hasta B05: cuentas pendientes, alumnos y «Mails fallidos». Solicitudes, agenda por día, clases, bloqueos y el resto de la configuración se suman cuando se construyan y verifiquen. Antes del primer ingreso, quien opera el sistema debe haber cargado tu mail (ver `tecnica/plataforma.md` §7).

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
2. **Editar:** cambia los datos. El mail no se puede cambiar si la persona ya ingresó. Si el mail ya lo usa otro alumno (o es el tuyo), el campo Mail lo indica.

Fuente: handoff de UX de B05 y `WEB-07/caso.md` (ALU-07, ALU-08, ALU-09).

## Revisar los mails fallidos
En **Configuración**, la sección «Mails fallidos» lista fecha (en tu huso), destinatario, tipo y motivo de cada mail que no salió: tope de envío superado, envío sin confirmar, dirección inválida o un error del servidor de correo (con pista cuando son las credenciales). La operación que originó el mail se completó igual. No se muestran asunto ni cuerpo. Estado: construida y verificada con pruebas automáticas; la prueba con la casilla Gmail real está pendiente de G3. Fuente: handoff de UX y de pruebas de B03 (NFR-07, CA-34).

## Bitácora de versiones

| Versión | Fecha | Bolt | IDs | Cambio |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-10-22 | B03, B05 | WEB-07, WEB-08, ALU-03..09, AVI-03, CA-04, CA-34, CA-45, NFR-07 | Primera versión: cuentas, unión, alumnos y mails fallidos |
