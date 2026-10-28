-- B11 · T11.3 · Retención por inactividad, aviso de 7 días, recordatorios y borrado del alumno por el profesor, con dos profesores.
-- IDs: ALU-10, ALU-11, ALU-12, AVI-05, AVI-06, AVI-07, SEC-06, SEC-26, SEC-27, SEC-28, SEC-29, DEC-26 A.
-- CA-08, CA-09, CA-10 (texto de CR-002), CA-31, CA-32, CA-45 (cierre: tras el borrado), CA-57, CA-59, H-004 (barrido de centinelas).
-- Reloj fijo: lunes 2026-11-02 12:00 de Montevideo (15:00Z). Las fechas de inactividad se arman contra ese instante. Datos sintéticos
-- (@example.test); la retención anonimiza y borra, así que todo corre dentro de la transacción y se deshace con el rollback.
begin;
select plan(125);

-- Ayudas ---------------------------------------------------------------------------------------------------------------------
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
create function pg_temp.k(p text) returns text language sql as $f$ select current_setting('rtc.' || p) $f$;
create function pg_temp.usuario(p_id uuid, p_mail text) returns void language sql as $f$
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_mail, now(), now(), now(), '', '', '', '', '{}')
$f$;
create function pg_temp.u(p_n int) returns uuid language sql as $f$ select ('a1100000-0000-0000-0000-' || lpad(p_n::text, 12, '0'))::uuid $f$;
create function pg_temp.reloj(p text) returns void language sql as $f$ update privado.reloj_prueba set ahora = p::timestamptz $f$;
-- Persona con cuenta (usuario n), ficha completa, mail, y su inscripción con A y con B (null = sin inscripción). `p_creado` es el registro.
create function pg_temp.persona(p_n int, p_k text, p_nombre text, p_con_a text, p_con_b text, p_creado timestamptz default '2026-11-01 12:00:00+00',
                                p_motivo text default null, p_como text default 'Amigos') returns void language plpgsql as $f$
declare v_id uuid;
begin
  perform pg_temp.usuario(pg_temp.u(p_n), 'pgtap11.' || p_k || '@example.test');
  update public.alumno set estado = 'completa', nombre = p_nombre, mail = 'pgtap11.' || p_k || '@example.test', telefono = '099 700 700',
         fecha_nacimiento = '1990-01-01', ficha_completada_en = '2026-01-01', ficha_origen_profesor_id = current_setting('rtc.pa')::uuid,
         creado_en = p_creado, ultimo_ingreso = null
   where user_id = pg_temp.u(p_n) returning id into v_id;
  perform set_config('rtc.' || p_k, v_id::text, true);
  if p_con_a is not null then
    insert into public.inscripcion (alumno_id, profesor_id, estado, motivo_estado, como_llego, aprobado_en)
    values (v_id, current_setting('rtc.pa')::uuid, p_con_a, case when p_con_a = 'rechazado' then p_motivo end, p_como,
            case when p_con_a = 'aprobado' then p_creado end);
  end if;
  if p_con_b is not null then
    insert into public.inscripcion (alumno_id, profesor_id, estado, aprobado_en)
    values (v_id, current_setting('rtc.pb')::uuid, p_con_b, case when p_con_b = 'aprobado' then p_creado end);
  end if;
end;
$f$;
-- Clase (con su reserva suelta) de la persona `p_k` con el profesor `p_prof` ('pa' o 'pb'); dura `p_seg` segundos.
create function pg_temp.clase(p_prof text, p_k text, p_inicio timestamptz, p_estado text default 'confirmada', p_seg int default 3600,
                              p_conf timestamptz default null, p_persona uuid default null, p_obs text default null) returns uuid language plpgsql as $f$
declare v_res uuid; v_cl uuid;
begin
  insert into public.reserva (profesor_id, alumno_id, persona_a_cargo_id, tipo, hora_local, dia_semana, duracion_min, observacion, estado, desde, origen)
  values (pg_temp.k(p_prof)::uuid, pg_temp.k(p_k)::uuid, p_persona, 'suelta', (p_inicio at time zone 'UTC')::time,
          extract(isodow from p_inicio at time zone 'UTC')::int, greatest(1, p_seg / 60), p_obs,
          case when p_estado = 'cancelada' then 'cancelada' when p_estado = 'pendiente' then 'pendiente' else 'confirmada' end,
          (p_inicio at time zone 'UTC')::date, 'profesor') returning id into v_res;
  insert into public.clase (profesor_id, reserva_id, alumno_id, persona_a_cargo_id, inicio, fin, estado, confirmada_en)
  values (pg_temp.k(p_prof)::uuid, v_res, pg_temp.k(p_k)::uuid, p_persona, p_inicio, p_inicio + make_interval(secs => p_seg), p_estado, p_conf)
  returning id into v_cl;
  return v_cl;
end;
$f$;
create function pg_temp.n_mails(p_k text, p_tipo text) returns int language sql as $f$
  select count(*)::int from public.mail_salida where alumno_id = current_setting('rtc.' || p_k)::uuid and tipo = p_tipo $f$;
create function pg_temp.estado(p_k text) returns text language sql as $f$ select estado from public.alumno where id = current_setting('rtc.' || p_k)::uuid $f$;
create function pg_temp.insc(p_k text, p_prof text) returns text language sql as $f$
  select estado || '/' || coalesce(motivo_estado, '-') || '/' || coalesce(como_llego, '-') from public.inscripcion
   where alumno_id = current_setting('rtc.' || p_k)::uuid and profesor_id = current_setting('rtc.' || p_prof)::uuid $f$;
create function pg_temp.borrar(p_sub uuid, p_k text) returns text language sql as $f$
  select pg_temp.q(p_sub, format('select public.borrar_alumno(%L::uuid)::text', current_setting('rtc.' || p_k))) $f$;
-- Tablas de public, auth y privado con alguna fila cuyo texto case con el patrón (regex), «schema.tabla:n» separadas por espacio.
create function pg_temp.restos(p_patron text) returns text language plpgsql as $f$
declare t record; v_n bigint; v_r text := '';
begin
  for t in select ns.nspname as s, c.relname as r from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
            where c.relkind = 'r' and ns.nspname in ('public', 'auth', 'privado') order by 1, 2 loop
    execute format('select count(*) from %I.%I x where x::text ~* %L', t.s, t.r, p_patron) into v_n;
    if v_n > 0 then v_r := v_r || t.s || '.' || t.r || ':' || v_n || ' '; end if;
  end loop;
  return trim(v_r);
end;
$f$;
create function pg_temp.agenda(p_dia text, p_hora text) returns text language sql as $f$
  select estado from public.agenda_publica('pgtap11-a', p_dia::date) where to_char(inicio at time zone 'America/Montevideo', 'HH24:MI') = p_hora $f$;

