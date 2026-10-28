---
titulo: Manual de usuario · Agenda Clases App · Administrador
version: 0.1
fecha: 2026-10-23
publico: administrador
---
# Manual de usuario · Agenda Clases App · Administrador

> Este manual cubre lo **construido y verificado** en B15 y B06: dar de alta profesores, ver la lista, pausar y reactivar. El Administrador es el dueño del servicio; lo fija quien opera el sistema (`ops/puesta-en-marcha.md`) y ninguna pantalla permite hacerse Administrador (ADM-01). Por serlo no ve fichas, clases ni solicitudes de nadie (ADM-04). Si además es profesor, el menú suma **Administración** y actúa como profesor solo sobre su propia agenda.

## Entrar a Administración
Ingresá con tu mail como cualquier persona. Si sos solo Administrador, la aplicación te lleva a `#/admin`; si sos también profesor, abrí **Administración** en el menú. Esa pantalla es solo del Administrador. Fuente: `calidad/evidencias/ui/WEB-10-pausa/caso.md` (WEB-10, ADM-01).

## Ver los profesores
La lista muestra una tarjeta por profesor con su **nombre**, su **mail**, su **enlace** (con el botón **Copiar enlace de <nombre>**) y su estado, **Activo** o **Inactivo**, siempre con ícono y texto. Se ordenan por nombre. Sin profesores dice «Todavía no hay profesores»; si falla la lectura aparece **Reintentar**. Fuente: handoff de UX de B15 (ADM-03, WEB-10).

## Dar de alta a un profesor
1. En el formulario de alta completá **Mail del profesor**, **Nombre del profesor** y **Enlace del profesor**: de 3 a 30 caracteres, minúsculas, dígitos y guiones. Se recortan los espacios y se pasa a minúsculas antes de validar. El enlace no puede estar en uso ni ser una palabra reservada (por ejemplo `admin`, `p`, `ingreso`, `panel`).
2. Leé el aviso sobre el formulario: **el nombre del profesor es público** (lo ve quien abre su enlace) y **su mail lo ven los alumnos como dirección de respuesta** (DEC-34).
3. Guardá. Aparece «Profesor dado de alta. Ya puede entrar con ese mail y se le avisa por mail con su enlace.» y la lista se actualiza.
4. Si algo falla, el error aparece junto al campo: mail inválido, nombre vacío, enlace con formato inválido o reservado, «Ese enlace ya lo usa otro profesor. Elegí otro.» o un mail ya registrado (por ejemplo el de una persona con ficha completa, el de otro profesor o el del Administrador). Lo que escribiste se conserva.

El profesor nace **activo** y con su grilla inicial. Le llega el mail «Tu agenda en Agenda Clases App» con su enlace y el aviso de que su nombre es público y de que su mail es la dirección de respuesta. El enlace del mail es completo solo si quien opera cargó el secreto `url_sitio`; si no, trae solo `#/p/<enlace>` (`ops/mails.md`).

**Profesor ya existente (adopción).** Si el mail es el de un profesor que ya usaba el sistema con un enlace provisional, no se crea otro: queda con el nombre y el enlace nuevos, **conserva su agenda y sus datos** y el enlace provisional deja de valer. La pantalla dice «Ese mail ya era de un profesor: quedó con este nombre y este enlace, y conserva su agenda y sus datos.» y el profesor recibe el mismo mail con su enlace nuevo.

Fuente: `WEB-10/caso.md`, handoff del tester de B15 y evidencia de Mailpit (ADM-02, DEC-34, CA-49).

## Pausar (inactivar) a un profesor
1. En la tarjeta del profesor tocá **Inactivar**. Se abre una confirmación que explica la pausa.
2. Confirmá. Aparece «<nombre> quedó inactivo.».

Qué pasa con un profesor inactivo (ADM-05, AGE-11, DEC-35, DEC-37, CA-63):
- Su enlace dice «<nombre> no toma reservas por ahora»: sin agenda y sin pedidos de acceso.
- **Se anulan todas sus solicitudes pendientes**, también las vencidas, y se liberan los huecos que ocupaban. **No sale ningún mail** a los alumnos por esto.
- Las clases y reservas **confirmadas** siguen igual; también quedan sus alumnos, vínculos, grilla y mails.
- No hay baja ni cambio de enlace: es una pausa, no un borrado. Lo de otros profesores no cambia.

## Reactivar a un profesor
Tocá **Reactivar** en su tarjeta y confirmá («<nombre> quedó activo.»). El enlace y la agenda vuelven como estaban y los huecos vuelven a figurar libres, pero **las solicitudes anuladas al pausar no se restablecen**: los alumnos deben pedir de nuevo. Las pantallas que ya estaban abiertas necesitan recargarse. Fuente: `WEB-10-pausa/caso.md`, `tests/integracion/admin` y handoff del tester de B06 (CA-63).

## Bitácora de versiones

| Versión | Fecha | Bolt | IDs | Cambio |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-10-23 | B15, B06 | ADM-01..05, WEB-10, AGE-11, DEC-34, DEC-35, DEC-37, CA-49, CA-63, CA-64 | Primera versión: lista, alta con adopción, pausa que anula pendientes y reactivación |
