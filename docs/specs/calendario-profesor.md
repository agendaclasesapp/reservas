# Spec · Calendario del profesor

| Campo | Valor |
| --- | --- |
| Versión | 1.0 |
| Estado | aprobada |
| Dueño | Fernando Burgueño |

## 1. Contexto y alcance

Hoy el profesor ve su agenda en el Panel como una lista de huecos de un solo día: para tener una
idea de la semana tiene que pasar día por día, y para ver un rango usa el filtro Desde/Hasta de la
Lista. Esta funcionalidad convierte la agenda del Panel en un calendario con vista de día y vista
semanal, con un eje de horas y cada clase como un bloque con el nombre de quien la toma, desde el
que el profesor gestiona sus clases como hoy, las arrastra para moverlas y responde las solicitudes
pendientes.

**Dentro del alcance:** vista de día y vista semanal en el Panel con navegación entre días y
semanas; huecos libres, bloqueados y clases en un eje de horas; ventana de 3 días deslizable en
pantallas angostas; acciones actuales del Panel al tocar; arrastrar una clase confirmada para
moverla; confirmar o rechazar solicitudes pendientes desde el calendario; «Ver como lista» con la
lista de huecos actual; copiar el enlace público de un día.

**Fuera de alcance:** cambios en la agenda pública, en Mis clases o en cualquier pantalla del
alumno; cambios en las reglas de crear, mover, cancelar o bloquear clases; arrastrar solicitudes
pendientes; mostrar clases canceladas o rechazadas en el calendario; quitar el filtro Desde/Hasta de
la Lista; sincronizar con calendarios externos.

### 1.1 Punto de partida

- **Solución existente:** Agenda Clases App (repositorio `agendaclasesapp`), descrita en la spec
  «Agenda Clases App» e implementada en el ciclo `reservatuclase`, ya cerrado.
- **Componentes que se creen afectados:** el módulo del Panel (`src/modulos/panel`: vista del panel,
  lista de la agenda, selector de día y acciones); la confirmación y el rechazo de solicitudes del
  módulo de la Lista (`src/modulos/lista`), que se reusan desde el calendario; la lectura de la
  agenda del profesor en la base (hoy de un día por llamada), que necesita cubrir una semana.
- **Comportamiento actual que cambia:** hoy el Panel (`#/panel`) muestra la agenda de un día como
  una lista de huecos con quién toma cada clase, el titular, la observación y el estado. Pasa a
  mostrar un calendario de día o de semana con eje de horas; la lista de huecos sigue disponible
  detrás de «Ver como lista».
- **INV-01** · Crear, mover y cancelar clases y bloquear o desbloquear huecos se rigen por las
  mismas reglas y validaciones que hoy (spec «Agenda Clases App», §3.2 y §3.5): una operación que
  hoy se rechaza se rechaza igual desde el calendario, con el mismo mensaje.
- **INV-02** · El profesor solo ve y gestiona los datos de su propia agenda: el calendario no
  muestra clases, solicitudes, bloqueos ni alumnos de otro profesor.
- **INV-03** · La agenda pública, Mis clases y las demás pantallas del alumno muestran lo mismo que
  hoy y se comportan igual.
- **INV-04** · La Lista (`#/lista`) conserva el filtro Desde/Hasta/Alumno de sus clases, la sección
  de solicitudes pendientes con confirmar y rechazar, las cuentas pendientes y la lista de alumnos.
- **INV-05** · Con el profesor inactivo, el Panel permite lo mismo que hoy: ve su agenda y cancela
  clases, y no crea ni mueve clases.

## 2. Actores

| Actor | Descripción |
| --- | --- |
| Profesor | Usa el calendario de su Panel: ve su agenda por día o por semana, gestiona sus clases, responde solicitudes y copia el enlace de un día. Solo ve los datos de su agenda. |
| Visitante | Abre el enlace de un día que le mandó el profesor y ve la agenda pública de ese día, como hoy. |
| Alumno | Igual que el Visitante: abre el enlace de un día y ve la agenda pública de ese día, como hoy. |

## 3. Requisitos funcionales

### 3.1 Calendario

- **CAL-01** · El Panel del profesor muestra su agenda como un calendario con dos vistas, Día y
  Semana, que el profesor elige con dos botones; la vista elegida queda marcada.
- **CAL-02** · Al entrar al Panel sin vista ni día en la dirección, el calendario abre en la vista
  Día en el día de hoy, en el huso del profesor. La vista y el día van en la dirección
  (`#/panel?v=dia&d=AAAA-MM-DD` o `v=semana`): recargar o abrir esa dirección muestra la misma vista
  y el mismo día; un valor inválido abre la vista Día de hoy.
