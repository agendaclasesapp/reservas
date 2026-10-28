-- B05 · T05.3 (adaptado a B14: personas con una inscripción por profesor, dos profesores) · pgTAP de cuentas y alumnos del profesor (CA-04, CA-06, CA-07, CA-45 rama de ficha, AVI-02, AVI-03, SEC-02,
-- SEC-06, SEC-09, H-037; casos T-ALU-09 a T-ALU-11, T-ALU-13, T-ALU-16 a T-ALU-19, T-SOL-11): mail de cuenta nueva,
-- aprobar y rechazar (motivo, límite de 500, reemplazo al aprobar), unión por teléfono normalizado, alta con y sin mail,
-- `v_alumnos` con edad por `app_ahora()`. Todo en una transacción con rollback. Datos sintéticos (@example.test).
begin;
select plan(83);

create function pg_temp.como(p_sub uuid, p_sql text, p_clave text) returns void language plpgsql as $f$
declare
  v_res text;
  v_det text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql into v_res;
    perform set_config('rtc.' || p_clave || '_est', 'ok', true);
    perform set_config('rtc.' || p_clave || '_res', coalesce(v_res, ''), true);
    perform set_config('rtc.' || p_clave || '_msg', '', true);
    perform set_config('rtc.' || p_clave || '_det', '', true);
  exception when others then
    get stacked diagnostics v_det = pg_exception_detail;
    perform set_config('rtc.' || p_clave || '_est', sqlstate, true);
    perform set_config('rtc.' || p_clave || '_res', '', true);
    perform set_config('rtc.' || p_clave || '_msg', sqlerrm, true);
    perform set_config('rtc.' || p_clave || '_det', coalesce(v_det, ''), true);
  end;
  execute 'reset role';
end;
$f$;

create function pg_temp.usuario(p_id uuid, p_mail text) returns void language sql as $f$
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_mail, now(), now(), now(), '', '', '', '', '{}')
$f$;

-- Reloj fijo: miércoles 2026-10-21 12:00 en Montevideo (-03).
update privado.reloj_prueba set ahora = '2026-10-21 15:00:00+00';
update public.alumno set ficha_completada_en = null;
-- Dos profesores (ADR-018): el A y la B vinculan a su usuario al entrar con su mail confirmado.
select set_config('rtc.pa', privado.configurar_profesor('pgtap.profesor@example.test', 'Profesor pgTAP', 'pgtap5-uno')::text, true) is not null as _;
select set_config('rtc.pb', privado.configurar_profesor('pgtap.profesor.b@example.test', 'Profesora B pgTAP', 'pgtap5-dos')::text, true) is not null as _;
select pg_temp.usuario('a5000000-0000-0000-0000-000000000001', 'pgtap.profesor@example.test');
select pg_temp.usuario('a5000000-0000-0000-0000-00000000000b', 'pgtap.profesor.b@example.test');
select is((select user_id from public.profesor where id = current_setting('rtc.pa')::uuid), 'a5000000-0000-0000-0000-000000000001'::uuid, 'preparación: el profesor A queda vinculado');

-- A. AVI-02: la ficha completa encola cuenta_nueva al profesor ---------------------------------------------------
select pg_temp.usuario('a5000000-0000-0000-0000-000000000002', 'pgtap.ana@example.test');
select pg_temp.como('a5000000-0000-0000-0000-000000000002', 'select public.completar_ficha(''Ana Ficha'', ''+598 99 111 222'', ''2000-01-01'', ''pgtap5-uno'', ''Amigos'')::text', 'ficha');
select is(current_setting('rtc.ficha_est'), 'ok', 'preparación: Ana completa su ficha');
select is((select count(*)::int from public.mail_salida where tipo = 'cuenta_nueva' and destinatario = 'pgtap.profesor@example.test'
            and alumno_id = (select id from public.alumno where user_id = 'a5000000-0000-0000-0000-000000000002')), 1,
  'AVI-02: completar la ficha encola un mail cuenta_nueva al profesor con el alumno_id');
select ok((select cuerpo_texto like '%Ana Ficha%' from public.mail_salida where tipo = 'cuenta_nueva'
            and alumno_id = (select id from public.alumno where user_id = 'a5000000-0000-0000-0000-000000000002')),
  'AVI-02: el mail de cuenta nueva nombra a la cuenta');
select is((select count(*)::int from public.mail_salida where tipo = 'cuenta_nueva' and cuerpo_texto like '%2000-01-01%'
            and alumno_id = (select id from public.alumno where user_id = 'a5000000-0000-0000-0000-000000000002')), 0,
  'SEC-29: el mail de cuenta nueva no lleva la fecha de nacimiento');

