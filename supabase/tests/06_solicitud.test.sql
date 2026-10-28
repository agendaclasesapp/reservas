-- B06 · T06.3 · Solicitud de reserva y series con dos profesores, por las RPC como las llama la API (rol authenticated).
-- IDs: RES-01, RES-07, SOL-09, SOL-10, AGE-11, AGE-04, AVI-02, SEC-01..06, SEC-08, SEC-09, SEC-10, SEC-28.
-- CA-03, CA-05, CA-13, CA-17 (cierre por exclusión), CA-19, CA-21, CA-26, CA-30, CA-41, CA-51, CA-52, CA-54, CA-55, CA-60, CA-63.
-- Casos del plan: T-AGE-06, T-AGE-08, T-RES-02, T-RES-03, T-RES-08, T-SOL-01, T-AVI-01, T-AVI-03, T-ALU-14.
-- Reloj fijo: lunes 2026-11-02 12:00 de Montevideo (15:00Z). Datos sintéticos (@example.test); todo se deshace con el rollback.
begin;
select plan(96);

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
-- Persona con ficha completa y su inscripción con A y con B (null = sin inscripción).
create function pg_temp.persona(p_user uuid, p_nombre text, p_con_a text, p_con_b text) returns void language plpgsql as $f$
declare v_id uuid;
begin
  update public.alumno set estado = 'completa', nombre = p_nombre, telefono = '099 600 600', fecha_nacimiento = '1990-01-01',
         ficha_completada_en = '2026-01-01', ficha_origen_profesor_id = current_setting('rtc.pa')::uuid
   where user_id = p_user returning id into v_id;
  perform set_config('rtc.al_' || right(p_user::text, 2), v_id::text, true);
  if p_con_a is not null then
    insert into public.inscripcion (alumno_id, profesor_id, estado, motivo_estado, aprobado_en)
    values (v_id, current_setting('rtc.pa')::uuid, p_con_a, case when p_con_a = 'rechazado' then 'Motivo de prueba' end,
            case when p_con_a = 'aprobado' then public.app_ahora() end);
  end if;
  if p_con_b is not null then
    insert into public.inscripcion (alumno_id, profesor_id, estado, motivo_estado, aprobado_en)
    values (v_id, current_setting('rtc.pb')::uuid, p_con_b, case when p_con_b = 'rechazado' then 'Motivo de prueba' end,
            case when p_con_b = 'aprobado' then public.app_ahora() end);
  end if;
end;
$f$;
-- Llamada a solicitar_reserva(p_prof 'pa'|'pb', inicio, tipo, frecuencia, persona a cargo, observación) como p_sub.
create function pg_temp.sol(p_sub uuid, p_prof text, p_inicio text, p_tipo text, p_freq int default null,
                            p_persona uuid default null, p_obs text default null) returns text language sql as $f$
  select pg_temp.q(p_sub, format('select public.solicitar_reserva(%L::uuid, %L::timestamptz, %L, %L::int, %L::uuid, %L)::text',
                                  current_setting('rtc.' || p_prof), p_inicio, p_tipo, p_freq, p_persona, p_obs))
$f$;
create function pg_temp.prev(p_sub uuid, p_prof text, p_inicio text, p_freq int) returns text language sql as $f$
  select pg_temp.q(p_sub, format($$select coalesce(jsonb_agg(to_jsonb(v) order by v.inicio), '[]')::text
                                     from public.previsualizar_serie(%L::uuid, %L::timestamptz, %L::int) v$$,
                                  current_setting('rtc.' || p_prof), p_inicio, p_freq))
$f$;
-- Estado de la fecha p_inicio dentro de una previsualización: «estado/motivo».
create function pg_temp.estado_en(p_prev text, p_inicio text) returns text language sql as $f$
  select e ->> 'estado' || '/' || coalesce(e ->> 'motivo', '-')
    from jsonb_array_elements(p_prev::jsonb) e where (e ->> 'inicio')::timestamptz = p_inicio::timestamptz
$f$;
create function pg_temp.huecos(p_slug text, p_dia text, p_hora text) returns text language sql as $f$
  select estado from public.agenda_publica(p_slug, p_dia::date) where to_char(inicio at time zone 'America/Montevideo', 'HH24:MI') = p_hora
$f$;
create function pg_temp.mails(p_tipo text, p_destino text) returns bigint language sql as $f$
  select count(*) from public.mail_salida where tipo = p_tipo and destinatario = p_destino
$f$;

