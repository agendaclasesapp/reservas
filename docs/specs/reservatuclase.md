# Spec · ReservaTuClase

| Campo | Valor |
| --- | --- |
| Versión | 1.0 |
| Estado | aprobada |
| Dueño | Fernando Burgueño |

## 1. Contexto y alcance

Un profesor de tenis coordina hoy sus clases por mensajes: los alumnos no ven qué horarios quedan
libres, y los pedidos, cambios y avisos de que no van se dispersan entre conversaciones.
ReservaTuClase es una aplicación web gratuita donde cualquiera ve los huecos libres de la agenda,
los alumnos aprobados piden clases, piden moverlas o avisan que no van, y el profesor confirma cada
pedido y es el único que ve quién ocupa cada hueco.

**Dentro del alcance:** ingreso sin contraseña y aprobación de alumnos; agenda por día pública sin
nombres; solicitudes de reserva, movimiento y cancelación con confirmación del profesor; clases
sueltas y series semanales o quincenales; grilla semanal, duración, anticipación mínima y bloqueos;
gestión directa del profesor y vista en modo lista; avisos en la web, por mail y recordatorio;
borrado de datos por inactividad.

**Fuera de alcance:** varios profesores (hay uno solo; los datos quedan asociados a un profesor
para sumar otros en una versión futura, sin pantallas para elegir profesor); pagos y cobros;
mensajes por WhatsApp; feriados automáticos (el profesor los bloquea); una aplicación instalable
para teléfonos; dominio propio.

## 2. Actores

| Actor | Descripción |
| --- | --- |
| Visitante | Persona sin sesión iniciada. Ve el calendario público con huecos libres, ocupados y bloqueados, sin datos de nadie. |
| Alumno pendiente | Inició sesión y completó su ficha, pero el profesor todavía no lo aprobó. Ve el calendario público y su estado; no puede pedir clases. |
| Alumno | Titular adulto aprobado. Pide, mueve y cancela clases para sí o para sus personas a cargo. Ve solo sus datos y sus clases. |
| Persona a cargo | Quien toma la clase sin ser titular de la cuenta (por ejemplo, un hijo menor). No inicia sesión. |
| Alumno sin cuenta | Alumno que el profesor carga sin mail. No inicia sesión ni recibe mails. |
| Profesor | Único administrador. Configura la agenda, aprueba alumnos, confirma o rechaza solicitudes, gestiona clases y ve todos los datos. |
| Proceso programado | Tarea dentro de Supabase que manda recordatorios y avisos de inactividad y borra los datos vencidos. |
| Tarea de mantenimiento | Tarea programada de GitHub Actions que mantiene activo el proyecto de Supabase. |

## 3. Requisitos funcionales

### 3.1 Alumnos y cuentas

- **ALU-01** · La persona inicia sesión con su cuenta de Google o con un código de 6 dígitos que
  recibe por mail; el sistema no usa contraseñas.
- **ALU-02** · En su primer ingreso la persona completa su ficha con nombre, teléfono o WhatsApp,
  fecha de nacimiento y un texto obligatorio sobre cómo llegó al profesor; si entró con Google, el
  nombre y el mail vienen cargados. Sin la ficha completa solo puede ver y completar la ficha.
- **ALU-03** · Una cuenta con la ficha completa queda pendiente de aprobación hasta que el profesor
  la aprueba o la rechaza; mientras está pendiente o rechazada, el sistema rechaza toda solicitud
  suya y le muestra su estado. Si fue rechazada y el profesor escribió un motivo, la cuenta ve
  también ese motivo, en su ficha y en Mis clases, además de recibirlo por mail (AVI-03).
- **ALU-04** · Al aprobar una cuenta, si su teléfono normalizado (sin espacios, guiones, paréntesis
  ni prefijo internacional) coincide con el de un alumno sin cuenta, el profesor ve la sugerencia de
  unirlos y la confirma o la descarta; nunca se unen sin su confirmación.
- **ALU-05** · Al confirmar la unión de ALU-04, las clases, solicitudes e historial del alumno sin
  cuenta pasan a la cuenta aprobada y el alumno sin cuenta deja de existir.
- **ALU-06** · El alumno registra y edita personas a cargo con nombre y fecha de nacimiento.
- **ALU-07** · Si el profesor da de alta un alumno con nombre, teléfono, fecha de nacimiento y mail,
  el sistema crea una cuenta ya aprobada con ese mail, y la persona entra con Google o con código
  usando ese mail.