-- B. CA-04 unión por teléfono normalizado (ALU-04, ALU-05) --------------------------------------------------------
insert into public.alumno (id, estado, nombre, mail, telefono, fecha_nacimiento, ficha_completada_en, creado_por) values
  ('b5000000-0000-0000-0000-000000000001', 'completa', 'Pendiente Uno', 'pgtap.p1@example.test', '099 123-456', '1999-05-05', '2026-10-01 10:00+00', null),
  ('b5000000-0000-0000-0000-000000000002', 'completa', 'Sin Cuenta Uno', null, '+598 99123456', '1990-01-01', '2026-10-01 10:00+00', current_setting('rtc.pa')::uuid),
  ('b5000000-0000-0000-0000-000000000003', 'completa', 'Sin Cuenta Tres', null, '099-123-456', '1991-01-01', '2026-10-01 10:00+00', current_setting('rtc.pa')::uuid),
  ('b5000000-0000-0000-0000-000000000004', 'completa', 'Sin Cuenta Otro', null, '091 000-000', '1992-01-01', '2026-10-01 10:00+00', current_setting('rtc.pa')::uuid),
  ('b5000000-0000-0000-0000-000000000005', 'completa', 'Sin Cuenta de B', null, '099 123 456', '1992-01-01', '2026-10-01 10:00+00', current_setting('rtc.pb')::uuid);
insert into public.inscripcion (alumno_id, profesor_id, estado) values
  ('b5000000-0000-0000-0000-000000000001', current_setting('rtc.pa')::uuid, 'pendiente'),
  ('b5000000-0000-0000-0000-000000000002', current_setting('rtc.pa')::uuid, 'sin_cuenta'),
  ('b5000000-0000-0000-0000-000000000003', current_setting('rtc.pa')::uuid, 'sin_cuenta'),
  ('b5000000-0000-0000-0000-000000000004', current_setting('rtc.pa')::uuid, 'sin_cuenta'),
  ('b5000000-0000-0000-0000-000000000005', current_setting('rtc.pb')::uuid, 'sin_cuenta');
insert into public.persona_a_cargo (id, alumno_id, nombre) values
  ('c5000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000002', 'Hijo de Sin Cuenta');
insert into public.reserva (id, profesor_id, alumno_id, tipo, hora_local, dia_semana, duracion_min, estado, desde, origen) values
  ('d5000000-0000-0000-0000-000000000001', current_setting('rtc.pa')::uuid, 'b5000000-0000-0000-0000-000000000002', 'suelta', '10:00', 4, 60, 'confirmada', '2026-10-22', 'profesor');
insert into public.clase (id, profesor_id, reserva_id, alumno_id, inicio, fin, estado) values
  ('e5000000-0000-0000-0000-000000000001', current_setting('rtc.pa')::uuid, 'd5000000-0000-0000-0000-000000000001',
   'b5000000-0000-0000-0000-000000000002', '2026-10-22 10:00-03', '2026-10-22 11:00-03', 'confirmada');

select pg_temp.como('a5000000-0000-0000-0000-000000000001', 'select jsonb_array_length(public.sugerencias_union(''b5000000-0000-0000-0000-000000000001''))::text', 'sug1');
select is(current_setting('rtc.sug1_res'), '2', 'CA-04: «099 123-456» coincide con «+598 99123456» y «099-123-456» (últimos 8 dígitos), sin el sin cuenta de B de igual teléfono');
select pg_temp.como('a5000000-0000-0000-0000-000000000001', 'select (public.sugerencias_union(''b5000000-0000-0000-0000-000000000001'') @> ''[{"sin_cuenta_id":"b5000000-0000-0000-0000-000000000004"}]'')::text', 'sug2');
select is(current_setting('rtc.sug2_res'), 'false', 'CA-04: «091 000-000» no aparece como sugerencia');
select pg_temp.como('a5000000-0000-0000-0000-000000000001', 'select public.unir_alumnos(''b5000000-0000-0000-0000-000000000001'', ''b5000000-0000-0000-0000-000000000002'')::text', 'unir0');
select is(current_setting('rtc.unir0_est') || current_setting('rtc.unir0_msg'), 'PT409UNION_NO_VALIDA', 'ALU-05: no se une a una cuenta que todavía está pendiente (409)');
select pg_temp.como('a5000000-0000-0000-0000-000000000001', 'select public.aprobar_cuenta(''b5000000-0000-0000-0000-000000000001'')::text', 'apr1');
select is(current_setting('rtc.apr1_est'), 'ok', 'ALU-03: el profesor aprueba la cuenta pendiente');
select is(current_setting('rtc.apr1_res')::jsonb ->> 'estado', 'aprobado', 'ALU-03: la respuesta trae el estado aprobado');
select is(jsonb_array_length(current_setting('rtc.apr1_res')::jsonb -> 'sugerencias'), 2, 'CA-04: al aprobar el profesor recibe las dos sugerencias');
select is((select estado from public.inscripcion where alumno_id = 'b5000000-0000-0000-0000-000000000001' and profesor_id = current_setting('rtc.pa')::uuid),
  'aprobado', 'ALU-03: la inscripción con A queda aprobada');
