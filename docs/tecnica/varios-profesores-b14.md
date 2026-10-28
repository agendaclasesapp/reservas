---
titulo: Técnica · Varios profesores (B14, CR-002 y CR-003)
version: 0.2
fecha: 2026-10-23
publico: equipo técnico y operación
---
# Varios profesores (B14, CR-002 y CR-003)

> Estado: **construido y verificado en B14** (base, web, mails y migración de expansión) y **en B15** (pantalla del Administrador, `alta_profesor`, `cambiar_estado_profesor`, `listar_profesores`, WEB-10, y la contracción de la migración; pruebas pgTAP, de integración y E2E en navegador). B06 completó la pausa: al inactivar se anulan las solicitudes pendientes. Fuentes: ADR-018 a ADR-021, `contratos.md` §1 a §5 y `componentes.md` §3 a §5 del workspace (`.aidlc/reservatuclase/arquitectura/`). Sin valores secretos ni datos personales.

## 1. Qué cambia respecto de B05

| Tema | Antes (B01 a B05) | Ahora (B14) | ADR |
| --- | --- | --- | --- |
| Profesores | Una sola fila de `profesor` | N filas, cada una con `slug`, `activo` y su propia configuración | 018 (reemplaza a 015) |
| Alumno | Un alumno pertenece a un profesor | `alumno` es la **persona** (ficha única); el vínculo con cada profesor es `inscripcion` | 018 |
| Rutas | Agenda en `#/` | Agenda en `#/p/<slug>`; `#/` no lista profesores | 020 |
| Mails | Remitente `GMAIL_USER` para todo | Remitente con el nombre del profesor y Reply-To a su mail; avisos de la aplicación con «Agenda Clases App» | 019, CR-003 |
| Topes | Globales por instalación | Por profesor y un tope global diario | 019 |
| Administrador | No existía | Una fila en `privado.administrador`, cargada por el operador | 018 |
| Nombre visible | El nombre anterior del proyecto | «Agenda Clases App» con su ícono | CR-003 |

## 2. Modelo de datos

- **`profesor`**: `slug` (`citext`, único; 3 a 30 caracteres, minúsculas, dígitos y guiones, fuera de la lista reservada `admin`, `p`, `ingreso`, `ficha`, `mis-clases`, `panel`, `lista`, `configuracion`, `inicio`, `api`, `reservas`, `soporte`, `ayuda`), `slug_provisional`, `activo`, `creado_en`; `mail` único y no nulo. Grilla, duración, anticipación, huso y horizonte son de cada fila (AGE-10).
- **`alumno`** (la persona): `user_id`, `mail` único entre no borrados, ficha, `ficha_origen_profesor_id` (profesor del enlace por el que completó la ficha), `creado_por` (profesor que lo cargó) y `compartida` (tiene vínculo con más de un profesor; la mantiene un trigger de `inscripcion`). El `estado` pasa a `ficha_incompleta`, `completa` o `borrado`. Las columnas viejas (`profesor_id`, `motivo_estado`, `aprobado_en`, `como_llego`) **ya no existen**: la contracción de B15 (`202611000539`) las borró y esos datos viven solo en `inscripcion`; `persona_a_cargo` tampoco tiene `profesor_id`.
- **`inscripcion`** (el vínculo de ALU-14): `alumno_id`, `profesor_id`, `estado` (`pendiente`, `aprobado`, `rechazado`, `sin_cuenta`, `baja`), `motivo_estado`, `como_llego`, `aprobado_en`; única por persona y profesor. Nace pendiente al completar la ficha desde un enlace o al pedir acceso con la ficha ya completa; sin enlace no hay inscripción.
- **`privado.administrador`**: una sola fila (mail y usuario vinculado); no la lee ningún rol de la app. Lo carga el operador con `privado.configurar_administrador('<mail>')`.
- **`privado.ajustes`**: `tope_pendientes` (antes `tope_pendientes_alumno`) = 10, `tope_mails_dia_global` = 400, `zona_horaria_app` = `America/Montevideo`.
- **RLS por profesor** (ADR-001 sigue: la web solo lee; escribe por RPC): cada profesor ve solo las filas con su `profesor_id`; la persona ve las suyas de todos sus profesores; el Administrador, por serlo, no lee tablas de alumnos, clases, solicitudes ni mails (ADM-04). Roles: `privado.mi_profesor_id()`, `es_administrador()` y `mi_alumno_id()`; profesor y alumno son excluyentes (DEC-31).

