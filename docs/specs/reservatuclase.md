# Spec · Agenda Clases App

| Campo | Valor |
| --- | --- |
| Versión | 1.1 |
| Estado | aprobada |
| Dueño | Fernando Burgueño |

## 1. Contexto y alcance

Los profesores de tenis coordinan hoy sus clases por mensajes: los alumnos no ven qué horarios quedan
libres, y los pedidos, cambios y avisos de que no van se dispersan entre conversaciones.
Agenda Clases App (el «nombre del servicio» en esta spec; su ícono está en
`docs/marca/agenda-clases-app-icono.jpg`) es una aplicación web gratuita donde cualquiera ve los huecos libres de la agenda de un
profesor, los alumnos aprobados piden clases, piden moverlas o avisan que no van, y cada profesor
confirma los pedidos que le llegan y es el único que ve quién ocupa cada hueco de su agenda. Un
Administrador, el dueño del servicio, da de alta a los profesores; cada uno tiene su enlace y su
agenda.

**Dentro del alcance:** ingreso sin contraseña y aprobación de alumnos por cada profesor; alta de
profesores por el Administrador; enlace y agenda pública por profesor; una cuenta y una ficha por
persona con aprobación de cada profesor; agenda por día pública sin
nombres; solicitudes de reserva, movimiento y cancelación con confirmación del profesor; clases
sueltas y series semanales o quincenales; grilla semanal, duración, anticipación mínima y bloqueos;
gestión directa del profesor y vista en modo lista; avisos en la web, por mail y recordatorio;
borrado de datos por inactividad.

**Fuera de alcance:** un directorio público de profesores (la página principal no los lista), la baja
y el cambio de enlace de un profesor (la pausa de ADM-05 no es una baja), que un profesor se registre
por su cuenta, y el cobro por el servicio; pagos y cobros;
mensajes por WhatsApp; feriados automáticos (el profesor los bloquea); una aplicación instalable
para teléfonos; dominio propio.

## 2. Actores

| Actor | Descripción |
| --- | --- |
| Visitante | Persona sin sesión iniciada. Ve el calendario público del profesor cuyo enlace abrió, con huecos libres, ocupados y bloqueados, sin datos de nadie; sin enlace no ve ninguna agenda. |
| Alumno pendiente | Persona con la ficha completa cuyo vínculo con un profesor todavía no fue resuelto. Ve la agenda pública de ese profesor y su estado con él; no puede pedirle clases. |
| Alumno | Titular adulto aprobado por al menos un profesor. Con cada profesor que lo aprobó pide, mueve y cancela clases para sí o para sus personas a cargo. Ve solo sus datos y sus clases, de todos sus profesores. |
| Persona a cargo | Quien toma la clase sin ser titular de la cuenta (por ejemplo, un hijo menor). No inicia sesión. |
| Alumno sin cuenta | Alumno que un profesor carga sin mail; solo ese profesor lo ve. No inicia sesión ni recibe mails. |
| Profesor | Dado de alta por el Administrador. Configura su agenda, aprueba o rechaza a quienes piden acceso a ella, confirma o rechaza las solicitudes que le llegan, gestiona sus clases y ve los datos de sus alumnos, no los de otro profesor. |
| Administrador | Dueño del servicio. Da de alta a los profesores, los inactiva o reactiva y ve la lista con sus enlaces. No ve fichas, clases ni solicitudes de alumnos por serlo (ADM-04). |
| Proceso programado | Tarea dentro de Supabase que manda recordatorios y avisos de inactividad y borra los datos vencidos. |
| Tarea de mantenimiento | Tarea programada de GitHub Actions que mantiene activo el proyecto de Supabase. |

## 3. Requisitos funcionales

### 3.1 Alumnos y cuentas

- **ALU-01** · La persona inicia sesión con su cuenta de Google o con un código de 6 dígitos que
  recibe por mail; el sistema no usa contraseñas.
- **ALU-02** · En su primer ingreso la persona completa su ficha con nombre, teléfono o WhatsApp y
  fecha de nacimiento; si entró con Google, el nombre y el mail vienen cargados. Sin la ficha completa
  solo puede ver y completar la ficha. La persona tiene una sola cuenta y una sola ficha, que sirven
  para todos sus profesores: no la completa de nuevo al pedir acceso a otro. Quien entra desde el
  enlace de un profesor completa además, en el mismo paso, un texto obligatorio sobre cómo llegó a ese
  profesor («cómo llegaste»): no es parte de la ficha sino del vínculo con ese profesor y solo lo ve
  él (DEC-33).
- **ALU-03** · Cada profesor aprueba o rechaza por separado a quien le pidió acceso (ALU-14): el
  vínculo de la persona con cada profesor está pendiente, aprobado o rechazado, y solo ese profesor lo
  cambia. Mientras el vínculo con un profesor está pendiente o rechazado, el sistema rechaza toda
  solicitud dirigida a ese profesor y le muestra el estado; lo que decidió otro profesor no cambia ese
  estado ni lo habilita (DEC-28). Si fue rechazada y el profesor escribió un motivo, la persona ve ese
  motivo, en su ficha y en Mis clases junto a ese profesor, además de recibirlo por mail (AVI-03).
- **ALU-04** · Al aprobar a una persona, si su teléfono normalizado (sin espacios, guiones,
  paréntesis ni prefijo internacional) coincide con el de un alumno sin cuenta de ese mismo profesor,
  el profesor ve la sugerencia de unirlos y la confirma o la descarta; nunca se unen sin su
  confirmación, y nunca se comparan con los alumnos sin cuenta de otro profesor.
- **ALU-05** · Al confirmar la unión de ALU-04, las clases, solicitudes e historial del alumno sin
  cuenta pasan a la cuenta aprobada y el alumno sin cuenta deja de existir. El vínculo de la cuenta
  con ese profesor queda aprobado y las clases siguen siendo de ese profesor.
- **ALU-06** · El alumno registra y edita personas a cargo con nombre y fecha de nacimiento. Las
  personas a cargo pertenecen a la cuenta; cada profesor ve solo las que toman clases con él.
- **ALU-07** · Si el profesor da de alta un alumno con nombre, teléfono, fecha de nacimiento y mail,
  el sistema crea una cuenta con ese mail y su vínculo con ese profesor ya aprobado, y la persona
  entra con Google o con código usando ese mail. Si ese mail ya tiene cuenta de alumno, el sistema no
  crea otra ni modifica su ficha: asocia esa cuenta con ese profesor con el vínculo aprobado (aunque
  estuviera pendiente o rechazado), y el profesor ve la ficha que la persona ya tenía, no la que él
  cargó (DEC-29). Si el mail es el de un profesor o el del Administrador, el sistema rechaza el alta
  con `MAIL_YA_REGISTRADO` sin devolver datos de esa persona (DEC-31).