select is((select count(*)::int from public.mail_salida where tipo = 'cuenta_respondida' and alumno_id = 'b5000000-0000-0000-0000-000000000001'
            and asunto = 'Profesor pgTAP aprobó tu acceso' and profesor_id = current_setting('rtc.pa')::uuid), 1, 'AVI-03: aprobar encola el mail cuenta_respondida al titular, con el nombre del profesor');
select pg_temp.como('a5000000-0000-0000-0000-000000000001', 'select public.descartar_union(''b5000000-0000-0000-0000-000000000001'', ''b5000000-0000-0000-0000-000000000003'')::text', 'desc1');
select pg_temp.como('a5000000-0000-0000-0000-000000000001', 'select public.descartar_union(''b5000000-0000-0000-0000-000000000001'', ''b5000000-0000-0000-0000-000000000003'')::text', 'desc2');
select is(current_setting('rtc.desc1_est') || current_setting('rtc.desc2_est'), 'okok', 'ALU-04: descartar la unión es idempotente');
select pg_temp.como('a5000000-0000-0000-0000-000000000001', 'select public.sugerencias_union(''b5000000-0000-0000-0000-000000000001'')::text', 'sug3');
select is(jsonb_array_length(current_setting('rtc.sug3_res')::jsonb), 1, 'CA-04: lo descartado no vuelve a sugerirse');
select is(current_setting('rtc.sug3_res')::jsonb -> 0 ->> 'sin_cuenta_id', 'b5000000-0000-0000-0000-000000000002', 'CA-04: queda la sugerencia no descartada');
select is((select estado from public.inscripcion where alumno_id = 'b5000000-0000-0000-0000-000000000003'), 'sin_cuenta', 'CA-04: al descartar, el alumno sin cuenta queda intacto');
select pg_temp.como('a5000000-0000-0000-0000-000000000001', 'select public.descartar_union(''b5000000-0000-0000-0000-000000000001'', ''b5000000-0000-0000-0000-000000000004'')::text', 'desc3');
select is(current_setting('rtc.desc3_est') || current_setting('rtc.desc3_msg'), 'PT409UNION_NO_VALIDA', 'ALU-04: no se descarta un par con teléfonos distintos (409)');
-- CA-52: el profesor B no ve ni une a las personas de A (404), y no le sugiere nada.
select pg_temp.como('a5000000-0000-0000-0000-00000000000b', 'select public.unir_alumnos(''b5000000-0000-0000-0000-000000000001'', ''b5000000-0000-0000-0000-000000000002'')::text', 'unir_b');
select is(current_setting('rtc.unir_b_est') || current_setting('rtc.unir_b_msg'), 'PT404NO_ENCONTRADO', 'CA-52: otro profesor no une a las personas de A (404)');
select pg_temp.como('a5000000-0000-0000-0000-00000000000b', 'select public.sugerencias_union(''b5000000-0000-0000-0000-000000000001'')::text', 'sug_b');
select is(current_setting('rtc.sug_b_est'), 'PT404', 'CA-52: otro profesor no pide sugerencias de una persona de A (404)');
select pg_temp.como('a5000000-0000-0000-0000-000000000002', 'select public.unir_alumnos(''b5000000-0000-0000-0000-000000000001'', ''b5000000-0000-0000-0000-000000000002'')::text', 'unir_al');
select is(current_setting('rtc.unir_al_est'), 'PT403', 'T-ALU-13: un alumno no une (403) y nada cambia');
select is((select count(*)::int from public.alumno where id = 'b5000000-0000-0000-0000-000000000002'), 1, 'T-ALU-13: el alumno sin cuenta sigue ahí');
select is((select count(*)::int from public.alumno where id = 'b5000000-0000-0000-0000-000000000005'), 1, 'CA-04: el sin cuenta de B, de igual teléfono, no se tocó');
select pg_temp.como('a5000000-0000-0000-0000-000000000001', 'select public.unir_alumnos(''b5000000-0000-0000-0000-000000000001'', ''b5000000-0000-0000-0000-000000000002'')::text', 'unir1');
select is(current_setting('rtc.unir1_est'), 'ok', 'CA-04: el profesor confirma la unión');
select is((select count(*)::int from public.alumno where id = 'b5000000-0000-0000-0000-000000000002'), 0, 'CA-04: el alumno sin cuenta ya no existe');
select is((select alumno_id from public.clase where id = 'e5000000-0000-0000-0000-000000000001'), 'b5000000-0000-0000-0000-000000000001'::uuid,
  'CA-04: la clase aparece en la cuenta');
