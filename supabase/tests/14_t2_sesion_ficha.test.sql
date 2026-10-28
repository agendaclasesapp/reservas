-- B14 · T14.2 · Sesión, ficha con profesor de origen, pedido de acceso y personas a cargo con dos profesores.
-- IDs: ALU-02, ALU-03, ALU-06, ALU-13, ALU-14, AGE-11, AVI-02, AVI-07, SEC-06, SEC-09, SEC-10.
-- Pruebas propias del developer; datos sintéticos (@example.test); todo se deshace con el rollback.
begin;
select plan(41);

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

create function pg_temp.r(p_clave text) returns text language sql as $f$
  select current_setting('rtc.' || p_clave || '_est') || ' ' || current_setting('rtc.' || p_clave || '_msg')
$f$;
create function pg_temp.res(p_clave text) returns jsonb language sql as $f$
  select nullif(current_setting('rtc.' || p_clave || '_res'), '')::jsonb
$f$;

create function pg_temp.usuario(p_id uuid, p_mail text) returns void language sql as $f$
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_mail, now(), now(), now(),
          '', '', '', '', '{}')
$f$;

create function pg_temp.persona(p_user uuid) returns uuid language sql as $f$
  select id from public.alumno where user_id = p_user
$f$;

-- Reloj fijo: miércoles 2026-10-21 12:00 en Montevideo (-03). Profesores A y B, Administrador y personas.
update privado.reloj_prueba set ahora = '2026-10-21 15:00:00+00';
select set_config('rtc.pa', privado.configurar_profesor('pgtap142.profa@example.test', 'Profe A', 'pgtap142-a')::text, true) is not null as _;
select set_config('rtc.pb', privado.configurar_profesor('pgtap142.profb@example.test', 'Profe B', 'pgtap142-b')::text, true) is not null as _;
select privado.configurar_administrador('pgtap142.admin@example.test');
select pg_temp.usuario('a1420000-0000-0000-0000-00000000000a', 'pgtap142.profa@example.test');
select pg_temp.usuario('a1420000-0000-0000-0000-00000000000b', 'pgtap142.profb@example.test');
select pg_temp.usuario('a1420000-0000-0000-0000-00000000000d', 'pgtap142.admin@example.test');
select pg_temp.usuario('a1420000-0000-0000-0000-000000000001', 'pgtap142.ana@example.test');
select pg_temp.usuario('a1420000-0000-0000-0000-000000000002', 'pgtap142.beto@example.test');
select pg_temp.usuario('a1420000-0000-0000-0000-000000000003', 'pgtap142.caro@example.test');
select pg_temp.usuario('a1420000-0000-0000-0000-000000000004', 'pgtap142.dani@example.test');
select pg_temp.usuario('a1420000-0000-0000-0000-000000000005', 'pgtap142.eli@example.test');

-- 1. sesion_actual por rol (ADR-020) ------------------------------------------------------------------------
select pg_temp.como('a1420000-0000-0000-0000-00000000000a', 'select public.sesion_actual()::text', 's_pa');
select is(pg_temp.res('s_pa'), jsonb_build_object('rol', 'profesor', 'es_administrador', false,
    'profesor', jsonb_build_object('id', current_setting('rtc.pa')::uuid, 'slug', 'pgtap142-a', 'nombre', 'Profe A', 'activo', true),
    'alumno_id', null, 'estado', null, 'nombre', 'Profe A', 'mail', 'pgtap142.profa@example.test', 'inscripciones', '[]'::jsonb),
  'ADR-020: sesión del profesor con su id, slug, nombre y activo');
select pg_temp.como('a1420000-0000-0000-0000-00000000000d', 'select public.sesion_actual()::text', 's_ad');
select is(pg_temp.res('s_ad'), jsonb_build_object('rol', 'administrador', 'es_administrador', true, 'profesor', null,
    'alumno_id', null, 'estado', null, 'nombre', null, 'mail', 'pgtap142.admin@example.test', 'inscripciones', '[]'::jsonb),
  'ADM-04/ADR-020: sesión del Administrador sin profesor ni alumno');
