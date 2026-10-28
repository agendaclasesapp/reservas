-- B08 · T08.3 · Mover y cancelar desde el alumno (`solicitar_movimiento`, `solicitar_cancelacion` y las ramas de `responder_solicitud`)
-- con dos profesores, por las RPC como las llama la API (rol authenticated).
-- IDs: SOL-02, SOL-03, SOL-07, SOL-10, AGE-11, RES-05, RES-07, NFR-03, SEC-06, SEC-08, SEC-10, AVI-02, AVI-03.
-- CA-13 (rama movimiento y cancelación), CA-22, CA-23, CA-24, CA-41, CA-63. Casos: T-AGE-07, T-SOL-03, T-SOL-04, T-SOL-10.
-- Reloj fijo: lunes 2026-11-02 12:00 de Montevideo (15:00Z); anticipación mínima 24 h. Datos sintéticos (@example.test); todo se deshace
-- con el rollback.
begin;
select plan(177);

-- Ayudas ------------------------------------------------------------------------------------------------------------------
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
create function pg_temp.persona(p_user uuid, p_nombre text, p_con_a text, p_con_b text) returns void language plpgsql as $f$
declare v_id uuid;
begin
  update public.alumno set estado = 'completa', nombre = p_nombre, telefono = '099 800 800', fecha_nacimiento = '1990-01-01',
         ficha_completada_en = '2026-01-01', ficha_origen_profesor_id = current_setting('rtc.pa')::uuid
   where user_id = p_user returning id into v_id;
  perform set_config('rtc.al_' || right(p_user::text, 2), v_id::text, true);
  if p_con_a is not null then
    insert into public.inscripcion (alumno_id, profesor_id, estado, aprobado_en)
    values (v_id, current_setting('rtc.pa')::uuid, p_con_a, public.app_ahora());
  end if;
  if p_con_b is not null then
    insert into public.inscripcion (alumno_id, profesor_id, estado, aprobado_en)
    values (v_id, current_setting('rtc.pb')::uuid, p_con_b, public.app_ahora());
  end if;
end;
$f$;
-- solicitar_reserva suelta/serie como p_sub (prof 'pa'|'pb').
create function pg_temp.sol(p_sub uuid, p_prof text, p_inicio text, p_tipo text default 'suelta', p_freq int default null) returns text language sql as $f$
  select pg_temp.q(p_sub, format('select public.solicitar_reserva(%L::uuid, %L::timestamptz, %L, %L::int)::text',
                                  current_setting('rtc.' || p_prof), p_inicio, p_tipo, p_freq))
$f$;
create function pg_temp.resp(p_sub uuid, p_id text, p_dec text, p_mot text default null) returns text language sql as $f$
  select pg_temp.q(p_sub, format('select public.responder_solicitud(%L::uuid, %L, %L)::text', p_id, p_dec, p_mot))
$f$;
-- Reserva + confirmación del profesor: deja una clase (o serie) confirmada. `p_prof` 'pa'|'pb'.
create function pg_temp.conf(p_sub uuid, p_prof text, p_inicio text, p_tipo text default 'suelta', p_freq int default null) returns text language plpgsql as $f$
declare v_r text; v_sid text; v_psub uuid := case p_prof when 'pa' then 'a0800000-0000-0000-0000-00000000000a'::uuid else 'a0800000-0000-0000-0000-00000000000b'::uuid end;
begin
  v_r := pg_temp.sol(p_sub, p_prof, p_inicio, p_tipo, p_freq);
  if v_r not like '{%' then return v_r; end if;
  v_sid := v_r::jsonb ->> 'solicitud_id';
  return pg_temp.resp(v_psub, v_sid, 'confirmar');
end;
$f$;
-- Id de la clase activa del profesor con ese inicio.
create function pg_temp.cid(p_prof text, p_inicio text) returns text language sql as $f$
  select id::text from public.clase where profesor_id = current_setting('rtc.' || p_prof)::uuid and inicio = p_inicio::timestamptz and estado in ('pendiente', 'confirmada')
$f$;
create function pg_temp.mov(p_sub uuid, p_clase text, p_destino text, p_alcance text default 'solo_esta') returns text language sql as $f$
  select pg_temp.q(p_sub, format('select public.solicitar_movimiento(%L::uuid, %L::timestamptz, %L)::text', p_clase, p_destino, p_alcance))
$f$;
create function pg_temp.can(p_sub uuid, p_clase text, p_alcance text default 'solo_esta') returns text language sql as $f$
  select pg_temp.q(p_sub, format('select public.solicitar_cancelacion(%L::uuid, %L)::text', p_clase, p_alcance))
$f$;
create function pg_temp.huecos(p_slug text, p_dia text, p_hora text) returns text language sql as $f$
  select estado from public.agenda_publica(p_slug, p_dia::date) where to_char(inicio at time zone 'America/Montevideo', 'HH24:MI') = p_hora
$f$;
create function pg_temp.reloj(p text) returns void language sql as $f$ update privado.reloj_prueba set ahora = p::timestamptz $f$;
create function pg_temp.sols(p_prof text) returns bigint language sql as $f$
  select count(*) from public.solicitud where profesor_id = current_setting('rtc.' || p_prof)::uuid and tipo <> 'reserva'
$f$;
create function pg_temp.ap(p text) returns text language sql as $f$ select current_setting('rtc.al_' || p) $f$;
-- Solicitud pendiente sobre una clase.
create function pg_temp.spend(p_clase text) returns text language sql as $f$
  select id::text from public.solicitud where clase_id = p_clase::uuid and estado = 'pendiente'
$f$;

-- Preparación: dos profesores, el Administrador y cuatro personas --------------------------------------------------------------
update privado.ajustes set permitir_reloj_prueba = true, tope_mails_hora = 1000, tope_mails_dia = 10000; -- sin el tope de mails (NFR-07) que tapa los estados
select pg_temp.reloj('2026-11-01 15:00:00+00'); -- domingo 12:00: se crea una clase a +44 h que el lunes quedará a +20 h
select set_config('rtc.pa', privado.configurar_profesor('pgtap08.profa@example.test', 'Profe A', 'pgtap08-a')::text, true) is not null as _;
select set_config('rtc.pb', privado.configurar_profesor('pgtap08.profb@example.test', 'Profe B', 'pgtap08-b')::text, true) is not null as _;
select privado.configurar_administrador('pgtap08.admin@example.test');
select pg_temp.usuario('a0800000-0000-0000-0000-00000000000a', 'pgtap08.profa@example.test');
select pg_temp.usuario('a0800000-0000-0000-0000-00000000000b', 'pgtap08.profb@example.test');
select pg_temp.usuario('a0800000-0000-0000-0000-00000000000d', 'pgtap08.admin@example.test');
select pg_temp.usuario('a0800000-0000-0000-0000-000000000001', 'pgtap08.ana@example.test');   -- aprobada solo con A
select pg_temp.usuario('a0800000-0000-0000-0000-000000000004', 'pgtap08.dani@example.test');  -- aprobada con A y con B
select pg_temp.usuario('a0800000-0000-0000-0000-000000000006', 'pgtap08.eva@example.test');   -- aprobada solo con A (clases ajenas)
select pg_temp.usuario('a0800000-0000-0000-0000-000000000007', 'pgtap08.gus@example.test');   -- aprobado con A y con B (tope)
select pg_temp.persona('a0800000-0000-0000-0000-000000000001', 'Ana', 'aprobado', null);
select pg_temp.persona('a0800000-0000-0000-0000-000000000004', 'Dani', 'aprobado', 'aprobado');
select pg_temp.persona('a0800000-0000-0000-0000-000000000006', 'Eva', 'aprobado', null);
select pg_temp.persona('a0800000-0000-0000-0000-000000000007', 'Gus', 'aprobado', 'aprobado');
-- B atiende además los sábados 10:00-11:00 (un hueco de B que no lo es de A).
insert into public.grilla_tramo (profesor_id, dia_semana, desde, hasta) values (current_setting('rtc.pb')::uuid, 6, '10:00', '11:00');

