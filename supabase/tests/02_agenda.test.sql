-- B02 · T02.3 · pgTAP de agenda (CA-11, CA-15, CA-16, NFR-01, SEC-01, SEC-02, SEC-03, SEC-06, SEC-07, SEC-09;
-- casos T-AGE-01 a T-AGE-03, T-AGE-14, T-AGE-18): huecos (grilla, duración, huso), exclusión de clases (RES-01),
-- estados de la agenda pública (AGE-07), RLS de grilla_tramo, bloqueo, reserva y clase, y límites de las RPC.
-- Cada consulta con rol corre con `set local role` y `request.jwt.claims`; el resultado va a un GUC `rtc.*` y se
-- compara después con el rol postgres. Datos sintéticos (@example.test); todo se deshace con el rollback.
begin;
select plan(51);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'pgtap.profesor@example.test', now(), now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'pgtap.alumno.a@example.test', now(), now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'pgtap.alumno.b@example.test', now(), now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'pgtap.sinfila@example.test', now(), now(), now(), '', '', '', '');

update public.profesor set user_id = 'a0000000-0000-0000-0000-00000000000a', mail = 'pgtap.profesor@example.test', nombre = 'Profesor pgTAP';

insert into public.alumno (id, profesor_id, user_id, estado, nombre, mail) values
  ('b0000000-0000-0000-0000-0000000000a1', (select id from public.profesor), 'a0000000-0000-0000-0000-0000000000a1', 'aprobado', 'Centinela Nombre A', 'pgtap.alumno.a@example.test'),
  ('b0000000-0000-0000-0000-0000000000b1', (select id from public.profesor), 'a0000000-0000-0000-0000-0000000000b1', 'aprobado', 'Centinela Nombre B', 'pgtap.alumno.b@example.test')
-- Si el disparador de ingreso (B04) ya creó la fila del alumno al insertar en auth.users, se reemplaza por la de prueba.
on conflict (user_id) do update set id = excluded.id, estado = excluded.estado, nombre = excluded.nombre, mail = excluded.mail;

-- Reloj fijo: lunes 2026-11-02 12:00 en Montevideo (-03).
update privado.reloj_prueba set ahora = '2026-11-02 15:00:00+00';

-- A. Huecos (AGE-01, AGE-02, AGE-08; CA-11, CA-16) -------------------------------------------------------
select is((select count(*)::int from privado.huecos_del_dia((select id from public.profesor), '2026-11-02')), 9,
  'CA-11: con la grilla inicial y 60 min el lunes tiene 9 huecos');
select is((select min(inicio) from privado.huecos_del_dia((select id from public.profesor), '2026-11-02')), '2026-11-02 08:00-03'::timestamptz,
  'CA-11: el primer hueco empieza a las 08:00 de Montevideo');
select is((select max(fin) from privado.huecos_del_dia((select id from public.profesor), '2026-11-02')), '2026-11-02 18:00-03'::timestamptz,
  'CA-11: el último hueco termina a las 18:00');
select is((select count(*)::int from privado.huecos_del_dia((select id from public.profesor), '2026-11-02')
            where inicio >= '2026-11-02 13:00-03' and inicio < '2026-11-02 14:00-03'), 0,
  'CA-11: no hay hueco entre 13:00 y 14:00');
select is((select count(*)::int from privado.huecos_del_dia((select id from public.profesor), '2026-11-01')), 0,
  'T-AGE-03: un domingo sin grilla no tiene huecos');

update public.profesor set duracion_min = 90;
select is((select array_agg(to_char(inicio at time zone 'America/Montevideo', 'HH24:MI') order by inicio)
             from privado.huecos_del_dia((select id from public.profesor), '2026-11-02')
            where inicio < '2026-11-02 13:00-03'),
  array['08:00', '09:30', '11:00'], 'CA-11: con 90 min la mañana genera 3 huecos (08:00, 09:30, 11:00) y el sobrante de 30 min no es hueco');
select is((select count(*)::int from privado.huecos_del_dia((select id from public.profesor), '2026-11-02')), 5,
  'CA-11: con 90 min el día tiene 3 huecos de mañana y 2 de tarde');
update public.profesor set duracion_min = 60;

update public.profesor set zona_horaria = 'Asia/Tokyo';
select is((select min(inicio) from privado.huecos_del_dia((select id from public.profesor), '2026-11-02')), '2026-11-02 08:00+09'::timestamptz,
  'CA-16 (AGE-08): los instantes se calculan en el huso configurado, no en el de la sesión');
