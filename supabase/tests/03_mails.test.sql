-- B03 · T03.4 · pgTAP de mails salientes (adaptado a B14: encolar_mail con profesor, dos profesores en la RLS) (AVI-07, AVI-08, NFR-07, CA-34 rama de registro, CA-42, SEC-01, SEC-03,
-- SEC-04, SEC-10, SEC-11, SEC-17, SEC-28, H-011, H-017; casos T-NFR-13 y la parte de base de T-AVI-10).
-- `mail_salida`, `privado.encolar_mail` (saneo, alumno_id, tope por ventana móvil con reloj fijo), trigger de
-- disparo solo para `pendiente` (se mira `net.http_request_queue` dentro de la misma transacción),
-- `privado.barrer_mails` y `cron.job`. Datos sintéticos (@example.test). Todo se deshace con el rollback:
-- pg_net no llega a llamar a la función.
begin;
select plan(85);

-- Aislamiento: sin filas previas de mails (el rollback las devuelve) y reloj fijo: lunes 2026-11-02 12:00 -03.
delete from public.mail_salida;
update privado.reloj_prueba set ahora = '2026-11-02 15:00:00+00';
create function pg_temp.fila(p_id uuid) returns public.mail_salida language sql volatile as $f$ select * from public.mail_salida where id = p_id $f$;

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', 'a3000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'pgtap3.profesor@example.test', now(), now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a3000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'pgtap3.alumno@example.test', now(), now(), now(), '', '', '', '');
-- Dos profesores por las funciones del operador (ADR-018). El A vincula al usuario de arriba; el B tiene su propio usuario
-- más abajo (RLS por profesor del registro de mails).
select set_config('rtc.pa', privado.configurar_profesor('pgtap3.profesor@example.test', 'Profesor pgTAP 3', 'pgtap3-uno')::text, true) is not null as _;
select set_config('rtc.pb', privado.configurar_profesor('pgtap3.profesor.b@example.test', 'Profesora B pgTAP 3', 'pgtap3-dos')::text, true) is not null as _;

-- Personas sin cuenta de Auth (no dependen del disparador de ingreso de B04). Una persona «sin cuenta» es la que el
-- profesor cargó sin mail (DEC-29 b): no hay a quién escribir.
insert into public.alumno (id, estado, nombre, mail, ficha_completada_en) values
  ('b3000000-0000-0000-0000-0000000000a1', 'completa', 'Centinela Aprobado', 'pgtap3.aprobado@example.test', now()),
  ('b3000000-0000-0000-0000-0000000000a2', 'completa', 'Centinela SinCuenta', null, now()),
  ('b3000000-0000-0000-0000-0000000000a3', 'borrado', 'Centinela Borrado', 'pgtap3.borrado@example.test', now()),
  ('b3000000-0000-0000-0000-0000000000a4', 'completa', 'Centinela SinMail', null, now());
insert into public.inscripcion (alumno_id, profesor_id, estado, aprobado_en) values
  ('b3000000-0000-0000-0000-0000000000a1', current_setting('rtc.pa')::uuid, 'aprobado', now()),
  ('b3000000-0000-0000-0000-0000000000a2', current_setting('rtc.pa')::uuid, 'sin_cuenta', null),
  ('b3000000-0000-0000-0000-0000000000a3', current_setting('rtc.pa')::uuid, 'baja', null),
  ('b3000000-0000-0000-0000-0000000000a4', current_setting('rtc.pa')::uuid, 'pendiente', null);

-- A. Estructura y permisos (SEC-01, SEC-03, SEC-04) -----------------------------------------------------------
select has_table('public', 'mail_salida', 'AVI-07: existe public.mail_salida');
select has_view('public', 'v_mails_fallidos', 'NFR-07: existe v_mails_fallidos');
select ok((select relrowsecurity from pg_class where oid = 'public.mail_salida'::regclass), 'SEC-01: mail_salida tiene RLS');
select is((select count(*)::int from cron.job where jobname = 'barrer_mails' and schedule = '*/5 * * * *'
            and command = 'select privado.barrer_mails()'), 1, 'SEC-28: barrer_mails está en cron.job cada 5 minutos');
select is((select count(*)::int from information_schema.triggers where event_object_table = 'mail_salida'
            and trigger_name = 'mail_salida_disparo' and action_condition like '%pendiente%'), 1,
  'AVI-08: el trigger de disparo solo mira filas pendiente');
