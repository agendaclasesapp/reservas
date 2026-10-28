-- RLS base de B01 adaptada a B14 (SEC-02, SEC-01, SEC-03, SEC-14; casos T-SOL-19, CA-26, CA-50, NFR-01): tablas
-- `profesor`, `alumno`, `inscripcion` y `persona_a_cargo` con los roles anon, alumno A, alumno B, profesor A,
-- profesor B, Administrador, usuario sin fila y mail sin confirmar. Con dos profesores cada uno ve solo lo
-- inscripto con él (ADR-018).
-- Cada consulta corre con `set local role` y `request.jwt.claims`; el resultado se guarda en un GUC
-- (`rtc.*`) y se compara después con el rol postgres, así pgTAP no necesita permisos de la API.
-- Datos sintéticos (@example.test); todo se deshace con el rollback.
begin;
select plan(30);

-- Usuarios de Auth (los de GoTrue exigen las columnas de token en blanco, no nulas).
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'pgtap.profesor@example.test', now(), now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated', 'pgtap.profesor.b@example.test', now(), now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000ad', 'authenticated', 'authenticated', 'pgtap.admin@example.test', now(), now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'pgtap.alumno.a@example.test', now(), now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'pgtap.alumno.b@example.test', now(), now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'pgtap.sinfila@example.test', now(), now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', 'pgtap.sinconfirmar@example.test', null, now(), now(), '', '', '', '');

-- Desde B04 el disparador de ingreso crea una ficha por cada usuario confirmado que no es profesor ni Administrador.
-- El usuario «sin fila» no debe tenerla: se borra; las de A y B se reemplazan más abajo con `on conflict`.
delete from public.alumno where user_id = 'a0000000-0000-0000-0000-0000000000c1';

-- Dos profesores y el Administrador, dados de alta por las funciones del operador (ADR-018); vinculan a los usuarios
-- de arriba. Los profesores del seed quedan intactos.
select set_config('rtc.pa', privado.configurar_profesor('pgtap.profesor@example.test', 'Profesor pgTAP', 'pgtap-uno')::text, true) is not null as _;
select set_config('rtc.pb', privado.configurar_profesor('pgtap.profesor.b@example.test', 'Profesora B pgTAP', 'pgtap-dos')::text, true) is not null as _;
select privado.configurar_administrador('pgtap.admin@example.test');

-- Personas con ficha completa; las tres de los usuarios, inscriptas y aprobadas con el profesor A. `Alumno solo de B`
-- es del profesor B.
insert into public.alumno (id, user_id, estado, nombre, mail, ficha_completada_en) values
  ('b0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a1', 'completa', 'Alumno A', 'pgtap.alumno.a@example.test', now()),
  ('b0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-0000000000b1', 'completa', 'Alumno B', 'pgtap.alumno.b@example.test', now()),
  ('b0000000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-0000000000d1', 'completa', 'Alumno sin confirmar', 'pgtap.sinconfirmar@example.test', now())
on conflict (user_id) do update set id = excluded.id, estado = excluded.estado, nombre = excluded.nombre, mail = excluded.mail;
insert into public.alumno (id, estado, nombre, mail, ficha_completada_en)
values ('b0000000-0000-0000-0000-0000000000e1', 'completa', 'Alumno solo de B', 'pgtap.solo.b@example.test', now());
insert into public.inscripcion (alumno_id, profesor_id, estado, aprobado_en) values
  ('b0000000-0000-0000-0000-0000000000a1', current_setting('rtc.pa')::uuid, 'aprobado', now()),
  ('b0000000-0000-0000-0000-0000000000b1', current_setting('rtc.pa')::uuid, 'aprobado', now()),
  ('b0000000-0000-0000-0000-0000000000d1', current_setting('rtc.pa')::uuid, 'aprobado', now()),
  ('b0000000-0000-0000-0000-0000000000e1', current_setting('rtc.pb')::uuid, 'aprobado', now());

insert into public.persona_a_cargo (id, alumno_id, nombre) values
  ('c0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-0000000000a1', 'Hija de A'),
  ('c0000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-0000000000b1', 'Hijo de B'),
  ('c0000000-0000-0000-0000-0000000000e1', 'b0000000-0000-0000-0000-0000000000e1', 'Hija solo de B');

-- Totales reales (rol postgres) de lo inscripto con el profesor A, para comparar con lo que ve.
select set_config('rtc.total_alumnos', (select count(*) from public.inscripcion where profesor_id = current_setting('rtc.pa')::uuid)::text, true) is not null as _;
select set_config('rtc.total_personas', (select count(*) from public.persona_a_cargo p join public.inscripcion i on i.alumno_id = p.alumno_id
                                           where i.profesor_id = current_setting('rtc.pa')::uuid)::text, true) is not null as _;