## 3. Contratos nuevos o cambiados (`contratos.md`)

| Operación | Cambio |
| --- | --- |
| `config_publica(p_slug)` | Trae `{profesor_id, nombre, activo, zona_horaria, duracion_min, anticipacion_horas, horizonte_semanas}`; con el profesor inactivo, solo `{profesor_id, nombre, activo: false}` |
| `agenda_publica(p_slug, p_dia)` | Igual forma que antes; 409 `PROFESOR_INACTIVO` si está pausado |
| Slug inválido, reservado o de nadie | El mismo 404 `NO_ENCONTRADO`; el slug no distingue mayúsculas ni espacios en los bordes |
| `sesion_actual()` | `{rol, es_administrador, profesor, alumno_id, estado, nombre, mail, inscripciones[]}` (ADR-020) |
| `completar_ficha(…, p_slug, p_como_llego)` | Con enlace crea la inscripción pendiente en la misma transacción |
| `pedir_inscripcion(p_slug, p_como_llego)` | Con la ficha completa, pide acceso a otro profesor |
| `alta_alumno`, `editar_alumno` | Alta con el mail de una persona existente la asocia sin tocar su ficha (DEC-29 b); con el mail de un profesor o del Administrador, 409; la ficha solo se edita si `v_alumnos.editable` (la cargó ese profesor, sin cuenta y sin otro profesor, DEC-32); agregar por edición un mail que ya tiene cuenta da 409 y no asocia (DEC-36) |
| `listar_profesores()` | Administrador. `[{profesor_id, nombre, mail, slug, activo, creado_en}]` por nombre (`202611000531`, ADM-03) |
| `alta_profesor(p_mail, p_nombre, p_slug)` | Administrador (`202611000530`, ADM-02). El profesor nace activo con la grilla inicial; el slug se toma sin pasar a minúsculas (la web lo normaliza). El mail de un profesor de enlace provisional se **adopta** (`adoptado: true`, conserva su agenda). Encola el mail «Tu agenda en Agenda Clases App» con su enlace y el aviso de DEC-34, también al adoptar. 409 `SLUG_YA_USADO`; 409 `MAIL_YA_REGISTRADO` (sin `details`) |
| `cambiar_estado_profesor(p_profesor_id, p_activo)` | Administrador (`202611000531`, versión vigente en `202611000604`, ADM-05). Ver «Profesor inactivo». 422 `{"campo":"p_activo"}` si falta el estado; 401 con un JWT sin `sub` en las tres RPC del Administrador |
| Funciones del operador | `configurar_profesor(p_mail, p_nombre, p_slug)` devuelve el id (la de dos argumentos fue borrada por la contracción); `configurar_administrador(p_mail)` |
| `editar_alumno` (DEC-38) | Agregar un mail nuevo a un alumno sin cuenta encola `alumno_sumado` (`202611000526`); no sale si el mail no cambia, se quita o se cambia el de quien ya tenía uno |
| `solicitar_reserva`, `previsualizar_serie` (B06) | Ver «Solicitar una reserva» más abajo |
| Errores nuevos | `SLUG_YA_USADO` (409), `PROFESOR_INACTIVO` (409), `MAIL_YA_REGISTRADO` con más ramas, `CUENTA_NO_APROBADA` con estado y profesor |

Las funciones `config_publica()` y `agenda_publica(p_dia)` sin slug fueron **borradas** por la contracción de B15 (`202611000539`), que además comprueba con `P0004` que las columnas viejas están vacías y borra `privado.unico_profesor()` y dos índices de `0103`.

