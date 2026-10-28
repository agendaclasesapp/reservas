-- B14 · T14.5 (a) · RLS cruzada con dos profesores y el Administrador, tabla por tabla y vista por vista.
-- IDs: SEC-02, SEC-32, NFR-01, ADM-04, PRF-07, AGE-10, SOL-09. CA-50, CA-52, CA-54, CA-15 (agenda de un profesor sin datos del otro), CA-26.
-- B06 · T06.3: suma `solicitud` y `v_mis_solicitudes` (una solicitud de reserva de X con A y otra de Z con B).
-- Genérica: recorre todas las tablas y vistas de `public` (también las que traigan los bolts siguientes), de modo que una tabla
-- nueva sin política por profesor la hace fallar. Lo que hay en cada una (dos profesores con datos en todas) se siembra aquí y
-- se compara contra una instantánea escrita a mano. No repite las pruebas de 14_t1_modelo_y_rls (conteos por tabla de A y B).
-- Datos sintéticos (@example.test); todo se deshace con el rollback.
begin;
select plan(24);

-- Ayudas ----------------------------------------------------------------------------------------------------
-- Cuenta las filas que ve `p_sub` en una tabla o vista de public, con rol authenticated y esos claims.
create function pg_temp.contar(p_sub text, p_rel text, p_filtro text default 'true') returns bigint language plpgsql as $f$
declare v bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute format('select count(*) from public.%I where %s', p_rel, p_filtro) into v;
  execute 'reset role';
  return v;
end;
$f$;
-- Instantánea de lo que ve `p_sub`: `relación:filas` de cada tabla o vista de public con filas visibles.
create function pg_temp.visto(p_sub text) returns text language plpgsql as $f$
declare r record; v bigint; res text[] := '{}';
begin
  for r in select c.relname::text as rel from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'v') order by c.relname::text collate "C" loop
    v := pg_temp.contar(p_sub, r.rel);
    if v > 0 then res := res || (r.rel || ':' || v); end if;
  end loop;
  return coalesce(array_to_string(res, ','), '');
end;
$f$;
-- Relaciones con columna profesor_id donde `p_sub` ve filas de un profesor distinto de `p_profesor` (o sin profesor).
-- mail_salida queda fuera: la API no puede leer su profesor_id (privilegio por columna); la cubre la instantánea.
-- alumno y persona_a_cargo quedan fuera: su profesor_id está sin uso (nulo, hasta la contracción de B15) y se limitan por
-- inscripción del profesor (SEC-32); los cubre la instantánea.
create function pg_temp.ajenas(p_sub text, p_profesor uuid) returns text language plpgsql as $f$
declare r record; res text[] := '{}';
begin
  for r in select c.relname::text as rel from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'v') and c.relname not in ('persona_a_cargo', 'alumno')
              and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'profesor_id' and not a.attisdropped
                             and has_column_privilege('authenticated', c.oid, a.attnum, 'select'))
            order by c.relname::text collate "C" loop
    if pg_temp.contar(p_sub, r.rel, format('profesor_id is distinct from %L', p_profesor)) > 0 then res := res || r.rel; end if;
  end loop;
  return coalesce(array_to_string(res, ','), '');
end;
$f$;
create function pg_temp.como(p_sub text, p_sql text, p_rol text default 'authenticated') returns text language plpgsql as $f$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', p_rol)::text, true);
  execute format('set local role %I', p_rol);
  begin
    execute p_sql into v;
    execute 'reset role';
    return coalesce(v, '<nulo>');
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

-- Preparación: reloj fijo (lunes 2026-11-02 12:00 -03), dos profesores, el Administrador y las personas -------------
update privado.reloj_prueba set ahora = '2026-11-02 15:00:00+00';
select set_config('rtc.pa', privado.configurar_profesor('pgtap14r.profa@example.test', 'Profe A', 'pgtap14r-a')::text, true) is not null as _;
select set_config('rtc.pb', privado.configurar_profesor('pgtap14r.profb@example.test', 'Profe B', 'pgtap14r-b')::text, true) is not null as _;
select privado.configurar_administrador('pgtap14r.admin@example.test');
select pg_temp.usuario('e1410000-0000-0000-0000-00000000000a', 'pgtap14r.profa@example.test');
select pg_temp.usuario('e1410000-0000-0000-0000-00000000000b', 'pgtap14r.profb@example.test');
select pg_temp.usuario('e1410000-0000-0000-0000-00000000000d', 'pgtap14r.admin@example.test');
select pg_temp.usuario('e1410000-0000-0000-0000-0000000000a1', 'pgtap14r.x@example.test');      -- X: aprobada con A, pendiente con B
select pg_temp.usuario('e1410000-0000-0000-0000-0000000000a2', 'pgtap14r.z@example.test');      -- Z: solo de B
select pg_temp.usuario('e1410000-0000-0000-0000-0000000000a3', 'pgtap14r.f@example.test');      -- F: ficha incompleta, sin vínculos