-- Preparación: dos profesores, el Administrador ---------------------------------------------------------------------------------
select pg_temp.reloj('2026-11-02 15:00:00+00');
select set_config('rtc.id0', coalesce((select max(id) from privado.ejecucion_proceso), 0)::text, true) is not null as _;
select set_config('rtc.pa', privado.configurar_profesor('pgtap11.profa@example.test', 'Profe A', 'pgtap11-a')::text, true) is not null as _;
select set_config('rtc.pb', privado.configurar_profesor('pgtap11.profb@example.test', 'Profe B', 'pgtap11-b')::text, true) is not null as _;
select privado.configurar_administrador('pgtap11.admin@example.test');
select pg_temp.usuario(pg_temp.u(901), 'pgtap11.profa@example.test');
select pg_temp.usuario(pg_temp.u(902), 'pgtap11.profb@example.test');
select pg_temp.usuario(pg_temp.u(903), 'pgtap11.admin@example.test');

-- 1. Personas de la retención (registro y aprobaciones de enero de 2026: lo que decide es la última clase) -------------------------
select pg_temp.persona(1, 'xavi', 'Xavi', 'aprobado', 'aprobado', '2026-01-01');   -- última clase con A hace 7 meses, con B hace 2: no vence
select pg_temp.clase('pa', 'xavi', '2026-04-02 15:00:00+00');
select pg_temp.clase('pb', 'xavi', '2026-09-02 15:00:00+00');
select pg_temp.persona(2, 'yara', 'Yara zzcent11n', 'aprobado', 'aprobado', '2026-01-01');   -- 6 meses desde la última clase con cualquiera: se borra
select set_config('rtc.pc_yara', gen_random_uuid()::text, true) is not null as _;
insert into public.persona_a_cargo (id, alumno_id, nombre, fecha_nacimiento)
values (pg_temp.k('pc_yara')::uuid, pg_temp.k('yara')::uuid, 'Hija zzcent11p', '1991-12-19');
update public.alumno set telefono = '099 118 877', fecha_nacimiento = '1987-06-15', mail = 'yara.zzcent11m@example.test' where id = pg_temp.k('yara')::uuid;
select pg_temp.clase('pa', 'yara', '2026-04-15 15:00:00+00', 'confirmada', 3600, null, pg_temp.k('pc_yara')::uuid, 'obs zzcent11o');
select pg_temp.clase('pb', 'yara', '2026-04-20 15:00:00+00');
insert into public.reserva (profesor_id, alumno_id, tipo, hora_local, dia_semana, duracion_min, observacion, estado, desde, origen)
values (pg_temp.k('pa')::uuid, pg_temp.k('yara')::uuid, 'suelta', '10:00', 1, 60, 'otra obs zzcent11o', 'rechazada', '2026-03-02', 'solicitud');
insert into public.solicitud (profesor_id, alumno_id, tipo, reserva_id, fecha_clase, estado, motivo, respondida_en)
select pg_temp.k('pa')::uuid, pg_temp.k('yara')::uuid, 'reserva', r.id, '2026-03-02 13:00:00+00', 'rechazada', 'motivo zzcent11s', '2026-02-20 12:00:00+00'
  from public.reserva r where r.alumno_id = pg_temp.k('yara')::uuid and r.estado = 'rechazada';
insert into public.mail_salida (profesor_id, alumno_id, tipo, destinatario, asunto, cuerpo_texto, estado)
values (pg_temp.k('pa')::uuid, pg_temp.k('yara')::uuid, 'clase_creada', 'yara.zzcent11m@example.test', 'Asunto zzcent11b', 'Cuerpo zzcent11b', 'enviado');
update auth.users set raw_user_meta_data = '{"nombre": "Yara zzcent11n"}', email = 'yara.zzcent11m@example.test' where id = pg_temp.u(2);
insert into auth.identities (provider_id, user_id, identity_data, provider)
values (pg_temp.u(2)::text, pg_temp.u(2), jsonb_build_object('sub', pg_temp.u(2)::text, 'email', 'yara.zzcent11m@example.test'), 'email');
insert into auth.audit_log_entries (instance_id, id, payload, created_at)
values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
        jsonb_build_object('actor_id', pg_temp.u(2), 'traits', jsonb_build_object('user_id', pg_temp.u(2), 'email', 'yara.zzcent11m@example.test')), now());
insert into auth.refresh_tokens (instance_id, token, user_id) values ('00000000-0000-0000-0000-000000000000', 'zzcent11-token', pg_temp.u(2)::text);
select pg_temp.persona(3, 'zoe', 'Zoe', 'aprobado', null, '2026-01-01');     -- fin de la última clase = exactamente hace 6 meses: se borra
select pg_temp.clase('pa', 'zoe', '2026-05-02 14:00:00+00');
select pg_temp.persona(4, 'walt', 'Walt', null, 'aprobado', '2026-01-01');   -- 6 meses menos un minuto: no se borra
select pg_temp.clase('pb', 'walt', '2026-05-02 14:01:00+00');
select pg_temp.persona(5, 'ulises', 'Ulises', 'aprobado', null, '2026-01-01');   -- CA-09: ingresó 5 meses después de su última clase
select pg_temp.clase('pa', 'ulises', '2026-05-01 15:00:00+00');
select pg_temp.persona(6, 'vera', 'Vera', null, 'aprobado', '2026-01-01');       -- igual que Ulises pero sin ingreso
select pg_temp.clase('pb', 'vera', '2026-05-01 15:00:00+00');
select pg_temp.persona(11, 'rita', 'Rita', 'rechazado', null, '2026-01-01', 'motivo zzcent11m', 'como llegó zzcent11c');   -- CA-45: rechazada con motivo
-- Aviso de 7 días (AVI-06): vence en 6, 8, 7 días justos, 7 días y un minuto, y una persona sin cuenta que vence en 5.
select pg_temp.persona(7, 'ana1', 'Ana Uno', 'aprobado', null, '2026-01-01');
select pg_temp.clase('pa', 'ana1', '2026-05-08 14:00:00+00');
select pg_temp.persona(8, 'ana2', 'Ana Dos', null, 'aprobado', '2026-01-01');
select pg_temp.clase('pb', 'ana2', '2026-05-10 14:00:00+00');
select pg_temp.persona(9, 'ana3', 'Ana Tres', null, 'aprobado', '2026-01-01');
select pg_temp.clase('pb', 'ana3', '2026-05-09 14:00:00+00');
select pg_temp.persona(10, 'ana4', 'Ana Cuatro', 'aprobado', null, '2026-01-01');
select pg_temp.clase('pa', 'ana4', '2026-05-09 14:01:00+00');
insert into public.alumno (nombre, telefono, fecha_nacimiento, estado, creado_en, creado_por, ficha_origen_profesor_id)
values ('Sin Cuenta Cinco', '099 555 555', '1980-05-05', 'completa', '2026-01-01', current_setting('rtc.pa')::uuid, current_setting('rtc.pa')::uuid);
select set_config('rtc.ana5', (select id::text from public.alumno where nombre = 'Sin Cuenta Cinco'), true) is not null as _;
insert into public.inscripcion (alumno_id, profesor_id, estado) values (pg_temp.k('ana5')::uuid, pg_temp.k('pa')::uuid, 'sin_cuenta');
select pg_temp.clase('pa', 'ana5', '2026-05-07 14:00:00+00');

-- 2. Vencimientos por persona (DEC-26 A, CA-59, SEC-27) --------------------------------------------------------------------------
select is(privado.vence_inactividad_en(pg_temp.k('xavi')::uuid, public.app_ahora()), '2027-03-02 16:00:00+00'::timestamptz,
  'CA-59: con A hace 7 meses y con B hace 2, vence 6 meses después de la última clase con B (2027-03-02)');