select is((select alumno_id from public.reserva where id = 'd5000000-0000-0000-0000-000000000001'), 'b5000000-0000-0000-0000-000000000001'::uuid,
  'CA-04: la reserva pasa a la cuenta');
select is((select alumno_id from public.persona_a_cargo where id = 'c5000000-0000-0000-0000-000000000001'), 'b5000000-0000-0000-0000-000000000001'::uuid,
  'CA-04: la persona a cargo pasa a la cuenta');
select is((select count(*)::int from public.clase where alumno_id = 'b5000000-0000-0000-0000-000000000001'), 1, 'CA-04: ninguna clase se pierde ni se duplica');
select pg_temp.como('a5000000-0000-0000-0000-000000000001', 'select public.unir_alumnos(''b5000000-0000-0000-0000-000000000001'', ''b5000000-0000-0000-0000-000000000002'')::text', 'unir2');
select is(current_setting('rtc.unir2_est'), 'PT404', 'ALU-05: repetir la unión sobre un alumno que ya no existe da 404');
set local role anon;
select throws_ok($$select public.unir_alumnos('b5000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000003')$$, '42501', null, 'SEC-06: anon no ejecuta unir_alumnos');
select throws_ok($$select public.aprobar_cuenta('b5000000-0000-0000-0000-000000000001')$$, '42501', null, 'SEC-06: anon no ejecuta aprobar_cuenta');
reset role;

-- C. Rechazo, motivo y rama de ficha de CA-45 (ALU-03, AVI-03, SEC-09, H-037) -------------------------------------
select pg_temp.usuario('a5000000-0000-0000-0000-000000000003', 'pgtap.rech@example.test');
update public.alumno set estado = 'completa', nombre = 'Rechazada Ficha', telefono = '+598 98 000 111', fecha_nacimiento = '2001-02-03',
                         ficha_completada_en = '2026-10-01 10:00+00', ficha_origen_profesor_id = current_setting('rtc.pa')::uuid
 where user_id = 'a5000000-0000-0000-0000-000000000003';
insert into public.inscripcion (alumno_id, profesor_id, estado)
select id, current_setting('rtc.pa')::uuid, 'pendiente' from public.alumno where user_id = 'a5000000-0000-0000-0000-000000000003';
select pg_temp.como('a5000000-0000-0000-0000-000000000001',
  format('select public.rechazar_cuenta(%L, %L)::text', (select id from public.alumno where user_id = 'a5000000-0000-0000-0000-000000000003'), '<img src=x onerror=alert(1)> por falta de cupo'), 'rech1');
select is(current_setting('rtc.rech1_est'), 'ok', 'ALU-03: el profesor rechaza con motivo');
select is((select i.motivo_estado from public.inscripcion i join public.alumno a on a.id = i.alumno_id where a.user_id = 'a5000000-0000-0000-0000-000000000003'), '<img src=x onerror=alert(1)> por falta de cupo',
  'CA-45: el motivo se guarda tal cual, como texto (el escape es de la vista)');
select pg_temp.como('a5000000-0000-0000-0000-000000000003', 'select (public.sesion_actual())::text', 'ses1');
select is(current_setting('rtc.ses1_res')::jsonb -> 'inscripciones' -> 0 ->> 'motivo_rechazo', '<img src=x onerror=alert(1)> por falta de cupo', 'CA-45: la ficha recibe el motivo, junto al profesor que rechazó, por sesion_actual');
select is(current_setting('rtc.ses1_res')::jsonb -> 'inscripciones' -> 0 ->> 'estado' || '|' || (current_setting('rtc.ses1_res')::jsonb -> 'inscripciones' -> 0 ->> 'slug'), 'rechazado|pgtap5-uno', 'CA-45: y el estado rechazado con ese profesor');
select ok((select cuerpo_texto like '%Motivo: %falta de cupo%' from public.mail_salida where tipo = 'cuenta_respondida'
            and asunto = 'Profesor pgTAP rechazó tu acceso' and alumno_id = (select id from public.alumno where user_id = 'a5000000-0000-0000-0000-000000000003')),
  'AVI-03: el mail de rechazo lleva el motivo');