-- Clases confirmadas de partida. Y1 se confirma el domingo (a +44 h); el resto, el lunes 12:00 (reloj fijo).
select ok(pg_temp.conf('a0800000-0000-0000-0000-000000000001', 'pa', '2026-11-03 08:00-03') like '{%', 'preparación: Ana tiene una clase confirmada con A el martes 03/11 08:00 (el lunes quedará a +20 h)');
select pg_temp.reloj('2026-11-02 15:00:00+00');
select ok(bool_and(pg_temp.conf('a0800000-0000-0000-0000-000000000001', 'pa', t) like '{%'),
  'preparación: Ana tiene cuatro clases sueltas confirmadas con A el miércoles 04/11 (10, 11, 14 y 15)')
  from unnest(array['2026-11-04 10:00-03', '2026-11-04 11:00-03', '2026-11-04 14:00-03', '2026-11-04 15:00-03']) t;
select ok(bool_and(pg_temp.conf('a0800000-0000-0000-0000-000000000001', 'pa', t) like '{%'), 'preparación: Ana tiene además dos clases el miércoles 04/11 a las 08 y a las 12 (para la atomicidad)')
  from unnest(array['2026-11-04 08:00-03', '2026-11-04 12:00-03']) t;
select ok(pg_temp.conf('a0800000-0000-0000-0000-000000000001', 'pa', '2026-11-09 09:00-03', 'serie', 1) like '{%', 'preparación: Ana tiene la serie semanal S1 con A desde el lunes 09/11 09:00');
select ok(pg_temp.conf('a0800000-0000-0000-0000-000000000001', 'pa', '2026-11-09 10:00-03', 'serie', 1) like '{%', 'preparación: Ana tiene la serie semanal S2 con A desde el lunes 09/11 10:00');
select ok(pg_temp.conf('a0800000-0000-0000-0000-000000000004', 'pa', '2026-12-01 16:00-03') like '{%', 'preparación: Dani tiene una clase con A el martes 01/12 16:00 (ocupará una fecha de la serie nueva)');
select ok(pg_temp.conf('a0800000-0000-0000-0000-000000000004', 'pb', '2026-11-04 16:00-03') like '{%', 'preparación: Dani tiene una clase con B el miércoles 04/11 16:00');
select ok(pg_temp.conf('a0800000-0000-0000-0000-000000000007', 'pb', '2026-11-04 17:00-03') like '{%', 'preparación: Gus tiene una clase con B el miércoles 04/11 17:00');
select ok(pg_temp.conf('a0800000-0000-0000-0000-000000000007', 'pb', '2026-11-04 15:00-03') like '{%', 'preparación: Gus tiene otra clase con B el miércoles 04/11 15:00 (CA-63)');
select ok(bool_and(pg_temp.conf('a0800000-0000-0000-0000-000000000007', 'pa', t) like '{%'), 'preparación: Gus tiene nueve clases sueltas confirmadas con A el jueves 05/11 (08 a 12 y 14 a 17)')
  from unnest(array['2026-11-05 08:00-03', '2026-11-05 09:00-03', '2026-11-05 10:00-03', '2026-11-05 11:00-03', '2026-11-05 12:00-03',
                    '2026-11-05 14:00-03', '2026-11-05 15:00-03', '2026-11-05 16:00-03', '2026-11-05 17:00-03']) t;
select set_config('rtc.cl_y1', pg_temp.cid('pa', '2026-11-03 08:00-03'), true) is not null as _;
select set_config('rtc.cl_x1', pg_temp.cid('pa', '2026-11-04 10:00-03'), true) is not null as _;
select set_config('rtc.cl_x2', pg_temp.cid('pa', '2026-11-04 11:00-03'), true) is not null as _;
select set_config('rtc.cl_x3', pg_temp.cid('pa', '2026-11-04 14:00-03'), true) is not null as _;
select set_config('rtc.cl_x4', pg_temp.cid('pa', '2026-11-04 15:00-03'), true) is not null as _;
select set_config('rtc.cl_x5', pg_temp.cid('pa', '2026-11-04 12:00-03'), true) is not null as _;
select set_config('rtc.cl_x6', pg_temp.cid('pa', '2026-11-04 08:00-03'), true) is not null as _;
select set_config('rtc.cl_db1', pg_temp.cid('pb', '2026-11-04 16:00-03'), true) is not null as _;
select set_config('rtc.cl_gb1', pg_temp.cid('pb', '2026-11-04 17:00-03'), true) is not null as _;
select set_config('rtc.cl_gb2', pg_temp.cid('pb', '2026-11-04 15:00-03'), true) is not null as _;
select set_config('rtc.cl_dani_a', pg_temp.cid('pa', '2026-12-01 16:00-03'), true) is not null as _;

-- 1. SEC-06 / SOL-09: quién puede pedir (siempre 403/404 y nada se escribe) ----------------------------------------------------
select is(pg_temp.err(pg_temp.mov('a0800000-0000-0000-0000-00000000000a', current_setting('rtc.cl_x1'), '2026-11-11 10:00-03')), 'PT403 PROHIBIDO', 'SEC-06: el profesor no pide mover (403)');
select is(pg_temp.err(pg_temp.can('a0800000-0000-0000-0000-00000000000a', current_setting('rtc.cl_x1'))), 'PT403 PROHIBIDO', 'SEC-06: el profesor no pide cancelar (403)');
select is(pg_temp.err(pg_temp.mov('a0800000-0000-0000-0000-00000000000b', current_setting('rtc.cl_x1'), '2026-11-11 10:00-03')), 'PT403 PROHIBIDO', 'SEC-06: la profesora B no pide mover (403)');
select is(pg_temp.err(pg_temp.can('a0800000-0000-0000-0000-00000000000d', current_setting('rtc.cl_x1'))), 'PT403 PROHIBIDO', 'SEC-06: el Administrador que no es profesor no pide cancelar (403)');
select is(pg_temp.err(pg_temp.mov('a0800000-0000-0000-0000-00000000000d', current_setting('rtc.cl_x1'), '2026-11-11 10:00-03')), 'PT403 PROHIBIDO', 'SEC-06: ni mover (403)');
select is(pg_temp.err(pg_temp.q(null, format('select public.solicitar_movimiento(%L::uuid, now(), ''solo_esta'')::text', current_setting('rtc.cl_x1')))), 'PT401 NO_AUTENTICADO', 'SEC-06: sin sesión mover da 401');
select is(pg_temp.err(pg_temp.q(null, format('select public.solicitar_cancelacion(%L::uuid, ''solo_esta'')::text', current_setting('rtc.cl_x1')))), 'PT401 NO_AUTENTICADO', 'SEC-06: sin sesión cancelar da 401');
select is(pg_temp.err(pg_temp.q(null, format('select public.solicitar_movimiento(%L::uuid, now(), ''solo_esta'')::text', current_setting('rtc.cl_x1')), 'anon')),
  '42501 permission denied for function solicitar_movimiento', 'SEC-04/SEC-06: anon no tiene permiso sobre solicitar_movimiento');
select is(pg_temp.err(pg_temp.q(null, format('select public.solicitar_cancelacion(%L::uuid, ''solo_esta'')::text', current_setting('rtc.cl_x1')), 'anon')),
  '42501 permission denied for function solicitar_cancelacion', 'SEC-04/SEC-06: anon no tiene permiso sobre solicitar_cancelacion');