update public.profesor set zona_horaria = 'America/Montevideo';

-- B. Exclusión, RES-01 (ADR-002) y restricciones de las tablas ----------------------------------------------
insert into public.reserva (id, profesor_id, alumno_id, tipo, hora_local, dia_semana, duracion_min, observacion, estado, desde, origen) values
  ('d0000000-0000-0000-0000-0000000000a1', (select id from public.profesor), 'b0000000-0000-0000-0000-0000000000a1', 'suelta', '09:00', 1, 60, 'Centinela Observacion', 'confirmada', '2026-11-02', 'solicitud'),
  ('d0000000-0000-0000-0000-0000000000b1', (select id from public.profesor), 'b0000000-0000-0000-0000-0000000000b1', 'suelta', '10:00', 1, 60, 'Centinela Observacion B', 'pendiente', '2026-11-02', 'solicitud');

insert into public.clase (id, profesor_id, reserva_id, alumno_id, inicio, fin, estado) values
  ('e0000000-0000-0000-0000-0000000000a1', (select id from public.profesor), 'd0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-0000000000a1', '2026-11-02 09:00-03', '2026-11-02 10:00-03', 'confirmada');

select throws_ok(
  $$insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado) values ((select id from public.profesor), 'd0000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-0000000000b1', '2026-11-02 09:30-03', '2026-11-02 10:30-03', 'pendiente')$$,
  '23P01', null, 'RES-01: una clase pendiente que pisa una confirmada viola la exclusión');
select throws_ok(
  $$insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado) values ((select id from public.profesor), 'd0000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-0000000000b1', '2026-11-02 08:30-03', '2026-11-02 09:30-03', 'confirmada')$$,
  '23P01', null, 'RES-01: una clase que pisa por el principio también viola la exclusión');
select lives_ok(
  $$insert into public.clase (id, profesor_id, reserva_id, alumno_id, inicio, fin, estado) values ('e0000000-0000-0000-0000-0000000000b1', (select id from public.profesor), 'd0000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-0000000000b1', '2026-11-02 10:00-03', '2026-11-02 11:00-03', 'pendiente')$$,
  'RES-01: una clase que empieza donde termina otra no se solapa ([) semiabierto)');
select throws_ok(
  $$insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado) values ((select id from public.profesor), 'd0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-0000000000a1', '2026-11-02 10:30-03', '2026-11-02 11:30-03', 'confirmada')$$,
  '23P01', null, 'RES-01: una solicitud pendiente cuenta como activa para la exclusión');
select lives_ok(
  $$insert into public.clase (id, profesor_id, reserva_id, alumno_id, inicio, fin, estado) values ('e0000000-0000-0000-0000-0000000000c1', (select id from public.profesor), 'd0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-0000000000a1', '2026-11-02 09:00-03', '2026-11-02 10:00-03', 'cancelada')$$,
  'RES-01: una clase cancelada no bloquea el horario');
select throws_ok($$update public.clase set estado = 'confirmada' where id = 'e0000000-0000-0000-0000-0000000000c1'$$,
  '23P01', null, 'RES-01: reactivar la cancelada sobre un horario ocupado viola la exclusión');
select throws_ok(
  $$insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado) values ((select id from public.profesor), 'd0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-0000000000a1', '2026-11-03 10:00-03', '2026-11-03 09:00-03', 'confirmada')$$,
  '23514', null, 'Una clase con fin anterior al inicio viola clase_orden');
select throws_ok(
  $$insert into public.grilla_tramo (profesor_id, dia_semana, desde, hasta) values ((select id from public.profesor), 1, '12:00', '13:30')$$,
  '23P01', null, 'AGE-01: dos tramos del mismo día no se solapan');
select lives_ok(
  $$insert into public.grilla_tramo (profesor_id, dia_semana, desde, hasta) values ((select id from public.profesor), 6, '09:00', '12:00'), ((select id from public.profesor), 6, '12:00', '24:00')$$,
  'AGE-01: dos tramos pueden tocarse en el borde y el último admite hasta 24:00');
select throws_ok(
  $$insert into public.bloqueo (profesor_id, periodo, motivo) values ((select id from public.profesor), tstzrange('2026-11-04 10:00-03', '2026-11-04 12:00-03', '[)'), repeat('x', 501))$$,
  '23514', null, 'SEC-09: un motivo de bloqueo de más de 500 caracteres se rechaza');