**Profesor inactivo (pausa; AGE-11, PRF-08, ADM-05, DEC-35, DEC-37).** `privado.exigir_profesor_activo` da 409 `PROFESOR_INACTIVO` en la agenda pública, `completar_ficha` y `pedir_inscripcion` con su slug, `aprobar_cuenta`, `alta_alumno`, las solicitudes de reserva, movimiento y cancelación, confirmar una solicitud, y crear o mover clases. No lo exigen: las lecturas, rechazar, cancelar clases, editar y borrar alumnos, la unión, la configuración y los bloqueos. Al inactivar (`cambiar_estado_profesor`, migración `202611000604` de B06, ADR-018 «Anulación al inactivar») se anulan **todas** las solicitudes pendientes del profesor, también las vencidas, y se libera lo que ocupaban; las reservas confirmadas se mantienen; **sin mail** al alumno (DEC-37 a). Al reactivar, lo anulado no vuelve. La 0531 solo cambiaba `activo`; la versión vigente es la de la 0604. Mientras está inactivo su agenda da 409, así que los huecos anulados no se ofrecen; al reactivar vuelven a figurar libres.

**Solicitar una reserva (B06; SOL-01, SOL-10, WEB-04; ADR-016).**
- `solicitar_reserva`: requiere el vínculo **aprobado** con el profesor de la agenda; con vínculo pendiente, rechazado o ausente, o con un profesor que no existe, da 403 `CUENTA_NO_APROBADA` con el estado (null si no hay). Pide una clase suelta o una serie semanal o quincenal, para el titular o una persona a cargo, con observación de hasta 500 caracteres. La anticipación mínima es inclusiva (24 horas exactas se aceptan, 23 no) y `p_inicio` tiene el rango de `agenda_publica`. La lista completa de errores y su orden de validación están en `contratos.md` §1 y §3.
- Tope: 10 pendientes por alumno con cada profesor; la undécima da 429 `LIMITE_EXCEDIDO` con el límite 10 y con otro profesor sí se puede pedir.
- `previsualizar_serie`: cualquier persona con sesión ve qué fechas de una serie quedarían libres en la agenda de un profesor activo, sin necesitar el acceso aprobado (muestra lo mismo que la agenda pública). Devuelve, por cada fecha salteada, solo la categoría `ocupado` o `bloqueado`; nunca el motivo del bloqueo ni datos de la clase (revisión de seguridad de B06, no es fuga).
- Mail `solicitud_nueva` al profesor de la agenda, con el nombre del servicio, sin Reply-To y sin la observación; asunto «Solicitud de reserva nueva: <alumno>».
- Proceso programado: job pg_cron `extender_series`, diario 03:10 UTC (`select privado.extender_series()`), materializa las series hasta hoy más el horizonte y salta a los profesores inactivos.
- Pendiente para B11 (SEC-26, SEC-27): `solicitud.motivo` y `reserva.observacion` deben entrar en el barrido de anonimización; `solicitud` tiene FK a `alumno` sin cascade.

## 4. Rutas y sesión de la web (ADR-020)

- `#/p/<slug>` es la agenda de un profesor. `#/` sin vínculo dice «Pedile el enlace a tu profesor» y ofrece el ingreso; con un vínculo abre esa agenda y con más de uno muestra el selector. El profesor va a `#/panel`; el Administrador que no es profesor, a `#/admin`.
- Selector de profesor (WEB-11): `src/modulos/inicio/`, montado por el layout de `src/rutas.tsx` cuando `inscripciones` tiene más de un elemento; el profesor elegido se guarda en `sessionStorage`. El menú «Agenda» lleva al elegido o al único.
- El slug visitado de un profesor activo sin vínculo se recuerda en `sessionStorage` («profesor de origen») para que la ficha pregunte «cómo llegaste».
- Menú del profesor: Panel, Lista y Configuración; con «Administración» (`#/admin`) si además es Administrador.
- Pruebas de la sesión: `tests/unit/estado/soporte.ts` trae sesiones fijas con la forma de `sesion_actual` y un `almacenEnMemoria` para `sessionStorage`.
- `#/admin` (B15, WEB-10) es la pantalla del Administrador, en `src/modulos/admin/vistas/`. `#/solicitud` y `#/mis-clases` exigen un vínculo aprobado; B07 abrirá Mis clases a toda persona con ficha completa.
- Tocar un hueco libre abre «Pedir clase a <profesor>» con el acceso aprobado por ese profesor; con el acceso pendiente o rechazado lleva al aviso de estado; sin sesión muestra «Ingresá para pedir esta clase» con el acceso a `#/ingreso`, que vuelve a la misma agenda, y no llama a ninguna RPC de escritura (WEB-01, WEB-04).
- La agenda recuerda la configuración del enlace mientras la pestaña sigue abierta: tras reactivar a un profesor hay que recargar.

