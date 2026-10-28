-- B04 · T04.4 (adaptado a B14: completar_ficha con enlace, inscripción por profesor, sesion_actual con inscripciones)
-- pgTAP de ingreso y ficha (CA-01, CA-02, CA-05 rama ALU-06, CA-43, ALU-13, SEC-06, SEC-09, SEC-10,
-- SEC-14, SEC-15, SEC-29, H-180; casos T-ALU-04, T-ALU-05, T-ALU-15, T-WEB-01): trigger `al_confirmar_usuario` (insert sin
-- confirmar + UPDATE confirmado con full_name como lo hace GoTrue, insert ya confirmado, idempotencia, profesor,
-- revinculación, sin vínculo con el mail sin confirmar), `sesion_actual`, `completar_ficha` (validaciones y tope con
-- reloj fijo) y `guardar_persona_a_cargo`. Todo dentro de una transacción con rollback: el reloj de prueba y los
-- datos vuelven solos. Datos sintéticos (@example.test). Las columnas de token van en '' como las deja GoTrue.
begin;
select plan(79);

-- Ayuda: ejecuta una sentencia como `authenticated` con el sub dado y guarda estado, mensaje y detalle en GUC.
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

-- Ayuda: crea un usuario de Auth como lo deja GoTrue (tokens en '').
create function pg_temp.usuario(p_id uuid, p_mail text, p_confirmado boolean, p_meta jsonb default '{}') returns void language sql as $f$
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_mail,
          case when p_confirmado then now() end, now(), now(), '', '', '', '', p_meta)
$f$;

-- Reloj fijo: lunes 2026-11-02 12:00 en Montevideo (-03). Sin fichas previas contando para el tope.
update privado.reloj_prueba set ahora = '2026-11-02 15:00:00+00';
update public.alumno set ficha_completada_en = null;
-- Dos profesores (ADR-018), todavía sin usuario: el A entra en la sección C y el B recibe fichas con su enlace (CA-60).
select set_config('rtc.pa', privado.configurar_profesor('pgtap.profesor@example.test', 'Profesor pgTAP', 'pgtap4-uno')::text, true) is not null as _;
select set_config('rtc.pb', privado.configurar_profesor('pgtap.profesor.b@example.test', 'Profesora B pgTAP', 'pgtap4-dos')::text, true) is not null as _;
create temp table _mails_antes as select count(*) as n from public.mail_salida;

-- A. Código y Google: insert sin confirmar y UPDATE confirmado con full_name (CA-01, ALU-01, SEC-14) --------
select pg_temp.usuario('a0000000-0000-0000-0000-0000000000e1', 'pgtap.google@example.test', false, '{"full_name":"Ana Google"}');
select is((select count(*)::int from public.alumno where user_id = 'a0000000-0000-0000-0000-0000000000e1'), 0,
  'SEC-14: un usuario creado sin confirmar el mail no crea alumno');
update auth.users set email_confirmed_at = now() where id = 'a0000000-0000-0000-0000-0000000000e1';
select is((select estado from public.alumno where user_id = 'a0000000-0000-0000-0000-0000000000e1'), 'ficha_incompleta',
  'CA-01: al confirmar el mail nace el alumno en ficha_incompleta');
select is((select nombre from public.alumno where user_id = 'a0000000-0000-0000-0000-0000000000e1'), 'Ana Google',
  'CA-02: el nombre de Google queda precargado (full_name presente en el UPDATE)');
select is((select mail::text from public.alumno where user_id = 'a0000000-0000-0000-0000-0000000000e1'), 'pgtap.google@example.test',
  'CA-02: el mail queda precargado');
update auth.users set email_confirmed_at = now() where id = 'a0000000-0000-0000-0000-0000000000e1';
update auth.users set last_sign_in_at = now() where id = 'a0000000-0000-0000-0000-0000000000e1';
select is((select count(*)::int from public.alumno where user_id = 'a0000000-0000-0000-0000-0000000000e1'), 1,
  'ALU-01: el trigger es idempotente (reconfirmar o ingresar de nuevo no duplica)');
select is((select ultimo_ingreso from public.alumno where user_id = 'a0000000-0000-0000-0000-0000000000e1'), '2026-11-02 15:00:00+00'::timestamptz,
  'ALU-11: el último ingreso sale de app_ahora()');