select is(pg_temp.err(pg_temp.mov('a0800000-0000-0000-0000-000000000001', gen_random_uuid()::text, '2026-11-11 10:00-03')), 'PT404 NO_ENCONTRADO', 'SEC-06: una clase inexistente da 404 al mover');
select is(pg_temp.err(pg_temp.can('a0800000-0000-0000-0000-000000000001', gen_random_uuid()::text)), 'PT404 NO_ENCONTRADO', 'SEC-06: una clase inexistente da 404 al cancelar');
select is(pg_temp.err(pg_temp.mov('a0800000-0000-0000-0000-000000000006', current_setting('rtc.cl_x1'), '2026-11-11 10:00-03')), 'PT403 PROHIBIDO', 'SOL-09/SEC-06: Eva no mueve la clase de Ana (403)');
select is(pg_temp.err(pg_temp.can('a0800000-0000-0000-0000-000000000004', current_setting('rtc.cl_x1'))), 'PT403 PROHIBIDO', 'SOL-09/SEC-06: Dani no cancela la clase de Ana (403)');
select is(pg_temp.err(pg_temp.can('a0800000-0000-0000-0000-000000000001', current_setting('rtc.cl_db1'))), 'PT403 PROHIBIDO', 'SOL-09/SEC-06: Ana no cancela la clase de Dani con B (403)');
select is(pg_temp.sols('pa') + pg_temp.sols('pb'), 0::bigint, 'SEC-06: ningún intento fallido creó una solicitud de movimiento o cancelación');

-- 2. Validación de datos: alcance y destino (SEC-09, SOL-03) -------------------------------------------------------------------
select is(pg_temp.det(pg_temp.mov('a0800000-0000-0000-0000-000000000001', current_setting('rtc.cl_x1'), '2026-11-11 10:00-03', 'siempre')) ->> 'campo', 'p_alcance', 'SEC-09: un alcance inválido da 422 con el campo p_alcance (mover)');
select is(pg_temp.det(pg_temp.can('a0800000-0000-0000-0000-000000000001', current_setting('rtc.cl_x1'), 'siempre')) ->> 'campo', 'p_alcance', 'SEC-09: un alcance inválido da 422 con el campo p_alcance (cancelar)');
select is(pg_temp.err(pg_temp.mov('a0800000-0000-0000-0000-000000000001', current_setting('rtc.cl_x1'), '2026-11-11 10:00-03', 'desde_aca')), 'PT422 DATOS_INVALIDOS', 'SOL-03: «de acá en adelante» en una clase suelta da 422 (mover)');
select is(pg_temp.err(pg_temp.can('a0800000-0000-0000-0000-000000000001', current_setting('rtc.cl_x1'), 'desde_aca')), 'PT422 DATOS_INVALIDOS', 'SOL-03: «de acá en adelante» en una clase suelta da 422 (cancelar)');
select is(pg_temp.det(pg_temp.q('a0800000-0000-0000-0000-000000000001', format('select public.solicitar_movimiento(%L::uuid, null, ''solo_esta'')::text', current_setting('rtc.cl_x1')))) ->> 'campo', 'p_destino', 'SEC-09: un destino nulo da 422 con el campo p_destino');
select is(pg_temp.det(pg_temp.mov('a0800000-0000-0000-0000-000000000001', current_setting('rtc.cl_x1'), '2020-01-01 10:00-03')) ->> 'campo', 'p_destino', 'SEC-09: un destino muy lejano en el pasado da 422 con el campo p_destino');

-- 3. T-AGE-07 / CA-13: a +20 h (anticipación de 24 h) se rechaza con el motivo y no se crea nada --------------------------------
select is(pg_temp.err(pg_temp.mov('a0800000-0000-0000-0000-000000000001', current_setting('rtc.cl_y1'), '2026-11-13 10:00-03')), 'PT422 ANTICIPACION_INSUFICIENTE',
  'CA-13/T-AGE-07: mover una clase que empieza dentro de 20 h da 422 ANTICIPACION_INSUFICIENTE');
select is(pg_temp.det(pg_temp.mov('a0800000-0000-0000-0000-000000000001', current_setting('rtc.cl_y1'), '2026-11-13 10:00-03')) ->> 'horas_minimas', '24', 'CA-13: el rechazo dice las horas mínimas (24)');
select is(pg_temp.err(pg_temp.can('a0800000-0000-0000-0000-000000000001', current_setting('rtc.cl_y1'))), 'PT422 ANTICIPACION_INSUFICIENTE',
  'CA-13/T-AGE-07: cancelar una clase que empieza dentro de 20 h da 422 ANTICIPACION_INSUFICIENTE');
select is(pg_temp.det(pg_temp.can('a0800000-0000-0000-0000-000000000001', current_setting('rtc.cl_y1'))) ->> 'horas_minimas', '24', 'CA-13: la cancelación también dice las horas mínimas (24)');
select is(pg_temp.err(pg_temp.mov('a0800000-0000-0000-0000-000000000004', current_setting('rtc.cl_db1'), '2026-11-03 08:00-03')), 'PT422 ANTICIPACION_INSUFICIENTE',
  'CA-13/T-AGE-07: un destino a +20 h también da 422 ANTICIPACION_INSUFICIENTE (origen a +52 h)');
select is(pg_temp.sols('pa') + pg_temp.sols('pb'), 0::bigint, 'CA-13: ninguno de los rechazos a +20 h creó solicitud');
select is((select count(*)::int from public.clase where profesor_id = current_setting('rtc.pb')::uuid and inicio = '2026-11-03 08:00-03'), 0, 'CA-13: ni clases en el destino a +20 h');
select is((select estado from public.clase where id = current_setting('rtc.cl_y1')::uuid), 'confirmada', 'CA-13: la clase a +20 h sigue confirmada');

-- 4. RES-07: el destino tiene que ser un hueco de la agenda del profesor de la clase ----------------------------------------------
select is(pg_temp.err(pg_temp.mov('a0800000-0000-0000-0000-000000000001', current_setting('rtc.cl_x2'), '2026-11-14 10:00-03')), 'PT422 FUERA_DE_GRILLA',
  'RES-07: el sábado 10:00 es un hueco de B pero no de A: mover la clase de A allí da 422 FUERA_DE_GRILLA');
select is(pg_temp.err(pg_temp.mov('a0800000-0000-0000-0000-000000000001', current_setting('rtc.cl_x2'), '2026-11-11 10:30-03')), 'PT422 FUERA_DE_GRILLA', 'RES-07: un horario que no es hora de la grilla da 422 FUERA_DE_GRILLA');
select is(pg_temp.err(pg_temp.mov('a0800000-0000-0000-0000-000000000001', current_setting('rtc.cl_x2'), '2026-11-11 13:00-03')), 'PT422 FUERA_DE_GRILLA', 'RES-07: entre tramos (13:00) da 422 FUERA_DE_GRILLA');
select is(pg_temp.err(pg_temp.mov('a0800000-0000-0000-0000-000000000001', current_setting('rtc.cl_x2'), '2026-11-15 10:00-03')), 'PT422 FUERA_DE_GRILLA', 'RES-07: un domingo da 422 FUERA_DE_GRILLA');
select is(pg_temp.err(pg_temp.mov('a0800000-0000-0000-0000-000000000001', current_setting('rtc.cl_x2'), '2026-11-04 10:00-03')), 'PT409 HUECO_NO_LIBRE', 'AGE-11: un destino ocupado da 409 HUECO_NO_LIBRE');
select is((pg_temp.det(pg_temp.mov('a0800000-0000-0000-0000-000000000001', current_setting('rtc.cl_x2'), '2026-11-04 10:00-03')) ->> 'inicio')::timestamptz, '2026-11-04 10:00-03'::timestamptz, 'AGE-11: el 409 dice el inicio ocupado');
select is(pg_temp.sols('pa'), 0::bigint, 'RES-07: los destinos inválidos no crearon solicitudes');

-- 5. CA-22: el movimiento queda pendiente; la clase de origen sigue confirmada y el destino ocupado ------------------------------
select set_config('rtc.r_x1', pg_temp.mov('a0800000-0000-0000-0000-000000000001', current_setting('rtc.cl_x1'), '2026-11-11 10:00-03'), true) is not null as _;
select ok(current_setting('rtc.r_x1') like '{%', 'CA-22/SOL-02: Ana pide mover su clase del 04/11 10:00 al 11/11 10:00');
select is((current_setting('rtc.r_x1')::jsonb -> 'fechas' ->> 0)::timestamptz || '/' || jsonb_array_length(current_setting('rtc.r_x1')::jsonb -> 'fechas') || '/' || jsonb_array_length(current_setting('rtc.r_x1')::jsonb -> 'salteadas'),
  ('2026-11-11 10:00-03'::timestamptz)::text || '/1/0', 'SOL-02: la respuesta trae la fecha pedida y ninguna salteada');