- **CAL-03** · En la vista Día, las flechas anterior y siguiente cambian de a un día, «Hoy» vuelve
  al día actual y el título muestra la fecha (`30/10/2026`). En la vista Semana, de lunes a domingo,
  las flechas cambian de a una semana, «Hoy» vuelve a la semana actual y el título muestra el rango
  (`26/10/2026 - 01/11/2026`). La navegación no pasa de los días que hoy acepta la agenda del Panel
  (366 días antes y después de hoy): la flecha que saldría del rango queda deshabilitada.
- **CAL-04** · El eje de horas va desde la hora en punto anterior o igual al inicio del primer tramo
  de la grilla semanal del profesor hasta la hora en punto posterior o igual al fin del último tramo
  (con la grilla inicial, de 08:00 a 18:00), con una línea por hora y otra por media hora; las horas
  se muestran en el huso del profesor.
- **CAL-05** · Dentro de los tramos de la grilla, cada hueco libre futuro se dibuja como una zona
  marcada que se puede tocar; fuera de los tramos, el fondo va sombreado y no se puede tocar; un
  hueco libre que ya pasó se muestra sin marca de libre y no se puede tocar.
- **CAL-06** · Un hueco bloqueado se dibuja rayado, con el texto BLOQUEADO y el motivo si lo tiene.
- **CAL-07** · Cada clase confirmada se dibuja como un bloque cuyo alto es proporcional a su
  duración, con el texto CONFIRMADA arriba o a la izquierda del nombre de quien toma la clase.
- **CAL-08** · Cada solicitud de reserva pendiente se dibuja como un bloque con borde punteado y el
  texto PENDIENTE arriba o a la izquierda del nombre de quien toma la clase.
- **CAL-09** · Las clases canceladas y las solicitudes rechazadas no aparecen en el calendario.
- **CAL-10** · En el día de hoy, una línea marca la hora actual; en la vista Semana, la columna de
  hoy va resaltada.
- **CAL-11** · Al tocar una clase, un hueco libre o un bloqueo, el profesor ve el detalle (quién
  toma la clase, el titular y la observación) y las mismas acciones que ofrece hoy el Panel para ese
  hueco: crear, mover con «solo esta clase» o «de acá en adelante», cancelar, bloquear y
  desbloquear, en un diálogo en pantallas angostas y en una columna en escritorio.
- **CAL-12** · Al tocar una solicitud pendiente, el profesor la confirma o la rechaza con un motivo
  opcional, con el mismo resultado que en la Lista; el calendario muestra el cambio sin recargar la
  página.
- **CAL-13** · En escritorio, el profesor arrastra con el mouse una clase confirmada futura y la
  suelta sobre un hueco libre futuro de la vista; al soltarla, el sistema pide confirmar el
  movimiento y, si la clase es de una serie, elegir «solo esta clase» o «de acá en adelante»; al
  confirmar, la clase queda movida como con «Mover».
- **CAL-14** · Soltar una clase sobre un hueco ocupado, bloqueado, pasado o fuera de la grilla, o
  cancelar la confirmación, no mueve nada y la clase vuelve a su lugar. Las solicitudes pendientes,
  las clases pasadas y, con el profesor inactivo, todas las clases no se pueden arrastrar.
- **CAL-15** · La vista Semana muestra siete columnas, de lunes a domingo, con encabezados del tipo
  «Lun 26/10»; al tocar un encabezado se abre la vista Día de ese día.
- **CAL-16** · En pantallas de menos de 60 rem de ancho, la vista Semana muestra una ventana de 3
  días consecutivos que empieza en el día elegido; las flechas y el deslizamiento horizontal con el
  dedo corren la ventana de a 3 días, y el título muestra el rango de los 3 días.
- **CAL-17** · El calendario muestra una leyenda con Confirmada, Pendiente, Bloqueado y Libre, cada
  una con su muestra.
- **CAL-18** · Sin clases ni solicitudes en lo que se ve, el calendario muestra «No hay clases este
  día» o «No hay clases esta semana» encima de la grilla, que se sigue mostrando con los huecos
  libres; mientras carga muestra un estado de carga, y si la lectura falla muestra el error con
  «Reintentar».
- **CAL-19** · «Ver como lista» muestra, en el mismo Panel, la lista de huecos actual del día
  elegido o, en la vista Semana, de cada día de la semana agrupada por día, con las mismas acciones;
  «Ver como calendario» vuelve a la grilla.
- **CAL-20** · En la vista Día, «Copiar enlace de este día» copia el enlace público del profesor con
  ese día (`…/#/p/<slug>?d=AAAA-MM-DD`) y muestra «Enlace copiado»; quien lo abre ve la agenda
  pública del profesor en ese día.

## 4. Interfaz

