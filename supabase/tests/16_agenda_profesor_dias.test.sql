-- B16 · T16.2 · `agenda_profesor_dias(p_desde, p_hasta)` [P]: lectura de 1 a 7 días de la agenda del profesor.
-- IDs: CAL-07, CAL-08, CAL-09, INV-02, INV-03, INV-05, CA-72 (rama base), CA-73 (rama base), CA-85 (rama base),
-- SEC-04, SEC-05, SEC-06, SEC-09, SEC-32, SEC-34. Casos: T-CA-72-01, T-CA-72-04, T-CA-73-01, T-CA-85-01.
-- Reloj fijo: lunes 2026-11-02 12:00 de Montevideo (15:00Z). Profesores A y B con huecos de 30 min. Todo con @example.test y rollback.
begin;
select plan(62);

-- Ayudas -------------------------------------------------------------------------------------------------------------------
-- Ejecuta p_sql con el rol y el `sub` dados y devuelve el valor (texto) o el error `sqlstate mensaje [detalle]`. p_sub nulo = sin JWT.
create function pg_temp.q(p_sub text, p_sql text, p_rol text default 'authenticated') returns text language plpgsql as $f$
declare v text; d text;
begin
  perform set_config('request.jwt.claims',
    case when p_sub is null then '' else json_build_object('sub', p_sub, 'role', p_rol)::text end, true);
  execute format('set local role %I', p_rol);
  begin
    execute p_sql into v;
    execute 'reset role';
    return v;
  exception when others then
    get stacked diagnostics d = pg_exception_detail;
    execute 'reset role';
    return sqlstate || ' ' || sqlerrm || coalesce(' ' || nullif(d, ''), '');
  end;
end;
$f$;
create function pg_temp.usuario(p_id uuid, p_mail text) returns void language sql as $f$
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_mail, now(), now(), now(), '', '', '', '')
$f$;
create function pg_temp.k(p text) returns text language sql as $f$ select current_setting('rtc.' || p) $f$;
create function pg_temp.ua() returns text language sql as $f$ select 'a1600000-0000-0000-0000-00000000000a' $f$;
create function pg_temp.ub() returns text language sql as $f$ select 'a1600000-0000-0000-0000-00000000000b' $f$;
-- Filas (jsonb) de agenda_profesor_dias leídas con la sesión de p_sub.
create function pg_temp.leer(p_sub text, p_desde date, p_hasta date) returns text language sql as $f$
  select pg_temp.q(p_sub, format($$select coalesce(jsonb_agg(to_jsonb(t)), '[]')::text from public.agenda_profesor_dias(%L::date, %L::date) t$$, p_desde, p_hasta))
$f$;
-- Cuántas filas devuelve (o el error).
create function pg_temp.n(p_sub text, p_desde text, p_hasta text) returns text language sql as $f$
  select pg_temp.q(p_sub, format('select count(*)::text from public.agenda_profesor_dias(%L::date, %L::date)', p_desde, p_hasta))
$f$;
-- Persona aprobada del profesor p_prof, con ficha completa y datos personales centinela (SEC-34).
create function pg_temp.persona(p_id uuid, p_nombre text, p_prof uuid, p_n int) returns void language plpgsql as $f$
begin
  insert into public.alumno (id, estado, nombre, telefono, fecha_nacimiento, mail, ficha_completada_en)
  values (p_id, 'completa', p_nombre, '+598 9916000' || p_n, '1990-01-01', 'pgtap16.p' || p_n || '@example.test', '2026-01-01T12:00:00Z');
  insert into public.inscripcion (alumno_id, profesor_id, estado, aprobado_en) values (p_id, p_prof, 'aprobado', '2026-01-01');
end;
$f$;
-- Reserva suelta y su clase de p_min minutos; guarda `rtc.<k>_c` (clase) y `rtc.<k>_r` (reserva).
create function pg_temp.mk(p_k text, p_prof uuid, p_alumno uuid, p_ini timestamptz, p_min int, p_estado text default 'confirmada',
                           p_rest text default 'confirmada', p_pc uuid default null) returns void language plpgsql as $f$