- **ALU-08** · Si el profesor da de alta un alumno sin mail, queda como alumno sin cuenta: no puede
  iniciar sesión y no recibe mails.
- **ALU-09** · El profesor ve la lista de alumnos con su estado (pendiente, aprobado, rechazado o
  sin cuenta), su ficha completa y la edad calculada a partir de la fecha de nacimiento.
- **ALU-10** · Cuando pasan 6 meses desde la última clase de un alumno sin clases futuras, o 6 meses
  desde el registro de una cuenta nunca aprobada, el proceso programado borra nombre, teléfono,
  mail, fecha de nacimiento, el texto de cómo llegó, el motivo de rechazo si lo hubiera y sus
  personas a cargo, y deja sus clases pasadas sin datos de la persona.
- **ALU-11** · Cada vez que el alumno inicia sesión, el plazo de 6 meses de ALU-10 vuelve a contar
  desde ese ingreso.
- **ALU-12** · El profesor borra un alumno en cualquier momento con el mismo efecto que ALU-10;
  sus clases futuras se cancelan y sus huecos se liberan.
- **ALU-13** · El sistema limita a 10 las fichas completadas por hora entre todas las cuentas
  nuevas; al superar el tope rechaza la ficha con un mensaje que dice que hay que intentar más
  tarde, y no crea la cuenta.

### 3.2 Agenda y disponibilidad

- **AGE-01** · El profesor define una grilla semanal con uno o más tramos horarios por día; el valor
  inicial es de lunes a viernes de 08:00 a 13:00 y de 14:00 a 18:00.
- **AGE-02** · El profesor define una duración única de clase en minutos; los huecos se generan
  seguidos desde el inicio de cada tramo, y un resto menor que la duración no genera hueco.
- **AGE-03** · Un cambio de grilla o de duración no modifica clases confirmadas ni solicitudes
  pendientes; solo cambia los huecos libres que se ofrecen.
- **AGE-04** · El profesor define la anticipación mínima en horas; el sistema rechaza toda solicitud
  de un alumno sobre una clase o un hueco que empieza antes de ese plazo, y le dice por qué.
- **AGE-05** · El profesor bloquea un hueco, un rango de horas o días completos, con un motivo
  opcional; el sistema rechaza el bloqueo si cubre una clase confirmada o una solicitud pendiente y
  le indica cuáles.
- **AGE-06** · El profesor quita un bloqueo y sus huecos vuelven a ofrecerse como libres.
- **AGE-07** · El calendario público muestra cada hueco del día como libre, ocupado o bloqueado,
  sin nombres, observaciones ni motivos de bloqueo; un hueco con una solicitud pendiente se muestra
  ocupado.
- **AGE-08** · Todas las horas se guardan y se muestran en un único huso horario que configura el
  profesor.

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
- **RES-06** · El alumno ve sus clases futuras y pasadas con la fecha, la hora, quién toma cada una
  y su estado.

### 3.4 Solicitudes

- **SOL-01** · Un alumno aprobado toca un hueco libre y crea una solicitud de reserva de una clase
  suelta o de una serie; la solicitud queda pendiente y ocupa el hueco.
- **SOL-02** · El alumno pide mover una clase confirmada a otro hueco libre, eligiendo "solo esta
  clase" o "de acá en adelante" si es de una serie; mientras la solicitud está pendiente, el hueco
  destino queda ocupado y la clase sigue confirmada en su hueco original.
- **SOL-03** · El alumno avisa que no puede ir con una solicitud de cancelación de una clase
  confirmada, eligiendo "solo esta clase" o "de acá en adelante" si es de una serie; mientras la
  solicitud está pendiente, la clase sigue confirmada.
- **SOL-04** · El profesor confirma o rechaza cada solicitud y puede escribir un motivo.
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
  403 toda operación sobre las de otro.
- **SOL-10** · Un alumno no puede tener más de 5 solicitudes pendientes a la vez, sumando reservas,
  movimientos y cancelaciones; al pedir la sexta, el sistema la rechaza con un mensaje que dice el
  límite y no ocupa ningún hueco. Al responder el profesor una solicitud, el alumno vuelve a poder
  pedir.

### 3.5 Gestión del profesor

