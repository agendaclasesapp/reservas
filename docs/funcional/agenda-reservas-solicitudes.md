---
titulo: Funcional · Agenda, reservas y solicitudes
version: 0.7
fecha: 2026-10-23
publico: negocio y equipo
---
# Agenda, reservas y solicitudes

> Estado por tema tras B02-B05: **construido y verificado** la agenda pública por día (AGE-01 semilla, AGE-07, AGE-08, WEB-01; CA-15, CA-16) y la configuración de grilla en la base. Tras B06 también está **construido y verificado** pedir una clase suelta o una serie (SOL-01, SOL-10, WEB-04, CA-41 en lo del tope); tras B07, B08 y B09 también **construido y verificado**: confirmar y rechazar solicitudes, mover y avisar que no voy, la agenda del profesor y su gestión directa. Siguen **diseñados** los bloqueos (B10).

## Agenda y disponibilidad
**Agenda pública por día (B02, verificado; WEB-01, CA-15, CA-16).** Desde B14 es la agenda **de un profesor**: se abre en su enlace `#/p/<slug>` (AGE-09; ver `varios-profesores.md`) y, sin enlace, `#/` no muestra agenda. La pantalla muestra los huecos de un día en el huso del profesor, sin iniciar sesión. Abre en «hoy» según el huso del profesor, aunque el navegador esté en otro huso (con el navegador en Asia/Tokyo abre el lunes 2 y no el martes 3). Cada hueco se ve libre, ocupado o bloqueado; no aparecen nombres, observaciones ni motivos. Con la grilla inicial (lunes a viernes, 08:00-13:00 y 14:00-18:00, creada por la migración) y clases de 60 min un lunes tiene 9 huecos; con 90 min son 08:00, 09:30 y 11:00 más dos de la tarde. Un día sin huecos (por ejemplo un domingo) dice «No hay huecos este día». El día se elige con un campo de fecha y se guarda en la dirección (`?d=AAAA-MM-DD`); un `d` ausente, mal formado o fuera de los días válidos vuelve a hoy sin mensaje. Mientras carga se anuncia «Cargando los huecos del día…» y, si falla la red, hay un error con «Reintentar».

**Configuración en la base (B02, sin pantalla todavía).** `guardar_configuracion` (duración, anticipación, huso) y `guardar_grilla` (tramos semanales) existen como operaciones del profesor; su pantalla (WEB-08) llega en un bolt posterior.

- El profesor define la grilla semanal (uno o más tramos por día; inicial lunes a viernes 08:00-13:00 y 14:00-18:00) y una duración única de clase; los huecos salen consecutivos desde el inicio de cada tramo y un resto menor que la duración no genera hueco (AGE-01, AGE-02).
- Cambiar grilla o duración no altera clases confirmadas ni solicitudes pendientes (AGE-03; series: DEC-06).
- **Anticipación mínima**: el alumno no puede pedir, mover ni cancelar clases que empiezan antes del plazo, y recibe el motivo; no limita al profesor (AGE-04, PRF-04). En un movimiento rige para origen y destino (DEC-07, opción por defecto).
- Bloqueos de un hueco, un rango de horas o días completos, con motivo opcional; se rechazan si cubren una clase confirmada o solicitud pendiente, indicando cuáles; quitarlos libera los huecos (AGE-05, AGE-06).
- Un único huso horario configurable para todo (AGE-08, DEC-08).
- **Calendario público**: cualquiera ve cada hueco como libre, ocupado o bloqueado, sin nombres, observaciones ni motivos; un hueco con solicitud pendiente se ve ocupado (AGE-07, WEB-01). Si una clase activa solapa en parte un hueco (por ejemplo tras cambiar la duración), ese hueco se ve ocupado; una clase que no solapa ningún hueco de la grilla vigente se agrega como ocupada con su inicio y fin (ADR-006, precisión tras S03).
- **Invitación al visitante (CR-001, DEC-23, WEB-01, CA-46):** un visitante sin sesión que toca un hueco libre ve una invitación a ingresar, con un acceso a la pantalla de ingreso (WEB-02); no se crea ninguna solicitud ni se pide ningún dato. Un alumno aprobado por ese profesor que toca un hueco libre abre el formulario «Pedir clase a <profesor>»; con el acceso pendiente o rechazado, el toque lleva al aviso de estado. Verificado: sin sesión no se llama a ninguna operación de escritura y el ingreso vuelve a la misma agenda (WEB-01).