- **ALU-08** · Si el profesor da de alta un alumno sin mail, queda como alumno sin cuenta de ese
  profesor: no puede iniciar sesión y no recibe mails. Si después el profesor le agrega un mail al
  editarlo (PRF-01) y ese mail ya tiene cuenta, se rechaza con 409 «ese mail ya tiene cuenta» y no se
  asocia ni se une nada; con un mail nuevo se permite. La única unión de un alumno sin cuenta con una
  cuenta es la de ALU-04 (DEC-36).
- **ALU-09** · El profesor ve la lista de sus alumnos (personas con vínculo con él y alumnos sin
  cuenta que cargó él) con el estado del vínculo con él (pendiente, aprobado, rechazado o sin cuenta),
  su ficha completa y la edad calculada a partir de la fecha de nacimiento.
- **ALU-10** · Cuando pasan 6 meses desde la última clase de la persona con cualquiera de sus
  profesores, sin clases futuras con ninguno, o 6 meses desde el registro de una cuenta que ningún
  profesor aprobó, el proceso programado borra nombre, teléfono, mail, fecha de nacimiento, los
  textos de cómo llegó, el motivo de rechazo si lo hubiera y sus personas a cargo, y deja sus clases
  pasadas sin datos de la persona (DEC-26).
- **ALU-11** · Cada vez que el alumno inicia sesión, el plazo de 6 meses de ALU-10 vuelve a contar
  desde ese ingreso.
- **ALU-12** · El profesor borra a un alumno suyo en cualquier momento: sus clases futuras con ese
  profesor se cancelan, sus huecos se liberan, sus clases pasadas con él quedan sin datos de la
  persona y el profesor deja de verlo. Si era un alumno sin cuenta y sin otro profesor, además se
  borran sus datos como en ALU-10; si tiene cuenta, su cuenta y su ficha siguen (y vencen por
  inactividad como en ALU-10) y lo suyo con otros profesores no cambia; un profesor nunca borra la
  cuenta de una persona (DEC-26).
- **ALU-13** · El sistema limita a 10 las fichas completadas por hora por profesor de origen (el del
  enlace por el que entró la persona; las fichas completadas sin enlace comparten un cupo propio de la
  misma cantidad); al superar el tope rechaza la ficha con un mensaje que dice que hay que intentar
  más tarde, y no crea la cuenta (DEC-27).
- **ALU-14** · El vínculo de una persona con un profesor nace pendiente cuando completa la ficha
  habiendo entrado desde el enlace de ese profesor, o cuando, con la ficha ya completa, toca "Pedir
  acceso" en la agenda de otro profesor. Quien completa la ficha sin haber entrado desde un enlace no
  queda vinculado con nadie: solo ve su ficha y el mensaje "pedile el enlace a tu profesor" (DEC-25).
  Al pedir acceso a un profesor, la persona contesta «cómo llegaste» para ese profesor (DEC-33).

### 3.2 Agenda y disponibilidad

- **AGE-01** · Cada profesor define su grilla semanal con uno o más tramos horarios por día; el
  valor inicial es de lunes a viernes de 08:00 a 13:00 y de 14:00 a 18:00.
- **AGE-02** · Cada profesor define una duración única de clase en minutos; los huecos se generan
  seguidos desde el inicio de cada tramo, y un resto menor que la duración no genera hueco.
- **AGE-03** · Un cambio de grilla o de duración no modifica clases confirmadas ni solicitudes
  pendientes; solo cambia los huecos libres que ofrece ese profesor.
- **AGE-04** · Cada profesor define su anticipación mínima en horas; el sistema rechaza toda
  solicitud de un alumno sobre una clase o un hueco de ese profesor que empieza antes de ese plazo, y
  le dice por qué.
- **AGE-05** · Cada profesor bloquea un hueco, un rango de horas o días completos de su agenda, con
  un motivo opcional; el sistema rechaza el bloqueo si cubre una clase confirmada o una solicitud
  pendiente y le indica cuáles.
- **AGE-06** · El profesor quita un bloqueo suyo y sus huecos vuelven a ofrecerse como libres.
- **AGE-07** · El calendario público muestra cada hueco del día como libre, ocupado o bloqueado,
  sin nombres, observaciones ni motivos de bloqueo; un hueco con una solicitud pendiente se muestra
  ocupado. El calendario público es el de un profesor, el del enlace que se abrió.
- **AGE-08** · Todas las horas se guardan y se muestran en un único huso horario que configura cada
  profesor para su agenda.
- **AGE-09** · Cada profesor tiene su enlace, `…/reservas/#/p/<slug>`, que abre su agenda pública con
  su nombre; el nombre es público y es lo único del profesor que ve quien abre el enlace (DEC-34). Un
  enlace que no corresponde a ningún profesor muestra "Enlace no válido, pedile el enlace a tu
  profesor", sin listar profesores.
- **AGE-10** · Grilla, duración, anticipación mínima, huso horario y bloqueos son de cada profesor;
  lo que uno configura no cambia la agenda de otro, y un mismo horario puede estar ocupado en una
  agenda y libre en otra.
- **AGE-11** · Si el profesor está inactivo (ADM-05), su enlace abre una página que dice que no toma
  reservas por ahora y no muestra su agenda; nadie puede pedirle acceso ni crearle solicitudes nuevas
  (reserva, movimiento o cancelación) y no se crean clases nuevas en su agenda. Al inactivarlo se
  cancelan todas sus solicitudes pendientes (SOL-03, SOL-04); las reservas y clases ya confirmadas
  se mantienen y siguen visibles para sus alumnos en Mis clases. Al reactivarlo, su enlace y su
  agenda vuelven como estaban; las solicitudes canceladas no se restablecen (DEC-30, DEC-35).

### 3.3 Reservas

- **RES-01** · Cada hueco admite una sola reserva pendiente o confirmada; la base de datos rechaza
  la segunda con una restricción, también cuando dos llegan a la vez, y quien llegó después ve que
  el hueco ya no está libre.
- **RES-02** · Una reserva es una clase suelta o una serie semanal o quincenal que se repite sin
  fecha de fin hasta que se cancela; las fechas futuras de una serie ocupan sus huecos.
- **RES-03** · Cada reserva indica quién toma la clase: el titular o una de sus personas a cargo.
- **RES-04** · Cada reserva admite una observación opcional de texto libre, por ejemplo con quiénes
  más asisten a una clase grupal.