-- Preparación: dos profesores, el Administrador y cinco personas --------------------------------------------------------
update privado.reloj_prueba set ahora = '2026-11-02 15:00:00+00';
select set_config('rtc.pa', privado.configurar_profesor('pgtap06.profa@example.test', 'Profe A', 'pgtap06-a')::text, true) is not null as _;
select set_config('rtc.pb', privado.configurar_profesor('pgtap06.profb@example.test', 'Profe B', 'pgtap06-b')::text, true) is not null as _;
select privado.configurar_administrador('pgtap06.admin@example.test');
select pg_temp.usuario('a0600000-0000-0000-0000-00000000000a', 'pgtap06.profa@example.test');
select pg_temp.usuario('a0600000-0000-0000-0000-00000000000b', 'pgtap06.profb@example.test');
select pg_temp.usuario('a0600000-0000-0000-0000-00000000000d', 'pgtap06.admin@example.test');
select pg_temp.usuario('a0600000-0000-0000-0000-000000000001', 'pgtap06.ana@example.test');   -- aprobada solo con A
select pg_temp.usuario('a0600000-0000-0000-0000-000000000002', 'pgtap06.beto@example.test');  -- aprobado con A, pendiente con B
select pg_temp.usuario('a0600000-0000-0000-0000-000000000003', 'pgtap06.cris@example.test');  -- rechazada con A, aprobada con B
select pg_temp.usuario('a0600000-0000-0000-0000-000000000004', 'pgtap06.dani@example.test');  -- aprobada con A y con B
select pg_temp.usuario('a0600000-0000-0000-0000-000000000005', 'pgtap06.fich@example.test');  -- ficha incompleta
select pg_temp.persona('a0600000-0000-0000-0000-000000000001', 'Ana', 'aprobado', null);
select pg_temp.persona('a0600000-0000-0000-0000-000000000002', 'Beto', 'aprobado', 'pendiente');
select pg_temp.persona('a0600000-0000-0000-0000-000000000003', 'Cris', 'rechazado', 'aprobado');
select pg_temp.persona('a0600000-0000-0000-0000-000000000004', 'Dani', 'aprobado', 'aprobado');
insert into public.persona_a_cargo (id, alumno_id, nombre) values
  ('a0600000-0000-0000-0000-0000000000c1', current_setting('rtc.al_01')::uuid, 'Hija de Ana'),
  ('a0600000-0000-0000-0000-0000000000c4', current_setting('rtc.al_04')::uuid, 'Hijo de Dani');

-- 1. CA-13 / AGE-04 (T-AGE-06, T-AGE-08): anticipación de 24 h con reloj fijo ----------------------------------------------
-- Base compartida con otras pruebas/E2E: se cuenta el delta de filas, no el total global (H-373).
select set_config('rtc.filas0', ((select count(*)::int from public.solicitud) + (select count(*)::int from public.reserva) + (select count(*)::int from public.clase))::text, true) is not null as _;
select is(pg_temp.err(pg_temp.sol('a0600000-0000-0000-0000-000000000001', 'pa', '2026-11-03 08:00-03', 'suelta')), 'PT422 ANTICIPACION_INSUFICIENTE',
  'CA-13/T-AGE-06: un hueco libre a +20 h se rechaza con ANTICIPACION_INSUFICIENTE');
select is(pg_temp.det(pg_temp.sol('a0600000-0000-0000-0000-000000000001', 'pa', '2026-11-03 08:00-03', 'suelta'))->>'horas_minimas', '24',
  'CA-13: el rechazo trae el motivo (horas mínimas = 24)');
select is((select count(*)::int from public.solicitud) + (select count(*)::int from public.reserva) + (select count(*)::int from public.clase) - current_setting('rtc.filas0')::int, 0,
  'CA-13/T-AGE-06: el rechazo por anticipación no crea solicitud, reserva ni clase');
select is(pg_temp.err(pg_temp.sol('a0600000-0000-0000-0000-000000000001', 'pa', '2026-11-03 11:00-03', 'suelta')), 'PT422 ANTICIPACION_INSUFICIENTE',
  'CA-13: +23 h también se rechaza');
select ok(pg_temp.sol('a0600000-0000-0000-0000-000000000001', 'pa', '2026-11-03 12:00-03', 'suelta') like '{%',
  'CA-13/T-AGE-08: el hueco a exactamente +24 h se acepta (límite inclusivo)');

-- 2. CA-21 / T-SOL-01 / CA-30: la solicitud de Ana con A -----------------------------------------------------------------------
select is((select estado from public.solicitud where alumno_id = current_setting('rtc.al_01')::uuid), 'pendiente',
  'CA-21/T-SOL-01: la solicitud nace pendiente');
select is((select r.estado || '/' || r.origen || '/' || r.tipo || '/' || (r.hasta = r.desde)::text from public.reserva r where r.alumno_id = current_setting('rtc.al_01')::uuid),
  'pendiente/solicitud/suelta/true', 'SOL-01: la reserva nace pendiente, de origen solicitud, suelta con hasta = desde');
