-- B14 · T14.2 · Lectura pública por slug con dos profesores (pruebas propias del developer).
-- IDs: AGE-07, AGE-09, AGE-10, AGE-11, NFR-09, SEC-06, SEC-09. `config_publica(p_slug)`, `agenda_publica(p_slug, p_dia)`
-- y las funciones de transición sin slug (ADR-021). Datos sintéticos (@example.test); todo se deshace con el rollback.
begin;
select plan(22);

-- Llama como `anon` (o authenticated con p_sub) y guarda estado, resultado, mensaje y detalle en rtc.<clave>_*.
create function pg_temp.como(p_sub uuid, p_sql text, p_clave text) returns void language plpgsql as $f$
declare
  v_res text;
  v_det text;
begin
  if p_sub is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
  end if;
  begin
    execute p_sql into v_res;
    perform set_config('rtc.' || p_clave || '_est', 'ok', true);
    perform set_config('rtc.' || p_clave || '_res', coalesce(v_res, ''), true);
    perform set_config('rtc.' || p_clave || '_msg', '', true);
  exception when others then
    get stacked diagnostics v_det = pg_exception_detail;
    perform set_config('rtc.' || p_clave || '_est', sqlstate, true);
    perform set_config('rtc.' || p_clave || '_res', '', true);
    perform set_config('rtc.' || p_clave || '_msg', sqlerrm, true);
  end;
  execute 'reset role';
end;
$f$;

create function pg_temp.r(p_clave text) returns text language sql as $f$
  select current_setting('rtc.' || p_clave || '_est') || ' ' || current_setting('rtc.' || p_clave || '_msg')
$f$;

-- Reloj fijo: miércoles 2026-10-21 12:00 en Montevideo (-03).
update privado.reloj_prueba set ahora = '2026-10-21 15:00:00+00';
select set_config('rtc.pa', privado.configurar_profesor('pgtap142.profa@example.test', 'Profe A', 'pgtap142-a')::text, true) is not null as _;
select set_config('rtc.pb', privado.configurar_profesor('pgtap142.profb@example.test', 'Profe B', 'pgtap142-b')::text, true) is not null as _;
-- A cambia su configuración; B queda con la de AGE-01 (AGE-10).
update public.profesor set duracion_min = 30, anticipacion_horas = 48 where id = current_setting('rtc.pa')::uuid;
insert into public.bloqueo (profesor_id, periodo, motivo)
values (current_setting('rtc.pa')::uuid, tstzrange('2026-10-22 10:00-03', '2026-10-22 11:00-03', '[)'), 'Médico');

-- 1. config_publica(p_slug) ---------------------------------------------------------------------------------
select pg_temp.como(null, $$select public.config_publica('pgtap142-a')::text$$, 'ca');
select is(pg_temp.r('ca'), 'ok ', 'AGE-09: anon lee la configuración pública de A por su slug');
select is(current_setting('rtc.ca_res')::jsonb,
  jsonb_build_object('profesor_id', current_setting('rtc.pa')::uuid, 'nombre', 'Profe A', 'activo', true,
                     'zona_horaria', 'America/Montevideo', 'duracion_min', 30, 'anticipacion_horas', 48, 'horizonte_semanas', 26),
  'AGE-09/DEC-34: config_publica trae nombre, activo y la configuración de ese profesor; nada más');
select pg_temp.como(null, $$select (public.config_publica('PGTAP142-B') ->> 'duracion_min')$$, 'cb');
select is(current_setting('rtc.cb_res'), '60', 'AGE-10: la configuración de B no cambia con la de A (slug sin distinguir mayúsculas)');

select pg_temp.como(null, $$select public.config_publica('no-existe-142')::text$$, 'c404a');
select pg_temp.como(null, $$select public.config_publica('admin')::text$$, 'c404b');
select pg_temp.como(null, $$select public.config_publica('Inválido!')::text$$, 'c404c');
select pg_temp.como(null, $$select public.config_publica(null)::text$$, 'c404d');
select is(array[pg_temp.r('c404a'), pg_temp.r('c404b'), pg_temp.r('c404c'), pg_temp.r('c404d')],
  array['PT404 NO_ENCONTRADO', 'PT404 NO_ENCONTRADO', 'PT404 NO_ENCONTRADO', 'PT404 NO_ENCONTRADO'],
  'AGE-09/SEC-06: slug inexistente, reservado, inválido o nulo dan el mismo 404');

-- 2. agenda_publica(p_slug, p_dia) --------------------------------------------------------------------------
select pg_temp.como(null, $$select count(*)::text from public.agenda_publica('pgtap142-a', '2026-10-22')$$, 'aa');
select is(current_setting('rtc.aa_res'), '18', 'AGE-07: la agenda de A tiene sus huecos de 30 min (2 tramos, 9 h)');
select pg_temp.como(null, $$select count(*)::text from public.agenda_publica('pgtap142-a', '2026-10-22') where estado = 'bloqueado'$$, 'ab');
select is(current_setting('rtc.ab_res'), '2', 'AGE-07: el bloqueo de A ocupa sus dos huecos de 10:00 a 11:00');
select pg_temp.como(null, $$select count(*)::text || '/' || count(*) filter (where estado = 'libre')::text from public.agenda_publica('pgtap142-b', '2026-10-22')$$, 'ba');
select is(current_setting('rtc.ba_res'), '9/9', 'AGE-10/CA-15: el mismo horario está bloqueado en A y libre en B');
select pg_temp.como(null, $$select string_agg(distinct k, ',' order by k) from public.agenda_publica('pgtap142-a', '2026-10-22') a, jsonb_object_keys(to_jsonb(a)) k$$, 'ac');
select is(current_setting('rtc.ac_res'), 'estado,fin,inicio', 'SEC-07/AGE-07: la agenda pública devuelve solo inicio, fin y estado');