- **RES-05** · Al pedir una serie, las fechas ya ocupadas o bloqueadas se saltean, y antes de enviar
  el alumno ve qué fechas se saltean.
- **RES-06** · El alumno ve sus clases futuras y pasadas de todos sus profesores, con la fecha, la
  hora, el profesor, quién toma cada una y su estado.
- **RES-07** · Toda reserva y toda clase pertenecen al profesor de cuya agenda salió el hueco; RES-01
  rige dentro de la agenda de cada profesor.

### 3.4 Solicitudes

- **SOL-01** · Un alumno aprobado por un profesor toca un hueco libre de la agenda de ese profesor y
  crea una solicitud de reserva de una clase suelta o de una serie, dirigida a él; la solicitud queda
  pendiente y ocupa el hueco.
- **SOL-02** · El alumno pide mover una clase confirmada a otro hueco libre, eligiendo "solo esta
  clase" o "de acá en adelante" si es de una serie; mientras la solicitud está pendiente, el hueco
  destino queda ocupado y la clase sigue confirmada en su hueco original.
- **SOL-03** · El alumno avisa que no puede ir con una solicitud de cancelación de una clase
  confirmada, eligiendo "solo esta clase" o "de acá en adelante" si es de una serie; mientras la
  solicitud está pendiente, la clase sigue confirmada.
- **SOL-04** · El profesor al que va dirigida confirma o rechaza cada solicitud y puede escribir un
  motivo; ningún otro profesor la ve.
- **SOL-05** · Al confirmar, una reserva pasa a confirmada; un movimiento lleva la clase al hueco
  destino y libera el original; una cancelación cancela la clase y libera el hueco.
- **SOL-06** · Al rechazar, una reserva libera su hueco; un movimiento libera el hueco destino y la
  clase queda donde estaba; una cancelación deja la clase confirmada.
- **SOL-07** · Confirmar un movimiento o una cancelación "de acá en adelante" termina la serie en
  esa fecha; en un movimiento, además, nace una serie con la misma frecuencia desde el hueco
  destino, con las fechas ocupadas o bloqueadas salteadas como en RES-05.
- **SOL-08** · Una solicitud no vence: queda pendiente hasta que el profesor responde, y si pasa el
  horario de la clase queda en el historial como pendiente sin respuesta.
- **SOL-09** · Un alumno solo ve y gestiona sus propias solicitudes y clases; el sistema rechaza con
  403 toda operación sobre las de otro alumno; un profesor tampoco puede operar solicitudes ni clases
  de otro profesor (PRF-07).
- **SOL-10** · Un alumno no puede tener más de 10 solicitudes pendientes a la vez con un mismo
  profesor, sumando reservas, movimientos y cancelaciones; las de un profesor no cuentan para otro. Al
  pedir la undécima con ese profesor, el sistema la rechaza con un mensaje que dice el límite y no
  ocupa ningún hueco. Al responder el profesor una solicitud, el alumno vuelve a poder pedir con él
  (DEC-27).

### 3.5 Gestión del profesor

- **PRF-01** · El profesor crea una clase suelta o una serie para cualquier alumno suyo, con o sin
  cuenta, en un hueco libre de su agenda, y queda confirmada sin solicitud. La ficha de quien tiene
  cuenta es de la persona: el profesor la ve y no la edita, y solo edita la de los alumnos sin cuenta
  que cargó él (DEC-32).
- **PRF-02** · El profesor mueve una clase a un hueco libre, eligiendo "solo esta clase" o "de acá
  en adelante" si es de una serie, y el cambio queda confirmado al instante.
- **PRF-03** · El profesor cancela una clase o una serie desde una fecha, y los huecos se liberan.
- **PRF-04** · La anticipación mínima de AGE-04 no limita las acciones del profesor.
- **PRF-05** · En la agenda por día, el profesor ve en cada hueco quién toma la clase, el titular,
  la observación y el estado.
- **PRF-06** · La vista en modo lista muestra las solicitudes pendientes ordenadas por fecha de la
  clase y las clases de su agenda filtrables por rango de fechas y por alumno, incluidas las pasadas.
- **PRF-07** · Un profesor solo ve y gestiona sus alumnos, sus clases, sus solicitudes, sus bloqueos
  y su configuración; toda consulta u operación sobre datos de otro profesor no devuelve datos o se
  rechaza con 403.
- **PRF-08** · Con el profesor inactivo (ADM-05) su panel sigue disponible para ver y gestionar lo ya
  existente: ve su agenda, sus alumnos, sus clases y sus solicitudes (las pendientes quedaron
  canceladas al inactivarlo, AGE-11), y gestiona las reservas ya confirmadas: las ve y cancela
  clases o series (PRF-03); no crea ni mueve clases, no aprueba accesos y no da de alta alumnos
  hasta que lo reactiven (DEC-30, DEC-35).

### 3.6 Avisos

- **AVI-01** · La web del profesor muestra un contador de solicitudes pendientes y de cuentas
  pendientes de aprobación; los contadores son los del profesor que mira.
- **AVI-02** · El sistema manda un mail al profesor al que va dirigida cada solicitud nueva y al
  profesor al que pidió acceso cada persona nueva pendiente de aprobación.
- **AVI-03** · El sistema manda un mail al titular cuando el profesor confirma o rechaza su
  solicitud o su acceso con él, con el motivo si lo escribió.
- **AVI-04** · El sistema manda un mail al titular cuando un profesor crea, mueve o cancela una
  clase suya, o lo suma como alumno suyo (ALU-07); un alumno sin cuenta no recibe mails.
- **AVI-05** · El proceso programado manda al titular un recordatorio por mail 24 horas antes de
  cada clase confirmada, una sola vez por clase.
- **AVI-06** · El proceso programado avisa por mail al titular 7 días antes del borrado de ALU-10.
- **AVI-07** · Todos los mails, incluidos los códigos de ingreso, salen de la casilla de la
  aplicación. Los de un profesor a su alumno (AVI-03, AVI-04, AVI-05) muestran el nombre de ese
  profesor como remitente y responden a su mail (Reply-To); los avisos al profesor (AVI-02), los de
  borrado (AVI-06) y los códigos de ingreso muestran el nombre del servicio. La cuota de Gmail es de
  la casilla y la comparten todos los profesores.
- **AVI-08** · El sistema encola como máximo 20 mails por hora y 200 por día por profesor, y además
  toda la aplicación tiene un tope de 400 mails por día, porque la cuota de Gmail es una sola y los
  códigos de ingreso salen de la misma casilla. Un mail que supera un tope no se envía: queda
  registrado como fallido con motivo de tope (NFR-07), y la operación que lo originó se completa
  igual. Los códigos de ingreso que envía Supabase Auth no cuentan en este tope (tienen su propio
  límite) (DEC-27).