-- B. Insert ya confirmado (fixtures) y nombre largo (SEC-09) ----------------------------------------------
select pg_temp.usuario('a0000000-0000-0000-0000-0000000000e2', 'pgtap.codigo@example.test', true);
select is((select estado || '|' || coalesce(nombre, '<nulo>') from public.alumno where user_id = 'a0000000-0000-0000-0000-0000000000e2'),
  'ficha_incompleta|<nulo>', 'CA-01: el insert ya confirmado también crea el alumno, sin nombre si no hay full_name');
select pg_temp.usuario('a0000000-0000-0000-0000-0000000000e3', 'pgtap.largo@example.test', true, jsonb_build_object('full_name', repeat('x', 150)));
select is((select char_length(nombre) from public.alumno where user_id = 'a0000000-0000-0000-0000-0000000000e3'), 100,
  'SEC-09: el nombre de Google se recorta a 100 caracteres');

-- C. Profesor (ADR-015, SEC-15) ------------------------------------------------------------------------------
select pg_temp.usuario('a0000000-0000-0000-0000-00000000000a', 'PgTap.Profesor@Example.test', true);
select is((select user_id from public.profesor where id = current_setting('rtc.pa')::uuid), 'a0000000-0000-0000-0000-00000000000a'::uuid,
  'SEC-15: el mail del profesor (con otras mayúsculas) confirmado vincula profesor.user_id');
select is((select user_id from public.profesor where id = current_setting('rtc.pb')::uuid), null::uuid,
  'ADR-018: el ingreso del profesor A no vincula a la profesora B (cada mail, su profesor)');
select is((select count(*)::int from public.alumno where user_id = 'a0000000-0000-0000-0000-00000000000a'), 0,
  'SEC-15: el profesor no recibe fila de alumno');

-- D. Revinculación conservando el estado (ADR-013) -----------------------------------------------------------
insert into public.alumno (id, estado, nombre, mail, telefono, fecha_nacimiento, ficha_completada_en, ficha_origen_profesor_id, creado_por)
values ('b0000000-0000-0000-0000-0000000000e4', 'completa', 'Alumno viejo', 'pgtap.vuelve@example.test',
        '+598 99123456', '2000-01-01', '2026-10-01 10:00+00', current_setting('rtc.pa')::uuid, current_setting('rtc.pa')::uuid);
insert into public.inscripcion (alumno_id, profesor_id, estado, como_llego, aprobado_en)
values ('b0000000-0000-0000-0000-0000000000e4', current_setting('rtc.pa')::uuid, 'aprobado', 'Amigos', '2026-10-01 10:00+00');
select pg_temp.usuario('a0000000-0000-0000-0000-0000000000e4', 'pgtap.vuelve@example.test', true);
select is((select a.id::text || '|' || i.estado from public.alumno a join public.inscripcion i on i.alumno_id = a.id where a.user_id = 'a0000000-0000-0000-0000-0000000000e4'),
  'b0000000-0000-0000-0000-0000000000e4|aprobado', 'ALU-01: un alumno dado de alta sin usuario se vincula al confirmar y conserva su inscripción aprobada');
delete from auth.users where id = 'a0000000-0000-0000-0000-0000000000e4';
select is((select user_id from public.alumno where id = 'b0000000-0000-0000-0000-0000000000e4'), null::uuid,
  'ADR-013: al borrar el usuario de Auth el alumno queda sin user_id');
select pg_temp.usuario('a0000000-0000-0000-0000-0000000000e5', 'PGTAP.vuelve@example.test', true);
select is((select a.id::text || '|' || a.estado || '|' || i.estado from public.alumno a join public.inscripcion i on i.alumno_id = a.id where a.user_id = 'a0000000-0000-0000-0000-0000000000e5'),
  'b0000000-0000-0000-0000-0000000000e4|completa|aprobado', 'ADR-013: el usuario nuevo con el mismo mail se revincula conservando ficha, id e inscripción');
select is((select count(*)::int from public.alumno where lower(mail::text) = 'pgtap.vuelve@example.test'), 1,
  'ADR-013: la revinculación no crea un alumno nuevo');

-- Un alumno borrado no se revincula: nace una cuenta nueva.
insert into public.alumno (id, estado, mail) values
  ('b0000000-0000-0000-0000-0000000000f1', 'borrado', 'pgtap.borrado@example.test');
