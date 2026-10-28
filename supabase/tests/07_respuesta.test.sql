-- B07 · T07.3 · Respuesta del profesor (`responder_solicitud`), vistas de Mis clases y de la lista del profesor, con dos profesores.
-- IDs: SOL-04, SOL-05, SOL-06, SOL-08, RES-02, RES-06, PRF-06, PRF-07, PRF-08, AVI-03, ALU-03, SEC-02, SEC-05, SEC-06, SEC-09, SEC-29.
-- CA-18, CA-20, CA-21, CA-25, CA-29, CA-34, CA-45 (rama Mis clases), CA-53, CA-55, CA-56 (cuerpo; remitente y Reply-To en
-- tests/integracion/respuestas), CA-63 (rama de B07). Casos: T-RES-05, T-RES-06, T-RES-07, T-RES-13, T-RES-14, T-SOL-02, T-SOL-15,
-- T-SOL-16, T-SOL-25, T-PRF-09, T-PRF-10, T-PRF-11.
-- Reloj fijo: lunes 2026-11-02 12:00 de Montevideo (15:00Z); la profesora B trabaja en Europe/Madrid. Datos sintéticos
-- (@example.test); todo se deshace con el rollback.
begin;
select plan(86);

-- Ayudas ------------------------------------------------------------------------------------------------------------------
-- Ejecuta p_sql con el rol authenticated y esos claims: devuelve el valor (texto) o `ERR|sqlstate|mensaje|detalle`.
create function pg_temp.q(p_sub uuid, p_sql text, p_rol text default 'authenticated') returns text language plpgsql as $f$
declare v text; v_det text;
begin
  perform set_config('request.jwt.claims', case when p_sub is null then json_build_object('role', p_rol)::text
                                                 else json_build_object('sub', p_sub, 'role', p_rol)::text end, true);
  execute format('set local role %I', p_rol);
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
create function pg_temp.err(p text) returns text language sql as $f$
  select case when p like 'ERR|%' then split_part(p, '|', 2) || ' ' || split_part(p, '|', 3) else 'OK' end $f$;
create function pg_temp.det(p text) returns jsonb language sql as $f$ select nullif(split_part(p, '|', 4), '')::jsonb $f$;
create function pg_temp.usuario(p_id uuid, p_mail text) returns void language sql as $f$
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_mail, now(), now(), now(), '', '', '', '', '{}')
$f$;
-- Persona con ficha completa y su inscripción con A y con B (null = sin inscripción); `p_mot_a` es el motivo de un rechazo de A.
create function pg_temp.persona(p_user uuid, p_nombre text, p_con_a text, p_con_b text, p_mot_a text default null) returns void language plpgsql as $f$
declare v_id uuid;
begin
  update public.alumno set estado = 'completa', nombre = p_nombre, telefono = '099 700 700', fecha_nacimiento = '1990-01-01',
         ficha_completada_en = '2026-01-01', ficha_origen_profesor_id = current_setting('rtc.pa')::uuid
   where user_id = p_user returning id into v_id;
  perform set_config('rtc.al_' || right(p_user::text, 2), v_id::text, true);
  if p_con_a is not null then
    insert into public.inscripcion (alumno_id, profesor_id, estado, motivo_estado, aprobado_en)
    values (v_id, current_setting('rtc.pa')::uuid, p_con_a, case when p_con_a = 'rechazado' then p_mot_a end,
            case when p_con_a = 'aprobado' then public.app_ahora() end);
  end if;
  if p_con_b is not null then
    insert into public.inscripcion (alumno_id, profesor_id, estado, aprobado_en)
    values (v_id, current_setting('rtc.pb')::uuid, p_con_b, case when p_con_b = 'aprobado' then public.app_ahora() end);
  end if;
end;
$f$;
create function pg_temp.sol(p_sub uuid, p_prof text, p_inicio text, p_tipo text, p_freq int default null,
                            p_persona uuid default null, p_obs text default null) returns text language sql as $f$
  select pg_temp.q(p_sub, format('select public.solicitar_reserva(%L::uuid, %L::timestamptz, %L, %L::int, %L::uuid, %L)::text',
                                  current_setting('rtc.' || p_prof), p_inicio, p_tipo, p_freq, p_persona, p_obs))
$f$;
-- Id de la solicitud de la persona `p_al` (sufijo del usuario) con la fecha de clase `p_inicio`.
create function pg_temp.sid(p_al text, p_inicio text) returns text language sql as $f$
  select id::text from public.solicitud where alumno_id = current_setting('rtc.al_' || p_al)::uuid and fecha_clase = p_inicio::timestamptz
$f$;
create function pg_temp.resp(p_sub uuid, p_id text, p_dec text, p_mot text default null) returns text language sql as $f$
  select pg_temp.q(p_sub, format('select public.responder_solicitud(%L::uuid, %L, %L)::text', p_id, p_dec, p_mot))
