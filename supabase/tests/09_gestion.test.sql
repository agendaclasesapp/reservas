-- B09 · T09.3 · Gestión directa del profesor (`crear_clase`, `mover_clase`, `cancelar_clase`) y panel (`agenda_profesor`, `contadores`) con dos profesores.
-- IDs: PRF-01..PRF-05, PRF-07, PRF-08, AVI-01, AVI-04, SEC-06, SEC-09, SEC-28, DEC-32.
-- CA-21 (contador), CA-27, CA-28, CA-30 (rama profesor), CA-52 (rama panel), CA-55, CA-63 (lado del profesor). Casos: T-SOL-02, T-AVI-02, T-AVI-04.
-- Reloj fijo: lunes 2026-11-02 12:00 de Montevideo (15:00Z); la profesora B trabaja en Europe/Madrid. Datos sintéticos (@example.test); rollback al final.
begin;
select plan(104);

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
-- Usuarios (sub de los JWT) y ids guardados en la sesión.
create function pg_temp.ua() returns uuid language sql as $f$ select 'a0900000-0000-0000-0000-00000000000a'::uuid $f$;
create function pg_temp.ub() returns uuid language sql as $f$ select 'a0900000-0000-0000-0000-00000000000b'::uuid $f$;
create function pg_temp.uadm() returns uuid language sql as $f$ select 'a0900000-0000-0000-0000-00000000000d'::uuid $f$;
create function pg_temp.uana() returns uuid language sql as $f$ select 'a0900000-0000-0000-0000-000000000001'::uuid $f$;
create function pg_temp.k(p text) returns text language sql as $f$ select current_setting('rtc.' || p) $f$;
-- Persona con cuenta, ficha completa, mail y su inscripción con A y con B (null = sin inscripción).
create function pg_temp.persona(p_user uuid, p_nombre text, p_mail text, p_con_a text, p_con_b text) returns void language plpgsql as $f$
declare v_id uuid;
begin
  update public.alumno set estado = 'completa', nombre = p_nombre, telefono = '099 700 700', fecha_nacimiento = '1990-01-01', mail = p_mail,
         ficha_completada_en = '2026-01-01', ficha_origen_profesor_id = current_setting('rtc.pa')::uuid
   where user_id = p_user returning id into v_id;
  perform set_config('rtc.al_' || right(p_user::text, 2), v_id::text, true);
  if p_con_a is not null then
    insert into public.inscripcion (alumno_id, profesor_id, estado, aprobado_en)
    values (v_id, current_setting('rtc.pa')::uuid, p_con_a, case when p_con_a = 'aprobado' then public.app_ahora() end);
  end if;
  if p_con_b is not null then
    insert into public.inscripcion (alumno_id, profesor_id, estado, aprobado_en)
    values (v_id, current_setting('rtc.pb')::uuid, p_con_b, case when p_con_b = 'aprobado' then public.app_ahora() end);
  end if;
end;
$f$;
create function pg_temp.reloj(p text) returns void language sql as $f$ update privado.reloj_prueba set ahora = p::timestamptz $f$;
-- Atajos de las RPC.
create function pg_temp.crear(p_sub uuid, p_alumno text, p_inicio text, p_tipo text, p_freq int default null, p_persona uuid default null, p_obs text default null) returns text language sql as $f$
  select pg_temp.q(p_sub, format('select public.crear_clase(%L::uuid, %L::uuid, %L::timestamptz, %L, %L::int, %L)::text',
                                  p_alumno, p_persona, p_inicio, p_tipo, p_freq, p_obs))
$f$;
create function pg_temp.mover(p_sub uuid, p_clase text, p_destino text, p_alcance text) returns text language sql as $f$
  select pg_temp.q(p_sub, format('select public.mover_clase(%L::uuid, %L::timestamptz, %L)::text', p_clase, p_destino, p_alcance)) $f$;
create function pg_temp.cancelar(p_sub uuid, p_clase text, p_alcance text) returns text language sql as $f$
  select pg_temp.q(p_sub, format('select public.cancelar_clase(%L::uuid, %L)::text', p_clase, p_alcance)) $f$;
-- Id de la clase viva (confirmada o pendiente) de la persona (`rtc.<k>`) con ese inicio.
create function pg_temp.cid(p_k text, p_inicio text) returns text language sql as $f$
  select id::text from public.clase where alumno_id = current_setting('rtc.' || p_k)::uuid and inicio = p_inicio::timestamptz and estado in ('confirmada', 'pendiente') $f$;
create function pg_temp.n_mails(p_k text, p_tipo text) returns int language sql as $f$
  select count(*)::int from public.mail_salida where alumno_id = current_setting('rtc.' || p_k)::uuid and tipo = p_tipo $f$;