declare v_r uuid := gen_random_uuid(); v_c uuid := gen_random_uuid(); v_l timestamp := p_ini at time zone 'America/Montevideo';
begin
  insert into public.reserva (id, profesor_id, alumno_id, persona_a_cargo_id, tipo, hora_local, dia_semana, duracion_min, estado, desde, origen)
  values (v_r, p_prof, p_alumno, p_pc, 'suelta', v_l::time, extract(isodow from v_l), p_min, p_rest, v_l::date, 'profesor');
  insert into public.clase (id, profesor_id, reserva_id, alumno_id, persona_a_cargo_id, inicio, fin, estado)
  values (v_c, p_prof, v_r, p_alumno, p_pc, p_ini, p_ini + make_interval(mins => p_min), p_estado);
  perform set_config('rtc.' || p_k || '_c', v_c::text, true);
  perform set_config('rtc.' || p_k || '_r', v_r::text, true);
end;
$f$;

-- Preparación: A y B (huecos de 30 min, grilla inicial), una persona sin rol y datos de A y de B en los mismos horarios -------
update privado.reloj_prueba set ahora = '2026-11-02 15:00:00+00';
select set_config('rtc.pa', privado.configurar_profesor('pgtap16.profa@example.test', 'Profe A', 'pgtap16-a')::text, true) is not null as _;
select set_config('rtc.pb', privado.configurar_profesor('pgtap16.profb@example.test', 'Profe B', 'pgtap16-b')::text, true) is not null as _;
update public.profesor set duracion_min = 30 where id in (current_setting('rtc.pa')::uuid, current_setting('rtc.pb')::uuid);
select pg_temp.usuario(pg_temp.ua()::uuid, 'pgtap16.profa@example.test');
select pg_temp.usuario(pg_temp.ub()::uuid, 'pgtap16.profb@example.test');
select pg_temp.usuario('a1600000-0000-0000-0000-000000000001', 'pgtap16.persona@example.test');   -- persona sin rol de profesor

select pg_temp.persona('a1600000-0000-0000-0000-0000000000a1', 'Ana Pgtap16', current_setting('rtc.pa')::uuid, 1);
select pg_temp.persona('a1600000-0000-0000-0000-0000000000a2', 'Bea Pgtap16', current_setting('rtc.pa')::uuid, 2);
select pg_temp.persona('a1600000-0000-0000-0000-0000000000a3', 'Cris Pgtap16', current_setting('rtc.pa')::uuid, 3);
select pg_temp.persona('a1600000-0000-0000-0000-0000000000a4', 'Dani Pgtap16', current_setting('rtc.pa')::uuid, 4);
select pg_temp.persona('a1600000-0000-0000-0000-0000000000a5', 'Eli Pgtap16', current_setting('rtc.pa')::uuid, 5);
select pg_temp.persona('a1600000-0000-0000-0000-0000000000a6', 'Fede Pgtap16', current_setting('rtc.pa')::uuid, 6);
select pg_temp.persona('a1600000-0000-0000-0000-0000000000b1', 'Centinela Alumno de B', current_setting('rtc.pb')::uuid, 7);
insert into public.persona_a_cargo (id, alumno_id, nombre, fecha_nacimiento)
values ('a1600000-0000-0000-0000-0000000000c1', 'a1600000-0000-0000-0000-0000000000a1', 'Hija de Ana Pgtap16', '2015-03-04');

