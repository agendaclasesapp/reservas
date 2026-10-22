---
titulo: Funcional · Alumnos y cuentas
version: 0.4
fecha: 2026-10-21
publico: negocio y equipo
---
# Alumnos y cuentas

> Estado tras B04 y B05: **construido y verificado** el ingreso (código por mail y Google, CAPTCHA), la ficha obligatoria, el tope de fichas, las personas a cargo, la aprobación y el rechazo de cuentas con motivo, la unión de alumnos y el alta y edición por el profesor. Siguen **diseñados**: retención y borrado (ALU-10..12).

## Ingreso
Se entra con Google o con un código de 6 dígitos enviado por mail; no hay contraseñas (ALU-01, WEB-02). Un código incorrecto o vencido muestra error. Supabase Auth responde igual (403 `otp_expired`) ante un código erróneo, vencido o ya usado, así que la app los distingue por la hora en que se pidió el código; pedir otro antes de 60 s da un error de espera (429; `contratos.md` §5, ADR-007). El diseño fija la vigencia del código en 600 segundos (10 minutos; `contratos.md` §5); la spec no la define y DEC-11 sigue abierta con otra opción por defecto (Supabase Auth, cerca de 1 hora), por lo que se consulta a su dueño. El rol (alumno o profesor) y el vínculo con la ficha de alumno o profesor se asignan solo con el mail ya confirmado (ADR-007). Ejemplo de prueba: un código llega a `alumno1@example.test`.

**CAPTCHA (CR-001, DEC-13, WEB-02, CA-44):** para pedir un código la persona resuelve antes un desafío CAPTCHA (Cloudflare Turnstile, gratuito). Si no lo resuelve, no se envía ningún código ni se crea cuenta. Como Supabase Auth no distingue alta de ingreso, el desafío se pide en **todo** pedido de código. «Continuar con Google» no lo pide. Estado: construido y verificado en B04 (CA-44): sin el desafío resuelto la pantalla avisa, no sale ningún mail y no nace el usuario. Sin contraseñas en ningún paso.

## Ficha y aprobación
**Construido (B04, B05).** La ficha es obligatoria: con la sesión iniciada y sin ficha completa, toda ruta lleva a la ficha, con el mail del ingreso ya cargado; si falta un dato no se guarda y el error queda en el campo (CA-02). Al guardar, la cuenta queda **pendiente** y la persona ve «Mi ficha» con «Pendiente de aprobación». Si se repite el envío de una ficha ya completa, la web lo toma como éxito. Al completar la ficha se avisa por mail al profesor (AVI-02) y, al aprobar o rechazar, al titular con el motivo si lo hay (AVI-03). Si la ficha supera el tope, se lee «Intentá de nuevo más tarde», la cuenta sigue sin ficha y no sale mail (CA-43). Límites de los campos: nombre hasta 100 caracteres, teléfono con 6 a 15 dígitos, fecha de nacimiento entre 1900 y hoy, «cómo llegó» hasta 200 caracteres (`contratos.md` §1).

**Rechazo y aprobación (B05, verificado en WEB-03-rechazo y WEB-07-rechazar).** El profesor rechaza con un motivo opcional de hasta 500 caracteres, con el aviso de que la persona lo verá. La cuenta rechazada muestra «Rechazada» y «Motivo:» con el texto literal (el HTML no se interpreta; sin motivo solo el estado). Una cuenta rechazada puede aprobarse después y entonces el motivo desaparece (H-037). Aprobar o rechazar dos veces o desde una lista vieja da el error `CUENTA_NO_PENDIENTE`.

- Al primer ingreso la persona completa nombre, teléfono/WhatsApp, fecha de nacimiento y «cómo llegó» (obligatorio); con Google, nombre y mail vienen precargados (ALU-02, WEB-03). Sin ficha completa solo ve la ficha.
- Con la ficha completa queda **pendiente** hasta que el profesor la apruebe o rechace. Pendiente o rechazada: puede ver el calendario y su estado, pero toda solicitud se rechaza (ALU-03). Una cuenta rechazada sigue rechazada hasta que el profesor la reabra (DEC-01). El umbral de edad es 18 años y la ficha de un menor se acepta, queda pendiente y el profesor decide (DEC-02, cerrada el 2026-10-21; coincide con el diseño, sin texto nuevo en la spec).
- **Motivo de rechazo visible (CR-001, DEC-22, ALU-03, WEB-03, WEB-05, CA-45):** si el profesor escribió un motivo al rechazar la cuenta, la persona lo ve en su ficha y en Mis clases, además de recibirlo por mail (AVI-03). Sin motivo, ve solo el estado. El texto se muestra como texto, no como HTML. Es texto libre del profesor y puede contener datos personales: solo lo ve esa cuenta y se borra con la retención (ALU-10).
- **Tope de fichas (CR-001, DEC-12, ALU-13, CA-43):** entre todas las cuentas nuevas se aceptan como máximo **10 fichas completadas por hora**; la ficha 11 se rechaza con un mensaje de intentar más tarde y no crea la cuenta (error `LIMITE_EXCEDIDO`, 429). Pasada la hora se acepta.
- El profesor ve una lista de alumnos con estado, ficha y edad calculada (ALU-09).