select is((select c.estado || '/' || c.inicio::text from public.clase c where c.alumno_id = current_setting('rtc.al_01')::uuid),
  'pendiente/2026-11-03 15:00:00+00', 'RES-01: la clase pendiente ocupa el hueco');
select is(pg_temp.huecos('pgtap06-a', '2026-11-03', '12:00'), 'ocupado', 'CA-21: el hueco figura ocupado en la agenda pública de A');
select is(pg_temp.huecos('pgtap06-b', '2026-11-03', '12:00'), 'libre', 'CA-54/RES-07: el mismo horario está libre en la agenda de B');
select is(pg_temp.q('a0600000-0000-0000-0000-000000000001', $$select count(*) || '/' || min(estado) || '/' || bool_or(vencida) from public.v_mis_solicitudes$$),
  '1/pendiente/false', 'CA-21: Ana ve su solicitud pendiente y no vencida por v_mis_solicitudes');
select is(pg_temp.q('a0600000-0000-0000-0000-00000000000a', $$select count(*) from public.solicitud$$), '1',
  'CA-21/CA-55: el profesor A ve la solicitud en su lista');
select is(pg_temp.q('a0600000-0000-0000-0000-00000000000b', $$select count(*) from public.solicitud$$), '0',
  'CA-55/SEC-02: la profesora B no ve la solicitud hecha con A');
select is(pg_temp.q('a0600000-0000-0000-0000-00000000000a', $$select count(*) from public.v_mis_solicitudes$$), '0',
  'SEC-05: un profesor no ve nada por v_mis_solicitudes');
select is(pg_temp.q('a0600000-0000-0000-0000-000000000002', $$select count(*) from public.solicitud$$), '0',
  'CA-26/SOL-09: otra persona (Beto) no lee las solicitudes de Ana');
select is(pg_temp.q('a0600000-0000-0000-0000-000000000002', $$select count(*) from public.v_mis_solicitudes$$), '0',
  'CA-26/SOL-09: ni por v_mis_solicitudes');
select is(pg_temp.mails('solicitud_nueva', 'pgtap06.profa@example.test'), 1::bigint,
  'CA-30/T-AVI-01: un mail solicitud_nueva al profesor A por la solicitud');
select is(pg_temp.mails('solicitud_nueva', 'pgtap06.profb@example.test'), 0::bigint,
  'CA-55: la solicitud hecha en A no genera mail a B');
select is((select asunto || '|' || profesor_id::text || '|' || alumno_id::text from public.mail_salida where tipo = 'solicitud_nueva'),
  'Solicitud de reserva nueva: Ana|' || current_setting('rtc.pa') || '|' || current_setting('rtc.al_01'),
  'AVI-02: asunto con el nombre del alumno, del profesor A y de la persona');
select ok((select cuerpo_texto not like '%observ%' from public.mail_salida where tipo = 'solicitud_nueva'), 'AVI-02: el mail no lleva la observación');

-- 3. CA-17 / RES-01 (T-AVI-03): hueco ocupado, y sin mail si la RPC falla -----------------------------------------------------
select is(pg_temp.err(pg_temp.sol('a0600000-0000-0000-0000-000000000004', 'pa', '2026-11-03 12:00-03', 'suelta')), 'PT409 HUECO_NO_LIBRE',
  'CA-17/RES-01: pedir el hueco ocupado da HUECO_NO_LIBRE');
select is(pg_temp.det(pg_temp.sol('a0600000-0000-0000-0000-000000000004', 'pa', '2026-11-03 12:00-03', 'suelta'))->>'inicio' is not null, true,
  'RES-01: el error trae el inicio');
select is((select count(*)::int from public.solicitud where alumno_id = current_setting('rtc.al_04')::uuid), 0,
  'CA-17: la segunda solicitud no crea nada (una sola pendiente)');
select is(pg_temp.mails('solicitud_nueva', 'pgtap06.profa@example.test'), 1::bigint,
  'CA-30/T-AVI-03: la solicitud rechazada por RPC no deja mail (sigue habiendo uno)');
-- SEC-08 / T-RES-02: la exclusión es la última barrera aunque se salte la RPC.
select throws_ok(format($$insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado)
    values (%L, (select id from public.reserva limit 1), %L, '2026-11-03 12:30-03', '2026-11-03 13:30-03', 'pendiente')$$,
    current_setting('rtc.pa'), current_setting('rtc.al_04')), '23P01', null, 'SEC-08/T-RES-02: la exclusión de clase impide solapar el hueco (23P01)');
-- T-RES-03: al rechazarse la clase pendiente, el hueco se libera y otro lo pide (B07 hace la transición; aquí se simula).
update public.clase set estado = 'rechazada' where alumno_id = current_setting('rtc.al_01')::uuid;
select is(pg_temp.huecos('pgtap06-a', '2026-11-03', '12:00'), 'libre', 'CA-17/T-RES-03: al rechazarse, el hueco vuelve a estar libre en la agenda');
select ok(pg_temp.sol('a0600000-0000-0000-0000-000000000004', 'pa', '2026-11-03 12:00-03', 'suelta') like '{%',
  'CA-17/T-RES-03: otra persona (Dani) pide el hueco liberado y se acepta');

