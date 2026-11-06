---
titulo: Funcional · Calendario del Panel del profesor
version: 0.6
fecha: 2026-11-06
publico: negocio y equipo
---
# Calendario del Panel del profesor

> **En construcción.** Describe lo diseñado en el ciclo `calendario-profesor` (spec `docs/specs/calendario-profesor.md`, CAL-01..20, WEB-14..16). **Construido y verificado hasta ahora: B16 (lectura de varios días, sin efecto visible), B17 (el Panel abre en el calendario del día), B18 (huecos, bloqueos y detalle tocables, «Elegir día», leyenda y ayuda) B19 (responder solicitudes y copiar el enlace del día) y B20 (vista Semana, hoy, ventana de 3 días y lista agrupada por día).** Lo demás (B21 a B23) sigue planificado y se marca como disponible cuando su bolt pase la verificación; hasta entonces no lo está.

## Estado de construcción
| Parte | Estado |
| --- | --- |
| Panel abre en el calendario Día de hoy, dirección `#/panel?v=dia&d=AAAA-MM-DD` (CAL-02) | **Construido y verificado en B17** (`v=semana` abre Día hasta B20) |
| Eje de horas y bloques CONFIRMADA / PENDIENTE con alto proporcional (CAL-04, CAL-08, CAL-09) | **Construido y verificado en B17**; canceladas y rechazadas no se dibujan |
| Barra «Día anterior / Hoy / Día siguiente» con título `dd/mm/aaaa` y límite de 366 días (CAL-03) | **Construido y verificado en B17**; la flecha fuera de rango queda deshabilitada y su nombre termina en «, no disponible» |
| «Ver como lista» / «Ver como calendario» (CAL-19) | **Construido y verificado en B17** (en vista Día, con las acciones de siempre) |
| «Elegir día» en la barra (H-B17-03) | **Construido y verificado en B18**: lleva al día elegido (la dirección pasa a `d=<día>`) y no acepta un día fuera de hoy ± 366 («Ese día no está disponible…»). Corrige lo dicho en B17: el campo se había perdido y volvió |
| Huecos libres, clases y bloqueos tocables, detalle, crear, mover, cancelar y desbloquear desde el calendario Día (CAL-05, CAL-06, CAL-11, CAL-14, CAL-17, CAL-18) | **Construido y verificado en B18** (chromium, escritorio y 360 px). Fuera de la grilla el fondo va sombreado y no se toca; los huecos pasados no se tocan. Leyenda (Confirmada, Pendiente, Bloqueado, Libre) y ayuda arriba de la grilla; «No hay clases este día» encima de la grilla |
| Responder solicitudes desde el calendario Día (CAL-08 rama movimiento, CAL-12, DEC-42 A, DEC-43 A) | **Construido y verificado en B19** (chromium, escritorio 1280 px): confirmar o rechazar con motivo opcional una reserva PENDIENTE, el destino PENDIENTE de un movimiento y una clase con «Cancelación pendiente»; el calendario se actualiza sin recargar. No verificado aún en 360 px (pasa a B22) |
| «Copiar enlace de este día» en la vista Día (CAL-20, CA-84) | **Construido y verificado en B19**: copia `…/#/p/<slug>?d=AAAA-MM-DD` |
| Vista Semana (CAL-15, CAL-16, WEB-15): siete columnas lunes a domingo en escritorio, encabezado «Lun 26/10» que abre el Día, flechas de a una semana, «Hoy» | **Construido y verificado en B20** (chromium, escritorio y 360 px; CA-67, CA-68) |
| Ventana de 3 días bajo 60 rem con flechas «3 días anteriores / siguientes» y deslizamiento con el dedo (CAL-16, CA-81, CA-83) | **Construido y verificado en B20** a 360 px, sin desplazamiento horizontal |
| Columna de hoy resaltada y línea «Ahora» con la hora (CA-74); «No hay clases esta semana» (CA-85) | **Construido y verificado en B20**; solo hoy se marca. Contraste de «Ahora» y del tinte de hoy sin medir (H-B20-03, pasa a B22) |
| «Ver como lista» en Semana agrupada por día (CAL-19, WEB-16, DEC-46, CA-83) | **Construido y verificado en B20**: un título por día y las filas de la misma lectura, con las acciones de siempre |
| Bordes del rango en Semana (DEC-45 A, H-475, CA-68) | **Construido y verificado en B20** (ver Vistas y navegación) |
| Arrastre (CAL-13, CAL-14) | Planificado (B21); no disponible |

## Qué cambia
El Panel (`#/panel`) deja de ser una lista de un solo día y pasa a ser un **calendario** con vista **Día** y vista **Semana**, con eje de horas. Se mantienen las reglas de crear, mover, cancelar y bloquear (INV-01), el profesor solo ve su agenda (INV-02), la agenda pública y las pantallas del alumno no cambian (INV-03), la Lista conserva filtro, solicitudes, cuentas y alumnos (INV-04) y el profesor inactivo ve su agenda y cancela, pero no crea ni mueve (INV-05).