select throws_ok(
  $$insert into public.reserva (profesor_id, alumno_id, tipo, hora_local, dia_semana, duracion_min, observacion, estado, desde, origen) values ((select id from public.profesor), 'b0000000-0000-0000-0000-0000000000a1', 'suelta', '09:00', 1, 60, repeat('x', 501), 'pendiente', '2026-11-09', 'solicitud')$$,
  '23514', null, 'SEC-09: una observación de más de 500 caracteres se rechaza');

-- C. Estados de la agenda pública (AGE-07, CA-15) -------------------------------------------------------------
-- Lunes 2026-11-02: confirmada 09-10 y pendiente 10-11 (ya sembradas), confirmada 11:30-12:30 (pisa dos huecos),
-- bloqueo 14-16, clase confirmada 19-20 (fuera de la grilla) y una cancelada a las 08.
-- La grilla del sábado (tramos de prueba de arriba) no afecta al lunes.
insert into public.clase (id, profesor_id, reserva_id, alumno_id, inicio, fin, estado) values
  ('e0000000-0000-0000-0000-0000000000d1', (select id from public.profesor), 'd0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-0000000000a1', '2026-11-02 11:30-03', '2026-11-02 12:30-03', 'confirmada'),
  ('e0000000-0000-0000-0000-0000000000d2', (select id from public.profesor), 'd0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-0000000000a1', '2026-11-02 19:00-03', '2026-11-02 20:00-03', 'confirmada'),
  ('e0000000-0000-0000-0000-0000000000d3', (select id from public.profesor), 'd0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-0000000000a1', '2026-11-02 08:00-03', '2026-11-02 09:00-03', 'cancelada');
insert into public.bloqueo (profesor_id, periodo, motivo) values
  ((select id from public.profesor), tstzrange('2026-11-02 14:00-03', '2026-11-02 16:00-03', '[)'), 'Centinela Motivo');

select is((select array_agg(to_char(inicio at time zone 'America/Montevideo', 'HH24:MI') || ' ' || estado order by inicio)
             from privado.agenda_publica((select id from public.profesor), '2026-11-02')),
  array['08:00 libre', '09:00 ocupado', '10:00 ocupado', '11:00 ocupado', '12:00 ocupado', '14:00 bloqueado', '15:00 bloqueado',
        '16:00 libre', '17:00 libre', '19:00 ocupado'],
  'AGE-07: libre, ocupado (confirmada, pendiente, solape parcial, clase fuera de grilla) y bloqueado; la cancelada no ocupa');

-- Anon (SEC-07, CA-15): solo inicio, fin y estado; ningún centinela en el JSON.
set local role anon;
do $$ begin
  perform set_config('rtc.anon_filas', (select count(*) from public.agenda_publica('2026-11-02'))::text, true);
  perform set_config('rtc.anon_claves', (select string_agg(distinct k, ',' order by k) from public.agenda_publica('2026-11-02') a, jsonb_object_keys(to_jsonb(a)) k), true);
  perform set_config('rtc.anon_json', (select jsonb_agg(to_jsonb(a))::text from public.agenda_publica('2026-11-02') a), true);
  perform set_config('rtc.anon_pendiente', (select estado from public.agenda_publica('2026-11-02') a where a.inicio = '2026-11-02 10:00-03'), true);
end $$;
reset role;
select is(current_setting('rtc.anon_filas'), '10', 'CA-15: anon recibe las 10 filas del día');
select is(current_setting('rtc.anon_claves'), 'estado,fin,inicio', 'SEC-07: cada fila de anon tiene solo inicio, fin y estado');
select is(current_setting('rtc.anon_json') !~* 'centinela|pgtap|example\.test|b0000000|d0000000|e0000000', true, 'CA-15: el JSON de anon no trae nombres, observaciones, motivos, mails ni ids');
select is(current_setting('rtc.anon_pendiente'), 'ocupado', 'CA-15: el hueco con una solicitud pendiente figura ocupado');

