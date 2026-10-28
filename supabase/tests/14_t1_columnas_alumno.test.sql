-- B14 · Corrección H-284 · Columnas heredadas de B05 en `alumno` y `persona_a_cargo` (migración 0525).
-- IDs: SEC-02, SEC-06, X-01, CA-52. Las pruebas de RLS miran filas; esta mira columnas: una persona inscripta con A y B
-- es visible para los dos, y lo que A cargó en B05 (`profesor_id`, `motivo_estado`, `como_llego`, `aprobado_en`) no
-- puede leerlo B por la API (privilegio por columna: error 42501, el mismo que da PostgREST). Lo de cada profesor sale
-- de `inscripcion` (por `v_alumnos`) y la persona sigue leyendo su ficha.
-- Tras la contracción 0539 las columnas viejas no existen: B no puede leerlas (42703) y lo de A solo está en inscripcion.
-- Datos sintéticos (@example.test); todo se deshace con el rollback.
begin;
select plan(18);

-- Ayudas ----------------------------------------------------------------------------------------------------
-- Ejecuta `p_sql` como `authenticated` con el `sub` dado; devuelve el valor, '<nulo>' o 'SQLSTATE mensaje'.
create function pg_temp.como(p_sub text, p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
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
-- Columnas de una tabla de public legibles por `authenticated`, en orden alfabético.
create function pg_temp.legibles(p_tabla text) returns text language sql as $f$
  select string_agg(a.attname::text, ',' order by a.attname::text collate "C")
    from pg_attribute a
   where a.attrelid = ('public.' || p_tabla)::regclass and a.attnum > 0 and not a.attisdropped
     and has_column_privilege('authenticated', a.attrelid, a.attnum, 'select')
$f$;

-- 1. Catálogo: qué columnas lee la API (una columna nueva no es legible hasta que una migración la nombre) ---------
select is(pg_temp.legibles('alumno'),
  'aviso_inactividad_en,borrado_en,compartida,creado_en,creado_por,estado,fecha_nacimiento,ficha_completada_en,id,mail,nombre,telefono,telefono_clave,ultimo_ingreso,user_id',
  'H-284, SEC-02: authenticated lee de alumno solo las columnas vigentes (sin profesor_id, motivo_estado, como_llego, aprobado_en ni ficha_origen_profesor_id)');
select is(pg_temp.legibles('persona_a_cargo'), 'alumno_id,fecha_nacimiento,id,nombre',
  'H-284, SEC-02: authenticated no lee persona_a_cargo.profesor_id');
select ok(not has_table_privilege('authenticated', 'public.alumno', 'select')
          and not has_table_privilege('authenticated', 'public.persona_a_cargo', 'select'),
  'H-284, SEC-06: sin select de tabla entera sobre alumno ni persona_a_cargo');
select is((select count(*)::int from information_schema.columns
            where table_schema = 'public'
              and ((table_name = 'alumno' and column_name in ('profesor_id', 'motivo_estado', 'como_llego', 'aprobado_en'))
                or (table_name = 'persona_a_cargo' and column_name = 'profesor_id'))), 0,
  'H-284, X-01: tras la contracción (0539) las columnas heredadas de B05 ya no existen; lo de cada profesor vive en inscripcion');

-- Preparación: reloj fijo, profesores A y B, la persona X inscripta con los dos y los datos heredados de A ----------
update privado.reloj_prueba set ahora = '2026-11-02 15:00:00+00';
select set_config('rtc.pa', privado.configurar_profesor('pgtap14c.profa@example.test', 'Profe A', 'pgtap14c-a')::text, true) is not null as _;
select set_config('rtc.pb', privado.configurar_profesor('pgtap14c.profb@example.test', 'Profe B', 'pgtap14c-b')::text, true) is not null as _;
select pg_temp.usuario('e1420000-0000-0000-0000-00000000000a', 'pgtap14c.profa@example.test');
select pg_temp.usuario('e1420000-0000-0000-0000-00000000000b', 'pgtap14c.profb@example.test');
select pg_temp.usuario('e1420000-0000-0000-0000-0000000000a1', 'pgtap14c.x@example.test');
update public.alumno set estado = 'completa', nombre = 'Persona X', telefono = '099 141 414', fecha_nacimiento = '1990-01-01',
                         ficha_completada_en = public.app_ahora(), ficha_origen_profesor_id = current_setting('rtc.pa')::uuid
 where user_id = 'e1420000-0000-0000-0000-0000000000a1';
select set_config('rtc.x', (select id::text from public.alumno where user_id = 'e1420000-0000-0000-0000-0000000000a1'), true) is not null as _;
insert into public.inscripcion (alumno_id, profesor_id, estado, como_llego, motivo_estado, aprobado_en) values
  (current_setting('rtc.x')::uuid, current_setting('rtc.pa')::uuid, 'aprobado', 'Instagram (dicho a A)', 'nota privada de A', public.app_ahora()),
  (current_setting('rtc.x')::uuid, current_setting('rtc.pb')::uuid, 'pendiente', 'Por la web de B', null, null);
insert into public.persona_a_cargo (alumno_id, nombre) values
  (current_setting('rtc.x')::uuid, 'Hija de X');
-- 2. Profesora B: ve la fila de X, no las columnas de A ------------------------------------------------------
select ok(pg_temp.como('e1420000-0000-0000-0000-00000000000b',
            format('select profesor_id::text || como_llego || motivo_estado || aprobado_en::text from public.alumno where id = %L',
                   current_setting('rtc.x'))) like '42703 %',
  'H-284, SEC-02, CA-52: la reproducción de SecDevOps (las cuatro columnas de A leídas como B) da permiso denegado');
select ok(pg_temp.como('e1420000-0000-0000-0000-00000000000b',
            format('select profesor_id::text from public.alumno where id = %L', current_setting('rtc.x'))) like '42703 %',
  'H-284, X-01: B no lee alumno.profesor_id');
select ok(pg_temp.como('e1420000-0000-0000-0000-00000000000b',
            format('select como_llego from public.alumno where id = %L', current_setting('rtc.x'))) like '42703 %',
  'H-284, SEC-02: B no lee alumno.como_llego de A');
select ok(pg_temp.como('e1420000-0000-0000-0000-00000000000b',
            format('select motivo_estado from public.alumno where id = %L', current_setting('rtc.x'))) like '42703 %',
  'H-284, SEC-02: B no lee alumno.motivo_estado de A');
select ok(pg_temp.como('e1420000-0000-0000-0000-00000000000b',
            format('select aprobado_en::text from public.alumno where id = %L', current_setting('rtc.x'))) like '42703 %',
  'H-284, X-01: B no lee alumno.aprobado_en de A');
select ok(pg_temp.como('e1420000-0000-0000-0000-00000000000b',
            format('select ficha_origen_profesor_id::text from public.alumno where id = %L', current_setting('rtc.x'))) like '42501 %',
  'H-284, X-01: B no lee por qué profesor llegó la persona (ficha_origen_profesor_id)');
select ok(pg_temp.como('e1420000-0000-0000-0000-00000000000b',
            format('select a::text from public.alumno a where a.id = %L', current_setting('rtc.x'))) like '42501 %',
  'H-284, SEC-06: la fila entera (select * de PostgREST) tampoco es legible');
select ok(pg_temp.como('e1420000-0000-0000-0000-00000000000b',
            format('select profesor_id::text from public.persona_a_cargo where alumno_id = %L', current_setting('rtc.x'))) like '42703 %',
  'H-284, X-01: B no lee persona_a_cargo.profesor_id');
select is(pg_temp.como('e1420000-0000-0000-0000-00000000000b',
            format('select nombre || ''|'' || mail || ''|'' || (select string_agg(p.nombre, '','') from public.persona_a_cargo p where p.alumno_id = a.id) from public.alumno a where a.id = %L',
                   current_setting('rtc.x'))),
  'Persona X|pgtap14c.x@example.test|Hija de X',
  'CA-52: B sigue leyendo la ficha compartida de X y sus personas a cargo');
select is(pg_temp.como('e1420000-0000-0000-0000-00000000000b',
            format('select coalesce(como_llego, ''<nulo>'') || ''|'' || coalesce(motivo_estado, ''<nulo>'') from public.v_alumnos where id = %L',
                   current_setting('rtc.x'))),
  'Por la web de B|<nulo>',
  'SEC-02: en v_alumnos B ve su propio como_llego y motivo (de inscripcion), no los de A');

-- 3. Profesora A: tampoco usa las columnas viejas; lo suyo sale de inscripcion ---------------------------------
select ok(pg_temp.como('e1420000-0000-0000-0000-00000000000a',
            format('select como_llego from public.alumno where id = %L', current_setting('rtc.x'))) like '42703 %',
  'H-284: ningún profesor lee alumno.como_llego, tampoco el que lo cargó');
select is(pg_temp.como('e1420000-0000-0000-0000-00000000000a',
            format('select como_llego || ''|'' || motivo_estado from public.v_alumnos where id = %L', current_setting('rtc.x'))),
  'Instagram (dicho a A)|nota privada de A',
  'SEC-02: A ve lo suyo en v_alumnos (inscripcion)');

-- 4. La persona X sigue leyendo lo suyo ------------------------------------------------------------------------
select is(pg_temp.como('e1420000-0000-0000-0000-0000000000a1',
            'select nombre || ''|'' || mail || ''|'' || telefono || ''|'' || fecha_nacimiento::text || ''|'' || estado from public.alumno'),
  'Persona X|pgtap14c.x@example.test|099 141 414|1990-01-01|completa',
  'H-284: la persona lee su ficha (nombre, mail, teléfono, nacimiento, estado)');
select is(pg_temp.como('e1420000-0000-0000-0000-0000000000a1', 'select string_agg(nombre, '','') from public.persona_a_cargo'),
  'Hija de X',
  'H-284: la persona lee sus personas a cargo');

select * from finish();
rollback;
