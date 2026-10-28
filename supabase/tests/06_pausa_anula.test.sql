-- B06 · T06.3 · La pausa anula lo pendiente del profesor (ADM-05, AGE-11, CA-63, DEC-35, DEC-37; migración 202611000604).
-- Con A con solicitudes pendientes (suelta, serie y una vencida) y clases confirmadas: cambiar_estado_profesor(A, false) las deja
-- anuladas, cancela reservas y clases pendientes (hueco libre), no toca lo confirmado, no encola mails y no cambia nada de B.
-- Datos sintéticos (@example.test); todo se deshace con el rollback. Reloj fijo: lunes 2026-11-02 12:00 de Montevideo.
begin;
select plan(17);

create function pg_temp.q(p_sub uuid, p_sql text) returns text language plpgsql as $f$
declare v text; v_det text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql into v;
    execute 'reset role';
    return coalesce(v, '<nulo>');
  exception when others then
    get stacked diagnostics v_det = pg_exception_detail;
    execute 'reset role';
    return 'ERR|' || sqlstate || '|' || sqlerrm || '|' || coalesce(v_det, '');
  end;
end;
$f$;
create function pg_temp.usuario(p_id uuid, p_mail text) returns void language sql as $f$
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_mail, now(), now(), now(), '', '', '', '', '{}')
$f$;
create function pg_temp.estado(p_prof text) returns text language sql as $f$
  select (select string_agg(estado || ':' || count, ',' order by estado) from (select estado, count(*) from public.solicitud where profesor_id = current_setting('rtc.' || p_prof)::uuid group by estado) s)
         || '|' || (select string_agg(estado || ':' || count, ',' order by estado) from (select estado, count(*) from public.reserva where profesor_id = current_setting('rtc.' || p_prof)::uuid group by estado) r)
         || '|' || (select string_agg(estado || ':' || count, ',' order by estado) from (select estado, count(*) from public.clase where profesor_id = current_setting('rtc.' || p_prof)::uuid group by estado) c)
$f$;

update privado.reloj_prueba set ahora = '2026-11-02 15:00:00+00';
select set_config('rtc.pa', privado.configurar_profesor('pgtap06p.profa@example.test', 'Profe A', 'pgtap06p-a')::text, true) is not null as _;
select set_config('rtc.pb', privado.configurar_profesor('pgtap06p.profb@example.test', 'Profe B', 'pgtap06p-b')::text, true) is not null as _;
select privado.configurar_administrador('pgtap06p.admin@example.test');
select pg_temp.usuario('a0610000-0000-0000-0000-00000000000d', 'pgtap06p.admin@example.test');
select pg_temp.usuario('a0610000-0000-0000-0000-00000000000a', 'pgtap06p.profa@example.test');
select pg_temp.usuario('a0610000-0000-0000-0000-000000000001', 'pgtap06p.dani@example.test');
update public.alumno set estado = 'completa', nombre = 'Dani', telefono = '099 610 610', fecha_nacimiento = '1990-01-01',
       ficha_completada_en = '2026-01-01', ficha_origen_profesor_id = current_setting('rtc.pa')::uuid
 where user_id = 'a0610000-0000-0000-0000-000000000001';
select set_config('rtc.al', (select id::text from public.alumno where user_id = 'a0610000-0000-0000-0000-000000000001'), true) is not null as _;
insert into public.inscripcion (alumno_id, profesor_id, estado, aprobado_en) values
  (current_setting('rtc.al')::uuid, current_setting('rtc.pa')::uuid, 'aprobado', public.app_ahora()),
  (current_setting('rtc.al')::uuid, current_setting('rtc.pb')::uuid, 'aprobado', public.app_ahora());

-- A: una suelta, una serie semanal, una vencida (reloj adelantado y vuelto) y una clase confirmada. B: una suelta.
select pg_temp.q('a0610000-0000-0000-0000-000000000001', format($$select public.solicitar_reserva(%L::uuid, '2026-11-04 08:00-03', 'suelta')::text$$, current_setting('rtc.pa'))) as _;
select pg_temp.q('a0610000-0000-0000-0000-000000000001', format($$select public.solicitar_reserva(%L::uuid, '2026-11-04 10:00-03', 'serie', 1)::text$$, current_setting('rtc.pa'))) as _;
select pg_temp.q('a0610000-0000-0000-0000-000000000001', format($$select public.solicitar_reserva(%L::uuid, '2026-11-03 14:00-03', 'suelta')::text$$, current_setting('rtc.pa'))) as _;
select pg_temp.q('a0610000-0000-0000-0000-000000000001', format($$select public.solicitar_reserva(%L::uuid, '2026-11-04 08:00-03', 'suelta')::text$$, current_setting('rtc.pb'))) as _;
insert into public.reserva (id, profesor_id, alumno_id, tipo, hora_local, dia_semana, duracion_min, estado, desde, hasta, origen) values
  ('a0610000-0000-0000-0000-0000000000e1', current_setting('rtc.pa')::uuid, current_setting('rtc.al')::uuid, 'suelta', '15:00', 4, 60, 'confirmada', '2026-11-05', '2026-11-05', 'profesor');
insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado) values
  (current_setting('rtc.pa')::uuid, 'a0610000-0000-0000-0000-0000000000e1', current_setting('rtc.al')::uuid, '2026-11-05 15:00-03', '2026-11-05 16:00-03', 'confirmada');