select is(has_function_privilege('anon', 'privado.encolar_mail(text,uuid,uuid,text,text,text)', 'execute')
       or has_function_privilege('authenticated', 'privado.encolar_mail(text,uuid,uuid,text,text,text)', 'execute')
       or has_function_privilege('service_role', 'privado.encolar_mail(text,uuid,uuid,text,text,text)', 'execute'), false,
  'SEC-04: encolar_mail no es ejecutable por roles de la API');
select is(has_function_privilege('anon', 'privado.barrer_mails(timestamptz)', 'execute')
       or has_function_privilege('authenticated', 'privado.barrer_mails(timestamptz)', 'execute')
       or has_function_privilege('service_role', 'privado.barrer_mails(timestamptz)', 'execute'), false,
  'SEC-28: barrer_mails no es ejecutable por roles de la API');
select is(has_function_privilege('anon', 'privado.disparar_mail(uuid[])', 'execute')
       or has_function_privilege('authenticated', 'privado.disparar_mail(uuid[])', 'execute')
       or has_function_privilege('service_role', 'privado.disparar_mail(uuid[])', 'execute'), false,
  'SEC-11: disparar_mail no es ejecutable por roles de la API');
select is(has_table_privilege('service_role', 'public.mail_salida', 'insert')
       or has_table_privilege('service_role', 'public.mail_salida', 'delete'), false,
  'H-011: service_role no inserta ni borra en mail_salida');
select is(has_column_privilege('service_role', 'public.mail_salida', 'destinatario', 'update')
       or has_column_privilege('service_role', 'public.mail_salida', 'cuerpo_texto', 'update'), false,
  'H-011: service_role no cambia destinatario ni cuerpo');
select is(has_column_privilege('service_role', 'public.mail_salida', 'estado', 'update')
      and has_column_privilege('service_role', 'public.mail_salida', 'motivo_fallo', 'update'), true,
  'H-011: service_role actualiza estado y motivo_fallo');
select is(has_column_privilege('authenticated', 'public.mail_salida', 'asunto', 'select')
       or has_column_privilege('authenticated', 'public.mail_salida', 'cuerpo_texto', 'select'), false,
  'SEC-03: authenticated no lee asunto ni cuerpo');
select is(has_table_privilege('anon', 'public.mail_salida', 'select') or has_table_privilege('anon', 'public.v_mails_fallidos', 'select'), false,
  'SEC-01: anon no lee mails ni el registro');

-- B. encolar_mail: saneo (SEC-11, NFR-07) ----------------------------------------------------------------------
select set_config('rtc.id1', privado.encolar_mail('cuenta_nueva', current_setting('rtc.pa')::uuid, null, 'pgtap3.dest@example.test', E'Hola\r\nBcc: x@example.test', 'cuerpo uno')::text, true) is not null as _;
select is((select asunto from public.mail_salida where id = current_setting('rtc.id1')::uuid), 'Hola Bcc: x@example.test',
  'SEC-11: el CR/LF del asunto se cambia por espacio');
select is((select asunto ~ '[\r\n]' from public.mail_salida where id = current_setting('rtc.id1')::uuid), false, 'SEC-11: el asunto guardado no tiene CR ni LF');
select is((select estado from public.mail_salida where id = current_setting('rtc.id1')::uuid), 'pendiente', 'AVI-07: el mail encolado nace pendiente');
select is((select profesor_id from public.mail_salida where id = current_setting('rtc.id1')::uuid), current_setting('rtc.pa')::uuid, 'AVI-07: el mail queda del profesor');
select is((select creado_en from public.mail_salida where id = current_setting('rtc.id1')::uuid), '2026-11-02 15:00:00+00'::timestamptz, 'ADR-014: creado_en sale de app_ahora()');
select is(length((select asunto from pg_temp.fila(privado.encolar_mail('recordatorio', current_setting('rtc.pa')::uuid, null, 'pgtap3.largo@example.test', repeat('a', 300), 'c')))), 200, 'SEC-11: el asunto se corta a 200');
select is((select asunto from pg_temp.fila(privado.encolar_mail('recordatorio', current_setting('rtc.pa')::uuid, null, 'pgtap3.sep@example.test', E'uno dos\u0085tres\u0007fin', 'c'))),
  'uno dos tres fin', 'SEC-11: separadores Unicode y controles C0/C1 se cambian por espacio');
