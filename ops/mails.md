# Mails: función `enviar-mail` y SMTP de Auth (ADR-012, H-018)

Dos caminos, ambos con la cuenta Gmail dedicada (`agendaclasesapp@gmail.com`).
- Auth (códigos OTP y confirmación): SMTP de Gmail cargado en el panel (Auth > SMTP); no va en `config.toml`.
  El límite `rate_limit.email_sent` se fija y verifica en el panel (`auth.md`).
- Recordatorios y avisos: Edge Function `enviar-mail` (Gmail 465, se activa en B03), desplegada con
  `--no-verify-jwt --use-api` y protegida por `MAIL_SECRETO`.

## Secretos de la función (solo en Supabase)
`GMAIL_USER`, `GMAIL_APP_PASSWORD` (sin espacios), `MAIL_SECRETO`.

    npx supabase@2.121.0 secrets set GMAIL_USER=<...> --project-ref rmokypmznhobapyghfpi
    npx supabase@2.121.0 secrets list --project-ref rmokypmznhobapyghfpi
    printf %s "<valor>" | sha256sum      # debe igualar el digest de secrets list

supabase-deploy solo hace `secrets list` y falla si falta un nombre; nunca los carga.

## Vault de producción
`url_funcion_mail` y `mail_secreto` se cargan a mano en el SQL Editor (nunca por migración ni `seed.sql`).

## Pasos del humano para producción (B03, T03.3; AVI-07, SEC-11, SEC-30, H-018, H-019)
Nada de esto lo ejecuta el pipeline ni un agente. Proyecto `rmokypmznhobapyghfpi`, casilla de DEC-15.

1. **Contraseña de aplicación (H-018).** En la cuenta de Google de la casilla: Seguridad > Contraseñas de
   aplicación. Debe quedar **una sola** vigente: revocá las anteriores (la del spike incluida) y creá una nueva.
   Google la muestra en bloques de 4 con espacios: quitalos (16 letras seguidas).
2. **Nuevo `MAIL_SECRETO`.** El de S01 estuvo en la máquina de desarrollo: no se reutiliza. Generá uno de 32 bytes
   aleatorios (`openssl rand -hex 32`); el mismo valor va en el paso 3 y en el Vault (paso 5).
3. **Secretos de Edge Functions** (sin espacios ni comillas; no los pegues en archivos ni en el historial del shell
   compartido):

        npx supabase@2.121.0 secrets set GMAIL_USER=<casilla> --project-ref rmokypmznhobapyghfpi
        npx supabase@2.121.0 secrets set GMAIL_APP_PASSWORD=<16 letras sin espacios> --project-ref rmokypmznhobapyghfpi
        npx supabase@2.121.0 secrets set MAIL_SECRETO=<valor del paso 2> --project-ref rmokypmznhobapyghfpi
        npx supabase@2.121.0 secrets set SMTP_HOST=smtp.gmail.com SMTP_PORT=465 SMTP_TLS=true --project-ref rmokypmznhobapyghfpi

4. **Verificar por digest, sin ver los valores.** `secrets list` muestra el SHA-256 de cada uno; tiene que igualar
   el de lo que cargaste:

        npx supabase@2.121.0 secrets list --project-ref rmokypmznhobapyghfpi
        printf %s "<valor>" | sha256sum

   Si `GMAIL_APP_PASSWORD` no coincide, tiene espacios o un salto de línea: volvé a cargarla (`printf %s`, no `echo`).
5. **Vault** (SQL Editor; nunca por migración ni `seed.sql`):

        select vault.create_secret('https://rmokypmznhobapyghfpi.supabase.co/functions/v1/enviar-mail', 'url_funcion_mail');
        select vault.create_secret('<valor del paso 2>', 'mail_secreto');

   Si ya existen, `vault.update_secret(id, nuevo_valor)` (el id sale de `select id, name from vault.secrets`).
6. **Función (H-019).** En el proyecto sigue la función `enviar-mail` del spike S01 con otro código y
   `clave_invalida`/`entorno`: reemplazala o, para estar seguro, borrala antes:

        npx supabase@2.121.0 functions delete enviar-mail --project-ref rmokypmznhobapyghfpi   # opcional, antes
        npx supabase@2.121.0 functions deploy enviar-mail --no-verify-jwt --use-api --project-ref rmokypmznhobapyghfpi

   `verify_jwt` desactivado (la llama `pg_net` con el secreto, sin JWT; es la única función así, SEC-30). Comprobá en
   el panel (Edge Functions > enviar-mail > Details) que *Verify JWT* está apagado y que la fecha de despliegue es de hoy.
7. **Rotación de `MAIL_SECRETO`** (también ante sospecha de filtración): repetir los pasos 2, 3 (solo
   `MAIL_SECRETO`), 4 y 5 con `vault.update_secret`. Entre un paso y otro la función responde 401 y los mails
   quedan `pendiente`; el barrido (`barrer_mails`) los reintenta.
8. **Prueba de humo.** Encolá un mail de prueba desde la app y comprobá que llega con la casilla como remitente;
   con una contraseña inválida la fila queda `fallido` con motivo y se ve en «Mails fallidos» (CA-33, CA-34).

## Cuota compartida y topes (AVI-07, AVI-08, ADR-019, CR-002)
La casilla de Gmail es **una sola** y la comparten todos los profesores y los códigos de ingreso de Auth. Quién figura
como remitente: los mails de un profesor a su alumno llevan su nombre y responden a su mail (Reply-To); los avisos al
profesor, los de borrado y los códigos muestran el nombre del servicio, `Agenda Clases App` (WEB-12, CR-003).
- Tope por profesor: 20 por hora y 200 por día (`tope_mails_hora`, `tope_mails_dia` en `privado.ajustes`).
- Tope global: 400 por día (`tope_mails_dia_global`), con margen bajo los ~500 de Gmail porque los códigos de Auth no
  pasan por `mail_salida`. Se cambia en el SQL Editor: `update privado.ajustes set tope_mails_dia_global = <n>;`.
- Un mail que supera un tope no se envía: la fila nace `fallido` con motivo `TOPE` (profesor) o `TOPE_GLOBAL`, y se ve en
  «Mails fallidos»; esas filas no cuentan para el tope. Si aparece `TOPE_GLOBAL`, esperar 24 h y revisar si un
  profesor genera volumen anormal.
- **Nombre del remitente de Auth** (panel, a mano, **antes de desplegar B14**): en el proyecto de producción,
  Authentication > SMTP Settings > *Sender name* = `Agenda Clases App` y *Save*. Hasta hacerlo, los códigos de
  ingreso siguen saliendo con el nombre anterior mientras los mails de `enviar-mail` ya dicen `Agenda Clases App`.
  Comprobación: pedir un código de ingreso y mirar el remitente visible (CA-65). Además,
  `scripts/seguridad/verificar-auth.mjs` (paso final de `supabase-deploy.yml`) falla si `smtp_sender_name` no es
  `Agenda Clases App` (H-290).
  No va por `config.toml` en producción: declarar `[auth.email.smtp]` haría que `config push` pisara el SMTP del panel y
  la guardia lo bloquearía. En `config.toml` solo está `[local_smtp] sender_name` (Mailpit local).

## Local y CI
Mailpit/Inbucket recibe todo; `MAIL_SECRETO` de prueba en `supabase/.env.development`. Nada sale a Gmail.

## Fallos frecuentes
- `535` de Gmail: contraseña de aplicación revocada o con espacios; rota (`rotacion.md`).
- 401 de la función: `MAIL_SECRETO` distinto entre función y Vault.
- Límite diario de Gmail agotado: espera 24 h y reduce reintentos.