select is(privado.vence_inactividad_en(pg_temp.k('yara')::uuid, public.app_ahora()), '2026-10-20 16:00:00+00'::timestamptz,
  'CA-59: con A y B hace más de 6 meses, vence 6 meses después de la última con cualquiera, ya pasado');
select is(privado.vence_inactividad_en(pg_temp.k('zoe')::uuid, public.app_ahora()), public.app_ahora(),
  'SEC-27: con el fin de la última clase hace exactamente 6 meses vence ahora');
select is(privado.vence_inactividad_en(pg_temp.k('walt')::uuid, public.app_ahora()), public.app_ahora() + interval '1 minute',
  'SEC-27: con 6 meses menos un minuto todavía le falta un minuto');
select ok((select count(*) = 0 from privado.vencimientos_inactividad(public.app_ahora()) v where v.alumno_id = pg_temp.k('xavi')::uuid and v.vence_en <= public.app_ahora()),
  'CA-59: Xavi no figura entre los vencidos');
select is(pg_temp.restos('zzcent11|099 118 877|99118877|1987-06-15|1991-12-19') like '%public.alumno:%' and pg_temp.restos('zzcent11') like '%auth.users:%'
          and pg_temp.restos('zzcent11') like '%public.solicitud:%' and pg_temp.restos('zzcent11') like '%public.reserva:%'
          and pg_temp.restos('zzcent11') like '%public.inscripcion:%' and pg_temp.restos('zzcent11') like '%public.mail_salida:%'
          and pg_temp.restos('zzcent11') like '%auth.identities:%' and pg_temp.restos('zzcent11') like '%auth.audit_log_entries:%'
          and pg_temp.restos('zzcent11') like '%auth.refresh_tokens:%', true,
  'SEC-26: antes de la retención los centinelas están en alumno, auth.users, identities, audit_log, refresh_tokens, solicitud, reserva, inscripcion y mail_salida');

-- 3. ALU-11 (CA-09): el ingreso 5 meses después de la última clase evita el borrado --------------------------------------------------
update public.alumno set aviso_inactividad_en = '2026-09-25 12:00:00+00' where id = pg_temp.k('ulises')::uuid;
select pg_temp.reloj('2026-10-01 15:00:00+00');
update auth.users set last_sign_in_at = '2026-10-01 15:00:00+00' where id = pg_temp.u(5);
select pg_temp.reloj('2026-11-02 15:00:00+00');
select is((select ultimo_ingreso from public.alumno where id = pg_temp.k('ulises')::uuid), '2026-10-01 15:00:00+00'::timestamptz,
  'CA-09/ALU-11: el ingreso guarda el último ingreso con la hora de la aplicación');
select is((select aviso_inactividad_en from public.alumno where id = pg_temp.k('ulises')::uuid), null,
  'ALU-11: el ingreso deja sin efecto el aviso de inactividad anterior');
select is(privado.vence_inactividad_en(pg_temp.k('ulises')::uuid, public.app_ahora()), '2027-04-01 15:00:00+00'::timestamptz,
  'CA-09: con el ingreso vence 6 meses después de él, no de la última clase');
select is(privado.vence_inactividad_en(pg_temp.k('vera')::uuid, public.app_ahora()), '2026-11-01 16:00:00+00'::timestamptz,
  'CA-09: sin ingreso Vera ya venció (control)');

-- 4. Corrida de la retención a la hora simulada (CA-08, CA-32) --------------------------------------------------------------------
select set_config('rtc.r1', privado.retencion()::text, true) is not null as _;
select is(pg_temp.k('r1')::jsonb ->> 'ok', 'true', 'SEC-28: la retención devuelve ok = true');
select ok((pg_temp.k('r1')::jsonb ->> 'anonimizados')::int >= 4, 'ALU-10: anonimizó al menos a Yara, Zoe, Vera y Rita (los vencidos)');
select is((select string_agg(pg_temp.estado(p), ',' order by p) from unnest(array['yara', 'zoe', 'vera', 'rita']) p), 'borrado,borrado,borrado,borrado',
  'CA-08/CA-59: Yara, Zoe, Vera y Rita quedan borradas');
select is((select string_agg(pg_temp.estado(p), ',' order by p) from unnest(array['xavi', 'walt', 'ulises']) p), 'completa,completa,completa',
  'CA-59/CA-09/SEC-27: Xavi, Walt (6 meses menos un minuto) y Ulises (con ingreso) no se borran');
select is((select nombre || '/' || mail from public.alumno where id = pg_temp.k('xavi')::uuid), 'Xavi/pgtap11.xavi@example.test', 'CA-59: la ficha de Xavi sigue entera');
select is((select count(*)::int from auth.users where id in (pg_temp.u(1), pg_temp.u(4), pg_temp.u(5))), 3, 'CA-59: las cuentas de los que no vencieron siguen');
-- CA-08: qué queda de Yara
select is((select concat_ws('|', nombre, mail, telefono, fecha_nacimiento::text, user_id::text) from public.alumno where id = pg_temp.k('yara')::uuid), '',
  'CA-08: Yara queda sin nombre, mail, teléfono, fecha de nacimiento ni usuario');
select is((select borrado_en from public.alumno where id = pg_temp.k('yara')::uuid), public.app_ahora(), 'CA-08: borrado_en es la hora simulada');
select is((select count(*)::int from public.persona_a_cargo where alumno_id = pg_temp.k('yara')::uuid), 0, 'CA-08: sus personas a cargo se borran');
select is((select count(*)::int from public.clase where alumno_id = pg_temp.k('yara')::uuid and estado = 'confirmada' and persona_a_cargo_id is null), 2,
  'CA-08: sus dos clases pasadas siguen contando en el historial (confirmadas), sin la persona a cargo');
select is((select string_agg(pg_temp.insc('yara', p), ',' order by p) from unnest(array['pa', 'pb']) p), 'baja/-/-,baja/-/-',
  'ALU-10: sus inscripciones con A y con B pasan a baja y sin motivo ni «cómo llegó»');
select is((select count(*)::int from public.reserva where alumno_id = pg_temp.k('yara')::uuid and observacion is not null), 0, 'SEC-26: ninguna reserva suya conserva la observación');
select is((select count(*)::int from public.solicitud where alumno_id = pg_temp.k('yara')::uuid and motivo is not null), 0, 'SEC-26: ninguna solicitud suya conserva el motivo');
select is((select destinatario is null and asunto is null and cuerpo_texto is null from public.mail_salida where alumno_id = pg_temp.k('yara')::uuid and tipo = 'clase_creada'), true,
  'SEC-26: el mail que la nombra queda sin destinatario, asunto ni cuerpo');
select is((select count(*)::int from auth.users where id = pg_temp.u(2)), 0, 'CA-08: su usuario de Auth se borra');
-- CA-45: el motivo de rechazo ya no existe tras la retención
select is(pg_temp.insc('rita', 'pa'), 'baja/-/-', 'CA-45/ALU-10: tras la retención de Rita, rechazada con motivo, inscripcion.motivo_estado y como_llego son nulos');
select is((select count(*)::int from public.inscripcion where motivo_estado is not null and alumno_id = pg_temp.k('rita')::uuid), 0, 'CA-45: no queda motivo de rechazo de Rita');
-- SEC-26: barrido de centinelas
select is(pg_temp.restos('zzcent11|099 118 877|99118877|1987-06-15|1991-12-19'), '',
  'SEC-26/H-004: sin restos de los centinelas (nombre, mail, teléfono, fecha, persona a cargo, motivo de rechazo, cómo llegó, motivo de solicitud, observación, mails, Auth) en public, auth ni privado');