-- H-141 (NFR-07): un destinatario inválido no revierte la operación: la fila nace fallido DESTINATARIO_INVALIDO.
select is((select estado || '/' || motivo_fallo || '/' || (destinatario ~ '[\r\n]')::text
             from pg_temp.fila(privado.encolar_mail('cuenta_nueva', current_setting('rtc.pa')::uuid, null, E'pgtap3.crlf@example.test\r\nBcc: b@example.test', 'x', 'c'))),
  'fallido/DESTINATARIO_INVALIDO/false', 'H-141_SEC-11: un destinatario con CR/LF nace fallido DESTINATARIO_INVALIDO y sin CR ni LF');
select set_config('rtc.idinv', privado.encolar_mail('cuenta_nueva', current_setting('rtc.pa')::uuid, null, 'pgtap3.dos@example.test, c@example.test', 'x', 'c')::text, true) is not null as _;
select is((select estado || '/' || motivo_fallo from public.mail_salida where id = current_setting('rtc.idinv')::uuid), 'fallido/DESTINATARIO_INVALIDO',
  'H-141_SEC-11: un destinatario con dos direcciones devuelve id y nace fallido DESTINATARIO_INVALIDO');
select is((select count(*)::int from net.http_request_queue q where convert_from(q.body, 'UTF8')::jsonb = jsonb_build_object('ids', jsonb_build_array(current_setting('rtc.idinv')))), 0,
  'H-141: la fila DESTINATARIO_INVALIDO no llama a la función');
select is((select count(*)::int from public.v_mails_fallidos where id = current_setting('rtc.idinv')::uuid and motivo = 'DESTINATARIO_INVALIDO'
             and destinatario = 'pgtap3.dos@example.test, c@example.test'), 1,
  'H-141_NFR-07: la fila DESTINATARIO_INVALIDO figura en el registro de fallidos con su destinatario');
select is((select motivo_fallo from pg_temp.fila(privado.encolar_mail('cuenta_nueva', current_setting('rtc.pa')::uuid, null, 'sin-arroba', 'x', 'c'))), 'DESTINATARIO_INVALIDO',
  'H-141_NFR-07: un destinatario que no es mail nace fallido DESTINATARIO_INVALIDO');
select is((select length(destinatario) || '/' || motivo_fallo from pg_temp.fila(privado.encolar_mail('cuenta_nueva', current_setting('rtc.pa')::uuid, null, repeat('a', 300) || '@example.test', 'x', 'c'))),
  '254/DESTINATARIO_INVALIDO', 'H-141: un destinatario de más de 254 se corta a 254 y nace DESTINATARIO_INVALIDO');
select is(array[privado.es_mail_simple('a@b.uy'), privado.es_mail_simple('a@b.uy, c@d.uy'), privado.es_mail_simple('Nombre <a@b.uy>'),
                privado.es_mail_simple('a@b'), privado.es_mail_simple(null), privado.es_mail_simple(repeat('a', 250) || '@b.uy')],
  array[true, false, false, false, false, false], 'H-141: privado.es_mail_simple acepta una sola dirección simple de hasta 254');
select is(has_function_privilege('authenticated', 'privado.es_mail_simple(text)', 'execute') or has_function_privilege('anon', 'privado.es_mail_simple(text)', 'execute'), false,
  'H-141_SEC-04: ni anon ni authenticated ejecutan privado.es_mail_simple');
select throws_ok($$select privado.encolar_mail('cuenta_nueva', current_setting('rtc.pa')::uuid, null, 'a@example.test', E' \r\n ', 'c')$$, 'PT422', 'DATOS_INVALIDOS', 'SEC-11: un asunto vacío tras sanear se rechaza');
select throws_ok($$select privado.encolar_mail('tipo_raro', current_setting('rtc.pa')::uuid, null, 'a@example.test', 'x', 'c')$$, 'PT422', 'DATOS_INVALIDOS', 'NFR-07: un tipo fuera del catálogo se rechaza');
select throws_ok($$select privado.encolar_mail('cuenta_nueva', current_setting('rtc.pa')::uuid, null, null, 'x', 'c')$$, 'PT422', 'DATOS_INVALIDOS', 'NFR-07: sin alumno ni destinatario se rechaza');

-- C. alumno_id y titular (AVI-04) ------------------------------------------------------------------------------
select is((select destinatario from pg_temp.fila(privado.encolar_mail('clase_creada', current_setting('rtc.pa')::uuid, 'b3000000-0000-0000-0000-0000000000a1', null, 'x', 'c'))),
  'pgtap3.aprobado@example.test', 'AVI-04: sin destinatario, el mail va al titular del alumno');
