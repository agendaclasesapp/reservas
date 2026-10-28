-- B14 · T14.5 (a) · Enlace por slug sin enumeración y profesor inactivo, de punta a punta.
-- IDs: ADM-02, AGE-09, AGE-11, PRF-08, SEC-09, SEC-33, SEC-04, SEC-06. CA-47 (enlace inexistente), CA-15 (sin datos de otro),
-- CA-48 (sin enlace no hay agenda ni lista de profesores), CA-63 (rama enlace y acceso de B14).
-- No repite 14_t2_lectura_publica (forma de config_publica, huecos, 409 de agenda) ni 14_t2_sesion_ficha (409 de completar_ficha y
-- pedir_inscripcion sueltos): aquí el efecto completo sobre los datos y el «todo queda como antes» al reactivar.
-- Datos sintéticos (@example.test); todo se deshace con el rollback.
begin;
select plan(31);

create function pg_temp.llamar(p_sub text, p_sql text, p_rol text default 'authenticated') returns text language plpgsql as $f$
declare v text; v_det text;
begin
  perform set_config('request.jwt.claims', case when p_sub is null then '' else json_build_object('sub', p_sub, 'role', p_rol)::text end, true);
  execute format('set local role %I', p_rol);
  begin
    execute p_sql into v;
    execute 'reset role';
    return coalesce(v, '<nulo>');
  exception when others then
    get stacked diagnostics v_det = pg_exception_detail;
    execute 'reset role';
    return sqlstate || '|' || sqlerrm || '|' || coalesce(v_det, '');
  end;
end;
$f$;
create function pg_temp.usuario(p_id uuid, p_mail text) returns void language sql as $f$
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_mail, now(), now(), now(), '', '', '', '')
$f$;
-- Huella de todo lo que es de un profesor, sin su estado `activo` (T-ADM-11: inactivar no cambia nada más).
create function pg_temp.huella(p_profesor uuid) returns text language sql as $f$
  select md5(concat_ws('#',
    (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.clase t where t.profesor_id = p_profesor),
    (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.reserva t where t.profesor_id = p_profesor),
    (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.inscripcion t where t.profesor_id = p_profesor),
    (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.bloqueo t where t.profesor_id = p_profesor),
    (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.grilla_tramo t where t.profesor_id = p_profesor),
    (select to_jsonb(t) - 'activo' from public.profesor t where t.id = p_profesor)))
$f$;

-- Preparación: reloj fijo (lunes 2026-11-02 12:00 -03), A y B con usuario, y personas -----------------------------------------
update privado.reloj_prueba set ahora = '2026-11-02 15:00:00+00';
select set_config('rtc.pa', privado.configurar_profesor('pgtap14s.profa@example.test', 'Profe A', 'pgtap14s-a')::text, true) is not null as _;
select set_config('rtc.pb', privado.configurar_profesor('pgtap14s.profb@example.test', 'Centinela Profe B', 'pgtap14s-b')::text, true) is not null as _;
select pg_temp.usuario('e1413000-0000-0000-0000-00000000000a', 'pgtap14s.profa@example.test');
select pg_temp.usuario('e1413000-0000-0000-0000-00000000000b', 'pgtap14s.profb@example.test');
select pg_temp.usuario('e1413000-0000-0000-0000-0000000000a1', 'pgtap14s.mateo@example.test');   -- aprobado con A, con una clase
select pg_temp.usuario('e1413000-0000-0000-0000-0000000000a2', 'pgtap14s.pia@example.test');     -- ficha completa, sin vínculos
select pg_temp.usuario('e1413000-0000-0000-0000-0000000000a3', 'pgtap14s.quique@example.test');  -- ficha incompleta
select pg_temp.usuario('e1413000-0000-0000-0000-0000000000a4', 'pgtap14s.ana@example.test');     -- pendiente con A
update public.alumno set estado = 'completa', nombre = 'Mateo', telefono = '099 100 001', fecha_nacimiento = '1990-01-01', ficha_completada_en = '2026-10-01 10:00+00'
 where user_id = 'e1413000-0000-0000-0000-0000000000a1';