## Vistas y navegación (CAL-01..03, CAL-15, CAL-16, WEB-14, WEB-15)
- La barra tiene además el campo «Elegir día» (hasta 366 días antes o después de hoy; B18, H-B17-03).
- Dos botones, Día y Semana; la vista elegida queda marcada. Al entrar sin vista ni día abre Día en hoy, en el huso del profesor.
- La vista y el día van en la dirección (`#/panel?v=dia&d=AAAA-MM-DD` o `v=semana`): recargar muestra lo mismo; un valor inválido abre Día de hoy.
- Día: flechas de a un día, «Hoy», título con la fecha (`30/10/2026`). Semana (lunes a domingo): flechas de a una semana, título con el rango (`26/10/2026 - 01/11/2026`) y encabezados «Lun 26/10» que abren el Día correspondiente.
- **Semana (desde B20):** en escritorio (desde 60 rem), siete columnas de lunes a domingo con una sola lectura por semana. Bajo 60 rem se ve una ventana de 3 días desde el día elegido; las flechas pasan a llamarse «3 días anteriores» y «3 días siguientes» y corren de a 3, igual que deslizar el dedo hacia un lado (al menos 48 px y más horizontal que vertical; solo táctil). No hay desplazamiento horizontal. La dirección sigue siendo `#/panel?v=semana&d=AAAA-MM-DD`; antes de B20 `v=semana` abría Día. Tocar el encabezado «Lun 26/10» abre el Día de esa fecha.
- No se navega más allá de 366 días antes o después de hoy: la flecha que saldría del rango queda deshabilitada (en Semana y en la ventana de 3 días, DEC-45 A y H-475: la flecha, también la «anterior», se habilita si algún día del bloque nuevo queda dentro y lleva al primero de esos días; los días de afuera se ven deshabilitados, por ejemplo «Jue 04/11, no disponible», vacíos y sin huecos tocables, y no se piden a la base).

## Qué se dibuja (CAL-04..10, CAL-17, CAL-18)
- **Eje de horas** desde la hora en punto anterior al primer tramo de la grilla hasta la posterior al último (con la grilla inicial, 08:00 a 18:00), con línea por hora y por media hora; se amplía si hay clases fuera de la grilla (DEC-44 A).
- **Hueco libre futuro** dentro de la grilla: zona marcada y tocable (abre «Crear clase»). Fuera de los tramos: fondo sombreado, no tocable. Hueco pasado: sin marca de libre, no tocable.
- **Bloqueado**: rayado, con «BLOQUEADO» y el motivo si lo tiene.
- **Clase confirmada**: bloque de alto proporcional a la duración, con «CONFIRMADA» y el nombre de quien toma la clase. Con cancelación pendiente suma «Cancelación pendiente» (DEC-43 A).
- **Solicitud pendiente**: bloque de borde punteado con «PENDIENTE» y el nombre (reserva o destino de un movimiento, DEC-42 A).
- Las clases canceladas y las solicitudes rechazadas no aparecen.
- En hoy, una línea «Ahora» marca la hora actual; en Semana la columna de hoy va resaltada y solo ella lleva la línea (CA-74). Una leyenda explica Confirmada, Pendiente, Bloqueado y Libre.
- Si dos elementos se pisan al dibujarse por el alto mínimo de 44 px, van lado a lado en la columna, en orden horario (ADR-024 A-4, H-473). Con la configuración de la agenda en error o sin cargar no se sombrea nada como «fuera de la grilla»: el eje va de 08:00 a 18:00, ampliado por lo leído, y los huecos libres futuros siguen pudiéndose tocar (A-3, H-474).
- Con duraciones menores de 10 min un hueco puede medir menos de 44 px (el alto de la hora no pasa de 16,5 rem); ahí la alternativa es «Ver como lista» (A-2, H-472, CA-83).
- Estados: cargando, error con «Reintentar» y «No hay clases este día / esta semana» sobre la grilla, que sigue mostrando los huecos libres.