select is((select alumno_id from public.mail_salida where destinatario = 'pgtap3.aprobado@example.test' limit 1),
  'b3000000-0000-0000-0000-0000000000a1'::uuid, 'ADR-011: el mail que nombra a un alumno lleva su alumno_id');
select is((select alumno_id from pg_temp.fila(privado.encolar_mail('solicitud_nueva', current_setting('rtc.pa')::uuid, 'b3000000-0000-0000-0000-0000000000a1', 'pgtap3.prof@example.test', 'x', 'c'))),
  'b3000000-0000-0000-0000-0000000000a1'::uuid, 'ADR-011: al mail del profesor sobre un alumno se le guarda el alumno_id');
select is(privado.encolar_mail('clase_creada', current_setting('rtc.pa')::uuid, 'b3000000-0000-0000-0000-0000000000a2', null, 'x', 'c'), null, 'AVI-04: alumno sin cuenta, no se encola');
select is(privado.encolar_mail('clase_creada', current_setting('rtc.pa')::uuid, 'b3000000-0000-0000-0000-0000000000a3', null, 'x', 'c'), null, 'AVI-04: alumno borrado, no se encola');
select is(privado.encolar_mail('clase_creada', current_setting('rtc.pa')::uuid, 'b3000000-0000-0000-0000-0000000000a4', null, 'x', 'c'), null, 'AVI-04: alumno sin mail, no se encola');
select is((select count(*)::int from public.mail_salida where alumno_id in ('b3000000-0000-0000-0000-0000000000a2', 'b3000000-0000-0000-0000-0000000000a3', 'b3000000-0000-0000-0000-0000000000a4')
              or destinatario = 'pgtap3.borrado@example.test'), 0, 'AVI-04: ninguna fila para la persona sin cuenta (sin mail), borrada o sin mail');
select throws_ok($$select privado.encolar_mail('clase_creada', current_setting('rtc.pa')::uuid, 'b3999999-0000-0000-0000-000000000000', null, 'x', 'c')$$, 'PT404', 'NO_ENCONTRADO', 'NFR-07: un alumno inexistente es NO_ENCONTRADO');

-- D. Disparo solo para pendiente (AVI-08) ----------------------------------------------------------------------
select is((select count(*)::int from net.http_request_queue q where convert_from(q.body, 'UTF8')::jsonb = jsonb_build_object('ids', jsonb_build_array(current_setting('rtc.id1')))), 1,
  'AVI-07: la fila pendiente deja una llamada en la cola de pg_net con solo ids');
-- H-270: `Bcc` como palabra entera; sin \m..\M el patrón coincidía con un uuid al azar que contuviera «bcc» (flaky, ~1 de cada 50).
select is((select count(*)::int from net.http_request_queue q where convert_from(q.body, 'UTF8') ~* 'pgtap3|\mbcc\M|cuerpo'), 0,
  'SEC-17: la cola de pg_net no lleva destinatario, asunto ni cuerpo');

-- E. Tope por hora (CA-42, AVI-08) -----------------------------------------------------------------------------
delete from public.mail_salida;
select privado.encolar_mail('recordatorio', current_setting('rtc.pa')::uuid, null, 'pgtap3.inv-antes', 'tope', 'c') is not null as _;
select is((select count(*)::int from generate_series(1, 20) g, lateral privado.encolar_mail('recordatorio', current_setting('rtc.pa')::uuid, null, 'pgtap3.t' || g || '@example.test', 'tope', 'c') x where x is not null), 20,
  'CA-42: 20 mails en la hora se encolan');
select is((select count(*)::int from public.mail_salida where estado = 'pendiente'), 20, 'CA-42_H-141: los 20 primeros quedan pendiente (la fila DESTINATARIO_INVALIDO previa no cuenta)');
select set_config('rtc.id21', privado.encolar_mail('recordatorio', current_setting('rtc.pa')::uuid, null, 'pgtap3.t21@example.test', 'tope', 'c')::text, true) is not null as _;
select is((select estado || '/' || motivo_fallo from public.mail_salida where id = current_setting('rtc.id21')::uuid), 'fallido/TOPE', 'CA-42: el mail 21 nace fallido con motivo TOPE');
select is((select count(*)::int from net.http_request_queue q where convert_from(q.body, 'UTF8')::jsonb = jsonb_build_object('ids', jsonb_build_array(current_setting('rtc.id21')))), 0,
  'CA-42: el mail 21 no llama a la función');