$f$;
-- Estado del hueco de `p_hora` (hora local de la zona del profesor) en su agenda pública.
create function pg_temp.huecos(p_slug text, p_dia text, p_hora text, p_zona text default 'America/Montevideo') returns text language sql as $f$
  select estado from public.agenda_publica(p_slug, p_dia::date) where to_char(inicio at time zone p_zona, 'HH24:MI') = p_hora
$f$;
create function pg_temp.reloj(p text) returns void language sql as $f$ update privado.reloj_prueba set ahora = p::timestamptz $f$;

-- Preparación: dos profesores (B en Madrid), el Administrador y cinco personas ---------------------------------------------------
select pg_temp.reloj('2026-11-02 15:00:00+00');
select set_config('rtc.pa', privado.configurar_profesor('pgtap07.profa@example.test', 'Profe A', 'pgtap07-a')::text, true) is not null as _;
select set_config('rtc.pb', privado.configurar_profesor('pgtap07.profb@example.test', 'Profe B', 'pgtap07-b')::text, true) is not null as _;
update public.profesor set zona_horaria = 'Europe/Madrid' where id = current_setting('rtc.pb')::uuid;
select privado.configurar_administrador('pgtap07.admin@example.test');
select pg_temp.usuario('a0700000-0000-0000-0000-00000000000a', 'pgtap07.profa@example.test');
select pg_temp.usuario('a0700000-0000-0000-0000-00000000000b', 'pgtap07.profb@example.test');
select pg_temp.usuario('a0700000-0000-0000-0000-00000000000d', 'pgtap07.admin@example.test');
select pg_temp.usuario('a0700000-0000-0000-0000-000000000001', 'pgtap07.ana@example.test');   -- aprobada solo con A
select pg_temp.usuario('a0700000-0000-0000-0000-000000000003', 'pgtap07.cris@example.test');  -- rechazada con A (con motivo), aprobada con B
select pg_temp.usuario('a0700000-0000-0000-0000-000000000004', 'pgtap07.dani@example.test');  -- aprobada con A y con B
select pg_temp.usuario('a0700000-0000-0000-0000-000000000006', 'pgtap07.eva@example.test');   -- rechazada con A, sin motivo
select pg_temp.usuario('a0700000-0000-0000-0000-000000000007', 'pgtap07.gus@example.test');   -- aprobado con A, con un mail inválido
select pg_temp.persona('a0700000-0000-0000-0000-000000000001', 'Ana', 'aprobado', null);
select pg_temp.persona('a0700000-0000-0000-0000-000000000003', 'Cris', 'rechazado', 'aprobado', '<script>alert(1)</script> sin cupo');
select pg_temp.persona('a0700000-0000-0000-0000-000000000004', 'Dani', 'aprobado', 'aprobado');
select pg_temp.persona('a0700000-0000-0000-0000-000000000006', 'Eva', 'rechazado', null);
select pg_temp.persona('a0700000-0000-0000-0000-000000000007', 'Gus', 'aprobado', null);
insert into public.persona_a_cargo (id, alumno_id, nombre, fecha_nacimiento) values
  ('a0700000-0000-0000-0000-0000000000c1', current_setting('rtc.al_01')::uuid, 'Hija de Ana', '2015-03-04');
-- Dos clases pasadas confirmadas con A (octubre), para el historial y los filtros.
insert into public.reserva (id, profesor_id, alumno_id, tipo, hora_local, dia_semana, duracion_min, estado, desde, origen) values
  ('a0700000-0000-0000-0000-0000000001a1', current_setting('rtc.pa')::uuid, current_setting('rtc.al_01')::uuid, 'suelta', '10:00', 2, 60, 'confirmada', '2026-10-20', 'solicitud'),
  ('a0700000-0000-0000-0000-0000000001a2', current_setting('rtc.pa')::uuid, current_setting('rtc.al_04')::uuid, 'suelta', '10:00', 3, 60, 'confirmada', '2026-10-21', 'solicitud');
insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado, confirmada_en) values
  (current_setting('rtc.pa')::uuid, 'a0700000-0000-0000-0000-0000000001a1', current_setting('rtc.al_01')::uuid, '2026-10-20 10:00-03', '2026-10-20 11:00-03', 'confirmada', '2026-10-10 12:00-03'),
  (current_setting('rtc.pa')::uuid, 'a0700000-0000-0000-0000-0000000001a2', current_setting('rtc.al_04')::uuid, '2026-10-21 10:00-03', '2026-10-21 11:00-03', 'confirmada', '2026-10-10 12:00-03');

-- 1. Las solicitudes (T-SOL-02, CA-21): cada persona pide a su profesor -----------------------------------------------------------
select ok(pg_temp.sol('a0700000-0000-0000-0000-000000000001', 'pa', '2026-11-09 10:00-03', 'serie', 1, 'a0700000-0000-0000-0000-0000000000c1', 'Serie de Ana') like '{%',
  'preparación: Ana pide una serie semanal con A desde el lunes 09/11 10:00, para su hija');