-- Códigos de las cinco RPC con un id inexistente, uno por RPC, separados por coma.
create function pg_temp.cinco(p_sub uuid, p_rol text) returns text language sql as $f$
  select string_agg(pg_temp.cod(pg_temp.q(p_sub, s, p_rol)), ',' order by n) from (values
    (1, $$select public.crear_clase('00000000-0000-0000-0000-00000000dead'::uuid, null, '2026-11-10 10:00-03'::timestamptz, 'suelta', null, null)::text$$),
    (2, $$select public.mover_clase('00000000-0000-0000-0000-00000000dead'::uuid, '2026-11-10 10:00-03'::timestamptz, 'solo_esta')::text$$),
    (3, $$select public.cancelar_clase('00000000-0000-0000-0000-00000000dead'::uuid, 'solo_esta')::text$$),
    (4, $$select count(*)::text from public.agenda_profesor('2026-11-04')$$),
    (5, $$select public.contadores()::text$$)) as t (n, s) $f$;

-- Preparación: dos profesores (B en Madrid), el Administrador, tres personas con cuenta y las que carga A ---------------------
select pg_temp.reloj('2026-11-02 15:00:00+00');
select set_config('rtc.pa', privado.configurar_profesor('pgtap09.profa@example.test', 'Profe A', 'pgtap09-a')::text, true) is not null as _;
select set_config('rtc.pb', privado.configurar_profesor('pgtap09.profb@example.test', 'Profe B', 'pgtap09-b')::text, true) is not null as _;
update public.profesor set zona_horaria = 'Europe/Madrid' where id = current_setting('rtc.pb')::uuid;
select privado.configurar_administrador('pgtap09.admin@example.test');
select pg_temp.usuario(pg_temp.ua(), 'pgtap09.profa@example.test');
select pg_temp.usuario(pg_temp.ub(), 'pgtap09.profb@example.test');
select pg_temp.usuario(pg_temp.uadm(), 'pgtap09.admin@example.test');
select pg_temp.usuario(pg_temp.uana(), 'pgtap09.ana@example.test');   -- aprobada con A, con cuenta
select pg_temp.usuario('a0900000-0000-0000-0000-000000000002', 'pgtap09.bea@example.test');   -- aprobada solo con B
select pg_temp.usuario('a0900000-0000-0000-0000-000000000003', 'pgtap09.pia@example.test');   -- pendiente con A
select pg_temp.persona(pg_temp.uana(), 'Ana', 'pgtap09.ana@example.test', 'aprobado', null);
select pg_temp.persona('a0900000-0000-0000-0000-000000000002', 'Bea', 'pgtap09.bea@example.test', null, 'aprobado');
select pg_temp.persona('a0900000-0000-0000-0000-000000000003', 'Pia', 'pgtap09.pia@example.test', 'pendiente', null);
insert into public.persona_a_cargo (id, alumno_id, nombre, fecha_nacimiento) values
  ('a0900000-0000-0000-0000-0000000000c1', current_setting('rtc.al_01')::uuid, 'Hija de Ana', '2015-03-04'),
  ('a0900000-0000-0000-0000-0000000000c2', current_setting('rtc.al_02')::uuid, 'Hijo de Bea', '2016-05-06');
-- A carga a tres personas: sin cuenta (sin mail), aprobada sin usuario con mail y aprobada sin usuario sin mail.
select set_config('rtc.sc', pg_temp.q(pg_temp.ua(), $$select (public.alta_alumno('Sofia Sincuenta', '099 111 111', '1992-02-02', null)->>'alumno_id')$$), true) is not null as _;
select set_config('rtc.ap', pg_temp.q(pg_temp.ua(), $$select (public.alta_alumno('Aldo Aprobado', '099 222 222', '1993-03-03', 'pgtap09.aldo@example.test')->>'alumno_id')$$), true) is not null as _;
select set_config('rtc.nm', pg_temp.q(pg_temp.ua(), $$select (public.alta_alumno('Nora Sinmail', '099 333 333', '1994-04-04', 'pgtap09.nora@example.test')->>'alumno_id')$$), true) is not null as _;
update public.alumno set mail = null where id = current_setting('rtc.nm')::uuid;
select is((select string_agg(i.estado, ',' order by a.nombre) from public.inscripcion i join public.alumno a on a.id = i.alumno_id
            where a.id in (current_setting('rtc.sc')::uuid, current_setting('rtc.ap')::uuid, current_setting('rtc.nm')::uuid)),
  'aprobado,aprobado,sin_cuenta', 'preparación: A cargó una persona sin cuenta y dos aprobadas sin usuario');

-- 1. crear_clase para una persona sin cuenta y para una aprobada (CA-27, PRF-01, PRF-04, AVI-04) ----------------------------------
select is(pg_temp.err(pg_temp.crear(pg_temp.ua(), pg_temp.k('sc'), '2026-11-04 10:00-03', 'suelta')), 'OK', 'CA-27/PRF-01: A crea una clase suelta para una persona sin cuenta');
select is((select estado from public.clase where alumno_id = current_setting('rtc.sc')::uuid and inicio = '2026-11-04 10:00-03'), 'confirmada', 'CA-27/PRF-02: la clase queda confirmada al instante');
select is((select count(*)::int from public.solicitud where alumno_id = current_setting('rtc.sc')::uuid), 0, 'CA-27: sin solicitud de por medio');
select is(pg_temp.n_mails('sc', 'clase_creada'), 0, 'CA-30/T-AVI-04: la persona sin cuenta no recibe mail');
select is(pg_temp.err(pg_temp.crear(pg_temp.ua(), pg_temp.k('ap'), '2026-11-04 11:00-03', 'suelta')), 'OK', 'CA-27: A crea una clase para una persona aprobada (sin usuario)');
select is((select count(*)::int from public.mail_salida where alumno_id = current_setting('rtc.ap')::uuid and tipo = 'clase_creada' and profesor_id = current_setting('rtc.pa')::uuid
            and destinatario = 'pgtap09.aldo@example.test' and asunto like '% te reservó una clase'), 1, 'CA-30/T-AVI-02: un mail clase_creada al titular, encolado por A');