select is((select count(*)::int from public.v_mails_fallidos where motivo = 'TOPE' and destinatario = 'pgtap3.t21@example.test'), 1, 'NFR-07: el mail TOPE figura en el registro de fallidos');
select is((select count(*)::int from public.mail_salida where creado_en = '2026-11-02 15:00:00+00' and estado = 'fallido' and motivo_fallo = 'TOPE' and destinatario = 'pgtap3.t21@example.test'),
  1, 'CA-42: la fila TOPE conserva su fecha y destinatario');
select privado.encolar_mail('recordatorio', current_setting('rtc.pa')::uuid, null, 'pgtap3.t22@example.test', 'tope', 'c') is not null as _;
select is((select motivo_fallo from pg_temp.fila(privado.encolar_mail('recordatorio', current_setting('rtc.pa')::uuid, null, 'pgtap3.inv-despues', 'tope', 'c'))), 'DESTINATARIO_INVALIDO',
  'H-141: sobre el tope, un destinatario inválido sigue siendo DESTINATARIO_INVALIDO y no TOPE');
update privado.reloj_prueba set ahora = '2026-11-02 15:59:00+00';
select is((select motivo_fallo from pg_temp.fila(privado.encolar_mail('recordatorio', current_setting('rtc.pa')::uuid, null, 'pgtap3.t59@example.test', 'tope', 'c'))), 'TOPE',
  'AVI-08: a los 59 min la ventana todavía tiene 20 (las filas TOPE no cuentan)');
update privado.reloj_prueba set ahora = '2026-11-02 16:00:01+00';
select is((select estado from pg_temp.fila(privado.encolar_mail('recordatorio', current_setting('rtc.pa')::uuid, null, 'pgtap3.t60@example.test', 'tope', 'c'))), 'pendiente',
  'AVI-08: pasada la hora vuelve a encolar, y las filas TOPE no cuentan');
select is((select count(*)::int from public.mail_salida where motivo_fallo = 'TOPE'), 3, 'AVI-08: las tres filas TOPE quedan en el registro');

-- F. Tope por día y qué cuenta (CA-42, AVI-08) -----------------------------------------------------------------
delete from public.mail_salida;
update privado.reloj_prueba set ahora = '2026-11-10 15:00:00+00';
insert into public.mail_salida (profesor_id, tipo, destinatario, asunto, cuerpo_texto, estado, creado_en)
  select current_setting('rtc.pa')::uuid, 'recordatorio', 'pgtap3.d' || g || '@example.test', 'dia', 'c', 'enviado', '2026-11-10 12:00:00+00'::timestamptz - (g || ' seconds')::interval
    from generate_series(1, 199) g;
select is((select estado from pg_temp.fila(privado.encolar_mail('recordatorio', current_setting('rtc.pa')::uuid, null, 'pgtap3.d200@example.test', 'dia', 'c'))), 'pendiente',
  'CA-42: con 199 en 24 h el mail 200 pasa');
select is((select motivo_fallo from pg_temp.fila(privado.encolar_mail('recordatorio', current_setting('rtc.pa')::uuid, null, 'pgtap3.d201@example.test', 'dia', 'c'))), 'TOPE',
  'CA-42: con 200 en 24 h el mail 201 nace fallido TOPE');
select is((select count(*)::int from net.http_request_queue q where convert_from(q.body, 'UTF8')::jsonb = jsonb_build_object('ids', jsonb_build_array((select id::text from public.mail_salida where destinatario = 'pgtap3.d201@example.test')))), 0,
  'CA-42: el mail sobre el tope diario no llama a la función');
update privado.reloj_prueba set ahora = '2026-11-11 12:00:01+00';
select is((select estado from pg_temp.fila(privado.encolar_mail('recordatorio', current_setting('rtc.pa')::uuid, null, 'pgtap3.d202@example.test', 'dia', 'c'))), 'pendiente',
  'AVI-08: pasadas las 24 h de los 199 vuelve a encolar');
-- Un fallo que no es TOPE sí cuenta.
delete from public.mail_salida;
update privado.reloj_prueba set ahora = '2026-11-02 15:00:00+00';
insert into public.mail_salida (profesor_id, tipo, destinatario, asunto, cuerpo_texto, estado, motivo_fallo, creado_en)
  select current_setting('rtc.pa')::uuid, 'recordatorio', 'pgtap3.f' || g || '@example.test', 'f', 'c', case when g <= 19 then 'enviado' else 'fallido' end,
         case when g <= 19 then null else '535 Invalid login' end, '2026-11-02 14:30:00+00'
    from generate_series(1, 20) g;