select pg_temp.como('a5000000-0000-0000-0000-000000000001',
  format('select public.rechazar_cuenta(%L, null)::text', (select id from public.alumno where user_id = 'a5000000-0000-0000-0000-000000000003')), 'rech2');
select is(current_setting('rtc.rech2_est') || current_setting('rtc.rech2_msg'), 'PT409CUENTA_NO_PENDIENTE', 'ALU-03: rechazar una cuenta ya rechazada da 409');
select pg_temp.como('a5000000-0000-0000-0000-000000000001',
  format('select public.aprobar_cuenta(%L)::text', (select id from public.alumno where user_id = 'a5000000-0000-0000-0000-000000000003')), 'apr2');
select is(current_setting('rtc.apr2_est'), 'ok', 'ALU-03: una cuenta rechazada se puede aprobar después');
select is((select i.motivo_estado from public.inscripcion i join public.alumno a on a.id = i.alumno_id where a.user_id = 'a5000000-0000-0000-0000-000000000003'), null,
  'H-037 y CA-45: tras aprobar sin motivo, motivo_estado queda en null');
select pg_temp.como('a5000000-0000-0000-0000-000000000003', 'select (public.sesion_actual())::text', 'ses2');
select is(current_setting('rtc.ses2_res')::jsonb -> 'inscripciones' -> 0 -> 'motivo_rechazo', 'null'::jsonb, 'CA-45: la ficha ya no recibe motivo');
select ok((select cuerpo_texto not like '%Mensaje del profesor%' from public.mail_salida where tipo = 'cuenta_respondida'
            and asunto = 'Profesor pgTAP aprobó tu acceso' and alumno_id = (select id from public.alumno where user_id = 'a5000000-0000-0000-0000-000000000003')),
  'AVI-03: el mail de aprobación sin motivo no trae mensaje');

insert into public.alumno (id, estado, nombre, mail, telefono, fecha_nacimiento, ficha_completada_en) values
  ('b5000000-0000-0000-0000-000000000011', 'completa', 'Sin Motivo', 'pgtap.sm@example.test', '+598 97 000 222', '2001-02-03', '2026-10-01 10:00+00'),
  ('b5000000-0000-0000-0000-000000000012', 'completa', 'Motivo Largo', 'pgtap.ml@example.test', '+598 97 000 333', '2001-02-03', '2026-10-01 10:00+00'),
  ('b5000000-0000-0000-0000-000000000013', 'completa', 'Motivo Justo', 'pgtap.mj@example.test', '+598 97 000 444', '2001-02-03', '2026-10-01 10:00+00');
insert into public.inscripcion (alumno_id, profesor_id, estado) values
  ('b5000000-0000-0000-0000-000000000011', current_setting('rtc.pa')::uuid, 'pendiente'),
  ('b5000000-0000-0000-0000-000000000012', current_setting('rtc.pa')::uuid, 'pendiente'),
  ('b5000000-0000-0000-0000-000000000013', current_setting('rtc.pa')::uuid, 'pendiente');
select pg_temp.como('a5000000-0000-0000-0000-000000000001', 'select public.rechazar_cuenta(''b5000000-0000-0000-0000-000000000011'', ''   '')::text', 'rech3');
select is((select motivo_estado from public.inscripcion where alumno_id = 'b5000000-0000-0000-0000-000000000011'), null, 'CA-45: un motivo en blanco equivale a sin motivo (solo el estado)');
select ok((select cuerpo_texto not like '%Motivo:%' from public.mail_salida where tipo = 'cuenta_respondida' and alumno_id = 'b5000000-0000-0000-0000-000000000011'),
  'AVI-03: el mail de rechazo sin motivo no trae «Motivo»');