select pg_temp.usuario('a0000000-0000-0000-0000-0000000000f1', 'pgtap.borrado@example.test', true);
select is((select estado from public.alumno where user_id = 'a0000000-0000-0000-0000-0000000000f1'), 'ficha_incompleta',
  'ADR-013: un alumno borrado no se revincula; nace una cuenta nueva en ficha_incompleta');

-- E. Sin confirmar no vincula (SEC-14) -------------------------------------------------------------------------
insert into public.alumno (id, estado, nombre, mail, telefono, fecha_nacimiento, ficha_completada_en, creado_por) values
  ('b0000000-0000-0000-0000-0000000000e6', 'completa', 'Alta del profesor', 'pgtap.sinvinculo@example.test', '+598 99123457', '1995-03-03', '2026-10-01 10:00+00', current_setting('rtc.pa')::uuid);
insert into public.inscripcion (alumno_id, profesor_id, estado, aprobado_en) values
  ('b0000000-0000-0000-0000-0000000000e6', current_setting('rtc.pa')::uuid, 'aprobado', '2026-10-01 10:00+00');
select pg_temp.usuario('a0000000-0000-0000-0000-0000000000e6', 'pgtap.sinvinculo@example.test', false);
select is((select user_id from public.alumno where id = 'b0000000-0000-0000-0000-0000000000e6'), null::uuid,
  'SEC-14: un usuario sin confirmar no se vincula a un alumno existente con su mail');
select pg_temp.como('a0000000-0000-0000-0000-0000000000e6', 'select public.sesion_actual()::text', 'sinconf');
select is(current_setting('rtc.sinconf_est'), 'PT401', 'SEC-14: sesion_actual de un usuario sin confirmar y sin vínculo da 401');
select is(current_setting('rtc.sinconf_msg'), 'NO_AUTENTICADO', 'SEC-14: el mensaje es NO_AUTENTICADO');
select pg_temp.como('a0000000-0000-0000-0000-0000000000e6', 'select public.completar_ficha(''X'', ''+598 99123456'', ''2000-01-01'', ''pgtap4-uno'', ''Y'')::text', 'sinconf2');
select is(current_setting('rtc.sinconf2_est'), 'PT403', 'SEC-14: un usuario sin confirmar no completa ficha (403)');
update auth.users set email_confirmed_at = now() where id = 'a0000000-0000-0000-0000-0000000000e6';
select is((select user_id from public.alumno where id = 'b0000000-0000-0000-0000-0000000000e6'), 'a0000000-0000-0000-0000-0000000000e6'::uuid,
  'SEC-14: al confirmar el mail el mismo usuario sí se vincula');

-- F. sesion_actual y motivo_rechazo (ALU-03, WEB-03, SEC-16) -------------------------------------------------
select pg_temp.usuario('a0000000-0000-0000-0000-0000000000e9', 'pgtap.rechazado@example.test', true);
update public.alumno set estado = 'completa', nombre = 'Rechazada', telefono = '+598 99123458', fecha_nacimiento = '1990-01-01', ficha_completada_en = '2026-10-01 10:00+00'
 where user_id = 'a0000000-0000-0000-0000-0000000000e9';
insert into public.inscripcion (alumno_id, profesor_id, estado, motivo_estado)
select id, current_setting('rtc.pa')::uuid, 'rechazado', 'Sin cupo este mes' from public.alumno where user_id = 'a0000000-0000-0000-0000-0000000000e9';
insert into public.inscripcion (alumno_id, profesor_id, estado)
select id, current_setting('rtc.pb')::uuid, 'pendiente' from public.alumno where user_id = 'a0000000-0000-0000-0000-0000000000e9';
select pg_temp.como('a0000000-0000-0000-0000-0000000000e9', 'select public.sesion_actual()::text', 'sesrech');
select is((select i ->> 'motivo_rechazo' from jsonb_array_elements(current_setting('rtc.sesrech_res')::jsonb -> 'inscripciones') i where i ->> 'profesor_id' = current_setting('rtc.pa')),
  'Sin cupo este mes', 'WEB-03/CA-45: rechazado ve el motivo junto al profesor que lo rechazó');
select is((select i ->> 'estado' || '|' || coalesce(i ->> 'motivo_rechazo', '-') from jsonb_array_elements(current_setting('rtc.sesrech_res')::jsonb -> 'inscripciones') i where i ->> 'profesor_id' = current_setting('rtc.pb')),
  'pendiente|-', 'CA-07/ALU-14: el estado con el otro profesor es suyo (pendiente, sin motivo)');