update privado.reloj_prueba set ahora = '2026-11-03 18:30:00+00';  -- la del martes 14:00 queda vencida
select set_config('rtc.antes_b', pg_temp.estado('pb'), true) is not null as _;
select set_config('rtc.mails', (select count(*)::text from public.mail_salida), true) is not null as _;

select is((select count(*)::int from public.solicitud where profesor_id = current_setting('rtc.pa')::uuid and estado = 'pendiente' and fecha_clase <= public.app_ahora()), 1,
  'preparación: una de las pendientes de A está vencida');
select is((select count(*)::int from public.clase where profesor_id = current_setting('rtc.pa')::uuid and estado = 'pendiente') > 20, true,
  'preparación: A tiene clases pendientes (la serie y las sueltas)');

select is(pg_temp.q('a0610000-0000-0000-0000-000000000001', format($$select public.cambiar_estado_profesor(%L::uuid, false)::text$$, current_setting('rtc.pa'))) like 'ERR|PT403|%', true,
  'SEC-06: una persona que llama a cambiar_estado_profesor recibe 403');
select is((select count(*)::int from public.solicitud where profesor_id = current_setting('rtc.pa')::uuid and estado = 'pendiente'), 3, 'el 403 no anuló nada');

select is(pg_temp.q('a0610000-0000-0000-0000-00000000000d', format($$select (public.cambiar_estado_profesor(%L::uuid, false) ->> 'activo')$$, current_setting('rtc.pa'))), 'false',
  'ADM-05: el Administrador inactiva a A');
select is((select string_agg(estado || ':' || n, ',' order by estado) from (select estado, count(*) n from public.solicitud where profesor_id = current_setting('rtc.pa')::uuid group by estado) s),
  'anulada:3', 'CA-63/DEC-35: todas las solicitudes pendientes de A (también la vencida) quedan anuladas');
select is((select count(*)::int from public.solicitud where profesor_id = current_setting('rtc.pa')::uuid and estado = 'anulada' and respondida_en = public.app_ahora()), 3,
  'las anuladas llevan respondida_en = ahora');
select is((select string_agg(estado || ':' || n, ',' order by estado) from (select estado, count(*) n from public.reserva where profesor_id = current_setting('rtc.pa')::uuid group by estado) r),
  'cancelada:3,confirmada:1', 'las reservas pendientes quedan canceladas y la confirmada igual');
select is((select string_agg(estado || ':' || (n > 0)::text, ',' order by estado) from (select estado, count(*) n from public.clase where profesor_id = current_setting('rtc.pa')::uuid group by estado) c),
  'cancelada:true,confirmada:true', 'las clases pendientes quedan canceladas (ninguna pendiente) y la confirmada igual');
select is((select count(*)::int from public.clase where profesor_id = current_setting('rtc.pa')::uuid and estado = 'confirmada' and inicio = '2026-11-05 15:00-03'), 1,
  'CA-63: la clase confirmada se mantiene');
select is((select count(*)::int from public.agenda_publica('pgtap06p-b', '2026-11-04') where estado = 'ocupado'), 1, 'CA-63: lo de B no cambia: su hueco sigue ocupado');
select is(pg_temp.estado('pb'), current_setting('rtc.antes_b'), 'CA-63: solicitudes, reservas y clases de B sin cambios');
select is((select count(*)::text from public.mail_salida), current_setting('rtc.mails'), 'DEC-37: la inactivación no encola ningún mail');
select throws_ok($$select * from public.agenda_publica('pgtap06p-a', '2026-11-04')$$, 'PT409', 'PROFESOR_INACTIVO',
  'H-291 · CA-63: con A inactivo su agenda no se publica (409): el hueco anulado no se ofrece ni queda ocupado');

-- Repetir la inactivación no cambia nada; reactivar no restablece nada.
select set_config('rtc.tras', pg_temp.estado('pa'), true) is not null as _;
select pg_temp.q('a0610000-0000-0000-0000-00000000000d', format($$select public.cambiar_estado_profesor(%L::uuid, false)::text$$, current_setting('rtc.pa'))) as _;
select pg_temp.q('a0610000-0000-0000-0000-00000000000d', format($$select public.cambiar_estado_profesor(%L::uuid, true)::text$$, current_setting('rtc.pa'))) as _;
select is(pg_temp.estado('pa') || '/' || (select activo::text from public.profesor where id = current_setting('rtc.pa')::uuid), current_setting('rtc.tras') || '/true',
  'repetir la inactivación no cambia nada y reactivar no restablece lo anulado (el profesor vuelve a estar activo)');

select is((select a.estado from public.agenda_publica('pgtap06p-a', '2026-11-04') a where a.inicio = '2026-11-04 08:00-03'), 'libre',
  'H-291 · CA-63: tras reactivar, el hueco de la solicitud anulada (mié 08:00) queda libre en agenda_publica');
update privado.reloj_prueba set ahora = '2026-11-02 15:00:00+00';  -- con la anticipación de 24 h, el mié 08:00 solo se pide desde el lunes
select set_config('rtc.nuevo', pg_temp.q('a0610000-0000-0000-0000-000000000001', format($$select (public.solicitar_reserva(%L::uuid, '2026-11-04 08:00-03', 'suelta') ->> 'estado')$$, current_setting('rtc.pa'))), true) is not null as _;
select is(current_setting('rtc.nuevo') not like 'ERR|%'
  and (select count(*) from public.solicitud where profesor_id = current_setting('rtc.pa')::uuid and estado = 'pendiente') = 1, true,
  'H-291 · CA-63/ADM-05: tras reactivar, ese hueco se puede pedir de nuevo con solicitar_reserva');

select * from finish();
rollback;