-- Alumno A -------------------------------------------------------------------------------------------
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true); end $$;
do $$ begin
  perform set_config('rtc.a_alumnos', (select count(*) from public.alumno)::text, true);
  perform set_config('rtc.a_alumnos_de_b', (select count(*) from public.alumno where id = 'b0000000-0000-0000-0000-0000000000b1')::text, true);
  perform set_config('rtc.a_personas', (select count(*) from public.persona_a_cargo)::text, true);
  perform set_config('rtc.a_personas_de_b', (select count(*) from public.persona_a_cargo where alumno_id = 'b0000000-0000-0000-0000-0000000000b1')::text, true);
  perform set_config('rtc.a_profesor', (select count(*) from public.profesor)::text, true);
  perform set_config('rtc.a_inscripciones', (select count(*) from public.inscripcion)::text, true);
  perform set_config('rtc.a_es_profesor', privado.es_profesor()::text, true);
  perform set_config('rtc.a_mi_alumno_id', privado.mi_alumno_id()::text, true);
end $$;
reset role;
select is(current_setting('rtc.a_alumnos'), '1', 'SEC-02: el alumno A ve solo una fila de alumno (la suya)');
select is(current_setting('rtc.a_alumnos_de_b'), '0', 'SEC-02: el alumno A no ve la fila del alumno B (conteo 0)');
select is(current_setting('rtc.a_personas'), '1', 'SEC-02: el alumno A ve solo sus personas a cargo');
select is(current_setting('rtc.a_personas_de_b'), '0', 'SEC-02: el alumno A no ve las personas a cargo de B');
select is(current_setting('rtc.a_profesor'), '0', 'SEC-02: el alumno A no ve la fila de ningún profesor');
select is(current_setting('rtc.a_inscripciones'), '1', 'SEC-02: el alumno A ve solo su inscripción');
select is(current_setting('rtc.a_es_profesor'), 'false', 'SEC-14: es_profesor() es falso para un alumno');
select is(current_setting('rtc.a_mi_alumno_id'), 'b0000000-0000-0000-0000-0000000000a1', 'SEC-14: mi_alumno_id() devuelve la fila propia');

-- Alumno B -------------------------------------------------------------------------------------------
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true); end $$;
do $$ begin
  perform set_config('rtc.b_alumnos', (select count(*) from public.alumno)::text, true);
  perform set_config('rtc.b_alumnos_de_a', (select count(*) from public.alumno where id = 'b0000000-0000-0000-0000-0000000000a1')::text, true);
  perform set_config('rtc.b_personas', (select count(*) from public.persona_a_cargo)::text, true);
end $$;
reset role;
select is(current_setting('rtc.b_alumnos'), '1', 'SEC-02: el alumno B ve solo su fila');
select is(current_setting('rtc.b_alumnos_de_a'), '0', 'SEC-02: el alumno B no ve la fila del alumno A (CA-26)');
select is(current_setting('rtc.b_personas'), '1', 'SEC-02: el alumno B ve solo sus personas a cargo');

-- Profesor A -----------------------------------------------------------------------------------------
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true); end $$;
do $$ begin
  perform set_config('rtc.p_alumnos', (select count(*) from public.alumno)::text, true);
  perform set_config('rtc.p_personas', (select count(*) from public.persona_a_cargo)::text, true);
  perform set_config('rtc.p_profesor', (select count(*) from public.profesor)::text, true);
  perform set_config('rtc.p_es_profesor', privado.es_profesor()::text, true);
  perform set_config('rtc.p_alumno_de_b', (select count(*) from public.alumno where id = 'b0000000-0000-0000-0000-0000000000e1')::text, true);
end $$;
reset role;
select is(current_setting('rtc.p_alumnos'), current_setting('rtc.total_alumnos'), 'SEC-02: el profesor A lee todos los alumnos inscriptos con él');
select is(current_setting('rtc.p_personas'), current_setting('rtc.total_personas'), 'SEC-02: el profesor A lee las personas a cargo de sus alumnos');
select is(current_setting('rtc.p_profesor'), '1', 'SEC-02: el profesor A lee solo su fila de profesor');
select is(current_setting('rtc.p_alumno_de_b'), '0', 'SEC-02/PRF-07: el profesor A no ve a la persona inscripta solo con B');
select is(current_setting('rtc.p_es_profesor'), 'true', 'SEC-14: es_profesor() es verdadero con el mail confirmado');

-- Profesor B -----------------------------------------------------------------------------------------
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000b","role":"authenticated"}', true); end $$;
do $$ begin
  perform set_config('rtc.pb_alumnos', (select string_agg(nombre, ',' order by nombre) from public.alumno)::text, true);
  perform set_config('rtc.pb_inscripciones_ajenas', (select count(*) from public.inscripcion where profesor_id <> current_setting('rtc.pb')::uuid)::text, true);
  perform set_config('rtc.pb_personas', (select string_agg(nombre, ',') from public.persona_a_cargo)::text, true);
  perform set_config('rtc.pb_profesor', (select count(*) from public.profesor)::text, true);