select is(pg_temp.restos('Hija zzcent11p|yara.zzcent11m'), '', 'SEC-26: ni el nombre de la persona a cargo ni el mail de Yara en ninguna tabla');
-- Idempotencia
select is((select (privado.retencion() ->> 'anonimizados')::int from (select 1) _), 0, 'ALU-10: una segunda corrida no encuentra a nadie más');

-- 5. Aviso de inactividad (CA-32, AVI-06, AVI-07) ------------------------------------------------------------------------------------
select is((select string_agg(pg_temp.n_mails(p, 'aviso_inactividad')::text, ',' order by p) from unnest(array['ana1', 'ana2', 'ana3', 'ana4', 'xavi']) p), '1,0,1,0,0',
  'CA-32: aviso a quien vence en 6 días y en 7 justos; no a quien vence en 7 días y un minuto, en 8 ni a Xavi (con B hace 2 meses)');
select is((select string_agg((aviso_inactividad_en is not null)::text, ',' order by nombre) from public.alumno where id in (select pg_temp.k(p)::uuid from unnest(array['ana1', 'ana2', 'ana3', 'ana4', 'xavi', 'ana5']) p)),
  'false,false,true,true,true,false', 'CA-32: la marca queda en Ana Uno, Ana Tres y la persona sin cuenta; no en Ana Dos, Ana Cuatro ni Xavi');
select is((select aviso_inactividad_en from public.alumno where id = pg_temp.k('ana1')::uuid), public.app_ahora(), 'CA-32: la marca es la hora simulada');
select is(pg_temp.n_mails('ana5', 'aviso_inactividad'), 0, 'AVI-06: la persona sin cuenta ni mail no recibe aviso, pero queda marcada');
select is((select count(*)::int from public.mail_salida where alumno_id = pg_temp.k('ana1')::uuid and tipo = 'aviso_inactividad'
            and profesor_id is null and remitente_nombre = 'Agenda Clases App' and responder_a is null and destinatario = 'pgtap11.ana1@example.test'
            and estado = 'pendiente'), 1, 'AVI-07/CA-33: el aviso sale con el nombre del servicio, sin profesor ni Reply-To, al mail de la persona');
select ok((select asunto like '%7 días%' and cuerpo_texto like '%08/11/2026%' and cuerpo_texto !~ '1990|[0-9]{4}-[0-9]{2}-[0-9]{2}'
             from public.mail_salida where alumno_id = pg_temp.k('ana1')::uuid and tipo = 'aviso_inactividad'),
  'CA-32/SEC-29: el aviso dice «7 días» y la fecha del borrado (08/11/2026), sin fecha de nacimiento');
select is((select (privado.retencion() ->> 'avisos')::int from (select 1) _), 0, 'CA-32: una segunda corrida el mismo día no repite el aviso');
select is(pg_temp.n_mails('ana1', 'aviso_inactividad') + pg_temp.n_mails('ana3', 'aviso_inactividad'), 2, 'CA-32: exactamente un aviso por persona');
select pg_temp.reloj('2026-11-03 15:00:00+00');
select privado.retencion() is not null as _;
select is(pg_temp.n_mails('ana1', 'aviso_inactividad') || ',' || pg_temp.n_mails('ana3', 'aviso_inactividad') || ',' || pg_temp.n_mails('ana2', 'aviso_inactividad') || ',' || pg_temp.n_mails('ana4', 'aviso_inactividad'), '1,1,1,1',
  'CA-32: al día siguiente Ana Uno y Ana Tres no repiten (la marca vale para ese vencimiento) y entran Ana Dos y Ana Cuatro, que ahora vencen dentro de 7 días');
select pg_temp.reloj('2026-11-02 15:00:00+00');
-- Un ingreso después del aviso lo deja sin efecto y aparta el borrado
select pg_temp.reloj('2026-11-04 15:00:00+00');
update auth.users set last_sign_in_at = '2026-11-04 15:00:00+00' where id = pg_temp.u(7);
select is((select aviso_inactividad_en from public.alumno where id = pg_temp.k('ana1')::uuid), null, 'ALU-11/CA-09: Ana Uno ingresó tras el aviso: la marca se limpia');
select pg_temp.reloj('2026-11-10 15:00:00+00');
select privado.retencion() is not null as _;
select is(pg_temp.estado('ana1'), 'completa', 'CA-09: con el ingreso del 4/11, Ana Uno no se borra el 10/11 (aunque su última clase fue hace más de 6 meses)');
select is(pg_temp.estado('ana3'), 'borrado', 'CA-08: Ana Tres, sin ingreso, se borra cuando se cumplen los 6 meses (9/11)');
select is(pg_temp.estado('ana5'), 'borrado', 'CA-08: la persona sin cuenta también (vencía el 7/11)');
select pg_temp.reloj('2026-11-02 15:00:00+00');

-- 6. Recordatorios (CA-31, AVI-05, AVI-07) ------------------------------------------------------------------------------------------
select pg_temp.persona(12, 'rec1', 'Rec Uno', 'aprobado', 'aprobado');
select pg_temp.persona(13, 'rec2', 'Rec Dos', 'aprobado', null);
select pg_temp.persona(14, 'rec3', 'Rec Tres', 'baja', null);
insert into public.persona_a_cargo (id, alumno_id, nombre, fecha_nacimiento)
values ('a1100000-0000-0000-0000-0000000000c9', pg_temp.k('rec2')::uuid, 'Hijo de Rec2', '2015-05-05');
select set_config('rtc.c1', pg_temp.clase('pa', 'rec1', '2026-11-02 15:00:00+00'::timestamptz + interval '24 hours', 'confirmada', 1, '2026-10-30 12:00:00+00')::text, true) is not null as _;
select set_config('rtc.c2', pg_temp.clase('pa', 'rec1', '2026-11-02 15:00:00+00'::timestamptz + interval '25 hours', 'confirmada', 1, '2026-10-30 12:00:00+00')::text, true) is not null as _;
select set_config('rtc.c3', pg_temp.clase('pa', 'rec1', '2026-11-02 15:00:00+00'::timestamptz + interval '23 hours', 'confirmada', 1, '2026-10-30 12:00:00+00')::text, true) is not null as _;
select set_config('rtc.c4', pg_temp.clase('pa', 'rec1', '2026-11-02 15:00:00+00'::timestamptz + interval '23 hours 45 minutes', 'confirmada', 1, '2026-10-30 12:00:00+00')::text, true) is not null as _;
select set_config('rtc.c5', pg_temp.clase('pa', 'rec1', '2026-11-02 15:00:00+00'::timestamptz + interval '24 hours 1 second', 'confirmada', 1, '2026-10-30 12:00:00+00')::text, true) is not null as _;
select set_config('rtc.c8', pg_temp.clase('pa', 'rec1', '2026-11-02 15:00:00+00'::timestamptz + interval '23 hours 45 minutes 1 second', 'confirmada', 1, '2026-10-30 12:00:00+00')::text, true) is not null as _;
select set_config('rtc.c9', pg_temp.clase('pa', 'rec2', '2026-11-02 15:00:00+00'::timestamptz + interval '23 hours 50 minutes', 'confirmada', 1, '2026-10-30 12:00:00+00',
                                          'a1100000-0000-0000-0000-0000000000c9')::text, true) is not null as _;