select is((select s.tipo || '/' || s.alcance || '/' || s.estado || '/' || (s.clase_id = current_setting('rtc.cl_x1')::uuid)::text || '/' || (s.fecha_clase = '2026-11-04 10:00-03')::text
             from public.solicitud s where s.id = (current_setting('rtc.r_x1')::jsonb ->> 'solicitud_id')::uuid),
  'movimiento/solo_esta/pendiente/true/true', 'CA-22: la solicitud es de movimiento, solo esta clase, pendiente, sobre la clase de origen');
select is((select estado from public.clase where id = current_setting('rtc.cl_x1')::uuid), 'confirmada', 'CA-22: la clase de origen sigue confirmada hasta que el profesor responda');
select is((select string_agg(estado, ',') from public.clase where profesor_id = current_setting('rtc.pa')::uuid and inicio = '2026-11-11 10:00-03'), 'pendiente', 'CA-22: el destino es una clase pendiente');
select is(pg_temp.huecos('pgtap08-a', '2026-11-11', '10:00'), 'ocupado', 'CA-22/AGE-11: el destino figura ocupado en la agenda pública (sin esperar la respuesta)');
select is(pg_temp.huecos('pgtap08-a', '2026-11-04', '10:00'), 'ocupado', 'CA-22: el origen sigue ocupado en la agenda pública');
select is(pg_temp.err(pg_temp.can('a0800000-0000-0000-0000-000000000001', current_setting('rtc.cl_x1'))), 'PT409 SOLICITUD_EN_CURSO', 'SOL-07: con un movimiento pendiente no se puede pedir otro cambio de la misma clase');
select is(pg_temp.det(pg_temp.can('a0800000-0000-0000-0000-000000000001', current_setting('rtc.cl_x1'))) ->> 'solicitud_id', current_setting('rtc.r_x1')::jsonb ->> 'solicitud_id', 'SOL-07: el 409 trae el id de la solicitud en curso');
select is(pg_temp.err(pg_temp.mov('a0800000-0000-0000-0000-000000000001', current_setting('rtc.cl_x1'), '2026-11-12 10:00-03')), 'PT409 SOLICITUD_EN_CURSO', 'SOL-07: ni mover de nuevo');
select is((select asunto || '|' || estado from public.mail_salida where tipo = 'solicitud_nueva' and destinatario = 'pgtap08.profa@example.test' and asunto like '%cambio de horario%'),
  'Solicitud de cambio de horario: Ana|pendiente', 'AVI-02: el profesor recibe el aviso «Solicitud de cambio de horario: Ana»');
select ok((select cuerpo_texto like '%Clase del 04/11/2026 a las 10:00%Nuevo horario: 11/11/2026 a las 10:00%Alcance: solo esta clase%' from public.mail_salida
             where tipo = 'solicitud_nueva' and asunto = 'Solicitud de cambio de horario: Ana'), 'AVI-02: el aviso dice la clase, el nuevo horario y el alcance');
select is((select count(*)::int from public.mail_salida where tipo = 'solicitud_nueva' and profesor_id = current_setting('rtc.pb')::uuid and asunto like '%cambio de horario%'), 0, 'AVI-02/CA-55: ningún aviso de cambio sale a nombre de B');

-- 6. CA-23: el profesor confirma el cambio de horario (libera el original, ocupa el nuevo) ----------------------------------------
select is(pg_temp.err(pg_temp.resp('a0800000-0000-0000-0000-00000000000b', current_setting('rtc.r_x1')::jsonb ->> 'solicitud_id', 'confirmar')), 'PT404 NO_ENCONTRADO', 'SEC-06/CA-55: B no confirma el movimiento de A (404)');
select is(pg_temp.resp('a0800000-0000-0000-0000-00000000000a', current_setting('rtc.r_x1')::jsonb ->> 'solicitud_id', 'confirmar', 'Perfecto'), '{"estado": "confirmada"}', 'CA-23/SOL-05: A confirma el cambio de horario');
select is((select c.estado || '/' || (c.movida_a is not null)::text || '/' || d.estado from public.clase c join public.clase d on d.id = c.movida_a where c.id = current_setting('rtc.cl_x1')::uuid),
  'movida/true/confirmada', 'CA-23: el origen pasa a movida (con movida_a) y el destino a confirmada');
select is(pg_temp.huecos('pgtap08-a', '2026-11-04', '10:00'), 'libre', 'CA-23: el hueco original queda libre');
select is(pg_temp.huecos('pgtap08-a', '2026-11-11', '10:00'), 'ocupado', 'CA-23: el nuevo hueco queda ocupado');
select is((select r.estado || '/' || (r.reserva_origen_id = (select reserva_id from public.clase where id = current_setting('rtc.cl_x1')::uuid))::text || '/' || r.tipo
             from public.reserva r where r.id = (select reserva_id from public.clase where profesor_id = current_setting('rtc.pa')::uuid and inicio = '2026-11-11 10:00-03' and estado = 'confirmada')),
  'confirmada/true/suelta', 'CA-23: la reserva destino es una suelta confirmada que apunta a la reserva de origen');
select is((select estado from public.solicitud where id = (current_setting('rtc.r_x1')::jsonb ->> 'solicitud_id')::uuid), 'confirmada', 'CA-23: la solicitud queda confirmada');
select ok((select cuerpo_texto like '%Profe A confirmó tu solicitud de cambio de horario.%Clase del 04/11/2026 a las 10:00 (hora de America/Montevideo)%Nuevo horario: 11/11/2026 a las 10:00%Alcance: solo esta clase%Mensaje: Perfecto%'
             from public.mail_salida where tipo = 'solicitud_respondida' and destinatario = 'pgtap08.ana@example.test' and asunto = 'Profe A confirmó tu solicitud de cambio de horario'),
  'AVI-03: el mail a Ana dice «cambio de horario», la clase, el nuevo horario, el alcance y el mensaje');

-- 7. CA-23: el profesor rechaza (todo queda como estaba) ------------------------------------------------------------------------
select ok(pg_temp.mov('a0800000-0000-0000-0000-000000000001', current_setting('rtc.cl_x2'), '2026-11-11 11:00-03') like '{%', 'CA-23: Ana pide mover su clase del 04/11 11:00 al 11/11 11:00');
select is(pg_temp.resp('a0800000-0000-0000-0000-00000000000a', pg_temp.spend(current_setting('rtc.cl_x2')), 'rechazar', 'Ese día no atiendo'), '{"estado": "rechazada"}', 'CA-23/SOL-06: A rechaza el cambio de horario con un motivo');
select is((select estado from public.clase where id = current_setting('rtc.cl_x2')::uuid), 'confirmada', 'CA-23: la clase de origen sigue confirmada');
select is((select string_agg(estado, ',') from public.clase where profesor_id = current_setting('rtc.pa')::uuid and inicio = '2026-11-11 11:00-03'), 'rechazada', 'CA-23: la clase destino queda rechazada');
select is(pg_temp.huecos('pgtap08-a', '2026-11-11', '11:00'), 'libre', 'CA-23: el hueco destino queda libre');
select is(pg_temp.huecos('pgtap08-a', '2026-11-04', '11:00'), 'ocupado', 'CA-23: el origen sigue ocupado');
select is((select r.estado from public.reserva r where r.reserva_origen_id = (select reserva_id from public.clase where id = current_setting('rtc.cl_x2')::uuid)), 'rechazada', 'CA-23: la reserva destino queda rechazada');
select ok((select cuerpo_texto like '%Profe A rechazó tu solicitud de cambio de horario.%Nuevo horario: 11/11/2026 a las 11:00%Motivo: Ese día no atiendo%'
             from public.mail_salida where tipo = 'solicitud_respondida' and destinatario = 'pgtap08.ana@example.test' and asunto = 'Profe A rechazó tu solicitud de cambio de horario'),
  'AVI-03: el mail del rechazo trae el motivo y el nuevo horario pedido');