-- 4. CA-54 / RES-07: con B el mismo horario es independiente --------------------------------------------------------------
select ok(pg_temp.sol('a0600000-0000-0000-0000-000000000004', 'pb', '2026-11-03 12:00-03', 'suelta') like '{%',
  'CA-54/RES-07: el horario ocupado con A se acepta con B');
select is(pg_temp.mails('solicitud_nueva', 'pgtap06.profb@example.test'), 1::bigint, 'CA-55: la solicitud de B llega solo al mail de B');
select is(pg_temp.mails('solicitud_nueva', 'pgtap06.profa@example.test'), 2::bigint, 'CA-55: y los de A siguen siendo los suyos (Ana y Dani)');
update public.profesor set anticipacion_horas = 48 where id = current_setting('rtc.pb')::uuid;
select is(pg_temp.err(pg_temp.sol('a0600000-0000-0000-0000-000000000004', 'pb', '2026-11-04 11:00-03', 'suelta')), 'PT422 ANTICIPACION_INSUFICIENTE',
  'CA-54: con anticipación de 48 h B rechaza +44 h...');
select is(pg_temp.det(pg_temp.sol('a0600000-0000-0000-0000-000000000004', 'pb', '2026-11-04 11:00-03', 'suelta'))->>'horas_minimas', '48',
  'CA-54: ...con el mínimo de B, no el de A');
update public.profesor set anticipacion_horas = 24 where id = current_setting('rtc.pb')::uuid;

-- 5. CA-03 / CA-51 / CA-52: el vínculo es con el profesor de la agenda ----------------------------------------------------------
select is(pg_temp.err(pg_temp.sol('a0600000-0000-0000-0000-000000000002', 'pb', '2026-11-05 14:00-03', 'suelta')), 'PT403 CUENTA_NO_APROBADA',
  'CA-03: Beto, aprobado con A pero pendiente con B, no puede pedir a B');
select is(pg_temp.det(pg_temp.sol('a0600000-0000-0000-0000-000000000002', 'pb', '2026-11-05 14:00-03', 'suelta')),
  jsonb_build_object('estado', 'pendiente', 'profesor_id', current_setting('rtc.pb')),
  'CA-03: el rechazo trae estado pendiente y el profesor_id de B');
select is(pg_temp.det(pg_temp.sol('a0600000-0000-0000-0000-000000000003', 'pa', '2026-11-05 14:00-03', 'suelta')),
  jsonb_build_object('estado', 'rechazado', 'profesor_id', current_setting('rtc.pa')),
  'CA-03/CA-51: Cris, rechazada por A y aprobada por B, recibe estado rechazado al pedir a A');
select ok(pg_temp.sol('a0600000-0000-0000-0000-000000000003', 'pb', '2026-11-05 14:00-03', 'suelta') like '{%',
  'CA-51: Cris sí puede pedir a B, que la aprobó');
select is(pg_temp.det(pg_temp.sol('a0600000-0000-0000-0000-000000000001', 'pb', '2026-11-05 15:00-03', 'suelta')),
  jsonb_build_object('estado', null, 'profesor_id', current_setting('rtc.pb')),
  'CA-52/SOL-09: Ana, solo de A, pide en la agenda de B y recibe CUENTA_NO_APROBADA con estado nulo');
select is((select count(*)::int from public.solicitud where alumno_id in (current_setting('rtc.al_01')::uuid, current_setting('rtc.al_02')::uuid) and profesor_id = current_setting('rtc.pb')::uuid)
        + (select count(*)::int from public.clase where profesor_id = current_setting('rtc.pb')::uuid and alumno_id in (current_setting('rtc.al_01')::uuid, current_setting('rtc.al_02')::uuid)), 0,
  'CA-03/CA-52: ninguno de los rechazos creó solicitud ni clase en B');
select is(pg_temp.err(pg_temp.sol('a0600000-0000-0000-0000-000000000005', 'pa', '2026-11-05 14:00-03', 'suelta')), 'PT403 FICHA_INCOMPLETA',
  'ALU-14: con la ficha incompleta, 403 FICHA_INCOMPLETA');
select is(pg_temp.err(pg_temp.sol('a0600000-0000-0000-0000-00000000000a', 'pa', '2026-11-05 14:00-03', 'suelta')), 'PT403 PROHIBIDO',
  'SEC-06: un profesor que llama a solicitar_reserva recibe 403 PROHIBIDO');