update public.alumno set estado = 'completa', nombre = 'Pía', telefono = '099 100 002', fecha_nacimiento = '1991-01-01', ficha_completada_en = '2026-10-01 10:00+00'
 where user_id = 'e1413000-0000-0000-0000-0000000000a2';
update public.alumno set estado = 'completa', nombre = 'Ana', telefono = '099 100 004', fecha_nacimiento = '1993-01-01', ficha_completada_en = '2026-10-01 10:00+00',
                         ficha_origen_profesor_id = current_setting('rtc.pa')::uuid
 where user_id = 'e1413000-0000-0000-0000-0000000000a4';
select set_config('rtc.mateo', (select id::text from public.alumno where user_id = 'e1413000-0000-0000-0000-0000000000a1'), true) is not null as _;
select set_config('rtc.ana', (select id::text from public.alumno where user_id = 'e1413000-0000-0000-0000-0000000000a4'), true) is not null as _;
insert into public.inscripcion (alumno_id, profesor_id, estado, aprobado_en) values
  (current_setting('rtc.mateo')::uuid, current_setting('rtc.pa')::uuid, 'aprobado', '2026-10-01 10:00+00');
insert into public.inscripcion (alumno_id, profesor_id, estado) values (current_setting('rtc.ana')::uuid, current_setting('rtc.pa')::uuid, 'pendiente');
insert into public.reserva (id, profesor_id, alumno_id, tipo, hora_local, dia_semana, duracion_min, estado, desde, origen)
values ('e1413000-0000-0000-0000-0000000001a1', current_setting('rtc.pa')::uuid, current_setting('rtc.mateo')::uuid, 'suelta', '09:00', 1, 60, 'confirmada', '2026-11-02', 'solicitud');
insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado)
values (current_setting('rtc.pa')::uuid, 'e1413000-0000-0000-0000-0000000001a1', current_setting('rtc.mateo')::uuid, '2026-11-02 09:00-03', '2026-11-02 10:00-03', 'confirmada');
insert into public.bloqueo (profesor_id, periodo, motivo) values
  (current_setting('rtc.pa')::uuid, tstzrange('2026-11-02 14:00-03', '2026-11-02 16:00-03', '[)'), 'Bloqueo de A');

-- 1. El slug: reglas de ADM-02 y lista reservada de ADR-018 (SEC-09, ADM-02) ----------------------------------------------------
select is((select array_agg(s order by s) from unnest(array['admin', 'p', 'ingreso', 'ficha', 'mis-clases', 'panel', 'lista', 'configuracion',
              'inicio', 'api', 'reservas', 'soporte', 'ayuda']) s where privado.slug_valido(s)), null::text[],
  'ADM-02/SEC-09: los 13 enlaces reservados (los de menos de 3 caracteres, por largo) se rechazan');
select is((select array_agg(s order by s) from unnest(array['Admin', 'MIS-CLASES', 'admin-', '-admin']) s where privado.slug_valido(s)), null::text[],
  'ADM-02: un reservado con otra grafía (mayúsculas, guion en el borde) tampoco pasa');
select is((select array_agg(s order by s) from unnest(array['abc', 'a1b', 'ana-lopez', 'a-b-c-d', '123', repeat('a', 30), 'admin1', 'mis-clases2', 'pgtap-uno']) s where not privado.slug_valido(s)), null::text[],
  'ADM-02: 3 y 30 caracteres, números, guiones internos y reservado más texto son válidos');
select is((select array_agg(s order by s) from unnest(array['ab', repeat('a', 31), 'Ana', 'ana_lopez', 'ana lopez', 'ana.lopez', 'ñandú', 'ana-', '-ana', 'a/b', 'ana%', 'ana--', ' ana', 'ana ', '😀😀😀', '']) s where privado.slug_valido(s)),
  null::text[], 'ADM-02: largo, mayúsculas, guion bajo, espacio, punto, acentos, bordes con guion, símbolos, emoji y vacío se rechazan');