update public.alumno set estado = 'completa', nombre = 'Persona X', telefono = '099 111 111', fecha_nacimiento = '1990-01-01',
                         ficha_completada_en = public.app_ahora(), ficha_origen_profesor_id = current_setting('rtc.pa')::uuid
 where user_id = 'e1410000-0000-0000-0000-0000000000a1';
update public.alumno set estado = 'completa', nombre = 'Persona Z', telefono = '099 222 222', fecha_nacimiento = '1991-01-01',
                         ficha_completada_en = public.app_ahora(), ficha_origen_profesor_id = current_setting('rtc.pb')::uuid
 where user_id = 'e1410000-0000-0000-0000-0000000000a2';
select set_config('rtc.x', (select id::text from public.alumno where user_id = 'e1410000-0000-0000-0000-0000000000a1'), true) is not null as _;
select set_config('rtc.z', (select id::text from public.alumno where user_id = 'e1410000-0000-0000-0000-0000000000a2'), true) is not null as _;
-- Y (sin usuario, de A) y W (sin usuario, en baja con A)
insert into public.alumno (id, estado, nombre, telefono, fecha_nacimiento, creado_por, ficha_completada_en) values
  ('e1410000-0000-0000-0000-0000000000f1', 'completa', 'Persona Y', '099 333 333', '1992-01-01', current_setting('rtc.pa')::uuid, public.app_ahora()),
  ('e1410000-0000-0000-0000-0000000000f2', 'completa', 'Persona W', '099 444 444', '1993-01-01', current_setting('rtc.pa')::uuid, public.app_ahora());
insert into public.inscripcion (alumno_id, profesor_id, estado, aprobado_en) values
  (current_setting('rtc.x')::uuid, current_setting('rtc.pa')::uuid, 'aprobado', public.app_ahora()),
  ('e1410000-0000-0000-0000-0000000000f1', current_setting('rtc.pa')::uuid, 'aprobado', public.app_ahora()),
  ('e1410000-0000-0000-0000-0000000000f2', current_setting('rtc.pa')::uuid, 'baja', null),
  (current_setting('rtc.x')::uuid, current_setting('rtc.pb')::uuid, 'pendiente', null),
  (current_setting('rtc.z')::uuid, current_setting('rtc.pb')::uuid, 'aprobado', public.app_ahora());
insert into public.persona_a_cargo (alumno_id, nombre) values
  (current_setting('rtc.x')::uuid, 'Hija de X'),
  (current_setting('rtc.z')::uuid, 'Hijo de Z'),
  ('e1410000-0000-0000-0000-0000000000f2', 'Hija de W');
-- Cada profesor con su bloqueo, su reserva y su clase (A el lunes 09:00, B el lunes 11:00), sus mails y un mail de la aplicación.
insert into public.bloqueo (profesor_id, periodo, motivo) values
  (current_setting('rtc.pa')::uuid, tstzrange('2026-11-02 14:00-03', '2026-11-02 16:00-03', '[)'), 'Bloqueo de A'),
  (current_setting('rtc.pb')::uuid, tstzrange('2026-11-03 14:00-03', '2026-11-03 16:00-03', '[)'), 'Bloqueo de B');
insert into public.reserva (id, profesor_id, alumno_id, tipo, hora_local, dia_semana, duracion_min, estado, desde, origen) values
  ('e1410000-0000-0000-0000-0000000001a1', current_setting('rtc.pa')::uuid, current_setting('rtc.x')::uuid, 'suelta', '09:00', 1, 60, 'confirmada', '2026-11-02', 'solicitud'),
  ('e1410000-0000-0000-0000-0000000001b1', current_setting('rtc.pb')::uuid, current_setting('rtc.z')::uuid, 'suelta', '11:00', 1, 60, 'confirmada', '2026-11-02', 'solicitud');
insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado) values
  (current_setting('rtc.pa')::uuid, 'e1410000-0000-0000-0000-0000000001a1', current_setting('rtc.x')::uuid, '2026-11-02 09:00-03', '2026-11-02 10:00-03', 'confirmada'),
  (current_setting('rtc.pb')::uuid, 'e1410000-0000-0000-0000-0000000001b1', current_setting('rtc.z')::uuid, '2026-11-02 11:00-03', '2026-11-02 12:00-03', 'confirmada');
insert into public.solicitud (profesor_id, alumno_id, tipo, reserva_id, fecha_clase, estado, respondida_en) values
  (current_setting('rtc.pa')::uuid, current_setting('rtc.x')::uuid, 'reserva', 'e1410000-0000-0000-0000-0000000001a1', '2026-11-02 09:00-03', 'confirmada', public.app_ahora()),
  (current_setting('rtc.pb')::uuid, current_setting('rtc.z')::uuid, 'reserva', 'e1410000-0000-0000-0000-0000000001b1', '2026-11-02 11:00-03', 'confirmada', public.app_ahora());
insert into public.mail_salida (profesor_id, alumno_id, tipo, destinatario, asunto, cuerpo_texto, estado, motivo_fallo) values
  (current_setting('rtc.pa')::uuid, current_setting('rtc.x')::uuid, 'clase_creada', 'pgtap14r.x@example.test', 'A', 'a', 'enviado', null),
  (current_setting('rtc.pa')::uuid, current_setting('rtc.x')::uuid, 'clase_creada', 'pgtap14r.x@example.test', 'A', 'a', 'fallido', 'TOPE'),
  (current_setting('rtc.pb')::uuid, current_setting('rtc.z')::uuid, 'clase_creada', 'pgtap14r.z@example.test', 'B', 'b', 'fallido', 'TOPE'),
  (null, null, 'aviso_inactividad', 'pgtap14r.app@example.test', 'App', 'c', 'fallido', 'TOPE');

-- 1. Instantánea por rol (SEC-02, ADM-04, CA-50, CA-52) -------------------------------------------------------------
select is(pg_temp.visto('e1410000-0000-0000-0000-00000000000a'),
  'alumno:2,bloqueo:1,clase:1,grilla_tramo:10,inscripcion:3,mail_salida:2,persona_a_cargo:1,profesor:1,reserva:1,solicitud:1,v_alumnos:2,v_mails_fallidos:1',
  'SEC-02/CA-52: el profesor A ve solo lo suyo en cada tabla y vista (la persona en baja y las fichas ajenas no)');
select is(pg_temp.visto('e1410000-0000-0000-0000-00000000000b'),
  'alumno:2,bloqueo:1,clase:1,grilla_tramo:10,inscripcion:2,mail_salida:1,persona_a_cargo:2,profesor:1,reserva:1,solicitud:1,v_alumnos:2,v_mails_fallidos:1',
  'SEC-02/CA-52: la profesora B ve solo lo suyo; de X, que tiene pendiente con B, ve la ficha y su persona a cargo pero no las clases con A');
select is(pg_temp.visto('e1410000-0000-0000-0000-00000000000d'), '',
  'CA-50/ADM-04: el Administrador que no es profesor no lee ninguna fila de ninguna tabla ni vista de public');
select is(pg_temp.visto('e1410000-0000-0000-0000-0000000000a1'), 'alumno:1,clase:1,inscripcion:2,persona_a_cargo:1,reserva:1,solicitud:1,v_mis_solicitudes:1',
  'SEC-02: la persona X ve su ficha, sus dos inscripciones y sus clases, reservas, solicitudes y personas a cargo; nada de profesores, grillas, bloqueos ni mails');
select is(pg_temp.visto('e1410000-0000-0000-0000-0000000000a3'), 'alumno:1',
  'SEC-02/ALU-14: una persona con la ficha incompleta y sin vínculos ve solo su propia ficha');
