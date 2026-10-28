-- B14 · T14.5 (a) · Matriz rol x RPC con dos profesores y el Administrador (SEC-06, SEC-04) y roles excluyentes (DEC-31).
-- IDs: SEC-06, SEC-04, SEC-14, ADM-01, ADM-04, PRF-07. CA-49 (nadie se registra como profesor ni como Administrador),
-- CA-50 (el Administrador no opera sobre alumnos), CA-52 (404 sobre lo de otro profesor, igual al de un id inexistente).
-- Las respuestas se comparan como `sqlstate mensaje`. No repite 14_t2_* (rama feliz y errores propios de cada RPC).
-- Datos sintéticos (@example.test); todo se deshace con el rollback.
begin;
select plan(26);

create function pg_temp.llamar(p_sub text, p_sql text, p_rol text default 'authenticated') returns text language plpgsql as $f$
declare v text;
begin
  perform set_config('request.jwt.claims', case when p_sub is null then '' else json_build_object('sub', p_sub, 'role', p_rol)::text end, true);
  execute format('set local role %I', p_rol);
  begin
    execute p_sql into v;
    execute 'reset role';
    return 'ok';
  exception when others then
    execute 'reset role';
    return sqlstate || ' ' || sqlerrm;
  end;
end;
$f$;
create function pg_temp.usuario(p_id uuid, p_mail text) returns void language sql as $f$
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_mail, now(), now(), now(), '', '', '', '')
$f$;

-- Preparación ---------------------------------------------------------------------------------------------------
update privado.reloj_prueba set ahora = '2026-11-02 15:00:00+00';
select set_config('rtc.pa', privado.configurar_profesor('pgtap14p.profa@example.test', 'Profe A', 'pgtap14p-a')::text, true) is not null as _;
select set_config('rtc.pb', privado.configurar_profesor('pgtap14p.profb@example.test', 'Profe B', 'pgtap14p-b')::text, true) is not null as _;
select privado.configurar_administrador('pgtap14p.admin@example.test');
select pg_temp.usuario('e1411000-0000-0000-0000-00000000000a', 'pgtap14p.profa@example.test');
select pg_temp.usuario('e1411000-0000-0000-0000-00000000000b', 'pgtap14p.profb@example.test');
select pg_temp.usuario('e1411000-0000-0000-0000-00000000000d', 'pgtap14p.admin@example.test');
select pg_temp.usuario('e1411000-0000-0000-0000-0000000000a1', 'pgtap14p.ana@example.test');     -- persona aprobada con A
select pg_temp.usuario('e1411000-0000-0000-0000-0000000000a2', 'pgtap14p.fich@example.test');    -- ficha incompleta
update public.alumno set estado = 'completa', nombre = 'Ana', telefono = '099 123 456', fecha_nacimiento = '1990-01-01', ficha_completada_en = public.app_ahora()
 where user_id = 'e1411000-0000-0000-0000-0000000000a1';
select set_config('rtc.ana', (select id::text from public.alumno where user_id = 'e1411000-0000-0000-0000-0000000000a1'), true) is not null as _;
insert into public.alumno (id, estado, nombre, telefono, fecha_nacimiento, creado_por, ficha_completada_en) values
  ('e1411000-0000-0000-0000-0000000000f1', 'completa', 'Sin cuenta de A', '+598 99123456', '1991-01-01', current_setting('rtc.pa')::uuid, public.app_ahora());
insert into public.inscripcion (alumno_id, profesor_id, estado) values
  (current_setting('rtc.ana')::uuid, current_setting('rtc.pa')::uuid, 'pendiente'),
  ('e1411000-0000-0000-0000-0000000000f1', current_setting('rtc.pa')::uuid, 'sin_cuenta');