select pg_temp.como(null, $$select count(*)::text from public.agenda_publica('no-existe-142', '2026-10-22')$$, 'a404');
select is(pg_temp.r('a404'), 'PT404 NO_ENCONTRADO', 'AGE-09: agenda de un slug desconocido da 404');
select pg_temp.como(null, $$select count(*)::text from public.agenda_publica('pgtap142-a', '2025-10-19')$$, 'adia1');
select pg_temp.como(null, $$select count(*)::text from public.agenda_publica('pgtap142-a', '2025-10-20')$$, 'adia2');
select is(array[pg_temp.r('adia1'), pg_temp.r('adia2')], array['PT422 DATOS_INVALIDOS', 'ok '],
  'SEC-09: p_dia en hoy − 366 pasa y un día antes da 422');
select pg_temp.como(null, $$select count(*)::text from public.agenda_publica('pgtap142-a', date '2026-10-21' + 26 * 7 + 32)$$, 'adia3');
select is(pg_temp.r('adia3'), 'PT422 DATOS_INVALIDOS', 'SEC-09: p_dia después de hoy + horizonte + 31 da 422');

-- 3. Profesor inactivo (AGE-11, DEC-30) ----------------------------------------------------------------------
update public.profesor set activo = false where id = current_setting('rtc.pa')::uuid;
select pg_temp.como(null, $$select public.config_publica('pgtap142-a')::text$$, 'ci');
select is(current_setting('rtc.ci_res')::jsonb,
  jsonb_build_object('profesor_id', current_setting('rtc.pa')::uuid, 'nombre', 'Profe A', 'activo', false),
  'AGE-11: con el profesor inactivo config_publica trae solo id, nombre y activo false');
select pg_temp.como(null, $$select count(*)::text from public.agenda_publica('pgtap142-a', '2026-10-22')$$, 'ai');
select is(pg_temp.r('ai'), 'PT409 PROFESOR_INACTIVO', 'AGE-11: la agenda de un profesor inactivo da 409 PROFESOR_INACTIVO');
select pg_temp.como(null, $$select count(*)::text from public.agenda_publica('pgtap142-a', '2030-01-01')$$, 'ai2');
select is(pg_temp.r('ai2'), 'PT409 PROFESOR_INACTIVO', 'AGE-11: inactivo se informa antes que el rango de p_dia');
select pg_temp.como(null, $$select count(*)::text from public.agenda_publica('pgtap142-b', '2026-10-22')$$, 'bi');
select is(pg_temp.r('bi'), 'ok ', 'AGE-11: inactivar a A no cambia la agenda de B');
update public.profesor set activo = true where id = current_setting('rtc.pa')::uuid;
select pg_temp.como(null, $$select count(*)::text from public.agenda_publica('pgtap142-a', '2026-10-22')$$, 'ar');
select is(current_setting('rtc.ar_res'), '18', 'AGE-11: al reactivarlo su agenda vuelve como estaba');

-- 4. Permisos (SEC-04) ---------------------------------------------------------------------------------------
select ok(has_function_privilege('anon', 'public.config_publica(text)', 'execute')
      and has_function_privilege('anon', 'public.agenda_publica(text, date)', 'execute'),
  'SEC-04: anon ejecuta config_publica(p_slug) y agenda_publica(p_slug, p_dia)');
select ok(not has_function_privilege('anon', 'privado.profesor_por_slug(text)', 'execute')
      and not has_function_privilege('authenticated', 'privado.profesor_por_slug(text)', 'execute'),
  'SEC-04: privado.profesor_por_slug no es ejecutable por la API');

-- 5. Transición (ADR-021): con más de un profesor fallan con 404; con uno, delegan en él ---------------------
select pg_temp.como(null, $$select public.config_publica()::text$$, 't1');
select pg_temp.como(null, $$select count(*)::text from public.agenda_publica('2026-10-22'::date)$$, 't2');
select is(array[pg_temp.r('t1'), pg_temp.r('t2')], array['PT404 NO_ENCONTRADO', 'PT404 NO_ENCONTRADO'],
  'ADR-021: config_publica() y agenda_publica(p_dia) sin slug fallan con 404 si hay más de un profesor');

-- Un solo profesor: se quitan los demás dentro de la transacción (sus datos dependientes primero).
delete from public.mail_salida;
delete from public.inscripcion;
delete from public.alumno;
delete from public.bloqueo where profesor_id <> current_setting('rtc.pa')::uuid;
delete from public.grilla_tramo where profesor_id <> current_setting('rtc.pa')::uuid;
delete from public.profesor where id <> current_setting('rtc.pa')::uuid;
select pg_temp.como(null, $$select public.config_publica()::text$$, 't3');
select is(current_setting('rtc.t3_res')::jsonb,
  '{"zona_horaria":"America/Montevideo","duracion_min":30,"anticipacion_horas":48,"horizonte_semanas":26}'::jsonb,
  'ADR-021: con un único profesor config_publica() conserva la forma de B01');
select pg_temp.como(null, $$select count(*)::text from public.agenda_publica('2026-10-22'::date)$$, 't4');
select is(current_setting('rtc.t4_res'), '18', 'ADR-021: con un único profesor agenda_publica(p_dia) delega en él');
update public.profesor set activo = false;
select pg_temp.como(null, $$select count(*)::text from public.agenda_publica('2026-10-22'::date)$$, 't5');
select is(pg_temp.r('t5'), 'PT409 PROFESOR_INACTIVO', 'AGE-11: la agenda de transición también respeta el profesor inactivo');

select * from finish();
rollback;