select is(pg_temp.err(pg_temp.sol('a0600000-0000-0000-0000-00000000000d', 'pa', '2026-11-05 14:00-03', 'suelta')), 'PT403 PROHIBIDO',
  'SEC-06: el Administrador también');
select is(pg_temp.err(pg_temp.sol(null, 'pa', '2026-11-05 14:00-03', 'suelta')), 'PT401 NO_AUTENTICADO',
  'SEC-06: authenticated sin sub recibe 401');
select is(pg_temp.err(pg_temp.q(null, format($$select public.solicitar_reserva(%L::uuid, '2026-11-05 14:00-03', 'suelta')::text$$, current_setting('rtc.pa')), 'anon')),
  '42501 permission denied for function solicitar_reserva', 'SEC-04: anon no ejecuta solicitar_reserva');
select is(pg_temp.err(pg_temp.sol('a0600000-0000-0000-0000-000000000001', 'pa', '2026-11-05 14:00-03', 'suelta')), 'OK',
  'preparación: Ana sí pide a A el jueves 14:00 (sin error)');

-- 6. Persona a cargo y observación (CA-05, T-RES-08, T-ALU-14, SOL-09, SEC-09) ----------------------------------------------------
select ok(pg_temp.sol('a0600000-0000-0000-0000-000000000001', 'pa', '2026-11-09 10:00-03', 'suelta', null, 'a0600000-0000-0000-0000-0000000000c1', 'Clase de prueba') like '{%',
  'CA-05/T-RES-08: Ana pide con su persona a cargo como quien toma la clase');
select is((select (c.persona_a_cargo_id = 'a0600000-0000-0000-0000-0000000000c1')::text || '/' || (c.alumno_id = current_setting('rtc.al_01')::uuid)::text
             || '/' || (r.observacion = 'Clase de prueba')::text
           from public.clase c join public.reserva r on r.id = c.reserva_id where c.inicio = '2026-11-09 10:00-03' and c.profesor_id = current_setting('rtc.pa')::uuid),
  'true/true/true', 'T-RES-08: la clase queda a nombre de la persona a cargo, con Ana como titular y la observación');
select is(pg_temp.err(pg_temp.sol('a0600000-0000-0000-0000-000000000001', 'pa', '2026-11-09 11:00-03', 'suelta', null, 'a0600000-0000-0000-0000-0000000000c4')), 'PT403 PROHIBIDO',
  'CA-26/SOL-09/T-RES-08: la persona a cargo de otro alumno se rechaza con 403');
select is(pg_temp.err(pg_temp.sol('a0600000-0000-0000-0000-000000000001', 'pa', '2026-11-09 11:00-03', 'suelta', null, 'a0600000-0000-0000-0000-0000000000ff')), 'PT404 NO_ENCONTRADO',
  'SOL-09: una persona a cargo inexistente da 404');
select is((select count(*)::int from public.clase where inicio = '2026-11-09 11:00-03'), 0, 'SOL-09: ninguno de los dos rechazos reservó el hueco');
select ok(pg_temp.sol('a0600000-0000-0000-0000-000000000001', 'pa', '2026-11-09 12:00-03', 'suelta', null, null, repeat('x', 500)) like '{%',
  'SEC-09: una observación de 500 caracteres se acepta');
select is(pg_temp.det(pg_temp.sol('a0600000-0000-0000-0000-000000000001', 'pa', '2026-11-10 09:00-03', 'suelta', null, null, repeat('x', 501))),
  '{"campo":"p_observacion"}'::jsonb, 'SEC-09: 501 caracteres da 422 DATOS_INVALIDOS en p_observacion');
select is(pg_temp.det(pg_temp.sol('a0600000-0000-0000-0000-000000000001', 'pa', '2026-11-10 09:00-03', 'otra')), '{"campo":"p_tipo"}'::jsonb,
  'SEC-09: un tipo desconocido da 422 en p_tipo');
select is(pg_temp.det(pg_temp.sol('a0600000-0000-0000-0000-000000000001', 'pa', '2026-11-10 09:00-03', 'serie', 3)), '{"campo":"p_frecuencia"}'::jsonb,
  'SEC-09: una serie con frecuencia 3 da 422 en p_frecuencia');
select is(pg_temp.err(pg_temp.sol('a0600000-0000-0000-0000-000000000001', 'pa', '2026-11-10 09:30-03', 'suelta')), 'PT422 FUERA_DE_GRILLA',
  'RES-01: un inicio que no cae en la grilla da FUERA_DE_GRILLA');
select is(pg_temp.err(pg_temp.sol('a0600000-0000-0000-0000-000000000001', 'pa', '2026-11-08 09:00-03', 'suelta')), 'PT422 FUERA_DE_GRILLA',
  'RES-01: un domingo (sin tramo) da FUERA_DE_GRILLA');