-- D. RLS (NFR-01, SEC-01, SEC-02, SEC-03) ----------------------------------------------------------------------
select set_config('rtc.total_clases', (select count(*) from public.clase)::text, true) is not null as _;
select set_config('rtc.total_reservas', (select count(*) from public.reserva)::text, true) is not null as _;
select set_config('rtc.total_grilla', (select count(*) from public.grilla_tramo)::text, true) is not null as _;
select set_config('rtc.total_bloqueos', (select count(*) from public.bloqueo)::text, true) is not null as _;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true); end $$;
do $$ begin
  perform set_config('rtc.a_clases', (select count(*) from public.clase)::text, true);
  perform set_config('rtc.a_clases_ajenas', (select count(*) from public.clase where alumno_id <> 'b0000000-0000-0000-0000-0000000000a1')::text, true);
  perform set_config('rtc.a_reservas', (select string_agg(id::text, ',') from public.reserva)::text, true);
  perform set_config('rtc.a_grilla', (select count(*) from public.grilla_tramo)::text, true);
  perform set_config('rtc.a_bloqueos', (select count(*) from public.bloqueo)::text, true);
end $$;
reset role;
select is(current_setting('rtc.a_clases_ajenas'), '0', 'SEC-02: el alumno A no ve clases de otro alumno');
select cmp_ok(current_setting('rtc.a_clases')::int, '>', 0, 'SEC-02: el alumno A ve sus clases');
select is(current_setting('rtc.a_clases')::int, (select count(*)::int from public.clase where alumno_id = 'b0000000-0000-0000-0000-0000000000a1'),
  'SEC-02: el alumno A ve exactamente las clases de su alumno_id');
select is(current_setting('rtc.a_reservas'), 'd0000000-0000-0000-0000-0000000000a1', 'SEC-02: el alumno A ve solo su reserva');
select is(current_setting('rtc.a_grilla') || ',' || current_setting('rtc.a_bloqueos'), '0,0', 'SEC-02: el alumno A no ve la grilla ni los bloqueos');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true); end $$;
do $$ begin
  perform set_config('rtc.b_clases', (select string_agg(id::text, ',' order by id) from public.clase)::text, true);
  perform set_config('rtc.b_reservas', (select string_agg(id::text, ',') from public.reserva)::text, true);
end $$;
reset role;
select is(current_setting('rtc.b_clases'), 'e0000000-0000-0000-0000-0000000000b1', 'SEC-02: el alumno B ve solo su clase (CA-26)');
select is(current_setting('rtc.b_reservas'), 'd0000000-0000-0000-0000-0000000000b1', 'SEC-02: el alumno B ve solo su reserva');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true); end $$;
do $$ begin
  perform set_config('rtc.p_clases', (select count(*) from public.clase)::text, true);
  perform set_config('rtc.p_reservas', (select count(*) from public.reserva)::text, true);
  perform set_config('rtc.p_grilla', (select count(*) from public.grilla_tramo)::text, true);
  perform set_config('rtc.p_bloqueos', (select count(*) from public.bloqueo)::text, true);
end $$;
reset role;
select is(current_setting('rtc.p_clases'), current_setting('rtc.total_clases'), 'SEC-02: el profesor lee todas las clases');
select is(current_setting('rtc.p_reservas'), current_setting('rtc.total_reservas'), 'SEC-02: el profesor lee todas las reservas');
select is(current_setting('rtc.p_grilla'), current_setting('rtc.total_grilla'), 'SEC-02: el profesor lee la grilla');
select is(current_setting('rtc.p_bloqueos'), current_setting('rtc.total_bloqueos'), 'SEC-02: el profesor lee los bloqueos');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true); end $$;
do $$ begin
  perform set_config('rtc.c_filas', ((select count(*) from public.clase) + (select count(*) from public.reserva)
    + (select count(*) from public.grilla_tramo) + (select count(*) from public.bloqueo))::text, true);
end $$;
reset role;
select is(current_setting('rtc.c_filas'), '0', 'SEC-02: un usuario sin fila de alumno ni de profesor no ve nada de la agenda');

set local role anon;
do $$ begin
  begin perform 1 from public.clase; perform set_config('rtc.anon_clase', 'visible', true);
  exception when insufficient_privilege then perform set_config('rtc.anon_clase', 'denegado', true); end;
  begin perform 1 from public.reserva; perform set_config('rtc.anon_reserva', 'visible', true);
  exception when insufficient_privilege then perform set_config('rtc.anon_reserva', 'denegado', true); end;
  begin perform 1 from public.grilla_tramo; perform set_config('rtc.anon_grilla', 'visible', true);
  exception when insufficient_privilege then perform set_config('rtc.anon_grilla', 'denegado', true); end;
  begin perform 1 from public.bloqueo; perform set_config('rtc.anon_bloqueo', 'visible', true);
  exception when insufficient_privilege then perform set_config('rtc.anon_bloqueo', 'denegado', true); end;