select is(pg_temp.err(pg_temp.crear(pg_temp.ua(), pg_temp.k('nm'), '2026-11-04 12:00-03', 'suelta')), 'OK', 'T-AVI-04: crear para una persona aprobada sin mail funciona');
select is(pg_temp.n_mails('nm', 'clase_creada'), 0, 'CA-30/T-AVI-04: sin mail no se encola ninguno');
select is(pg_temp.err(pg_temp.crear(pg_temp.ua(), pg_temp.k('ap'), '2026-11-03 10:00-03', 'suelta')), 'OK', 'PRF-04: crear no aplica la anticipación (mañana 10:00, con 24 h de anticipación configuradas)');
select is(pg_temp.err(pg_temp.crear(pg_temp.ua(), pg_temp.k('ap'), '2026-11-04 11:00-03', 'suelta')), 'PT409 HUECO_NO_LIBRE', 'RES-05: un hueco ocupado da 409 HUECO_NO_LIBRE');
select is(pg_temp.det(pg_temp.crear(pg_temp.ua(), pg_temp.k('ap'), '2026-11-04 11:00-03', 'suelta')) ->> 'inicio' is not null, true, 'RES-05: el 409 trae el inicio');

-- 2. Alcance de CA-52: personas sin vínculo con A, otra persona a cargo -----------------------------------------------------------
select is(pg_temp.err(pg_temp.crear(pg_temp.ua(), pg_temp.k('al_02'), '2026-11-05 10:00-03', 'suelta')), 'PT403 PROHIBIDO', 'CA-52/PRF-07: una persona solo de B da 403 a A');
select is(pg_temp.err(pg_temp.crear(pg_temp.ua(), pg_temp.k('al_03'), '2026-11-05 10:00-03', 'suelta')), 'PT403 PROHIBIDO', 'CA-52: una persona pendiente con A da 403');
select is(pg_temp.err(pg_temp.crear(pg_temp.ua(), '00000000-0000-0000-0000-00000000dead', '2026-11-05 10:00-03', 'suelta')), 'PT403 PROHIBIDO', 'CA-52: una persona inexistente da 403, igual que una de otro profesor');
select is(pg_temp.err(pg_temp.crear(pg_temp.ub(), pg_temp.k('sc'), '2026-11-05 10:00+01', 'suelta')), 'PT403 PROHIBIDO', 'CA-52: B no crea clases para la persona sin cuenta de A');
select is(pg_temp.err(pg_temp.crear(pg_temp.ua(), pg_temp.k('al_01'), '2026-11-05 10:00-03', 'suelta', null, 'a0900000-0000-0000-0000-0000000000c2')), 'PT404 NO_ENCONTRADO', 'CA-52: la persona a cargo de otro titular da 404');

-- 3. Serie creada y movida una vez (CA-27, PRF-02, PRF-03) --------------------------------------------------------------------------
select is(pg_temp.err(pg_temp.crear(pg_temp.ua(), pg_temp.k('al_01'), '2026-11-09 10:00-03', 'serie', 1, 'a0900000-0000-0000-0000-0000000000c1', 'Serie de Ana')), 'OK', 'CA-27: A crea una serie semanal para Ana con su hija');
select ok((select count(*) >= 8 from public.clase c join public.reserva r on r.id = c.reserva_id
            where c.alumno_id = current_setting('rtc.al_01')::uuid and r.tipo = 'serie' and c.estado = 'confirmada'), 'CA-27: la serie materializa todo el horizonte, confirmada');
select is((select count(*)::int from public.mail_salida where alumno_id = current_setting('rtc.al_01')::uuid and tipo = 'clase_creada' and destinatario = 'pgtap09.ana@example.test'
            and cuerpo_texto like '%Hija de Ana%' and cuerpo_texto like '%semanal%'), 1, 'CA-30/AVI-02: un mail de la serie, con quién toma la clase');
select is(pg_temp.err(pg_temp.mover(pg_temp.ua(), pg_temp.cid('al_01', '2026-11-16 10:00-03'), '2026-11-17 11:00-03', 'solo_esta')), 'OK', 'CA-27/PRF-03: A mueve solo la clase del 16/11 de la serie al 17/11 11:00');
select is((select string_agg(to_char(inicio at time zone 'America/Montevideo', 'MM-DD HH24:MI') || ':' || estado, ',' order by inicio)
             from public.clase where alumno_id = current_setting('rtc.al_01')::uuid and inicio::date in ('2026-11-09', '2026-11-16', '2026-11-17', '2026-11-23')),
  '11-09 10:00:confirmada,11-16 10:00:movida,11-17 11:00:confirmada,11-23 10:00:confirmada', 'CA-27: solo esa clase se movió; la serie sigue y el destino queda confirmado');