## Qué se puede hacer (CAL-11..14, CAL-19, CAL-20)
- **Disponible desde B18 en vista Día:** tocar un hueco libre futuro abre «Crear clase»; tocar una clase muestra quién la toma, titular y observación con «Mover» y «Cancelar»; tocar un bloqueo propio ofrece «Desbloquear». Con la agenda inactiva, «Crear clase» y «Mover» quedan deshabilitados con su explicación y «Cancelar» funciona (INV-05). Mover «solo esta clase» de una serie da el mismo aviso y deja lo mismo en la base desde el calendario y desde la lista. **Desde B19, también en vista Día:** responder solicitudes y copiar el enlace del día (abajo). Arrastrar sigue planificado.
- **Tocar** una clase, un hueco libre o un bloqueo abre el detalle (quién toma la clase, titular, observación) con las acciones de hoy: crear, mover («solo esta clase» o «de acá en adelante»), cancelar, bloquear y desbloquear. Es un diálogo en pantallas angostas y una columna en escritorio. Las operaciones que hoy se rechazan se rechazan igual y con el mismo mensaje.
- **Responder solicitudes** (CAL-12; **disponible desde B19 en vista Día**): se puede responder desde el calendario (1) una reserva PENDIENTE, (2) el destino PENDIENTE de un movimiento (DEC-42 A) y (3) una clase CONFIRMADA con «Cancelación pendiente» (DEC-43 A). Se toca el bloque, se elige «Confirmar» o «Rechazar» y, al rechazar, se puede escribir un motivo opcional (hasta 500 caracteres). El resultado, el aviso al alumno y el mail son los mismos que al responder desde la Lista (INV-04): un motivo en el rechazo llega en el mail. Al confirmar o rechazar aparece «Clase confirmada» o «Clase rechazada» y el bloque cambia sin recargar (una reserva rechazada deja el hueco libre; una cancelación confirmada saca la clase de la grilla; un movimiento rechazado deja el origen confirmado). El **origen** de un movimiento sigue confirmado y sin acciones: su solicitud se responde desde el destino o desde la Lista. Si la solicitud ya no se puede responder (venció o ya la respondieron) se muestra el mismo texto que en la Lista («Esa solicitud venció: su horario ya pasó.») y el calendario se relee; ese aviso queda sobre la agenda hasta la siguiente acción, a diferencia de la Lista, donde desaparece al releer (H-B19-04). Fuentes: handoffs de developer y funcional de B19; informe de QA de B19.
- **Arrastrar** (CAL-13, CAL-14), solo con mouse y desde 60 rem: una clase confirmada futura se suelta sobre un hueco libre futuro de la vista; se pide confirmar y, en una serie, elegir «solo esta clase» o «de acá en adelante». Soltar sobre un hueco ocupado, bloqueado, pasado o fuera de la grilla, o cancelar, deja la clase en su lugar. No se arrastran solicitudes pendientes, clases pasadas ni ninguna clase con el profesor inactivo. En táctil y con teclado se usa «Mover» del detalle (NFR-11).
- **Ver como lista / Ver como calendario** (CAL-19, WEB-16): la lista de huecos actual del día o, en Semana (**desde B20**), la de los días visibles agrupada por día, con un título por día, las filas de la misma lectura y las mismas acciones (DEC-46).
- **Copiar enlace de este día** (CAL-20, solo vista Día; **disponible desde B19**; en la Semana no se ofrece): copia `…/#/p/<slug>?d=AAAA-MM-DD` (por ejemplo, para el viernes 30/10/2026, `…/#/p/ana-piano?d=2026-10-30`) y muestra «Enlace copiado». Es el mismo enlace público que copia Configuración, con el día agregado. Quien lo abre, sin iniciar sesión, ve la agenda pública de ese día, como hoy, sin nombres de alumnos (INV-03). Si el enlace del profesor no es válido, no se ofrece copiarlo, y si el navegador no permite copiar, la pantalla avisa del fallo.

## Decisiones de negocio (propuesta A de cada una)
G1 está aprobada y el plan sigue con la opción A. **DEC-42 y DEC-43 fueron firmadas por el humano el 03/11/2026 con la opción A y ya están construidas en B19.** Ninguna de las restantes bloquea; si el humano elige otra, el cambio queda dentro del bolt indicado y ningún bolt se mueve.

| Decisión | Propuesta A (la que describe este documento) | Si se elige otra |
| --- | --- | --- |
| DEC-42 (**cerrada, A**) | El destino de un movimiento pendiente se ve PENDIENTE y se responde desde el calendario; el origen sigue confirmado | B17 deja de dibujar ese bloque y B19 quita la respuesta de movimiento |
| DEC-43 (**cerrada, A**) | La clase con cancelación pendiente se ve CONFIRMADA con «Cancelación pendiente» y se puede responder | B19 quita el texto y la respuesta de cancelación |
| DEC-44 | El eje se amplía para cubrir toda clase o solicitud visible fuera de la grilla | Con B, una clase fuera de la grilla dejaría de verse, contra CAL-07 |
| DEC-45 (**cerrada, A**) | En Semana, la flecha se habilita si algún día del bloque nuevo está dentro de los 366 días (H-475, firmada el 30/10 y construida y verificada en B20, también para la flecha «anterior») | Con B, los últimos días permitidos no se alcanzan desde Semana |
| DEC-50 | El alto de la hora se adapta para que un hueco mida al menos 44 px (la base acepta clases de 1 a 1440 min; con duraciones cortas la grilla se alarga y se desplaza en vertical) | Con B falla CA-72 en clases de menos de 30 min; con C, NFR-12 y CA-90. **Acotada por H-472 (aceptada el 30/10, se aplica en B18):** el alto de la hora tiene un tope de 16,5 rem; hasta 10 min de duración un hueco mide al menos 44 px y debajo de 10 min puede medir menos, y la alternativa es «Ver como lista» (excepción a NFR-12/CA-90) |

