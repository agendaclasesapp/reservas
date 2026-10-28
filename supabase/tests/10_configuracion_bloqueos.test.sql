-- B10 · T10.3 · Configuración de la agenda y bloqueos (`guardar_configuracion`, `bloquear`, `desbloquear`) con dos profesores.
-- IDs: AGE-03, AGE-04, AGE-05, AGE-06, AGE-10, PRF-04, SEC-06, SEC-09, H-015, H-140.
-- CA-12 (T-AGE-04), CA-13 (T-AGE-09), CA-14 (T-AGE-10, T-AGE-11), CA-52 (desbloquear ajeno), CA-54 (un bloqueo de A no cambia la agenda de B).
-- Reloj fijo: lunes 2026-11-02 12:00 de Montevideo (15:00Z); la profesora B trabaja en Europe/Madrid. Datos sintéticos (@example.test); rollback al final.
-- Extremo de H-015 (pregunta abierta al Arquitecto): la semántica actual es p_hasta <= 00:00 de (hoy + 367) en el huso del profesor.
-- Si se decide incluir el día completo, cambia solo pg_temp.extremo_a() y pg_temp.extremo_b() (y la sección 3).
begin;
select plan(103);

-- Ayudas -------------------------------------------------------------------------------------------------------------------
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
create function pg_temp.cod(p text) returns text language sql as $f$ select case when p like 'ERR|%' then split_part(p, '|', 2) else 'OK' end $f$;
create function pg_temp.det(p text) returns jsonb language sql as $f$ select nullif(split_part(p, '|', 4), '')::jsonb $f$;
create function pg_temp.usuario(p_id uuid, p_mail text) returns void language sql as $f$
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_mail, now(), now(), now(), '', '', '', '', '{}')
$f$;
create function pg_temp.ua() returns uuid language sql as $f$ select 'a1000000-0000-0000-0000-00000000000a'::uuid $f$;
create function pg_temp.ub() returns uuid language sql as $f$ select 'a1000000-0000-0000-0000-00000000000b'::uuid $f$;
create function pg_temp.uana() returns uuid language sql as $f$ select 'a1000000-0000-0000-0000-000000000001'::uuid $f$;
create function pg_temp.uadm() returns uuid language sql as $f$ select 'a1000000-0000-0000-0000-00000000000d'::uuid $f$;
create function pg_temp.k(p text) returns text language sql as $f$ select current_setting('rtc.' || p) $f$;
create function pg_temp.reloj(p text) returns void language sql as $f$ update privado.reloj_prueba set ahora = p::timestamptz $f$;
-- Extremo de H-015 (constante fácil de cambiar): 00:00 de hoy + 367 días en el huso del profesor (hoy = 2026-11-02 -> 2027-11-04; H-394).
create function pg_temp.extremo_a() returns text language sql as $f$ select '2027-11-04 00:00-03' $f$;
create function pg_temp.extremo_b() returns text language sql as $f$ select '2027-11-04 00:00+01' $f$;
-- Persona con cuenta, ficha completa, mail y aprobada con A (y con B si p_con_b).
create function pg_temp.persona(p_user uuid, p_nombre text, p_mail text, p_con_a boolean, p_con_b boolean) returns void language plpgsql as $f$
declare v_id uuid;
begin
  update public.alumno set estado = 'completa', nombre = p_nombre, telefono = '099 700 700', fecha_nacimiento = '1990-01-01', mail = p_mail,
         ficha_completada_en = '2026-01-01', ficha_origen_profesor_id = current_setting('rtc.pa')::uuid
   where user_id = p_user returning id into v_id;
  perform set_config('rtc.al_' || right(p_user::text, 2), v_id::text, true);
  if p_con_a then
    insert into public.inscripcion (alumno_id, profesor_id, estado, aprobado_en) values (v_id, current_setting('rtc.pa')::uuid, 'aprobado', public.app_ahora());
  end if;
  if p_con_b then
    insert into public.inscripcion (alumno_id, profesor_id, estado, aprobado_en) values (v_id, current_setting('rtc.pb')::uuid, 'aprobado', public.app_ahora());
  end if;
end;
$f$;
-- Atajos de las RPC.
create function pg_temp.bloquear(p_sub uuid, p_desde text, p_hasta text, p_motivo text default null) returns text language sql as $f$
  select pg_temp.q(p_sub, format('select public.bloquear(%L::timestamptz, %L::timestamptz, %L)::text', p_desde, p_hasta, p_motivo)) $f$;
create function pg_temp.desbloquear(p_sub uuid, p_id text) returns text language sql as $f$
  select pg_temp.q(p_sub, format('select public.desbloquear(%L::uuid)::text', p_id)) $f$;