select is((select motivo_fallo from pg_temp.fila(privado.encolar_mail('recordatorio', current_setting('rtc.pa')::uuid, null, 'pgtap3.f21@example.test', 'f', 'c'))), 'TOPE',
  'AVI-08: un mail fallido por otra causa cuenta para el tope');

-- G. Tiempos del ciclo y barrido (H-017, SEC-28) -----------------------------------------------------------------
delete from public.mail_salida;
select set_config('rtc.idt', privado.encolar_mail('cuenta_nueva', current_setting('rtc.pa')::uuid, null, 'pgtap3.tiempos@example.test', 'tiempos', 'c')::text, true) is not null as _;
update public.mail_salida set estado = 'enviando' where id = current_setting('rtc.idt')::uuid;
select is((select intentado_en from public.mail_salida where id = current_setting('rtc.idt')::uuid), '2026-11-02 15:00:00+00'::timestamptz, 'H-017: reclamar fija intentado_en con app_ahora()');
update public.mail_salida set estado = 'fallido', motivo_fallo = repeat('m', 900) where id = current_setting('rtc.idt')::uuid;
select is(length((select motivo_fallo from public.mail_salida where id = current_setting('rtc.idt')::uuid)), 500, 'NFR-07: el motivo se corta a 500');
delete from public.mail_salida;
insert into public.mail_salida (id, profesor_id, tipo, destinatario, asunto, cuerpo_texto, estado, creado_en, intentado_en) values
  ('c3000000-0000-0000-0000-000000000001', current_setting('rtc.pa')::uuid, 'recordatorio', 'pgtap3.e11@example.test', 'e', 'c', 'enviando', '2026-11-02 14:00:00+00', '2026-11-02 14:49:00+00'),
  ('c3000000-0000-0000-0000-000000000002', current_setting('rtc.pa')::uuid, 'recordatorio', 'pgtap3.e9@example.test', 'e', 'c', 'enviando', '2026-11-02 14:00:00+00', '2026-11-02 14:51:00+00');
insert into public.mail_salida (id, profesor_id, tipo, destinatario, asunto, cuerpo_texto, estado, creado_en) values
  ('c3000000-0000-0000-0000-000000000003', current_setting('rtc.pa')::uuid, 'recordatorio', 'pgtap3.p3@example.test', 'e', 'c', 'pendiente', '2026-11-02 14:57:00+00'),
  ('c3000000-0000-0000-0000-000000000004', current_setting('rtc.pa')::uuid, 'recordatorio', 'pgtap3.p1@example.test', 'e', 'c', 'pendiente', '2026-11-02 14:59:00+00');
select set_config('rtc.cola0', (select count(*)::text from net.http_request_queue), true) is not null as _;
select is(privado.barrer_mails('2026-11-02 15:00:00+00'), '{"sin_confirmacion": 1, "redisparados": 1}'::jsonb, 'H-017: el barrido pasa 1 enviando vieja y redispara 1 pendiente vieja');
select is((select estado || '/' || motivo_fallo from public.mail_salida where id = 'c3000000-0000-0000-0000-000000000001'), 'fallido/SIN_CONFIRMACION', 'H-017: enviando de más de 10 min pasa a fallido SIN_CONFIRMACION');
select is((select estado from public.mail_salida where id = 'c3000000-0000-0000-0000-000000000002'), 'enviando', 'H-017: enviando de 9 min no se toca');
select is((select count(*)::int from net.http_request_queue) - current_setting('rtc.cola0')::int, 1, 'H-017: el barrido redispara una sola llamada (la pendiente de más de 2 min)');
select is((select count(*)::int from net.http_request_queue q where convert_from(q.body, 'UTF8')::jsonb = jsonb_build_object('ids', jsonb_build_array('c3000000-0000-0000-0000-000000000003'))), 2, 'H-017: la redisparada es la de 3 min (la cola tiene el alta y el redisparo)');
select is(privado.barrer_mails('2026-11-02 15:00:00+00'), '{"sin_confirmacion": 0, "redisparados": 1}'::jsonb, 'H-017: SIN_CONFIRMACION no se repite ni se reintenta');