end $$;
reset role;
select is(current_setting('rtc.anon_clase') || ',' || current_setting('rtc.anon_reserva') || ',' || current_setting('rtc.anon_grilla') || ',' || current_setting('rtc.anon_bloqueo'),
  'denegado,denegado,denegado,denegado', 'SEC-01 / T-AGE-14: anon no puede leer clase, reserva, grilla_tramo ni bloqueo');

-- SEC-03: ni el profesor escribe directo en las tablas nuevas.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true); end $$;
do $$ begin
  begin insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado) values ((select id from public.profesor), 'd0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-0000000000a1', '2026-12-01 10:00-03', '2026-12-01 11:00-03', 'confirmada'); perform set_config('rtc.w_clase', 'permitido', true);
  exception when insufficient_privilege then perform set_config('rtc.w_clase', 'denegado', true); end;
  begin update public.clase set estado = 'cancelada'; perform set_config('rtc.w_clase_upd', 'permitido', true);
  exception when insufficient_privilege then perform set_config('rtc.w_clase_upd', 'denegado', true); end;
  begin delete from public.reserva; perform set_config('rtc.w_reserva', 'permitido', true);
  exception when insufficient_privilege then perform set_config('rtc.w_reserva', 'denegado', true); end;
  begin delete from public.grilla_tramo; perform set_config('rtc.w_grilla', 'permitido', true);
  exception when insufficient_privilege then perform set_config('rtc.w_grilla', 'denegado', true); end;
  begin insert into public.bloqueo (profesor_id, periodo) values ((select id from public.profesor), tstzrange('2026-12-01 10:00-03', '2026-12-01 11:00-03', '[)')); perform set_config('rtc.w_bloqueo', 'permitido', true);
  exception when insufficient_privilege then perform set_config('rtc.w_bloqueo', 'denegado', true); end;
end $$;
reset role;
select is(current_setting('rtc.w_clase') || ',' || current_setting('rtc.w_clase_upd') || ',' || current_setting('rtc.w_reserva') || ',' || current_setting('rtc.w_grilla') || ',' || current_setting('rtc.w_bloqueo'),
  'denegado,denegado,denegado,denegado,denegado', 'SEC-03: el profesor no escribe directo en clase, reserva, grilla_tramo ni bloqueo');

-- E. Rangos y límites de las RPC (SEC-06, SEC-09) --------------------------------------------------------------
set local role anon;
do $$ begin
  begin perform 1 from public.agenda_publica('2026-11-02'::date - 366); perform set_config('rtc.r_min', 'ok', true);
  exception when others then perform set_config('rtc.r_min', sqlstate, true); end;
  begin perform 1 from public.agenda_publica('2026-11-02'::date - 367); perform set_config('rtc.r_min1', 'ok', true);
  exception when others then perform set_config('rtc.r_min1', sqlstate || ' ' || sqlerrm, true); end;
  begin perform 1 from public.agenda_publica('2026-11-02'::date + 26 * 7 + 31); perform set_config('rtc.r_max', 'ok', true);
  exception when others then perform set_config('rtc.r_max', sqlstate, true); end;
  begin perform 1 from public.agenda_publica('2026-11-02'::date + 26 * 7 + 32); perform set_config('rtc.r_max1', 'ok', true);
  exception when others then perform set_config('rtc.r_max1', sqlstate || ' ' || sqlerrm, true); end;
  begin perform 1 from public.agenda_publica(null); perform set_config('rtc.r_nulo', 'ok', true);
  exception when others then perform set_config('rtc.r_nulo', sqlstate, true); end;
  begin perform 1 from public.guardar_grilla('[]'::jsonb); perform set_config('rtc.r_anon_grilla', 'ok', true);
  exception when others then perform set_config('rtc.r_anon_grilla', sqlstate, true); end;
end $$;
reset role;
select is(current_setting('rtc.r_min') || ',' || current_setting('rtc.r_max'), 'ok,ok', 'SEC-09: los dos extremos del rango de p_dia se aceptan');
select is(current_setting('rtc.r_min1'), 'PT422 DATOS_INVALIDOS', 'SEC-09: p_dia un día antes del mínimo da 422 DATOS_INVALIDOS');
select is(current_setting('rtc.r_max1'), 'PT422 DATOS_INVALIDOS', 'SEC-09: p_dia un día después del máximo da 422 DATOS_INVALIDOS');
select is(current_setting('rtc.r_nulo'), 'PT422', 'SEC-09: p_dia nulo da 422');
select is(current_setting('rtc.r_anon_grilla'), '42501', 'SEC-06: anon no ejecuta guardar_grilla (permiso denegado)');