select ok(pg_temp.sol('a0700000-0000-0000-0000-000000000004', 'pa', '2026-11-10 10:00-03', 'serie', 2) like '{%', 'preparación: Dani pide una serie quincenal con A desde el martes 10/11 10:00');
select ok(pg_temp.sol('a0700000-0000-0000-0000-000000000004', 'pa', '2026-11-11 09:00-03', 'serie', 1) like '{%', 'preparación: Dani pide una serie semanal con A desde el miércoles 11/11 09:00 (la rechazará A)');
select ok(pg_temp.sol('a0700000-0000-0000-0000-000000000001', 'pa', '2026-11-05 10:00-03', 'suelta') like '{%', 'preparación: Ana pide una clase suelta con A el jueves 05/11 10:00');
select ok(pg_temp.sol('a0700000-0000-0000-0000-000000000004', 'pb', '2026-11-10 10:00+01', 'suelta') like '{%', 'preparación: Dani pide una clase suelta con B el martes 10/11 10:00 de Madrid');
select ok(pg_temp.sol('a0700000-0000-0000-0000-000000000004', 'pb', '2026-11-11 10:00+01', 'suelta') like '{%', 'preparación: Dani pide otra con B el miércoles 11/11 10:00 de Madrid');
select ok(pg_temp.sol('a0700000-0000-0000-0000-000000000007', 'pa', '2026-11-06 10:00-03', 'suelta') like '{%', 'preparación: Gus pide una clase suelta con A el viernes 06/11 10:00');

select is(pg_temp.q('a0700000-0000-0000-0000-00000000000a', $$select string_agg(titular || ':' || reserva_tipo || ':' || coalesce(frecuencia::text, '-') || ':' || vencida::text, ',' order by fecha_clase, id)
                                                             from public.v_solicitudes_pendientes$$),
  'Ana:suelta:-:false,Gus:suelta:-:false,Ana:serie:1:false,Dani:serie:2:false,Dani:serie:1:false',
  'CA-21/T-SOL-02/PRF-06: la lista de A trae sus cinco pendientes ordenadas por fecha de clase, con tipo y frecuencia, ninguna vencida');
select is(pg_temp.q('a0700000-0000-0000-0000-00000000000b', $$select count(*) from public.v_solicitudes_pendientes$$), '2',
  'CA-55: la profesora B ve en su lista solo las dos solicitudes hechas en su agenda');
select is(pg_temp.q('a0700000-0000-0000-0000-00000000000a', $$select quien_toma from public.v_solicitudes_pendientes where titular = 'Ana' and reserva_tipo = 'serie'$$), 'Hija de Ana',
  'PRF-06: la lista dice quién toma la clase (la persona a cargo)');
select is(pg_temp.q('a0700000-0000-0000-0000-000000000001', $$select (count(*) >= 20)::text || '/' || min(solicitud_pendiente ->> 'tipo') || '/' || min(estado) from public.v_mis_clases where reserva_tipo = 'serie'$$),
  'true/reserva/pendiente', 'CA-21/CA-20: Mis clases de Ana trae todas las clases de la serie pendiente (todo el horizonte), con su solicitud pendiente');
select is(pg_temp.q('a0700000-0000-0000-0000-000000000001', $$select count(*) from public.v_solicitudes_pendientes$$), '0',
  'SEC-02: la persona no ve nada de la lista de pendientes del profesor');

-- 2. CA-55 / SEC-06 / SEC-09: solo A responde la solicitud hecha en su agenda -----------------------------------------------------
select set_config('rtc.s_ana_serie', pg_temp.sid('01', '2026-11-09 10:00-03'), true) is not null as _;
select set_config('rtc.s_dani_quin', pg_temp.sid('04', '2026-11-10 10:00-03'), true) is not null as _;
select set_config('rtc.s_dani_sem', pg_temp.sid('04', '2026-11-11 09:00-03'), true) is not null as _;
select set_config('rtc.s_ana_suelta', pg_temp.sid('01', '2026-11-05 10:00-03'), true) is not null as _;
select set_config('rtc.s_gus', pg_temp.sid('07', '2026-11-06 10:00-03'), true) is not null as _;
select set_config('rtc.s_dani_b1', pg_temp.sid('04', '2026-11-10 10:00+01'), true) is not null as _;
select set_config('rtc.s_dani_b2', pg_temp.sid('04', '2026-11-11 10:00+01'), true) is not null as _;
select is(pg_temp.err(pg_temp.resp('a0700000-0000-0000-0000-00000000000b', current_setting('rtc.s_ana_serie'), 'confirmar')), 'PT404 NO_ENCONTRADO',
  'CA-55/T-SOL-25: la profesora B no confirma la solicitud de A: da 404 igual que un id inexistente');
select is(pg_temp.err(pg_temp.resp('a0700000-0000-0000-0000-00000000000b', current_setting('rtc.s_ana_serie'), 'rechazar', 'no')), 'PT404 NO_ENCONTRADO',
  'CA-55/T-SOL-25: ni la rechaza');
select is((select s.estado || '/' || r.estado from public.solicitud s join public.reserva r on r.id = s.reserva_id where s.id = current_setting('rtc.s_ana_serie')::uuid), 'pendiente/pendiente',
  'CA-55: tras los intentos de B la solicitud y la reserva siguen pendientes');