-- A: lunes 10:00 clase de 60 min (con persona a cargo) y 14:00 de 30 con cancelación pendiente; martes: clase cancelada 10:00,
-- solicitud de cancelación rechazada sobre la de 11:00 y reserva rechazada con clase rechazada a las 14:00; miércoles 09:00 clase de 30
-- y un bloqueo 15:00-16:00; jueves 10:00 clase pendiente de una reserva; viernes 09:00 clase y 11:00 destino pendiente de un movimiento.
select pg_temp.mk('c60', current_setting('rtc.pa')::uuid, 'a1600000-0000-0000-0000-0000000000a1', '2026-11-02 10:00-03', 60, 'confirmada', 'confirmada', 'a1600000-0000-0000-0000-0000000000c1');
select pg_temp.mk('ccan', current_setting('rtc.pa')::uuid, 'a1600000-0000-0000-0000-0000000000a6', '2026-11-02 14:00-03', 30);
select pg_temp.mk('xcan', current_setting('rtc.pa')::uuid, 'a1600000-0000-0000-0000-0000000000a2', '2026-11-03 10:00-03', 30, 'cancelada', 'cancelada');
select pg_temp.mk('xrech', current_setting('rtc.pa')::uuid, 'a1600000-0000-0000-0000-0000000000a2', '2026-11-03 11:00-03', 30);
select pg_temp.mk('rrech', current_setting('rtc.pa')::uuid, 'a1600000-0000-0000-0000-0000000000a5', '2026-11-03 14:00-03', 30, 'rechazada', 'rechazada');
select pg_temp.mk('c30', current_setting('rtc.pa')::uuid, 'a1600000-0000-0000-0000-0000000000a3', '2026-11-04 09:00-03', 30);
insert into public.bloqueo (id, profesor_id, periodo, motivo)
values ('a1600000-0000-0000-0000-0000000000d1', current_setting('rtc.pa')::uuid, tstzrange('2026-11-04 15:00-03', '2026-11-04 16:00-03', '[)'), 'Bloqueo de A pgtap16');
select pg_temp.mk('res', current_setting('rtc.pa')::uuid, 'a1600000-0000-0000-0000-0000000000a4', '2026-11-05 10:00-03', 30, 'pendiente', 'pendiente');
select pg_temp.mk('mo', current_setting('rtc.pa')::uuid, 'a1600000-0000-0000-0000-0000000000a5', '2026-11-06 09:00-03', 30);
select pg_temp.mk('md', current_setting('rtc.pa')::uuid, 'a1600000-0000-0000-0000-0000000000a5', '2026-11-06 11:00-03', 30, 'pendiente', 'pendiente');
insert into public.solicitud (id, profesor_id, alumno_id, tipo, alcance, reserva_id, clase_id, fecha_clase, estado) values
  ('a1600000-0000-0000-0000-0000000000e1', current_setting('rtc.pa')::uuid, 'a1600000-0000-0000-0000-0000000000a4', 'reserva', null, pg_temp.k('res_r')::uuid, null, '2026-11-05 10:00-03', 'pendiente'),
  ('a1600000-0000-0000-0000-0000000000e2', current_setting('rtc.pa')::uuid, 'a1600000-0000-0000-0000-0000000000a5', 'movimiento', 'solo_esta', pg_temp.k('md_r')::uuid, pg_temp.k('mo_c')::uuid, '2026-11-06 09:00-03', 'pendiente'),
  ('a1600000-0000-0000-0000-0000000000e3', current_setting('rtc.pa')::uuid, 'a1600000-0000-0000-0000-0000000000a6', 'cancelacion', 'solo_esta', null, pg_temp.k('ccan_c')::uuid, '2026-11-02 14:00-03', 'pendiente'),
  ('a1600000-0000-0000-0000-0000000000e4', current_setting('rtc.pa')::uuid, 'a1600000-0000-0000-0000-0000000000a2', 'cancelacion', 'solo_esta', null, pg_temp.k('xrech_c')::uuid, '2026-11-03 11:00-03', 'rechazada'),
  ('a1600000-0000-0000-0000-0000000000e5', current_setting('rtc.pa')::uuid, 'a1600000-0000-0000-0000-0000000000a5', 'reserva', null, pg_temp.k('rrech_r')::uuid, null, '2026-11-03 14:00-03', 'rechazada');
-- B: clases, solicitud y bloqueo en los mismos horarios que A (lunes 10:00-11:00, miércoles 09:00, bloqueo del miércoles 15:00).
select pg_temp.mk('b60', current_setting('rtc.pb')::uuid, 'a1600000-0000-0000-0000-0000000000b1', '2026-11-02 10:00-03', 60);
select pg_temp.mk('b30', current_setting('rtc.pb')::uuid, 'a1600000-0000-0000-0000-0000000000b1', '2026-11-04 09:00-03', 30);
insert into public.solicitud (id, profesor_id, alumno_id, tipo, alcance, reserva_id, clase_id, fecha_clase, estado)
values ('a1600000-0000-0000-0000-0000000000f1', current_setting('rtc.pb')::uuid, 'a1600000-0000-0000-0000-0000000000b1', 'cancelacion', 'solo_esta', null, pg_temp.k('b30_c')::uuid, '2026-11-04 09:00-03', 'pendiente');
insert into public.bloqueo (id, profesor_id, periodo, motivo)
values ('a1600000-0000-0000-0000-0000000000d2', current_setting('rtc.pb')::uuid, tstzrange('2026-11-04 15:00-03', '2026-11-04 16:00-03', '[)'), 'Bloqueo de B centinela');