select pg_temp.como('a0000000-0000-0000-0000-0000000000e6', 'select public.sesion_actual()::text', 'sesapr');
select is(((current_setting('rtc.sesapr_res')::jsonb) -> 'inscripciones' -> 0 -> 'motivo_rechazo')::text, 'null', 'WEB-03: motivo_rechazo es nulo si la inscripción no está rechazada (aprobada)');
update public.inscripcion set motivo_estado = 'Resto de un rechazo anterior' where alumno_id = 'b0000000-0000-0000-0000-0000000000e6';
select pg_temp.como('a0000000-0000-0000-0000-0000000000e6', 'select public.sesion_actual()::text', 'sesapr2');
select is(((current_setting('rtc.sesapr2_res')::jsonb) -> 'inscripciones' -> 0 -> 'motivo_rechazo')::text, 'null', 'WEB-03: motivo_estado no se filtra si la inscripción no está rechazada');
select pg_temp.como('a0000000-0000-0000-0000-00000000000a', 'select public.sesion_actual()::text', 'sesprof');
select is(current_setting('rtc.sesprof_res')::jsonb ->> 'rol', 'profesor', 'ALU-02: sesion_actual del profesor devuelve rol profesor');
select is(current_setting('rtc.sesprof_res')::jsonb -> 'inscripciones', '[]'::jsonb, 'WEB-03: el profesor no trae inscripciones (ni motivo de rechazo)');
select is(current_setting('rtc.sesprof_res')::jsonb -> 'profesor' ->> 'slug', 'pgtap4-uno', 'ADR-020: sesion_actual del profesor trae su slug');

