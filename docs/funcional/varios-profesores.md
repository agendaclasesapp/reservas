---
titulo: Funcional · Varios profesores
version: 0.2
fecha: 2026-10-23
publico: negocio y equipo
---
# Varios profesores (CR-002) y nombre del producto (CR-003)

> Estado tras B14: **construido y verificado** el enlace por profesor, el vínculo persona-profesor, la página de inicio sin enlace, el selector, el alta de alumnos que ya tienen cuenta, los mails con el nombre del profesor y los topes por profesor y globales. Verificado por la API y en navegador. **Construido y verificado en B15 y B06:** la pantalla del Administrador para dar de alta, listar, pausar y reactivar profesores (ADM-02, ADM-03, ADM-05, WEB-10, CA-49, CA-63) y la anulación de pendientes al pausar.

## El producto

La aplicación se llama **Agenda Clases App** y su ícono es `docs/marca/agenda-clases-app-icono.jpg`. El nombre se ve en el título de cada página, en el encabezado, en las páginas de condiciones y privacidad y como remitente de los mails de la aplicación y de los códigos de ingreso (WEB-12, AVI-07, CR-003). Los identificadores internos no cambian.

## Cada profesor tiene su enlace (AGE-09, AGE-10)

- Cada profesor tiene su enlace, `…/reservas/#/p/<slug>`, que abre su agenda pública con su nombre; el nombre es lo único del profesor que ve quien abre el enlace (DEC-34).
- Un enlace que no corresponde a nadie dice «Enlace no válido, pedile el enlace a tu profesor» y no lista profesores. El sistema no distingue mayúsculas ni espacios en los bordes del enlace.
- Grilla, duración, anticipación, huso y bloqueos son de cada profesor: un mismo horario puede estar ocupado en una agenda y libre en otra.
- La página de inicio sin enlace dice solo «Pedile el enlace a tu profesor» y ofrece el ingreso; no muestra agenda ni lista profesores (WEB-09).

## Una cuenta por persona, un vínculo por profesor (ALU-14, DEC-25, DEC-33)

- Una persona tiene una sola ficha y una sola cuenta, aunque tenga más de un profesor.
- El vínculo con un profesor nace **pendiente** cuando la persona completa la ficha habiendo entrado desde el enlace de ese profesor (y contesta «cómo llegaste» para él), o cuando, con la ficha ya completa, toca «Pedir acceso» en la agenda de otro profesor.
- Quien completa la ficha sin enlace no queda vinculado con nadie: ve su ficha y «Pedile el enlace a tu profesor».
- Cada profesor aprueba o rechaza **a su vínculo**: la persona puede estar aprobada con uno y rechazada con otro, y el motivo de rechazo de cada profesor es solo de ese vínculo (ALU-03).
- Al completar una ficha desde un enlace, el aviso de cuenta nueva llega solo al profesor de ese enlace (AVI-02).

## Selector de profesor (WEB-11, DEC-28)

Quien tiene más de un vínculo ve arriba, en las pantallas del alumno, la lista «Tus profesores» con el estado con cada uno; al elegir uno, la agenda, «Pedir acceso» y los pedidos se refieren a ese profesor. Con un solo profesor no aparece y se abre su agenda. El menú «Agenda» lleva al profesor elegido, o al único. Mis clases muestra las clases de todos con su profesor (RES-06; su construcción es de B07).

## Alta de alumnos por el profesor con varios profesores (ALU-07, ALU-08, DEC-29, DEC-32, DEC-36)

- Si el profesor da de alta un alumno con el mail de alguien que **ya usa la app**, no se crea otra persona: queda como alumno aprobado suyo, con la ficha que ya tenía, y se le avisa por mail (AVI-04). Los datos que cargó el profesor se descartan.
- Con el mail de un profesor o del Administrador el alta se rechaza («Ese mail ya está registrado y no se puede usar acá»).
- El profesor solo edita la ficha de un alumno que él cargó, que no tiene cuenta y que no tiene otro profesor; las demás dicen «Ficha no editable».
- Agregar por edición un mail que ya tiene cuenta responde «ese mail ya tiene cuenta» y no asocia (DEC-36).
- Agregar por edición un mail nuevo a un alumno sin cuenta le envía el mismo aviso «te sumó como alumno» del alta (DEC-38, AVI-04). No se manda si el mail no cambia, si se quita, si se cambia el mail de quien ya tenía uno ni en otra edición.

## Administrador (ADM-01 a ADM-05)