select pg_temp.como('a5000000-0000-0000-0000-000000000001', 'select public.rechazar_cuenta(''b5000000-0000-0000-0000-000000000012'', repeat(''x'', 501))::text', 'larg1');
select is(current_setting('rtc.larg1_est') || current_setting('rtc.larg1_det'), 'PT422{"campo":"motivo"}', 'SEC-09: un motivo de 501 caracteres da 422 {campo: motivo}');
select is((select estado from public.inscripcion where alumno_id = 'b5000000-0000-0000-0000-000000000012'), 'pendiente', 'SEC-09: con el 422 la cuenta sigue pendiente');
select pg_temp.como('a5000000-0000-0000-0000-000000000001', 'select public.aprobar_cuenta(''b5000000-0000-0000-0000-000000000012'', repeat(''x'', 501))::text', 'larg2');
select is(current_setting('rtc.larg2_est'), 'PT422', 'SEC-09: aprobar con motivo de 501 caracteres también da 422');
select pg_temp.como('a5000000-0000-0000-0000-000000000001', 'select public.rechazar_cuenta(''b5000000-0000-0000-0000-000000000013'', repeat(''x'', 500))::text', 'larg3');
select is(current_setting('rtc.larg3_est'), 'ok', 'SEC-09: 500 caracteres es el máximo aceptado');
select throws_ok($$update public.inscripcion set motivo_estado = repeat('x', 501) where alumno_id = 'b5000000-0000-0000-0000-000000000013'$$, '23514', null,
  'SEC-09: el CHECK de la tabla respalda el límite del motivo');
select pg_temp.como('a5000000-0000-0000-0000-000000000002', 'select public.rechazar_cuenta(''b5000000-0000-0000-0000-000000000012'', null)::text', 'rech_al');
select is(current_setting('rtc.rech_al_est'), 'PT403', 'SEC-06: un alumno no rechaza cuentas (403)');
select pg_temp.como('a5000000-0000-0000-0000-000000000001', 'select public.aprobar_cuenta(''00000000-0000-0000-0000-00000000dead'')::text', 'apr404');
select is(current_setting('rtc.apr404_est'), 'PT404', 'SEC-06: aprobar una cuenta inexistente da 404');
-- CA-52: aprobar o rechazar a una persona que solo tiene inscripción con A, desde B, da 404 y no cambia nada.
select pg_temp.como('a5000000-0000-0000-0000-00000000000b', 'select public.aprobar_cuenta(''b5000000-0000-0000-0000-000000000012'')::text', 'apr_b');
select pg_temp.como('a5000000-0000-0000-0000-00000000000b', 'select public.rechazar_cuenta(''b5000000-0000-0000-0000-000000000012'', ''x'')::text', 'rech_b');
select is(current_setting('rtc.apr_b_est') || current_setting('rtc.apr_b_msg') || '/' || current_setting('rtc.rech_b_est') || current_setting('rtc.rech_b_msg'), 'PT404NO_ENCONTRADO/PT404NO_ENCONTRADO',
  'CA-52: el profesor B no aprueba ni rechaza a una persona de A (404)');
select is((select estado from public.inscripcion where alumno_id = 'b5000000-0000-0000-0000-000000000012'), 'pendiente', 'CA-52: la inscripción con A sigue pendiente');

-- D. CA-06 alta con y sin mail (ALU-07, ALU-08, AVI-04) ------------------------------------------------------------
select pg_temp.como('a5000000-0000-0000-0000-000000000001', 'select public.alta_alumno(''Alta Con Mail'', ''+598 96 000 111'', ''1995-06-15'', ''pgtap.alta@example.test'')::text', 'alta1');
select is(current_setting('rtc.alta1_res')::jsonb ->> 'estado', 'aprobado', 'CA-06: el alta con mail nace aprobada (sin pasar por aprobación)');
select pg_temp.usuario('a5000000-0000-0000-0000-000000000004', 'pgtap.alta@example.test');
select is((select user_id from public.alumno where mail = 'pgtap.alta@example.test'), 'a5000000-0000-0000-0000-000000000004'::uuid,
  'CA-06: al entrar con ese mail la persona queda vinculada a su alta');
select is((select a.estado || '|' || i.estado from public.alumno a join public.inscripcion i on i.alumno_id = a.id and i.profesor_id = current_setting('rtc.pa')::uuid
            where a.mail = 'pgtap.alta@example.test'), 'completa|aprobado', 'CA-06: y conserva la inscripción aprobada con ese profesor, sin ficha pendiente');
select pg_temp.como('a5000000-0000-0000-0000-000000000001', 'select public.alta_alumno(''Alta Sin Mail'', ''+598 96 000 222'', ''1996-07-16'')::text', 'alta2');
select is(current_setting('rtc.alta2_res')::jsonb ->> 'estado', 'sin_cuenta', 'CA-06: el alta sin mail queda sin_cuenta');
select is((select count(*)::int from public.mail_salida where tipo = 'alumno_sumado' and destinatario = 'pgtap.alta@example.test' and profesor_id = current_setting('rtc.pa')::uuid), 1,
  'CA-06/AVI-04: el alta con mail encola el aviso «te sumó como alumno» (alumno_sumado) de ese profesor');
