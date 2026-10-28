---
titulo: Funcional · Alumnos y cuentas
version: 0.6
fecha: 2026-10-23
publico: negocio y equipo
---
# Alumnos y cuentas

> Desde B14 (CR-002) la cuenta es de la **persona** y el estado de aprobación es de cada **vínculo con un profesor**: ver `varios-profesores.md`. Donde este documento dice «el profesor», es el profesor del vínculo.

> Estado tras B04 y B05: **construido y verificado** el ingreso (código por mail y Google, CAPTCHA), la ficha obligatoria, el tope de fichas, las personas a cargo, la aprobación y el rechazo de cuentas con motivo, la unión de alumnos y el alta y edición por el profesor. Tras B11 también están **construidos y verificados** la retención, el aviso previo y el borrado de un alumno (ALU-10..12). Pendiente de decisión del humano: DEC-39 (ver abajo).

## Ingreso
Se entra con Google o con un código de 6 dígitos enviado por mail; no hay contraseñas (ALU-01, WEB-02). Un código incorrecto o vencido muestra error. Supabase Auth responde igual (403 `otp_expired`) ante un código erróneo, vencido o ya usado, así que la app los distingue por la hora en que se pidió el código; pedir otro antes de 60 s da un error de espera (429; `contratos.md` §5, ADR-007). El diseño fija la vigencia del código en 600 segundos (10 minutos; `contratos.md` §5); la spec no la define y DEC-11 sigue abierta con otra opción por defecto (Supabase Auth, cerca de 1 hora), por lo que se consulta a su dueño. El rol (alumno o profesor) y el vínculo con la ficha de alumno o profesor se asignan solo con el mail ya confirmado (ADR-007). Ejemplo de prueba: un código llega a `alumno1@example.test`.

**CAPTCHA (CR-001, DEC-13, WEB-02, CA-44):** para pedir un código la persona resuelve antes un desafío CAPTCHA (Cloudflare Turnstile, gratuito). Si no lo resuelve, no se envía ningún código ni se crea cuenta. Como Supabase Auth no distingue alta de ingreso, el desafío se pide en **todo** pedido de código. «Continuar con Google» no lo pide. Estado: construido y verificado en B04 (CA-44): sin el desafío resuelto la pantalla avisa, no sale ningún mail y no nace el usuario. Sin contraseñas en ningún paso.

## Ficha y aprobación
**Construido (B04, B05).** La ficha es obligatoria: con la sesión iniciada y sin ficha completa, toda ruta lleva a la ficha, con el mail del ingreso ya cargado; si falta un dato no se guarda y el error queda en el campo (CA-02). Al guardar, la cuenta queda **pendiente** y la persona ve «Mi ficha» con «Pendiente de aprobación». Si se repite el envío de una ficha ya completa, la web lo toma como éxito. Al completar la ficha se avisa por mail al profesor (AVI-02) y, al aprobar o rechazar, al titular con el motivo si lo hay (AVI-03). Si la ficha supera el tope, se lee «Intentá de nuevo más tarde», la cuenta sigue sin ficha y no sale mail (CA-43). Límites de los campos: nombre hasta 100 caracteres, teléfono con 6 a 15 dígitos, fecha de nacimiento entre 1900 y hoy, «cómo llegó» hasta 200 caracteres (`contratos.md` §1).

**Rechazo y aprobación (B05, verificado en WEB-03-rechazo y WEB-07-rechazar).** El profesor rechaza con un motivo opcional de hasta 500 caracteres, con el aviso de que la persona lo verá. La cuenta rechazada muestra «Rechazada» y «Motivo:» con el texto literal (el HTML no se interpreta; sin motivo solo el estado). Una cuenta rechazada puede aprobarse después y entonces el motivo desaparece (H-037). Aprobar o rechazar dos veces o desde una lista vieja da el error `CUENTA_NO_PENDIENTE`.