select is(pg_temp.err(pg_temp.resp('a0700000-0000-0000-0000-000000000001', current_setting('rtc.s_ana_serie'), 'confirmar')), 'PT403 PROHIBIDO', 'SEC-06: la persona no responde solicitudes (403)');
select is(pg_temp.err(pg_temp.resp('a0700000-0000-0000-0000-00000000000d', current_setting('rtc.s_ana_serie'), 'confirmar')), 'PT403 PROHIBIDO', 'SEC-06: el Administrador que no es profesor no responde solicitudes (403)');
select is(pg_temp.err(pg_temp.q(null, format('select public.responder_solicitud(%L::uuid, ''confirmar'')::text', current_setting('rtc.s_ana_serie')))), 'PT401 NO_AUTENTICADO', 'SEC-06: sin sesión da 401');
select is(pg_temp.err(pg_temp.q(null, format('select public.responder_solicitud(%L::uuid, ''confirmar'')::text', current_setting('rtc.s_ana_serie')), 'anon')),
  '42501 permission denied for function responder_solicitud', 'SEC-04/SEC-06: anon no tiene permiso sobre la función');
select is(pg_temp.err(pg_temp.resp('a0700000-0000-0000-0000-00000000000a', gen_random_uuid()::text, 'confirmar')), 'PT404 NO_ENCONTRADO', 'SEC-06: un id inexistente da 404');
select is(pg_temp.det(pg_temp.resp('a0700000-0000-0000-0000-00000000000a', current_setting('rtc.s_ana_serie'), 'borrar')) ->> 'campo', 'p_decision',
  'SEC-09: una decisión distinta de confirmar o rechazar da 422 con el campo p_decision');
select is(pg_temp.det(pg_temp.resp('a0700000-0000-0000-0000-00000000000a', current_setting('rtc.s_ana_serie'), 'confirmar', repeat('x', 501))) ->> 'campo', 'motivo',
  'SEC-09: un motivo de 501 caracteres da 422 con el campo motivo');
select is((select s.estado || '/' || r.estado || '/' || (s.motivo is null)::text from public.solicitud s join public.reserva r on r.id = s.reserva_id where s.id = current_setting('rtc.s_ana_serie')::uuid),
  'pendiente/pendiente/true', 'SEC-09: el motivo inválido no cambia nada');

-- 3. CA-18 / T-RES-05 / T-RES-06 / T-RES-07: la serie confirmada ocupa los huecos de las semanas siguientes ----------------------
select is(pg_temp.resp('a0700000-0000-0000-0000-00000000000a', current_setting('rtc.s_ana_serie'), 'confirmar', 'Nos vemos'), '{"estado": "confirmada"}',
  'SOL-05/T-RES-07: A confirma la serie semanal de Ana');
select is((select r.estado || '/' || (count(*) filter (where c.estado = 'confirmada') >= 20)::text || '/' || count(*) filter (where c.estado <> 'confirmada') || '/' || bool_and(c.confirmada_en = '2026-11-02 15:00:00+00')::text
             from public.reserva r join public.clase c on c.reserva_id = r.id where r.id = (select reserva_id from public.solicitud where id = current_setting('rtc.s_ana_serie')::uuid) group by r.estado),
  'confirmada/true/0/true', 'CA-18/T-RES-07: la reserva y todas sus clases del horizonte pasan a confirmada, con confirmada_en = app_ahora()');
select is((select (count(*) >= 20)::text || '/' || bool_and(g = 7)::text from (select c.inicio::date - lag(c.inicio::date) over (order by c.inicio) as g from public.clase c
             where c.reserva_id = (select reserva_id from public.solicitud where id = current_setting('rtc.s_ana_serie')::uuid)) t where g is not null),
  'true/true', 'CA-18/RES-02: las clases de la serie semanal están separadas exactamente 7 días');
select is((select string_agg(pg_temp.huecos('pgtap07-a', d, '10:00'), ',' order by d) from unnest(array['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']) d),
  'ocupado,ocupado,ocupado,ocupado', 'CA-18/T-RES-05: cada lunes 10:00 de la serie semanal figura ocupado en la agenda pública de A');
select is((select string_agg(pg_temp.huecos('pgtap07-a', d, '10:00'), ',' order by d) from unnest(array['2026-11-12', '2026-11-13']) d), 'libre,libre',
  'CA-18/T-RES-05: los demás huecos de esos días siguen libres');
select is(pg_temp.huecos('pgtap07-b', '2026-11-09', '10:00', 'Europe/Madrid'), 'libre', 'CA-54/CA-18: el mismo horario sigue libre en la agenda de B');
select is(pg_temp.resp('a0700000-0000-0000-0000-00000000000a', current_setting('rtc.s_dani_quin'), 'confirmar'), '{"estado": "confirmada"}', 'SOL-05: A confirma la serie quincenal de Dani');
select is((select string_agg(pg_temp.huecos('pgtap07-a', d, '10:00'), ',' order by d) from unnest(array['2026-11-10', '2026-11-17', '2026-11-24', '2026-12-01']) d),
  'ocupado,libre,ocupado,libre', 'CA-18/T-RES-06: la serie quincenal confirmada ocupa las semanas 1 y 3 y deja libres la 2 y la 4');
