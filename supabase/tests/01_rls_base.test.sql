-- RLS base de B01 (SEC-02, SEC-01, SEC-03, SEC-14; casos T-SOL-19, CA-26, NFR-01): tablas `profesor`, `alumno` y
-- `persona_a_cargo` con los roles anon, alumno A, alumno B, profesor, usuario sin fila y mail sin confirmar.
-- Cada consulta corre con `set local role` y `request.jwt.claims`; el resultado se guarda en un GUC
-- (`rtc.*`) y se compara después con el rol postgres, así pgTAP no necesita permisos de la API.
-- Datos sintéticos (@example.test); todo se deshace con el rollback.
begin;
select plan(21);

-- Usuarios de Auth (los de GoTrue exigen las columnas de token en blanco, no nulas).
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'pgtap.profesor@example.test', now(), now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'pgtap.alumno.a@example.test', now(), now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'pgtap.alumno.b@example.test', now(), now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'pgtap.sinfila@example.test', now(), now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', 'pgtap.sinconfirmar@example.test', null, now(), now(), '', '', '', '');

-- El profesor del seed (si existe) pasa a ser el usuario de prueba durante esta transacción.
update public.profesor set user_id = 'a0000000-0000-0000-0000-00000000000a', mail = 'pgtap.profesor@example.test', nombre = 'Profesor pgTAP';

insert into public.alumno (id, profesor_id, user_id, estado, nombre, mail) values
  ('b0000000-0000-0000-0000-0000000000a1', (select id from public.profesor), 'a0000000-0000-0000-0000-0000000000a1', 'aprobado', 'Alumno A', 'pgtap.alumno.a@example.test'),
  ('b0000000-0000-0000-0000-0000000000b1', (select id from public.profesor), 'a0000000-0000-0000-0000-0000000000b1', 'aprobado', 'Alumno B', 'pgtap.alumno.b@example.test'),
  ('b0000000-0000-0000-0000-0000000000d1', (select id from public.profesor), 'a0000000-0000-0000-0000-0000000000d1', 'aprobado', 'Alumno sin confirmar', 'pgtap.sinconfirmar@example.test');

insert into public.persona_a_cargo (id, profesor_id, alumno_id, nombre) values
  ('c0000000-0000-0000-0000-0000000000a1', (select id from public.profesor), 'b0000000-0000-0000-0000-0000000000a1', 'Hija de A'),
  ('c0000000-0000-0000-0000-0000000000b1', (select id from public.profesor), 'b0000000-0000-0000-0000-0000000000b1', 'Hijo de B');

-- Totales reales (rol postgres) para comparar con lo que ve el profesor.
select set_config('rtc.total_alumnos', (select count(*) from public.alumno)::text, true) is not null as _;
select set_config('rtc.total_personas', (select count(*) from public.persona_a_cargo)::text, true) is not null as _;

-- Alumno A -------------------------------------------------------------------------------------------
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true); end $$;
do $$ begin
  perform set_config('rtc.a_alumnos', (select count(*) from public.alumno)::text, true);
  perform set_config('rtc.a_alumnos_de_b', (select count(*) from public.alumno where id = 'b0000000-0000-0000-0000-0000000000b1')::text, true);
  perform set_config('rtc.a_personas', (select count(*) from public.persona_a_cargo)::text, true);
  perform set_config('rtc.a_personas_de_b', (select count(*) from public.persona_a_cargo where alumno_id = 'b0000000-0000-0000-0000-0000000000b1')::text, true);
  perform set_config('rtc.a_profesor', (select count(*) from public.profesor)::text, true);
  perform set_config('rtc.a_es_profesor', privado.es_profesor()::text, true);
  perform set_config('rtc.a_mi_alumno_id', privado.mi_alumno_id()::text, true);