## 5. Mails y topes (ADR-019, AVI-07, AVI-08)

- Mail de un profesor a su alumno (AVI-03, AVI-04 con «te sumó como alumno», AVI-05): remitente con el **nombre del profesor** y `Reply-To` a su mail; el nombre se sanea y se guarda al encolar (`mail_salida.remitente_nombre`, `responder_a`).
- Avisos al profesor, aviso de borrado y de inactividad: remitente «Agenda Clases App», sin Reply-To.
- Códigos de ingreso (Supabase Auth): *Sender name* «Agenda Clases App». **En producción es un paso manual del panel** (Authentication > SMTP Settings) antes de desplegar B14; no va por `config.toml`. `scripts/seguridad/verificar-auth.mjs` lo comprueba tras cada despliegue.
- La Edge Function arma `from` con `{name, address: GMAIL_USER}` y `replyTo`; el sobre sigue siendo la cuenta dedicada (SPF y DKIM intactos).

| Tope | Valor | Si se supera |
| --- | --- | --- |
| Mails por profesor | 20 por hora y 200 por día | Fila `fallida` con motivo `TOPE` |
| Mails de toda la aplicación | 400 por día | Fila `fallida` con motivo `TOPE_GLOBAL`; si se superan ambos, gana `TOPE` |
| Solicitudes pendientes | 10 por alumno **con cada profesor** (SOL-10, antes 5) | 429 `LIMITE_EXCEDIDO` `{"tope":"pendientes"}` (B06) |
| Fichas completadas | 10 por hora por profesor de origen; las sin enlace comparten un cupo propio (ALU-13) | 429 `LIMITE_EXCEDIDO` `{"tope":"fichas"}` |

Cambiar un valor exige un CR y una migración. Guía de operador: `ops/mails.md` («Cuota compartida y topes»).

## 6. Nombre visible «Agenda Clases App» (CR-003, WEB-12)

El producto se llama **Agenda Clases App**; su ícono es `docs/marca/agenda-clases-app-icono.jpg`. Aparece en el título de cada pestaña («<Pantalla> · Agenda Clases App»), en el encabezado junto al ícono, en las páginas de condiciones y privacidad, en el remitente de los mails de la aplicación y de los códigos de ingreso, y como favicon. Los íconos se regeneran a mano con `python scripts/marca/generar-iconos.py` (no entra en build ni en CI). No cambian los identificadores internos: slug del proyecto `reservatuclase`, rutas, paquetes y la ruta `docs/specs/reservatuclase.md`.

Pasos manuales de marca en producción: *Sender name* en el panel de Auth (§5) y, en Google Auth Platform > Branding, *App name* «Agenda Clases App» con el logo `docs/marca/agenda-clases-app-120.png` (Google puede pedir otra verificación de marca; `ops/auth.md`).

## 7. Migración de producción y vuelta atrás (ADR-021, ADM-01, NFR-09)

Va en **dos fases**: expandir (B14, migraciones `202611000510` a `20261100052x`) y contraer (B15, en un despliegue aparte). Guía completa para el operador: `ops/migracion-multiprofesor.md`.

**Despliegue por tramos (ADR-021, `ops/migracion-multiprofesor.md` §1).** Cada tramo se despliega desde su propia etiqueta, en este orden y solo cuando el anterior tiene su humo en verde:

| Tramo | Etiqueta | Migraciones |
| --- | --- | --- |
| 1. B14 (expansión) | `prod-b14` | `0510` a `0513` y `0520` a `0525` |
| 2. B15 sin contracción | `prod-b15a` | `0526`, `0530`, `0531` |
| 3. Contracción, tras el humo con el slug nuevo | `prod-b15b` | `0539` |
| 4. B06 en adelante | `prod-b06` | `0601` a `0604` y las que sigan |