select is(pg_temp.visto('e1410000-0000-0000-0000-0000000000a2'), 'alumno:1,clase:1,inscripcion:1,persona_a_cargo:1,reserva:1,solicitud:1,v_mis_solicitudes:1',
  'SEC-02: la persona Z, solo de B, ve únicamente lo suyo (no la ficha de X aunque compartan profesor)');

-- 2. Filas de otro profesor, relación por relación (SEC-32, SEC-02) --------------------------------------------------
select is(pg_temp.ajenas('e1410000-0000-0000-0000-00000000000a', current_setting('rtc.pa')::uuid), '',
  'SEC-02/SEC-32: en ninguna relación con profesor_id el profesor A lee una fila de otro profesor ni de la aplicación');
select is(pg_temp.ajenas('e1410000-0000-0000-0000-00000000000b', current_setting('rtc.pb')::uuid), '',
  'SEC-02/SEC-32: en ninguna relación con profesor_id la profesora B lee una fila de otro profesor ni de la aplicación');
select is(pg_temp.ajenas('e1410000-0000-0000-0000-00000000000d', current_setting('rtc.pa')::uuid), '',
  'SEC-02/ADM-04: el Administrador no lee una sola fila por profesor_id');
select is((select string_agg(rel, ',' order by rel) from (
            select c.relname::text rel from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relkind in ('r', 'v')
               and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'profesor_id' and not a.attisdropped)) t),
  'bloqueo,clase,grilla_tramo,inscripcion,mail_salida,reserva,solicitud,v_mis_solicitudes',
  'SEC-32: la lista de relaciones con profesor_id que recorre la prueba, sin alumno ni persona_a_cargo tras la contracción 0539 (una relación nueva aparece aquí y debe traer su siembra)');
select is(pg_temp.contar('e1410000-0000-0000-0000-00000000000b', 'solicitud', format('alumno_id = %L', current_setting('rtc.x')))
        + pg_temp.contar('e1410000-0000-0000-0000-0000000000a2', 'solicitud', format('alumno_id = %L', current_setting('rtc.x')))
        + pg_temp.contar('e1410000-0000-0000-0000-0000000000a2', 'v_mis_solicitudes', format('profesor_id = %L', current_setting('rtc.pa')))
        + pg_temp.contar('e1410000-0000-0000-0000-00000000000a', 'v_mis_solicitudes'), 0::bigint,
  'SEC-02/SOL-09/CA-26: B no lee la solicitud de X con A, Z no lee la de X ni la de A por v_mis_solicitudes, y un profesor no ve nada por esa vista');
-- Sin pérdida: los mismos datos, vistos como postgres.
select is((select count(*)::int from public.clase where profesor_id in (current_setting('rtc.pa')::uuid, current_setting('rtc.pb')::uuid)), 2,
  'preparación: cada profesor tiene su clase (la prueba compara contra filas que existen)');

-- 3. Fichas incompletas y bajas (SEC-02) ------------------------------------------------------------------------------
select is(pg_temp.contar('e1410000-0000-0000-0000-00000000000a', 'alumno', $$estado = 'ficha_incompleta'$$)
        + pg_temp.contar('e1410000-0000-0000-0000-00000000000b', 'alumno', $$estado = 'ficha_incompleta'$$), 0::bigint,
  'SEC-02: la ficha incompleta (sin inscripción) no la ve ningún profesor');
select is(pg_temp.contar('e1410000-0000-0000-0000-00000000000a', 'persona_a_cargo', $$nombre = 'Hija de W'$$)
        + pg_temp.contar('e1410000-0000-0000-0000-00000000000a', 'v_alumnos', $$nombre = 'Persona W'$$), 0::bigint,
  'SEC-02: una inscripción en baja no da acceso a la ficha ni a su persona a cargo ni a la lista');
update public.inscripcion set estado = 'aprobado' where alumno_id = 'e1410000-0000-0000-0000-0000000000f2';
select is(pg_temp.contar('e1410000-0000-0000-0000-00000000000a', 'persona_a_cargo', $$nombre = 'Hija de W'$$), 1::bigint,
  'SEC-02: al volver de la baja el profesor la vuelve a ver (el acceso lo da la inscripción vigente)');
update public.inscripcion set estado = 'baja' where alumno_id = 'e1410000-0000-0000-0000-0000000000f2';