select throws_ok(format($$update public.profesor set slug = 'ayuda' where id = %L$$, current_setting('rtc.pa')), '23514', null,
  'SEC-09: el CHECK del slug rechaza un reservado aunque se cambie por SQL directo');
select throws_ok(format($$update public.profesor set slug = 'PGTAP14S-B' where id = %L$$, current_setting('rtc.pa')), '23514', null,
  'ADM-02: un slug con mayúsculas se rechaza en la tabla (la regex distingue mayúsculas)');
select throws_ok(format($$update public.profesor set slug = 'pgtap14s-b' where id = %L$$, current_setting('rtc.pa')), '23505', null,
  'ADM-02: el slug es único');

-- 2. Sin enumeración (SEC-33, CA-47, CA-48) ----------------------------------------------------------------------------------------
select is((select count(distinct r)::int || '/' || min(r) from (
    select pg_temp.llamar(null, format('select public.config_publica(%L)::text', s), 'anon') r from unnest(array[
      'no-existe', 'otro-que-no-existe', 'admin', 'mis-clases', 'Mal Formado!', '', '   ', 'a', repeat('x', 10000), '%', '_', 'pgtap14s-%', E'a\nb', $q$' or 1=1 --$q$, '--', 'ñ']) s) t),
  '1/PT404|NO_ENCONTRADO|', 'SEC-33: config_publica da el mismo 404, sin details, para inexistente, reservado, mal formado, vacío, enorme y con comodines o SQL');
select is((select count(distinct r)::int || '/' || min(r) from (
    select pg_temp.llamar(null, format('select * from public.agenda_publica(%L, %L)', s, '2026-11-02'), 'anon') r from unnest(array[
      'no-existe', 'otro-que-no-existe', 'admin', 'mis-clases', 'Mal Formado!', '', '   ', 'a', repeat('x', 10000), '%', '_', 'pgtap14s-%', E'a\nb', $q$' or 1=1 --$q$, '--', 'ñ']) s) t),
  '1/PT404|NO_ENCONTRADO|', 'SEC-33: agenda_publica da el mismo 404, sin details, para los mismos slugs');
select is(pg_temp.llamar(null, $$select public.config_publica('pgtap14s-%')::text$$, 'anon'), 'PT404|NO_ENCONTRADO|',
  'SEC-33: «%» en el slug no es un comodín (la búsqueda es por igualdad)');
select is(array[
    pg_temp.llamar(null, $$select public.config_publica(null)::text$$, 'anon'),
    pg_temp.llamar(null, $$select public.config_publica()::text$$, 'anon')],
  array['PT404|NO_ENCONTRADO|', 'PT404|NO_ENCONTRADO|'],
  'CA-47/CA-48: sin slug (nulo o sin enlace, con varios profesores) no hay agenda ni se elige un profesor al azar');
select is((select array_agg(p.proname::text order by p.proname::text) from (select distinct proname from pg_proc p2 join pg_namespace n on n.oid = p2.pronamespace
            where n.nspname = 'public' and has_function_privilege('anon', p2.oid, 'execute')) p),
  array['agenda_publica', 'config_publica', 'ping'], 'SEC-33/SEC-04: anon ejecuta solo ping, config_publica y agenda_publica; no hay RPC anónima que liste profesores');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'f', 'p')
              and (has_table_privilege('anon', c.oid, 'select') or has_any_column_privilege('anon', c.oid, 'select'))), 0,
  'SEC-33: anon no lee ninguna tabla ni vista de public (no hay vista anónima de profesores)');
select is((select array_agg(k order by k) from jsonb_object_keys(public.config_publica('pgtap14s-b')) k),
  array['activo', 'anticipacion_horas', 'duracion_min', 'horizonte_semanas', 'nombre', 'profesor_id', 'zona_horaria'],
  'SEC-33/CA-15: las claves de la respuesta pública de un profesor activo son exactamente las del contrato; ni mail, ni user_id, ni slug');
select is(public.config_publica('pgtap14s-b')::text ~* 'pgtap14s\.prof|user_id|@example|Profe A|pgtap14s-a', false,
  'SEC-33/CA-15: la respuesta pública de B no trae el mail de nadie ni datos de A');
select is((select coalesce(jsonb_agg(to_jsonb(a))::text, '') from public.agenda_publica('pgtap14s-a', '2026-11-02') a) ~* 'mateo|bloqueo de a|example|e1413000|centinela', false,
  'CA-15: la agenda pública de A no trae nombres, motivos, mails ni ids');
select is((select coalesce(jsonb_agg(to_jsonb(a))::text, '') from public.agenda_publica('pgtap14s-b', '2026-11-02') a) ~* 'mateo|bloqueo de a|example|e1413000', false,
  'CA-15: la agenda pública de B no trae nada de la clase ni del bloqueo de A');
select is(public.config_publica('  PGTAP14S-A ')::jsonb ->> 'nombre', 'Profe A', 'AGE-09: el slug se compara sin mayúsculas ni espacios en los bordes');

-- 3. Profesor inactivo (AGE-11, PRF-08, CA-63 rama enlace y acceso) ------------------------------------------------------------------
select set_config('rtc.cfg_a', public.config_publica('pgtap14s-a')::text, true) is not null as _;
select set_config('rtc.agenda_a', (select jsonb_agg(to_jsonb(a) order by inicio)::text from public.agenda_publica('pgtap14s-a', '2026-11-02') a), true) is not null as _;
select set_config('rtc.cfg_b', public.config_publica('pgtap14s-b')::text, true) is not null as _;
select set_config('rtc.huella_a', pg_temp.huella(current_setting('rtc.pa')::uuid), true) is not null as _;
select set_config('rtc.agenda_b', (select jsonb_agg(to_jsonb(a) order by inicio)::text from public.agenda_publica('pgtap14s-b', '2026-11-02') a), true) is not null as _;
select set_config('rtc.mails', (select count(*)::text from public.mail_salida), true) is not null as _;
update public.profesor set activo = false where id = current_setting('rtc.pa')::uuid;

select is(public.config_publica('pgtap14s-a')::jsonb,
  jsonb_build_object('profesor_id', current_setting('rtc.pa'), 'nombre', 'Profe A', 'activo', false),
  'CA-63: el enlace de A inactivo dice que no toma reservas y no trae configuración ni agenda');
select is(pg_temp.llamar(null, $$select * from public.agenda_publica('pgtap14s-a', '2026-11-02')$$, 'anon'), 'PT409|PROFESOR_INACTIVO|',
  'CA-63: la agenda de A inactivo da 409 PROFESOR_INACTIVO a un visitante');
select is(array[public.config_publica('pgtap14s-b')::text, (select jsonb_agg(to_jsonb(a) order by inicio)::text from public.agenda_publica('pgtap14s-b', '2026-11-02') a)],
  array[current_setting('rtc.cfg_b'), current_setting('rtc.agenda_b')],
  'CA-63: lo de B no cambia con A inactivo');
-- Nadie pide acceso: sin inscripción nueva, sin mail, sin ficha completada.
select is(array[
    pg_temp.llamar('e1413000-0000-0000-0000-0000000000a2', $$select public.pedir_inscripcion('pgtap14s-a', 'Por una amiga')::text$$),
    pg_temp.llamar('e1413000-0000-0000-0000-0000000000a3', $$select public.completar_ficha('Quique', '099 100 003', '1992-01-01', 'pgtap14s-a', 'Por una amiga')::text$$)],
  array['PT409|PROFESOR_INACTIVO|', 'PT409|PROFESOR_INACTIVO|'],
  'CA-63: pedir acceso a A inactivo, con la ficha completa o completándola desde su enlace, da 409 PROFESOR_INACTIVO');
select is((select count(*)::int from public.inscripcion i join public.alumno a on a.id = i.alumno_id where a.user_id in
            ('e1413000-0000-0000-0000-0000000000a2', 'e1413000-0000-0000-0000-0000000000a3'))
          || '/' || (select estado || '/' || coalesce(ficha_completada_en::text, '-') from public.alumno where user_id = 'e1413000-0000-0000-0000-0000000000a3')
          || '/' || ((select count(*) from public.mail_salida)::text = current_setting('rtc.mails'))::text,
  '0/ficha_incompleta/-/true', 'CA-63: el 409 no crea inscripción, no completa la ficha de Quique ni encola ningún mail');
select is(pg_temp.llamar('e1413000-0000-0000-0000-0000000000a2', $$select (public.pedir_inscripcion('pgtap14s-b', 'Por una amiga')::jsonb ->> 'estado')$$), 'pendiente',
  'CA-63: con A inactivo, la misma persona sí pide acceso a B (lo de otros profesores no cambia)');
select set_config('rtc.huella_b', pg_temp.huella(current_setting('rtc.pb')::uuid), true) is not null as _;
-- El profesor inactivo no aprueba ni da de alta; sí ve lo existente.
select is(array[
    pg_temp.llamar('e1413000-0000-0000-0000-00000000000a', format('select public.aprobar_cuenta(%L)::text', current_setting('rtc.ana'))),
    pg_temp.llamar('e1413000-0000-0000-0000-00000000000a', $$select public.alta_alumno('Nuevo', '099 100 009', '1990-01-01', 'pgtap14s.nuevo@example.test')::text$$)],
  array['PT409|PROFESOR_INACTIVO|', 'PT409|PROFESOR_INACTIVO|'],
  'CA-63: A inactivo no aprueba un acceso ni da de alta a un alumno (409 PROFESOR_INACTIVO)');
select is((select estado from public.inscripcion where alumno_id = current_setting('rtc.ana')::uuid and profesor_id = current_setting('rtc.pa')::uuid), 'pendiente',
  'CA-63: la cuenta pendiente de Ana sigue pendiente');
select is(pg_temp.llamar('e1413000-0000-0000-0000-00000000000a',
  $$select (select count(*) from public.clase) || '/' || (select count(*) from public.v_alumnos) || '/' || (select count(*) from public.bloqueo) || '/' || (select count(*) from public.grilla_tramo)$$),
  '1/2/1/10', 'PRF-08/CA-63: A inactivo entra y ve lo existente (clase, alumnos, bloqueo y grilla)');
select is(pg_temp.llamar('e1413000-0000-0000-0000-0000000000a1',
  $$select (select count(*) from public.clase) || '/' || (public.sesion_actual()::jsonb -> 'inscripciones' -> 0 ->> 'profesor_activo') || '/' || (public.sesion_actual()::jsonb -> 'inscripciones' -> 0 ->> 'estado')$$),
  '1/false/aprobado', 'CA-63: Mateo sigue viendo su clase confirmada con A y su sesión marca al profesor como inactivo, sin perder su vínculo aprobado');
-- Reactivar: todo queda como antes.
update public.profesor set activo = true where id = current_setting('rtc.pa')::uuid;
select is(public.config_publica('pgtap14s-a')::text || (select jsonb_agg(to_jsonb(a) order by inicio)::text from public.agenda_publica('pgtap14s-a', '2026-11-02') a),
  current_setting('rtc.cfg_a') || current_setting('rtc.agenda_a'), 'CA-63: al reactivar a A su enlace y su agenda quedan como antes');
select is(pg_temp.huella(current_setting('rtc.pa')::uuid), current_setting('rtc.huella_a'),
  'CA-63/T-ADM-11: inactivar y reactivar a A no cambió sus clases, reservas, vínculos, bloqueos, grilla ni configuración');
select is(pg_temp.huella(current_setting('rtc.pb')::uuid), current_setting('rtc.huella_b') ,
  'CA-63: lo de B (con la inscripción de Pía, que es de B) es idéntico antes y después de inactivar y reactivar a A');

select * from finish();
rollback;