La contracción no se junta con el alta del slug definitivo; desde ella `inversa-b14.sql` ya no sirve y queda solo el dump.

- **Efecto sobre los datos.** El profesor existente conserva id, usuario, agenda y alumnos y queda con el slug provisional `p-<8 primeros hex del id>`; su enlace es `#/p/<ese slug>` hasta que el Administrador lo da de alta con el definitivo (B15), momento en que el provisional deja de valer. Cada alumno pasa a persona y su estado anterior a una `inscripcion`. Si el profesor no tiene mail pero sí datos, o hay mails de alumno repetidos, la migración aborta con `P0004` sin dejar nada a medias.
- **Orden de despliegue.** Base primero y web enseguida; B14 y B15 llegan antes que cualquier migración `2026110006*` (B06 en adelante), porque `db push` no usa `--include-all`.
- **Antes de migrar:** respaldo con datos fuera del repositorio y consultas de conteo para comparar después. Después: comprobar slug, estados y cantidades y correr el humo (agenda del enlace, ingreso del profesor, reserva de prueba, Administrador en `#/admin`, remitente y Reply-To de un mail de prueba, `keepalive`).
- **Puesta en marcha en base nueva:** `privado.configurar_administrador('<mail>')` en lugar de `configurar_profesor`; da 409 `MAIL_YA_REGISTRADO` si ese mail es de una persona con ficha completa. Otro profesor se da de alta desde `#/admin` (`alta_profesor`); `privado.configurar_profesor('<mail>', '<nombre>', '<slug>')` sigue como herramienta del operador.
- **Vuelta atrás** (solo con la expansión aplicada, la contracción sin aplicar y a lo sumo un profesor): migración inversa `ops/vuelta-atras/inversa-b14.sql`, en una transacción, con la web de B05 publicada antes. Se pierden las inscripciones `baja` (pasan a `rechazado`), los mails sin profesor, el remitente y Reply-To guardados, el slug, el Administrador y lo que B05 no tiene. Con más de un profesor o con la contracción aplicada, solo sirve el dump, que no se ensayó. Si falla `db push`, no hay nada que deshacer. Si falla solo la web, se revierte su commit.
- **Ensayo:** `bash ops/vuelta-atras/ensayar.sh` (destruye la base local) arma B05 con datos, aplica la expansión y la inversa y exige que catálogo y datos queden idénticos; se repite cada vez que cambia una migración `20261100051*` o `20261100052*`.

Guías de operador que el equipo debe enlazar: `ops/migracion-multiprofesor.md`, `ops/puesta-en-marcha.md` (paso 7), `ops/mails.md`, `ops/auth.md`, `ops/vuelta-atras/README.md`.

## Preguntas abiertas y decisiones cerradas

- **DEC-38**: cerrada en B15 (`alumno_sumado` al agregar un mail por edición); ya no es pregunta.
- **H-286**: cerrada; `public/privacidad.html` coincide con la propuesta aprobada y su pie dice «Vigente desde el 2026-10-23» (decisión del humano en G2-B15).
- **H-323** (repetir el aviso de alta a un mismo mail): riesgo aceptado por el humano en G2-B15; lo acotan los topes de mails.
- `contratos.md` y ADR-016 todavía hablan de 5 solicitudes pendientes en algunos pasajes; la spec vigente (SOL-10) dice 10 por profesor.

## Bitácora de versiones

| Versión | Fecha | Bolt | IDs | Cambio |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-10-23 | B14 | CR-002, CR-003, ADR-018..021, ADM-01..05, AGE-09..11, ALU-13, ALU-14, SOL-10, AVI-07, AVI-08, WEB-09..12, DEC-29..38 | Primera versión: modelo, contratos, rutas, mails y topes, nombre visible y migración con su vuelta atrás |
| 0.2 | 2026-10-23 | B15, B06 | ADM-02, ADM-03, ADM-05, SOL-01, SOL-10, WEB-04, WEB-10, DEC-35, DEC-37, DEC-38, ADR-018, ADR-021 | RPC del Administrador, contracción, solicitar y previsualizar, anulación al inactivar, tramos de despliegue, decisiones cerradas |