-- 7. CA-19 / RES-05: serie con una fecha bloqueada y otra ocupada -------------------------------------------------------------
insert into public.bloqueo (profesor_id, periodo, motivo)
values (current_setting('rtc.pa')::uuid, tstzrange('2026-11-20 08:00-03', '2026-11-20 13:00-03', '[)'), 'Bloqueo de A');
insert into public.reserva (id, profesor_id, alumno_id, tipo, hora_local, dia_semana, duracion_min, estado, desde, hasta, origen)
values ('a0600000-0000-0000-0000-0000000000e1', current_setting('rtc.pa')::uuid, current_setting('rtc.al_02')::uuid, 'suelta', '09:00', 5, 60, 'confirmada', '2026-12-04', '2026-12-04', 'profesor');
insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado)
values (current_setting('rtc.pa')::uuid, 'a0600000-0000-0000-0000-0000000000e1', current_setting('rtc.al_02')::uuid, '2026-12-04 09:00-03', '2026-12-04 10:00-03', 'confirmada');
select set_config('rtc.prev1', pg_temp.prev('a0600000-0000-0000-0000-000000000001', 'pa', '2026-11-06 09:00-03', 1), true) is not null as _;
select is(pg_temp.estado_en(current_setting('rtc.prev1'), '2026-11-06 09:00-03'), 'reservable/-', 'CA-19: la primera fecha figura reservable');
select is(pg_temp.estado_en(current_setting('rtc.prev1'), '2026-11-20 09:00-03'), 'salteada/bloqueado', 'CA-19/RES-05: la fecha bloqueada figura salteada por bloqueo');
select is(pg_temp.estado_en(current_setting('rtc.prev1'), '2026-12-04 09:00-03'), 'salteada/ocupado', 'RES-05: la fecha con una clase figura salteada por ocupada');
select is(pg_temp.estado_en(current_setting('rtc.prev1'), '2026-11-13 09:00-03'), 'reservable/-', 'CA-19: la semana siguiente figura reservable');
select is(pg_temp.prev('a0600000-0000-0000-0000-000000000001', 'pa', '2026-11-06 09:00-03', 3) like 'ERR|PT422|DATOS_INVALIDOS|%', true,
  'SEC-09: previsualizar_serie con frecuencia 3 da 422');
select set_config('rtc.prev2', pg_temp.prev('a0600000-0000-0000-0000-000000000001', 'pa', '2026-11-06 09:00-03', 2), true) is not null as _;
select is(pg_temp.estado_en(current_setting('rtc.prev2'), '2026-11-13 09:00-03') is null
          and pg_temp.estado_en(current_setting('rtc.prev2'), '2026-11-20 09:00-03') = 'salteada/bloqueado', true,
  'RES-02: la serie quincenal salta una semana de por medio (13/11 no existe, 20/11 está bloqueada)');
select is(pg_temp.err(pg_temp.prev('a0600000-0000-0000-0000-00000000000b', 'pa', '2026-11-06 09:00-03', 1)), 'OK',
  'SOL-09/AGE-11: la profesora B puede llamar a previsualizar_serie (usa su propia agenda; p_profesor_id se ignora)');
select is(pg_temp.estado_en(pg_temp.prev('a0600000-0000-0000-0000-00000000000b', 'pa', '2026-11-20 09:00-03', 1), '2026-11-20 09:00-03'), 'reservable/-',
  'SEC-32: para el profesor, previsualizar_serie usa su agenda (el bloqueo de A no aparece)');
select set_config('rtc.serie', pg_temp.sol('a0600000-0000-0000-0000-000000000001', 'pa', '2026-11-06 09:00-03', 'serie', 1), true) is not null as _;
select is((current_setting('rtc.serie')::jsonb ->> 'fechas') is not null
          and jsonb_array_length(current_setting('rtc.serie')::jsonb -> 'fechas') = 24
          and jsonb_array_length(current_setting('rtc.serie')::jsonb -> 'salteadas') = 2, true,
  'CA-19/RES-05: la serie semanal crea 24 clases y devuelve 2 fechas salteadas');
select is((select count(*)::int from public.clase where reserva_id = (current_setting('rtc.serie')::jsonb ->> 'reserva_id')::uuid and inicio in ('2026-11-20 09:00-03', '2026-12-04 09:00-03')), 0,
  'CA-19: las fechas salteadas no quedan reservadas');
select is((select count(*)::int from public.solicitud where reserva_id = (current_setting('rtc.serie')::jsonb ->> 'reserva_id')::uuid and estado = 'pendiente'), 1,
  'RES-04: una sola solicitud para toda la serie');