select set_config('rtc.c10', pg_temp.clase('pa', 'rec1', '2026-11-02 15:00:00+00'::timestamptz + interval '23 hours 55 minutes', 'confirmada', 1,
                                           '2026-11-02 15:00:00+00'::timestamptz + interval '21 hours 55 minutes')::text, true) is not null as _;
select set_config('rtc.c11', pg_temp.clase('pa', 'rec1', '2026-11-02 15:00:00+00'::timestamptz + interval '23 hours 56 minutes', 'cancelada', 1)::text, true) is not null as _;
select set_config('rtc.c12', pg_temp.clase('pa', 'rec3', '2026-11-02 15:00:00+00'::timestamptz + interval '23 hours 57 minutes', 'confirmada', 1, '2026-10-30 12:00:00+00')::text, true) is not null as _;
select set_config('rtc.c13', pg_temp.clase('pb', 'rec1', '2026-11-02 15:00:00+00'::timestamptz + interval '24 hours', 'confirmada', 1, '2026-10-30 12:00:00+00')::text, true) is not null as _;
select set_config('rtc.rr1', privado.recordatorios()::text, true) is not null as _;
select is(pg_temp.k('rr1')::jsonb ->> 'ok', 'true', 'SEC-28: el job de recordatorios devuelve ok = true');
select ok((pg_temp.k('rr1')::jsonb ->> 'recordatorios')::int >= 4 and (pg_temp.k('rr1')::jsonb ->> 'sin_mail')::int >= 1, 'AVI-05: encoló los recordatorios de la ventana y contó el que no tiene a quién');
select is((select string_agg(case when recordatorio_en is null then 'n' else 'm' end, '' order by n) from (values (1, 'c1'), (2, 'c2'), (3, 'c3'), (4, 'c4'), (5, 'c5'), (8, 'c8'), (9, 'c9'), (10, 'c10'), (11, 'c11'), (12, 'c12'), (13, 'c13')) t (n, c)
            join public.clase cl on cl.id = pg_temp.k(t.c)::uuid), 'mnnnnmmmnmm',
  'CA-31: marca solo las de la ventana (23 h 45 min, 24 h]: 24 h, 23 h 45 min 1 s, 23 h 50 min, 23 h 55 min, 23 h 57 min y la de B; no 25 h, 23 h, 23 h 45 min justo, 24 h 1 s ni la cancelada');
select is((select count(*)::int from public.mail_salida where alumno_id = pg_temp.k('rec1')::uuid and tipo = 'recordatorio' and profesor_id = pg_temp.k('pa')::uuid), 2,
  'CA-31: Rec Uno recibe dos recordatorios de A (24 h y 23 h 45 min 1 s), uno por clase');
select is((select count(*)::int from public.mail_salida where alumno_id = pg_temp.k('rec1')::uuid and tipo = 'recordatorio' and profesor_id = pg_temp.k('pb')::uuid), 1,
  'CA-31: y uno de B por su clase con B');
select is(pg_temp.n_mails('rec2', 'recordatorio') || '/' || pg_temp.n_mails('rec3', 'recordatorio'), '1/0',
  'AVI-05: Rec Dos recibe el suyo; Rec Tres, dado de baja con A, queda marcada sin mail; la confirmada con menos de 24 h tampoco manda (c10)');
select ok((select remitente_nombre = 'Profe A' and responder_a = 'pgtap11.profa@example.test' and asunto = 'Recordatorio: tu clase con Profe A' and estado = 'pendiente'
             from public.mail_salida where alumno_id = pg_temp.k('rec2')::uuid and tipo = 'recordatorio'),
  'AVI-07/CA-33: el recordatorio sale con el nombre del profesor A y Reply-To a su mail');
select ok((select remitente_nombre = 'Profe B' and responder_a = 'pgtap11.profb@example.test' and asunto = 'Recordatorio: tu clase con Profe B'
             from public.mail_salida where alumno_id = pg_temp.k('rec1')::uuid and tipo = 'recordatorio' and profesor_id = pg_temp.k('pb')::uuid),
  'AVI-07: el de la clase con B sale con el nombre de B y Reply-To a B');
select ok((select cuerpo_texto like '%Toma la clase: Hijo de Rec2%' and cuerpo_texto !~* '(2015|nacimiento)' from public.mail_salida where alumno_id = pg_temp.k('rec2')::uuid and tipo = 'recordatorio'),
  'SEC-29: el recordatorio nombra a la persona a cargo y no trae fecha de nacimiento');
select is((select privado.recordatorios() ->> 'recordatorios'), '0', 'CA-31: una segunda corrida con la misma hora no manda otro recordatorio');
select is((select count(*)::int from public.mail_salida where tipo = 'recordatorio' and alumno_id in (pg_temp.k('rec1')::uuid, pg_temp.k('rec2')::uuid)), 4,
  'CA-31: sigue habiendo exactamente un mail por clase confirmada de la ventana (4)');
select pg_temp.reloj('2026-11-02 15:15:00+00');
select is((select privado.recordatorios() ->> 'recordatorios'), '1', 'CA-31: 15 minutos después le toca a la de 24 h 1 s (ahora a 23 h 45 min 1 s)');
select is((select recordatorio_en is not null from public.clase where id = pg_temp.k('c5')::uuid) and (select recordatorio_en is null from public.clase where id = pg_temp.k('c4')::uuid), true,
  'CA-31: la de 23 h 45 min justo, que quedó fuera de la ventana, no se manda con retraso');
select pg_temp.reloj('2026-11-02 15:00:00+00');

-- 7. Borrado por el profesor (CA-10, CA-57, ALU-12, SEC-06) ---------------------------------------------------------------------------
select pg_temp.persona(21, 'cora', 'Cora', 'aprobado', 'aprobado');
select pg_temp.persona(22, 'rosa', 'Rosa', 'rechazado', null, '2026-11-01 12:00:00+00', 'motivo de Rosa', 'cómo Rosa zzcent11r');
select pg_temp.clase('pa', 'cora', '2026-10-20 13:00:00+00', 'confirmada', 3600, null, null, 'obs pasada Cora');
select pg_temp.clase('pa', 'cora', '2026-11-04 13:00:00+00');
select pg_temp.clase('pa', 'cora', '2026-11-11 13:00:00+00');
select pg_temp.clase('pb', 'cora', '2026-11-05 10:00:00+00');
select set_config('rtc.cl_pend', pg_temp.clase('pa', 'cora', '2026-11-06 13:00:00+00', 'pendiente')::text, true) is not null as _;
insert into public.solicitud (profesor_id, alumno_id, tipo, reserva_id, fecha_clase, estado, motivo)
select pg_temp.k('pa')::uuid, pg_temp.k('cora')::uuid, 'reserva', c.reserva_id, c.inicio, 'pendiente', 'motivo Cora' from public.clase c where c.id = pg_temp.k('cl_pend')::uuid;
select is(pg_temp.agenda('2026-11-04', '10:00'), 'ocupado', 'CA-10: antes de borrarla, la clase de Cora del 4/11 10:00 ocupa el hueco de A');
-- SEC-06: quién puede llamar
select is(pg_temp.err(pg_temp.borrar(pg_temp.u(902), 'rosa')), 'PT404 NO_ENCONTRADO', 'SEC-06/CA-57: B no puede borrar a Rosa, que no es suya: 404 como si no existiera');
select is(pg_temp.err(pg_temp.q(pg_temp.u(902), 'select public.borrar_alumno(''00000000-0000-0000-0000-00000000dead''::uuid)::text')), 'PT404 NO_ENCONTRADO',
  'SEC-06: B con un id inexistente recibe lo mismo (no revela si existe)');