- Al primer ingreso la persona completa nombre, teléfono/WhatsApp, fecha de nacimiento y «cómo llegó» (obligatorio); con Google, nombre y mail vienen precargados (ALU-02, WEB-03). Sin ficha completa solo ve la ficha.
- Con la ficha completa queda **pendiente** hasta que el profesor la apruebe o rechace. Pendiente o rechazada: puede ver el calendario y su estado, pero toda solicitud se rechaza (ALU-03). Una cuenta rechazada sigue rechazada hasta que el profesor la reabra (DEC-01). El umbral de edad es 18 años y la ficha de un menor se acepta, queda pendiente y el profesor decide (DEC-02, cerrada el 2026-10-21; coincide con el diseño, sin texto nuevo en la spec).
- **Motivo de rechazo visible (CR-001, DEC-22, ALU-03, WEB-03, WEB-05, CA-45):** si el profesor escribió un motivo al rechazar la cuenta, la persona lo ve en su ficha y en Mis clases, además de recibirlo por mail (AVI-03). Sin motivo, ve solo el estado. El texto se muestra como texto, no como HTML. Es texto libre del profesor y puede contener datos personales: solo lo ve esa cuenta y se borra con la retención (ALU-10).
- **Tope de fichas (CR-001, DEC-12, ALU-13, CA-43):** se aceptan como máximo **10 fichas completadas por hora por profesor de origen** (el del enlace por el que entró la persona; las que se completan sin enlace comparten un cupo propio de 10; ALU-13, DEC-27); la ficha 11 se rechaza con un mensaje de intentar más tarde y no crea la cuenta (error `LIMITE_EXCEDIDO`, 429). Pasada la hora se acepta.
- El profesor ve una lista de alumnos con estado, ficha y edad calculada (ALU-09). Edita solo la ficha de las personas sin cuenta o sin usuario que cargó él; la de una persona con cuenta da 403 (DEC-32).

## Personas a cargo
**Construido (B04, WEB-03).** Se cargan después de completar la ficha y aparecen en la ficha del titular; solo se registran y editan, no hay baja. Sin ficha completa la operación se rechaza (`FICHA_INCOMPLETA`).

El titular registra y edita personas a cargo (nombre, fecha de nacimiento), por ejemplo hijos menores; no inician sesión y cada reserva indica quién toma la clase (ALU-06, RES-03).

## Alta por el profesor y unión
**Construido (B05, verificado en WEB-07).** En la lista del profesor, «Agregar alumno» crea un alumno con o sin mail; sin mail avisa «No podrá ingresar ni recibirá mails.». «Editar» cambia los datos; el mail no se puede cambiar en una cuenta que ya ingresó, y un mail ya usado por otro alumno o por el profesor da `MAIL_YA_REGISTRADO`. Al aprobar una cuenta con un alumno sin cuenta con el mismo teléfono se abre «Posible alumno repetido» con las dos fichas lado a lado: «Unir cuentas» pasa las clases a la cuenta; «No unir» deja todo igual y no vuelve a sugerir; «Decidir después» cierra el diálogo. La lista de alumnos muestra estado y edad calculada con la fecha de la aplicación en el huso del profesor (una alumna nacida el 2000-10-21 tiene 26 años el 2026-10-21 y 25 la víspera; ALU-09); no lista fichas incompletas ni borrados.

- Con mail: crea una cuenta ya aprobada; la persona entra con ese mail. Sin mail: alumno sin cuenta, que no ingresa ni recibe mails (ALU-07, ALU-08).
- Al aprobar una cuenta cuyo teléfono normalizado coincide con el de un alumno sin cuenta, el sistema sugiere unirlos; el profesor confirma o descarta y lo descartado no vuelve. Ejemplo (CA-04): el alumno sin cuenta con teléfono «099 123-456» y la cuenta que se registra con «+598 99123456» se sugieren como la misma persona. Al confirmar, clases, solicitudes e historial pasan a la cuenta (ALU-04, ALU-05, DEC-03).