create function pg_temp.config(p_sub uuid, p_dur int, p_ant int, p_zona text) returns text language sql as $f$
  select pg_temp.q(p_sub, format('select public.guardar_configuracion(%L::int, %L::int, %L)::text', p_dur, p_ant, p_zona)) $f$;
create function pg_temp.crear(p_sub uuid, p_alumno text, p_inicio text) returns text language sql as $f$
  select pg_temp.q(p_sub, format('select public.crear_clase(%L::uuid, null, %L::timestamptz, ''suelta'', null, null)::text', p_alumno, p_inicio)) $f$;
create function pg_temp.pedir(p_sub uuid, p_inicio text) returns text language sql as $f$
  select pg_temp.q(p_sub, format('select public.solicitar_reserva(%L::uuid, %L::timestamptz, ''suelta'', null, null, null)::text', current_setting('rtc.pa'), p_inicio)) $f$;
create function pg_temp.n_bloqueos(p_k text) returns int language sql as $f$
  select count(*)::int from public.bloqueo where profesor_id = current_setting('rtc.' || p_k)::uuid $f$;
-- Códigos de las dos RPC de bloqueo con argumentos válidos (id inexistente en desbloquear), separados por coma.
create function pg_temp.dos(p_sub uuid, p_rol text) returns text language sql as $f$
  select string_agg(pg_temp.cod(pg_temp.q(p_sub, s, p_rol)), ',' order by n) from (values
    (1, $$select public.bloquear('2026-12-01 10:00-03'::timestamptz, '2026-12-01 11:00-03'::timestamptz, null)::text$$),
    (2, $$select public.desbloquear('00000000-0000-0000-0000-00000000dead'::uuid)::text$$)) as t (n, s) $f$;

-- Preparación: dos profesores (B en Madrid), el Administrador y tres personas con cuenta ---------------------------------------
select pg_temp.reloj('2026-11-02 15:00:00+00');
select set_config('rtc.pa', privado.configurar_profesor('pgtap10.profa@example.test', 'Profe A', 'pgtap10-a')::text, true) is not null as _;
select set_config('rtc.pb', privado.configurar_profesor('pgtap10.profb@example.test', 'Profe B', 'pgtap10-b')::text, true) is not null as _;
update public.profesor set zona_horaria = 'Europe/Madrid' where id = current_setting('rtc.pb')::uuid;
select privado.configurar_administrador('pgtap10.admin@example.test');
select pg_temp.usuario(pg_temp.ua(), 'pgtap10.profa@example.test');
select pg_temp.usuario(pg_temp.ub(), 'pgtap10.profb@example.test');
select pg_temp.usuario(pg_temp.uadm(), 'pgtap10.admin@example.test');
select pg_temp.usuario(pg_temp.uana(), 'pgtap10.ana@example.test');
select pg_temp.usuario('a1000000-0000-0000-0000-000000000002', 'pgtap10.bea@example.test');
select pg_temp.usuario('a1000000-0000-0000-0000-000000000003', 'pgtap10.cora@example.test');
select pg_temp.persona(pg_temp.uana(), 'Ana', 'pgtap10.ana@example.test', true, false);
select pg_temp.persona('a1000000-0000-0000-0000-000000000002', 'Bea', 'pgtap10.bea@example.test', false, true);
select pg_temp.persona('a1000000-0000-0000-0000-000000000003', 'Cora', 'pgtap10.cora@example.test', true, false);
-- Datos de A: clase confirmada de Ana el lunes 09/11 09:00 (la crea el profesor) y solicitud de reserva pendiente de Ana el 09/11 15:00.
select is(pg_temp.err(pg_temp.crear(pg_temp.ua(), pg_temp.k('al_01'), '2026-11-09 09:00-03')), 'OK', 'preparación: clase confirmada de Ana el 09/11 09:00');
select ok(pg_temp.pedir(pg_temp.uana(), '2026-11-09 15:00-03') like '{%', 'preparación: solicitud pendiente de Ana el 09/11 15:00');
-- B tiene su propia clase confirmada en el mismo instante que la de A (en Madrid, 09:00 del 09/11).
select is(pg_temp.err(pg_temp.q(pg_temp.ub(), format($$select public.crear_clase(%L::uuid, null, '2026-11-09 09:00+01'::timestamptz, 'suelta', null, null)::text$$, pg_temp.k('al_02')))),
  'OK', 'preparación: clase confirmada de Bea con B el 09/11 09:00 de Madrid');