-- Lecturas guardadas: A, B y el rango de 7 días.
select set_config('rtc.ra', pg_temp.leer(pg_temp.ua(), '2026-11-02', '2026-11-08'), true) is not null as _;
select set_config('rtc.rb', pg_temp.leer(pg_temp.ub(), '2026-11-02', '2026-11-08'), true) is not null as _;

-- 1. Seguridad: definer, search_path, permisos (SEC-04, SEC-05, SEC-32) --------------------------------------------------------
select is((select p.prosecdef from pg_proc p where p.oid = 'public.agenda_profesor_dias(date,date)'::regprocedure), true,
  'SEC-05: agenda_profesor_dias es security definer');
select is((select p.proconfig from pg_proc p where p.oid = 'public.agenda_profesor_dias(date,date)'::regprocedure), array['search_path=""'],
  'SEC-05: agenda_profesor_dias fija search_path = ''''');
select is((select p.proconfig from pg_proc p where p.oid = 'privado.agenda_profesor_dias(uuid,date,date)'::regprocedure), array['search_path=""'],
  'SEC-05: privado.agenda_profesor_dias fija search_path = ''''');
select is(has_function_privilege('anon', 'public.agenda_profesor_dias(date,date)', 'execute'), false, 'SEC-04: anon no ejecuta agenda_profesor_dias');
select is(has_function_privilege('authenticated', 'public.agenda_profesor_dias(date,date)', 'execute'), true, 'SEC-04: authenticated ejecuta agenda_profesor_dias');
select is(has_function_privilege('anon', 'privado.agenda_profesor_dias(uuid,date,date)', 'execute')
          or has_function_privilege('authenticated', 'privado.agenda_profesor_dias(uuid,date,date)', 'execute'), false,
  'SEC-32: privado.agenda_profesor_dias no es ejecutable por anon ni authenticated');
select is(pg_temp.q(pg_temp.ua(), format($$select count(*)::text from privado.agenda_profesor_dias(%L::uuid, '2026-11-02', '2026-11-02')$$, current_setting('rtc.pa'))),
  '42501 permission denied for function agenda_profesor_dias', 'SEC-32: privado.agenda_profesor_dias no se llama por la API (permiso denegado)');
select is(pg_temp.q(null, $$select count(*)::text from public.agenda_profesor_dias('2026-11-02', '2026-11-08')$$, 'anon'),
  '42501 permission denied for function agenda_profesor_dias', 'SEC-04/SEC-06: anon recibe permiso denegado');

-- 2. Rol: 401 y 403 (SEC-06) ------------------------------------------------------------------------------------------------------
select is(pg_temp.n(null, '2026-11-02', '2026-11-08'), 'PT401 NO_AUTENTICADO', 'SEC-06: authenticated sin sub da 401 NO_AUTENTICADO');
select is(pg_temp.n('a1600000-0000-0000-0000-000000000001', '2026-11-02', '2026-11-08'), 'PT403 PROHIBIDO', 'SEC-06: una persona sin rol de profesor da 403 PROHIBIDO');
select is(pg_temp.n('a1600000-0000-0000-0000-00000000dead', '2026-11-02', '2026-11-08'), 'PT403 PROHIBIDO', 'SEC-06: un sub sin ficha ni profesor da 403 PROHIBIDO');
select is(pg_temp.n('a1600000-0000-0000-0000-000000000001', 'x', '2026-11-08') like 'PT403%' or pg_temp.n('a1600000-0000-0000-0000-000000000001', null, null) = 'PT403 PROHIBIDO', true,
  'SEC-06: el rol se evalúa antes que los parámetros (persona con nulos: 403, no 422)');