- **PRF-01** · El profesor crea una clase suelta o una serie para cualquier alumno, con o sin
  cuenta, en un hueco libre, y queda confirmada sin solicitud.
- **PRF-02** · El profesor mueve una clase a un hueco libre, eligiendo "solo esta clase" o "de acá
  en adelante" si es de una serie, y el cambio queda confirmado al instante.
- **PRF-03** · El profesor cancela una clase o una serie desde una fecha, y los huecos se liberan.
- **PRF-04** · La anticipación mínima de AGE-04 no limita las acciones del profesor.
- **PRF-05** · En la agenda por día, el profesor ve en cada hueco quién toma la clase, el titular,
  la observación y el estado.
- **PRF-06** · La vista en modo lista muestra las solicitudes pendientes ordenadas por fecha de la
  clase y las clases filtrables por rango de fechas y por alumno, incluidas las pasadas.

### 3.6 Avisos

- **AVI-01** · La web del profesor muestra un contador de solicitudes pendientes y de cuentas
  pendientes de aprobación.
- **AVI-02** · El sistema manda un mail al profesor por cada solicitud nueva y por cada cuenta nueva
  pendiente de aprobación.
- **AVI-03** · El sistema manda un mail al titular cuando el profesor confirma o rechaza su
  solicitud o su cuenta, con el motivo si lo escribió.
- **AVI-04** · El sistema manda un mail al titular cuando el profesor crea, mueve o cancela una
  clase suya; un alumno sin cuenta no recibe mails.
- **AVI-05** · El proceso programado manda al titular un recordatorio por mail 24 horas antes de
  cada clase confirmada, una sola vez por clase.
- **AVI-06** · El proceso programado avisa por mail al titular 7 días antes del borrado de ALU-10.
- **AVI-07** · Todos los mails, incluidos los códigos de ingreso, salen de la casilla de Gmail del
  profesor.
- **AVI-08** · El sistema encola como máximo 20 mails por hora y 200 por día. Un mail que supera el
  tope no se envía: queda registrado como fallido con motivo de tope (NFR-07), y la operación que lo
  originó se completa igual. Los códigos de ingreso que envía Supabase Auth no cuentan en este tope
  (tienen su propio límite).

## 4. Interfaz

Aplicación web de una sola página en React 19 con TypeScript, compilada con Vite y publicada como
sitio estático en GitHub Pages. En español. Funciona en las dos últimas versiones de Chrome,
Safari, Firefox y Edge, y en pantallas desde 360 px de ancho. Las rutas usan `#` porque GitHub
Pages no reescribe direcciones.

- **WEB-01** · Agenda por día, para todos: selector de día (anterior, siguiente y calendario) y los
  huecos del día como libre, ocupado o bloqueado; estados cargando, error y día sin huecos. Un
  alumno aprobado toca un hueco libre y abre el formulario de solicitud. Un visitante sin sesión que
  toca un hueco libre ve una invitación a ingresar con un acceso a la pantalla de ingreso (WEB-02);
  no se crea ninguna solicitud ni se pide ningún dato.
- **WEB-02** · Ingreso: "Continuar con Google" y "Entrar con un código por mail" (pide el mail,
  resuelve un desafío CAPTCHA y luego pide el código); muestra el error si el código es incorrecto o
  venció, y si el desafío no se resolvió no envía ningún código. El ingreso con Google no pide
  CAPTCHA.
- **WEB-03** · Ficha del alumno: datos del titular, cómo llegó, personas a cargo y estado de
  aprobación, con el motivo si la cuenta fue rechazada y el profesor lo escribió.
- **WEB-04** · Formulario de solicitud: quién toma la clase (yo, una persona a cargo o agregar una
  nueva), clase suelta o serie semanal o quincenal, observación y fechas salteadas.
- **WEB-05** · Mis clases, para el alumno: próximas y pasadas con su estado, el estado de su cuenta
  (con el motivo si fue rechazada), solicitudes pendientes y las acciones mover y avisar que no voy, con "solo esta clase" o "de acá en adelante".
- **WEB-06** · Panel del profesor: agenda por día con nombres, contador de pendientes y las acciones
  crear, mover y cancelar clases y bloquear o desbloquear huecos.
- **WEB-07** · Vista en modo lista del profesor: solicitudes pendientes con confirmar y rechazar,
  clases filtrables, cuentas pendientes con la sugerencia de unión y lista de alumnos.