-- 1. SEC-06: roles ---------------------------------------------------------------------------------------------------------------
select is(pg_temp.dos(null, 'anon'), '42501,42501', 'SEC-06: anon no ejecuta bloquear ni desbloquear (42501)');
select is(pg_temp.dos(pg_temp.uana(), 'authenticated'), 'PT403,PT403', 'SEC-06/T-AGE-12: la persona recibe 403 en bloquear y desbloquear');
select is(pg_temp.dos(pg_temp.uadm(), 'authenticated'), 'PT403,PT403', 'SEC-06: el Administrador que no es profesor recibe 403');
select is(pg_temp.dos(null, 'authenticated'), 'PT401,PT401', 'SEC-06: un JWT sin sub recibe 401');
select is(pg_temp.dos(pg_temp.ua(), 'authenticated'), 'OK,PT404', 'SEC-06: el profesor A bloquea (OK) y desbloquear un id inexistente da 404');
select is(pg_temp.n_bloqueos('pa'), 1, 'SEC-06: solo el bloqueo del profesor A quedó escrito');
select is(pg_temp.n_bloqueos('pb'), 0, 'SEC-06: y ninguno de B');
delete from public.bloqueo where profesor_id = current_setting('rtc.pa')::uuid;
select is(pg_temp.err(pg_temp.bloquear(pg_temp.uana(), '2026-12-01 10:00-03', '2026-12-01 11:00-03')), 'PT403 PROHIBIDO', 'T-AGE-12/CA-14: Ana intenta bloquear y recibe 403');
select is(pg_temp.n_bloqueos('pa'), 0, 'T-AGE-12: el rechazo por rol no creó ningún bloqueo');

-- 2. T-AGE-10 (CA-14): conflictos con clases y solicitudes, 409 con detalle -----------------------------------------------------------
select is(pg_temp.err(pg_temp.bloquear(pg_temp.ua(), '2026-11-09 08:00-03', '2026-11-09 10:00-03')), 'PT409 BLOQUEO_CON_RESERVAS', 'T-AGE-10: bloquear un rango que cubre la clase confirmada da 409');
select is(pg_temp.det(pg_temp.bloquear(pg_temp.ua(), '2026-11-09 08:00-03', '2026-11-09 10:00-03')) -> 0 ->> 'estado', 'confirmada', 'T-AGE-10: el detalle indica que es una clase confirmada');
select is(pg_temp.det(pg_temp.bloquear(pg_temp.ua(), '2026-11-09 08:00-03', '2026-11-09 10:00-03')) -> 0 ->> 'clase_id',
  (select id::text from public.clase where alumno_id = pg_temp.k('al_01')::uuid and estado = 'confirmada'), 'T-AGE-10: el detalle trae el clase_id de la clase');
select is(pg_temp.det(pg_temp.bloquear(pg_temp.ua(), '2026-11-09 08:00-03', '2026-11-09 10:00-03')) -> 0 ->> 'alumno', 'Ana', 'T-AGE-10: el detalle nombra a quien toma la clase');
select is(pg_temp.det(pg_temp.bloquear(pg_temp.ua(), '2026-11-09 08:00-03', '2026-11-09 10:00-03')) -> 0 ->> 'inicio' is not null, true, 'T-AGE-10: el detalle trae el inicio');
select is(pg_temp.err(pg_temp.bloquear(pg_temp.ua(), '2026-11-09 14:00-03', '2026-11-09 16:00-03')), 'PT409 BLOQUEO_CON_RESERVAS', 'T-AGE-10: bloquear un rango que cubre la solicitud pendiente da 409');
select is(pg_temp.det(pg_temp.bloquear(pg_temp.ua(), '2026-11-09 14:00-03', '2026-11-09 16:00-03')) -> 0 ->> 'estado', 'pendiente', 'T-AGE-10: el detalle indica que es una solicitud pendiente');
select is(jsonb_array_length(pg_temp.det(pg_temp.bloquear(pg_temp.ua(), '2026-11-09 08:00-03', '2026-11-09 18:00-03'))), 2, 'T-AGE-10: un rango que cubre las dos lista las dos');
select is(pg_temp.det(pg_temp.bloquear(pg_temp.ua(), '2026-11-09 08:00-03', '2026-11-09 18:00-03')) -> 0 ->> 'estado' || ',' ||
          (pg_temp.det(pg_temp.bloquear(pg_temp.ua(), '2026-11-09 08:00-03', '2026-11-09 18:00-03')) -> 1 ->> 'estado'), 'confirmada,pendiente', 'T-AGE-10: el detalle va ordenado por inicio');