-- 3. 422 de p_desde y p_hasta (SEC-09, CAL-07) ------------------------------------------------------------------------------------
select is(pg_temp.n(pg_temp.ua(), '2025-11-01', '2025-11-01'), '0', 'SEC-09: p_desde = hoy − 366 pasa');
select is(pg_temp.n(pg_temp.ua(), '2025-10-31', '2025-10-31'), 'PT422 DATOS_INVALIDOS {"campo":"p_desde"}', 'SEC-09: p_desde = hoy − 367 da 422 p_desde');
select is(pg_temp.n(pg_temp.ua(), '2027-11-03', '2027-11-03') not like 'PT%',  true, 'SEC-09: p_desde = hoy + 366 con p_hasta igual pasa');
select is(pg_temp.n(pg_temp.ua(), '2027-11-04', '2027-11-04'), 'PT422 DATOS_INVALIDOS {"campo":"p_desde"}', 'SEC-09: p_desde = hoy + 367 da 422 p_desde');
select is(pg_temp.n(pg_temp.ua(), '2027-11-03', '2027-11-04'), 'PT422 DATOS_INVALIDOS {"campo":"p_hasta"}', 'SEC-09: p_hasta = hoy + 367 da 422 p_hasta');
select is(pg_temp.n(pg_temp.ua(), '2027-10-28', '2027-11-03') not like 'PT%', true, 'SEC-09: p_hasta = hoy + 366 con 7 días pasa');
select is(pg_temp.n(pg_temp.ua(), '2026-11-03', '2026-11-02'), 'PT422 DATOS_INVALIDOS {"campo":"p_hasta"}', 'SEC-09: p_hasta < p_desde da 422 p_hasta');
select is(pg_temp.n(pg_temp.ua(), '2026-11-02', '2026-11-09'), 'PT422 DATOS_INVALIDOS {"campo":"p_hasta"}', 'CAL-07/SEC-09: 8 días dan 422 p_hasta');
select is(pg_temp.n(pg_temp.ua(), '2026-11-02', '2026-11-08') <> '0' and pg_temp.n(pg_temp.ua(), '2026-11-02', '2026-11-08') not like 'PT%', true, 'CAL-07: 7 días pasan');
select is(pg_temp.n(pg_temp.ua(), '2026-11-02', '2026-11-02') not like 'PT%', true, 'CAL-07: 1 día (p_hasta = p_desde) pasa');
select is(array[pg_temp.n(pg_temp.ua(), null, '2026-11-02'), pg_temp.n(pg_temp.ua(), null, null)],
  array['PT422 DATOS_INVALIDOS {"campo":"p_desde"}', 'PT422 DATOS_INVALIDOS {"campo":"p_desde"}'], 'SEC-09: p_desde nulo da 422 p_desde');
select is(pg_temp.n(pg_temp.ua(), '2026-11-02', null), 'PT422 DATOS_INVALIDOS {"campo":"p_hasta"}', 'SEC-09: p_hasta nulo da 422 p_hasta');

-- 4. Aislamiento entre profesores (INV-02, CA-85 rama base, T-CA-85-01, SEC-34) ----------------------------------------------------
select ok(jsonb_array_length(current_setting('rtc.ra')::jsonb) > 0 and jsonb_array_length(current_setting('rtc.rb')::jsonb) > 0,
  'T-CA-85-01: A y B tienen filas en el rango (hay algo que aislar)');
select is((select count(*)::int from jsonb_array_elements(current_setting('rtc.ra')::jsonb) e
            where e ->> 'clase_id' in (pg_temp.k('b60_c'), pg_temp.k('b30_c')) or e ->> 'solicitud_id' = 'a1600000-0000-0000-0000-0000000000f1'
               or e ->> 'bloqueo_id' = 'a1600000-0000-0000-0000-0000000000d2'), 0, 'INV-02/CA-85: A no ve ninguna clase, solicitud ni bloqueo de B');
select is((select count(*)::int from jsonb_array_elements(current_setting('rtc.rb')::jsonb) e
            where e ->> 'clase_id' in (pg_temp.k('c60_c'), pg_temp.k('c30_c'), pg_temp.k('res_c'), pg_temp.k('mo_c'), pg_temp.k('md_c'), pg_temp.k('ccan_c'))
               or e ->> 'solicitud_id' like 'a1600000-0000-0000-0000-0000000000e%' or e ->> 'bloqueo_id' = 'a1600000-0000-0000-0000-0000000000d1'), 0,
  'INV-02/CA-85: B no ve ninguna clase, solicitud ni bloqueo de A');