Ya cerradas por la spec o por UX: DEC-46 («Ver como lista» en Semana agrupa por día, CAL-19), DEC-47 (la lista es estado local; en la dirección solo van vista y día, CAL-02), DEC-48 (texto de ayuda de WEB-14 literal) y DEC-49 (los textos no fijados siguen `ux/web/flujos.md`).

## Cómo se va a verificar (planificado)
El plan de casos (`.aidlc/calendario-profesor/calidad/casos/`) tiene 71 casos: 52 para CA-67..90 (CA-88, rendimiento, solo en B23) y 19 para INV-01..05, con los heredados de la regresión. Los casos de DEC-42..45 y DEC-50 asumen la opción A. WEB-14, 15 y 16 llevan evidencia de pantalla. Este documento solo marca como disponible lo que ya pasó (B16 a B20); el resto espera a sus casos. En B19: pruebas unitarias del Panel, E2E `calendario-solicitudes.spec.ts` (7 de 7) y la E2E completa de chromium en verde; la verificación manual de contraste de «Cancelación pendiente», teclado y lector, y el rechazo a 360 px quedan para B22. En B20: 493 pruebas del Panel y 14 E2E de Semana en verde; evidencias en `.aidlc/calendario-profesor/calidad/evidencias/ui/WEB-15-semana-*` y `WEB-16-semana-ca83-*`. Abiertos: H-B20-01 (4 errores de formato en una prueba vieja de B16, el Tester los corrige antes de G3) y H-B20-03 (medir el contraste de «Ahora» y del tinte de hoy y probar huecos de menos de 10 min a 360 px, en B22); H-B20-T02 (una prueba de la lista falló una vez en corrida completa, en vigilancia).

Fuentes: spec §3.1 y §4; `.aidlc/calendario-profesor/ux/web/flujos.md` (F-CAL-01..11); decisiones DEC-42..45 y DEC-50.

## Bitácora de versiones

| Versión | Fecha | Bolt | IDs | Cambio |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-10-30 | inception | CAL-01..20, WEB-14..16, INV-01..05, DEC-42..45, DEC-50 | Primera versión, en construcción: lo diseñado, no verificado |
| 0.2 | 2026-10-30 | G1 aprobada | DEC-42..50, CA-67..90, INV-01..05 | Decisiones pendientes con su propuesta A, cerradas DEC-46..49 y plan de verificación; sigue sin construir |
| 0.3 | 2026-10-30 | B17 (G2 aprobada) | CAL-02..04, CAL-08, CAL-09, CAL-19, WEB-14, WEB-16, H-472, H-475, DEC-45, DEC-50 | Estado de construcción: Panel en calendario Día, eje, bloques, barra y «Ver como lista» construidos; «Elegir día» perdido y de vuelta en B18 (H-B17-03); tope de 16,5 rem (H-472) y flecha de Semana (H-475) como decisiones firmadas |
| 0.4 | 2026-10-31 | B18 (calendario-profesor) | CAL-03, CAL-05, CAL-06, CAL-11, CAL-14, CAL-17, CAL-18, H-472, H-473, H-474, H-475, H-B17-03 | Huecos, bloqueos y detalle tocables, leyenda, ayuda y «Elegir día» construidos y verificados; corregido «Ya no hay campo de fecha»; reglas de A-2, A-3 y A-4 |
| 0.5 | 2026-11-04 | B19 (calendario-profesor) | CAL-08, CAL-12, CAL-20, CA-76, CA-84, INV-03, INV-04, DEC-42, DEC-43, H-B19-04 | Responder solicitudes desde el calendario Día (reserva, destino de movimiento, cancelación pendiente) y «Copiar enlace de este día» construidos y verificados; DEC-42 y DEC-43 cerradas con A |
| 0.6 | 2026-11-06 | B20 (calendario-profesor) | CAL-03, CAL-15, CAL-16, CAL-19, WEB-15, WEB-16, CA-67, CA-68, CA-74, CA-81, CA-83, CA-85, DEC-45, DEC-46, H-475, H-B20-01, H-B20-03 | Vista Semana (7 columnas, ventana de 3 días con flechas y deslizamiento, hoy y «Ahora»), lista agrupada por día y bordes del rango construidos y verificados; sin «Copiar enlace» en la Semana; DEC-45 cerrada con A |