select is(pg_temp.n_bloqueos('pa'), 0, 'T-AGE-10: ningún 409 dejó un bloqueo creado');
select is(pg_temp.err(pg_temp.bloquear(pg_temp.ua(), '2026-11-09 09:30-03', '2026-11-09 09:45-03')), 'PT409 BLOQUEO_CON_RESERVAS', 'T-AGE-10: un rango que cae dentro de la clase también la solapa');
select is(pg_temp.err(pg_temp.bloquear(pg_temp.ua(), '2026-11-09 10:00-03', '2026-11-09 11:00-03')), 'OK', 'CA-14: el borde no es conflicto: la clase termina a las 10:00 y el bloqueo empieza a las 10:00');
select is(pg_temp.err(pg_temp.bloquear(pg_temp.ua(), '2026-11-09 08:00-03', '2026-11-09 09:00-03')), 'OK', 'CA-14: el otro borde tampoco: el bloqueo termina a las 09:00 cuando la clase empieza');
delete from public.bloqueo where profesor_id = current_setting('rtc.pa')::uuid;
-- B no tiene conflicto con lo de A: la clase de B es la suya.
select is(pg_temp.det(pg_temp.bloquear(pg_temp.ub(), '2026-11-09 09:00+01', '2026-11-09 10:00+01')) -> 0 ->> 'alumno', 'Bea', 'CA-54: B recibe el 409 con su clase (Bea), no con la de A');
select is(pg_temp.err(pg_temp.bloquear(pg_temp.ub(), '2026-11-09 09:00-03', '2026-11-09 10:00-03')), 'OK', 'CA-54: B bloquea el mismo instante de la clase de A (09:00 de Montevideo) sin conflicto: la agenda de A no es la suya');
select is(pg_temp.n_bloqueos('pb'), 1, 'CA-54: B tiene su bloqueo');
delete from public.bloqueo where profesor_id = current_setting('rtc.pb')::uuid;
-- Una clase cancelada o rechazada no es conflicto.
update public.clase set estado = 'cancelada' where alumno_id = pg_temp.k('al_01')::uuid and inicio = '2026-11-09 09:00-03';
select is(pg_temp.err(pg_temp.bloquear(pg_temp.ua(), '2026-11-09 08:00-03', '2026-11-09 10:00-03')), 'OK', 'CA-14: una clase cancelada no impide bloquear');
delete from public.bloqueo where profesor_id = current_setting('rtc.pa')::uuid;
update public.clase set estado = 'confirmada' where alumno_id = pg_temp.k('al_01')::uuid and inicio = '2026-11-09 09:00-03';