select pg_temp.como('a1420000-0000-0000-0000-000000000001', 'select public.sesion_actual()::text', 's_ana0');
select is((pg_temp.res('s_ana0') ->> 'rol') || '/' || (pg_temp.res('s_ana0') ->> 'estado') || '/' || (pg_temp.res('s_ana0') -> 'inscripciones')::text,
  'alumno/ficha_incompleta/[]', 'ALU-02: persona nueva con ficha incompleta y sin vínculos');

-- 2. completar_ficha con profesor de origen (ALU-02, ALU-14, AVI-02) -----------------------------------------
select pg_temp.como('a1420000-0000-0000-0000-000000000001',
  $$select public.completar_ficha('Ana Ficha', '099 111 222', '2000-01-01', 'pgtap142-a', '  Por una amiga  ')::text$$, 'f_ana');
select is(pg_temp.res('f_ana'), jsonb_build_object('estado', 'completa',
    'inscripcion', jsonb_build_object('profesor_id', current_setting('rtc.pa')::uuid, 'estado', 'pendiente')),
  'ALU-14: completar la ficha desde el enlace de A crea la inscripción pendiente con A');
select is((select estado || '/' || como_llego from public.inscripcion
            where alumno_id = pg_temp.persona('a1420000-0000-0000-0000-000000000001')),
  'pendiente/Por una amiga', 'DEC-33: «cómo llegaste» queda en la inscripción con A, sin espacios en los bordes');
select is((select estado || '/' || (ficha_origen_profesor_id = current_setting('rtc.pa')::uuid)::text || '/' || (ficha_completada_en = public.app_ahora())::text
             from public.alumno where id = pg_temp.persona('a1420000-0000-0000-0000-000000000001')),
  'completa/true/true', 'ALU-13: la ficha queda completa con A como profesor de origen');
select is((select count(*)::int from public.mail_salida
            where tipo = 'cuenta_nueva' and profesor_id = current_setting('rtc.pa')::uuid
              and destinatario = 'pgtap142.profa@example.test' and remitente_nombre = 'Agenda Clases App' and responder_a is null
              and alumno_id = pg_temp.persona('a1420000-0000-0000-0000-000000000001')), 1,
  'AVI-02/AVI-07: mail de cuenta nueva a A, con el nombre del servicio y sin Reply-To');
select pg_temp.como('a1420000-0000-0000-0000-000000000001',
  $$select public.completar_ficha('Ana Ficha', '099 111 222', '2000-01-01', 'pgtap142-a', 'otra vez')::text$$, 'f_ana2');
select is(pg_temp.r('f_ana2'), 'PT409 FICHA_YA_COMPLETA', 'ALU-02: completar dos veces da 409 FICHA_YA_COMPLETA');

-- Sin enlace: sin vínculo y sin mail (ALU-14, DEC-25).
select pg_temp.como('a1420000-0000-0000-0000-000000000002',
  $$select public.completar_ficha('Beto Ficha', '099 222 333', '1995-02-02')::text$$, 'f_beto');
select is(pg_temp.res('f_beto'), '{"estado":"completa","inscripcion":null}'::jsonb, 'ALU-14: sin slug la ficha se completa sin vínculo');
select is((select count(*)::int from public.inscripcion where alumno_id = pg_temp.persona('a1420000-0000-0000-0000-000000000002'))
          + (select count(*)::int from public.mail_salida where alumno_id = pg_temp.persona('a1420000-0000-0000-0000-000000000002'))
          + (select count(*)::int from public.alumno where id = pg_temp.persona('a1420000-0000-0000-0000-000000000002') and ficha_origen_profesor_id is not null),
  0, 'ALU-14: sin slug no hay inscripción, ni mail, ni profesor de origen');

-- Errores de completar_ficha.
select pg_temp.como('a1420000-0000-0000-0000-000000000003',
  $$select public.completar_ficha('Caro', '099 333 444', '1990-03-03', 'no-existe-142', 'x')::text$$, 'f_404');