select is(((current_setting('rtc.ra')::jsonb)::text ~ 'Centinela|Bloqueo de B'), false, 'SEC-34/CA-85: nada de B (nombres, motivos) en la lectura de A');
select is(((current_setting('rtc.rb')::jsonb)::text ~ 'Pgtap16|Bloqueo de A'), false, 'SEC-34/CA-85: nada de A (nombres, motivos) en la lectura de B');
select is((select count(*)::int from jsonb_array_elements(current_setting('rtc.rb')::jsonb) e where e ->> 'clase_id' = pg_temp.k('b60_c')), 2,
  'INV-02: B ve su propia clase de 60 min del mismo hueco (en dos filas de 30)');
select is((select e ->> 'solicitud_tipo' from jsonb_array_elements(current_setting('rtc.rb')::jsonb) e where e ->> 'clase_id' = pg_temp.k('b30_c')),
  'cancelacion', 'INV-02: la solicitud de B solo aparece en la lectura de B');

-- 5. Igualdad fila a fila con agenda_profesor(p_dia) en cada día (INV-03) --------------------------------------------------------
select is((select count(*)::int from generate_series('2026-11-02'::date, '2026-11-08'::date, '1 day') d(dia)
            where (select coalesce(jsonb_agg(to_jsonb(a)), '[]') from privado.agenda_profesor(current_setting('rtc.pa')::uuid, d.dia::date) a)
                  is distinct from (select coalesce(jsonb_agg(e - array['dia', 'clase_inicio', 'clase_fin', 'solicitud_tipo'] order by n), '[]')
                                      from jsonb_array_elements(current_setting('rtc.ra')::jsonb) with ordinality t(e, n)
                                     where e ->> 'dia' = d.dia::date::text)), 0,
  'INV-03: las 13 columnas de cada día coinciden fila a fila y en orden con agenda_profesor(p_dia) (A, 7 días)');
select is((select count(*)::int from generate_series('2026-11-02'::date, '2026-11-08'::date, '1 day') d(dia)
            where (select coalesce(jsonb_agg(to_jsonb(a)), '[]') from privado.agenda_profesor(current_setting('rtc.pb')::uuid, d.dia::date) a)
                  is distinct from (select coalesce(jsonb_agg(e - array['dia', 'clase_inicio', 'clase_fin', 'solicitud_tipo'] order by n), '[]')
                                      from jsonb_array_elements(current_setting('rtc.rb')::jsonb) with ordinality t(e, n)
                                     where e ->> 'dia' = d.dia::date::text)), 0,
  'INV-03: lo mismo para B');
select is((select jsonb_array_length(current_setting('rtc.ra')::jsonb)),
  (select (count(*))::int from generate_series('2026-11-02'::date, '2026-11-08'::date, '1 day') d(dia), privado.agenda_profesor(current_setting('rtc.pa')::uuid, d.dia::date)),
  'INV-03: el total de filas de 7 días es la suma de las de cada día');
select is(pg_temp.n(pg_temp.ua(), '2026-11-07', '2026-11-08'), '0', 'INV-03: un fin de semana sin grilla ni clases no devuelve filas');
select is((select (jsonb_path_query_array(current_setting('rtc.ra')::jsonb, '$[*].dia')) = (select jsonb_agg(e -> 'dia' order by e ->> 'dia') from jsonb_array_elements(current_setting('rtc.ra')::jsonb) e)),
  true, 'INV-03: las filas salen ordenadas por día');

-- 6. clase_inicio y clase_fin reales (CA-72 rama base, T-CA-72-01) ---------------------------------------------------------------
select is((select count(*)::int from jsonb_array_elements(current_setting('rtc.ra')::jsonb) e where e ->> 'clase_id' = pg_temp.k('c60_c')), 2,
  'T-CA-72-01: la clase de 60 min sobre huecos de 30 llega en dos filas');
select is((select count(distinct (e ->> 'clase_inicio') || '/' || (e ->> 'clase_fin'))::int from jsonb_array_elements(current_setting('rtc.ra')::jsonb) e
            where e ->> 'clase_id' = pg_temp.k('c60_c')), 1, 'T-CA-72-01: las dos filas traen el mismo clase_inicio y clase_fin');
select is((select ((e ->> 'clase_inicio')::timestamptz = '2026-11-02 10:00-03' and (e ->> 'clase_fin')::timestamptz = '2026-11-02 11:00-03')
             from jsonb_array_elements(current_setting('rtc.ra')::jsonb) e where e ->> 'clase_id' = pg_temp.k('c60_c') limit 1), true,
  'T-CA-72-01: clase_inicio 10:00 y clase_fin 11:00 (la duración real, no la del hueco)');