-- 3. SEC-09 / H-015: topes de p_hasta y del rango ---------------------------------------------------------------------------------
select is(pg_temp.err(pg_temp.bloquear(pg_temp.ua(), '2027-01-01 00:00-03', pg_temp.extremo_a())), 'OK', 'H-015/SEC-09: p_hasta = 00:00 de hoy + 367 pasa');
select is(pg_temp.err(pg_temp.bloquear(pg_temp.ua(), '2027-01-01 00:00-03', '2027-11-04 00:00:01-03')), 'PT422 DATOS_INVALIDOS', 'H-015/SEC-09: un segundo más da 422');
select is(pg_temp.det(pg_temp.bloquear(pg_temp.ua(), '2027-01-01 00:00-03', '2027-11-05 00:00-03')) ->> 'campo', 'p_hasta', 'H-015/SEC-09: un día más da 422 con campo p_hasta');
select is(pg_temp.err(pg_temp.bloquear(pg_temp.ua(), '2027-01-01 00:00-03', '2027-11-05 00:00-03')), 'PT422 DATOS_INVALIDOS', 'H-015/SEC-09: un día más da 422 DATOS_INVALIDOS');
select is(pg_temp.n_bloqueos('pa'), 1, 'H-015: solo el bloqueo del extremo quedó escrito');
delete from public.bloqueo where profesor_id = current_setting('rtc.pa')::uuid;
-- El extremo depende del huso del profesor: B (Madrid) tiene el suyo a las 00:00+01.
select is(pg_temp.err(pg_temp.bloquear(pg_temp.ub(), '2027-01-01 00:00+01', pg_temp.extremo_b())), 'OK', 'H-015: B (Madrid) llega a las 00:00 de hoy + 367 de su huso');
select is(pg_temp.err(pg_temp.bloquear(pg_temp.ub(), '2027-01-01 00:00+01', '2027-11-04 00:00:01+01')), 'PT422 DATOS_INVALIDOS', 'H-015: B pasa del extremo con un segundo más');
select is(pg_temp.det(pg_temp.bloquear(pg_temp.ub(), '2027-01-01 00:00+01', '2027-11-05 00:00+01')) ->> 'campo', 'p_hasta', 'H-015: B, un día más da 422 con campo p_hasta');
delete from public.bloqueo where profesor_id = current_setting('rtc.pb')::uuid;
-- Rango de 366 días: pasa; de más, 422 p_hasta (aunque p_hasta no pase del extremo).
create temp table sv as select id, estado from public.clase where profesor_id = current_setting('rtc.pa')::uuid;
update public.clase set estado = 'cancelada' where id in (select id from sv);   -- para que el rango largo no tenga conflictos
select is(pg_temp.err(pg_temp.bloquear(pg_temp.ua(), '2026-11-02 00:00-03', '2027-11-03 00:00-03')), 'OK', 'SEC-09: un rango de exactamente 366 días pasa');
delete from public.bloqueo where profesor_id = current_setting('rtc.pa')::uuid;
update public.clase c set estado = sv.estado from sv where c.id = sv.id;
select is(pg_temp.err(pg_temp.bloquear(pg_temp.ua(), '2026-11-01 23:59:59-03', '2027-11-03 00:00-03')), 'PT422 DATOS_INVALIDOS', 'SEC-09: un rango de 366 días y un segundo da 422');
select is(pg_temp.det(pg_temp.bloquear(pg_temp.ua(), '2026-11-01 00:00-03', '2027-11-03 00:00-03')) ->> 'campo', 'p_hasta', 'SEC-09: un rango de 367 días da 422 con campo p_hasta');
select is(pg_temp.det(pg_temp.bloquear(pg_temp.ua(), '2026-10-01 00:00-03', '2027-11-03 00:00-03')) ->> 'campo', 'p_hasta', 'SEC-09: un rango de más de un año da 422 con campo p_hasta');
select is(pg_temp.det(pg_temp.bloquear(pg_temp.ua(), '2026-12-01 10:00-03', '2026-12-01 10:00-03')) ->> 'campo', 'p_hasta', 'SEC-09: p_hasta igual a p_desde da 422 p_hasta');
select is(pg_temp.det(pg_temp.bloquear(pg_temp.ua(), '2026-12-01 10:00-03', '2026-12-01 09:00-03')) ->> 'campo', 'p_hasta', 'SEC-09: p_hasta anterior a p_desde da 422 p_hasta');
select is(pg_temp.det(pg_temp.bloquear(pg_temp.ua(), '2026-12-01 10:00-03', null)) ->> 'campo', 'p_hasta', 'SEC-09: p_hasta nulo da 422 p_hasta');
select is(pg_temp.det(pg_temp.bloquear(pg_temp.ua(), null, '2026-12-01 10:00-03')) ->> 'campo', 'p_desde', 'SEC-09: p_desde nulo da 422 p_desde');
select is(pg_temp.err(pg_temp.bloquear(pg_temp.ua(), '2025-11-01 00:00-03', '2025-11-02 00:00-03')), 'OK', 'H-394/SEC-09: p_desde = 00:00 de hoy - 366 pasa');
delete from public.bloqueo where profesor_id = current_setting('rtc.pa')::uuid;
select is(pg_temp.det(pg_temp.bloquear(pg_temp.ua(), '2025-10-31 23:59:59-03', '2025-11-02 00:00-03')) ->> 'campo', 'p_desde', 'H-394/SEC-09: un segundo antes da 422 con campo p_desde');
select is(pg_temp.det(pg_temp.bloquear(pg_temp.ua(), '2026-12-01 10:00-03', '2026-12-01 11:00-03', repeat('x', 501))) ->> 'campo', 'motivo', 'H-394/SEC-09: un motivo de 501 caracteres da 422 con campo motivo');
select is(pg_temp.err(pg_temp.bloquear(pg_temp.ua(), '2026-12-01 10:00-03', '2026-12-01 11:00-03', repeat('x', 500))), 'OK', 'SEC-09: un motivo de 500 caracteres pasa');
select is(pg_temp.n_bloqueos('pa'), 1, 'SEC-09: ningún 422 dejó un bloqueo, solo el de 500 caracteres');
delete from public.bloqueo where profesor_id = current_setting('rtc.pa')::uuid;