Parte de la aplicación web existente: React 19 con TypeScript, compilada con Vite, publicada en
GitHub Pages, en español, para las dos últimas versiones de Chrome, Safari, Firefox y Edge y
pantallas desde 360 px de ancho. La pantalla es el Panel del profesor, `#/panel`.

- **WEB-14** · Calendario del Panel, vista Día: botones Día y Semana, flechas, «Hoy», fecha,
  leyenda, ayuda («Toque un horario libre para crear una clase; con el teclado, use las acciones del
  hueco»), eje de horas con huecos, bloqueos y clases, línea de la hora actual, «Copiar enlace de
  este día» y «Ver como lista»; estados cargando, error y día sin clases. Solo con los datos de ese
  profesor.
- **WEB-15** · Calendario del Panel, vista Semana: siete columnas de lunes a domingo con la de hoy
  resaltada en escritorio, y ventana de 3 días que se desliza en pantallas angostas; estados
  cargando, error y semana sin clases.
- **WEB-16** · Lista del Panel: la lista de huecos actual del día o de la semana, agrupada por día,
  con «Ver como calendario» para volver.

## 5. Integraciones y API

No hay integraciones nuevas. La vista Semana necesita leer la agenda del profesor de varios días
seguidos; esa lectura aplica la misma seguridad por fila y los mismos límites de días que la lectura
de un día que usa hoy el Panel (spec «Agenda Clases App», §5). El contrato concreto lo define el
diseño. Confirmar, rechazar, crear, mover, cancelar y bloquear usan las funciones de Postgres que
existen hoy.

## 6. Datos

No hay entidades nuevas ni datos personales nuevos. El calendario muestra los mismos datos que hoy
muestra el Panel (quién toma la clase, titular, observación, estado y motivo de bloqueo), solo los
de la agenda del profesor con la sesión iniciada.

## 7. Requisitos no funcionales

- **NFR-10** · Rendimiento: la vista Semana se muestra completa en menos de 2 s en el percentil 95,
  con el perfil de red 4G de las herramientas de desarrollo de Chrome, la misma cifra que rige hoy
  para la agenda de un día.
- **NFR-11** · Accesibilidad: nivel WCAG 2.1 AA; confirmada, pendiente, bloqueado y libre se
  distinguen por texto, no solo por color o por el tipo de borde; cada hueco y cada clase se
  alcanzan con el teclado y el lector de pantalla anuncia su hora, su estado y el nombre de quien
  toma la clase; todo lo que se hace arrastrando también se hace con la acción «Mover».
- **NFR-12** · Uso en celular: a 360 px de ancho el calendario no tiene desplazamiento horizontal de
  la página y cada hueco, clase y botón tocable mide al menos 44 px de alto y de ancho.

## 8. Despliegue y operación

Sin cambios: se publica con el mismo pipeline de GitHub Actions a GitHub Pages, y si hace falta una
lectura nueva en la base va como migración versionada en `supabase/migrations`, desplegada con
Supabase CLI como las demás.

## 9. Criterios de aceptación

- **CA-67** · Al abrir `#/panel` sin parámetros se ve la vista Día de hoy; al abrir
  `#/panel?v=semana&d=2026-10-30` se ve la semana del 26/10/2026 al 01/11/2026, y recargar la página
  la deja igual; `?v=otra` abre la vista Día de hoy (CAL-01, CAL-02).
- **CA-68** · En la vista Día, la flecha siguiente pasa al día siguiente y «Hoy» vuelve al actual;
  en la vista Semana, la flecha pasa a la semana siguiente; en el último día permitido la flecha
  siguiente está deshabilitada (CAL-03).
- **CA-69** · Con la grilla inicial, el eje va de 08:00 a 18:00; con un tramo de 07:30 a 12:15, el
  eje va de 07:00 a 13:00 (CAL-04).
- **CA-70** · Un hueco libre futuro dentro de la grilla se puede tocar y abre «Crear clase»; tocar
  fuera de la grilla o en un hueco libre pasado no abre nada (CAL-05, CAL-11).
- **CA-71** · Un hueco bloqueado con motivo «Torneo» se ve rayado con BLOQUEADO y «Torneo», y al
  tocarlo ofrece «Desbloquear» (CAL-06, CAL-11).
- **CA-72** · Una clase confirmada de 60 minutos mide el doble de alto que una de 30, y muestra
  CONFIRMADA y el nombre de quien la toma; una solicitud pendiente se ve con borde punteado y
  PENDIENTE (CAL-07, CAL-08).
- **CA-73** · Una clase cancelada y una solicitud rechazada no aparecen en ninguna vista, y su hueco
  se ve libre (CAL-09).
- **CA-74** · En el día de hoy se ve la línea de la hora actual; en la vista Semana, la columna de
  hoy está resaltada y las demás no (CAL-10).