-- 1. RPC de profesor [Prof]: anon 42501; persona, ficha incompleta y Administrador 403 PROHIBIDO (SEC-06, CA-50) ------------
-- Orden de cada arreglo: anon, ficha incompleta, persona aprobada, Administrador.
select is(array[
    pg_temp.llamar(null, $$select public.guardar_grilla('[]'::jsonb)$$, 'anon'),
    pg_temp.llamar('e1411000-0000-0000-0000-0000000000a2', $$select public.guardar_grilla('[]'::jsonb)$$),
    pg_temp.llamar('e1411000-0000-0000-0000-0000000000a1', $$select public.guardar_grilla('[]'::jsonb)$$),
    pg_temp.llamar('e1411000-0000-0000-0000-00000000000d', $$select public.guardar_grilla('[]'::jsonb)$$)],
  array['42501 permission denied for function guardar_grilla', 'PT403 PROHIBIDO', 'PT403 PROHIBIDO', 'PT403 PROHIBIDO'],
  'SEC-06: guardar_grilla solo la ejecuta un profesor (anon 42501; ficha incompleta, persona y Administrador 403)');
select is(array[
    pg_temp.llamar(null, $$select public.guardar_configuracion(60, 24, 'America/Montevideo')$$, 'anon'),
    pg_temp.llamar('e1411000-0000-0000-0000-0000000000a2', $$select public.guardar_configuracion(60, 24, 'America/Montevideo')$$),
    pg_temp.llamar('e1411000-0000-0000-0000-0000000000a1', $$select public.guardar_configuracion(60, 24, 'America/Montevideo')$$),
    pg_temp.llamar('e1411000-0000-0000-0000-00000000000d', $$select public.guardar_configuracion(60, 24, 'America/Montevideo')$$)],
  array['42501 permission denied for function guardar_configuracion', 'PT403 PROHIBIDO', 'PT403 PROHIBIDO', 'PT403 PROHIBIDO'],
  'SEC-06: guardar_configuracion solo la ejecuta un profesor');
select is(array[
    pg_temp.llamar(null, format('select public.aprobar_cuenta(%L)', current_setting('rtc.ana')), 'anon'),
    pg_temp.llamar('e1411000-0000-0000-0000-0000000000a2', format('select public.aprobar_cuenta(%L)', current_setting('rtc.ana'))),
    pg_temp.llamar('e1411000-0000-0000-0000-0000000000a1', format('select public.aprobar_cuenta(%L)', current_setting('rtc.ana'))),
    pg_temp.llamar('e1411000-0000-0000-0000-00000000000d', format('select public.aprobar_cuenta(%L)', current_setting('rtc.ana')))],
  array['42501 permission denied for function aprobar_cuenta', 'PT403 PROHIBIDO', 'PT403 PROHIBIDO', 'PT403 PROHIBIDO'],
  'SEC-06/CA-50: aprobar_cuenta no la ejecutan anon, una persona ni el Administrador');
select is(array[
    pg_temp.llamar(null, format('select public.rechazar_cuenta(%L, null)', current_setting('rtc.ana')), 'anon'),
    pg_temp.llamar('e1411000-0000-0000-0000-0000000000a1', format('select public.rechazar_cuenta(%L, null)', current_setting('rtc.ana'))),
    pg_temp.llamar('e1411000-0000-0000-0000-00000000000d', format('select public.rechazar_cuenta(%L, null)', current_setting('rtc.ana'))),
    pg_temp.llamar('e1411000-0000-0000-0000-00000000000d', format('select public.sugerencias_union(%L)', current_setting('rtc.ana')))],
  array['42501 permission denied for function rechazar_cuenta', 'PT403 PROHIBIDO', 'PT403 PROHIBIDO', 'PT403 PROHIBIDO'],
  'SEC-06/CA-50: rechazar_cuenta y sugerencias_union dan 403 a la persona y al Administrador');