-- 4. T-AGE-11 (CA-14): bloquear, ver bloqueado, quitar y volver a libre; desbloquear ajeno = 404 (CA-52) -----------------------------
select set_config('rtc.bq', (pg_temp.bloquear(pg_temp.ua(), '2026-11-16 10:00-03', '2026-11-16 12:00-03', 'Médico')::jsonb ->> 'bloqueo_id'), true) is not null as _;
select is((select estado from public.agenda_publica('pgtap10-a', '2026-11-16') where inicio = '2026-11-16 10:00-03'), 'bloqueado', 'T-AGE-11: el hueco de las 10:00 figura bloqueado en la vista pública');
select is((select estado from public.agenda_publica('pgtap10-a', '2026-11-16') where inicio = '2026-11-16 11:00-03'), 'bloqueado', 'T-AGE-11: el de las 11:00 también');
select is((select estado from public.agenda_publica('pgtap10-a', '2026-11-16') where inicio = '2026-11-16 12:00-03'), 'libre', 'T-AGE-11: el de las 12:00 sigue libre');
select is(pg_temp.q(pg_temp.ua(), $$select bloqueo_motivo from public.agenda_profesor('2026-11-16') where estado = 'bloqueado' limit 1$$), 'Médico', 'AGE-05: el profesor ve el motivo en su agenda');
select is(pg_temp.q(pg_temp.ub(), $$select count(*) from public.agenda_profesor('2026-11-16') where estado = 'bloqueado'$$), '0', 'CA-54: B no ve el bloqueo de A en su agenda');
select is(pg_temp.q(pg_temp.ub(), format($$select count(*) from public.bloqueo where id = %L::uuid$$, pg_temp.k('bq'))), '0', 'CA-52: B no ve el bloqueo de A en la tabla (RLS)');
select is((select count(*)::int from public.agenda_publica('pgtap10-b', '2026-11-16') where estado = 'bloqueado'), 0, 'CA-54: un bloqueo de A no cambia los huecos de B (agenda pública de B sin bloqueados)');
select is((select count(*)::int from public.agenda_publica('pgtap10-b', '2026-11-16') where estado = 'libre'), 9, 'CA-54: B conserva sus 9 huecos libres');
select is(pg_temp.err(pg_temp.desbloquear(pg_temp.ub(), pg_temp.k('bq'))), 'PT404 NO_ENCONTRADO', 'CA-52: B desbloquea el bloqueo de A y recibe 404');
select is(pg_temp.n_bloqueos('pa'), 1, 'CA-52: el bloqueo de A sigue');
select is(pg_temp.err(pg_temp.desbloquear(pg_temp.ub(), '00000000-0000-0000-0000-00000000dead')), 'PT404 NO_ENCONTRADO', 'CA-52: el 404 es el mismo que el de un id inexistente');
select is(pg_temp.err(pg_temp.desbloquear(pg_temp.ua(), null)), 'PT404 NO_ENCONTRADO', 'SEC-06: desbloquear con id nulo da 404');
select is(pg_temp.err(pg_temp.desbloquear(pg_temp.uana(), pg_temp.k('bq'))), 'PT403 PROHIBIDO', 'SEC-06: la persona no desbloquea (403)');
select is(pg_temp.n_bloqueos('pa'), 1, 'SEC-06: el bloqueo sigue tras los rechazos');
select is(pg_temp.err(pg_temp.desbloquear(pg_temp.ua(), pg_temp.k('bq'))), 'OK', 'CA-14/AGE-06: A quita su bloqueo');
select is((select estado from public.agenda_publica('pgtap10-a', '2026-11-16') where inicio = '2026-11-16 10:00-03'), 'libre', 'T-AGE-11: al quitar el bloqueo el hueco vuelve a libre');
select is(pg_temp.err(pg_temp.desbloquear(pg_temp.ua(), pg_temp.k('bq'))), 'PT404 NO_ENCONTRADO', 'AGE-06: quitar dos veces el mismo bloqueo da 404 la segunda');
-- A y B pueden bloquear el mismo instante sin pisarse.
select is(pg_temp.err(pg_temp.bloquear(pg_temp.ua(), '2026-11-16 10:00-03', '2026-11-16 12:00-03')) || '/' || pg_temp.err(pg_temp.bloquear(pg_temp.ub(), '2026-11-16 10:00-03', '2026-11-16 12:00-03')), 'OK/OK',
  'CA-54: A y B bloquean el mismo instante sin conflicto');
delete from public.bloqueo where profesor_id in (current_setting('rtc.pa')::uuid, current_setting('rtc.pb')::uuid);

-- 5. CA-12 (T-AGE-04): cambiar la duración no mueve clases ni solicitudes -------------------------------------------------------------
select set_config('rtc.antes_a', (select string_agg(c.inicio::text || '>' || c.fin::text || ':' || c.estado || ':' || r.duracion_min, ',' order by c.inicio)
                                    from public.clase c join public.reserva r on r.id = c.reserva_id where c.profesor_id = current_setting('rtc.pa')::uuid), true) is not null as _;