### 3.7 Administración

- **ADM-01** · Hay un único Administrador, el dueño del servicio, identificado por el mail que se
  fija en el despliegue; ingresa con Google o con código como cualquier persona (ALU-01). Ninguna
  pantalla permite hacerse Administrador.
- **ADM-02** · El Administrador da de alta un profesor con mail, nombre y enlace (`<slug>`:
  minúsculas, dígitos y guiones, de 3 a 30 caracteres, único y no reservado); el sistema rechaza el
  alta si el enlace es inválido, repetido o reservado, y si el mail ya es de un profesor o de una
  persona con la ficha completa (409; DEC-31). Al darlo de alta se le avisa al profesor que su nombre
  es público en su enlace y que su mail lo ven sus alumnos como dirección de respuesta (DEC-34). El
  profesor nace activo (ADM-05), entra con ese mail con Google o con código y ve su panel sin
  aprobación; su agenda parte con los valores iniciales de AGE-01 y AGE-02. Nadie se registra como
  profesor por su cuenta: quien entra con un mail sin alta es alumno (DEC-30, DEC-31).
- **ADM-03** · El Administrador ve la lista de profesores con nombre, mail, enlace y estado (activo
  o inactivo), y copia cada enlace.
- **ADM-04** · El Administrador, por serlo, no ve fichas, clases ni solicitudes de ningún alumno ni
  la agenda de ningún profesor. Si es además profesor, actúa como tal solo sobre su propia agenda; un
  profesor no es alumno de otro (DEC-31).
- **ADM-05** · El Administrador, y solo él, inactiva a un profesor y lo reactiva. Inactivar es una
  pausa: no borra clases ni datos; cancela todas sus solicitudes pendientes y mantiene las reservas
  ya confirmadas, y rigen AGE-11 y PRF-08; al reactivarlo todo queda como estaba, salvo las
  solicitudes canceladas, que no vuelven (el alumno pide de nuevo). No hay baja de un profesor ni cambio de su enlace (DEC-30).

## 4. Interfaz

Aplicación web de una sola página en React 19 con TypeScript, compilada con Vite y publicada como
sitio estático en GitHub Pages. En español. Funciona en las dos últimas versiones de Chrome,
Safari, Firefox y Edge, y en pantallas desde 360 px de ancho. Las rutas usan `#` porque GitHub
Pages no reescribe direcciones; la agenda de cada profesor es la ruta `#/p/<slug>`.

- **WEB-01** · Agenda por día de un profesor, para todos: se abre desde su enlace (AGE-09) y muestra
  su nombre; selector de día (anterior, siguiente y calendario) y los huecos del día como libre,
  ocupado o bloqueado; estados cargando, error y día sin huecos. Un alumno aprobado toca un hueco
  libre y abre el formulario de solicitud. Una persona con la ficha completa y sin vínculo con ese
  profesor ve "Pedir acceso" (ALU-14); con el vínculo pendiente o rechazado ve su estado y no puede
  pedir. Con el profesor inactivo muestra el aviso de AGE-11 en lugar de la agenda. Un visitante sin
  sesión que toca un hueco libre ve una invitación a ingresar con un acceso a la pantalla de ingreso
  (WEB-02); no se crea ninguna solicitud ni se pide ningún dato.
- **WEB-02** · Ingreso: "Continuar con Google" y "Entrar con un código por mail" (pide el mail,
  resuelve un desafío CAPTCHA y luego pide el código); muestra el error si el código es incorrecto o
  venció, y si el desafío no se resolvió no envía ningún código. El ingreso con Google no pide
  CAPTCHA. Si la persona llegó desde el enlace de un profesor, al terminar el ingreso vuelve a la
  agenda de ese profesor.
- **WEB-03** · Ficha del alumno: datos del titular, personas a cargo y el estado de aprobación con
  cada profesor, con el motivo del profesor que rechazó, si lo escribió; el «cómo llegaste» de cada
  profesor va en el vínculo con él (ALU-14).
- **WEB-04** · Formulario de solicitud: quién toma la clase (yo, una persona a cargo o agregar una
  nueva), clase suelta o serie semanal o quincenal, observación y fechas salteadas.
- **WEB-05** · Mis clases, para el alumno: próximas y pasadas de todos sus profesores, cada una con
  su profesor y su estado, el estado de su vínculo con cada profesor (con el motivo si fue
  rechazado), solicitudes pendientes y las acciones mover y avisar que no voy, con "solo esta clase"
  o "de acá en adelante".
- **WEB-06** · Panel del profesor: agenda por día con nombres, contador de pendientes y las acciones
  crear, mover y cancelar clases y bloquear o desbloquear huecos. Solo con los datos de ese profesor.
- **WEB-07** · Vista en modo lista del profesor: solicitudes pendientes con confirmar y rechazar,
  clases filtrables, cuentas pendientes con la sugerencia de unión y lista de alumnos. Solo con los
  datos de ese profesor.
- **WEB-08** · Configuración del profesor: grilla semanal, duración de clase, anticipación mínima,
  huso horario y registro de mails fallidos. Muestra su enlace con un botón para copiarlo; el registro
  de mails fallidos es el de los mails que originó su agenda.
- **WEB-09** · Página principal sin enlace de profesor: muestra solo "Pedile el enlace a tu profesor"
  y el acceso al ingreso; no lista profesores ni muestra agenda. Quien ya tiene un vínculo abre la
  agenda de ese profesor, o el selector de WEB-11 si tiene más de uno.
- **WEB-10** · Administración de profesores, solo para el Administrador: lista de profesores con su
  enlace y su estado, con las acciones inactivar y reactivar, y un formulario simple de alta con mail,
  nombre y enlace, con el error de cada validación de ADM-02.
- **WEB-11** · Selector de profesor, para quien tiene más de un vínculo: aparece siempre arriba, en
  las pantallas del alumno, y lista sus profesores con el estado con cada uno; al elegir uno, la
  agenda, "Pedir acceso" y los pedidos se refieren a ese profesor. Mis clases sigue mostrando las
  clases de todos con su profesor (RES-06). Con un solo profesor no aparece y se abre su agenda
  (DEC-25, DEC-28).