## Personas a cargo
**Construido (B04, WEB-03).** Se cargan después de completar la ficha y aparecen en la ficha del titular; solo se registran y editan, no hay baja. Sin ficha completa la operación se rechaza (`FICHA_INCOMPLETA`).

El titular registra y edita personas a cargo (nombre, fecha de nacimiento), por ejemplo hijos menores; no inician sesión y cada reserva indica quién toma la clase (ALU-06, RES-03).

## Alta por el profesor y unión
**Construido (B05, verificado en WEB-07).** En la lista del profesor, «Agregar alumno» crea un alumno con o sin mail; sin mail avisa «No podrá ingresar ni recibirá mails.». «Editar» cambia los datos; el mail no se puede cambiar en una cuenta que ya ingresó, y un mail ya usado por otro alumno o por el profesor da `MAIL_YA_REGISTRADO`. Al aprobar una cuenta con un alumno sin cuenta con el mismo teléfono se abre «Posible alumno repetido» con las dos fichas lado a lado: «Unir cuentas» pasa las clases a la cuenta; «No unir» deja todo igual y no vuelve a sugerir; «Decidir después» cierra el diálogo. La lista de alumnos muestra estado y edad calculada con la fecha de la aplicación en el huso del profesor (una alumna nacida el 2000-10-21 tiene 26 años el 2026-10-21 y 25 la víspera; ALU-09); no lista fichas incompletas ni borrados.

- Con mail: crea una cuenta ya aprobada; la persona entra con ese mail. Sin mail: alumno sin cuenta, que no ingresa ni recibe mails (ALU-07, ALU-08).
- Al aprobar una cuenta cuyo teléfono normalizado coincide con el de un alumno sin cuenta, el sistema sugiere unirlos; el profesor confirma o descarta y lo descartado no vuelve. Ejemplo (CA-04): el alumno sin cuenta con teléfono «099 123-456» y la cuenta que se registra con «+598 99123456» se sugieren como la misma persona. Al confirmar, clases, solicitudes e historial pasan a la cuenta (ALU-04, ALU-05, DEC-03).

## Retención de datos
- A los 6 meses de la última clase (sin clases futuras), o del registro de una cuenta nunca aprobada, se borran los datos personales, el motivo de rechazo y las personas a cargo; las clases pasadas quedan sin datos de la persona (ALU-10). El diseño anonimiza en lugar de borrar (ADR-011); un alumno anonimizado pierde también los motivos de rechazo y los mails registrados.
- Cada inicio de sesión reinicia el plazo (ALU-11). Siete días antes se avisa por mail al titular (AVI-06).
- El profesor puede borrar un alumno en cualquier momento; sus clases futuras se cancelan y liberan los huecos (ALU-12, DEC-05).

## Bitácora de versiones

| Versión | Fecha | Bolt | IDs | Cambio |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-10-21 | inception | ALU-01..12, WEB-02/03, AVI-06 | Primera versión |
| 0.2 | 2026-10-21 | inception | ALU-01, ALU-04, ALU-10, CA-04, ADR-007, ADR-011 | Vigencia del código (600 s), asignación de rol, ejemplo de unión, alcance de la anonimización |
| 0.3 | 2026-10-21 | construcción (hito spikes S01-S03 y CR-001) | CR-001, ALU-03, ALU-10, ALU-13, WEB-02, WEB-03, WEB-05, CA-43, CA-44, CA-45, DEC-01, DEC-02, DEC-13, DEC-22, ADR-007 | CAPTCHA en el pedido de código, motivo de rechazo visible, tope de fichas, DEC-01/02 cerradas, errores del código tras S02 |
| 0.4 | 2026-10-22 | B04, B05 | ALU-01..09, ALU-13, AVI-02, AVI-03, CA-01, CA-02, CA-04, CA-05, CA-43, CA-44, CA-45, WEB-02, WEB-03, WEB-07 | Ingreso, CAPTCHA, ficha, tope de fichas, personas a cargo, aprobación, rechazo con motivo, unión y alta marcados como construidos y verificados |