select is(pg_temp.err(pg_temp.borrar(pg_temp.u(21), 'rosa')), 'PT403 PROHIBIDO', 'SEC-06: una persona con cuenta no puede borrar a nadie: 403');
select is(pg_temp.err(pg_temp.borrar(pg_temp.u(903), 'rosa')), 'PT403 PROHIBIDO', 'SEC-06: el Administrador que no es profesor: 403');
select is(pg_temp.err(pg_temp.q(null, format('select public.borrar_alumno(%L::uuid)::text', pg_temp.k('rosa')), 'anon')), '42501 permission denied for function borrar_alumno',
  'SEC-04/SEC-06: anon sin permiso de ejecución');
select is(pg_temp.err(pg_temp.q(pg_temp.u(901), format('select privado.borrar_alumno(%L::uuid)::text', pg_temp.k('rosa')))), '42501 permission denied for function borrar_alumno',
  'SEC-27: la función de privado no es ejecutable por la API');
select is(pg_temp.insc('rosa', 'pa'), 'rechazado/motivo de Rosa/cómo Rosa zzcent11r', 'SEC-06: los intentos ajenos no tocaron a Rosa');
-- CA-10 / CA-57: Cora (cuenta, con A y con B)
select set_config('rtc.b1', pg_temp.borrar(pg_temp.u(901), 'cora'), true) is not null as _;
select is(pg_temp.k('b1')::jsonb, '{"clases_canceladas": 3, "solicitudes_anuladas": 1}'::jsonb,
  'CA-10/CA-57: A borra a Cora: 3 clases canceladas (2 confirmadas y 1 pendiente) y 1 solicitud anulada');
select is((select string_agg(estado, ',' order by inicio) from public.clase where alumno_id = pg_temp.k('cora')::uuid and profesor_id = pg_temp.k('pa')::uuid),
  'confirmada,cancelada,cancelada,cancelada', 'CA-10: las clases futuras con A quedan canceladas; la pasada sigue confirmada');
select is((select estado from public.clase where alumno_id = pg_temp.k('cora')::uuid and profesor_id = pg_temp.k('pb')::uuid), 'confirmada', 'CA-57: la clase con B sigue confirmada');
select is(pg_temp.agenda('2026-11-04', '10:00') || '/' || pg_temp.agenda('2026-11-11', '10:00') || '/' || pg_temp.agenda('2026-11-06', '10:00'), 'libre/libre/libre',
  'CA-10: los huecos de las clases canceladas aparecen libres en la agenda pública de A');
select is((select estado || '/' || coalesce(motivo, '-') from public.solicitud where alumno_id = pg_temp.k('cora')::uuid), 'anulada/-', 'CA-10: la solicitud pendiente queda anulada y sin motivo');
select is((select count(*)::int from public.reserva where alumno_id = pg_temp.k('cora')::uuid and observacion is not null), 0, 'ALU-12: la clase pasada con A queda sin la observación');
select is(pg_temp.insc('cora', 'pa') || ',' || pg_temp.insc('cora', 'pb'), 'baja/-/-,aprobado/-/-',
  'CA-57: la inscripción con A pasa a baja (sin «cómo llegó»); la de B no cambia');
select is((select estado || '/' || nombre || '/' || (user_id is not null)::text from public.alumno where id = pg_temp.k('cora')::uuid), 'completa/Cora/true',
  'CA-10/CA-57: la cuenta y la ficha de Cora siguen');
select is((select count(*)::int from auth.users where id = pg_temp.u(21)), 1, 'CA-10: su usuario de Auth sigue');
select is(pg_temp.q(pg_temp.u(901), format('select count(*) from public.alumno where id = %L', pg_temp.k('cora'))) || '/'
          || pg_temp.q(pg_temp.u(902), format('select count(*) from public.alumno where id = %L', pg_temp.k('cora'))), '0/1', 'CA-57: A deja de verla; B la sigue viendo');
select is(pg_temp.q(pg_temp.u(901), format('select count(*) || ''/'' || count(titular) from public.v_clases where id in (select id from public.clase where alumno_id = %L)', pg_temp.k('cora'))) || ','
          || pg_temp.q(pg_temp.u(902), format('select count(*) || ''/'' || count(titular) from public.v_clases where id in (select id from public.clase where alumno_id = %L)', pg_temp.k('cora'))), '4/0,1/1',
  'CA-57: A conserva las 4 clases en su historial pero sin el nombre de Cora (titular nulo); B ve su clase con el nombre');
select is(pg_temp.n_mails('cora', 'clase_cancelada') + pg_temp.n_mails('cora', 'solicitud_respondida'), 0, 'DEC-05 A: el borrado no manda mails');
select is(pg_temp.err(pg_temp.borrar(pg_temp.u(901), 'cora')), 'PT404 NO_ENCONTRADO', 'ALU-12: repetir el borrado da 404: ya la dio de baja');
select is(pg_temp.q(pg_temp.u(21), $$select count(*) from public.v_mis_clases where profesor_id is not null$$) is not null, true, 'CA-57: Cora sigue entrando a Mis clases');
-- Rosa (CA-45 tras borrar_alumno)
select is(pg_temp.err(pg_temp.borrar(pg_temp.u(901), 'rosa')), 'OK', 'CA-45/ALU-12: A borra a Rosa, rechazada por A con motivo');
select is(pg_temp.insc('rosa', 'pa'), 'baja/-/-', 'CA-45: tras borrar_alumno, inscripcion.motivo_estado y como_llego son nulos');
select is((select estado || '/' || (user_id is not null)::text from public.alumno where id = pg_temp.k('rosa')::uuid), 'completa/true', 'CA-10: Rosa tiene cuenta: su cuenta y su ficha siguen');
select is(pg_temp.restos('motivo de Rosa|zzcent11r'), '', 'SEC-26: ni el motivo de Rosa ni su «cómo llegó» quedan en ninguna tabla');