- **WEB-12** · Nombre e ícono: la aplicación se llama "Agenda Clases App" y usa el ícono de
  `docs/marca/agenda-clases-app-icono.jpg`. El nombre aparece en el título de cada página, en el
  encabezado junto al ícono y en las páginas de condiciones y privacidad; el ícono es también el
  favicon. El remitente visible de los mails de la aplicación y de los códigos de ingreso es el mismo
  nombre (AVI-07). Los identificadores internos (slug, rutas, paquetes) no cambian (CR-003).
- **WEB-13** · Quién está conectado: en todas las pantallas con sesión, el encabezado muestra
  junto a "Salir" el nombre de la persona (el mail, si la cuenta no tiene nombre) y, cuando la
  cuenta tiene más de un rol (profesor y Administrador), los dos. El lector de pantalla lo anuncia
  como "Conectado como …"; en 360 px entra sin romper el encabezado y va en el menú junto a
  "Salir" (CR-004).

## 5. Integraciones y API

No hay una API propia: la web habla directamente con Supabase mediante la librería `supabase-js` v2
y la clave pública del proyecto. Los permisos los aplica la base de datos con seguridad por fila de
Postgres; las operaciones que tocan varios registros a la vez (crear, confirmar o rechazar una
solicitud, unir alumnos) son funciones de Postgres que se ejecutan en una sola transacción. Las
fechas viajan en ISO-8601 con su desplazamiento horario.

- **Supabase Auth:** proveedor Google (credencial OAuth de Google Cloud Console, solo nombre y
  mail) e ingreso por código de un solo uso enviado por mail.
- **CAPTCHA:** Cloudflare Turnstile (gratuito) protege el pedido de código de ingreso; Supabase Auth
  valida el desafío con la clave secreta, que solo existe como secreto de Supabase (NFR-02). La
  clave pública del widget viaja en la web.
- **Gmail:** una función de Supabase (Edge Function) manda los mails por `smtp.gmail.com`, puerto
  465, con una contraseña de aplicación de la cuenta de la aplicación (`agendaclasesapp@gmail.com`,
  DEC-15); los mails de un profesor llevan su nombre en el remitente visible y su mail en Reply-To;
  Supabase Auth usa la misma casilla con el nombre del servicio como SMTP propio para los códigos de
  ingreso. Si Gmail no responde, la operación que originó el mail se completa igual y el envío queda
  registrado como fallido.
- **Proceso programado:** `pg_cron` dentro de Supabase ejecuta cada 15 minutos los recordatorios y
  una vez por día los avisos y borrados por inactividad.
- **GitHub Actions:** compila y publica la web, y mantiene activo el proyecto de Supabase (§8).

## 6. Datos

Entidades: Administrador; profesor, con su enlace, su estado (activo o inactivo) y su configuración
(grilla, duración, anticipación, huso horario); titular con su ficha única; vínculo titular-profesor
con su estado y motivo de rechazo; persona a cargo; alumno sin cuenta de un profesor; bloqueo; reserva
(suelta o serie, con su frecuencia) y sus clases; solicitud (tipo, alcance, estado y motivo); topes de
solicitudes pendientes, fichas por hora y mails por hora y por día; registro de mails enviados y
fallidos. Cada bloqueo, reserva, clase, solicitud, alumno sin cuenta y registro de mails pertenece a
un profesor; la ficha y las personas a cargo pertenecen a la persona; el estado y el motivo de
rechazo, al vínculo con cada profesor.

Datos personales: nombre, mail, teléfono, fecha de nacimiento, cómo llegó y motivo de rechazo, de titulares, personas
a cargo (que pueden ser menores de edad) y alumnos sin cuenta. Se guardan en la base Postgres de
Supabase. Los ve cada profesor solo de sus alumnos; cada titular ve solo los suyos y los de sus
personas a cargo; el Administrador y el visitante no ven ninguno. Se borran por inactividad según
ALU-10 o cuando el profesor borra al alumno (ALU-12). El registro de mails guarda fecha,
destinatario, tipo y motivo del fallo.

## 7. Requisitos no funcionales

- **NFR-01** · Autorización: todas las tablas tienen seguridad por fila de Postgres activa; el
  visitante solo obtiene si cada hueco está libre, ocupado o bloqueado, el alumno solo sus filas y
  cada profesor solo las de su agenda y sus alumnos, y el Administrador solo la tabla de profesores.
  Una consulta a filas ajenas no devuelve datos.
- **NFR-02** · Secretos: la contraseña de aplicación de Gmail, el secreto OAuth de Google y la
  clave de servicio de Supabase solo existen como secretos de Supabase o de GitHub; una búsqueda en
  el repositorio y en el sitio publicado no encuentra ninguno.
- **NFR-03** · Integridad: confirmar un movimiento actualiza el hueco original y el destino en una
  sola transacción; ante un fallo no queda ninguno de los dos cambios.
- **NFR-04** · Rendimiento: la agenda de un día se muestra completa en menos de 2 s en el percentil
  95, con el perfil de red 4G de las herramientas de desarrollo de Chrome.
- **NFR-05** · Accesibilidad: nivel WCAG 2.1 AA; libre, ocupado y bloqueado se distinguen también
  por texto o ícono, no solo por color.
- **NFR-06** · Uso en celular: todas las pantallas funcionan desde 360 px de ancho sin
  desplazamiento horizontal, con áreas táctiles de al menos 44 px.
- **NFR-07** · Observabilidad: cada mail que falla queda registrado con fecha, destinatario, tipo y
  motivo, y el profesor lo ve en su configuración.
- **NFR-08** · Disponibilidad: el proyecto de Supabase no se pausa por inactividad gracias a la
  tarea de mantenimiento de §8.
- **NFR-09** · Costo: todo funciona en planes gratuitos: GitHub Free con repositorio público,
  Supabase Free y una cuenta personal de Gmail (unos 500 mails por día); la cuota de Gmail es
  compartida por todos los profesores.

## 8. Despliegue y operación

- **Repositorio:** público en GitHub. El código es visible; los datos viven en Supabase.
- **Pipeline de la web:** un workflow de GitHub Actions corre en cada push a `main`: instala con
  `npm ci`, ejecuta lint y pruebas, compila con Vite y despliega en GitHub Pages con
  `actions/deploy-pages`. Se publica en `https://<usuario>.github.io/<repositorio>/`; el enlace de
  cada profesor es `https://<usuario>.github.io/<repositorio>/#/p/<slug>`, y la raíz sin enlace deja
  de mostrar una agenda (WEB-09).