-- G. completar_ficha: validaciones (CA-02, ALU-02, SEC-09) --------------------------------------------------
select pg_temp.como('a0000000-0000-0000-0000-0000000000e2', 'select public.completar_ficha('''', ''+598 99123456'', ''2000-01-01'', ''pgtap4-uno'', ''Amigos'')::text', 'fnom');
select is(current_setting('rtc.fnom_est') || current_setting('rtc.fnom_det')::jsonb::text, 'PT422{"campo": "p_nombre"}', 'T-ALU-05: sin nombre se rechaza con 422 y el campo');
select pg_temp.como('a0000000-0000-0000-0000-0000000000e2', 'select public.completar_ficha(''Ana'', '''', ''2000-01-01'', ''pgtap4-uno'', ''Amigos'')::text', 'ftel');
select is(current_setting('rtc.ftel_est') || current_setting('rtc.ftel_det')::jsonb::text, 'PT422{"campo": "p_telefono"}', 'T-ALU-05: sin teléfono se rechaza');
select pg_temp.como('a0000000-0000-0000-0000-0000000000e2', 'select public.completar_ficha(''Ana'', ''abc123456'', ''2000-01-01'', ''pgtap4-uno'', ''Amigos'')::text', 'ftel2');
select is(current_setting('rtc.ftel2_est'), 'PT422', 'SEC-09: teléfono con letras se rechaza');
select pg_temp.como('a0000000-0000-0000-0000-0000000000e2', 'select public.completar_ficha(''Ana'', ''+598 99123456'', null, ''pgtap4-uno'', ''Amigos'')::text', 'ffec');
select is(current_setting('rtc.ffec_est') || current_setting('rtc.ffec_det')::jsonb::text, 'PT422{"campo": "p_fecha_nacimiento"}', 'T-ALU-05: sin fecha de nacimiento se rechaza');
select pg_temp.como('a0000000-0000-0000-0000-0000000000e2', 'select public.completar_ficha(''Ana'', ''+598 99123456'', ''2026-11-03'', ''pgtap4-uno'', ''Amigos'')::text', 'ffut');
select is(current_setting('rtc.ffut_est'), 'PT422', 'T-ALU-05: fecha de nacimiento futura (según app_ahora) se rechaza');
select pg_temp.como('a0000000-0000-0000-0000-0000000000e2', 'select public.completar_ficha(''Ana'', ''+598 99123456'', ''2000-01-01'', ''pgtap4-uno'', '''')::text', 'fcom');
select is(current_setting('rtc.fcom_est') || current_setting('rtc.fcom_det')::jsonb::text, 'PT422{"campo": "p_como_llego"}', 'T-ALU-05: sin «cómo llegó» se rechaza');
select pg_temp.como('a0000000-0000-0000-0000-0000000000e2', 'select public.completar_ficha(repeat(''x'', 101), ''+598 99123456'', ''2000-01-01'', ''pgtap4-uno'', ''Amigos'')::text', 'flar');
select is(current_setting('rtc.flar_est'), 'PT422', 'SEC-09: nombre de 101 caracteres se rechaza');
select is((select estado from public.alumno where user_id = 'a0000000-0000-0000-0000-0000000000e2'), 'ficha_incompleta', 'CA-02: con datos inválidos el estado no cambia');

-- Ficha incompleta: no puede cargar personas a cargo (ALU-02)
select pg_temp.como('a0000000-0000-0000-0000-0000000000e2', 'select public.guardar_persona_a_cargo(null, ''Hija'', ''2015-05-05'')::text', 'pcinc');
select is(current_setting('rtc.pcinc_est') || current_setting('rtc.pcinc_msg'), 'PT403FICHA_INCOMPLETA', 'ALU-02: con la ficha incompleta no se cargan personas a cargo');

select pg_temp.como('a0000000-0000-0000-0000-0000000000e2', 'select public.completar_ficha(''Ana Pérez'', ''+598 99123456'', ''2000-01-01'', ''pgtap4-uno'', ''Amigos'')::text', 'fok');
select is(current_setting('rtc.fok_res')::jsonb ->> 'estado', 'completa', 'CA-02: con los 4 campos válidos la ficha queda completa');
select is(current_setting('rtc.fok_res')::jsonb -> 'inscripcion' ->> 'estado', 'pendiente', 'CA-02/ALU-14: la inscripción con el profesor del enlace queda pendiente');
select is((select i.como_llego || '|' || i.estado || '|' || (a.ficha_origen_profesor_id = i.profesor_id)::text from public.alumno a join public.inscripcion i on i.alumno_id = a.id
            where a.user_id = 'a0000000-0000-0000-0000-0000000000e2'), 'Amigos|pendiente|true',
  'CA-02: «cómo llegó» se guarda en la inscripción con ese profesor, que es el de origen de la ficha');
select is((select ficha_completada_en from public.alumno where user_id = 'a0000000-0000-0000-0000-0000000000e2'), '2026-11-02 15:00:00+00'::timestamptz,
  'ALU-13: completar la ficha fija ficha_completada_en con app_ahora()');
select pg_temp.como('a0000000-0000-0000-0000-0000000000e2', 'select public.completar_ficha(''Ana Pérez'', ''+598 99123456'', ''2000-01-01'', ''pgtap4-uno'', ''Amigos'')::text', 'frep');
select is(current_setting('rtc.frep_est') || current_setting('rtc.frep_msg'), 'PT409FICHA_YA_COMPLETA', 'ALU-02: repetir la ficha da 409');
select pg_temp.como('a0000000-0000-0000-0000-00000000000a', 'select public.completar_ficha(''P'', ''+598 99123456'', ''2000-01-01'', ''pgtap4-uno'', ''X'')::text', 'fprof');
select is(current_setting('rtc.fprof_est'), 'PT403', 'SEC-06: el profesor no completa fichas (403)');

-- H. Personas a cargo (ALU-06, SEC-29; T-ALU-15) -------------------------------------------------------------
select pg_temp.como('a0000000-0000-0000-0000-0000000000e2', 'select public.guardar_persona_a_cargo(null, ''Hija de Ana'', ''2015-05-05'')::text', 'pcalta');
select is(current_setting('rtc.pcalta_est'), 'ok', 'T-ALU-15: el alumno con ficha completa da de alta una persona a cargo');
select is((select count(*)::int from public.persona_a_cargo pc join public.alumno a on a.id = pc.alumno_id
            where a.user_id = 'a0000000-0000-0000-0000-0000000000e2' and pc.nombre = 'Hija de Ana'), 1, 'T-ALU-15: la persona queda bajo el alumno titular');
select pg_temp.como('a0000000-0000-0000-0000-0000000000e2',
  format('select public.guardar_persona_a_cargo(%L, ''Hija de Ana M.'', ''2015-05-06'')::text', current_setting('rtc.pcalta_res')::jsonb ->> 'id'), 'pcedit');
select is(current_setting('rtc.pcedit_est'), 'ok', 'T-ALU-15: edita una persona propia');
select pg_temp.como('a0000000-0000-0000-0000-0000000000e6',
  format('select public.guardar_persona_a_cargo(%L, ''Intruso'', ''2015-05-06'')::text', current_setting('rtc.pcalta_res')::jsonb ->> 'id'), 'pcajena');
select is(current_setting('rtc.pcajena_est'), 'PT403', 'T-ALU-15: no se edita una persona a cargo de otro alumno (403)');
select pg_temp.como('a0000000-0000-0000-0000-0000000000e6', 'select public.guardar_persona_a_cargo(gen_random_uuid(), ''X'', ''2015-05-06'')::text', 'pc404');
select is(current_setting('rtc.pc404_est'), 'PT404', 'T-ALU-15: una persona inexistente da 404');
select pg_temp.como('a0000000-0000-0000-0000-0000000000e2', 'select public.guardar_persona_a_cargo(null, '' '', ''2015-05-06'')::text', 'pcnom');
select is(current_setting('rtc.pcnom_est'), 'PT422', 'SEC-09: persona a cargo sin nombre da 422');
select pg_temp.como('a0000000-0000-0000-0000-0000000000e2', 'select public.guardar_persona_a_cargo(null, ''Futuro'', ''2026-12-01'')::text', 'pcfut');
select is(current_setting('rtc.pcfut_est'), 'PT422', 'SEC-09: persona a cargo con nacimiento futuro da 422');
select pg_temp.como('a0000000-0000-0000-0000-0000000000e6', 'select count(*)::text from public.persona_a_cargo', 'pcvis');
select is(current_setting('rtc.pcvis_res'), '0', 'T-ALU-15: otro alumno no ve las personas a cargo ajenas (RLS)');
select pg_temp.como('a0000000-0000-0000-0000-0000000000e6', 'insert into public.persona_a_cargo (alumno_id, nombre) select id, ''Directo'' from public.alumno limit 1', 'pcdir');
select is(current_setting('rtc.pcdir_est'), '42501', 'T-ALU-15: la escritura directa en persona_a_cargo está denegada');
select is((select coalesce(array_agg(column_name::text order by column_name), '{}') from information_schema.columns
            where table_schema = 'public' and table_name = 'persona_a_cargo'
              and column_name not in ('id', 'profesor_id', 'alumno_id', 'nombre', 'fecha_nacimiento')),
  '{}'::text[], 'SEC-29: la persona a cargo guarda solo nombre y fecha de nacimiento (profesor_id queda sin uso hasta la contracción)');

-- I. CHECK de SEC-09 y permisos de SEC-15 ----------------------------------------------------------------------
select throws_ok($$update public.alumno set telefono = '12ab' where id = 'b0000000-0000-0000-0000-0000000000e4'$$, '23514', null,
  'SEC-09: el CHECK rechaza un teléfono con formato inválido');
select throws_ok($$update public.persona_a_cargo set nombre = repeat('x', 101)$$, '23514', null,
  'SEC-09: el CHECK rechaza una persona a cargo con nombre de 101 caracteres');
select pg_temp.como('a0000000-0000-0000-0000-0000000000e6', 'update public.alumno set estado = ''aprobado''', 'upd');
select is(current_setting('rtc.upd_est'), '42501', 'SEC-03: un alumno no cambia su estado por la API (permiso denegado)');
select pg_temp.como('a0000000-0000-0000-0000-0000000000e6', 'update public.profesor set user_id = ''a0000000-0000-0000-0000-0000000000e6''', 'updp');
select is(current_setting('rtc.updp_est'), '42501', 'SEC-15: un usuario autenticado no puede asignarse el rol de profesor');
select pg_temp.como('a0000000-0000-0000-0000-0000000000e6', 'select public.completar_ficha(''X'', ''+598 99123456'', ''2000-01-01'', ''pgtap4-uno'', ''Y'')::text', 'aprob');
select is(current_setting('rtc.aprob_est'), 'PT409', 'SEC-06: un alumno aprobado que repite completar_ficha recibe 409');
select pg_temp.como('a0000000-0000-0000-0000-00000000000a', 'select public.pedir_inscripcion(''pgtap4-dos'', ''x'')::text', 'pedprof');
select is(current_setting('rtc.pedprof_est'), 'PT403', 'SEC-06: el profesor no pide inscripción con otro profesor (403)');
set local role anon;
select throws_ok($$select public.sesion_actual()$$, '42501', null, 'SEC-06: anon no ejecuta sesion_actual');
reset role;