select is(array[
    pg_temp.llamar(null, format('select public.unir_alumnos(%L, %L)', current_setting('rtc.ana'), 'e1411000-0000-0000-0000-0000000000f1'), 'anon'),
    pg_temp.llamar('e1411000-0000-0000-0000-0000000000a1', format('select public.unir_alumnos(%L, %L)', current_setting('rtc.ana'), 'e1411000-0000-0000-0000-0000000000f1')),
    pg_temp.llamar('e1411000-0000-0000-0000-00000000000d', format('select public.unir_alumnos(%L, %L)', current_setting('rtc.ana'), 'e1411000-0000-0000-0000-0000000000f1')),
    pg_temp.llamar('e1411000-0000-0000-0000-00000000000d', format('select public.descartar_union(%L, %L)', current_setting('rtc.ana'), 'e1411000-0000-0000-0000-0000000000f1'))],
  array['42501 permission denied for function unir_alumnos', 'PT403 PROHIBIDO', 'PT403 PROHIBIDO', 'PT403 PROHIBIDO'],
  'SEC-06/CA-50: unir_alumnos y descartar_union dan 403 a la persona y al Administrador, y nada cambia');
select is(array[
    pg_temp.llamar(null, $$select public.alta_alumno('X', '099 111 222', '1990-01-01', null)$$, 'anon'),
    pg_temp.llamar('e1411000-0000-0000-0000-0000000000a2', $$select public.alta_alumno('X', '099 111 222', '1990-01-01', null)$$),
    pg_temp.llamar('e1411000-0000-0000-0000-0000000000a1', $$select public.alta_alumno('X', '099 111 222', '1990-01-01', 'pgtap14p.x@example.test')$$),
    pg_temp.llamar('e1411000-0000-0000-0000-00000000000d', $$select public.alta_alumno('X', '099 111 222', '1990-01-01', 'pgtap14p.x@example.test')$$)],
  array['42501 permission denied for function alta_alumno', 'PT403 PROHIBIDO', 'PT403 PROHIBIDO', 'PT403 PROHIBIDO'],
  'SEC-06/CA-50: alta_alumno solo la ejecuta un profesor');
select is(array[
    pg_temp.llamar(null, format('select public.editar_alumno(%L, ''X'', ''099 111 222'', ''1990-01-01'', null)', 'e1411000-0000-0000-0000-0000000000f1'), 'anon'),
    pg_temp.llamar('e1411000-0000-0000-0000-0000000000a1', format('select public.editar_alumno(%L, ''X'', ''099 111 222'', ''1990-01-01'', null)', 'e1411000-0000-0000-0000-0000000000f1')),
    pg_temp.llamar('e1411000-0000-0000-0000-00000000000d', format('select public.editar_alumno(%L, ''X'', ''099 111 222'', ''1990-01-01'', null)', 'e1411000-0000-0000-0000-0000000000f1'))],
  array['42501 permission denied for function editar_alumno', 'PT403 PROHIBIDO', 'PT403 PROHIBIDO'],
  'SEC-06/CA-50: editar_alumno solo la ejecuta un profesor');
select is((select nombre from public.alumno where id = 'e1411000-0000-0000-0000-0000000000f1'), 'Sin cuenta de A',
  'SEC-06: ninguna de esas llamadas rechazadas cambió la ficha');

-- 2. RPC de persona [Alu]: el profesor y el Administrador reciben 403 -------------------------------------------------------
select is(array[
    pg_temp.llamar(null, $$select public.completar_ficha('X', '099 111 222', '2000-01-01', 'pgtap14p-a', 'x')$$, 'anon'),
    pg_temp.llamar('e1411000-0000-0000-0000-00000000000a', $$select public.completar_ficha('X', '099 111 222', '2000-01-01', 'pgtap14p-a', 'x')$$),
    pg_temp.llamar('e1411000-0000-0000-0000-00000000000d', $$select public.completar_ficha('X', '099 111 222', '2000-01-01', 'pgtap14p-a', 'x')$$)],
  array['42501 permission denied for function completar_ficha', 'PT403 PROHIBIDO', 'PT403 PROHIBIDO'],
  'SEC-06/DEC-31: completar_ficha no la ejecutan anon, un profesor ni el Administrador (no hay ficha de profesor)');