- **WEB-08** · Configuración del profesor: grilla semanal, duración de clase, anticipación mínima,
  huso horario y registro de mails fallidos.

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
  465, con una contraseña de aplicación de la cuenta del profesor; Supabase Auth usa la misma
  casilla como SMTP propio para los códigos de ingreso. Si Gmail no responde, la operación que
  originó el mail se completa igual y el envío queda registrado como fallido.
- **Proceso programado:** `pg_cron` dentro de Supabase ejecuta cada 15 minutos los recordatorios y
  una vez por día los avisos y borrados por inactividad.
- **GitHub Actions:** compila y publica la web, y mantiene activo el proyecto de Supabase (§8).

## 6. Datos

Entidades: profesor y su configuración (grilla, duración, anticipación, huso horario); titular con
su ficha, estado y motivo de rechazo; persona a cargo; alumno sin cuenta; bloqueo; reserva (suelta o
serie, con su frecuencia) y sus clases; solicitud (tipo, alcance, estado y motivo); topes de
solicitudes pendientes, fichas por hora y mails por hora y por día; registro de mails enviados y
fallidos. Todo registro pertenece a un profesor, para sumar otros en el futuro.

Datos personales: nombre, mail, teléfono, fecha de nacimiento, cómo llegó y motivo de rechazo, de titulares, personas
a cargo (que pueden ser menores de edad) y alumnos sin cuenta. Se guardan en la base Postgres de
Supabase. Los ve el profesor; cada titular ve solo los suyos y los de sus personas a cargo; el
visitante no ve ninguno. Se borran por inactividad según ALU-10 o cuando el profesor borra al
alumno (ALU-12). El registro de mails guarda fecha, destinatario, tipo y motivo del fallo.

## 7. Requisitos no funcionales

- **NFR-01** · Autorización: todas las tablas tienen seguridad por fila de Postgres activa; el
  visitante solo obtiene si cada hueco está libre, ocupado o bloqueado, el alumno solo sus filas y
  el profesor todas. Una consulta a filas ajenas no devuelve datos.
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
  Supabase Free y una cuenta personal de Gmail (unos 500 mails por día).

## 8. Despliegue y operación

- **Repositorio:** público en GitHub. El código es visible; los datos viven en Supabase.
- **Pipeline de la web:** un workflow de GitHub Actions corre en cada push a `main`: instala con
  `npm ci`, ejecuta lint y pruebas, compila con Vite y despliega en GitHub Pages con
  `actions/deploy-pages`. Se publica en `https://<usuario>.github.io/<repositorio>/`.