select is((select mail from public.alumno where id = (current_setting('rtc.alta2_res')::jsonb ->> 'alumno_id')::uuid), null, 'CA-06: sin mail no hay cómo iniciar sesión');
select is((select count(*)::int from public.mail_salida where alumno_id = (current_setting('rtc.alta2_res')::jsonb ->> 'alumno_id')::uuid), 0,
  'AVI-04: al alumno dado de alta sin mail no se le encola ningún mail');
select pg_temp.como('a5000000-0000-0000-0000-000000000001', 'select public.alta_alumno(''Repetido'', ''+598 96 000 333'', ''1996-07-16'', ''PGTAP.alta@example.test'')::text', 'alta3');
select is(current_setting('rtc.alta3_est') || current_setting('rtc.alta3_msg'), 'PT409MAIL_YA_REGISTRADO', 'ALU-07: un mail ya registrado da 409 MAIL_YA_REGISTRADO');
select pg_temp.como('a5000000-0000-0000-0000-000000000001', 'select public.alta_alumno(''Soy el profe'', ''+598 96 000 333'', ''1996-07-16'', ''pgtap.profesor@example.test'')::text', 'alta4');
select is(current_setting('rtc.alta4_est'), 'PT409', 'ALU-07: el mail del profesor da 409');
select pg_temp.como('a5000000-0000-0000-0000-000000000001', 'select public.alta_alumno(''Mail malo'', ''+598 96 000 333'', ''1996-07-16'', ''no-es-un-mail'')::text', 'alta5');
select is(current_setting('rtc.alta5_est') || current_setting('rtc.alta5_det'), 'PT422{"campo":"p_mail"}', 'SEC-09: un mail inválido da 422 {campo: p_mail}');
select pg_temp.como('a5000000-0000-0000-0000-000000000001', 'select public.alta_alumno(''Tel malo'', ''abc'', ''1996-07-16'')::text', 'alta6');
select is(current_setting('rtc.alta6_est') || replace(current_setting('rtc.alta6_det'), ' ', ''), 'PT422{"campo":"p_telefono"}', 'SEC-09: un teléfono inválido da 422 {campo: p_telefono}');
select pg_temp.como('a5000000-0000-0000-0000-000000000002', 'select public.alta_alumno(''Intruso'', ''+598 96 000 333'', ''1996-07-16'')::text', 'alta7');
select is(current_setting('rtc.alta7_est'), 'PT403', 'SEC-06: un alumno no da de alta (403)');

-- E. CA-07 v_alumnos con edad y reloj fijo (ALU-09, SEC-02) -------------------------------------------------------
insert into public.alumno (id, estado, nombre, telefono, fecha_nacimiento, ficha_completada_en) values
  ('b5000000-0000-0000-0000-000000000021', 'completa', 'Cumple Hoy', '+598 95 000 111', '2000-10-21', '2026-10-01 10:00+00'),
  ('b5000000-0000-0000-0000-000000000022', 'completa', 'Cumple Mañana', '+598 95 000 222', '2000-10-22', '2026-10-01 10:00+00'),
  ('b5000000-0000-0000-0000-000000000023', 'completa', 'Bisiesto', '+598 95 000 333', '2000-02-29', '2026-10-01 10:00+00'),
  ('b5000000-0000-0000-0000-000000000024', 'completa', 'En baja', '+598 95 000 444', '2000-01-01', '2026-10-01 10:00+00');
insert into public.inscripcion (alumno_id, profesor_id, estado) values
  ('b5000000-0000-0000-0000-000000000021', current_setting('rtc.pa')::uuid, 'aprobado'),
  ('b5000000-0000-0000-0000-000000000022', current_setting('rtc.pa')::uuid, 'rechazado'),
  ('b5000000-0000-0000-0000-000000000023', current_setting('rtc.pa')::uuid, 'sin_cuenta'),
  ('b5000000-0000-0000-0000-000000000024', current_setting('rtc.pa')::uuid, 'baja');