- Hay un único Administrador, el dueño del servicio, fijado por el operador en el despliegue; ingresa como cualquier persona y ninguna pantalla permite hacerse Administrador (ADM-01).
- Da de alta a un profesor con mail, nombre y enlace (3 a 30 caracteres: minúsculas, dígitos y guiones; único y no reservado), con aviso de que el nombre es público y de que su mail lo ven los alumnos como dirección de respuesta (ADM-02, DEC-34). Ve la lista con nombre, mail, enlace y estado (ADM-03).
- Por serlo, no ve fichas, clases ni solicitudes de nadie; si además es profesor, actúa como tal solo sobre su agenda (ADM-04, DEC-31). Un profesor no es alumno de otro.
- Al dar de alta, el profesor nace activo con la grilla inicial y recibe el mail «Tu agenda en Agenda Clases App» con su enlace y el aviso de que su nombre es público. Si el mail es el de un profesor que ya usaba el sistema con un enlace provisional, se lo **adopta**: queda con el nombre y el enlace nuevos y conserva su agenda. Si el mail es de una persona con ficha completa, de otro profesor o del Administrador, el alta se rechaza.
- **Estado:** construido y verificado en B15 (`#/admin`; ver `manuales/administrador.md`). El texto de privacidad con varios profesores y la frase sobre el Administrador están publicados (H-286, vigente desde el 23 de octubre de 2026).

## Pausa de un profesor (ADM-05, AGE-11, PRF-08, DEC-30, DEC-35, DEC-37)

Solo el Administrador inactiva y reactiva a un profesor; no hay baja ni cambio de enlace.

| Con el profesor inactivo | Qué pasa |
| --- | --- |
| Su enlace | Dice «<nombre> no toma reservas por ahora», sin agenda ni «Pedir acceso» |
| Pedidos de acceso, solicitudes nuevas, clases nuevas | No se pueden crear (409 `PROFESOR_INACTIVO`) |
| Solicitudes pendientes | Se anulan **todas**, también las vencidas, y se liberan sus huecos; **no vuelven** al reactivar; el alumno no recibe mail por esto (B06) |
| Reservas y clases confirmadas | Se mantienen y siguen visibles |
| Su panel | Ve todo y puede cancelar clases o series y rechazar; no aprueba accesos, no da de alta alumnos, no crea ni mueve clases. La lista lo avisa y «Agregar alumno» queda deshabilitado |
| Al reactivarlo | Todo queda como estaba (con la agenda recargada) |

Verificado: un profesor inactivo no recibe pedidos de acceso, su enlace dice que no toma reservas, clases, vínculos, grilla y mails no cambian y al reactivarlo el enlace y la agenda vuelven idénticos; el rechazo sí se permite (CA-63). Los huecos de lo anulado vuelven a figurar libres al reactivar, pero lo anulado no se restablece.

## Mails y topes con varios profesores (AVI-07, AVI-08, SOL-10, ALU-13)

- Los mails de un profesor a su alumno salen de la casilla de la aplicación con el **nombre del profesor** como remitente y su mail en «Responder a». Los avisos al profesor y los códigos de ingreso salen como «Agenda Clases App».
- Cada profesor tiene su tope de mails: 20 por hora y 200 por día; además toda la aplicación tiene 400 por día, porque la cuota de Gmail es una sola. Un mail que supera un tope queda fallido con motivo de tope (el profesor lo ve en «Mails fallidos») y la operación se completa igual.
- Un alumno puede tener hasta **10 solicitudes pendientes con cada profesor**; las de uno no cuentan para otro (SOL-10; antes era 5 en total).
- Las fichas completadas se limitan a 10 por hora por profesor de origen; las que se completan sin enlace comparten un cupo propio (ALU-13).

## Bitácora de versiones

| Versión | Fecha | Bolt | IDs | Cambio |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-10-23 | B14 | CR-002, CR-003, ADM-01..05, AGE-09..11, ALU-03, ALU-13, ALU-14, PRF-08, SOL-10, AVI-07, AVI-08, WEB-09..12, DEC-25..37 | Primera versión: enlace por profesor, vínculos, selector, alta con persona existente, Administrador, pausa, mails y topes, nombre del producto |
| 0.2 | 2026-10-23 | B15, B06 | ADM-02, ADM-03, ADM-05, WEB-10, CA-49, CA-63, DEC-35, DEC-37, DEC-38, H-286 | Administrador construido, adopción, pausa que anula pendientes, aviso al sumar un mail |