-- 4. Escritura directa (SEC-03, SEC-02): ningún rol de la API modifica filas de otro profesor ----------------------------
select is(array[
    pg_temp.como('e1410000-0000-0000-0000-00000000000a', format('update public.clase set estado = ''cancelada'' where profesor_id = %L returning 1', current_setting('rtc.pb'))),
    pg_temp.como('e1410000-0000-0000-0000-00000000000a', format('delete from public.bloqueo where profesor_id = %L returning 1', current_setting('rtc.pb'))),
    pg_temp.como('e1410000-0000-0000-0000-00000000000a', format('update public.inscripcion set estado = ''aprobado'' where profesor_id = %L returning 1', current_setting('rtc.pb'))),
    pg_temp.como('e1410000-0000-0000-0000-00000000000d', 'update public.profesor set activo = false returning 1')
  ], array[repeat('42501 permission denied for table ', 1) || 'clase', '42501 permission denied for table bloqueo',
           '42501 permission denied for table inscripcion', '42501 permission denied for table profesor'],
  'SEC-03/SEC-02: update y delete directos sobre lo de otro profesor, o del Administrador sobre profesor, dan 42501');

-- 5. CA-54 / CA-15: la agenda de A y la de B son independientes --------------------------------------------------------
select is((select array_agg(to_char(inicio at time zone 'America/Montevideo', 'HH24:MI') || ' ' || estado order by inicio)
             from public.agenda_publica('pgtap14r-a', '2026-11-02') where inicio < '2026-11-02 13:00-03'),
  array['08:00 libre', '09:00 ocupado', '10:00 libre', '11:00 libre', '12:00 libre'],
  'CA-54: en la agenda de A el lunes 09:00 está ocupado y el 11:00 de B no aparece');
select is((select array_agg(to_char(inicio at time zone 'America/Montevideo', 'HH24:MI') || ' ' || estado order by inicio)
             from public.agenda_publica('pgtap14r-b', '2026-11-02') where inicio < '2026-11-02 13:00-03'),
  array['08:00 libre', '09:00 libre', '10:00 libre', '11:00 ocupado', '12:00 libre'],
  'CA-54: el horario ocupado con A está libre con B, y el de B solo se ve en la agenda de B');
select is((select count(*)::int from public.agenda_publica('pgtap14r-a', '2026-11-03') where estado = 'bloqueado'), 0,
  'CA-54: el bloqueo de B del martes no aparece en la agenda de A');
select set_config('rtc.cfg_b_antes', public.config_publica('pgtap14r-b')::text, true) is not null as _;
select set_config('rtc.agenda_b_antes', (select jsonb_agg(to_jsonb(a) order by inicio)::text from public.agenda_publica('pgtap14r-b', '2026-11-03') a), true) is not null as _;
select is(pg_temp.como('e1410000-0000-0000-0000-00000000000a', $$select public.guardar_configuracion(90, 48, 'Asia/Tokyo')::text$$),
  '{"duracion_min": 90, "zona_horaria": "Asia/Tokyo", "horizonte_semanas": 26, "anticipacion_horas": 48}',
  'CA-54: A cambia su duración, su anticipación y su huso');
select is(pg_temp.como('e1410000-0000-0000-0000-00000000000a', $$select public.guardar_grilla('[{"dia_semana":1,"desde":"10:00","hasta":"12:00"}]'::jsonb)::text$$),
  '[{"desde": "10:00", "hasta": "12:00", "dia_semana": 1}]',
  'CA-54: A reemplaza su grilla por un solo tramo');
select is(public.config_publica('pgtap14r-b')::text || (select jsonb_agg(to_jsonb(a) order by inicio)::text from public.agenda_publica('pgtap14r-b', '2026-11-03') a),
  current_setting('rtc.cfg_b_antes') || current_setting('rtc.agenda_b_antes'),
  'CA-54: la configuración pública y la agenda de B no cambian con lo que hizo A');
select is((select count(*)::int from public.grilla_tramo where profesor_id = current_setting('rtc.pb')::uuid), 10,
  'CA-54: la grilla de B sigue con sus 10 tramos');
select is((select duracion_min || '|' || anticipacion_horas || '|' || zona_horaria from public.profesor where id = current_setting('rtc.pa')::uuid),
  '90|48|Asia/Tokyo', 'CA-54: lo que A guardó quedó en A');

select * from finish();
rollback;