-- Persona sin cuenta sola: se anonimiza (CA-10, CA-57)
select set_config('rtc.s1', pg_temp.q(pg_temp.u(901), $$select (public.alta_alumno('Sofi Sola', '099 311 311', '1994-04-04', null) ->> 'alumno_id')$$), true) is not null as _;
insert into public.persona_a_cargo (id, alumno_id, nombre, fecha_nacimiento)
values ('a1100000-0000-0000-0000-0000000000d1', pg_temp.k('s1')::uuid, 'Hijo zzcent11sola', '2016-06-06');
select pg_temp.clase('pa', 's1', '2026-10-19 13:00:00+00', 'confirmada', 3600, null, 'a1100000-0000-0000-0000-0000000000d1');
select pg_temp.clase('pa', 's1', '2026-11-09 13:00:00+00', 'confirmada', 3600, null, 'a1100000-0000-0000-0000-0000000000d1');
select is(pg_temp.k('s1') is not null and (select count(*)::int from public.inscripcion where alumno_id = pg_temp.k('s1')::uuid) = 1, true, 'preparación: Sofi, sin cuenta, solo con A');
select is(pg_temp.borrar(pg_temp.u(901), 's1')::jsonb, '{"clases_canceladas": 1, "solicitudes_anuladas": 0}'::jsonb, 'CA-10/CA-57: A borra a Sofi (sin cuenta, solo suya): se cancela su clase futura');
select is((select concat_ws('|', nombre, mail, telefono, fecha_nacimiento::text, user_id::text) || '/' || estado from public.alumno where id = pg_temp.k('s1')::uuid), '/borrado',
  'CA-10/CA-57: sus datos se borran como en ALU-10');
select is((select count(*)::int from public.persona_a_cargo where alumno_id = pg_temp.k('s1')::uuid), 0, 'CA-57: sus personas a cargo se borran');
select is((select string_agg(estado, ',' order by inicio) from public.clase where alumno_id = pg_temp.k('s1')::uuid), 'confirmada,cancelada', 'CA-08/CA-57: la clase pasada sigue en el historial sin nombre; la futura quedó cancelada');
select is(pg_temp.insc('s1', 'pa'), 'baja/-/-', 'CA-57: su inscripción con A pasa a baja');
select is(pg_temp.restos('zzcent11sola|Sofi Sola|099 311 311|99311311|1994-04-04|2016-06-06'), '', 'SEC-26: sin restos de Sofi ni de su persona a cargo');

-- Sin cuenta con otro profesor: no se anonimiza hasta que el último la da de baja (DEC-26 A)
select set_config('rtc.s2', pg_temp.q(pg_temp.u(901), $$select (public.alta_alumno('Seba Compartido', '099 322 322', '1995-05-05', null) ->> 'alumno_id')$$), true) is not null as _;
insert into public.inscripcion (alumno_id, profesor_id, estado) values (pg_temp.k('s2')::uuid, pg_temp.k('pb')::uuid, 'sin_cuenta');
select pg_temp.clase('pb', 's2', '2026-11-12 10:00:00+00');
select is(pg_temp.err(pg_temp.borrar(pg_temp.u(901), 's2')), 'OK', 'CA-57: A borra a Seba, sin cuenta pero también alumno de B');
select is((select nombre || '/' || estado from public.alumno where id = pg_temp.k('s2')::uuid), 'Seba Compartido/completa', 'CA-57: sus datos siguen porque tiene otro profesor');
select is(pg_temp.insc('s2', 'pa') || ',' || pg_temp.insc('s2', 'pb'), 'baja/-/-,sin_cuenta/-/-', 'CA-57: con A pasó a baja; con B sigue');
select is((select estado from public.clase where alumno_id = pg_temp.k('s2')::uuid), 'confirmada', 'CA-57: su clase con B sigue');
select is(pg_temp.q(pg_temp.u(901), format('select count(*) from public.alumno where id = %L', pg_temp.k('s2'))) || '/'
          || pg_temp.q(pg_temp.u(902), format('select count(*) from public.alumno where id = %L', pg_temp.k('s2'))), '0/1', 'CA-57: A deja de verlo; B lo sigue viendo');
select is(pg_temp.borrar(pg_temp.u(902), 's2')::jsonb, '{"clases_canceladas": 1, "solicitudes_anuladas": 0}'::jsonb, 'CA-57: B, el último, lo borra: se cancela su clase');
select is((select coalesce(nombre, '-') || '/' || estado from public.alumno where id = pg_temp.k('s2')::uuid), '-/borrado', 'CA-57: ahora sí se anonimiza');

-- H-355: los mails `pendiente` y `enviando` de la persona pasan a `fallido` sin datos al anonimizar o borrar; los `enviado` quedan
select set_config('rtc.h1', pg_temp.q(pg_temp.u(901), $$select (public.alta_alumno('Hugo Hache', '099 355 355', '1996-06-06', null) ->> 'alumno_id')$$), true) is not null as _;
insert into public.mail_salida (profesor_id, alumno_id, tipo, destinatario, asunto, cuerpo_texto, estado) values
  (pg_temp.k('pa')::uuid, pg_temp.k('h1')::uuid, 'clase_creada', 'h1.pend.zzcent11h@example.test', 'Asunto zzcent11h', 'Cuerpo zzcent11h', 'pendiente'),
  (pg_temp.k('pa')::uuid, pg_temp.k('h1')::uuid, 'clase_creada', 'h1.env.zzcent11h@example.test', 'Asunto zzcent11h', 'Cuerpo zzcent11h', 'enviando'),
  (pg_temp.k('pa')::uuid, pg_temp.k('h1')::uuid, 'clase_creada', 'h1.ok.zzcent11h@example.test', 'Asunto ok', 'Cuerpo ok', 'enviado');
select privado.anonimizar_alumno(pg_temp.k('h1')::uuid) is not null as _;
select is((select string_agg(estado || '/' || (destinatario is null and asunto is null and cuerpo_texto is null and motivo_fallo is null)::text, ',' order by estado)
             from public.mail_salida where alumno_id = pg_temp.k('h1')::uuid and estado <> 'enviado'), 'fallido/true,fallido/true',
  'H-355/SEC-26: al anonimizar, el mail pendiente y el enviando quedan fallidos sin destinatario, asunto, cuerpo ni motivo');
select is((select destinatario from public.mail_salida where alumno_id = pg_temp.k('h1')::uuid and estado = 'enviado'), null,
  'H-355/SEC-26: el enviado también pierde el destinatario (dato personal) y sigue enviado');
with u as (update public.mail_salida set estado = 'fallido', motivo_fallo = 'zzcent11h' where alumno_id = pg_temp.k('h1')::uuid and estado = 'enviando' returning 1)
select is((select count(*)::int from u), 0, 'H-355: el PATCH de enviar-mail (enviando -> fallido) ya no encuentra el mail: no escribe motivo con datos');
select is(pg_temp.restos('zzcent11h'), '', 'H-355/SEC-26: ningún resto del centinela de los mails en curso');
-- borrar_alumno: solo los mails en curso de ese profesor; los de otro profesor no cambian
select set_config('rtc.h2', pg_temp.q(pg_temp.u(901), $$select (public.alta_alumno('Hilda Hache', '099 356 356', '1997-07-07', null) ->> 'alumno_id')$$), true) is not null as _;
insert into public.inscripcion (alumno_id, profesor_id, estado) values (pg_temp.k('h2')::uuid, pg_temp.k('pb')::uuid, 'sin_cuenta');
insert into public.mail_salida (profesor_id, alumno_id, tipo, destinatario, asunto, cuerpo_texto, estado) values
  (pg_temp.k('pa')::uuid, pg_temp.k('h2')::uuid, 'clase_creada', 'h2.a@example.test', 'Asunto A', 'Cuerpo A', 'enviando'),
  (pg_temp.k('pb')::uuid, pg_temp.k('h2')::uuid, 'clase_creada', 'h2.b@example.test', 'Asunto B', 'Cuerpo B', 'enviando');