select ok(pg_temp.mov('a0800000-0000-0000-0000-000000000001', current_setting('rtc.cl_x2'), '2026-11-11 11:00-03') like '{%', 'CA-23: tras el rechazo la clase se puede volver a pedir y el hueco se acepta');
select is(pg_temp.resp('a0800000-0000-0000-0000-00000000000a', pg_temp.spend(current_setting('rtc.cl_x2')), 'rechazar'), '{"estado": "rechazada"}', 'CA-23: se vuelve a rechazar para dejar todo como estaba');

-- 8. CA-24: cancelación de una clase suelta, con motivo en el mail ---------------------------------------------------------------
select set_config('rtc.r_x3', pg_temp.can('a0800000-0000-0000-0000-000000000001', current_setting('rtc.cl_x3')), true) is not null as _;
select ok(current_setting('rtc.r_x3') like '{%', 'CA-24/SOL-02: Ana avisa que no puede ir a su clase del 04/11 14:00');
select is((select s.tipo || '/' || s.alcance || '/' || s.estado || '/' || coalesce(s.reserva_id::text, '-') from public.solicitud s where s.id = (current_setting('rtc.r_x3')::jsonb ->> 'solicitud_id')::uuid),
  'cancelacion/solo_esta/pendiente/-', 'CA-24: la solicitud es de cancelación, pendiente y sin reserva');
select is((select estado from public.clase where id = current_setting('rtc.cl_x3')::uuid), 'confirmada', 'CA-24: la clase sigue confirmada hasta la respuesta');
select is(pg_temp.huecos('pgtap08-a', '2026-11-04', '14:00'), 'ocupado', 'CA-24: el hueco sigue ocupado hasta la respuesta');
select is((select asunto from public.mail_salida where tipo = 'solicitud_nueva' and asunto like 'Aviso de que no puede ir%'), 'Aviso de que no puede ir: Ana', 'AVI-02: el profesor recibe «Aviso de que no puede ir: Ana»');
select ok((select cuerpo_texto like '%Clase del 04/11/2026 a las 14:00%Alcance: solo esta clase%' and cuerpo_texto not like '%Nuevo horario%' from public.mail_salida where tipo = 'solicitud_nueva' and asunto = 'Aviso de que no puede ir: Ana'),
  'AVI-02: el aviso dice la clase y el alcance, sin nuevo horario');
select is(pg_temp.resp('a0800000-0000-0000-0000-00000000000a', current_setting('rtc.r_x3')::jsonb ->> 'solicitud_id', 'confirmar', 'Gracias por avisar'), '{"estado": "confirmada"}', 'CA-24: A confirma la cancelación');
select is((select c.estado || '/' || r.estado from public.clase c join public.reserva r on r.id = c.reserva_id where c.id = current_setting('rtc.cl_x3')::uuid), 'cancelada/cancelada', 'CA-24: la clase y su reserva suelta quedan canceladas');
select is(pg_temp.huecos('pgtap08-a', '2026-11-04', '14:00'), 'libre', 'CA-24: el hueco queda libre');
select ok((select cuerpo_texto like '%Profe A confirmó tu solicitud de cancelación.%Clase del 04/11/2026 a las 14:00%Alcance: solo esta clase%Mensaje: Gracias por avisar%'
             from public.mail_salida where tipo = 'solicitud_respondida' and asunto = 'Profe A confirmó tu solicitud de cancelación' and cuerpo_texto like '%a las 14:00%'), 'AVI-03: el mail de la cancelación confirmada dice «cancelación», la clase y el mensaje');
select ok(pg_temp.can('a0800000-0000-0000-0000-000000000001', current_setting('rtc.cl_x4')) like '{%', 'CA-24: Ana avisa que no puede ir a su clase del 04/11 15:00');
select is(pg_temp.resp('a0800000-0000-0000-0000-00000000000a', pg_temp.spend(current_setting('rtc.cl_x4')), 'rechazar', 'Necesito esa clase'), '{"estado": "rechazada"}', 'CA-24: A rechaza la cancelación con un motivo');
select is((select c.estado || '/' || r.estado from public.clase c join public.reserva r on r.id = c.reserva_id where c.id = current_setting('rtc.cl_x4')::uuid), 'confirmada/confirmada', 'CA-24: rechazada la cancelación, la clase sigue confirmada');
select is(pg_temp.huecos('pgtap08-a', '2026-11-04', '15:00'), 'ocupado', 'CA-24: y su hueco sigue ocupado');
select ok((select cuerpo_texto like '%Profe A rechazó tu solicitud de cancelación.%Motivo: Necesito esa clase%' from public.mail_salida where tipo = 'solicitud_respondida' and asunto = 'Profe A rechazó tu solicitud de cancelación'),
  'AVI-03/CA-24: el mail de la cancelación rechazada lleva el motivo del profesor');
select is((select count(*)::int from public.clase where profesor_id = current_setting('rtc.pa')::uuid and inicio = '2026-11-04 15:00-03'), 1, 'CA-24: una cancelación no crea clases');

-- 9. CA-24 / SOL-03: «de acá en adelante» -----------------------------------------------------------------------------------------
select set_config('rtc.cl_s1', pg_temp.cid('pa', '2026-11-23 09:00-03'), true) is not null as _;
select set_config('rtc.cl_s2', pg_temp.cid('pa', '2026-11-30 10:00-03'), true) is not null as _;
select set_config('rtc.res_s1', (select reserva_id::text from public.clase where id = current_setting('rtc.cl_s1')::uuid), true) is not null as _;
select set_config('rtc.res_s2', (select reserva_id::text from public.clase where id = current_setting('rtc.cl_s2')::uuid), true) is not null as _;
select set_config('rtc.r_s1', pg_temp.mov('a0800000-0000-0000-0000-000000000001', current_setting('rtc.cl_s1'), '2026-11-24 16:00-03', 'desde_aca'), true) is not null as _;
select ok(current_setting('rtc.r_s1') like '{%', 'CA-24/SOL-03: Ana pide mover la serie S1 desde el 23/11 09:00 al martes 24/11 16:00');
select is(jsonb_array_length(current_setting('rtc.r_s1')::jsonb -> 'salteadas') || '/' || (current_setting('rtc.r_s1')::jsonb -> 'salteadas' ->> 0)::timestamptz,
  '1/' || ('2026-12-01 16:00-03'::timestamptz)::text, 'RES-05: la respuesta trae como salteada la fecha ocupada (martes 01/12 16:00)');
select ok(jsonb_array_length(current_setting('rtc.r_s1')::jsonb -> 'fechas') >= 15, 'SOL-03: la respuesta trae las fechas de la serie nueva en todo el horizonte');
select is((select hasta is null from public.reserva where id = current_setting('rtc.res_s1')::uuid), true, 'SOL-03: hasta que el profesor responda, la serie original no se toca');
select is((select count(*)::int from public.clase where reserva_id = current_setting('rtc.res_s1')::uuid and estado <> 'confirmada'), 0, 'SOL-03: ni sus clases');
select is(pg_temp.err(pg_temp.can('a0800000-0000-0000-0000-000000000001', pg_temp.cid('pa', '2026-11-30 09:00-03'), 'desde_aca')), 'PT409 SOLICITUD_EN_CURSO',
  'SOL-07: una cancelación «de acá en adelante» de una clase siguiente choca con el movimiento pendiente de la serie');
select is(pg_temp.err(pg_temp.can('a0800000-0000-0000-0000-000000000001', pg_temp.cid('pa', '2026-12-07 09:00-03'))), 'PT409 SOLICITUD_EN_CURSO',
  'SOL-07: una clase siguiente de la serie queda alcanzada por la solicitud «de acá en adelante» pendiente');