-- 8. SOL-10 / SEC-10 / CA-41 / CA-60: el tope de pendientes es por profesor --------------------------------------------------------
-- Dani ya tiene 1 pendiente con A (martes 12:00) y 1 con B. Se llega a 10 con A.
select ok(
  (select bool_and(pg_temp.sol('a0600000-0000-0000-0000-000000000004', 'pa', t, 'suelta') like '{%')
     from unnest(array['2026-11-03 14:00-03', '2026-11-04 08:00-03', '2026-11-04 09:00-03', '2026-11-04 10:00-03', '2026-11-04 11:00-03',
                       '2026-11-04 12:00-03', '2026-11-05 08:00-03', '2026-11-05 09:00-03']) as t),
  'SOL-10: hasta la novena pendiente con A se acepta');
select is(privado.contar_pendientes(current_setting('rtc.al_04')::uuid, current_setting('rtc.pa')::uuid), 9, 'SOL-10: contar_pendientes(Dani, A) = 9');
select ok(pg_temp.sol('a0600000-0000-0000-0000-000000000004', 'pa', '2026-11-05 10:00-03', 'suelta') like '{%', 'CA-41: la décima pendiente con A se acepta');
select is(pg_temp.err(pg_temp.sol('a0600000-0000-0000-0000-000000000004', 'pa', '2026-11-05 11:00-03', 'suelta')), 'PT429 LIMITE_EXCEDIDO',
  'CA-41/SEC-10: la undécima con A da 429 LIMITE_EXCEDIDO');
select is(pg_temp.det(pg_temp.sol('a0600000-0000-0000-0000-000000000004', 'pa', '2026-11-05 11:00-03', 'suelta')),
  '{"tope":"pendientes","limite":10}'::jsonb, 'CA-41: el rechazo dice el límite');
select is((select count(*)::int from public.clase where profesor_id = current_setting('rtc.pa')::uuid and inicio = '2026-11-05 11:00-03'), 0,
  'CA-41: la undécima no crea clases');
select is(pg_temp.huecos('pgtap06-a', '2026-11-05', '11:00'), 'libre', 'CA-41: el hueco sigue libre en agenda_publica');
select is(pg_temp.err(pg_temp.sol('a0600000-0000-0000-0000-000000000004', 'pa', '2026-11-05 10:30-03', 'suelta')), 'PT429 LIMITE_EXCEDIDO',
  'SEC-10: el tope se valida antes que la grilla (429 y no FUERA_DE_GRILLA)');
select ok(pg_temp.sol('a0600000-0000-0000-0000-000000000004', 'pb', '2026-11-05 11:00-03', 'suelta') like '{%',
  'CA-41/CA-60: con B la persona sí puede pedir (el tope es por profesor)');
select is(privado.contar_pendientes(current_setting('rtc.al_04')::uuid, current_setting('rtc.pb')::uuid), 2, 'CA-60: con B cuenta solo las suyas (2)');
-- Tras responder el profesor una de las diez (B07 hace la respuesta; aquí se simula) puede pedir la que rechazó el tope (CA-41).
update public.solicitud set estado = 'confirmada', respondida_en = public.app_ahora()
 where alumno_id = current_setting('rtc.al_04')::uuid and profesor_id = current_setting('rtc.pa')::uuid and fecha_clase = '2026-11-04 08:00-03';
select ok(pg_temp.sol('a0600000-0000-0000-0000-000000000004', 'pa', '2026-11-05 11:00-03', 'suelta') like '{%',
  'CA-41: tras responder una de las diez puede pedir la que había rechazado el tope');
-- Una vencida no cuenta (SOL-08): con reloj fijo martes 13:30 (la del martes 12:00 ya pasó, la de las 14:00 no).
update privado.reloj_prueba set ahora = '2026-11-03 16:30:00+00';
select is(privado.contar_pendientes(current_setting('rtc.al_04')::uuid, current_setting('rtc.pa')::uuid), 9, 'SOL-10/SOL-08: la pendiente vencida no cuenta (9)');
select is(pg_temp.q('a0600000-0000-0000-0000-000000000004', format($$select count(*) from public.v_mis_solicitudes where vencida and profesor_id = %L$$, current_setting('rtc.pa'))),
  '1', 'SOL-08: v_mis_solicitudes marca exactamente una vencida');
select ok(pg_temp.sol('a0600000-0000-0000-0000-000000000004', 'pa', '2026-11-06 14:00-03', 'suelta') like '{%',
  'CA-41: con una vencida y nueve vigentes, la décima nueva se acepta');
select is(pg_temp.err(pg_temp.sol('a0600000-0000-0000-0000-000000000004', 'pa', '2026-11-06 15:00-03', 'suelta')), 'PT429 LIMITE_EXCEDIDO',
  'CA-41: y con diez vigentes la siguiente vuelve a dar 429');
update privado.reloj_prueba set ahora = '2026-11-02 15:00:00+00';