select pg_temp.como('a5000000-0000-0000-0000-000000000001', $$select edad::text from public.v_alumnos where id = 'b5000000-0000-0000-0000-000000000021'$$, 'e1');
select is(current_setting('rtc.e1_res'), '26', 'CA-07: el día del cumpleaños la edad es 26 (2000-10-21 con reloj 2026-10-21)');
select pg_temp.como('a5000000-0000-0000-0000-000000000001', $$select edad::text from public.v_alumnos where id = 'b5000000-0000-0000-0000-000000000022'$$, 'e2');
select is(current_setting('rtc.e2_res'), '25', 'CA-07: la víspera del cumpleaños la edad es 25');
select pg_temp.como('a5000000-0000-0000-0000-000000000001', $$select estado from public.v_alumnos where id = 'b5000000-0000-0000-0000-000000000022'$$, 'e3');
select is(current_setting('rtc.e3_res'), 'rechazado', 'ALU-09: la fila trae el estado');
select pg_temp.como('a5000000-0000-0000-0000-000000000001', $$select count(*)::text from public.v_alumnos where estado in ('ficha_incompleta', 'borrado')$$, 'e4');
select is(current_setting('rtc.e4_res'), '0', 'ALU-09: la lista no trae fichas incompletas ni borrados');
select pg_temp.como('a5000000-0000-0000-0000-000000000001', $$select count(*)::text from public.v_alumnos where id = 'b5000000-0000-0000-0000-000000000024'$$, 'e4b');
select is(current_setting('rtc.e4b_res'), '0', 'ALU-09: la persona con inscripción en baja no aparece en la lista');
select pg_temp.como('a5000000-0000-0000-0000-00000000000b', 'select count(*)::text from public.v_alumnos', 'e4c');
select is(current_setting('rtc.e4c_res'), '1', 'CA-52/PRF-07: la profesora B ve en su lista solo a su sin cuenta, no a las personas de A');
update privado.reloj_prueba set ahora = '2027-02-28 15:00:00+00';
select pg_temp.como('a5000000-0000-0000-0000-000000000001', $$select edad::text from public.v_alumnos where id = 'b5000000-0000-0000-0000-000000000023'$$, 'e5');
select is(current_setting('rtc.e5_res'), '26', 'CA-07: nacido el 29-feb, el 28-feb de un año no bisiesto todavía tiene 26');
update privado.reloj_prueba set ahora = '2027-03-01 15:00:00+00';
select pg_temp.como('a5000000-0000-0000-0000-000000000001', $$select edad::text from public.v_alumnos where id = 'b5000000-0000-0000-0000-000000000023'$$, 'e6');
select is(current_setting('rtc.e6_res'), '27', 'CA-07: el 1-mar ya tiene 27');
update privado.reloj_prueba set ahora = '2026-10-21 15:00:00+00';
select pg_temp.como('a5000000-0000-0000-0000-000000000002', 'select count(*)::text from public.v_alumnos', 'va1');
select is(current_setting('rtc.va1_res'), '0', 'SEC-02: un alumno ve 0 filas de v_alumnos');
set local role anon;
select throws_ok($$select * from public.v_alumnos$$, '42501', null, 'SEC-02: anon no lee v_alumnos');
reset role;

-- H-210 · SEC-03: `v_alumnos` es de solo lectura. Escrituras directas: 42501 por privilegio (anon y
-- authenticated, PostgREST 401/403) y 42501 «PROHIBIDO» del trigger INSTEAD OF si un rol con privilegios llega.
select is((select count(*)::int from pg_trigger
            where tgrelid = 'public.v_alumnos'::regclass and not tgisinternal and (tgtype & 64) <> 0),
          3, 'H-210 SEC-03: v_alumnos tiene triggers INSTEAD OF de insert, update y delete');
select set_config('request.jwt.claims', json_build_object('sub', 'a5000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok($$insert into public.v_alumnos (nombre) values ('x')$$, '42501', null, 'H-210 SEC-03: el profesor no inserta en v_alumnos (42501)');
select throws_ok($$update public.v_alumnos set nombre = 'x'$$, '42501', null, 'H-210 SEC-03: el profesor no actualiza v_alumnos (42501)');
select throws_ok($$delete from public.v_alumnos$$, '42501', null, 'H-210 SEC-03: el profesor no borra de v_alumnos (42501)');
reset role;
set local role anon;
select throws_ok($$insert into public.v_alumnos (nombre) values ('x')$$, '42501', null, 'H-210 SEC-03: anon no inserta en v_alumnos (42501)');
reset role;
select throws_ok($$insert into public.v_alumnos (nombre) values ('x')$$, '42501', 'PROHIBIDO', 'H-210 SEC-03: con privilegios, el trigger rechaza el insert con 42501 PROHIBIDO');
select throws_ok($$update public.v_alumnos set nombre = 'x'$$, '42501', 'PROHIBIDO', 'H-210 SEC-03: con privilegios, el trigger rechaza el update con 42501 PROHIBIDO');
select throws_ok($$delete from public.v_alumnos$$, '42501', 'PROHIBIDO', 'H-210 SEC-03: con privilegios, el trigger rechaza el delete con 42501 PROHIBIDO');

select * from finish();
rollback;