select is(pg_temp.resp('a0800000-0000-0000-0000-00000000000a', current_setting('rtc.r_s1')::jsonb ->> 'solicitud_id', 'confirmar'), '{"estado": "confirmada"}', 'CA-24: A confirma el movimiento de la serie');
select is((select hasta::text from public.reserva where id = current_setting('rtc.res_s1')::uuid), '2026-11-22', 'CA-24/ADR-003: la serie original termina el día previo (22/11)');
select is((select count(*) filter (where estado = 'movida' and inicio >= '2026-11-23 09:00-03')::text || '/' || count(*) filter (where estado = 'confirmada' and inicio < '2026-11-23 09:00-03')
             from public.clase where reserva_id = current_setting('rtc.res_s1')::uuid),
  (select count(*)::text from public.clase where reserva_id = current_setting('rtc.res_s1')::uuid and inicio >= '2026-11-23 09:00-03') || '/2',
  'CA-24: las clases desde el 23/11 quedan movidas y las dos anteriores (09/11 y 16/11) siguen confirmadas');
select is((select count(*)::int from public.clase where reserva_id = current_setting('rtc.res_s1')::uuid and movida_a is not null), 1, 'CA-24: solo la clase de origen lleva movida_a');
select is((select r.tipo || '/' || r.frecuencia_semanas || '/' || r.estado || '/' || r.desde || '/' || (r.reserva_origen_id = current_setting('rtc.res_s1')::uuid)::text from public.reserva r
             where r.reserva_origen_id = current_setting('rtc.res_s1')::uuid), 'serie/1/confirmada/2026-11-24/true', 'CA-24: nace una serie semanal confirmada desde el 24/11 que apunta a la original');
select is((select count(*)::int from public.clase c join public.reserva r on r.id = c.reserva_id where r.reserva_origen_id = current_setting('rtc.res_s1')::uuid and c.estado = 'confirmada'),
  jsonb_array_length(current_setting('rtc.r_s1')::jsonb -> 'fechas'), 'CA-24: la serie nueva tiene una clase confirmada por cada fecha informada');
select is((select count(*)::int from public.clase c join public.reserva r on r.id = c.reserva_id where r.reserva_origen_id = current_setting('rtc.res_s1')::uuid and c.inicio = '2026-12-01 16:00-03'), 0, 'RES-05: la fecha ocupada se saltea');
select is((select alumno_id::text from public.clase where id = current_setting('rtc.cl_dani_a')::uuid), pg_temp.ap('04'), 'RES-05: la clase de Dani del 01/12 sigue siendo suya');
select is(pg_temp.huecos('pgtap08-a', '2026-11-30', '09:00'), 'libre', 'CA-24: el lunes 30/11 09:00 de la serie vieja queda libre');
select is(pg_temp.huecos('pgtap08-a', '2026-11-24', '16:00'), 'ocupado', 'CA-24: el martes 24/11 16:00 de la serie nueva queda ocupado');
select is(pg_temp.huecos('pgtap08-a', '2026-11-16', '09:00'), 'ocupado', 'CA-24: el lunes 16/11 09:00 anterior sigue ocupado');
select ok((select cuerpo_texto like '%Nuevo horario: 24/11/2026 a las 16:00%Alcance: de acá en adelante (serie semanal)%' from public.mail_salida where tipo = 'solicitud_respondida' and asunto = 'Profe A confirmó tu solicitud de cambio de horario'
             and cuerpo_texto like '%Clase del 23/11/2026%'), 'AVI-03: el mail de la serie dice el alcance «de acá en adelante» y el nuevo horario');
select ok(pg_temp.can('a0800000-0000-0000-0000-000000000001', current_setting('rtc.cl_s2'), 'desde_aca') like '{%', 'CA-24: Ana avisa que no puede ir a S2 desde el 30/11 10:00 de acá en adelante');
select is((select count(*)::int from public.clase where reserva_id = current_setting('rtc.res_s2')::uuid and estado <> 'confirmada'), 0, 'CA-24: hasta la respuesta, S2 no cambia');
select is(pg_temp.resp('a0800000-0000-0000-0000-00000000000a', pg_temp.spend(current_setting('rtc.cl_s2')), 'confirmar'), '{"estado": "confirmada"}', 'CA-24: A confirma la cancelación de la serie');
select is((select hasta::text || '/' || estado from public.reserva where id = current_setting('rtc.res_s2')::uuid), '2026-11-29/confirmada', 'CA-24/ADR-003: S2 termina el 29/11 y la reserva sigue confirmada');
select is((select count(*) filter (where estado = 'cancelada' and inicio >= '2026-11-30 10:00-03')::text || '/' || count(*) filter (where estado = 'confirmada' and inicio < '2026-11-30 10:00-03') from public.clase where reserva_id = current_setting('rtc.res_s2')::uuid),
  (select count(*)::text from public.clase where reserva_id = current_setting('rtc.res_s2')::uuid and inicio >= '2026-11-30 10:00-03') || '/3', 'CA-24: desde el 30/11 las clases quedan canceladas y las tres anteriores siguen confirmadas');
select is(pg_temp.huecos('pgtap08-a', '2026-12-07', '10:00'), 'libre', 'CA-24: los huecos cancelados de la serie quedan libres');
select is(pg_temp.huecos('pgtap08-a', '2026-11-23', '10:00'), 'ocupado', 'CA-24: los anteriores siguen ocupados');
select ok((select cuerpo_texto like '%Alcance: de acá en adelante (serie semanal)%' from public.mail_salida where tipo = 'solicitud_respondida' and asunto = 'Profe A confirmó tu solicitud de cancelación' and cuerpo_texto like '%Clase del 30/11/2026%'),
  'AVI-03: el mail de la cancelación de serie dice «de acá en adelante»');

-- 10. NFR-03 / SEC-08: la confirmación es atómica (fallo inyectado) ---------------------------------------------------------------
create function public.zz_falla_inyectada() returns trigger language plpgsql as $f$ begin raise exception 'FALLO_INYECTADO'; end; $f$;
select ok(pg_temp.mov('a0800000-0000-0000-0000-000000000001', current_setting('rtc.cl_x5'), '2026-11-11 12:00-03') like '{%', 'NFR-03: Ana pide mover su clase del 04/11 12:00 al 11/11 12:00');
select set_config('rtc.s_x5', pg_temp.spend(current_setting('rtc.cl_x5')), true) is not null as _;
create trigger zz_falla before update on public.clase for each row when (new.estado = 'movida') execute function public.zz_falla_inyectada();
select is(pg_temp.err(pg_temp.resp('a0800000-0000-0000-0000-00000000000a', current_setting('rtc.s_x5'), 'confirmar')), 'P0001 FALLO_INYECTADO', 'NFR-03/SEC-08: con un fallo al pasar el origen a movida, confirmar falla');
select is((select s.estado || '/' || c.estado || '/' || (select string_agg(d.estado, ',') from public.clase d where d.profesor_id = c.profesor_id and d.inicio = '2026-11-11 12:00-03')
                || '/' || (select r.estado from public.reserva r where r.reserva_origen_id = c.reserva_id)
             from public.solicitud s join public.clase c on c.id = s.clase_id where s.id = current_setting('rtc.s_x5')::uuid), 'pendiente/confirmada/pendiente/pendiente',
  'NFR-03/SEC-08: nada se escribió: la solicitud, el destino y su reserva siguen pendientes y el origen confirmado');
select is((select respondida_en is null from public.solicitud where id = current_setting('rtc.s_x5')::uuid), true, 'NFR-03: la solicitud no quedó con respondida_en');
select is((select count(*)::int from public.mail_salida where tipo = 'solicitud_respondida' and asunto like '%cambio de horario%' and cuerpo_texto like '%Clase del 04/11/2026 a las 12:00%'), 0, 'NFR-03: no se encoló el mail de respuesta');
drop trigger zz_falla on public.clase;
create trigger zz_falla before update on public.clase for each row when (new.estado = 'cancelada') execute function public.zz_falla_inyectada();
select ok(pg_temp.can('a0800000-0000-0000-0000-000000000001', current_setting('rtc.cl_x6')) like '{%', 'NFR-03: Ana avisa que no puede ir a su clase del 04/11 08:00');
select set_config('rtc.s_x6', pg_temp.spend(current_setting('rtc.cl_x6')), true) is not null as _;
select is(pg_temp.err(pg_temp.resp('a0800000-0000-0000-0000-00000000000a', current_setting('rtc.s_x6'), 'confirmar')), 'P0001 FALLO_INYECTADO', 'NFR-03/SEC-08: con un fallo al cancelar, confirmar la cancelación falla');
select is((select s.estado || '/' || c.estado || '/' || r.estado from public.solicitud s join public.clase c on c.id = s.clase_id join public.reserva r on r.id = c.reserva_id where s.id = current_setting('rtc.s_x6')::uuid), 'pendiente/confirmada/confirmada',
  'NFR-03/SEC-08: nada se escribió: solicitud pendiente, clase y reserva confirmadas');