-- H. RLS por rol (SEC-01, SEC-03, T-NFR-13, CA-34) -----------------------------------------------------------
delete from public.mail_salida;
insert into public.mail_salida (id, profesor_id, tipo, destinatario, asunto, cuerpo_texto, estado, motivo_fallo, creado_en) values
  ('c3000000-0000-0000-0000-0000000000f1', current_setting('rtc.pa')::uuid, 'cuenta_nueva', 'pgtap3.fallo@example.test', 'ASUNTO-CENTINELA', 'CUERPO-CENTINELA', 'fallido', '535 Invalid login', '2026-11-02 14:00:00+00'),
  ('c3000000-0000-0000-0000-0000000000f2', current_setting('rtc.pa')::uuid, 'cuenta_nueva', 'pgtap3.ok@example.test', 'ASUNTO-CENTINELA', 'CUERPO-CENTINELA', 'enviado', null, '2026-11-02 14:00:00+00');

set local role anon;
do $$ begin
  begin perform count(*) from public.mail_salida; perform set_config('rtc.anon_tabla', 'ok', true);
  exception when others then perform set_config('rtc.anon_tabla', sqlstate, true); end;
  begin perform count(*) from public.v_mails_fallidos; perform set_config('rtc.anon_vista', 'ok', true);
  exception when others then perform set_config('rtc.anon_vista', sqlstate, true); end;
end $$;
reset role;
select is(current_setting('rtc.anon_tabla'), '42501', 'SEC-01: anon no lee mail_salida');
select is(current_setting('rtc.anon_vista'), '42501', 'SEC-01: anon no lee el registro de fallidos');