select is((select string_agg(((e ->> 'fin')::timestamptz - (e ->> 'inicio')::timestamptz)::text, ',') from jsonb_array_elements(current_setting('rtc.ra')::jsonb) e
            where e ->> 'clase_id' = pg_temp.k('c60_c')), '00:30:00,00:30:00', 'T-CA-72-01: inicio y fin siguen siendo los del hueco (30 min)');
select is((select ((e ->> 'clase_fin')::timestamptz - (e ->> 'clase_inicio')::timestamptz)::text from jsonb_array_elements(current_setting('rtc.ra')::jsonb) e
            where e ->> 'clase_id' = pg_temp.k('c30_c')), '00:30:00', 'T-CA-72-01: la clase de 30 min trae su duración real');
select is((select count(*)::int from jsonb_array_elements(current_setting('rtc.ra')::jsonb) e where e ->> 'clase_id' is null
             and (e ->> 'clase_inicio' is not null or e ->> 'clase_fin' is not null or e ->> 'solicitud_tipo' is not null)), 0,
  'T-CA-72-01: un hueco sin clase trae clase_inicio, clase_fin y solicitud_tipo nulos');
select is((select (e ->> 'quien_toma') || '/' || (e ->> 'titular') from jsonb_array_elements(current_setting('rtc.ra')::jsonb) e where e ->> 'clase_id' = pg_temp.k('c60_c') limit 1),
  'Hija de Ana Pgtap16/Ana Pgtap16', 'CAL-07: quien_toma es la persona a cargo y titular el titular, como en agenda_profesor');

-- 7. solicitud_tipo de reserva, movimiento y cancelación (CAL-08, DEC-42 A, T-CA-72-04) --------------------------------------------
select is((select e ->> 'solicitud_tipo' from jsonb_array_elements(current_setting('rtc.ra')::jsonb) e where e ->> 'clase_id' = pg_temp.k('res_c')),
  'reserva', 'CAL-08: la clase pendiente de una reserva trae solicitud_tipo reserva');
select is((select e ->> 'solicitud_tipo' from jsonb_array_elements(current_setting('rtc.ra')::jsonb) e where e ->> 'clase_id' = pg_temp.k('mo_c')),
  'movimiento', 'T-CA-72-04/CAL-08: la clase de origen de un movimiento pendiente trae solicitud_tipo movimiento');
select is((select e ->> 'clase_estado' from jsonb_array_elements(current_setting('rtc.ra')::jsonb) e where e ->> 'clase_id' = pg_temp.k('mo_c')),
  'confirmada', 'T-CA-72-04/DEC-42 A: el origen sigue CONFIRMADA');
select is((select e ->> 'clase_estado' || '/' || (e ->> 'solicitud_tipo') || '/' || (e ->> 'quien_toma')
             from jsonb_array_elements(current_setting('rtc.ra')::jsonb) e where e ->> 'clase_id' = pg_temp.k('md_c')),
  'pendiente/movimiento/Eli Pgtap16', 'T-CA-72-04/DEC-42 A: el destino es PENDIENTE, con el nombre de quien pide y solicitud_tipo movimiento');
select is((select e ->> 'solicitud_tipo' from jsonb_array_elements(current_setting('rtc.ra')::jsonb) e where e ->> 'clase_id' = pg_temp.k('ccan_c')),
  'cancelacion', 'CAL-08: la clase con cancelación pendiente trae solicitud_tipo cancelacion');
select is((select e ->> 'solicitud_id' from jsonb_array_elements(current_setting('rtc.ra')::jsonb) e where e ->> 'clase_id' = pg_temp.k('mo_c')),
  'a1600000-0000-0000-0000-0000000000e2', 'CAL-08: solicitud_id y solicitud_tipo son de la misma solicitud');
select is((select count(*)::int from jsonb_array_elements(current_setting('rtc.ra')::jsonb) e where e ->> 'solicitud_id' is not null and e ->> 'solicitud_tipo' is null), 0,
  'CAL-08: toda fila con solicitud_id trae su solicitud_tipo');