select is((select (count(*) >= 10)::text || '/' || bool_and(g = 14)::text from (select c.inicio::date - lag(c.inicio::date) over (order by c.inicio) as g from public.clase c
             where c.reserva_id = (select reserva_id from public.solicitud where id = current_setting('rtc.s_dani_quin')::uuid) and c.estado = 'confirmada') t where g is not null),
  'true/true', 'CA-18/RES-02: las clases de la quincenal confirmada están separadas exactamente 14 días');
select is(pg_temp.resp('a0700000-0000-0000-0000-00000000000a', current_setting('rtc.s_dani_sem'), 'rechazar', 'Sin cupo'), '{"estado": "rechazada"}', 'SOL-06/T-RES-07: A rechaza la serie semanal de Dani con un motivo');
select is((select r.estado || '/' || (count(*) filter (where c.estado = 'rechazada') >= 20)::text || '/' || count(*) filter (where c.estado <> 'rechazada')
             from public.reserva r join public.clase c on c.reserva_id = r.id where r.id = (select reserva_id from public.solicitud where id = current_setting('rtc.s_dani_sem')::uuid) group by r.estado),
  'rechazada/true/0', 'T-RES-07: rechazada, la serie libera todas sus ocurrencias (todas las clases del horizonte rechazadas)');
select is((select string_agg(pg_temp.huecos('pgtap07-a', d, '09:00'), ',' order by d) from unnest(array['2026-11-11', '2026-11-18', '2026-11-25']) d), 'libre,libre,libre',
  'T-RES-07: los huecos de la serie rechazada quedan libres en la agenda pública');
select is((select estado || '/' || motivo || '/' || (respondida_en = '2026-11-02 15:00:00+00')::text from public.solicitud where id = current_setting('rtc.s_dani_sem')::uuid), 'rechazada/Sin cupo/true',
  'SOL-06: la solicitud queda con su estado, el motivo y respondida_en = app_ahora()');
select is(pg_temp.err(pg_temp.resp('a0700000-0000-0000-0000-00000000000a', current_setting('rtc.s_dani_sem'), 'confirmar')), 'PT409 SOLICITUD_YA_RESPONDIDA', 'SOL-04: responder dos veces da 409 SOLICITUD_YA_RESPONDIDA');
select is((select estado from public.reserva where id = (select reserva_id from public.solicitud where id = current_setting('rtc.s_dani_sem')::uuid)), 'rechazada', 'SOL-04: la segunda respuesta no cambia lo rechazado');
select is(pg_temp.q('a0700000-0000-0000-0000-00000000000a', $$select string_agg(titular || ':' || reserva_tipo, ',' order by fecha_clase, id) from public.v_solicitudes_pendientes$$), 'Ana:suelta,Gus:suelta',
  'PRF-06: las respondidas salen de la lista de pendientes de A; quedan las dos sin responder');

-- 4. Mails de respuesta (AVI-03, CA-56 cuerpo, SEC-29) ---------------------------------------------------------------------------
select is((select asunto || '|' || profesor_id::text || '|' || estado from public.mail_salida where tipo = 'solicitud_respondida' and destinatario = 'pgtap07.ana@example.test'),
  'Profe A confirmó tu solicitud de reserva|' || current_setting('rtc.pa') || '|pendiente', 'AVI-03/CA-56: el mail a Ana lleva el nombre de A en el asunto y sale a nombre de A');
select ok((select cuerpo_texto like '%Serie semanal desde el 09/11/2026 a las 10:00 (hora de America/Montevideo)%Toma la clase: Hija de Ana%Mensaje: Nos vemos%'
             from public.mail_salida where tipo = 'solicitud_respondida' and destinatario = 'pgtap07.ana@example.test'),
  'AVI-03: el cuerpo dice la serie, la hora con el huso, quién toma la clase y el mensaje del profesor');
select ok((select cuerpo_texto !~* '(1990|2015|nacimiento|04/03|03/04)' from public.mail_salida where tipo = 'solicitud_respondida' and destinatario = 'pgtap07.ana@example.test'),
  'SEC-29: el mail no trae fecha de nacimiento de la titular ni de la persona a cargo');
select ok((select cuerpo_texto like '%Serie quincenal desde el 10/11/2026%' and cuerpo_texto not like '%Mensaje:%' from public.mail_salida where tipo = 'solicitud_respondida'
              and asunto like 'Profe A confirmó%' and destinatario = 'pgtap07.dani@example.test'),
  'AVI-03: la quincenal dice «Serie quincenal» y sin mensaje no trae «Mensaje:»');
select ok((select asunto = 'Profe A rechazó tu solicitud de reserva' and cuerpo_texto like '%Motivo: Sin cupo%' from public.mail_salida where tipo = 'solicitud_respondida'
              and asunto like 'Profe A rechazó%' and destinatario = 'pgtap07.dani@example.test'),
  'AVI-03: el rechazo dice «rechazó» y el motivo');
