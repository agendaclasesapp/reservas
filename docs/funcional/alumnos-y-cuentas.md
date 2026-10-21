---
titulo: Funcional · Alumnos y cuentas
version: 0.2
fecha: 2026-10-21
publico: negocio y equipo
---
# Alumnos y cuentas

> Describe el comportamiento **diseñado** (catálogo v1.0); nada está construido ni verificado todavía.

## Ingreso
Se entra con Google o con un código de 6 dígitos enviado por mail; no hay contraseñas (ALU-01, WEB-02). Un código incorrecto o vencido muestra error. El diseño fija la vigencia del código en 600 segundos (10 minutos; `contratos.md` §5); la spec no la define y DEC-11 sigue abierta con otra opción por defecto (Supabase Auth, cerca de 1 hora), por lo que se consulta a su dueño. El rol (alumno o profesor) y el vínculo con la ficha de alumno o profesor se asignan solo con el mail ya confirmado (ADR-007). Ejemplo de prueba: un código llega a `alumno1@example.test`.

## Ficha y aprobación
- Al primer ingreso la persona completa nombre, teléfono/WhatsApp, fecha de nacimiento y «cómo llegó» (obligatorio); con Google, nombre y mail vienen precargados (ALU-02, WEB-03). Sin ficha completa solo ve la ficha.
- Con la ficha completa queda **pendiente** hasta que el profesor la apruebe o rechace. Pendiente o rechazada: puede ver el calendario y su estado, pero toda solicitud se rechaza (ALU-03). Qué puede hacer una cuenta rechazada y qué edad define «adulto» están abiertos (DEC-01, DEC-02).
- El profesor ve una lista de alumnos con estado, ficha y edad calculada (ALU-09).

## Personas a cargo
El titular registra y edita personas a cargo (nombre, fecha de nacimiento), por ejemplo hijos menores; no inician sesión y cada reserva indica quién toma la clase (ALU-06, RES-03).

## Alta por el profesor y unión
- Con mail: crea una cuenta ya aprobada; la persona entra con ese mail. Sin mail: alumno sin cuenta, que no ingresa ni recibe mails (ALU-07, ALU-08).
- Al aprobar una cuenta cuyo teléfono normalizado coincide con el de un alumno sin cuenta, el sistema sugiere unirlos; el profesor confirma o descarta y lo descartado no vuelve. Ejemplo (CA-04): el alumno sin cuenta con teléfono «099 123-456» y la cuenta que se registra con «+598 99123456» se sugieren como la misma persona. Al confirmar, clases, solicitudes e historial pasan a la cuenta (ALU-04, ALU-05, DEC-03).

## Retención de datos
- A los 6 meses de la última clase (sin clases futuras), o del registro de una cuenta nunca aprobada, se borran los datos personales y las personas a cargo; las clases pasadas quedan sin datos de la persona (ALU-10). El diseño anonimiza en lugar de borrar (ADR-011); un alumno anonimizado pierde también los motivos de rechazo y los mails registrados.
- Cada inicio de sesión reinicia el plazo (ALU-11). Siete días antes se avisa por mail al titular (AVI-06).
- El profesor puede borrar un alumno en cualquier momento; sus clases futuras se cancelan y liberan los huecos (ALU-12, DEC-05).

## Bitácora de versiones

| Versión | Fecha | Bolt | IDs | Cambio |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-10-21 | inception | ALU-01..12, WEB-02/03, AVI-06 | Primera versión |
| 0.2 | 2026-10-21 | inception | ALU-01, ALU-04, ALU-10, CA-04, ADR-007, ADR-011 | Vigencia del código (600 s), asignación de rol, ejemplo de unión, alcance de la anonimización |