drop trigger zz_falla on public.clase;
select is(pg_temp.resp('a0800000-0000-0000-0000-00000000000a', current_setting('rtc.s_x5'), 'confirmar'), '{"estado": "confirmada"}', 'NFR-03: sin el fallo, el mismo movimiento se confirma (la solicitud no quedó trabada)');
select is((select estado from public.clase where id = current_setting('rtc.cl_x5')::uuid), 'movida', 'NFR-03: y el origen queda movida');
select is(pg_temp.resp('a0800000-0000-0000-0000-00000000000a', current_setting('rtc.s_x6'), 'confirmar'), '{"estado": "confirmada"}', 'NFR-03: sin el fallo, la cancelación también se confirma');

-- 11. CA-41 / SOL-10 / SEC-10: reservas, movimientos y cancelaciones suman al mismo tope de 10 por profesor -----------------------
select set_config('rtc.g' || n, pg_temp.cid('pa', t), true) is not null as _
  from (values (1, '2026-11-05 08:00-03'), (2, '2026-11-05 09:00-03'), (3, '2026-11-05 10:00-03'), (4, '2026-11-05 11:00-03'), (5, '2026-11-05 12:00-03'),
               (6, '2026-11-05 14:00-03'), (7, '2026-11-05 15:00-03'), (8, '2026-11-05 16:00-03'), (9, '2026-11-05 17:00-03')) v (n, t);
select ok((select bool_and(pg_temp.mov('a0800000-0000-0000-0000-000000000007', current_setting('rtc.g' || n), d) like '{%')
             from (values (1, '2026-11-13 08:00-03'), (2, '2026-11-13 09:00-03'), (3, '2026-11-13 10:00-03'), (4, '2026-11-13 11:00-03')) v (n, d)),
  'SOL-10: Gus pide cuatro movimientos con A');
select ok((select bool_and(pg_temp.can('a0800000-0000-0000-0000-000000000007', current_setting('rtc.g' || n)) like '{%') from generate_series(5, 7) n), 'SOL-10: Gus pide tres cancelaciones con A');
select ok((select bool_and(pg_temp.sol('a0800000-0000-0000-0000-000000000007', 'pa', t) like '{%') from unnest(array['2026-11-13 14:00-03', '2026-11-13 15:00-03', '2026-11-13 16:00-03']) t),
  'SOL-10: Gus pide tres reservas con A (la décima pendiente se acepta)');
select is(privado.contar_pendientes(current_setting('rtc.al_07')::uuid, current_setting('rtc.pa')::uuid), 10, 'SOL-10/CA-41: contar_pendientes(Gus, A) = 10 (mezcla de reservas, movimientos y cancelaciones)');
select set_config('rtc.n_mails', (select count(*)::text from public.mail_salida where tipo = 'solicitud_nueva' and profesor_id = current_setting('rtc.pa')::uuid), true) is not null as _;
select is(pg_temp.err(pg_temp.sol('a0800000-0000-0000-0000-000000000007', 'pa', '2026-11-13 17:00-03')), 'PT429 LIMITE_EXCEDIDO', 'CA-41/SEC-10: la undécima, una reserva, da 429 LIMITE_EXCEDIDO');
select is(pg_temp.err(pg_temp.mov('a0800000-0000-0000-0000-000000000007', current_setting('rtc.g8'), '2026-11-13 12:00-03')), 'PT429 LIMITE_EXCEDIDO', 'CA-41/SEC-10: la undécima, un movimiento, da 429 LIMITE_EXCEDIDO');
select is(pg_temp.err(pg_temp.can('a0800000-0000-0000-0000-000000000007', current_setting('rtc.g9'))), 'PT429 LIMITE_EXCEDIDO', 'CA-41/SEC-10: la undécima, una cancelación, da 429 LIMITE_EXCEDIDO');
select is(pg_temp.det(pg_temp.mov('a0800000-0000-0000-0000-000000000007', current_setting('rtc.g8'), '2026-11-13 12:00-03')), '{"tope":"pendientes","limite":10}'::jsonb, 'CA-41: el 429 dice el tope y el límite');
select is(pg_temp.err(pg_temp.mov('a0800000-0000-0000-0000-000000000007', current_setting('rtc.g8'), '2026-11-13 12:30-03')), 'PT429 LIMITE_EXCEDIDO', 'SEC-10: el tope se valida antes que la grilla (429 y no FUERA_DE_GRILLA)');
select is(pg_temp.err(pg_temp.mov('a0800000-0000-0000-0000-000000000007', current_setting('rtc.g8'), '2026-11-13 12:00-03', 'siempre')), 'PT429 LIMITE_EXCEDIDO', 'SEC-10: ni antes que el alcance');
select is((select count(*)::int from public.solicitud where clase_id in (current_setting('rtc.g8')::uuid, current_setting('rtc.g9')::uuid)), 0, 'CA-41: los 429 no crearon solicitudes sobre las clases g8 y g9');
select is((select count(*)::int from public.clase where profesor_id = current_setting('rtc.pa')::uuid and inicio in ('2026-11-13 12:00-03', '2026-11-13 17:00-03')), 0, 'CA-41: los 429 no crearon clases');
select is(pg_temp.huecos('pgtap08-a', '2026-11-13', '12:00'), 'libre', 'CA-41: el hueco del movimiento rechazado sigue libre');
select is((select count(*)::text from public.mail_salida where tipo = 'solicitud_nueva' and profesor_id = current_setting('rtc.pa')::uuid), current_setting('rtc.n_mails'), 'CA-41: los 429 no encolaron avisos al profesor');
select ok(pg_temp.mov('a0800000-0000-0000-0000-000000000007', current_setting('rtc.cl_gb1'), '2026-11-13 08:00-03') like '{%', 'CA-41/SOL-10: con otro profesor (B) Gus sí puede pedir un movimiento');
select ok(privado.contar_pendientes(current_setting('rtc.al_07')::uuid, current_setting('rtc.pb')::uuid) = 1 and privado.contar_pendientes(current_setting('rtc.al_07')::uuid, current_setting('rtc.pa')::uuid) = 10,
  'CA-41/CA-60: el tope es por profesor: 1 con B, 10 con A');
select ok(pg_temp.can('a0800000-0000-0000-0000-000000000007', current_setting('rtc.cl_gb2')) like '{%', 'CA-41/SOL-10: con B también puede pedir una cancelación');
select is(pg_temp.resp('a0800000-0000-0000-0000-00000000000a', pg_temp.spend(current_setting('rtc.g5')), 'rechazar'), '{"estado": "rechazada"}', 'CA-41: A responde una de las diez');
select ok(pg_temp.can('a0800000-0000-0000-0000-000000000007', current_setting('rtc.g9')) like '{%', 'CA-41: tras responder una, la cancelación que había rechazado el tope se acepta');