select is(pg_temp.n_mails('al_01', 'clase_movida'), 1, 'CA-30/AVI-02: el movimiento genera un mail clase_movida al titular');
select is(pg_temp.err(pg_temp.mover(pg_temp.ua(), pg_temp.cid('al_01', '2026-11-23 10:00-03'), '2026-11-23 10:00-03', 'solo_esta')), 'PT409 HUECO_NO_LIBRE', 'RES-05: mover al mismo horario da 409');
select is(pg_temp.err(pg_temp.mover(pg_temp.ua(), pg_temp.cid('al_01', '2026-11-23 10:00-03'), '2026-11-24 10:00-03', 'siempre')), 'PT422 DATOS_INVALIDOS', 'PRF-03: un alcance desconocido da 422');
select is(pg_temp.det(pg_temp.mover(pg_temp.ua(), pg_temp.cid('al_01', '2026-11-23 10:00-03'), '2026-11-24 10:00-03', 'siempre')) ->> 'campo', 'p_alcance', 'PRF-03: el 422 señala p_alcance');
select is(pg_temp.err(pg_temp.mover(pg_temp.ua(), pg_temp.cid('al_01', '2026-11-23 10:00-03'), '2026-11-02 08:00-03', 'solo_esta')), 'PT422 DATOS_INVALIDOS', 'SEC-09: un destino pasado da 422');
select is(pg_temp.det(pg_temp.mover(pg_temp.ua(), pg_temp.cid('al_01', '2026-11-23 10:00-03'), '2026-11-02 08:00-03', 'solo_esta')) ->> 'campo', 'p_destino', 'SEC-09: el 422 señala p_destino');
select is(pg_temp.err(pg_temp.mover(pg_temp.ua(), pg_temp.cid('al_01', '2026-11-23 10:00-03'), '2028-01-03 10:00-03', 'solo_esta')), 'PT422 DATOS_INVALIDOS', 'SEC-09: un destino a más de 366 días da 422');
select is(pg_temp.err(pg_temp.mover(pg_temp.ua(), pg_temp.cid('al_01', '2026-11-16 10:00-03'), '2026-11-24 10:00-03', 'solo_esta')), 'PT404 NO_ENCONTRADO', 'PRF-03: la clase ya movida no es una clase viva (404)');

-- 4. Pedido pendiente del alumno: 409 SOLICITUD_EN_CURSO ----------------------------------------------------------------------------
select ok(pg_temp.q(pg_temp.uana(), format($$select public.solicitar_cancelacion(%L::uuid, 'solo_esta')::text$$, pg_temp.cid('al_01', '2026-11-30 10:00-03'))) like '{%', 'preparación: Ana pide cancelar su clase del 30/11');
select is(pg_temp.err(pg_temp.cancelar(pg_temp.ua(), pg_temp.cid('al_01', '2026-11-30 10:00-03'), 'solo_esta')), 'PT409 SOLICITUD_EN_CURSO', 'PRF-03: cancelar una clase con un pedido pendiente del alumno da 409 SOLICITUD_EN_CURSO');
select ok(pg_temp.det(pg_temp.cancelar(pg_temp.ua(), pg_temp.cid('al_01', '2026-11-30 10:00-03'), 'solo_esta')) ->> 'solicitud_id' is not null, 'PRF-03: el 409 trae el solicitud_id');
select is(pg_temp.err(pg_temp.mover(pg_temp.ua(), pg_temp.cid('al_01', '2026-11-30 10:00-03'), '2026-12-01 12:00-03', 'solo_esta')), 'PT409 SOLICITUD_EN_CURSO', 'PRF-03: mover una clase con pedido pendiente da 409 SOLICITUD_EN_CURSO');
select is(pg_temp.err(pg_temp.cancelar(pg_temp.ua(), pg_temp.cid('al_01', '2026-11-23 10:00-03'), 'desde_aca')), 'PT409 SOLICITUD_EN_CURSO', 'PRF-03: «de acá en adelante» con un pedido pendiente en una fecha posterior de la serie da 409');
select is((select count(*)::int from public.clase where alumno_id = current_setting('rtc.al_01')::uuid and estado = 'cancelada'), 0, 'PRF-03: el 409 no dejó nada cancelado');
select is(pg_temp.err(pg_temp.q(pg_temp.ua(), format($$select public.responder_solicitud(%L::uuid, 'rechazar', 'no puedo')::text$$,
   (select id::text from public.solicitud where alumno_id = current_setting('rtc.al_01')::uuid and estado = 'pendiente')))), 'OK', 'preparación: A rechaza el pedido pendiente');