select is(pg_temp.r('f_404'), 'PT404 NO_ENCONTRADO', 'AGE-09: completar con un slug desconocido da 404');
select pg_temp.como('a1420000-0000-0000-0000-000000000003',
  $$select public.completar_ficha('Caro', '099 333 444', '1990-03-03', 'pgtap142-a', '   ')::text$$, 'f_422');
select is(pg_temp.r('f_422') || ' ' || current_setting('rtc.f_422_det'), 'PT422 DATOS_INVALIDOS {"campo":"p_como_llego"}',
  'DEC-33/SEC-09: con slug, «cómo llegaste» vacío da 422 p_como_llego');
select pg_temp.como('a1420000-0000-0000-0000-000000000003',
  $$select public.completar_ficha('Caro', '099 333 444', '1990-03-03', 'pgtap142-a', repeat('x', 201))::text$$, 'f_422b');
select is(current_setting('rtc.f_422b_det'), '{"campo":"p_como_llego"}', 'SEC-09: «cómo llegaste» de 201 caracteres da 422');
update public.profesor set activo = false where id = current_setting('rtc.pa')::uuid;
select pg_temp.como('a1420000-0000-0000-0000-000000000003',
  $$select public.completar_ficha('Caro', '099 333 444', '1990-03-03', 'pgtap142-a', 'x')::text$$, 'f_inact');
select is(pg_temp.r('f_inact'), 'PT409 PROFESOR_INACTIVO', 'AGE-11/CA-63: completar_ficha con el slug de un profesor inactivo da 409');
select is((select estado from public.alumno where id = pg_temp.persona('a1420000-0000-0000-0000-000000000003')), 'ficha_incompleta',
  'AGE-11: el 409 no completa la ficha');
update public.profesor set activo = true where id = current_setting('rtc.pa')::uuid;
select pg_temp.como('a1420000-0000-0000-0000-00000000000a',
  $$select public.completar_ficha('Profe', '099 333 444', '1990-03-03')::text$$, 'f_prof');
select pg_temp.como('a1420000-0000-0000-0000-00000000000d',
  $$select public.completar_ficha('Admin', '099 333 444', '1990-03-03')::text$$, 'f_adm');
select is(array[pg_temp.r('f_prof'), pg_temp.r('f_adm')], array['PT403 PROHIBIDO', 'PT403 PROHIBIDO'],
  'SEC-06/DEC-31: profesor y Administrador no completan una ficha de alumno');

-- 3. Tope de fichas por profesor de origen (ALU-13, ADR-019, SEC-10) ------------------------------------------
insert into public.alumno (estado, nombre, telefono, fecha_nacimiento, ficha_completada_en, ficha_origen_profesor_id)
select 'completa', 'Ficha B ' || g, '099 000 0' || lpad(g::text, 2, '0'), '1990-01-01',
       public.app_ahora() - interval '10 minutes', current_setting('rtc.pb')::uuid
  from generate_series(1, 10) g;
insert into public.alumno (estado, nombre, telefono, fecha_nacimiento, ficha_completada_en, ficha_origen_profesor_id)
select 'completa', 'Ficha sin enlace ' || g, '099 000 1' || lpad(g::text, 2, '0'), '1990-01-01',
       public.app_ahora() - interval '59 minutes', null
  from generate_series(1, 9) g;
select pg_temp.como('a1420000-0000-0000-0000-000000000003',
  $$select public.completar_ficha('Caro', '099 333 444', '1990-03-03', 'pgtap142-b', 'Me la recomendaron')::text$$, 'f_topeb');
select is(pg_temp.r('f_topeb') || ' ' || current_setting('rtc.f_topeb_det'), 'PT429 LIMITE_EXCEDIDO {"tope": "fichas", "limite": 10}',
  'ALU-13/CA-60: con 10 fichas en la hora con origen B, la undécima con B da 429');