## Retención de datos (B11, construido y verificado)
- **Cuándo.** A los 6 meses de la última clase **con cualquier profesor**, sin clases futuras con ninguno (o del registro o la última aprobación si nunca tuvo clases), se borran los datos de la persona (ALU-10, DEC-26). El plazo es de la persona, no de cada vínculo.
- **Qué se borra.** Nombre, mail, teléfono, nacimiento, cómo llegó, motivo de rechazo, personas a cargo, observaciones de reservas, motivos de solicitudes, los datos de los mails que la nombran (un mail suyo en cola o saliendo queda fallido, sin destinatario, asunto ni cuerpo, y no se envía) y la cuenta de ingreso, incluido lo que Auth guarda del usuario. El diseño anonimiza en lugar de borrar la fila (ADR-011): las clases pasadas quedan, sin datos de la persona. En las listas del profesor la persona figura como «Alumno dado de baja».
- **Renovación y aviso.** Cada ingreso renueva el plazo (ALU-11). Siete días antes el titular recibe un mail de «Agenda Clases App» con la fecha (huso de la aplicación) (AVI-06); si ingresa antes, el plazo vuelve a contar, y si una clase posterior corre el vencimiento después de un aviso, llega un aviso nuevo con la fecha nueva. El proceso corre cada noche a las 03:30 UTC.
- **Borrar alumno (ALU-12, DEC-05).** El profesor puede borrar a un alumno en cualquier momento, también con su agenda inactiva: se cancelan sus clases futuras con él y se liberan los horarios, se anulan sus solicitudes pendientes, se cierran sus series, y todo **sin mandar mails**; sus clases pasadas quedan como «Alumno dado de baja» y sale de su lista. Si no tenía cuenta ni otro profesor se borran sus datos y sus personas a cargo; si tiene cuenta, su cuenta y su ficha siguen y lo suyo con otros profesores no cambia.
- **DEC-39, pendiente del humano.** Si el proceso estuvo parado más de 7 días, al volver borra a quienes vencieron en el medio aunque no hayan recibido el aviso, y no hay vuelta atrás (comportamiento actual). Se recomienda un período de gracia de 7 días tras el aviso; si se acepta, el borrado podría ocurrir hasta 7 días después del aviso y la política de privacidad lo dice. Mientras no se decida, el runbook `ops/operacion.md` §5 pide revisar antes de reactivar el proceso.

## Bitácora de versiones

| Versión | Fecha | Bolt | IDs | Cambio |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-10-21 | inception | ALU-01..12, WEB-02/03, AVI-06 | Primera versión |
| 0.2 | 2026-10-21 | inception | ALU-01, ALU-04, ALU-10, CA-04, ADR-007, ADR-011 | Vigencia del código (600 s), asignación de rol, ejemplo de unión, alcance de la anonimización |
| 0.3 | 2026-10-21 | construcción (hito spikes S01-S03 y CR-001) | CR-001, ALU-03, ALU-10, ALU-13, WEB-02, WEB-03, WEB-05, CA-43, CA-44, CA-45, DEC-01, DEC-02, DEC-13, DEC-22, ADR-007 | CAPTCHA en el pedido de código, motivo de rechazo visible, tope de fichas, DEC-01/02 cerradas, errores del código tras S02 |
| 0.4 | 2026-10-22 | B04, B05 | ALU-01..09, ALU-13, AVI-02, AVI-03, CA-01, CA-02, CA-04, CA-05, CA-43, CA-44, CA-45, WEB-02, WEB-03, WEB-07 | Ingreso, CAPTCHA, ficha, tope de fichas, personas a cargo, aprobación, rechazo con motivo, unión y alta marcados como construidos y verificados |
| 0.5 | 2026-10-23 | B14 | CR-002, ALU-13, ALU-14 | Nota de vínculo por profesor y tope de fichas por profesor de origen |
| 0.6 | 2026-10-23 | B11 | ALU-10, ALU-11, ALU-12, AVI-06, DEC-05, DEC-26, DEC-32, DEC-39, CA-57 | Retención, aviso previo y borrado de alumno construidos; DEC-39 pendiente; el profesor edita solo fichas sin cuenta que cargó |