select is((select count(*)::int from public.mail_salida where tipo = 'solicitud_respondida' and profesor_id = current_setting('rtc.pb')::uuid), 0, 'CA-55: ninguna respuesta de A genera mails de B');
select is((select count(*)::int from public.mail_salida where tipo = 'solicitud_respondida' and destinatario = 'pgtap07.ana@example.test'), 1, 'AVI-03: una sola respuesta, un solo mail a Ana (los intentos fallidos de B y de la persona no encolan)');

-- 5. CA-53 / CA-20: Mis clases con dos profesores y husos distintos --------------------------------------------------------------
select is(pg_temp.resp('a0700000-0000-0000-0000-00000000000b', current_setting('rtc.s_dani_b1'), 'confirmar'), '{"estado": "confirmada"}', 'SOL-05: B confirma la clase de Dani');
select is(pg_temp.q('a0700000-0000-0000-0000-000000000004', $$select string_agg(distinct profesor_nombre || '@' || zona_horaria || '@' || profesor_slug, ',' order by profesor_nombre || '@' || zona_horaria || '@' || profesor_slug) from public.v_mis_clases$$),
  'Profe A@America/Montevideo@pgtap07-a,Profe B@Europe/Madrid@pgtap07-b',
  'CA-53: Dani ve en Mis clases las clases de A y de B, cada una con el nombre, el slug y el huso de su profesor');
select is(pg_temp.q('a0700000-0000-0000-0000-000000000004', $$select inicio::text || '/' || estado || '/' || pasada::text from public.v_mis_clases where profesor_slug = 'pgtap07-b' and estado = 'confirmada'$$),
  '2026-11-10 09:00:00+00/confirmada/false', 'CA-53: la clase de B está confirmada a las 09:00Z (10:00 de Madrid) y no es pasada');
select is(pg_temp.q('a0700000-0000-0000-0000-000000000004', $$select string_agg(distinct estado, ',' order by estado) from public.v_mis_clases where profesor_slug = 'pgtap07-a'$$), 'confirmada,rechazada',
  'CA-20: de A, Dani ve clases confirmadas (la quincenal y la pasada) y rechazadas (la serie que A rechazó)');
select is(pg_temp.q('a0700000-0000-0000-0000-000000000004', $$select count(*) from public.v_mis_clases where pasada and estado = 'confirmada'$$), '1',
  'CA-20/T-RES-14: la clase pasada confirmada figura en el historial de Dani, marcada pasada por app_ahora()');
select is(pg_temp.q('a0700000-0000-0000-0000-000000000001', $$select count(distinct profesor_id) || '/' || count(*) filter (where pasada) from public.v_mis_clases$$), '1/1',
  'CA-53/T-RES-13: Ana, solo de A, ve únicamente las de A (con su clase pasada) y ninguna de Dani');
select is(pg_temp.q('a0700000-0000-0000-0000-000000000003', $$select count(*) from public.v_mis_clases$$), '0', 'T-RES-13/CA-26: Cris no ve las clases de otras personas en Mis clases');
select is(pg_temp.q('a0700000-0000-0000-0000-00000000000a', $$select count(*) from public.v_mis_clases$$), '0', 'SEC-02: un profesor no ve nada en Mis clases (la vista de las personas)');

-- 6. CA-63 (rama B07): con el profesor inactivo, confirmar da 409 y rechazar sí -------------------------------------------------
update public.profesor set activo = false where id = current_setting('rtc.pb')::uuid;
select is(pg_temp.err(pg_temp.resp('a0700000-0000-0000-0000-00000000000b', current_setting('rtc.s_dani_b2'), 'confirmar')), 'PT409 PROFESOR_INACTIVO', 'CA-63: con B inactivo confirmar da 409 PROFESOR_INACTIVO');
select is((select estado from public.solicitud where id = current_setting('rtc.s_dani_b2')::uuid), 'pendiente', 'CA-63: la solicitud sigue pendiente y no se escribió nada');
select is(pg_temp.err(pg_temp.resp('a0700000-0000-0000-0000-00000000000b', current_setting('rtc.s_dani_b2'), 'rechazar', repeat('y', 501))), 'PT422 DATOS_INVALIDOS', 'SEC-09/CA-63: el motivo de 501 caracteres da 422 también con el profesor inactivo');
select is(pg_temp.resp('a0700000-0000-0000-0000-00000000000b', current_setting('rtc.s_dani_b2'), 'rechazar', repeat('y', 500)), '{"estado": "rechazada"}', 'PRF-08/CA-63: con B inactivo rechazar sí se puede, con un motivo de 500 caracteres');
select is((select asunto || '|' || (cuerpo_texto like '%Clase del 11/11/2026 a las 10:00 (hora de Europe/Madrid)%' and cuerpo_texto like '%Motivo: yyyy%')::text from public.mail_salida
             where tipo = 'solicitud_respondida' and destinatario = 'pgtap07.dani@example.test' and profesor_id = current_setting('rtc.pb')::uuid and asunto like '%rechazó%'),
  'Profe B rechazó tu solicitud de reserva|true', 'CA-56/CA-63: el mail de B sale con el nombre de B, la hora de Madrid y el motivo');