-- 8. Canceladas y rechazadas ausentes (CA-73 rama base, T-CA-73-01, CAL-09) -------------------------------------------------------
select is((select count(*)::int from jsonb_array_elements(current_setting('rtc.ra')::jsonb) e
            where e ->> 'clase_id' in (pg_temp.k('xcan_c'), pg_temp.k('rrech_c'))), 0, 'T-CA-73-01/CAL-09: la clase cancelada y la rechazada no aparecen');
select is((select count(*)::int from jsonb_array_elements(current_setting('rtc.ra')::jsonb) e
            where e ->> 'solicitud_id' in ('a1600000-0000-0000-0000-0000000000e4', 'a1600000-0000-0000-0000-0000000000e5')), 0,
  'T-CA-73-01/CAL-09: las solicitudes rechazadas no aparecen');
select is((select e ->> 'solicitud_tipo' from jsonb_array_elements(current_setting('rtc.ra')::jsonb) e where e ->> 'clase_id' = pg_temp.k('xrech_c')) is null, true,
  'T-CA-73-01/CAL-09: la clase con una cancelación rechazada sigue y no trae solicitud_tipo');
select is((select count(*)::int from jsonb_array_elements(current_setting('rtc.ra')::jsonb) e where e ->> 'clase_estado' not in ('pendiente', 'confirmada')), 0,
  'T-CA-73-01/CAL-09: ninguna fila trae una clase que no esté pendiente o confirmada');
select is((select e ->> 'estado' from jsonb_array_elements(current_setting('rtc.ra')::jsonb) e where e ->> 'inicio' = '2026-11-03T13:00:00+00:00' limit 1) is not null, true,
  'T-CA-73-01: el hueco de la clase cancelada (martes 10:00) sigue en la grilla, libre');

-- 9. Profesor inactivo lee lo suyo (INV-05, PRF-08) ------------------------------------------------------------------------------
update public.profesor set activo = false where id = current_setting('rtc.pa')::uuid;
select is(pg_temp.leer(pg_temp.ua(), '2026-11-02', '2026-11-08')::jsonb, current_setting('rtc.ra')::jsonb, 'INV-05: el profesor inactivo lee lo mismo que activo');
select is(pg_temp.leer(pg_temp.ub(), '2026-11-02', '2026-11-08')::jsonb, current_setting('rtc.rb')::jsonb, 'INV-05/INV-02: la baja de A no cambia la lectura de B');
update public.profesor set activo = true where id = current_setting('rtc.pa')::uuid;

-- 10. Lista exacta de columnas (SEC-34) ---------------------------------------------------------------------------------------------
select is((select p.proargnames[3:] from pg_proc p where p.oid = 'public.agenda_profesor_dias(date,date)'::regprocedure),
  array['inicio', 'fin', 'estado', 'clase_id', 'solicitud_id', 'quien_toma', 'titular', 'observacion', 'clase_estado', 'bloqueo_id', 'bloqueo_motivo',
        'reserva_tipo', 'pasada', 'dia', 'clase_inicio', 'clase_fin', 'solicitud_tipo'],
  'SEC-34: la RPC devuelve las 17 columnas del contrato, en orden, ni una más');
select is((select count(*)::int from jsonb_object_keys(current_setting('rtc.ra')::jsonb -> 0)), 17, 'SEC-34: cada fila trae exactamente 17 claves');
select is(((current_setting('rtc.ra')::jsonb)::text ~ '@|\+598|1990-01-01|2015-03-04'), false,
  'SEC-34: ni mail, ni teléfono, ni fecha de nacimiento del titular o de la persona a cargo en la lectura');
select is((select count(*)::int from jsonb_array_elements(current_setting('rtc.ra')::jsonb) e
            where e ->> 'inicio' is null or e ->> 'fin' is null or e ->> 'estado' is null or e ->> 'pasada' is null or e ->> 'dia' is null), 0,
  'CAL-07: inicio, fin, estado, pasada y dia nunca son nulos');
select is((select (e ->> 'bloqueo_motivo') from jsonb_array_elements(current_setting('rtc.ra')::jsonb) e where e ->> 'bloqueo_id' = 'a1600000-0000-0000-0000-0000000000d1' limit 1),
  'Bloqueo de A pgtap16', 'INV-03: el bloqueo propio sigue saliendo con su motivo');

select * from finish();
rollback;