select is(pg_temp.err(pg_temp.borrar(pg_temp.u(901), 'h2')), 'OK', 'H-355: A borra a Hilda, que también es de B');
select is((select estado || '/' || (destinatario is null and asunto is null and cuerpo_texto is null)::text from public.mail_salida where alumno_id = pg_temp.k('h2')::uuid and profesor_id = pg_temp.k('pa')::uuid),
  'fallido/true', 'H-355: el mail enviando de A queda fallido y sin datos');
select is((select estado || '/' || destinatario from public.mail_salida where alumno_id = pg_temp.k('h2')::uuid and profesor_id = pg_temp.k('pb')::uuid),
  'enviando/h2.b@example.test', 'H-355: el mail enviando de B no cambia');

-- 8. SEC-28 y SEC-27: jobs registrados, corrida registrada, permisos ---------------------------------------------------------------
select is((select count(*)::int from cron.job where jobname in ('retencion', 'recordatorios') and active and username = 'postgres'), 2, 'SEC-28: los jobs retencion y recordatorios están registrados, activos y son de postgres');
select is((select schedule from cron.job where jobname = 'retencion'), '30 3 * * *', 'SEC-28/ALU-10: la retención corre todos los días a las 03:30');
select is((select schedule from cron.job where jobname = 'recordatorios'), '*/15 * * * *', 'SEC-28/AVI-05: los recordatorios corren cada 15 minutos');
select ok((select command ilike '%retencion%' from cron.job where jobname = 'retencion') and (select command ilike '%recordatorios%' from cron.job where jobname = 'recordatorios'),
  'SEC-28: cada job llama al proceso de su nombre');
select is((select count(*)::int from cron.job where jobname in ('barrer_mails', 'extender_series') and active), 2, 'SEC-28: los jobs de B03 y B02 siguen registrados (cuatro en total)');
select is((select count(*)::int from privado.ejecucion_proceso where id > pg_temp.k('id0')::bigint and nombre = 'retencion' and ahora = '2026-11-02 15:00:00+00' and ok and error is null and fin >= inicio and cantidades ? 'anonimizados' and cantidades ? 'avisos'), 3,
  'SEC-28/H-014: cada corrida de la retención quedó registrada con su hora simulada, su resultado y sus cantidades');
select is((select count(*)::int from privado.ejecucion_proceso where id > pg_temp.k('id0')::bigint and nombre = 'recordatorios' and ok and cantidades ? 'recordatorios'), 3, 'SEC-28/H-014: y cada corrida de los recordatorios');
select is((select cantidades ->> 'recordatorios' from privado.ejecucion_proceso where id > pg_temp.k('id0')::bigint and nombre = 'recordatorios' and ahora = '2026-11-02 15:15:00+00'), '1', 'SEC-28: la corrida de las 15:15 registra 1 recordatorio');
select is((select count(*)::int from (select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'privado' and c.relname = 'ejecucion_proceso'
             and (has_table_privilege('anon', c.oid, 'select,insert,update,delete') or has_table_privilege('authenticated', c.oid, 'select,insert,update,delete'))) _), 0,
  'SEC-28: la API no puede leer ni escribir privado.ejecucion_proceso');
select is((select bool_or(has_function_privilege(r, p, 'execute')) from unnest(array['anon', 'authenticated']) r,
            unnest(array['privado.retencion(timestamptz)', 'privado.recordatorios(timestamptz)', 'privado.anonimizar_alumno(uuid, timestamptz)', 'privado.correr_proceso(text)',
                         'privado.pasos_retencion(timestamptz)', 'privado.pasos_recordatorios(timestamptz)', 'privado.vence_inactividad_en(uuid, timestamptz)',
                         'privado.cerrar_agenda_alumno(uuid, uuid, timestamptz)', 'privado.borrar_alumno(uuid)']) p), false,
  'SEC-27/SEC-28: ni anon ni authenticated ejecutan la retención, los recordatorios, el borrado ni sus pasos');
select is((select has_function_privilege('anon', 'public.borrar_alumno(uuid)', 'execute')::text || '/' || has_function_privilege('authenticated', 'public.borrar_alumno(uuid)', 'execute')::text), 'false/true',
  'SEC-06: borrar_alumno es solo de authenticated');
select is(pg_temp.err(pg_temp.q(pg_temp.u(901), 'select privado.retencion()::text')), '42501 permission denied for function retencion', 'SEC-27: un profesor no puede disparar la retención por la API');
select is(pg_temp.err(pg_temp.q(null, 'select privado.retencion()::text', 'anon')), '42501 permission denied for schema privado', 'SEC-27: anon tampoco');
select throws_ok($$call privado.correr_proceso('otro')$$, 'PT422', 'DATOS_INVALIDOS', 'SEC-28: un nombre de proceso desconocido da DATOS_INVALIDOS');
select lives_ok($$call privado.correr_proceso('retencion')$$, 'SEC-28: correr_proceso(retencion), lo que llama el job, termina bien y registra la corrida');
select lives_ok($$call privado.correr_proceso('recordatorios')$$, 'SEC-28: correr_proceso(recordatorios) termina bien');
select is((select count(*)::int from privado.ejecucion_proceso where id > pg_temp.k('id0')::bigint and nombre = 'retencion'), 6, 'SEC-28: la corrida del procedimiento quedó registrada');
-- Una falla se registra con SQLSTATE y mensaje, sin datos, y deshace los pasos
create or replace function privado.pasos_retencion(p_ahora timestamptz) returns jsonb language plpgsql as $f$
begin
  update public.alumno set aviso_inactividad_en = p_ahora where id = current_setting('rtc.xavi')::uuid;
  raise exception 'fallo simulado' using errcode = 'XX001', detail = 'Yara zzcent11n';
end;
$f$;
select set_config('rtc.rf', privado.retencion()::text, true) is not null as _;
select is(pg_temp.k('rf')::jsonb, '{"ok": false, "error": "XX001: fallo simulado"}'::jsonb, 'SEC-28: una falla devuelve ok = false con SQLSTATE y mensaje, sin relanzar');
select is((select ok::text || '/' || error from privado.ejecucion_proceso where nombre = 'retencion' order by id desc limit 1), 'false/XX001: fallo simulado',
  'SEC-28/H-014: la falla queda en ejecucion_proceso con ok = false y su error');
select is((select count(*)::int from privado.ejecucion_proceso where error ~* 'zzcent11|Yara'), 0, 'SEC-17/SEC-29: el error registrado no trae el DETAIL ni datos de filas');
select is((select aviso_inactividad_en from public.alumno where id = pg_temp.k('xavi')::uuid), null, 'SEC-28: los pasos de la corrida fallida se deshicieron (nada a medias)');
select throws_ok($$call privado.correr_proceso('retencion')$$, '2D000', null, 'SEC-28: con la falla, el procedimiento intenta confirmar para dejar la fila y relanzar (en una transacción de prueba termina en 2D000)');

select * from finish();
rollback;