select set_config('request.jwt.claims', '{"sub":"a3000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true) is not null as _;
set local role authenticated;
do $$ begin
  perform set_config('rtc.alu_filas', (select count(*) from public.v_mails_fallidos)::text, true);
  perform set_config('rtc.alu_tabla', (select count(*) from public.mail_salida)::text, true);
end $$;
reset role;
select is(current_setting('rtc.alu_filas'), '0', 'T-NFR-13: el alumno ve cero filas del registro de fallidos');
select is(current_setting('rtc.alu_tabla'), '0', 'T-NFR-13: el alumno ve cero filas de mail_salida');

select set_config('request.jwt.claims', '{"sub":"a3000000-0000-0000-0000-00000000000a","role":"authenticated"}', true) is not null as _;
set local role authenticated;
do $$ begin
  perform set_config('rtc.prof_fallidos', (select count(*) from public.v_mails_fallidos)::text, true);
  perform set_config('rtc.prof_clave', (select string_agg(k, ',' order by k) from (select distinct jsonb_object_keys(to_jsonb(v)) k from public.v_mails_fallidos v) s), true);
  perform set_config('rtc.prof_motivo', (select motivo from public.v_mails_fallidos), true);
  perform set_config('rtc.prof_total', (select count(*) from public.mail_salida)::text, true);
  begin perform asunto from public.mail_salida; perform set_config('rtc.prof_asunto', 'ok', true);
  exception when others then perform set_config('rtc.prof_asunto', sqlstate, true); end;
  begin perform cuerpo_texto from public.mail_salida; perform set_config('rtc.prof_cuerpo', 'ok', true);
  exception when others then perform set_config('rtc.prof_cuerpo', sqlstate, true); end;
  begin insert into public.mail_salida (profesor_id, tipo) values (current_setting('rtc.pa')::uuid, 'cuenta_nueva'); perform set_config('rtc.prof_insert', 'ok', true);
  exception when others then perform set_config('rtc.prof_insert', sqlstate, true); end;
  begin update public.mail_salida set estado = 'enviado'; perform set_config('rtc.prof_update', 'ok', true);
  exception when others then perform set_config('rtc.prof_update', sqlstate, true); end;
  begin delete from public.mail_salida; perform set_config('rtc.prof_delete', 'ok', true);
  exception when others then perform set_config('rtc.prof_delete', sqlstate, true); end;
end $$;
reset role;
select is(current_setting('rtc.prof_fallidos'), '1', 'CA-34: el profesor ve solo el mail fallido en el registro');
select is(current_setting('rtc.prof_clave'), 'destinatario,fecha,id,motivo,tipo', 'CA-34: el registro trae fecha, destinatario, tipo y motivo (más el id de la lista)');
select is(current_setting('rtc.prof_motivo'), '535 Invalid login', 'CA-34: el motivo del fallo se ve');
select is(current_setting('rtc.prof_total'), '2', 'SEC-01: el profesor lee las filas de mail_salida');
select is(current_setting('rtc.prof_asunto'), '42501', 'SEC-03: el profesor no lee el asunto');
select is(current_setting('rtc.prof_cuerpo'), '42501', 'SEC-03: el profesor no lee el cuerpo');
select is(current_setting('rtc.prof_insert'), '42501', 'SEC-03: el profesor no inserta directo');
select is(current_setting('rtc.prof_update'), '42501', 'SEC-03: el profesor no actualiza directo');
select is(current_setting('rtc.prof_delete'), '42501', 'SEC-03: el profesor no borra directo');

-- El profesor B: sus mails son suyos y no se mezclan con los de A (SEC-02, PRF-07).
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', 'a3000000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated', 'pgtap3.profesor.b@example.test', now(), now(), now(), '', '', '', '');
insert into public.mail_salida (id, profesor_id, tipo, destinatario, asunto, cuerpo_texto, estado, motivo_fallo, creado_en) values
  ('c3000000-0000-0000-0000-0000000000f3', current_setting('rtc.pb')::uuid, 'cuenta_nueva', 'pgtap3.fallo.b@example.test', 'B', 'B', 'fallido', 'TOPE', '2026-11-02 14:00:00+00'),
  ('c3000000-0000-0000-0000-0000000000f4', null, 'aviso_inactividad', 'pgtap3.app@example.test', 'App', 'App', 'fallido', 'TOPE', '2026-11-02 14:00:00+00');
select set_config('request.jwt.claims', '{"sub":"a3000000-0000-0000-0000-00000000000b","role":"authenticated"}', true) is not null as _;
set local role authenticated;
do $$ begin
  perform set_config('rtc.pb_fallidos', (select string_agg(destinatario, ',') from public.v_mails_fallidos)::text, true);
  perform set_config('rtc.pb_total', (select count(*) from public.mail_salida)::text, true);
end $$;
reset role;
select is(current_setting('rtc.pb_fallidos'), 'pgtap3.fallo.b@example.test', 'SEC-02: el profesor B ve en su registro solo sus mails (ni los de A ni los de la aplicación)');
select is(current_setting('rtc.pb_total'), '1', 'SEC-02: el profesor B lee solo sus filas de mail_salida');
select is(current_setting('rtc.prof_total'), '2', 'SEC-02: con mails de B y de la aplicación en la tabla, el profesor A sigue leyendo solo los suyos (2, medidos antes)');
select set_config('request.jwt.claims', '{"sub":"a3000000-0000-0000-0000-00000000000a","role":"authenticated"}', true) is not null as _;
set local role authenticated;
do $$ begin
  perform set_config('rtc.pa_total2', (select count(*) from public.mail_salida)::text, true);
  perform set_config('rtc.pa_fallidos2', (select count(*) from public.v_mails_fallidos)::text, true);
end $$;
reset role;
select is(current_setting('rtc.pa_total2') || ',' || current_setting('rtc.pa_fallidos2'), '2,1', 'SEC-02: con los mails de B y de la aplicación ya cargados, A sigue leyendo 2 filas y 1 fallida');

set local role service_role;
do $$ begin
  begin update public.mail_salida set estado = 'enviado', motivo_fallo = null where id = 'c3000000-0000-0000-0000-0000000000f1'; perform set_config('rtc.svc_estado', 'ok', true);
  exception when others then perform set_config('rtc.svc_estado', sqlstate, true); end;
  begin update public.mail_salida set destinatario = 'otro@example.test'; perform set_config('rtc.svc_dest', 'ok', true);
  exception when others then perform set_config('rtc.svc_dest', sqlstate, true); end;
  begin insert into public.mail_salida (profesor_id, tipo) values (current_setting('rtc.pa')::uuid, 'cuenta_nueva'); perform set_config('rtc.svc_insert', 'ok', true);
  exception when others then perform set_config('rtc.svc_insert', sqlstate, true); end;
  begin delete from public.mail_salida; perform set_config('rtc.svc_delete', 'ok', true);
  exception when others then perform set_config('rtc.svc_delete', sqlstate, true); end;
end $$;
reset role;
select is(current_setting('rtc.svc_estado'), 'ok', 'H-011: service_role actualiza estado y motivo');
select is(current_setting('rtc.svc_dest'), '42501', 'H-011: service_role no cambia el destinatario');
select is(current_setting('rtc.svc_insert'), '42501', 'H-011: service_role no inserta');
select is(current_setting('rtc.svc_delete'), '42501', 'H-011: service_role no borra');

select * from finish();
rollback;