select is((select count(*)::int from public.inscripcion where alumno_id = pg_temp.persona('a1420000-0000-0000-0000-000000000003'))
          + (select count(*)::int from public.mail_salida where alumno_id = pg_temp.persona('a1420000-0000-0000-0000-000000000003')),
  0, 'ALU-13: el 429 no crea inscripción ni encola mail');
select pg_temp.como('a1420000-0000-0000-0000-000000000003',
  $$select public.completar_ficha('Caro', '099 333 444', '1990-03-03', 'pgtap142-a', 'Me la recomendaron')::text$$, 'f_topea');
select is(pg_temp.r('f_topea'), 'ok ', 'ALU-13/CA-60: el tope de B no frena una ficha con origen A');
-- Cupo sin enlace: Beto ya cuenta (1) + 9 = 10.
select pg_temp.como('a1420000-0000-0000-0000-000000000004',
  $$select public.completar_ficha('Dani', '099 444 555', '1990-04-04')::text$$, 'f_topesin');
select is(pg_temp.r('f_topesin'), 'PT429 LIMITE_EXCEDIDO', 'ALU-13: las fichas sin enlace comparten su propio cupo de 10');
update privado.reloj_prueba set ahora = '2026-10-21 15:01:00+00';
select pg_temp.como('a1420000-0000-0000-0000-000000000004',
  $$select public.completar_ficha('Dani', '099 444 555', '1990-04-04')::text$$, 'f_topesin2');
select is(pg_temp.r('f_topesin2'), 'ok ', 'ALU-13: un minuto después las nueve viejas salen de la ventana móvil y la ficha entra');
update privado.reloj_prueba set ahora = '2026-10-21 15:00:00+00';

-- 4. Fecha de nacimiento en el huso de la aplicación (ADR-018) ------------------------------------------------
update privado.reloj_prueba set ahora = '2026-10-21 02:30:00+00';   -- 20/10 23:30 en Montevideo
update public.profesor set zona_horaria = 'Pacific/Kiritimati';     -- 21/10 16:30 para los profesores
select throws_ok($$select privado.validar_fecha_nacimiento('2026-10-21', 'p_fecha_nacimiento')$$, 'PT422', 'DATOS_INVALIDOS',
  'ADR-018: «hoy» de la ficha sale de zona_horaria_app, no del huso de un profesor');
select lives_ok($$select privado.validar_fecha_nacimiento('2026-10-20', 'p_fecha_nacimiento')$$,
  'ADR-018: el día de hoy en el huso de la aplicación pasa');
update privado.ajustes set zona_horaria_app = 'Pacific/Kiritimati';
select lives_ok($$select privado.validar_fecha_nacimiento('2026-10-21', 'p_fecha_nacimiento')$$,
  'ADR-018: con otro huso de la aplicación cambia «hoy»');
update privado.ajustes set zona_horaria_app = 'America/Montevideo';
update public.profesor set zona_horaria = 'America/Montevideo';
update privado.reloj_prueba set ahora = '2026-10-21 15:00:00+00';

-- 5. pedir_inscripcion (ALU-14, DEC-25, DEC-33, AVI-02) -------------------------------------------------------
select pg_temp.como('a1420000-0000-0000-0000-000000000001', $$select public.pedir_inscripcion('pgtap142-b', 'Por Instagram')::text$$, 'p_ana_b');
select is(pg_temp.res('p_ana_b'), jsonb_build_object('profesor_id', current_setting('rtc.pb')::uuid, 'estado', 'pendiente'),
  'ALU-14: con la ficha completa, pedir acceso a B crea la inscripción pendiente');
select is((select count(*)::int from public.mail_salida where tipo = 'cuenta_nueva' and profesor_id = current_setting('rtc.pb')::uuid
            and destinatario = 'pgtap142.profb@example.test' and alumno_id = pg_temp.persona('a1420000-0000-0000-0000-000000000001')),
  1, 'AVI-02: el pedido de acceso encola el mail de cuenta nueva a B, no a A');