- **Variables de entorno de compilación:** `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, ambas
  públicas, como variables del repositorio.
- **Supabase:** un proyecto de producción en el plan Free. Las migraciones de la base van
  versionadas en `supabase/migrations` y las funciones en `supabase/functions`; se despliegan con
  Supabase CLI.
- **Secretos de Supabase:** `GMAIL_USER` (la casilla de la aplicación) y `GMAIL_APP_PASSWORD`.
  Supabase Auth se configura con el proveedor Google, la dirección de retorno del sitio publicado y
  el SMTP de Gmail.
- **Administrador inicial:** el mail del Administrador es un ajuste del despliegue; el primer
  profesor, el actual, se da de alta con la pantalla WEB-10 y sus datos existentes quedan con su
  enlace.
- **Entorno local:** Supabase CLI con su base local en contenedores Docker, para desarrollar y
  probar sin tocar producción.
- **Tarea de mantenimiento:** un workflow programado cada 3 días hace una consulta mínima al
  proyecto de Supabase y sigue ejecutándose aunque el repositorio pase más de 60 días sin cambios.
  Si falla, GitHub manda su mail de ejecución fallida al responsable del repositorio.
- **Versiones:** Node.js 22 LTS, React 19, TypeScript 5 y la versión estable de Vite vigente al
  iniciar, fijadas en `package-lock.json`.

## 9. Criterios de aceptación

- **CA-01** · Una persona sin cuenta entra con Google y, en otra prueba, con el código de 6 dígitos
  recibido por mail; en ningún paso se le pide una contraseña (ALU-01, WEB-02).
- **CA-02** · En el primer ingreso no se puede salir de la ficha hasta completar nombre, teléfono y
  fecha de nacimiento, y cómo llegó si entró desde el enlace de un profesor; con Google, nombre y
  mail aparecen cargados (ALU-02, WEB-03).
- **CA-03** · Una persona con el vínculo pendiente o rechazado con un profesor que intenta crear una
  solicitud dirigida a él recibe un rechazo y no se crea nada, aunque otro profesor la haya aprobado
  (ALU-03).
- **CA-04** · Al aprobar a una persona con teléfono "099 123-456" existiendo un alumno sin cuenta de
  ese mismo profesor con "+598 99123456", el profesor ve la sugerencia; al confirmarla, las clases
  del alumno sin cuenta aparecen en la cuenta y el alumno sin cuenta ya no existe; al descartarla,
  nada cambia; con un alumno sin cuenta de otro profesor con el mismo teléfono no hay sugerencia
  (ALU-04, ALU-05).
- **CA-05** · El alumno agrega una persona a cargo y luego la elige al pedir una clase (ALU-06,
  RES-03, WEB-04).
- **CA-06** · El profesor da de alta un alumno con mail y esa persona entra con código a ese mail
  sin pasar por aprobación de ese profesor; uno dado de alta sin mail no puede iniciar sesión ni
  recibe mails (ALU-07, ALU-08, AVI-04).
- **CA-07** · La lista de alumnos del profesor muestra el estado de cada uno con él y la edad
  calculada desde la fecha de nacimiento (ALU-09).
- **CA-08** · Con la fecha simulada 6 meses después de la última clase, el proceso programado borra
  los datos personales y las personas a cargo; las clases pasadas siguen contando como ocupadas en
  el historial sin nombre (ALU-10).
- **CA-09** · Un ingreso del alumno 5 meses después de su última clase evita el borrado al mes
  siguiente (ALU-11).
- **CA-10** · El profesor borra un alumno con clases futuras: sus clases futuras con ese profesor
  quedan canceladas y los huecos aparecen libres; sus datos se borran solo si era alumno sin cuenta y
  sin otro profesor; si tiene cuenta, su cuenta y su ficha siguen (ALU-12).
- **CA-11** · Con la grilla inicial y duración de 60 minutos, el lunes muestra 9 huecos, de 08:00 a
  13:00 y de 14:00 a 18:00; con duración de 90 minutos, el tramo de la mañana genera 3 huecos
  (AGE-01, AGE-02).
- **CA-12** · Después de cambiar la duración, las clases confirmadas y las solicitudes pendientes
  conservan su horario (AGE-03).
- **CA-13** · Con anticipación mínima de 24 horas, una solicitud de reserva, movimiento o
  cancelación para dentro de 20 horas se rechaza con el motivo, y el profesor sí puede crear esa
  clase (AGE-04, PRF-04).
- **CA-14** · Un bloqueo que cubre una clase confirmada o una solicitud pendiente se rechaza
  indicando cuál; uno sobre huecos libres los muestra bloqueados, y al quitarlo vuelven a libres
  (AGE-05, AGE-06).
- **CA-15** · Sin sesión, la respuesta que recibe el navegador para la agenda del día de un profesor
  no contiene nombres, observaciones, motivos de bloqueo ni ningún dato personal, ni datos de otro
  profesor, y un hueco con solicitud pendiente figura ocupado (AGE-07, NFR-01, WEB-01).
- **CA-16** · Con el huso horario configurado, una clase de las 10:00 se muestra a las 10:00 en un
  navegador configurado en otro huso (AGE-08).
- **CA-17** · Dos solicitudes simultáneas por el mismo hueco: una queda pendiente y la otra recibe
  que el hueco ya no está libre (RES-01).
- **CA-18** · Una serie semanal confirmada ocupa el mismo hueco en las semanas siguientes; una
  quincenal, cada dos semanas (RES-02).
- **CA-19** · Al pedir una serie con una fecha futura ya bloqueada, el formulario la muestra como
  salteada y esa fecha no queda reservada (RES-05, WEB-04).
- **CA-20** · El alumno ve sus clases próximas y pasadas con quién toma cada una, la observación y
  su estado (RES-04, RES-06, WEB-05).
- **CA-21** · Una solicitud de reserva nueva aparece pendiente para el alumno, ocupada en el
  calendario público de ese profesor y en su lista de pendientes (SOL-01, PRF-06, AVI-01).
- **CA-22** · Mientras un movimiento está pendiente, la clase sigue en su hueco original y el
  destino figura ocupado; al confirmarlo, la clase pasa al destino y el original queda libre; al
  rechazarlo, el destino queda libre (SOL-02, SOL-05, SOL-06, NFR-03).
- **CA-23** · Una cancelación confirmada deja la clase cancelada y el hueco libre; una rechazada
  deja la clase confirmada; el motivo escrito por el profesor llega en el mail (SOL-03, SOL-04,
  SOL-05, SOL-06, AVI-03).
- **CA-24** · Una cancelación "de acá en adelante" confirmada libera los huecos de todas las fechas
  siguientes de la serie y deja las anteriores intactas; un movimiento "de acá en adelante"
  confirmado crea la serie en el nuevo hueco desde esa fecha (SOL-07).
- **CA-25** · Una solicitud sin respuesta cuyo horario ya pasó figura en el historial como pendiente
  sin respuesta (SOL-08).
- **CA-26** · Un alumno que pide las clases o solicitudes de otro con su sesión recibe 403 o ningún
  dato (SOL-09, NFR-01).
- **CA-27** · El profesor crea una clase para un alumno sin cuenta suyo, mueve una de una serie solo
  esa vez y cancela una serie desde una fecha, y cada cambio queda confirmado sin solicitud; edita la
  ficha de un alumno sin cuenta que cargó, y la edición de la ficha de una persona con cuenta se
  rechaza (PRF-01, PRF-02, PRF-03, WEB-06, DEC-32).
- **CA-28** · En el panel, el profesor ve en cada hueco ocupado quién toma la clase, el titular y la
  observación (PRF-05, WEB-06).
- **CA-29** · La vista en modo lista filtra clases de la agenda del profesor por rango de fechas y
  por alumno e incluye las pasadas (PRF-06, WEB-07).
- **CA-30** · Cada solicitud nueva y cada cuenta nueva generan un mail al profesor al que van
  dirigidas; cada creación, movimiento o cancelación del profesor genera un mail al titular (AVI-02,
  AVI-04).
- **CA-31** · Una clase confirmada genera exactamente un recordatorio, enviado entre 24 horas y 23
  horas 45 minutos antes de la clase (AVI-05).
- **CA-32** · El aviso de inactividad llega 7 días antes del borrado (AVI-06).
- **CA-33** · Los mails llegan con remitente la casilla de la aplicación; los de un profesor al
  alumno con su nombre visible y Reply-To a su mail, y los códigos de ingreso con el nombre del
  servicio (AVI-07).
- **CA-34** · Con credenciales de Gmail inválidas, confirmar una solicitud funciona igual y el envío
  fallido aparece en la configuración del profesor con fecha, destinatario, tipo y motivo (NFR-07,
  WEB-08).
- **CA-35** · Una búsqueda de la contraseña de Gmail, el secreto OAuth y la clave de servicio en el
  repositorio y en los archivos publicados no da resultados (NFR-02).
- **CA-36** · La agenda de un día carga completa en menos de 2 s en el percentil 95 con el perfil
  4G de Chrome (NFR-04).
- **CA-37** · Una revisión automática de accesibilidad no encuentra errores de nivel AA y los
  estados de los huecos se leen sin color (NFR-05).
- **CA-38** · Todas las pantallas a 360 px de ancho no tienen desplazamiento horizontal y sus
  botones miden al menos 44 px (NFR-06).
- **CA-39** · Un push a `main` publica la nueva versión en GitHub Pages sin pasos manuales (NFR-09).
- **CA-40** · La tarea de mantenimiento corre cada 3 días y sigue habilitada tras 60 días sin
  cambios en el repositorio; una ejecución fallida genera el mail de GitHub al responsable (NFR-08).
- **CA-41** · Un alumno aprobado con 10 solicitudes pendientes con un profesor que pide una undécima
  a ese profesor recibe un rechazo que dice el límite y el hueco sigue libre; tras responder el
  profesor una de las diez, puede pedirla; con otro profesor sí puede pedir (SOL-10, DEC-27).
- **CA-42** · Con 20 mails ya encolados en la hora, el mail 21 queda registrado como fallido con
  motivo de tope y la operación que lo originó se completa; igual con 200 en el día (AVI-08, NFR-07).
- **CA-43** · Con 10 fichas completadas en la última hora, la ficha 11 se rechaza con un mensaje de
  intentar más tarde y no crea cuenta; pasada la hora se acepta (ALU-13).
- **CA-44** · En la pantalla de ingreso, pedir un código sin resolver el desafío CAPTCHA no envía
  ningún mail ni crea cuenta; resuelto, el código llega; "Continuar con Google" no pide desafío
  (WEB-02, CA-01).
- **CA-45** · Una cuenta rechazada con un motivo escrito ve ese motivo, el del profesor que rechazó,
  en su ficha y en Mis clases junto a ese profesor, y el texto aparece como texto, no como HTML; sin
  motivo, solo el estado; tras el borrado de ALU-10 el motivo ya no existe (ALU-03, ALU-10, WEB-03,
  WEB-05).
- **CA-46** · Un visitante sin sesión que toca un hueco libre ve la invitación a ingresar con el
  acceso a WEB-02 y no se crea ninguna solicitud (WEB-01).
- **CA-47** · Con dos profesores, el enlace de cada uno muestra solo su agenda con su nombre; un
  enlace inexistente muestra "Enlace no válido, pedile el enlace a tu profesor" y no lista
  profesores (AGE-09).
- **CA-48** · La página principal sin enlace de una persona sin vínculos muestra "Pedile el enlace a
  tu profesor", sin agenda ni lista de profesores (WEB-09).
- **CA-49** · El Administrador da de alta un profesor con mail, nombre y enlace; un enlace repetido,
  inválido o reservado se rechaza; el profesor nace activo, la persona entra con ese mail y ve su
  panel sin aprobación; una operación de alta hecha por un alumno o un profesor recibe 403 y nadie
  puede registrarse como profesor (ADM-01, ADM-02, WEB-10).
- **CA-50** · Con sesión de Administrador que no es profesor, ninguna consulta devuelve fichas,
  clases ni solicitudes de alumnos; sí la lista de profesores (ADM-03, ADM-04, NFR-01).
- **CA-51** · Una persona completa la ficha desde el enlace de A, queda pendiente con A, pide acceso
  a B sin repetir la ficha y queda pendiente con B; A aprueba y B rechaza con motivo: ve aprobado con
  A y rechazado con el motivo de B, puede pedir a A y una solicitud dirigida a B se rechaza; sin
  enlace ni pedido, no queda vinculada a nadie (ALU-02, ALU-03, ALU-14, WEB-01).
- **CA-52** · Un profesor no ve en la lista, el panel ni las consultas las fichas, clases,
  solicitudes ni bloqueos de otro profesor, y una operación sobre ellos recibe 403 o ningún dato; un
  alumno solo de A no puede pedir en la agenda de B (PRF-07, ALU-09, SOL-09, NFR-01).
- **CA-53** · Un alumno aprobado con A y con B, con clases con ambos, ve todas en Mis clases, cada
  una con su profesor; el selector, siempre visible arriba, lista sus profesores con el estado de
  cada vínculo y abre la agenda del elegido; con un solo profesor el selector no aparece (RES-06,
  WEB-05, WEB-11).
- **CA-54** · Cambiar la grilla, la duración, la anticipación, el huso o un bloqueo de A no cambia lo
  de B; el mismo horario puede estar ocupado con A y libre con B (AGE-10, RES-07).
- **CA-55** · Una solicitud hecha en la agenda de A aparece solo en el contador, la lista y el mail
  de A, y solo A puede confirmarla o rechazarla (SOL-01, SOL-04, AVI-01, AVI-02).
- **CA-56** · El mail de confirmación de A llega desde la casilla de la aplicación con el nombre de A
  y Reply-To a su mail; el de B con los de B; el código de ingreso sale con el nombre del servicio y
  sin Reply-To; la cuota de Gmail es una sola (AVI-07, NFR-09).
- **CA-57** · Un profesor borra a un alumno que también es de otro: sus clases futuras con él se
  cancelan y deja de verlo, y la cuenta, la ficha y las clases con el otro siguen; si era un alumno
  sin cuenta y sin otro profesor, los datos se borran como en ALU-10, y si tiene cuenta, la cuenta y
  la ficha siguen (ALU-12, DEC-26).
- **CA-58** · Al aprobar, la sugerencia de unión compara solo con los alumnos sin cuenta del mismo
  profesor (ALU-04).
- **CA-59** · Con la fecha simulada, una persona con última clase hace 7 meses con A y hace 2 meses
  con B no se borra; con 6 meses desde la última clase con cualquiera, se borra la ficha y las
  personas a cargo (ALU-10, ALU-11, DEC-26).
- **CA-60** · Con 20 mails de A en la hora, el 21 de A queda fallido y B sigue enviando; con 200
  mails de A y 200 de B en el día, el siguiente de cualquiera queda fallido por el tope global de
  400; 10 pendientes con A no impiden pedir con B; el tope de fichas es por profesor de origen
  (SOL-10, AVI-08, ALU-13, DEC-27).
- **CA-61** · El profesor B da de alta con el mail de una persona que ya tiene cuenta por A: no se
  crea otra cuenta ni cambia su ficha, la persona queda aprobada con B y lo ve en su selector, recibe
  el mail de AVI-04, B ve la ficha que ya tenía y su vínculo con A no cambia; el alta con el mail de
  otro profesor o del Administrador recibe `MAIL_YA_REGISTRADO` (409) sin datos de esa persona, y el
  alta de un profesor con el mail de una persona con ficha completa también da 409 (ALU-07, ADM-02,
  DEC-29, DEC-31).
- **CA-62** · Una persona que pide acceso a A y a B responde «cómo llegaste» ante cada uno, y cada
  profesor ve solo su respuesta (ALU-14, DEC-33).
- **CA-63** · El Administrador inactiva a un profesor con clases confirmadas, solicitudes pendientes
  y alumnos: sus solicitudes pendientes quedan todas canceladas y las clases confirmadas se
  mantienen; su enlace muestra que no toma reservas y no su agenda; nadie puede pedirle acceso ni
  crearle solicitudes; el profesor entra, ve lo existente y cancela una clase, pero no crea ni mueve;
  las clases confirmadas siguen visibles para sus alumnos en Mis clases; lo de otros profesores no
  cambia; al reactivarlo, su enlace y su agenda quedan como antes y las solicitudes canceladas no
  vuelven (ADM-05, AGE-11, PRF-08, DEC-30, DEC-35).
- **CA-64** · Solo el Administrador inactiva o reactiva a un profesor: la operación hecha por un
  profesor o un alumno recibe 403, y la lista de profesores muestra el estado de cada uno (ADM-03,
  ADM-05, WEB-10).
- **CA-65** · Al abrir cualquier página se ve "Agenda Clases App" en el título de la pestaña y en el
  encabezado junto al ícono, el favicon es el ícono, y un mail de la aplicación y un código de ingreso
  llegan con "Agenda Clases App" como remitente visible; no queda "ReservaTuClase" en ningún texto
  visible (WEB-12, AVI-07).
- **CA-66** · Con la sesión iniciada, el encabezado muestra junto a "Salir" el nombre de un
  profesor o de un alumno, y el mail del Administrador sin nombre; un profesor que además es
  Administrador ve "Profesor y Administrador" y uno que no, ningún rol; el lector de pantalla
  anuncia "Conectado como" seguido del nombre, y sin sesión no aparece (WEB-13).

Los CA-37 y CA-38 (accesibilidad y 360 px) alcanzan también a WEB-09, 10 y 11.

## 10. Decisiones abiertas

No hay decisiones abiertas.

## 11. Glosario

| Término | Definición |
| --- | --- |
| Grilla semanal | Tramos horarios de cada día de la semana en los que el profesor da clases. |
| Tramo | Franja continua de una grilla, por ejemplo de 08:00 a 13:00. |
| Hueco | Espacio de una clase dentro de un tramo, con la duración que define el profesor. |
| Libre / ocupado / bloqueado | Estados de un hueco en el calendario público. Ocupado incluye las solicitudes pendientes. |
| Bloqueo | Hueco, rango de horas o día que el profesor retira de la agenda. |
| Anticipación mínima | Horas antes del inicio de una clase a partir de las cuales un alumno ya no puede pedir, mover ni cancelar. |
| Titular | Adulto dueño de la cuenta, que pide y gestiona las clases. |
| Persona a cargo | Quien toma la clase sin ser titular, cargada en la cuenta del titular. |
| Alumno sin cuenta | Alumno cargado por un profesor sin mail; no ingresa al sistema. |
| Reserva | Clase suelta o serie de clases asociada a un hueco y a quien toma la clase. |
| Serie | Reserva que se repite cada semana o cada dos semanas sin fecha de fin. |
| Solicitud | Pedido de un alumno para reservar, mover o cancelar, que el profesor confirma o rechaza. |
| Solo esta clase / de acá en adelante | Alcance de un movimiento o cancelación en una serie: una fecha, o esa fecha y todas las siguientes. |
| Pendiente / confirmada / rechazada / cancelada | Estados de una solicitud o de una clase. |
| Proceso programado | Tarea dentro de Supabase que manda recordatorios y avisos y borra datos vencidos. |
| Administrador | Dueño del servicio; da de alta, inactiva y reactiva profesores (ADM-01). |
| Enlace del profesor | Dirección `#/p/<slug>` que abre la agenda pública de un profesor. |
| Vínculo | Relación de una persona con un profesor, con su estado pendiente, aprobado o rechazado. |
| Profesor inactivo | Profesor en pausa por decisión del Administrador: su enlace no toma reservas y sus solicitudes pendientes se cancelan y lo ya confirmado sigue visible (ADM-05). |