end $$;
reset role;
select is(current_setting('rtc.a_alumnos'), '1', 'SEC-02: el alumno A ve solo una fila de alumno (la suya)');
select is(current_setting('rtc.a_alumnos_de_b'), '0', 'SEC-02: el alumno A no ve la fila del alumno B (conteo 0)');
select is(current_setting('rtc.a_personas'), '1', 'SEC-02: el alumno A ve solo sus personas a cargo');
select is(current_setting('rtc.a_personas_de_b'), '0', 'SEC-02: el alumno A no ve las personas a cargo de B');
select is(current_setting('rtc.a_profesor'), '0', 'SEC-02: el alumno A no ve la fila del profesor');
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

-- Profesor -------------------------------------------------------------------------------------------
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true); end $$;
do $$ begin
  perform set_config('rtc.p_alumnos', (select count(*) from public.alumno)::text, true);
  perform set_config('rtc.p_personas', (select count(*) from public.persona_a_cargo)::text, true);
  perform set_config('rtc.p_profesor', (select count(*) from public.profesor)::text, true);
  perform set_config('rtc.p_es_profesor', privado.es_profesor()::text, true);
end $$;
reset role;
select is(current_setting('rtc.p_alumnos'), current_setting('rtc.total_alumnos'), 'SEC-02: el profesor lee todos los alumnos');
select is(current_setting('rtc.p_personas'), current_setting('rtc.total_personas'), 'SEC-02: el profesor lee todas las personas a cargo');
select is(current_setting('rtc.p_profesor'), '1', 'SEC-02: el profesor lee su fila de profesor');
select is(current_setting('rtc.p_es_profesor'), 'true', 'SEC-14: es_profesor() es verdadero con el mail confirmado');

-- Usuario autenticado sin fila de alumno ni de profesor ------------------------------------------------
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true); end $$;
do $$ begin
  perform set_config('rtc.c_filas', ((select count(*) from public.alumno) + (select count(*) from public.persona_a_cargo) + (select count(*) from public.profesor))::text, true);
end $$;
reset role;
select is(current_setting('rtc.c_filas'), '0', 'SEC-02: un usuario sin fila de alumno ni de profesor no ve nada');

-- Mail sin confirmar (SEC-14): la fila está vinculada pero la función de rol exige email_confirmed_at ----
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true); end $$;
do $$ begin perform set_config('rtc.d_filas', (select count(*) from public.alumno)::text, true); end $$;
reset role;
select is(current_setting('rtc.d_filas'), '0', 'SEC-14: con el mail sin confirmar el alumno vinculado no ve ni su propia fila');

-- Anon: sin grants ----------------------------------------------------------------------------------------
set local role anon;
do $$ begin
  begin perform 1 from public.alumno; perform set_config('rtc.anon_alumno', 'visible', true);
  exception when insufficient_privilege then perform set_config('rtc.anon_alumno', 'denegado', true); end;
  begin perform 1 from public.persona_a_cargo; perform set_config('rtc.anon_personas', 'visible', true);
  exception when insufficient_privilege then perform set_config('rtc.anon_personas', 'denegado', true); end;
  begin perform 1 from public.profesor; perform set_config('rtc.anon_profesor', 'visible', true);
  exception when insufficient_privilege then perform set_config('rtc.anon_profesor', 'denegado', true); end;
end $$;
reset role;
select is(current_setting('rtc.anon_alumno'), 'denegado', 'SEC-01: anon no puede leer alumno');
select is(current_setting('rtc.anon_personas'), 'denegado', 'SEC-01: anon no puede leer persona_a_cargo');
select is(current_setting('rtc.anon_profesor'), 'denegado', 'SEC-01: anon no puede leer profesor');

-- Escritura directa de un usuario autenticado (SEC-03): toda escritura es por RPC ------------------------
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true); end $$;
do $$ begin
  begin insert into public.alumno (profesor_id, nombre) values ((select id from public.profesor), 'Intruso'); perform set_config('rtc.w_insert', 'permitido', true);
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