-- J. Tope de fichas con reloj fijo (CA-43, ALU-13, SEC-10) ----------------------------------------------------
update public.alumno set ficha_completada_en = null;
insert into public.alumno (estado, nombre, telefono, fecha_nacimiento, ficha_completada_en, ficha_origen_profesor_id)
select 'completa', 'Ficha ' || g, '+598 99123456', '2000-01-01', '2026-11-02 14:55:00+00', current_setting('rtc.pa')::uuid
  from generate_series(1, 9) g;
select pg_temp.usuario('a0000000-0000-0000-0000-0000000000a8', 'pgtap.ficha10@example.test', true);
select pg_temp.como('a0000000-0000-0000-0000-0000000000a8', 'select public.completar_ficha(''Décima'', ''+598 99123456'', ''2000-01-01'', ''pgtap4-uno'', ''Amigos'')::text', 'f10');
select is(current_setting('rtc.f10_est'), 'ok', 'CA-43: con 9 fichas recientes la décima pasa');
select pg_temp.usuario('a0000000-0000-0000-0000-0000000000a9', 'pgtap.ficha11@example.test', true);
-- H-200: las fichas anteriores sí encolan el mail al profesor (AVI-02); el conteo se toma justo antes del 429.
create temp table _mails_f11 as select count(*) as n from public.mail_salida;
select pg_temp.como('a0000000-0000-0000-0000-0000000000a9', 'select public.completar_ficha(''Undécima'', ''+598 99123456'', ''2000-01-01'', ''pgtap4-uno'', ''Amigos'')::text', 'f11');
select is(current_setting('rtc.f11_est') || current_setting('rtc.f11_msg') || current_setting('rtc.f11_det'), 'PT429LIMITE_EXCEDIDO{"tope": "fichas", "limite": 10}',
  'CA-43: con 10 fichas en la última hora la 11 da 429 LIMITE_EXCEDIDO {"tope":"fichas","limite":10}');