select is(pg_temp.err(pg_temp.config(pg_temp.ua(), 90, 24, 'America/Montevideo')), 'OK', 'T-AGE-04/AGE-03: A cambia la duración a 90 minutos');
select is((select string_agg(c.inicio::text || '>' || c.fin::text || ':' || c.estado || ':' || r.duracion_min, ',' order by c.inicio)
             from public.clase c join public.reserva r on r.id = c.reserva_id where c.profesor_id = current_setting('rtc.pa')::uuid), pg_temp.k('antes_a'),
  'CA-12: la clase confirmada y la solicitud pendiente conservan inicio, fin, estado y duración de la reserva');
select is((select count(*)::int from public.solicitud where profesor_id = current_setting('rtc.pa')::uuid and estado = 'pendiente'), 1, 'CA-12: la solicitud sigue pendiente');
select is((select count(*)::int from privado.huecos_del_dia(pg_temp.k('pa')::uuid, '2026-11-16')), 5, 'CA-12: los huecos libres se regeneran con 90 minutos (3 de mañana y 2 de tarde)');
select is((select min(fin - inicio) from privado.huecos_del_dia(pg_temp.k('pa')::uuid, '2026-11-16')), interval '90 minutes', 'CA-12: cada hueco nuevo dura 90 minutos');
select is((select duracion_min || '|' || anticipacion_horas || '|' || zona_horaria from public.profesor where id = current_setting('rtc.pb')::uuid), '60|24|Europe/Madrid', 'CA-54: la configuración de B no cambió');
select is(pg_temp.err(pg_temp.config(pg_temp.uana(), 30, 24, 'America/Montevideo')), 'PT403 PROHIBIDO', 'T-AGE-05/CA-12: Ana intenta cambiar la duración y recibe 403');
select is((select duracion_min from public.profesor where id = current_setting('rtc.pa')::uuid), 90, 'T-AGE-05: la duración sigue como estaba');
select is(pg_temp.err(pg_temp.config(null, 30, 24, 'America/Montevideo')), 'PT401 NO_AUTENTICADO', 'SEC-06: un JWT sin sub recibe 401 en guardar_configuracion');
select is(pg_temp.err(pg_temp.config(pg_temp.ua(), 60, 24, 'America/Montevideo')), 'OK', 'CA-12: A vuelve a 60 minutos');
-- H-140: tope de la anticipación.
select is(pg_temp.err(pg_temp.config(pg_temp.ua(), 60, 8784, 'America/Montevideo')), 'OK', 'H-140/SEC-09: anticipación de 8784 horas pasa');
select is(pg_temp.det(pg_temp.config(pg_temp.ua(), 60, 8785, 'America/Montevideo')) ->> 'campo', 'p_anticipacion_horas', 'H-140/SEC-09: 8785 horas da 422 con campo p_anticipacion_horas');
select is(pg_temp.det(pg_temp.config(pg_temp.ua(), 60, -1, 'America/Montevideo')) ->> 'campo', 'p_anticipacion_horas', 'SEC-09: anticipación negativa da 422');
select is(pg_temp.err(pg_temp.config(pg_temp.ua(), 60, 0, 'America/Montevideo')), 'OK', 'AGE-04: anticipación 0 pasa');
select is(pg_temp.det(pg_temp.config(pg_temp.ua(), 0, 24, 'America/Montevideo')) ->> 'campo', 'p_duracion_min', 'SEC-09: duración 0 da 422 con campo p_duracion_min');
select is((select anticipacion_horas from public.profesor where id = current_setting('rtc.pa')::uuid), 0, 'H-140: los 422 no cambiaron la anticipación guardada');
select is(pg_temp.err(pg_temp.config(pg_temp.ua(), 60, 24, 'America/Montevideo')), 'OK', 'AGE-04: A restaura la anticipación de 24 horas');

