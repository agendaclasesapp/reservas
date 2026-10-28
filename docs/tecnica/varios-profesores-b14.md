---
titulo: Técnica · Varios profesores (B14, CR-002 y CR-003)
version: 0.1
fecha: 2026-10-23
publico: equipo técnico y operación
---
# Varios profesores (B14, CR-002 y CR-003)

> Estado: **construido y verificado en B14** (base, web, mails y migración de expansión; pruebas pgTAP, de integración y en navegador). **No está construido** lo que es de B15: la pantalla del Administrador (`alta_profesor`, `cambiar_estado_profesor`, `listar_profesores`, WEB-10) y la contracción de la migración. Fuentes: ADR-018 a ADR-021, `contratos.md` §1 a §5 y `componentes.md` §3 a §5 del workspace (`.aidlc/reservatuclase/arquitectura/`). Sin valores secretos ni datos personales.

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
- **`alumno`** (la persona): `user_id`, `mail` único entre no borrados, ficha, `ficha_origen_profesor_id` (profesor del enlace por el que completó la ficha), `creado_por` (profesor que lo cargó) y `compartida` (tiene vínculo con más de un profesor; la mantiene un trigger de `inscripcion`). El `estado` pasa a `ficha_incompleta`, `completa` o `borrado`. Las columnas viejas (`profesor_id`, `motivo_estado`, `aprobado_en`, `como_llego`) quedan sin uso hasta la contracción de B15.
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
| `listar_profesores()`, `alta_profesor`, `cambiar_estado_profesor` | Contrato definido; **se construyen en B15** |
| Funciones del operador | `configurar_profesor(p_mail, p_nombre, p_slug)` devuelve el id; `configurar_administrador(p_mail)` |
| Errores nuevos | `SLUG_YA_USADO` (409), `PROFESOR_INACTIVO` (409), `MAIL_YA_REGISTRADO` con más ramas, `CUENTA_NO_APROBADA` con estado y profesor |

Las funciones `config_publica()` y `agenda_publica(p_dia)` sin slug quedan solo como transición mientras se despliega y se borran en la contracción de B15.

**Profesor inactivo (pausa; AGE-11, PRF-08, ADM-05, DEC-35, DEC-37).** `privado.exigir_profesor_activo` da 409 `PROFESOR_INACTIVO` en la agenda pública, `completar_ficha` y `pedir_inscripcion` con su slug, `aprobar_cuenta`, `alta_alumno`, las solicitudes de reserva, movimiento y cancelación, confirmar una solicitud, y crear o mover clases. No lo exigen: las lecturas, rechazar, cancelar clases, editar y borrar alumnos, la unión, la configuración y los bloqueos. Al inactivar se cancelan las solicitudes pendientes y se mantienen las reservas confirmadas; **sin mail** al alumno por esa cancelación (DEC-37 a). Hoy la columna y las reglas existen en la base; la acción de inactivar y reactivar es de B15.

## 4. Rutas y sesión de la web (ADR-020)

- `#/p/<slug>` es la agenda de un profesor. `#/` sin vínculo dice «Pedile el enlace a tu profesor» y ofrece el ingreso; con un vínculo abre esa agenda y con más de uno muestra el selector. El profesor va a `#/panel`; el Administrador que no es profesor, a `#/admin`.
- Selector de profesor (WEB-11): `src/modulos/inicio/`, montado por el layout de `src/rutas.tsx` cuando `inscripciones` tiene más de un elemento; el profesor elegido se guarda en `sessionStorage`. El menú «Agenda» lleva al elegido o al único.
- El slug visitado de un profesor activo sin vínculo se recuerda en `sessionStorage` («profesor de origen») para que la ficha pregunte «cómo llegaste».
- Menú del profesor: Panel, Lista y Configuración; con «Administración» (`#/admin`) si además es Administrador.
- Pruebas de la sesión: `tests/unit/estado/soporte.ts` trae sesiones fijas con la forma de `sesion_actual` y un `almacenEnMemoria` para `sessionStorage`.
- Hoy `#/solicitud` y `#/mis-clases` exigen un vínculo aprobado; B07 abrirá Mis clases a toda persona con ficha completa.
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

- **Efecto sobre los datos.** El profesor existente conserva id, usuario, agenda y alumnos y queda con el slug provisional `p-<8 primeros hex del id>`; su enlace es `#/p/<ese slug>` hasta que el Administrador lo da de alta con el definitivo (B15), momento en que el provisional deja de valer. Cada alumno pasa a persona y su estado anterior a una `inscripcion`. Si el profesor no tiene mail pero sí datos, o hay mails de alumno repetidos, la migración aborta con `P0004` sin dejar nada a medias.
- **Orden de despliegue.** Base primero y web enseguida; B14 y B15 llegan antes que cualquier migración `2026110006*` (B06 en adelante), porque `db push` no usa `--include-all`.
- **Antes de migrar:** respaldo con datos fuera del repositorio y consultas de conteo para comparar después. Después: comprobar slug, estados y cantidades y correr el humo (agenda del enlace, ingreso del profesor, reserva de prueba, Administrador en `#/admin`, remitente y Reply-To de un mail de prueba, `keepalive`).
- **Puesta en marcha en base nueva:** `privado.configurar_administrador('<mail>')` en lugar de `configurar_profesor`; da 409 `MAIL_YA_REGISTRADO` si ese mail es de una persona con ficha completa. Hasta B15, otro profesor se da de alta con `privado.configurar_profesor('<mail>', '<nombre>', '<slug>')`.
- **Vuelta atrás** (solo con la expansión aplicada, la contracción sin aplicar y a lo sumo un profesor): migración inversa `ops/vuelta-atras/inversa-b14.sql`, en una transacción, con la web de B05 publicada antes. Se pierden las inscripciones `baja` (pasan a `rechazado`), los mails sin profesor, el remitente y Reply-To guardados, el slug, el Administrador y lo que B05 no tiene. Con más de un profesor o con la contracción aplicada, solo sirve el dump, que no se ensayó. Si falla `db push`, no hay nada que deshacer. Si falla solo la web, se revierte su commit.
- **Ensayo:** `bash ops/vuelta-atras/ensayar.sh` (destruye la base local) arma B05 con datos, aplica la expansión y la inversa y exige que catálogo y datos queden idénticos; se repite cada vez que cambia una migración `20261100051*` o `20261100052*`.

Guías de operador que el equipo debe enlazar: `ops/migracion-multiprofesor.md`, `ops/puesta-en-marcha.md` (paso 7), `ops/mails.md`, `ops/auth.md`, `ops/vuelta-atras/README.md`.

## Preguntas abiertas para su dueño

- **DEC-38** (aviso `alumno_sumado` al agregar un mail por edición, ALU-08, AVI-04): sigue abierta; no consta qué se firmó.
- **H-286**: el texto de privacidad con varios profesores y la frase sobre el Administrador esperan aprobación del humano y asesoría legal (`cambios/propuesta-privacidad-multiprofesor.md`).
- `contratos.md` y ADR-016 todavía hablan de 5 solicitudes pendientes en algunos pasajes; la spec vigente (SOL-10) dice 10 por profesor.

## Bitácora de versiones

| Versión | Fecha | Bolt | IDs | Cambio |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-10-23 | B14 | CR-002, CR-003, ADR-018..021, ADM-01..05, AGE-09..11, ALU-13, ALU-14, SOL-10, AVI-07, AVI-08, WEB-09..12, DEC-29..38 | Primera versión: modelo, contratos, rutas, mails y topes, nombre visible y migración con su vuelta atrás |