- **CA-75** · Al tocar una clase confirmada se ven quién la toma, el titular y la observación, y las
  acciones mover y cancelar; mover una clase de una serie con «solo esta clase» desde el calendario
  deja el mismo resultado que hacerlo desde la lista (CAL-11, INV-01).
- **CA-76** · Al tocar una solicitud pendiente y confirmarla, el bloque pasa a CONFIRMADA sin
  recargar la página; al rechazar otra con un motivo, desaparece del calendario y el alumno recibe
  el mail con el motivo (CAL-12).
- **CA-77** · En escritorio, arrastrar una clase confirmada de una serie a un hueco libre pide
  confirmar y elegir el alcance; con «de acá en adelante» confirmado, las fechas siguientes aparecen
  en el nuevo hueco (CAL-13).
- **CA-78** · Soltar una clase sobre un hueco ocupado o bloqueado, o cancelar la confirmación, la
  deja en su lugar sin cambios en la base; una solicitud pendiente y una clase pasada no se pueden
  arrastrar (CAL-14).
- **CA-79** · Con el profesor inactivo, ninguna clase se puede arrastrar, «Mover» y «Crear clase»
  siguen deshabilitados y «Cancelar» funciona (CAL-14, INV-05).
- **CA-80** · La vista Semana muestra siete columnas de lunes a domingo con encabezados «Lun 26/10»;
  tocar «Vie 30/10» abre la vista Día del 30/10/2026 (CAL-15, WEB-15).
- **CA-81** · A 360 px, la vista Semana muestra 3 días; la flecha siguiente y un deslizamiento hacia
  la izquierda muestran los 3 días siguientes, y la página no tiene desplazamiento horizontal
  (CAL-16, NFR-12).
- **CA-82** · El calendario muestra la leyenda con Confirmada, Pendiente, Bloqueado y Libre; un día
  sin clases muestra «No hay clases este día» y sus huecos libres; con la lectura fallida se ve el
  error y «Reintentar» vuelve a leer (CAL-17, CAL-18, WEB-14).
- **CA-83** · «Ver como lista» muestra la lista de huecos del día con las mismas acciones, y en la
  vista Semana agrupada por día; «Ver como calendario» vuelve a la grilla (CAL-19, WEB-16).
- **CA-84** · «Copiar enlace de este día» en el viernes 30/10/2026 copia `…/#/p/<slug>?d=2026-10-30`
  y muestra «Enlace copiado»; ese enlace abierto sin sesión muestra la agenda pública del profesor
  en ese viernes, sin nombres (CAL-20, INV-03).
- **CA-85** · Con dos profesores, el calendario de A en ambas vistas no muestra ninguna clase,
  solicitud ni bloqueo de B (INV-02).
- **CA-86** · Las pruebas automatizadas existentes de la agenda pública, Mis clases y la Lista
  (filtro Desde/Hasta/Alumno, solicitudes pendientes, cuentas y alumnos) pasan sin cambios (INV-03,
  INV-04).
- **CA-87** · Una operación que hoy se rechaza (crear sobre un hueco ocupado, bloquear un rango con
  una clase confirmada) se rechaza igual desde el calendario y con el mismo mensaje (INV-01).
- **CA-88** · La vista Semana carga completa en menos de 2 s en el percentil 95 con el perfil 4G de
  Chrome (NFR-10).
- **CA-89** · Una revisión automática de accesibilidad no encuentra errores de nivel AA; con solo el
  teclado se llega a una clase, se oye su hora, estado y nombre, y se la mueve con «Mover» (NFR-11).
- **CA-90** · A 360 px, cada hueco, clase y botón tocable de ambas vistas mide al menos 44 px de
  alto y de ancho (NFR-12, WEB-14).

## 10. Decisiones abiertas

No hay decisiones abiertas.

## 11. Glosario

| Término | Definición |
| --- | --- |
| Calendario | Agenda del Panel del profesor dibujada sobre un eje de horas, en vista Día o Semana. |
| Vista Día | Calendario de un día, con un eje de horas y los huecos, bloqueos y clases de ese día. |
| Vista Semana | Calendario de lunes a domingo, una columna por día; en pantallas angostas, una ventana de 3 días. |
| Ventana de 3 días | Tres días consecutivos de la vista Semana en pantallas angostas, que se corre de a 3 días. |
| Eje de horas | Escala vertical del calendario, de la hora en punto del inicio de la grilla a la del fin. |
| Hueco | Espacio de una clase dentro de un tramo, con la duración que define el profesor. |
| Arrastrar | Mover con el mouse una clase confirmada a un hueco libre, con confirmación. |
| Enlace de un día | Enlace público del profesor con un día (`#/p/<slug>?d=AAAA-MM-DD`). |