select is(pg_temp.q('a0700000-0000-0000-0000-000000000004', $$select count(*) from public.v_mis_clases where profesor_slug = 'pgtap07-b' and estado = 'confirmada'$$), '1',
  'CA-63: la clase confirmada con B (inactivo) sigue en Mis clases de Dani');
select is(pg_temp.q('a0700000-0000-0000-0000-00000000000b', $$select count(*) from public.v_clases where estado = 'confirmada'$$), '1', 'CA-63: B inactivo sigue viendo sus clases en su lista');

-- 7. CA-29 / T-PRF-09 / T-PRF-10 / T-PRF-11: filtros de v_clases ------------------------------------------------------------------
select is(pg_temp.q('a0700000-0000-0000-0000-00000000000a', $$select count(*) from public.v_clases where inicio >= '2026-10-01 00:00-03' and inicio < '2026-11-01 00:00-03'$$), '2',
  'CA-29/T-PRF-09: el rango de octubre trae las dos clases pasadas');
select is(pg_temp.q('a0700000-0000-0000-0000-00000000000a', format($$select count(*) || '/' || bool_and(pasada) from public.v_clases where inicio >= '2026-10-01 00:00-03' and inicio < '2026-11-01 00:00-03' and alumno_id = %L$$, current_setting('rtc.al_01'))),
  '1/true', 'CA-29/T-PRF-09: rango y alumno juntos traen solo la clase pasada de Ana');
select is(pg_temp.q('a0700000-0000-0000-0000-00000000000a', format($$select count(*) from public.v_clases where alumno_id = %L$$, current_setting('rtc.al_04'))),
  (select count(*)::text from public.clase where profesor_id = current_setting('rtc.pa')::uuid and alumno_id = current_setting('rtc.al_04')::uuid),
  'CA-29: el filtro por alumno trae todas las clases de Dani con A, pasadas incluidas, en todos los estados');
select is(pg_temp.q('a0700000-0000-0000-0000-00000000000a', $$select count(*) from public.v_clases where inicio >= '2026-11-30 00:00-03' and inicio < '2026-11-01 00:00-03'$$), '0',
  'T-PRF-10: un rango invertido da una lista vacía, sin error');
select is(pg_temp.q('a0700000-0000-0000-0000-00000000000a', format($$select count(*) from public.v_clases where alumno_id = %L$$, gen_random_uuid())), '0', 'T-PRF-10: un alumno inexistente da una lista vacía');
select is(pg_temp.q('a0700000-0000-0000-0000-00000000000b', format($$select count(*) from public.v_clases where alumno_id = %L$$, current_setting('rtc.al_01'))), '0',
  'T-PRF-11/SEC-02: B filtrando por Ana (alumna de A) no recibe ninguna fila');
select is(pg_temp.q('a0700000-0000-0000-0000-00000000000b', $$select string_agg(distinct titular, ',') from public.v_clases$$), 'Dani', 'SEC-02: B ve solo las clases de Dani, la única que le pidió');
select is(pg_temp.q('a0700000-0000-0000-0000-00000000000a', $$select string_agg(distinct pasada::text, ',' order by pasada::text) from public.v_clases$$), 'false,true', 'PRF-06: la lista trae pasadas y futuras, con la marca de pasada por app_ahora()');
select ok(pg_temp.q('a0700000-0000-0000-0000-00000000000a', $$delete from public.v_clases returning 1$$) like 'ERR|42501|%', 'SEC-05: v_clases no se escribe (42501)');

-- 8. CA-25 / T-SOL-15 / T-SOL-16: pendiente sin respuesta cuyo horario ya pasó (reloj fijo) ------------------------------------
select pg_temp.reloj('2026-11-05 12:59:00+00');
select is(pg_temp.q('a0700000-0000-0000-0000-00000000000a', format($$select vencida::text from public.v_solicitudes_pendientes where id = %L$$, current_setting('rtc.s_ana_suelta'))), 'false',
  'T-SOL-16: un minuto antes del horario la solicitud sigue pendiente en la lista del profesor');
select is(pg_temp.q('a0700000-0000-0000-0000-000000000001', format($$select (solicitud_pendiente ->> 'vencida') || '/' || pasada::text from public.v_mis_clases where solicitud_pendiente ->> 'id' = %L$$, current_setting('rtc.s_ana_suelta'))), 'false/false',
  'T-SOL-16: ... y en Mis clases de Ana');
select pg_temp.reloj('2026-11-05 13:01:00+00');
select is(pg_temp.q('a0700000-0000-0000-0000-00000000000a', format($$select vencida::text from public.v_solicitudes_pendientes where id = %L$$, current_setting('rtc.s_ana_suelta'))), 'true',
  'CA-25/T-SOL-15: pasado el horario la solicitud figura vencida en la lista del profesor');