- **Variables de entorno de compilación:** `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, ambas
  públicas, como variables del repositorio.
- **Supabase:** un proyecto de producción en el plan Free. Las migraciones de la base van
  versionadas en `supabase/migrations` y las funciones en `supabase/functions`; se despliegan con
  Supabase CLI.
- **Secretos de Supabase:** `GMAIL_USER` y `GMAIL_APP_PASSWORD`. Supabase Auth se configura con el
  proveedor Google, la dirección de retorno del sitio publicado y el SMTP de Gmail.
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
- **CA-02** · En el primer ingreso no se puede salir de la ficha hasta completar nombre, teléfono,
  fecha de nacimiento y cómo llegó; con Google, nombre y mail aparecen cargados (ALU-02, WEB-03).
- **CA-03** · Una cuenta pendiente o rechazada que intenta crear una solicitud recibe un rechazo y
  no se crea nada (ALU-03).
- **CA-04** · Al aprobar una cuenta con teléfono "099 123-456" existiendo un alumno sin cuenta con
  "+598 99123456", el profesor ve la sugerencia; al confirmarla, las clases del alumno sin cuenta
  aparecen en la cuenta y el alumno sin cuenta ya no existe; al descartarla, nada cambia (ALU-04,
  ALU-05).
- **CA-05** · El alumno agrega una persona a cargo y luego la elige al pedir una clase (ALU-06,
  RES-03, WEB-04).
- **CA-06** · El profesor da de alta un alumno con mail y esa persona entra con código a ese mail
  sin pasar por aprobación; uno dado de alta sin mail no puede iniciar sesión ni recibe mails
  (ALU-07, ALU-08, AVI-04).
- **CA-07** · La lista de alumnos muestra el estado de cada uno y la edad calculada desde la fecha
  de nacimiento (ALU-09).
- **CA-08** · Con la fecha simulada 6 meses después de la última clase, el proceso programado borra
  los datos personales y las personas a cargo; las clases pasadas siguen contando como ocupadas en
  el historial sin nombre (ALU-10).
- **CA-09** · Un ingreso del alumno 5 meses después de su última clase evita el borrado al mes
  siguiente (ALU-11).
- **CA-10** · El profesor borra un alumno con clases futuras: sus datos se borran, sus clases
  futuras quedan canceladas y los huecos aparecen libres (ALU-12).
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
- **CA-15** · Sin sesión, la respuesta que recibe el navegador para la agenda del día no contiene
  nombres, observaciones, motivos de bloqueo ni ningún dato personal, y un hueco con solicitud
  pendiente figura ocupado (AGE-07, NFR-01, WEB-01).
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
  calendario público y en la lista de pendientes del profesor (SOL-01, PRF-06, AVI-01).
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
- **CA-27** · El profesor crea una clase para un alumno sin cuenta, mueve una de una serie solo esa
  vez y cancela una serie desde una fecha, y cada cambio queda confirmado sin solicitud (PRF-01,
  PRF-02, PRF-03, WEB-06).
- **CA-28** · En el panel, el profesor ve en cada hueco ocupado quién toma la clase, el titular y la
  observación (PRF-05, WEB-06).
- **CA-29** · La vista en modo lista filtra clases por rango de fechas y por alumno e incluye las
  pasadas (PRF-06, WEB-07).
- **CA-30** · Cada solicitud nueva y cada cuenta nueva generan un mail al profesor; cada creación,
  movimiento o cancelación del profesor genera un mail al titular (AVI-02, AVI-04).
- **CA-31** · Una clase confirmada genera exactamente un recordatorio, enviado entre 24 horas y 23
  horas 45 minutos antes de la clase (AVI-05).
- **CA-32** · El aviso de inactividad llega 7 días antes del borrado (AVI-06).
- **CA-33** · Los mails, incluidos los códigos de ingreso, llegan con remitente la casilla de Gmail
  del profesor (AVI-07).
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
- **CA-41** · Un alumno aprobado con 5 solicitudes pendientes que pide una sexta recibe un rechazo
  que dice el límite y el hueco sigue libre; tras responder el profesor una de las cinco, puede
  pedirla (SOL-10).
- **CA-42** · Con 20 mails ya encolados en la hora, el mail 21 queda registrado como fallido con
  motivo de tope y la operación que lo originó se completa; igual con 200 en el día (AVI-08, NFR-07).
- **CA-43** · Con 10 fichas completadas en la última hora, la ficha 11 se rechaza con un mensaje de
  intentar más tarde y no crea cuenta; pasada la hora se acepta (ALU-13).
- **CA-44** · En la pantalla de ingreso, pedir un código sin resolver el desafío CAPTCHA no envía
  ningún mail ni crea cuenta; resuelto, el código llega; "Continuar con Google" no pide desafío
  (WEB-02, CA-01).
- **CA-45** · Una cuenta rechazada con un motivo escrito ve ese motivo en su ficha y en Mis clases,
  y el texto aparece como texto, no como HTML; sin motivo, solo el estado; tras el borrado de ALU-10
  el motivo ya no existe (ALU-03, ALU-10, WEB-03, WEB-05).
- **CA-46** · Un visitante sin sesión que toca un hueco libre ve la invitación a ingresar con el
  acceso a WEB-02 y no se crea ninguna solicitud (WEB-01).

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
| Alumno sin cuenta | Alumno cargado por el profesor sin mail; no ingresa al sistema. |
| Reserva | Clase suelta o serie de clases asociada a un hueco y a quien toma la clase. |
| Serie | Reserva que se repite cada semana o cada dos semanas sin fecha de fin. |
| Solicitud | Pedido de un alumno para reservar, mover o cancelar, que el profesor confirma o rechaza. |
| Solo esta clase / de acá en adelante | Alcance de un movimiento o cancelación en una serie: una fecha, o esa fecha y todas las siguientes. |
| Pendiente / confirmada / rechazada / cancelada | Estados de una solicitud o de una clase. |
| Proceso programado | Tarea dentro de Supabase que manda recordatorios y avisos y borra datos vencidos. |