## Reservas
- Cada hueco admite una sola reserva pendiente o confirmada; ante dos pedidos simultáneos, el segundo ve que el hueco ya no está libre (RES-01).
- Una reserva es una clase suelta o una serie semanal o quincenal sin fecha de fin hasta cancelarse; sus fechas futuras ocupan los huecos (RES-02; el diseño las materializa 26 semanas hacia adelante, ADR-003).
- Indica quién toma la clase (titular o persona a cargo) y admite una observación de texto libre (RES-03, RES-04). No hay reglas distintas para clases grupales: un hueco, una reserva.
- Al pedir una serie, las fechas ocupadas o bloqueadas se saltean y se muestran antes de enviar (RES-05, WEB-04).
- El alumno ve sus clases futuras y pasadas con fecha, hora, quién la toma y estado (RES-06, WEB-05).

## Solicitudes

| Tipo | Quién | Mientras está pendiente | Si el profesor confirma | Si rechaza |
| --- | --- | --- | --- | --- |
| Reserva (SOL-01) | Alumno aprobado | El hueco queda ocupado | Pasa a confirmada | Libera el hueco |
| Movimiento (SOL-02) | Alumno, alcance «solo esta clase» o «de acá en adelante» | Destino ocupado; la clase sigue confirmada en el origen | La clase va al destino y el origen se libera | Se libera el destino; la clase queda |
| Cancelación (SOL-03) | Alumno, con alcance si es serie | La clase sigue confirmada | Se cancela y se libera | La clase sigue confirmada |

- **Construido (B07, B08).** El profesor confirma o rechaza con motivo opcional de hasta 500 caracteres, que llega por mail con su nombre y Reply-To (SOL-04, SOL-05, SOL-06). Confirmar es atómico (NFR-03). Con la agenda inactiva se puede rechazar pero no confirmar. Confirmar una serie confirma todas sus clases; rechazarla libera todas.
- «De acá en adelante» confirmado termina la serie en esa fecha; en un movimiento nace una serie nueva desde el destino con la misma frecuencia, salteando fechas ocupadas o bloqueadas (SOL-07).
- La solicitud no vence: si pasa el horario queda en el historial como «pendiente sin respuesta» y ya no se puede responder (SOL-08, DEC-09). Una solicitud vencida no cuenta para el tope ni traba nada, y si el alumno pide mover o cancelar esa misma clase, la vencida se anula sin mail y el nuevo pedido sigue.
- **Un pedido a la vez por clase (B08).** Mientras haya un pedido vigente sobre una clase, no se acepta otro sobre ella; en una serie, un «de acá en adelante» pendiente alcanza también a las clases siguientes. Si el profesor quiere mover o cancelar esa clase por su cuenta, primero responde el pedido (`SOLICITUD_EN_CURSO`).
- El alumno solo ve y gestiona lo suyo; sobre lo ajeno la operación se rechaza (SOL-09, NFR-01).

## Mover o avisar que no voy (B08; SOL-02, SOL-03, SOL-07, SOL-10, WEB-05)
- Sobre una clase **confirmada** que no empezó y sin otro pedido pendiente, el alumno pide cambiarla de horario (elige un hueco libre de la agenda **del mismo profesor**) o avisa que no puede ir; en una serie elige «solo esta clase» o «de acá en adelante». Con el profesor inactivo no se puede.
- La clase sigue confirmada en su horario hasta que el profesor responde (marca «Movimiento pendiente» o «Cancelación pendiente»). Rige la anticipación del profesor para el origen y para el destino, y el aviso dice cuál falla.
- Confirmar un cambio lleva la clase al nuevo hueco y libera el original (queda «Cambiada de horario»). «De acá en adelante» termina la serie en esa fecha y la serie nueva sigue desde el destino con las fechas ocupadas o bloqueadas salteadas (ejemplo verificado: serie semanal lunes 09:00 desde el 23/11 movida al martes 16:00 desde el 24/11, con el 01/12 salteado). Confirmar un «no puedo ir» cancela la clase, o la serie desde esa fecha. Rechazar deja todo como estaba.
- Los pedidos pendientes de reserva, movimiento y cancelación suman al tope de 10 por profesor; una solicitud «de acá en adelante» suma 1 aunque abarque una serie.

## Mis clases (B07; RES-06, WEB-05)
El alumno ve sus clases próximas, pendientes y pasadas con **todos** sus profesores, cada una con su profesor y la hora en el huso de ese profesor (con el nombre del huso si hay más de uno). La pendiente cuyo horario pasó figura «Pendiente sin respuesta».