-- guardar_grilla y guardar_configuracion como alumno (403) y como profesor (50 tramos sí, 51 no).
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true); end $$;
do $$ begin
  begin perform public.guardar_grilla('[]'::jsonb); perform set_config('rtc.al_grilla', 'ok', true);
  exception when others then perform set_config('rtc.al_grilla', sqlstate || ' ' || sqlerrm, true); end;
  begin perform public.guardar_configuracion(60, 24, 'America/Montevideo'); perform set_config('rtc.al_config', 'ok', true);
  exception when others then perform set_config('rtc.al_config', sqlstate || ' ' || sqlerrm, true); end;
end $$;
reset role;
select is(current_setting('rtc.al_grilla'), 'PT403 PROHIBIDO', 'SEC-06: un alumno no puede guardar la grilla (403)');
select is(current_setting('rtc.al_config'), 'PT403 PROHIBIDO', 'SEC-06: un alumno no puede guardar la configuración (403)');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true); end $$;
do $$
declare
  v_50 jsonb := (select jsonb_agg(jsonb_build_object('dia_semana', i / 8 + 1,
                   'desde', lpad(((i % 8) * 3)::text, 2, '0') || ':00', 'hasta', lpad(((i % 8) * 3 + 1)::text, 2, '0') || ':00'))
                   from generate_series(0, 49) i);
  v_51 jsonb := (select jsonb_agg(jsonb_build_object('dia_semana', i / 8 + 1,
                   'desde', lpad(((i % 8) * 3)::text, 2, '0') || ':00', 'hasta', lpad(((i % 8) * 3 + 1)::text, 2, '0') || ':00'))
                   from generate_series(0, 50) i);
begin
  begin perform public.guardar_grilla(v_51); perform set_config('rtc.p_g51', 'ok', true);
  exception when others then perform set_config('rtc.p_g51', sqlstate || ' ' || sqlerrm, true); end;
  perform set_config('rtc.p_g51_filas', (select count(*) from public.grilla_tramo)::text, true);
  begin perform public.guardar_grilla(v_50); perform set_config('rtc.p_g50', 'ok', true);
  exception when others then perform set_config('rtc.p_g50', sqlstate || ' ' || sqlerrm, true); end;
  perform set_config('rtc.p_g50_filas', (select count(*) from public.grilla_tramo)::text, true);
  begin perform public.guardar_grilla('[{"dia_semana":1,"desde":"10:00","hasta":"12:00"},{"dia_semana":1,"desde":"11:00","hasta":"13:00"}]'::jsonb); perform set_config('rtc.p_solape', 'ok', true);
  exception when others then perform set_config('rtc.p_solape', sqlstate || ' ' || sqlerrm, true); end;
  begin perform public.guardar_configuracion(0, 24, 'America/Montevideo'); perform set_config('rtc.p_dur0', 'ok', true);
  exception when others then perform set_config('rtc.p_dur0', sqlstate || ' ' || sqlerrm, true); end;
  begin perform public.guardar_configuracion(60, 24, 'Mars/Olympus'); perform set_config('rtc.p_zona', 'ok', true);
  exception when others then perform set_config('rtc.p_zona', sqlstate || ' ' || sqlerrm, true); end;
end $$;
reset role;
select is(current_setting('rtc.p_g51'), 'PT422 DATOS_INVALIDOS', 'SEC-09: una grilla de 51 tramos da 422');
select is(current_setting('rtc.p_g51_filas'), current_setting('rtc.total_grilla'), 'SEC-09: la grilla rechazada no cambió nada');
select is(current_setting('rtc.p_g50') || ',' || current_setting('rtc.p_g50_filas'), 'ok,50', 'SEC-09: una grilla de 50 tramos se acepta y reemplaza la anterior');
select is(current_setting('rtc.p_solape'), 'PT422 DATOS_INVALIDOS', 'AGE-01: tramos solapados del mismo día dan 422');
select is(current_setting('rtc.p_dur0'), 'PT422 DATOS_INVALIDOS', 'AGE-02: una duración de 0 minutos da 422');
select is(current_setting('rtc.p_zona'), 'PT422 DATOS_INVALIDOS', 'AGE-08: una zona horaria inexistente da 422');

select * from finish();
rollback;