-- 12. CA-63: con el profesor inactivo, mover y cancelar dan 409 y no crean nada ----------------------------------------------------
select is(pg_temp.err(pg_temp.resp('a0800000-0000-0000-0000-00000000000a', pg_temp.spend(current_setting('rtc.cl_gb2')), 'rechazar')), 'PT404 NO_ENCONTRADO', 'SEC-06/CA-55: A no responde la solicitud de Gus hecha en la agenda de B (404)');
select is(pg_temp.resp('a0800000-0000-0000-0000-00000000000b', pg_temp.spend(current_setting('rtc.cl_gb1')), 'rechazar', 'No puedo'), '{"estado": "rechazada"}', 'CA-23: B rechaza el movimiento de Gus (con su propio profesor)');
select is(pg_temp.resp('a0800000-0000-0000-0000-00000000000b', pg_temp.spend(current_setting('rtc.cl_gb2')), 'rechazar'), '{"estado": "rechazada"}', 'CA-24: B rechaza la cancelación de Gus');
select set_config('rtc.n_pb', (select count(*)::text from public.clase where profesor_id = current_setting('rtc.pb')::uuid), true) is not null as _;
select set_config('rtc.n_sol', (select count(*)::text from public.solicitud where profesor_id = current_setting('rtc.pb')::uuid), true) is not null as _;
update public.profesor set activo = false where id = current_setting('rtc.pb')::uuid;
select is(pg_temp.err(pg_temp.mov('a0800000-0000-0000-0000-000000000007', current_setting('rtc.cl_gb2'), '2026-11-13 09:00-03')), 'PT409 PROFESOR_INACTIVO', 'CA-63/DEC-35: con B inactivo mover da 409 PROFESOR_INACTIVO');
select is(pg_temp.err(pg_temp.can('a0800000-0000-0000-0000-000000000007', current_setting('rtc.cl_gb2'))), 'PT409 PROFESOR_INACTIVO', 'CA-63/DEC-35: con B inactivo cancelar da 409 PROFESOR_INACTIVO');
select is((select count(*)::text from public.clase where profesor_id = current_setting('rtc.pb')::uuid), current_setting('rtc.n_pb'), 'CA-63: no se creó ninguna clase de B');
select is((select count(*)::text from public.solicitud where profesor_id = current_setting('rtc.pb')::uuid), current_setting('rtc.n_sol'), 'CA-63: no se creó ninguna solicitud de B');
select is((select estado from public.clase where id = current_setting('rtc.cl_gb2')::uuid), 'confirmada', 'CA-63: la clase con B inactivo sigue confirmada');
update public.profesor set activo = true where id = current_setting('rtc.pb')::uuid;

-- 13. H-360 / SOL-07: una pendiente vencida de la misma clase no bloquea un pedido nuevo; H-361: fin de serie desde la primera -----
select pg_temp.usuario('a0800000-0000-0000-0000-000000000008', 'pgtap08.hugo@example.test');  -- aprobado solo con A
select pg_temp.persona('a0800000-0000-0000-0000-000000000008', 'Hugo', 'aprobado', null);
select pg_temp.reloj('2026-11-02 15:00:00+00');
select ok(pg_temp.conf('a0800000-0000-0000-0000-000000000008', 'pa', '2026-12-02 09:00-03') like '{%', 'preparación: Hugo tiene una clase con A el miércoles 02/12 09:00');
select set_config('rtc.cl_h1', pg_temp.cid('pa', '2026-12-02 09:00-03'), true) is not null as _;
select set_config('rtc.r_h1', pg_temp.mov('a0800000-0000-0000-0000-000000000008', current_setting('rtc.cl_h1'), '2026-11-06 09:00-03'), true) is not null as _;
select ok(current_setting('rtc.r_h1') like '{%', 'H-360: Hugo pide mover la clase del 02/12 a una fecha anterior (viernes 06/11 09:00)');
select set_config('rtc.res_h1', (select reserva_id::text from public.solicitud where id = (current_setting('rtc.r_h1')::jsonb ->> 'solicitud_id')::uuid), true) is not null as _;
select pg_temp.reloj('2026-11-06 13:00:00+00'); -- viernes 10:00: el destino pasó sin respuesta y la solicitud venció
select ok(pg_temp.can('a0800000-0000-0000-0000-000000000008', current_setting('rtc.cl_h1')) like '{%', 'H-360/SOL-07: con la solicitud vencida, Hugo puede avisar que no va a la clase de origen (no 500)');
select is((select estado || '/' || (respondida_en = '2026-11-06 13:00:00+00') from public.solicitud where id = (current_setting('rtc.r_h1')::jsonb ->> 'solicitud_id')::uuid),
  'anulada/true', 'H-360: la solicitud vencida queda anulada, con la hora de la anulación');
select is((select estado from public.reserva where id = current_setting('rtc.res_h1')::uuid), 'cancelada', 'H-360: la reserva destino de la vencida queda cancelada');
select is((select string_agg(estado, ',') from public.clase where reserva_id = current_setting('rtc.res_h1')::uuid), 'cancelada', 'H-360: la clase destino de la vencida queda cancelada');
select is(pg_temp.err(pg_temp.resp('a0800000-0000-0000-0000-00000000000a', current_setting('rtc.r_h1')::jsonb ->> 'solicitud_id', 'confirmar')), 'PT409 SOLICITUD_YA_RESPONDIDA',
  'H-360: responder la vieja da SOLICITUD_YA_RESPONDIDA');
select is((select tipo from public.solicitud where id = pg_temp.spend(current_setting('rtc.cl_h1'))::uuid), 'cancelacion', 'H-360: la única pendiente de la clase es la cancelación nueva');
select is((select estado from public.clase where id = current_setting('rtc.cl_h1')::uuid), 'confirmada', 'SOL-02: la clase de origen sigue confirmada');
select is(pg_temp.resp('a0800000-0000-0000-0000-00000000000a', pg_temp.spend(current_setting('rtc.cl_h1')), 'rechazar'), '{"estado": "rechazada"}', 'H-360: A responde la cancelación nueva');
select ok(pg_temp.conf('a0800000-0000-0000-0000-000000000008', 'pa', '2026-11-10 11:00-03', 'serie', 1) like '{%', 'preparación: Hugo tiene la serie semanal H2 con A desde el martes 10/11 11:00');
select set_config('rtc.res_h2', (select reserva_id::text from public.clase where id = pg_temp.cid('pa', '2026-11-10 11:00-03')::uuid), true) is not null as _;
select ok(pg_temp.can('a0800000-0000-0000-0000-000000000008', pg_temp.cid('pa', '2026-11-10 11:00-03'), 'desde_aca') like '{%', 'H-361: Hugo avisa que no va a H2 desde la primera clase, de acá en adelante');
select is(pg_temp.resp('a0800000-0000-0000-0000-00000000000a', pg_temp.spend(pg_temp.cid('pa', '2026-11-10 11:00-03')), 'confirmar'), '{"estado": "confirmada"}', 'H-361: A confirma la cancelación de la serie');
select is((select estado || '/' || (hasta = desde) from public.reserva where id = current_setting('rtc.res_h2')::uuid), 'cancelada/true', 'H-361/SOL-07: cancelada desde la primera clase, la reserva queda cancelada (hasta = desde)');
select is((select count(*) from public.clase where reserva_id = current_setting('rtc.res_h2')::uuid and estado <> 'cancelada'), 0::bigint, 'H-361: ninguna clase de la serie queda activa');
select ok(pg_temp.conf('a0800000-0000-0000-0000-000000000008', 'pa', '2026-11-12 11:00-03', 'serie', 1) like '{%', 'preparación: Hugo tiene la serie semanal H3 con A desde el jueves 12/11 11:00');
select set_config('rtc.res_h3', (select reserva_id::text from public.clase where id = pg_temp.cid('pa', '2026-11-12 11:00-03')::uuid), true) is not null as _;
select ok(pg_temp.mov('a0800000-0000-0000-0000-000000000008', pg_temp.cid('pa', '2026-11-12 11:00-03'), '2026-11-13 17:00-03', 'desde_aca') like '{%', 'H-361: Hugo pide mover H3 desde la primera clase al viernes 13/11 17:00');
select is(pg_temp.resp('a0800000-0000-0000-0000-00000000000a', pg_temp.spend(pg_temp.cid('pa', '2026-11-12 11:00-03')), 'confirmar'), '{"estado": "confirmada"}', 'H-361: A confirma el movimiento de la serie');
select is((select estado || '/' || (hasta = desde) from public.reserva where id = current_setting('rtc.res_h3')::uuid), 'confirmada/true', 'H-361: movida desde la primera clase, la reserva conserva su estado (como mover_clase)');

select * from finish();
rollback;