## Panel del profesor y gestión directa (B09; PRF-01..05, AVI-01, WEB-06)
- El profesor consulta la agenda de un día (de un año atrás a un año adelante) y ve en cada hueco ocupado quién toma la clase, el titular, la observación y si está confirmada o pendiente de respuesta; en un bloqueado, el motivo. Un aviso suma las solicitudes pendientes que todavía puede responder y los accesos pendientes.
- Crea clases sueltas o series para sus alumnos aprobados o sin cuenta, sin la anticipación mínima, en un horario futuro de su grilla hasta un año adelante; mueve una clase confirmada («solo esta» o «de acá en adelante») y cancela una clase o una serie desde una fecha. Todo queda confirmado al instante. Con la agenda inactiva solo puede cancelar.
- Si la clase tiene un pedido vigente del alumno (o, en una serie, uno «de acá en adelante» en una clase anterior), mover o cancelar pide responder primero el pedido. Un pedido vencido no traba nada.
- Crear para una persona sin vínculo vigente con él da siempre el mismo rechazo, que no revela si la persona existe (CA-52).

## Pedir una clase (B06; SOL-01, SOL-10, WEB-04)
- Con el acceso aprobado por ese profesor, el alumno toca un hueco libre y pide una **clase suelta** o una **serie semanal o quincenal**, para sí o para una persona a cargo, con una observación opcional de hasta 500 caracteres. El pedido queda **pendiente** y el hueco figura ocupado hasta que el profesor responda.
- En una serie, antes de enviar se muestran las fechas que se saltean por estar ocupadas o bloqueadas (ejemplo verificado: una serie semanal con un bloqueo y una clase en dos fechas muestra esas dos como salteadas). Se informa solo si la fecha está ocupada o bloqueada, nunca el motivo ni quién la ocupa; cualquier persona con sesión puede ver esa vista previa.
- Con el acceso pendiente, rechazado o sin vínculo con ese profesor, el pedido se rechaza informando el estado. La anticipación mínima se cuenta exacta: 24 horas se aceptan y 23 no.
- El profesor recibe un mail de solicitud nueva (sin la observación) y las series se extienden cada día a las 03:10 UTC hasta el horizonte.
- Si el profesor está pausado, sus pendientes se anulan (ADM-05; ver `varios-profesores.md`).

## Tope de solicitudes pendientes (CR-001, DEC-12; por profesor desde CR-002, DEC-27)
- Un alumno no puede tener más de **10 solicitudes pendientes** a la vez **con un mismo profesor** (las de un profesor no cuentan para otro), sumando reservas, movimientos y cancelaciones. Al pedir la undécima, el sistema la rechaza con un mensaje que dice el límite (error `LIMITE_EXCEDIDO`, 429) y no ocupa ningún hueco. Cuando el profesor responde una solicitud, el alumno vuelve a poder pedir (SOL-10, CA-41).
- Los valores (10 pendientes por profesor; 10 fichas por hora, 20 mails por hora y 200 por día por profesor y 400 por día globales en los otros documentos) están fijos en la spec: cambiarlos exige un pedido de cambio (CR-001 §4).
- Estado: **construido y verificado** para reservas (B06) y para movimientos y cancelaciones (B08): con 10 pendientes con un profesor la undécima da el límite 10 y no ocupa nada; con otro profesor sí se puede pedir.

## Bitácora de versiones

| Versión | Fecha | Bolt | IDs | Cambio |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-10-21 | inception | AGE-01..08, RES-01..06, SOL-01..09, WEB-01/04/05 | Primera versión |
| 0.2 | 2026-10-21 | inception | SOL-01, SEC-10, DEC-12, ADR-016 | Topes anti-abuso como propuesta desactivada |
| 0.3 | 2026-10-21 | construcción (hito spikes S01-S03 y CR-001) | CR-001, SOL-10, WEB-01, CA-41, CA-46, DEC-12, DEC-23, ADR-006 | Tope de 5 pendientes fijo; invitación al visitante; precisión de la agenda pública tras S03 |
| 0.4 | 2026-10-22 | B02 | AGE-01, AGE-07, AGE-08, WEB-01, CA-15, CA-16 | Agenda pública construida y verificada; semilla de grilla; operaciones de configuración |
| 0.5 | 2026-10-23 | B14 | CR-002, AGE-09, AGE-10, SOL-10, DEC-27 | Agenda por enlace de profesor; tope de pendientes de 10 por profesor (antes 5) |
| 0.6 | 2026-10-23 | B06 | SOL-01, SOL-10, WEB-01, WEB-04, CA-41, CA-46, ADM-05 | Pedir clase suelta y serie construido y verificado, vista previa de la serie, tope de 10 verificado |
| 0.7 | 2026-10-23 | B07, B08, B09 | SOL-02..08, SOL-10, RES-06, PRF-01..05, AVI-01, WEB-05, WEB-06, CA-52 | Responder solicitudes, mover y avisar que no voy, Mis clases, panel y gestión directa construidos y verificados |