select is(pg_temp.q('a0700000-0000-0000-0000-000000000001', format($$select estado || '/' || (solicitud_pendiente ->> 'vencida') || '/' || pasada::text from public.v_mis_clases where solicitud_pendiente ->> 'id' = %L$$, current_setting('rtc.s_ana_suelta'))),
  'pendiente/true/true', 'CA-25/T-SOL-15: en Mis clases de Ana la clase sigue pendiente, vencida y pasada: «pendiente sin respuesta»');
select is(pg_temp.q('a0700000-0000-0000-0000-00000000000a', format($$select estado || '/' || (solicitud_pendiente ->> 'vencida') || '/' || pasada::text from public.v_clases where solicitud_pendiente ->> 'id' = %L$$, current_setting('rtc.s_ana_suelta'))),
  'pendiente/true/true', 'CA-25: lo mismo en v_clases del profesor');
select is(pg_temp.err(pg_temp.resp('a0700000-0000-0000-0000-00000000000a', current_setting('rtc.s_ana_suelta'), 'confirmar')), 'PT409 SOLICITUD_VENCIDA', 'SOL-08: responder una vencida da 409 SOLICITUD_VENCIDA');
select is(pg_temp.err(pg_temp.resp('a0700000-0000-0000-0000-00000000000a', current_setting('rtc.s_ana_suelta'), 'rechazar')), 'PT409 SOLICITUD_VENCIDA', 'SOL-08: ni rechazarla');
select is((select s.estado || '/' || c.estado from public.solicitud s join public.clase c on c.reserva_id = s.reserva_id where s.id = current_setting('rtc.s_ana_suelta')::uuid), 'pendiente/pendiente',
  'SOL-08: no se confirma ni se rechaza sola');
select pg_temp.reloj('2026-11-02 15:00:00+00');

-- 9. CA-45 (rama Mis clases): el motivo del profesor que rechazó, como texto ------------------------------------------------------
select is(pg_temp.q('a0700000-0000-0000-0000-000000000003', $$select jsonb_path_query_first(public.sesion_actual() -> 'inscripciones', '$[*] ? (@.slug == "pgtap07-a")') ->> 'motivo_rechazo'$$),
  '<script>alert(1)</script> sin cupo', 'CA-45/ALU-03: Cris recibe en su sesión el motivo de A tal cual, como texto (la web lo pinta sin interpretarlo)');
select is(pg_temp.q('a0700000-0000-0000-0000-000000000003', $$select (jsonb_path_query_first(public.sesion_actual() -> 'inscripciones', '$[*] ? (@.slug == "pgtap07-b")') ->> 'estado') || '/' || coalesce(jsonb_path_query_first(public.sesion_actual() -> 'inscripciones', '$[*] ? (@.slug == "pgtap07-b")') ->> 'motivo_rechazo', '-')$$),
  'aprobado/-', 'CA-45: el motivo de A no se mezcla con B: con B está aprobada y sin motivo');
select is(pg_temp.q('a0700000-0000-0000-0000-000000000006', $$select (jsonb_path_query_first(public.sesion_actual() -> 'inscripciones', '$[*] ? (@.slug == "pgtap07-a")') ->> 'estado') || '/' || coalesce(jsonb_path_query_first(public.sesion_actual() -> 'inscripciones', '$[*] ? (@.slug == "pgtap07-a")') ->> 'motivo_rechazo', '-')$$),
  'rechazado/-', 'CA-45: sin motivo escrito, solo el estado');

-- 10. CA-34: con un destinatario inválido confirmar funciona y el fallo queda en Mails fallidos -----------------------------------
update public.alumno set mail = 'sin-arroba' where id = current_setting('rtc.al_07')::uuid;
select is(pg_temp.resp('a0700000-0000-0000-0000-00000000000a', current_setting('rtc.s_gus'), 'confirmar'), '{"estado": "confirmada"}', 'CA-34/NFR-07: confirmar funciona aunque el mail de la persona sea inválido');
select is((select c.estado from public.clase c join public.solicitud s on s.reserva_id = c.reserva_id where s.id = current_setting('rtc.s_gus')::uuid), 'confirmada', 'CA-34: la clase quedó confirmada');
select is((select estado || '/' || motivo_fallo from public.mail_salida where tipo = 'solicitud_respondida' and destinatario = 'sin-arroba'), 'fallido/DESTINATARIO_INVALIDO',
  'CA-34/NFR-07: el mail queda fallido con su motivo');
select is(pg_temp.q('a0700000-0000-0000-0000-00000000000a', $$select tipo || '/' || motivo || '/' || destinatario from public.v_mails_fallidos where destinatario = 'sin-arroba'$$),
  'solicitud_respondida/DESTINATARIO_INVALIDO/sin-arroba', 'CA-34/WEB-08: el fallo aparece en los mails fallidos de A con tipo, motivo y destinatario');
select is(pg_temp.q('a0700000-0000-0000-0000-00000000000b', $$select count(*) from public.v_mails_fallidos where destinatario = 'sin-arroba'$$), '0', 'CA-34/SEC-02: B no ve el fallo de A');

select * from finish();
rollback;