-- 6. CA-13 (T-AGE-09): la anticipación limita al alumno y no al profesor ------------------------------------------------------------------
-- Domingo 08/11 12:00 de Montevideo: el hueco libre del lunes 09/11 08:00 queda a +20 h (anticipación 24 h).
select pg_temp.reloj('2026-11-08 15:00:00+00');
select is(pg_temp.err(pg_temp.pedir(pg_temp.uana(), '2026-11-09 08:00-03')), 'PT422 ANTICIPACION_INSUFICIENTE', 'T-AGE-09/CA-13: el alumno no puede reservar a +20 h con anticipación de 24 h');
select is((select count(*)::int from public.solicitud where alumno_id = pg_temp.k('al_01')::uuid and fecha_clase = '2026-11-09 08:00-03'), 0, 'CA-13: el rechazo no creó solicitud');
select is(pg_temp.err(pg_temp.crear(pg_temp.ua(), pg_temp.k('al_03'), '2026-11-09 08:00-03')), 'OK', 'T-AGE-09/PRF-04/CA-13: el profesor crea la clase a +20 h');
select is((select estado from public.clase where alumno_id = pg_temp.k('al_03')::uuid and inicio = '2026-11-09 08:00-03'), 'confirmada', 'T-AGE-09: la clase queda confirmada');
select is(pg_temp.err(pg_temp.pedir(pg_temp.uana(), '2026-11-09 11:00-03')), 'PT422 ANTICIPACION_INSUFICIENTE', 'CA-13: el alumno tampoco a +23 h');
select is(pg_temp.err(pg_temp.pedir(pg_temp.uana(), '2026-11-09 12:00-03')), 'OK', 'CA-13: el límite exacto (+24 h) se acepta para el alumno');
-- Bajar la anticipación a 12 h deja al alumno reservar a +20 h; subirla a 48 h se lo impide a +30 h.
select is(pg_temp.err(pg_temp.config(pg_temp.ua(), 60, 12, 'America/Montevideo')), 'OK', 'AGE-04: A baja la anticipación a 12 horas');
select is(pg_temp.err(pg_temp.pedir(pg_temp.uana(), '2026-11-09 10:00-03')), 'OK', 'CA-13: con 12 h el alumno reserva a +22 h');
select is(pg_temp.err(pg_temp.config(pg_temp.ua(), 60, 48, 'America/Montevideo')), 'OK', 'AGE-04: A sube la anticipación a 48 horas');
select is(pg_temp.err(pg_temp.pedir(pg_temp.uana(), '2026-11-09 17:00-03')), 'PT422 ANTICIPACION_INSUFICIENTE', 'CA-13: con 48 h el alumno no reserva a +29 h');

-- 7. H-393 / ADR-022: una serie conserva el huso con que se creó, aunque el profesor lo cambie ---------------------------------------------
select pg_temp.reloj('2026-11-02 15:00:00+00');
select is(pg_temp.err(pg_temp.q(pg_temp.ua(), format($$select public.crear_clase(%L::uuid, null, '2026-11-03 10:00-03'::timestamptz, 'serie', 1, null)::text$$, pg_temp.k('al_01')))),
  'OK', 'H-393: A crea una serie semanal de martes 10:00 de Montevideo para Ana');
select set_config('rtc.n_ana', (select count(*)::text from public.clase where alumno_id = pg_temp.k('al_01')::uuid and inicio >= '2026-11-03' and estado = 'confirmada' and extract(isodow from inicio at time zone 'America/Montevideo') = 2), true) is not null as _;
select is(pg_temp.err(pg_temp.config(pg_temp.ua(), 60, 24, 'Europe/Madrid')), 'OK', 'H-393/DEC-08: A cambia su huso a Europe/Madrid');
select pg_temp.reloj('2026-11-09 15:00:00+00');
select ok(privado.extender_series(public.app_ahora() + interval '120 days') > 0, 'H-393: extender_series agrega fechas a la serie de Ana');
select ok((select count(*) from public.clase where alumno_id = pg_temp.k('al_01')::uuid and estado = 'confirmada' and extract(isodow from inicio at time zone 'America/Montevideo') = 2) > pg_temp.k('n_ana')::int,
  'H-393: la serie de Ana tiene fechas nuevas');
select is((select string_agg(distinct to_char(inicio at time zone 'America/Montevideo', 'Dy HH24:MI'), ',') from public.clase
            where alumno_id = pg_temp.k('al_01')::uuid and estado = 'confirmada' and reserva_id in (select id from public.reserva where tipo = 'serie' and alumno_id = pg_temp.k('al_01')::uuid)),
  'Tue 10:00', 'H-393/DEC-08: todas las clases de la serie, también las nuevas, son martes 10:00 de Montevideo');
select is(pg_temp.err(pg_temp.q(pg_temp.ua(), format($$select public.crear_clase(%L::uuid, null, '2026-11-17 10:00+01'::timestamptz, 'serie', 1, null)::text$$, pg_temp.k('al_03')))),
  'OK', 'H-393: después del cambio, A crea una serie de martes 10:00 de Madrid para Cora');
select ok(privado.extender_series(public.app_ahora() + interval '200 days') >= 0, 'H-393: extender_series corre también con la serie nueva');
select is((select string_agg(distinct to_char(inicio at time zone 'Europe/Madrid', 'Dy HH24:MI'), ',') from public.clase
            where alumno_id = pg_temp.k('al_03')::uuid and estado = 'confirmada' and inicio >= '2026-11-10' and reserva_id in (select id from public.reserva where tipo = 'serie' and alumno_id = pg_temp.k('al_03')::uuid)),
  'Tue 10:00', 'H-393: la serie creada después del cambio queda a las 10:00 de Madrid');

select * from finish();
rollback;