select is(array[
    pg_temp.llamar(null, $$select public.pedir_inscripcion('pgtap14p-b', 'x')$$, 'anon'),
    pg_temp.llamar('e1411000-0000-0000-0000-00000000000a', $$select public.pedir_inscripcion('pgtap14p-b', 'x')$$),
    pg_temp.llamar('e1411000-0000-0000-0000-00000000000d', $$select public.pedir_inscripcion('pgtap14p-b', 'x')$$)],
  array['42501 permission denied for function pedir_inscripcion', 'PT403 PROHIBIDO', 'PT403 PROHIBIDO'],
  'SEC-06/DEC-31: pedir_inscripcion no la ejecutan anon, un profesor ni el Administrador');
select is(array[
    pg_temp.llamar(null, $$select public.guardar_persona_a_cargo(null, 'X', '2015-01-01')$$, 'anon'),
    pg_temp.llamar('e1411000-0000-0000-0000-00000000000a', $$select public.guardar_persona_a_cargo(null, 'X', '2015-01-01')$$),
    pg_temp.llamar('e1411000-0000-0000-0000-00000000000d', $$select public.guardar_persona_a_cargo(null, 'X', '2015-01-01')$$)],
  array['42501 permission denied for function guardar_persona_a_cargo', 'PT403 PROHIBIDO', 'PT403 PROHIBIDO'],
  'SEC-06: guardar_persona_a_cargo no la ejecutan anon, un profesor ni el Administrador');
select is(pg_temp.llamar(null, 'select public.sesion_actual()', 'anon'), '42501 permission denied for function sesion_actual',
  'SEC-06: anon no ejecuta sesion_actual');

-- 3. Lo de otro profesor: 404, idéntico al de un id inexistente (SEC-06, CA-52) ---------------------------------------------
-- Orden: sobre lo de A (existe), sobre un id que no existe en ninguna parte; ambos desde la profesora B.
select is(array[
    pg_temp.llamar('e1411000-0000-0000-0000-00000000000b', format('select public.aprobar_cuenta(%L)', current_setting('rtc.ana'))),
    pg_temp.llamar('e1411000-0000-0000-0000-00000000000b', format('select public.aprobar_cuenta(%L)', gen_random_uuid())),
    pg_temp.llamar('e1411000-0000-0000-0000-00000000000b', format('select public.rechazar_cuenta(%L, ''x'')', current_setting('rtc.ana'))),
    pg_temp.llamar('e1411000-0000-0000-0000-00000000000b', format('select public.rechazar_cuenta(%L, ''x'')', gen_random_uuid()))],
  array['PT404 NO_ENCONTRADO', 'PT404 NO_ENCONTRADO', 'PT404 NO_ENCONTRADO', 'PT404 NO_ENCONTRADO'],
  'CA-52/SEC-06: aprobar o rechazar a una persona de A desde B da el mismo 404 que un id inexistente');
select is(array[
    pg_temp.llamar('e1411000-0000-0000-0000-00000000000b', format('select public.sugerencias_union(%L)', current_setting('rtc.ana'))),
    pg_temp.llamar('e1411000-0000-0000-0000-00000000000b', format('select public.unir_alumnos(%L, %L)', current_setting('rtc.ana'), 'e1411000-0000-0000-0000-0000000000f1')),
    pg_temp.llamar('e1411000-0000-0000-0000-00000000000b', format('select public.descartar_union(%L, %L)', current_setting('rtc.ana'), 'e1411000-0000-0000-0000-0000000000f1')),
    pg_temp.llamar('e1411000-0000-0000-0000-00000000000b', format('select public.editar_alumno(%L, ''X'', ''099 111 222'', ''1990-01-01'', null)', 'e1411000-0000-0000-0000-0000000000f1'))],
  array['PT404 NO_ENCONTRADO', 'PT404 NO_ENCONTRADO', 'PT404 NO_ENCONTRADO', 'PT404 NO_ENCONTRADO'],
  'CA-52/SEC-06: sugerencias, unión, descarte y edición sobre lo de A desde B dan 404');