-- 4b. H-362: regla de SOLICITUD_EN_CURSO de contratos.md §1 en mover_clase y cancelar_clase (PRF-02, PRF-03) -------------------
-- Ejecuta una RPC y deshace lo que escribió: el resultado queda, la base no cambia (las secciones siguientes no se enteran).
create function pg_temp.y_deshacer(p_sub uuid, p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  begin
    v := pg_temp.q(p_sub, p_sql);
    raise exception 'deshacer';
  exception when raise_exception then
    return v;
  end;
end;
$f$;
-- (b) Una «de acá en adelante» pendiente de una clase anterior de la serie bloquea las clases siguientes.
select ok(pg_temp.q(pg_temp.uana(), format($$select public.solicitar_cancelacion(%L::uuid, 'desde_aca')::text$$, pg_temp.cid('al_01', '2026-11-30 10:00-03'))) like '{%', 'preparación: Ana pide cancelar su serie desde el 30/11');
select is(pg_temp.err(pg_temp.cancelar(pg_temp.ua(), pg_temp.cid('al_01', '2026-12-07 10:00-03'), 'solo_esta')), 'PT409 SOLICITUD_EN_CURSO', 'H-362/PRF-03: cancelar una clase alcanzada por una «de acá en adelante» pendiente de una clase anterior da 409');
select is(pg_temp.err(pg_temp.mover(pg_temp.ua(), pg_temp.cid('al_01', '2026-12-07 10:00-03'), '2026-12-08 11:00-03', 'solo_esta')), 'PT409 SOLICITUD_EN_CURSO', 'H-362/PRF-02: mover esa clase también da 409');
select is(pg_temp.det(pg_temp.cancelar(pg_temp.ua(), pg_temp.cid('al_01', '2026-12-07 10:00-03'), 'solo_esta')) ->> 'solicitud_id',
  (select id::text from public.solicitud where alumno_id = current_setting('rtc.al_01')::uuid and estado = 'pendiente'), 'H-362: el 409 nombra la «de acá en adelante» de la clase anterior');
select is(pg_temp.q(pg_temp.ua(), format($$select solicitud_id::text from public.agenda_profesor('2026-12-07') where clase_id = %L::uuid$$, pg_temp.cid('al_01', '2026-12-07 10:00-03'))),
  pg_temp.det(pg_temp.cancelar(pg_temp.ua(), pg_temp.cid('al_01', '2026-12-07 10:00-03'), 'solo_esta')) ->> 'solicitud_id',
  'H-371/PRF-05/PRF-03: agenda_profesor trae en la clase del 07/12 la «de acá en adelante» pendiente de la clase anterior, la misma del 409');
select is(pg_temp.err(pg_temp.q(pg_temp.ua(), format($$select public.responder_solicitud(%L::uuid, 'rechazar', null)::text$$,
   (select id::text from public.solicitud where alumno_id = current_setting('rtc.al_01')::uuid and estado = 'pendiente')))), 'OK', 'preparación: A rechaza la «de acá en adelante»');
-- (a) Una vencida no bloquea: movimiento del 07/12 a un destino anterior (fecha_clase = destino) que ya pasó.
select ok(pg_temp.q(pg_temp.uana(), format($$select public.solicitar_movimiento(%L::uuid, '2026-12-01 11:00-03'::timestamptz, 'solo_esta')::text$$, pg_temp.cid('al_01', '2026-12-07 10:00-03'))) like '{%', 'preparación: Ana pide mover su clase del 07/12 al 01/12');
select is(pg_temp.q(pg_temp.ua(), format($$select solicitud_id::text from public.agenda_profesor('2026-12-07') where clase_id = %L::uuid$$, pg_temp.cid('al_01', '2026-12-07 10:00-03'))),
  (select id::text from public.solicitud where alumno_id = current_setting('rtc.al_01')::uuid and estado = 'pendiente'),
  'H-371/PRF-05: con el movimiento pendiente y vigente, agenda_profesor trae su solicitud_id en la clase del 07/12');
select is(pg_temp.err(pg_temp.y_deshacer(pg_temp.ua(), format('select public.cancelar_clase(%L::uuid, %L)::text', pg_temp.cid('al_01', '2026-12-07 10:00-03'), 'solo_esta'))), 'PT409 SOLICITUD_EN_CURSO', 'H-362: mientras no vence, el movimiento pendiente bloquea');
select pg_temp.reloj('2026-12-01 15:00:00+00');
select is(pg_temp.q(pg_temp.ua(), format($$select coalesce(solicitud_id::text, 'nulo') from public.agenda_profesor('2026-12-07') where clase_id = %L::uuid$$, pg_temp.cid('al_01', '2026-12-07 10:00-03'))),
  'nulo', 'H-371/PRF-05/PRF-02: con el movimiento vencido, agenda_profesor trae solicitud_id nulo en la clase del 07/12 (el panel ofrece mover y cancelar)');
select is(pg_temp.q(pg_temp.ua(), $$select (public.contadores() ->> 'solicitudes_pendientes')$$), '0',
  'H-371/AVI-01: contadores no cuenta el movimiento vencido');
select is(pg_temp.err(pg_temp.y_deshacer(pg_temp.ua(), format('select public.cancelar_clase(%L::uuid, %L)::text', pg_temp.cid('al_01', '2026-12-07 10:00-03'), 'solo_esta'))), 'OK', 'H-362/PRF-03: con el movimiento pendiente vencido, A puede cancelar la clase del 07/12');
select is(pg_temp.err(pg_temp.y_deshacer(pg_temp.ua(), format('select public.mover_clase(%L::uuid, %L::timestamptz, %L)::text', pg_temp.cid('al_01', '2026-12-07 10:00-03'), '2026-12-08 11:00-03', 'solo_esta'))), 'OK', 'H-362/PRF-02: y también moverla');
select pg_temp.reloj('2026-11-02 15:00:00+00');
select is(pg_temp.err(pg_temp.q(pg_temp.ua(), format($$select public.responder_solicitud(%L::uuid, 'rechazar', null)::text$$,
   (select id::text from public.solicitud where alumno_id = current_setting('rtc.al_01')::uuid and estado = 'pendiente')))), 'OK', 'preparación: A rechaza el movimiento y la sección 5 sigue con la serie como estaba');


-- 5. Cancelación desde una fecha (CA-27, PRF-03) ------------------------------------------------------------------------------------
select is((pg_temp.cancelar(pg_temp.ua(), pg_temp.cid('al_01', '2026-11-23 10:00-03'), 'desde_aca')::jsonb ->> 'canceladas')::int > 0, true, 'CA-27: A cancela la serie de Ana desde el 23/11');
select is((select string_agg(to_char(inicio at time zone 'America/Montevideo', 'MM-DD') || ':' || estado, ',' order by inicio)
             from public.clase where alumno_id = current_setting('rtc.al_01')::uuid and inicio::date in ('2026-11-09', '2026-11-23', '2026-11-30', '2026-12-07')),
  '11-09:confirmada,11-23:cancelada,11-30:cancelada,12-07:cancelada', 'CA-27: lo anterior sigue confirmado y desde el 23/11 queda cancelado');
select is((select hasta::text from public.reserva where alumno_id = current_setting('rtc.al_01')::uuid and tipo = 'serie'), '2026-11-22', 'CA-27: la serie termina el día anterior');
select is(pg_temp.n_mails('al_01', 'clase_cancelada'), 1, 'CA-30/AVI-02: un mail clase_cancelada al titular');
select is(pg_temp.err(pg_temp.cancelar(pg_temp.ua(), pg_temp.cid('sc', '2026-11-04 10:00-03'), 'desde_aca')), 'OK', 'PRF-03: cancelar una clase suelta con desde_aca vale como solo_esta');
select is(pg_temp.err(pg_temp.cancelar(pg_temp.ua(), pg_temp.cid('sc', '2026-11-04 10:00-03'), 'solo_esta')), 'PT404 NO_ENCONTRADO', 'PRF-03: una clase ya cancelada no se cancela otra vez');
select is(pg_temp.n_mails('sc', 'clase_cancelada'), 0, 'CA-30/T-AVI-04: la persona sin cuenta no recibe mail al cancelar');

-- 6. Límites de crear_clase (SEC-09) ------------------------------------------------------------------------------------------------
select is(pg_temp.err(pg_temp.crear(pg_temp.ua(), pg_temp.k('sc'), '2026-11-02 08:00-03', 'suelta')), 'PT422 DATOS_INVALIDOS', 'SEC-09: un horario pasado da 422');
select is(pg_temp.det(pg_temp.crear(pg_temp.ua(), pg_temp.k('sc'), '2026-11-02 08:00-03', 'suelta')) ->> 'campo', 'p_inicio', 'SEC-09: el 422 señala p_inicio');
select is(pg_temp.err(pg_temp.crear(pg_temp.ua(), pg_temp.k('sc'), '2028-01-03 10:00-03', 'suelta')), 'PT422 DATOS_INVALIDOS', 'SEC-09: más de 366 días da 422');
select is(pg_temp.err(pg_temp.crear(pg_temp.ua(), pg_temp.k('sc'), null, 'suelta')), 'PT422 DATOS_INVALIDOS', 'SEC-09: un inicio nulo da 422');
select is(pg_temp.err(pg_temp.crear(pg_temp.ua(), pg_temp.k('sc'), '2026-11-05 10:00-03', 'mensual')), 'PT422 DATOS_INVALIDOS', 'SEC-09: un tipo desconocido da 422');
select is(pg_temp.err(pg_temp.crear(pg_temp.ua(), pg_temp.k('sc'), '2026-11-05 10:00-03', 'serie', 3)), 'PT422 DATOS_INVALIDOS', 'SEC-09: una frecuencia 3 da 422');
select is(pg_temp.err(pg_temp.crear(pg_temp.ua(), pg_temp.k('sc'), '2026-11-05 10:00-03', 'suelta', null, null, repeat('x', 501))), 'PT422 DATOS_INVALIDOS', 'SEC-09: una observación de 501 caracteres da 422');
select is(pg_temp.err(pg_temp.crear(pg_temp.ua(), pg_temp.k('sc'), '2026-11-05 07:00-03', 'suelta')), 'PT422 FUERA_DE_GRILLA', 'RES-05: fuera de la grilla da 422 FUERA_DE_GRILLA');

-- 7. Edición de la ficha (CA-27, DEC-32) --------------------------------------------------------------------------------------------
select is(pg_temp.err(pg_temp.q(pg_temp.ua(), format($$select public.editar_alumno(%L::uuid, 'Sofia Editada', '099 111 112', '1992-02-02', null)::text$$, current_setting('rtc.sc')))), 'OK', 'CA-27: A edita la ficha de la persona sin cuenta que cargó');
select is((select nombre from public.alumno where id = current_setting('rtc.sc')::uuid), 'Sofia Editada', 'CA-27: el cambio quedó guardado');
select is(pg_temp.err(pg_temp.q(pg_temp.ua(), format($$select public.editar_alumno(%L::uuid, 'Ana Cambiada', '099 700 701', '1990-01-01', null)::text$$, current_setting('rtc.al_01')))), 'PT403 PROHIBIDO', 'CA-27/DEC-32: la ficha de una persona con cuenta no se edita (403)');
select is((select nombre from public.alumno where id = current_setting('rtc.al_01')::uuid), 'Ana', 'CA-27/DEC-32: el rechazo no cambió nada');

-- 8. Panel: agenda_profesor (CA-28, CA-52, SEC-09) --------------------------------------------------------------------------------
select is(pg_temp.q(pg_temp.ua(), $$select quien_toma || '/' || titular || '/' || coalesce(observacion, '-') || '/' || clase_estado || '/' || reserva_tipo
                                       from public.agenda_profesor('2026-11-09') where estado = 'ocupado'$$), 'Hija de Ana/Ana/Serie de Ana/confirmada/serie',
  'CA-28/PRF-05: el hueco ocupado muestra quién toma la clase, el titular, la observación, el estado y el tipo');
select is(pg_temp.q(pg_temp.ua(), $$select quien_toma || '/' || titular from public.agenda_profesor('2026-11-04') where estado = 'ocupado' and titular = 'Aldo Aprobado'$$), 'Aldo Aprobado/Aldo Aprobado',
  'CA-28: sin persona a cargo, quien toma es el titular');
select is(pg_temp.q(pg_temp.ub(), $$select count(*) from public.agenda_profesor('2026-11-04') where clase_id is not null or titular is not null$$), '0', 'CA-52: la agenda de B no trae clases ni nombres de A');
select is(pg_temp.q(pg_temp.ub(), $$select count(*) from public.agenda_profesor('2026-11-09') where clase_id is not null or titular is not null$$), '0', 'CA-52: tampoco el 09/11');
select is(pg_temp.err(pg_temp.q(pg_temp.ua(), $$select count(*) from public.agenda_profesor('2027-11-03')$$)), 'OK', 'SEC-09: p_dia = hoy + 366 pasa');
select is(pg_temp.err(pg_temp.q(pg_temp.ua(), $$select count(*) from public.agenda_profesor('2027-11-04')$$)), 'PT422 DATOS_INVALIDOS', 'SEC-09: p_dia = hoy + 367 da 422');
select is(pg_temp.err(pg_temp.q(pg_temp.ua(), $$select count(*) from public.agenda_profesor('2025-10-31')$$)), 'PT422 DATOS_INVALIDOS', 'SEC-09: p_dia = hoy - 367 da 422');
select is(pg_temp.det(pg_temp.q(pg_temp.ua(), $$select count(*) from public.agenda_profesor(null)$$)) ->> 'campo', 'p_dia', 'SEC-09: p_dia nulo da 422 con campo p_dia');

-- 9. Panel: contadores (CA-21, CA-55, T-SOL-02) -------------------------------------------------------------------------------------
select is(pg_temp.q(pg_temp.ua(), $$select public.contadores()::text$$), '{"cuentas_pendientes": 1, "solicitudes_pendientes": 0}', 'CA-21/AVI-01: A cuenta la cuenta pendiente de Pia y ninguna solicitud');
select is(pg_temp.q(pg_temp.ub(), $$select public.contadores()::text$$), '{"cuentas_pendientes": 0, "solicitudes_pendientes": 0}', 'CA-55: B no cuenta la cuenta pendiente de A');
select ok(pg_temp.q(pg_temp.uana(), format($$select public.solicitar_reserva(%L::uuid, '2026-11-05 10:00-03'::timestamptz, 'suelta', null, null, null)::text$$, current_setting('rtc.pa'))) like '{%', 'preparación: Ana pide una clase suelta con A el 05/11');
select ok(pg_temp.q('a0900000-0000-0000-0000-000000000002', format($$select public.solicitar_reserva(%L::uuid, '2026-11-10 10:00+01'::timestamptz, 'suelta', null, null, null)::text$$, current_setting('rtc.pb'))) like '{%', 'preparación: Bea pide una clase suelta con B el 10/11');
select is(pg_temp.q(pg_temp.ua(), $$select public.contadores()::text$$), '{"cuentas_pendientes": 1, "solicitudes_pendientes": 1}', 'CA-21/T-SOL-02: A suma su solicitud pendiente y la cuenta pendiente');
select is(pg_temp.q(pg_temp.ub(), $$select public.contadores()::text$$), '{"cuentas_pendientes": 0, "solicitudes_pendientes": 1}', 'CA-55: B suma solo la suya, sin lo de A');
select pg_temp.reloj('2026-11-05 13:01:00+00');
select is(pg_temp.q(pg_temp.ua(), $$select public.contadores()::text$$), '{"cuentas_pendientes": 1, "solicitudes_pendientes": 0}', 'CA-21: una solicitud vencida ya no cuenta en el contador');
select is(pg_temp.q(pg_temp.ua(), $$select count(*) from public.v_solicitudes_pendientes where vencida$$), '1', 'CA-21/SOL-08: la lista la sigue mostrando, vencida');
select is(pg_temp.q(pg_temp.ub(), $$select (public.contadores() ->> 'solicitudes_pendientes')$$), '1', 'CA-55: la vencida de A no toca a B');
select pg_temp.reloj('2026-11-02 15:00:00+00');

-- 10. SEC-28: el job extiende las series del profesor ----------------------------------------------------------------------------------
select is(pg_temp.err(pg_temp.crear(pg_temp.ua(), pg_temp.k('ap'), '2026-11-06 14:00-03', 'serie', 2)), 'OK', 'preparación: A crea una serie quincenal para Aldo');
select set_config('rtc.antes', (select count(*)::text from public.clase where alumno_id = current_setting('rtc.ap')::uuid and estado = 'confirmada'), true) is not null as _;
select ok(privado.extender_series(public.app_ahora() + interval '60 days') > 0, 'SEC-28: extender_series extiende la serie creada por el profesor');
select ok((select count(*) from public.clase where alumno_id = current_setting('rtc.ap')::uuid and estado = 'confirmada') > current_setting('rtc.antes')::int, 'SEC-28: Aldo tiene más clases confirmadas después de la corrida');

-- 11. Profesor inactivo: crear y mover 409, cancelar sí (CA-63, PRF-08) ------------------------------------------------------------------
update public.profesor set activo = false where id = current_setting('rtc.pa')::uuid;
select is(pg_temp.err(pg_temp.crear(pg_temp.ua(), pg_temp.k('ap'), '2026-11-06 10:00-03', 'suelta')), 'PT409 PROFESOR_INACTIVO', 'CA-63/PRF-08: inactivo, crear_clase da 409 PROFESOR_INACTIVO');
select is(pg_temp.err(pg_temp.mover(pg_temp.ua(), pg_temp.cid('ap', '2026-11-04 11:00-03'), '2026-11-05 14:00-03', 'solo_esta')), 'PT409 PROFESOR_INACTIVO', 'CA-63/PRF-08: inactivo, mover_clase da 409 PROFESOR_INACTIVO');
select is((select estado from public.clase where id = pg_temp.cid('ap', '2026-11-04 11:00-03')::uuid), 'confirmada', 'CA-63: el rechazo no tocó la clase');
select is(pg_temp.err(pg_temp.cancelar(pg_temp.ua(), pg_temp.cid('ap', '2026-11-04 11:00-03'), 'solo_esta')), 'OK', 'CA-63/PRF-08: inactivo, cancelar_clase funciona');
select is(pg_temp.err(pg_temp.q(pg_temp.ua(), $$select count(*) from public.agenda_profesor('2026-11-04')$$)), 'OK', 'PRF-08: inactivo, agenda_profesor funciona');
select is(pg_temp.err(pg_temp.q(pg_temp.ua(), $$select public.contadores()::text$$)), 'OK', 'PRF-08: inactivo, contadores funciona');
update public.profesor set activo = true where id = current_setting('rtc.pa')::uuid;

-- 12. SEC-06: roles y dos profesores en las cinco RPC ------------------------------------------------------------------------------------
select is(pg_temp.cinco(null, 'anon'), '42501,42501,42501,42501,42501', 'SEC-06: anon no ejecuta ninguna de las cinco (42501)');
select is(pg_temp.cinco(pg_temp.uana(), 'authenticated'), 'PT403,PT403,PT403,PT403,PT403', 'SEC-06: la persona recibe 403 en las cinco');
select is(pg_temp.cinco(pg_temp.uadm(), 'authenticated'), 'PT403,PT403,PT403,PT403,PT403', 'SEC-06: el Administrador que no es profesor recibe 403 en las cinco');
select is(pg_temp.cinco(null, 'authenticated'), 'PT401,PT401,PT401,PT401,PT401', 'SEC-06: un JWT sin sub recibe 401 en las cinco');
select is(pg_temp.cinco(pg_temp.ua(), 'authenticated'), 'PT403,PT404,PT404,OK,OK', 'SEC-06: el profesor A: crear a una persona inexistente 403, mover y cancelar una clase inexistente 404, agenda y contadores bien');
select is(pg_temp.err(pg_temp.mover(pg_temp.ub(), pg_temp.cid('al_01', '2026-11-09 10:00-03'), '2026-11-11 10:00+01', 'solo_esta')), 'PT404 NO_ENCONTRADO', 'SEC-06/CA-52: B mueve una clase de A y recibe 404');
select is(pg_temp.err(pg_temp.cancelar(pg_temp.ub(), pg_temp.cid('al_01', '2026-11-09 10:00-03'), 'desde_aca')), 'PT404 NO_ENCONTRADO', 'SEC-06/CA-52: B cancela una clase de A y recibe 404');
select is((select estado from public.clase where id = pg_temp.cid('al_01', '2026-11-09 10:00-03')::uuid), 'confirmada', 'CA-52: la clase de A sigue intacta');

select * from finish();
rollback;