select is((select estado from public.inscripcion where alumno_id = pg_temp.persona('a1420000-0000-0000-0000-000000000001')
            and profesor_id = current_setting('rtc.pa')::uuid), 'pendiente', 'DEC-28: el pedido a B no cambia el vínculo con A');
select pg_temp.como('a1420000-0000-0000-0000-000000000001', $$select public.pedir_inscripcion('pgtap142-a', 'otra vez')::text$$, 'p_dup');
select is(pg_temp.r('p_dup') || ' ' || current_setting('rtc.p_dup_det'), 'PT409 CUENTA_NO_PENDIENTE {"estado": "pendiente"}',
  'ALU-14: con una inscripción vigente, pedir de nuevo da 409 CUENTA_NO_PENDIENTE con su estado');
update public.inscripcion set estado = 'baja', motivo_estado = 'viejo'
 where alumno_id = pg_temp.persona('a1420000-0000-0000-0000-000000000001') and profesor_id = current_setting('rtc.pb')::uuid;
select pg_temp.como('a1420000-0000-0000-0000-000000000001', $$select public.pedir_inscripcion('pgtap142-b', 'Volví')::text$$, 'p_baja');
select is((select estado || '/' || como_llego || '/' || coalesce(motivo_estado, '-') from public.inscripcion
            where alumno_id = pg_temp.persona('a1420000-0000-0000-0000-000000000001') and profesor_id = current_setting('rtc.pb')::uuid),
  'pendiente/Volví/-', 'ALU-14/DEC-26: un pedido sobre una inscripción en baja la vuelve pendiente sin el motivo viejo');
select pg_temp.como('a1420000-0000-0000-0000-000000000005', $$select public.pedir_inscripcion('pgtap142-a', 'x')::text$$, 'p_inc');
select is(pg_temp.r('p_inc'), 'PT403 FICHA_INCOMPLETA', 'ALU-02: con la ficha incompleta no se pide acceso (403 FICHA_INCOMPLETA)');
select pg_temp.como('a1420000-0000-0000-0000-000000000002', $$select public.pedir_inscripcion('no-existe-142', 'x')::text$$, 'p_404');
select is(pg_temp.r('p_404'), 'PT404 NO_ENCONTRADO', 'AGE-09: pedir acceso con un slug desconocido da 404');
select pg_temp.como('a1420000-0000-0000-0000-000000000002', $$select public.pedir_inscripcion('pgtap142-a', '')::text$$, 'p_422');
select is(current_setting('rtc.p_422_det'), '{"campo":"p_como_llego"}', 'DEC-33: pedir acceso sin «cómo llegaste» da 422');
update public.profesor set activo = false where id = current_setting('rtc.pb')::uuid;
select pg_temp.como('a1420000-0000-0000-0000-000000000002', $$select public.pedir_inscripcion('pgtap142-b', 'x')::text$$, 'p_inact');
select is(pg_temp.r('p_inact'), 'PT409 PROFESOR_INACTIVO', 'AGE-11/CA-63: nadie pide acceso a un profesor inactivo');
update public.profesor set activo = true where id = current_setting('rtc.pb')::uuid;
select pg_temp.como('a1420000-0000-0000-0000-00000000000a', $$select public.pedir_inscripcion('pgtap142-b', 'x')::text$$, 'p_prof');
select is(pg_temp.r('p_prof'), 'PT403 PROHIBIDO', 'DEC-31: un profesor no pide acceso a otro');
select ok(has_function_privilege('authenticated', 'public.pedir_inscripcion(text, text)', 'execute')
      and not has_function_privilege('anon', 'public.pedir_inscripcion(text, text)', 'execute'),
  'SEC-04: pedir_inscripcion la ejecuta authenticated y no anon');

-- 6. sesion_actual con inscripciones (ALU-03, WEB-11) ---------------------------------------------------------
update public.inscripcion set estado = 'rechazado', motivo_estado = 'Sin cupo'
 where alumno_id = pg_temp.persona('a1420000-0000-0000-0000-000000000001') and profesor_id = current_setting('rtc.pa')::uuid;