select is((select estado from public.inscripcion where alumno_id = current_setting('rtc.ana')::uuid and profesor_id = current_setting('rtc.pa')::uuid)
          || '/' || (select count(*) from public.alumno where id = 'e1411000-0000-0000-0000-0000000000f1' and nombre = 'Sin cuenta de A'),
  'pendiente/1', 'CA-52: nada de lo de A cambió con las llamadas de B');

-- 4. Nadie se hace profesor ni Administrador por la API (CA-49, ADM-01, SEC-14, SEC-04) ---------------------------------------
select is(array[
    pg_temp.llamar('e1411000-0000-0000-0000-0000000000a1', $$select privado.configurar_profesor('pgtap14p.yo@example.test', 'Yo', 'pgtap14p-yo')$$),
    pg_temp.llamar('e1411000-0000-0000-0000-00000000000a', $$select privado.configurar_profesor('pgtap14p.yo@example.test', 'Yo', 'pgtap14p-yo')$$),
    pg_temp.llamar('e1411000-0000-0000-0000-0000000000a1', $$select privado.configurar_administrador('pgtap14p.ana@example.test')$$),
    pg_temp.llamar('e1411000-0000-0000-0000-00000000000a', $$select privado.configurar_administrador('pgtap14p.profa@example.test')$$)],
  array['42501 permission denied for function configurar_profesor', '42501 permission denied for function configurar_profesor',
        '42501 permission denied for function configurar_administrador', '42501 permission denied for function configurar_administrador'],
  'CA-49/ADM-01: una persona o un profesor no ejecutan configurar_profesor ni configurar_administrador');
select is(array[
    pg_temp.llamar('e1411000-0000-0000-0000-0000000000a1', format('update public.profesor set user_id = %L where id = %L returning 1', 'e1411000-0000-0000-0000-0000000000a1', current_setting('rtc.pb'))),
    pg_temp.llamar('e1411000-0000-0000-0000-0000000000a1', $$insert into privado.administrador (mail) values ('pgtap14p.ana@example.test') returning 1$$),
    pg_temp.llamar('e1411000-0000-0000-0000-00000000000a', $$update privado.administrador set mail = 'pgtap14p.profa@example.test' returning 1$$),
    pg_temp.llamar('e1411000-0000-0000-0000-00000000000a', $$select count(*) from privado.administrador$$)],
  array['42501 permission denied for table profesor', '42501 permission denied for table administrador',
        '42501 permission denied for table administrador', '42501 permission denied for table administrador'],
  'CA-49/ADM-01: UPDATE directo del profesor o INSERT en la tabla de roles dan 42501; ni siquiera se lee quién es el Administrador');
-- B15: `alta_profesor` existe como RPC `[Adm]` (contratos.md §3) y es la única; ninguna otra permite darse de alta.
select is((select coalesce(array_agg(p.proname::text order by p.proname), '{}') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname ~ 'administrador|alta_profesor|configurar|profesor_alta'),
  '{alta_profesor}'::text[], 'CA-49: la única RPC pública de alta de profesores es alta_profesor [Adm]; no hay otra para darse de alta como profesor ni como Administrador');