select is((select estado from public.alumno where user_id = 'a0000000-0000-0000-0000-0000000000a9'), 'ficha_incompleta', 'CA-43: la rechazada sigue en ficha_incompleta');
select is((select count(*)::int from public.mail_salida), (select n::int from _mails_f11), 'CA-43: la ficha rechazada no encola mail al profesor');
update privado.reloj_prueba set ahora = '2026-11-02 15:56:00+00';
select pg_temp.como('a0000000-0000-0000-0000-0000000000a9', 'select public.completar_ficha(''Undécima'', ''+598 99123456'', ''2000-01-01'', ''pgtap4-uno'', ''Amigos'')::text', 'f11b');
select is(current_setting('rtc.f11b_est'), 'ok', 'CA-43: a los 61 minutos de las fichas anteriores la 11 se acepta');
-- CA-60 (rama de fichas): el tope es por profesor de origen; con el enlace de B hay lugar aunque A esté en el tope.
update privado.reloj_prueba set ahora = '2026-11-02 15:00:00+00';
select pg_temp.usuario('a0000000-0000-0000-0000-0000000000a7', 'pgtap.ficha.b@example.test', true);
select pg_temp.como('a0000000-0000-0000-0000-0000000000a7', 'select public.completar_ficha(''Con enlace de B'', ''+598 99123456'', ''2000-01-01'', ''pgtap4-dos'', ''Amigos'')::text', 'fb');
select is(current_setting('rtc.fb_est'), 'ok', 'CA-60: con 10 fichas de origen A en la hora, una ficha con el enlace de B se acepta');
select is(current_setting('rtc.fb_res')::jsonb -> 'inscripcion' ->> 'profesor_id', current_setting('rtc.pb'), 'CA-60: la inscripción es con B');
select pg_temp.usuario('a0000000-0000-0000-0000-0000000000a6', 'pgtap.ficha.a2@example.test', true);
select pg_temp.como('a0000000-0000-0000-0000-0000000000a6', 'select public.completar_ficha(''Otra con enlace de A'', ''+598 99123456'', ''2000-01-01'', ''pgtap4-uno'', ''Amigos'')::text', 'fa2');
select is(current_setting('rtc.fa2_est') || current_setting('rtc.fa2_det'), 'PT429{"tope": "fichas", "limite": 10}', 'CA-60: con el enlace de A, que ya tiene 10 en la hora, da 429');