update public.inscripcion set estado = 'aprobado', motivo_estado = 'Bienvenida'
 where alumno_id = pg_temp.persona('a1420000-0000-0000-0000-000000000001') and profesor_id = current_setting('rtc.pb')::uuid;
select pg_temp.como('a1420000-0000-0000-0000-000000000001', 'select public.sesion_actual()::text', 's_ana');
select is(pg_temp.res('s_ana') -> 'inscripciones', jsonb_build_array(
    jsonb_build_object('profesor_id', current_setting('rtc.pa')::uuid, 'slug', 'pgtap142-a', 'profesor_nombre', 'Profe A',
                       'profesor_activo', true, 'estado', 'rechazado', 'motivo_rechazo', 'Sin cupo'),
    jsonb_build_object('profesor_id', current_setting('rtc.pb')::uuid, 'slug', 'pgtap142-b', 'profesor_nombre', 'Profe B',
                       'profesor_activo', true, 'estado', 'aprobado', 'motivo_rechazo', null)),
  'ALU-03/WEB-11: la sesión lista cada vínculo con su estado; el motivo solo junto al profesor que rechazó');
update public.inscripcion set estado = 'baja'
 where alumno_id = pg_temp.persona('a1420000-0000-0000-0000-000000000001') and profesor_id = current_setting('rtc.pa')::uuid;
select pg_temp.como('a1420000-0000-0000-0000-000000000001', 'select public.sesion_actual()::text', 's_ana2');
select is(jsonb_array_length(pg_temp.res('s_ana2') -> 'inscripciones'), 1, 'ADR-020: las inscripciones en baja no aparecen en la sesión');

-- 7. Personas a cargo (ALU-06): de la persona, sin profesor --------------------------------------------------
select pg_temp.como('a1420000-0000-0000-0000-000000000001', $$select public.guardar_persona_a_cargo(null, 'Hija de Ana', '2015-05-05')::text$$, 'pc');
select is((select count(*)::int from public.persona_a_cargo where alumno_id = pg_temp.persona('a1420000-0000-0000-0000-000000000001'))
  || '/' || (select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'persona_a_cargo' and column_name = 'profesor_id'),
  '1/0', 'ALU-06: la persona a cargo es de la cuenta y la tabla ya no tiene columna profesor_id (contracción 0539)');
select pg_temp.como('a1420000-0000-0000-0000-00000000000b',
  $$select count(*)::text from public.persona_a_cargo where nombre = 'Hija de Ana'$$, 'pc_b');
select pg_temp.como('a1420000-0000-0000-0000-00000000000a',
  $$select count(*)::text from public.persona_a_cargo where nombre = 'Hija de Ana'$$, 'pc_a');
select is(current_setting('rtc.pc_b_res') || '/' || current_setting('rtc.pc_a_res'), '1/0',
  'ALU-06/PRF-07: la ve el profesor con vínculo vigente (B) y no el que la tiene en baja (A)');
select pg_temp.como('a1420000-0000-0000-0000-000000000005', $$select public.guardar_persona_a_cargo(null, 'X', '2015-05-05')::text$$, 'pc_inc');
select is(pg_temp.r('pc_inc'), 'PT403 FICHA_INCOMPLETA', 'ALU-02: sin ficha completa no registra personas a cargo');

-- 8. Profesor que además es Administrador (DEC-31) -----------------------------------------------------------
select privado.configurar_administrador('pgtap142.profb@example.test');
select pg_temp.como('a1420000-0000-0000-0000-00000000000b', 'select public.sesion_actual()::text', 's_pb');
select is((pg_temp.res('s_pb') ->> 'rol') || '/' || (pg_temp.res('s_pb') ->> 'es_administrador'), 'profesor/true',
  'DEC-31: un profesor que además es Administrador entra como profesor con es_administrador true');

select * from finish();
rollback;