-- 9. CA-63 / AGE-11 / DEC-35 A: profesor inactivo ------------------------------------------------------------------------------------
select ok(pg_temp.sol('a0600000-0000-0000-0000-000000000004', 'pb', '2026-11-09 14:00-03', 'serie', 1) like '{%', 'preparación: Dani tiene una serie semanal con B');
select set_config('rtc.clases_b', (select count(*)::text from public.clase where profesor_id = current_setting('rtc.pb')::uuid), true) is not null as _;
select set_config('rtc.sol_b', (select count(*)::text from public.solicitud where profesor_id = current_setting('rtc.pb')::uuid), true) is not null as _;
update public.profesor set activo = false where id = current_setting('rtc.pb')::uuid;
select is(pg_temp.err(pg_temp.sol('a0600000-0000-0000-0000-000000000004', 'pb', '2026-11-12 10:00-03', 'suelta')), 'PT409 PROFESOR_INACTIVO',
  'CA-63/AGE-11: con el profesor inactivo solicitar_reserva da 409 PROFESOR_INACTIVO');
select is(pg_temp.err(pg_temp.prev('a0600000-0000-0000-0000-000000000004', 'pb', '2026-11-12 10:00-03', 1)), 'PT409 PROFESOR_INACTIVO',
  'AGE-11: previsualizar_serie también');
select is((select count(*)::text from public.clase where profesor_id = current_setting('rtc.pb')::uuid) || '/'
          || (select count(*)::text from public.solicitud where profesor_id = current_setting('rtc.pb')::uuid),
  current_setting('rtc.clases_b') || '/' || current_setting('rtc.sol_b'), 'CA-63: el rechazo no creó clases ni solicitudes');
select is(pg_temp.err(pg_temp.sol('a0600000-0000-0000-0000-000000000001', 'pa', '2026-11-09 15:00-03', 'suelta')), 'OK',
  'CA-63: lo de otros profesores no cambia: con A sigue aceptando (A está activo)');
select is(privado.extender_series(public.app_ahora() + interval '14 days'), 2 + 0, 'CA-63/SEC-28: extender_series crea 2 clases de la serie de A y ninguna de la de B inactivo');
select is((select count(*)::text from public.clase where profesor_id = current_setting('rtc.pb')::uuid), current_setting('rtc.clases_b'),
  'CA-63: la serie del profesor inactivo no se materializa');
update public.profesor set activo = true where id = current_setting('rtc.pb')::uuid;
select ok(privado.extender_series(public.app_ahora() + interval '14 days') > 0, 'CA-63: al reactivarlo, la corrida siguiente completa su serie');

-- 10. SEC-01..05 y SEC-28: permisos y catálogo de lo nuevo ----------------------------------------------------------------------------
select is((select relrowsecurity from pg_class where oid = 'public.solicitud'::regclass), true, 'SEC-01: solicitud tiene RLS');
select is((select count(*)::int from pg_policies where tablename = 'solicitud' and cmd = 'SELECT' and qual like '%mi_profesor_id()%' and qual like '%mi_alumno_id()%'), 1,
  'SEC-02: una política de lectura por mi_profesor_id() o mi_alumno_id()');
select is((has_table_privilege('anon', 'public.solicitud', 'select'), has_table_privilege('anon', 'public.v_mis_solicitudes', 'select'))::text, '(f,f)',
  'SEC-01: anon no lee solicitud ni v_mis_solicitudes');
select is((has_table_privilege('authenticated', 'public.solicitud', 'insert'), has_table_privilege('authenticated', 'public.solicitud', 'update'),
           has_table_privilege('authenticated', 'public.solicitud', 'delete'))::text, '(f,f,f)',
  'SEC-03: authenticated no escribe en solicitud (solo por RPC)');
select is(pg_temp.err(pg_temp.q('a0600000-0000-0000-0000-000000000004',
  format($$insert into public.solicitud (profesor_id, alumno_id, tipo, reserva_id, fecha_clase) values (%L, %L, 'reserva', (select id from public.reserva limit 1), now()) returning 1$$,
         current_setting('rtc.pa'), current_setting('rtc.al_04')))), '42501 permission denied for table solicitud', 'SEC-03: el insert directo da 42501');
select is((has_function_privilege('authenticated', 'privado.contar_pendientes(uuid,uuid)', 'execute'),
           has_function_privilege('authenticated', 'privado.extender_series(timestamptz)', 'execute'),
           has_function_privilege('authenticated', 'privado.solicitar_reserva(uuid,timestamptz,text,integer,uuid,text)', 'execute'))::text, '(f,f,f)',
  'SEC-04: las funciones privadas de B06 no son ejecutables por la API');
select is((select count(*)::int from cron.job where jobname = 'extender_series' and command like '%extender_series%'), 1, 'SEC-28: extender_series está en cron.job');

select * from finish();
rollback;