end $$;
reset role;
select is(current_setting('rtc.pb_alumnos'), 'Alumno solo de B', 'SEC-02: el profesor B ve solo a sus inscriptos (no a los de A)');
select is(current_setting('rtc.pb_inscripciones_ajenas'), '0', 'SEC-02: el profesor B no ve inscripciones de A');
select is(current_setting('rtc.pb_personas'), 'Hija solo de B', 'SEC-02: el profesor B ve solo las personas a cargo de sus alumnos');
select is(current_setting('rtc.pb_profesor'), '1', 'SEC-02: el profesor B ve solo su fila de profesor');

-- Administrador que no es profesor (ADM-04, CA-50): ninguna fila de alumnos ---------------------------------
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000ad","role":"authenticated"}', true); end $$;
do $$ begin
  perform set_config('rtc.adm_filas', ((select count(*) from public.alumno) + (select count(*) from public.persona_a_cargo)
    + (select count(*) from public.inscripcion) + (select count(*) from public.profesor))::text, true);
  perform set_config('rtc.adm_es_profesor', privado.es_profesor()::text, true);
end $$;
reset role;
select is(current_setting('rtc.adm_filas'), '0', 'CA-50/SEC-02: el Administrador no lee ninguna fila de alumno, inscripción, persona a cargo ni profesor');
select is(current_setting('rtc.adm_es_profesor'), 'false', 'SEC-14: es_profesor() es falso para el Administrador');

-- Usuario autenticado sin fila de alumno ni de profesor ------------------------------------------------
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true); end $$;
do $$ begin
  perform set_config('rtc.c_filas', ((select count(*) from public.alumno) + (select count(*) from public.persona_a_cargo) + (select count(*) from public.profesor) + (select count(*) from public.inscripcion))::text, true);
end $$;
reset role;
select is(current_setting('rtc.c_filas'), '0', 'SEC-02: un usuario sin fila de alumno ni de profesor no ve nada');

-- Mail sin confirmar (SEC-14): la fila está vinculada pero la función de rol exige email_confirmed_at ----
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true); end $$;
do $$ begin perform set_config('rtc.d_filas', ((select count(*) from public.alumno) + (select count(*) from public.inscripcion))::text, true); end $$;
reset role;
select is(current_setting('rtc.d_filas'), '0', 'SEC-14: con el mail sin confirmar el alumno vinculado no ve ni su propia ficha ni su inscripción');

-- Anon: sin grants ----------------------------------------------------------------------------------------
set local role anon;
do $$ begin
  begin perform 1 from public.alumno; perform set_config('rtc.anon_alumno', 'visible', true);
  exception when insufficient_privilege then perform set_config('rtc.anon_alumno', 'denegado', true); end;
  begin perform 1 from public.persona_a_cargo; perform set_config('rtc.anon_personas', 'visible', true);
  exception when insufficient_privilege then perform set_config('rtc.anon_personas', 'denegado', true); end;
  begin perform 1 from public.profesor; perform set_config('rtc.anon_profesor', 'visible', true);
  exception when insufficient_privilege then perform set_config('rtc.anon_profesor', 'denegado', true); end;
  begin perform 1 from public.inscripcion; perform set_config('rtc.anon_inscripcion', 'visible', true);
  exception when insufficient_privilege then perform set_config('rtc.anon_inscripcion', 'denegado', true); end;
end $$;
reset role;
select is(current_setting('rtc.anon_alumno'), 'denegado', 'SEC-01: anon no puede leer alumno');
select is(current_setting('rtc.anon_personas'), 'denegado', 'SEC-01: anon no puede leer persona_a_cargo');
select is(current_setting('rtc.anon_profesor'), 'denegado', 'SEC-01: anon no puede leer profesor');
select is(current_setting('rtc.anon_inscripcion'), 'denegado', 'SEC-01: anon no puede leer inscripcion');

-- Escritura directa de un usuario autenticado (SEC-03): toda escritura es por RPC ------------------------
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true); end $$;
do $$ begin
  begin insert into public.alumno (nombre) values ('Intruso'); perform set_config('rtc.w_insert', 'permitido', true);
  exception when insufficient_privilege then perform set_config('rtc.w_insert', 'denegado', true); end;
  begin update public.alumno set nombre = 'Cambiado'; perform set_config('rtc.w_update', 'permitido', true);
  exception when insufficient_privilege then perform set_config('rtc.w_update', 'denegado', true); end;
  begin delete from public.alumno; perform set_config('rtc.w_delete', 'permitido', true);
  exception when insufficient_privilege then perform set_config('rtc.w_delete', 'denegado', true); end;
end $$;
reset role;
select is(current_setting('rtc.w_insert') || ',' || current_setting('rtc.w_update') || ',' || current_setting('rtc.w_delete'),
          'denegado,denegado,denegado', 'SEC-03: ni el profesor escribe directo en alumno (insert, update, delete denegados)');
select is((select count(*) from public.alumno where nombre in ('Intruso', 'Cambiado'))::int, 0, 'SEC-03: la escritura rechazada no dejó datos');

select * from finish();
rollback;