select is(array[
    pg_temp.llamar(null, $$select public.alta_profesor('pgtap14p.nuevo@example.test', 'Nuevo', 'pgtap14p-nuevo')$$, 'anon'),
    pg_temp.llamar('e1411000-0000-0000-0000-0000000000a2', $$select public.alta_profesor('pgtap14p.nuevo@example.test', 'Nuevo', 'pgtap14p-nuevo')$$),
    pg_temp.llamar('e1411000-0000-0000-0000-0000000000a1', $$select public.alta_profesor('pgtap14p.nuevo@example.test', 'Nuevo', 'pgtap14p-nuevo')$$),
    pg_temp.llamar('e1411000-0000-0000-0000-00000000000a', $$select public.alta_profesor('pgtap14p.nuevo@example.test', 'Nuevo', 'pgtap14p-nuevo')$$),
    pg_temp.llamar('e1411000-0000-0000-0000-00000000000b', $$select public.alta_profesor('pgtap14p.nuevo@example.test', 'Nuevo', 'pgtap14p-nuevo')$$)],
  array['42501 permission denied for function alta_profesor', 'PT403 PROHIBIDO', 'PT403 PROHIBIDO', 'PT403 PROHIBIDO', 'PT403 PROHIBIDO'],
  'CA-49/SEC-06: alta_profesor da 403 a la ficha incompleta, a la persona y a los dos profesores, y 42501 a anon');
select is((select count(*)::int from public.profesor where mail = 'pgtap14p.nuevo@example.test'), 0, 'CA-49: ninguna de esas llamadas creó un profesor');
-- Un mail sin alta entra como persona (DEC-30, DEC-31, SEC-14).
select pg_temp.usuario('e1411000-0000-0000-0000-0000000000a9', 'pgtap14p.cualquiera@example.test');
select is((select public.sesion_actual()::jsonb ->> 'rol' from (select set_config('request.jwt.claims', '{"sub":"e1411000-0000-0000-0000-0000000000a9","role":"authenticated"}', true)) _ ),
  'alumno', 'CA-49: quien entra con un mail sin alta es una persona, no un profesor ni el Administrador');
select is(pg_temp.llamar('e1411000-0000-0000-0000-0000000000a9', $$select privado.es_administrador()$$), '42501 permission denied for function es_administrador',
  'SEC-04: es_administrador no es ejecutable por la API');

-- 5. Administrador que también es profesor (DEC-31, T-ADM-10) ------------------------------------------------------------------
select set_config('rtc.pc', privado.configurar_profesor('pgtap14p.profc@example.test', 'Profe C', 'pgtap14p-c')::text, true) is not null as _;
select pg_temp.usuario('e1411000-0000-0000-0000-00000000000c', 'pgtap14p.profc@example.test');
select privado.configurar_administrador('pgtap14p.profc@example.test');
select is((select public.sesion_actual()::jsonb -> 'profesor' ->> 'slug' || '|' || (public.sesion_actual()::jsonb ->> 'rol') || '|' || (public.sesion_actual()::jsonb ->> 'es_administrador')
             from (select set_config('request.jwt.claims', '{"sub":"e1411000-0000-0000-0000-00000000000c","role":"authenticated"}', true)) _ ),
  'pgtap14p-c|profesor|true', 'DEC-31: el Administrador que es profesor entra como profesor, con es_administrador verdadero');
select is((select count(*)::int from public.alumno where user_id = 'e1411000-0000-0000-0000-00000000000c' or lower(mail::text) = 'pgtap14p.profc@example.test'), 0,
  'DEC-31: el Administrador que es profesor no tiene ficha de alumno ni figura como alumno de nadie');
select is(pg_temp.llamar('e1411000-0000-0000-0000-00000000000c', format('select public.aprobar_cuenta(%L)', current_setting('rtc.ana'))), 'PT404 NO_ENCONTRADO',
  'T-ADM-10: el Administrador que es profesor no opera sobre las personas de A (404)');
select is(pg_temp.llamar('e1411000-0000-0000-0000-00000000000a', $$select public.alta_alumno('X', '099 111 222', '1990-01-01', 'pgtap14p.profc@example.test')$$),
  'PT409 MAIL_YA_REGISTRADO', 'DEC-31: dar de alta como alumno el mail de un profesor que es Administrador da 409');

select * from finish();
rollback;