-- K. Sin contraseñas (H-180, SEC-14, ALU-01, ADR-007, ADR-015): un preregistro con contraseña no sobrevive -------
select has_trigger('auth', 'users', 'sin_contrasena', 'H-180: auth.users tiene el trigger sin_contrasena');
select is((select prosecdef from pg_proc where oid = 'privado.sin_contrasena()'::regprocedure), true,
  'H-180: privado.sin_contrasena es security definer');
select is((select proconfig from pg_proc where oid = 'privado.sin_contrasena()'::regprocedure), array['search_path=""'],
  'H-180: privado.sin_contrasena fija search_path vacío');
select is(has_function_privilege('anon', 'privado.sin_contrasena()', 'execute')
          or has_function_privilege('authenticated', 'privado.sin_contrasena()', 'execute'), false,
  'H-180: anon y authenticated no ejecutan privado.sin_contrasena');
-- Profesor antes de su primer ingreso: el atacante hace signUp con su mail y contraseña.
select set_config('rtc.pc', privado.configurar_profesor('pgtap.profesor2@example.test', 'Profesor 2 pgTAP', 'pgtap4-tres')::text, true) is not null as _;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated',
        'pgtap.profesor2@example.test', extensions.crypt('clave-del-atacante', extensions.gen_salt('bf')), now(), now(), '', '', '', '', '{}');
select is((select encrypted_password from auth.users where id = 'a0000000-0000-0000-0000-0000000000b1'), '',
  'H-180: el signUp con contraseña no guarda la contraseña');
update auth.users set encrypted_password = extensions.crypt('otra-clave', extensions.gen_salt('bf')) where id = 'a0000000-0000-0000-0000-0000000000b1';
select is((select encrypted_password from auth.users where id = 'a0000000-0000-0000-0000-0000000000b1'), '',
  'H-180: repetir el signUp sin confirmar tampoco fija contraseña');
-- La víctima confirma el mail con el código; GoTrue puede reescribir la fila entera con el hash que tenía en memoria.
update auth.users set email_confirmed_at = now(), encrypted_password = extensions.crypt('clave-del-atacante', extensions.gen_salt('bf'))
 where id = 'a0000000-0000-0000-0000-0000000000b1';
select is((select (p.user_id = u.id) and u.encrypted_password = '' from public.profesor p, auth.users u
            where u.id = 'a0000000-0000-0000-0000-0000000000b1' and p.id = current_setting('rtc.pc')::uuid), true,
  'H-180: al confirmar se vincula el profesor (ADR-015) y el usuario queda sin contraseña');
update auth.users set encrypted_password = extensions.crypt('clave-nueva', extensions.gen_salt('bf')) where id = 'a0000000-0000-0000-0000-0000000000b1';
select is((select encrypted_password from auth.users where id = 'a0000000-0000-0000-0000-0000000000b1'), '',
  'H-180: después de confirmar tampoco se puede fijar contraseña (updateUser o admin)');
-- Alumno dado de alta por el profesor (ALU-07) preregistrado con contraseña.
insert into public.alumno (id, estado, nombre, mail, telefono, fecha_nacimiento, ficha_completada_en, creado_por) values
  ('b0000000-0000-0000-0000-0000000000b2', 'completa', 'Alta preregistrada', 'pgtap.prereg@example.test', '+598 99123459', '1993-03-03', '2026-10-01 10:00+00', current_setting('rtc.pa')::uuid);
insert into public.inscripcion (alumno_id, profesor_id, estado, aprobado_en) values
  ('b0000000-0000-0000-0000-0000000000b2', current_setting('rtc.pa')::uuid, 'aprobado', '2026-10-01 10:00+00');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated',
        'pgtap.prereg@example.test', extensions.crypt('clave-del-atacante', extensions.gen_salt('bf')), now(), now(), '', '', '', '', '{}');
update auth.users set email_confirmed_at = now() where id = 'a0000000-0000-0000-0000-0000000000b2';
select is((select user_id from public.alumno where id = 'b0000000-0000-0000-0000-0000000000b2'), 'a0000000-0000-0000-0000-0000000000b2'::uuid,
  'ALU-01: el alumno dado de alta se vincula al confirmar el mail');
select is((select encrypted_password from auth.users where id = 'a0000000-0000-0000-0000-0000000000b2'), '',
  'H-180: el alumno vinculado no conserva la contraseña del preregistro');
select is((select count(*)::int from auth.users where encrypted_password <> ''), 0, 'H-180: ningún usuario de Auth tiene contraseña');

select * from finish();
rollback;
