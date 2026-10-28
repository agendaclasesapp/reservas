---
titulo: Manual de usuario · Agenda Clases App · Profesor
version: 0.2
fecha: 2026-10-23
publico: profesor
---
# Manual de usuario · Agenda Clases App · Profesor

> Este manual cubre solo lo **construido y verificado** hasta B05 y B14: tu enlace, cuentas pendientes, alumnos (incluidos los que ya tienen cuenta con otro profesor), la agenda en pausa y «Mails fallidos». Solicitudes, agenda por día, clases, bloqueos y el resto de la configuración se suman cuando se construyan y verifiquen. Antes del primer ingreso, quien opera el sistema debe haber cargado tu mail (ver `tecnica/plataforma.md` §7 y `ops/puesta-en-marcha.md`). Tu nombre es público en tu enlace y tu mail lo ven tus alumnos como dirección de respuesta (DEC-34).

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
2. **Editar:** cambia los datos. El mail no se puede cambiar si la persona ya ingresó. Si el mail ya lo usa otro alumno tuyo, otro profesor o el Administrador, el campo Mail lo indica. Agregar a mano un mail que ya tiene cuenta no asocia a la persona: dice «ese mail ya tiene cuenta».
3. **Alta con el mail de alguien que ya usa la app:** si el mail es de una persona con cuenta (por ejemplo, alumna de otro profesor), queda como alumna tuya, aprobada, con la ficha que ya tenía; la pantalla dice «Ese mail ya tenía cuenta: la persona quedó como alumna tuya, con la ficha que ya tenía.» y ella recibe un aviso. Con el mail de un profesor o del Administrador el alta se rechaza («Ese mail ya está registrado y no se puede usar acá»).
4. **Ficha no editable:** solo editás las fichas que cargaste vos, sin cuenta y sin otro profesor; las demás dicen «Ficha no editable».

Fuente: handoff de UX de B05 y B14, `WEB-07/caso.md`, `WEB-07-alta-asociada/caso.md` (ALU-07, ALU-08, ALU-09, DEC-29, DEC-32, DEC-36).

## Si el Administrador pausa tu agenda
Tu enlace pasa a decir que no tomás reservas por ahora; nadie te pide acceso ni crea solicitudes nuevas. Las solicitudes pendientes se cancelan (sin mail a los alumnos) y las reservas y clases confirmadas se mantienen. En tu panel seguís viendo todo y podés cancelar clases o series y rechazar; la lista avisa que tu agenda está inactiva, no deja aprobar accesos y «Agregar alumno» queda deshabilitado. Al reactivarte todo vuelve como estaba, salvo las solicitudes canceladas; recargá la página para ver tu agenda activa. La pausa la aplica el Administrador (su pantalla es de B15). Fuente: `WEB-01-inactivo/` y `WEB-07-inactivo/` (AGE-11, PRF-08, ADM-05, DEC-35, DEC-37).

## Revisar los mails fallidos
En **Configuración**, la sección «Mails fallidos» lista fecha (en tu huso), destinatario, tipo y motivo de cada mail que no salió: tope de envío superado, envío sin confirmar, dirección inválida o un error del servidor de correo (con pista cuando son las credenciales). La operación que originó el mail se completó igual. No se muestran asunto ni cuerpo. Los mails que mandás a tus alumnos salen con tu nombre y con tu mail en «Responder a». Cada profesor puede encolar 20 mails por hora y 200 por día, y toda la aplicación 400 por día: pasado un tope el mail queda fallido con motivo «tope» (AVI-08). Estado: construida y verificada con pruebas automáticas; la prueba con la casilla Gmail real está pendiente de G3. Fuente: handoff de UX y de pruebas de B03 (NFR-07, CA-34).

## Bitácora de versiones

| Versión | Fecha | Bolt | IDs | Cambio |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-10-22 | B03, B05 | WEB-07, WEB-08, ALU-03..09, AVI-03, CA-04, CA-34, CA-45, NFR-07 | Primera versión: cuentas, unión, alumnos y mails fallidos |
| 0.2 | 2026-10-23 | B14 | CR-002, CR-003, AGE-09, AGE-11, ALU-07, ALU-08, PRF-08, WEB-08, AVI-08, DEC-29, DEC-32, DEC-35..37 | Tu enlace, alta con persona existente, ficha no editable, agenda en pausa, remitente y topes por profesor; nombre del producto |
