-- B15 · T15.3 · RPC del Administrador: alta_profesor, listar_profesores y cambiar_estado_profesor.
-- IDs: CA-49, CA-50, CA-61 (rama de B15), CA-63 (rama de B15), CA-64, SEC-04, SEC-06, SEC-09; ADM-01 a ADM-05, DEC-30, DEC-31, DEC-34.
-- Todo con mails @example.test y se deshace con el rollback. Las respuestas de error se comparan como `sqlstate mensaje [detalle]`.
begin;
select plan(65);

-- Ejecuta p_sql con el rol y el `sub` dados y devuelve el valor (texto) o el error. p_sub nulo = sin JWT; '-' = JWT sin `sub`.
create function pg_temp.q(p_sub text, p_sql text, p_rol text default 'authenticated') returns text language plpgsql as $f$
declare v text; d text;
begin
  perform set_config('request.jwt.claims',
    case when p_sub is null then '' when p_sub = '-' then json_build_object('role', p_rol)::text
         else json_build_object('sub', p_sub, 'role', p_rol)::text end, true);
  execute format('set local role %I', p_rol);
  begin
    execute p_sql into v;
    execute 'reset role';
    return v;
  exception when others then
    get stacked diagnostics d = pg_exception_detail;
    execute 'reset role';
    return sqlstate || ' ' || sqlerrm || coalesce(' ' || nullif(d, ''), '');
  end;
end;
$f$;
create function pg_temp.usuario(p_id uuid, p_mail text) returns void language sql as $f$
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_mail, now(), now(), now(), '', '', '', '')
$f$;
-- Huella de todo lo que cuelga de un profesor (menos `activo`): inscripciones, reservas, clases, grilla, su fila y sus mails.
create function pg_temp.foto(p uuid) returns text language sql as $f$
  select md5(concat_ws('|',
    (select coalesce(jsonb_agg(to_jsonb(i) order by i.alumno_id), '[]') from public.inscripcion i where i.profesor_id = p),
    (select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]') from public.reserva r where r.profesor_id = p),
    (select coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]') from public.clase c where c.profesor_id = p),
    (select coalesce(jsonb_agg(to_jsonb(g) order by g.id), '[]') from public.grilla_tramo g where g.profesor_id = p),
    (select to_jsonb(x) - 'activo' from public.profesor x where x.id = p),
    (select coalesce(jsonb_agg(to_jsonb(m) order by m.id), '[]') from public.mail_salida m where m.profesor_id = p)))
$f$;

-- Preparación ---------------------------------------------------------------------------------------------------
update privado.reloj_prueba set ahora = '2026-11-02 15:00:00+00';
select privado.configurar_administrador('pgtap15.admin@example.test');
select pg_temp.usuario('e1511000-0000-0000-0000-00000000000d', 'pgtap15.admin@example.test');
select set_config('rtc.pa', privado.configurar_profesor('pgtap15.profa@example.test', 'Profe A', 'pgtap15-a')::text, true) is not null as _;
select set_config('rtc.pb', privado.configurar_profesor('pgtap15.profb@example.test', 'Profe B', 'pgtap15-b')::text, true) is not null as _;
select pg_temp.usuario('e1511000-0000-0000-0000-00000000000a', 'pgtap15.profa@example.test');
select pg_temp.usuario('e1511000-0000-0000-0000-00000000000b', 'pgtap15.profb@example.test');
-- Lucía: ficha completa, aprobada con A y con B. Mateo: solo A, sin cuenta. Nora: solo B. Pía: ficha completa sin vínculos.
select pg_temp.usuario('e1511000-0000-0000-0000-0000000000a1', 'pgtap15.lucia@example.test');
update public.alumno set estado = 'completa', nombre = 'Lucía', telefono = '099 123 456', fecha_nacimiento = '1990-01-01', ficha_completada_en = public.app_ahora()
 where user_id = 'e1511000-0000-0000-0000-0000000000a1';
select set_config('rtc.lucia', (select id::text from public.alumno where user_id = 'e1511000-0000-0000-0000-0000000000a1'), true) is not null as _;
insert into public.alumno (id, estado, nombre, telefono, fecha_nacimiento, mail, ficha_completada_en, ficha_origen_profesor_id, creado_por) values
  ('e1511000-0000-0000-0000-0000000000c1', 'completa', 'Mateo', '+598 99123451', '1991-01-01', null, '2026-01-01T12:00:00Z', current_setting('rtc.pa')::uuid, current_setting('rtc.pa')::uuid),
  ('e1511000-0000-0000-0000-0000000000c2', 'completa', 'Nora', '+598 99123452', '1992-01-01', null, '2026-01-01T12:00:00Z', current_setting('rtc.pb')::uuid, current_setting('rtc.pb')::uuid),
  ('e1511000-0000-0000-0000-0000000000c3', 'completa', 'Pía', '+598 99123453', '1993-01-01', 'pgtap15.pia@example.test', '2026-01-01T12:00:00Z', null, null);
insert into public.inscripcion (alumno_id, profesor_id, estado) values
  (current_setting('rtc.lucia')::uuid, current_setting('rtc.pa')::uuid, 'aprobado'),
  (current_setting('rtc.lucia')::uuid, current_setting('rtc.pb')::uuid, 'aprobado'),
  ('e1511000-0000-0000-0000-0000000000c1', current_setting('rtc.pa')::uuid, 'sin_cuenta'),
  ('e1511000-0000-0000-0000-0000000000c2', current_setting('rtc.pb')::uuid, 'sin_cuenta');
-- Una clase confirmada con A (Mateo) y otra con B (Nora).
insert into public.reserva (id, profesor_id, alumno_id, tipo, hora_local, dia_semana, duracion_min, estado, desde, origen) values
  ('e1511000-0000-0000-0000-0000000000d1', current_setting('rtc.pa')::uuid, 'e1511000-0000-0000-0000-0000000000c1', 'suelta', '10:00', 4, 60, 'confirmada', '2026-11-05', 'profesor'),
  ('e1511000-0000-0000-0000-0000000000d2', current_setting('rtc.pb')::uuid, 'e1511000-0000-0000-0000-0000000000c2', 'suelta', '10:00', 4, 60, 'confirmada', '2026-11-05', 'profesor');
insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado) values
  (current_setting('rtc.pa')::uuid, 'e1511000-0000-0000-0000-0000000000d1', 'e1511000-0000-0000-0000-0000000000c1', '2026-11-05 13:00+00', '2026-11-05 14:00+00', 'confirmada'),
  (current_setting('rtc.pb')::uuid, 'e1511000-0000-0000-0000-0000000000d2', 'e1511000-0000-0000-0000-0000000000c2', '2026-11-05 13:00+00', '2026-11-05 14:00+00', 'confirmada');
-- Ficha incompleta: el trigger de ingreso crea la ficha vacía de este usuario confirmado.
select pg_temp.usuario('e1511000-0000-0000-0000-0000000000a2', 'pgtap15.fich@example.test');
-- Dos profesores con enlace provisional (spec §8): C y D.
select set_config('rtc.pc', privado.configurar_profesor('pgtap15.profc@example.test', 'Profe C', 'pgtap15-prov-c')::text, true) is not null as _;
select set_config('rtc.pd', privado.configurar_profesor('pgtap15.profd@example.test', 'Profe D', 'pgtap15-prov-d')::text, true) is not null as _;
update public.profesor set slug_provisional = true where id in (current_setting('rtc.pc')::uuid, current_setting('rtc.pd')::uuid);
select set_config('rtc.n0', (select count(*)::text from public.profesor), true) is not null as _;

-- 1. Alta: profesor nuevo (CA-49, ADM-02, AGE-01, AGE-02, DEC-34) ---------------------------------------------------------
select set_config('rtc.r1', pg_temp.q('e1511000-0000-0000-0000-00000000000d',
  $$select public.alta_profesor('  PGTap15.Carla@Example.test ', 'Carla', 'pgtap15-carla')$$), true) is not null as _;
select is((current_setting('rtc.r1')::jsonb - 'profesor_id'), '{"slug":"pgtap15-carla","adoptado":false}'::jsonb,
  'CA-49: el alta responde slug y adoptado=false');
select is((select count(*)::int from public.profesor where id = (current_setting('rtc.r1')::jsonb ->> 'profesor_id')::uuid
             and mail = 'pgtap15.carla@example.test' and nombre = 'Carla' and slug = 'pgtap15-carla' and activo and not slug_provisional
             and duracion_min = 60 and anticipacion_horas = 24 and zona_horaria = (select zona_horaria_app from privado.ajustes)),
  1, 'CA-49/ADM-05: el profesor nace activo, con mail en minúsculas, el huso de la instalación y los valores por defecto de AGE-02');
select is((select count(*)::int || '/' || count(distinct dia_semana)::int || '/' || min(desde)::text || '/' || max(hasta)::text
             from public.grilla_tramo where profesor_id = (current_setting('rtc.r1')::jsonb ->> 'profesor_id')::uuid),
  '10/5/08:00:00/18:00:00', 'AGE-01: la agenda arranca con la grilla inicial (lunes a viernes, dos tramos por día)');
select is((select count(*)::int from public.mail_salida where tipo = 'profesor_alta' and destinatario = 'pgtap15.carla@example.test'
             and profesor_id = (current_setting('rtc.r1')::jsonb ->> 'profesor_id')::uuid and alumno_id is null
             and asunto = 'Tu agenda en Agenda Clases App' and remitente_nombre = 'Agenda Clases App' and responder_a is null),
  1, 'ADM-02: un solo mail de alta al profesor, con el nombre del servicio como remitente y sin Reply-To');
select is((select (cuerpo_texto like '%#/p/pgtap15-carla%')::text || '/' || (cuerpo_texto like '%Tu nombre es público%')::text
                  || '/' || (cuerpo_texto like '%tu mail como dirección de respuesta%')::text
             from public.mail_salida where tipo = 'profesor_alta' and destinatario = 'pgtap15.carla@example.test'),
  'true/true/true', 'DEC-34: el mail lleva el enlace del profesor y el aviso de nombre público y mail visible');
-- Con el secreto `url_sitio` el enlace va completo.
delete from vault.secrets where name = 'url_sitio';
select vault.create_secret('https://sitio.example.test/reservas/', 'url_sitio') is not null as _;
select pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select public.alta_profesor('pgtap15.dora@example.test', 'Dora', 'pgtap15-dora')$$);
select is((select cuerpo_texto like '%Tu enlace: https://sitio.example.test/reservas/#/p/pgtap15-dora%'
             from public.mail_salida where tipo = 'profesor_alta' and destinatario = 'pgtap15.dora@example.test'),
  true, 'ADM-02: con el secreto url_sitio el mail trae el enlace completo');

-- 2. Alta: cada error de slug (CA-49, SEC-09) -----------------------------------------------------------------------------
select is(array[
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select public.alta_profesor('pgtap15.s1@example.test', 'S', 'ab')$$),
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select public.alta_profesor('pgtap15.s2@example.test', 'S', 'Carla_1')$$),
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', format('select public.alta_profesor(%L, ''S'', %L)', 'pgtap15.s3@example.test', repeat('a', 31))),
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select public.alta_profesor('pgtap15.s4@example.test', 'S', null)$$),
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select public.alta_profesor('pgtap15.s5@example.test', 'S', 'PGTAP15-A')$$),
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select public.alta_profesor('pgtap15.s6@example.test', 'S', '-abc')$$),
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select public.alta_profesor('pgtap15.s7@example.test', 'S', 'abc-')$$)],
  array_fill('PT422 DATOS_INVALIDOS {"campo":"p_slug"}'::text, array[7]),
  'CA-49/SEC-09: slug corto, con mayúscula o guion bajo, de 31 caracteres, nulo o con guion en un extremo dan 422 p_slug');
select is(array[
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select public.alta_profesor('pgtap15.r1@example.test', 'R', 'admin')$$),
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select public.alta_profesor('pgtap15.r2@example.test', 'R', 'ingreso')$$),
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select public.alta_profesor('pgtap15.r3@example.test', 'R', 'mis-clases')$$),
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select public.alta_profesor('pgtap15.r4@example.test', 'R', 'configuracion')$$)],
  array_fill('PT422 DATOS_INVALIDOS {"campo":"p_slug"}'::text, array[4]),
  'CA-49: un enlace reservado de la lista del contrato da 422 p_slug');
select is(array[
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select public.alta_profesor('pgtap15.u1@example.test', 'U', 'pgtap15-a')$$),
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select public.alta_profesor('pgtap15.u2@example.test', 'U', 'pgtap15-carla')$$),
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select public.alta_profesor('pgtap15.u3@example.test', 'U', 'pgtap15-prov-c')$$)],
  array_fill('PT409 SLUG_YA_USADO'::text, array[3]),
  'CA-49: un enlace ya usado (de un profesor, de uno recién dado de alta o provisional) da 409 SLUG_YA_USADO');
select is((select count(*)::int from public.profesor), current_setting('rtc.n0')::int + 2,
  'CA-49: ninguno de los rechazos creó un profesor (solo Carla y Dora, de las pruebas de arriba)');
select is(array[
    (pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select public.alta_profesor('pgtap15.ok3@example.test', 'Tres', 'abc')$$)::jsonb ->> 'adoptado'),
    (pg_temp.q('e1511000-0000-0000-0000-00000000000d', format('select public.alta_profesor(%L, ''Treinta'', %L)', 'pgtap15.ok30@example.test', repeat('b', 30)))::jsonb ->> 'adoptado')],
  array['false', 'false'], 'CA-49: un enlace de 3 y uno de 30 caracteres se aceptan');

-- 3. Alta: cada error de mail y de nombre (CA-49, CA-61 rama B15, DEC-31, SEC-09) ---------------------------------------------
select is(array[
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select public.alta_profesor(null, 'M', 'pgtap15-m1')$$),
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select public.alta_profesor('   ', 'M', 'pgtap15-m2')$$),
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select public.alta_profesor('sin-arroba', 'M', 'pgtap15-m3')$$),
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select public.alta_profesor('dos@@example.test', 'M', 'pgtap15-m4')$$)],
  array_fill('PT422 DATOS_INVALIDOS {"campo":"p_mail"}'::text, array[4]),
  'SEC-09: un mail nulo, vacío o mal formado da 422 p_mail');
select is(array[
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select public.alta_profesor('pgtap15.n1@example.test', null, 'pgtap15-n1')$$),
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select public.alta_profesor('pgtap15.n2@example.test', '   ', 'pgtap15-n2')$$)],
  array_fill('PT422 DATOS_INVALIDOS {"campo": "p_nombre"}'::text, array[2]),
  'SEC-09: un nombre nulo o vacío da 422 p_nombre');
select is(array[
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select public.alta_profesor('pgtap15.profa@example.test', 'Otra', 'pgtap15-x1')$$),
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select public.alta_profesor('PGTAP15.PROFB@example.test', 'Otra', 'pgtap15-x2')$$),
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select public.alta_profesor('pgtap15.carla@example.test', 'Otra', 'pgtap15-x3')$$)],
  array_fill('PT409 MAIL_YA_REGISTRADO'::text, array[3]),
  'CA-61/ADM-02: el mail de otro profesor (en cualquier capitalización) da 409 MAIL_YA_REGISTRADO sin detalle');
select is(array[
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', format('select public.alta_profesor(%L, ''Otra'', ''pgtap15-l1'')', (select mail::text from public.alumno where id = current_setting('rtc.lucia')::uuid))),
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select public.alta_profesor('pgtap15.pia@example.test', 'Otra', 'pgtap15-l2')$$)],
  array_fill('PT409 MAIL_YA_REGISTRADO'::text, array[2]),
  'CA-61 (rama B15, DEC-31): el mail de una persona con ficha completa, con vínculos o sin ellos, da 409 MAIL_YA_REGISTRADO sin datos');
select is((select count(*)::int from public.profesor where mail in ('pgtap15.pia@example.test', 'pgtap15.lucia@example.test'))
          || '/' || (select count(*) from public.alumno where id = current_setting('rtc.lucia')::uuid and nombre = 'Lucía' and estado = 'completa')
          || '/' || (select count(*) from public.inscripcion where alumno_id = current_setting('rtc.lucia')::uuid and estado = 'aprobado')
          || '/' || (select count(*) from public.alumno where lower(mail::text) in ('pgtap15.pia@example.test', 'pgtap15.lucia@example.test')),
  '0/1/2/2', 'CA-61/DEC-31: el 409 no creó profesor y la ficha, el vínculo y la cuenta de la persona quedaron intactos');
select is(pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select public.alta_profesor('pgtap15.profa@example.test', 'Otra', 'ab')$$),
  'PT422 DATOS_INVALIDOS {"campo":"p_slug"}', 'SEC-09: los campos se validan antes de mirar el mail (un slug inválido con mail repetido da 422)');

-- 4. Adopción del profesor con enlace provisional (spec §8, ADR-021) ---------------------------------------------------------
select set_config('rtc.gc', (select count(*)::text from public.grilla_tramo where profesor_id = current_setting('rtc.pc')::uuid), true) is not null as _;
update public.profesor set duracion_min = 45 where id = current_setting('rtc.pc')::uuid;
select set_config('rtc.r2', pg_temp.q('e1511000-0000-0000-0000-00000000000d',
  $$select public.alta_profesor('PGTAP15.profc@example.test', 'Cecilia Definitiva', 'pgtap15-cecilia')$$), true) is not null as _;
select is(current_setting('rtc.r2')::jsonb, jsonb_build_object('profesor_id', current_setting('rtc.pc'), 'slug', 'pgtap15-cecilia', 'adoptado', true),
  'ADM-02/spec §8: el alta con el mail de un profesor de enlace provisional lo adopta y responde adoptado=true con el mismo id');
select is((select nombre || '/' || slug || '/' || slug_provisional::text || '/' || activo::text || '/' || duracion_min::text
             from public.profesor where id = current_setting('rtc.pc')::uuid),
  'Cecilia Definitiva/pgtap15-cecilia/false/true/45', 'ADM-02: la adopción fija nombre y enlace definitivo y conserva el resto de la configuración');
select is((select count(*)::text from public.grilla_tramo where profesor_id = current_setting('rtc.pc')::uuid), current_setting('rtc.gc'),
  'ADM-02: la adopción conserva la agenda (la grilla) del profesor');
select is((select count(*)::int from public.profesor), current_setting('rtc.n0')::int + 2 + 2 + 0,
  'ADM-02: la adopción no creó otra fila de profesor');
select is((select (cuerpo_texto like '%#/p/pgtap15-cecilia%')::text || '/' || (cuerpo_texto like '%Tu nombre es público%')::text
                  || '/' || (cuerpo_texto like '%arranca de lunes%')::text
             from public.mail_salida where tipo = 'profesor_alta' and destinatario = 'pgtap15.profc@example.test'),
  'true/true/false', 'DEC-34: el profesor adoptado recibe su enlace definitivo y el aviso, sin el texto de la grilla inicial');
select is(pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select public.alta_profesor('pgtap15.profc@example.test', 'Cecilia', 'pgtap15-otra')$$),
  'PT409 MAIL_YA_REGISTRADO', 'ADM-02: una segunda alta con el mail ya adoptado da 409 MAIL_YA_REGISTRADO');
-- D: adoptar con el enlace de otro profesor es 409 y no cambia nada; con su propio enlace provisional es válido.
select is(pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select public.alta_profesor('pgtap15.profd@example.test', 'Dario', 'pgtap15-a')$$),
  'PT409 SLUG_YA_USADO', 'ADM-02: adoptar con el enlace de otro profesor da 409 SLUG_YA_USADO');
select is((select nombre || '/' || slug || '/' || slug_provisional::text from public.profesor where id = current_setting('rtc.pd')::uuid),
  'Profe D/pgtap15-prov-d/true', 'ADM-02: el 409 dejó al profesor provisional como estaba');
select is(pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select public.alta_profesor('pgtap15.profd@example.test', 'Dario', 'pgtap15-prov-d')$$)::jsonb ->> 'adoptado',
  'true', 'ADM-02: adoptar conservando su propio enlace provisional es válido');

-- 5. Persona con ficha incompleta: se vincula y su ficha se reemplaza (CA-61 rama B15, CA-49) -------------------------------
select is((select count(*)::int from public.alumno where user_id = 'e1511000-0000-0000-0000-0000000000a2' and estado = 'ficha_incompleta'), 1,
  'CA-61: antes del alta la persona de ficha incompleta tiene su ficha vacía');
select is(pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select public.alta_profesor('pgtap15.fich@example.test', 'Fina', 'pgtap15-fina')$$)::jsonb ->> 'adoptado',
  'false', 'CA-61: el alta con el mail de una ficha incompleta se acepta');
select is((select count(*)::int from public.alumno where user_id = 'e1511000-0000-0000-0000-0000000000a2' or lower(mail::text) = 'pgtap15.fich@example.test'), 0,
  'CA-61 (rama B15): la ficha incompleta se reemplaza (no queda ficha de alumno de esa persona)');
select is((select user_id::text from public.profesor where slug = 'pgtap15-fina'), 'e1511000-0000-0000-0000-0000000000a2',
  'CA-49: el usuario de Auth que ya existía queda vinculado al profesor');
select is((select public.sesion_actual()::jsonb -> 'profesor' ->> 'slug' || '|' || (public.sesion_actual()::jsonb ->> 'rol')
             from (select set_config('request.jwt.claims', '{"sub":"e1511000-0000-0000-0000-0000000000a2","role":"authenticated"}', true)) _),
  'pgtap15-fina|profesor', 'CA-49: la persona entra y ve su panel de profesor, sin aprobación ni ficha');

-- 6. Inactivar y reactivar con datos de dos profesores (CA-63 rama B15, CA-64, ADM-05) --------------------------------------
select set_config('rtc.fa', pg_temp.foto(current_setting('rtc.pa')::uuid), true) is not null as _;
select set_config('rtc.fb', pg_temp.foto(current_setting('rtc.pb')::uuid), true) is not null as _;
select set_config('rtc.ca', pg_temp.q(null, $$select public.config_publica('pgtap15-a')$$, 'anon'), true) is not null as _;
select set_config('rtc.cb', pg_temp.q(null, $$select public.config_publica('pgtap15-b')$$, 'anon'), true) is not null as _;
select set_config('rtc.mails', (select count(*)::text from public.mail_salida), true) is not null as _;
select is(pg_temp.q('e1511000-0000-0000-0000-00000000000d', format('select public.cambiar_estado_profesor(%L, false)', current_setting('rtc.pa')))::jsonb,
  jsonb_build_object('profesor_id', current_setting('rtc.pa'), 'activo', false), 'CA-64: el Administrador inactiva a A');
select is((select activo::text from public.profesor where id = current_setting('rtc.pa')::uuid) || '/' || (select activo::text from public.profesor where id = current_setting('rtc.pb')::uuid),
  'false/true', 'CA-63: A queda inactivo y B sigue activo');
select is(pg_temp.q(null, $$select public.config_publica('pgtap15-a')$$, 'anon')::jsonb,
  jsonb_build_object('profesor_id', current_setting('rtc.pa'), 'nombre', 'Profe A', 'activo', false),
  'CA-63: el enlace de A solo dice que no toma reservas (sin configuración ni agenda)');
select is(pg_temp.q(null, $$select public.agenda_publica('pgtap15-a', '2026-11-05')$$, 'anon'), 'PT409 PROFESOR_INACTIVO',
  'CA-63: el enlace de A no muestra su agenda (409 PROFESOR_INACTIVO)');
select is(pg_temp.q('e1511000-0000-0000-0000-0000000000a1', $$select public.agenda_publica('pgtap15-a', '2026-11-05')$$), 'PT409 PROFESOR_INACTIVO',
  'CA-63: tampoco se la muestra a una persona con sesión que está aprobada con A');
select is(pg_temp.foto(current_setting('rtc.pa')::uuid) || '/' || pg_temp.foto(current_setting('rtc.pb')::uuid) || '/' || (select count(*) from public.mail_salida),
  current_setting('rtc.fa') || '/' || current_setting('rtc.fb') || '/' || current_setting('rtc.mails'),
  'CA-63: inactivar no cambia ni borra clases, reservas, vínculos, grilla ni mails de A, y no toca nada de B');
select is(pg_temp.q(null, $$select public.config_publica('pgtap15-b')$$, 'anon'), current_setting('rtc.cb'),
  'CA-63: el enlace de B no cambia mientras A está inactivo');
select is(pg_temp.q('e1511000-0000-0000-0000-00000000000d', format('select public.cambiar_estado_profesor(%L, false)', current_setting('rtc.pa')))::jsonb,
  jsonb_build_object('profesor_id', current_setting('rtc.pa'), 'activo', false) , 'ADM-05: inactivar a quien ya está inactivo responde igual');
select is(pg_temp.foto(current_setting('rtc.pa')::uuid), current_setting('rtc.fa'), 'ADM-05: repetir la pausa no cambia nada');
select is(pg_temp.q('e1511000-0000-0000-0000-00000000000d', format('select public.cambiar_estado_profesor(%L, true)', current_setting('rtc.pa')))::jsonb,
  jsonb_build_object('profesor_id', current_setting('rtc.pa'), 'activo', true), 'CA-64: el Administrador reactiva a A');
select is(pg_temp.q(null, $$select public.config_publica('pgtap15-a')$$, 'anon'), current_setting('rtc.ca'),
  'CA-63: al reactivar, el enlace de A vuelve exactamente como estaba');
select is(left(pg_temp.q(null, $$select public.agenda_publica('pgtap15-a', '2026-11-05')$$, 'anon'), 4) <> 'PT40', true,
  'CA-63: al reactivar, la agenda de A vuelve a mostrarse');
select is(pg_temp.foto(current_setting('rtc.pa')::uuid) || '/' || pg_temp.foto(current_setting('rtc.pb')::uuid) || '/' || (select count(*) from public.mail_salida),
  current_setting('rtc.fa') || '/' || current_setting('rtc.fb') || '/' || current_setting('rtc.mails'),
  'CA-63: tras reactivar, todo lo de A y lo de B queda como antes');
select is(array[
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', format('select public.cambiar_estado_profesor(%L, null)', current_setting('rtc.pa'))),
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', format('select public.cambiar_estado_profesor(%L, false)', gen_random_uuid())),
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select public.cambiar_estado_profesor(null, true)$$)],
  array['PT422 DATOS_INVALIDOS {"campo":"p_activo"}', 'PT404 NO_ENCONTRADO', 'PT404 NO_ENCONTRADO'],
  'SEC-09: p_activo nulo da 422, un id inexistente o nulo 404');
select is((select activo::text from public.profesor where id = current_setting('rtc.pa')::uuid), 'true', 'SEC-09: los rechazos no cambiaron el estado de A');
-- DEC-30: ni baja ni cambio de enlace por la API, tampoco para el Administrador (T-ADM-19).
select is(array[
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', format('update public.profesor set slug = ''otro-enlace'' where id = %L returning 1', current_setting('rtc.pa'))),
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', format('delete from public.profesor where id = %L returning 1', current_setting('rtc.pa'))),
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', format('update public.profesor set activo = false where id = %L returning 1', current_setting('rtc.pa')))],
  array_fill('42501 permission denied for table profesor'::text, array[3]),
  'DEC-30/CA-64: el Administrador no cambia enlace, estado ni borra profesores por UPDATE o DELETE directos');
select is((select slug::text || '/' || activo::text from public.profesor where id = current_setting('rtc.pa')::uuid), 'pgtap15-a/true',
  'DEC-30: A y su enlace quedaron intactos');

-- 7. Alumno y profesor reciben 403 en cada RPC [Adm]; anon 42501; sin sub 401 (SEC-06, CA-49, CA-64) ---------------------------
-- Orden: anon, JWT sin sub, ficha incompleta, persona aprobada (Lucía), profesor A, profesor B.
select is(array[
    pg_temp.q(null, $$select public.alta_profesor('pgtap15.z1@example.test', 'Z', 'pgtap15-z1')$$, 'anon'),
    pg_temp.q('-', $$select public.alta_profesor('pgtap15.z1@example.test', 'Z', 'pgtap15-z1')$$),
    pg_temp.q('e1511000-0000-0000-0000-0000000000a2', $$select public.alta_profesor('pgtap15.z1@example.test', 'Z', 'pgtap15-z1')$$),
    pg_temp.q('e1511000-0000-0000-0000-0000000000a1', $$select public.alta_profesor('pgtap15.z1@example.test', 'Z', 'pgtap15-z1')$$),
    pg_temp.q('e1511000-0000-0000-0000-00000000000a', $$select public.alta_profesor('pgtap15.z1@example.test', 'Z', 'pgtap15-z1')$$),
    pg_temp.q('e1511000-0000-0000-0000-00000000000b', $$select public.alta_profesor('pgtap15.z1@example.test', 'Z', 'pgtap15-z1')$$)],
  array['42501 permission denied for function alta_profesor', 'PT401 NO_AUTENTICADO', 'PT403 PROHIBIDO', 'PT403 PROHIBIDO', 'PT403 PROHIBIDO', 'PT403 PROHIBIDO'],
  'SEC-06/CA-49: alta_profesor solo la ejecuta el Administrador (anon 42501, sin sub 401, el resto 403)');
select is(array[
    pg_temp.q(null, $$select public.listar_profesores()$$, 'anon'),
    pg_temp.q('-', $$select public.listar_profesores()$$),
    pg_temp.q('e1511000-0000-0000-0000-0000000000a2', $$select public.listar_profesores()$$),
    pg_temp.q('e1511000-0000-0000-0000-0000000000a1', $$select public.listar_profesores()$$),
    pg_temp.q('e1511000-0000-0000-0000-00000000000a', $$select public.listar_profesores()$$),
    pg_temp.q('e1511000-0000-0000-0000-00000000000b', $$select public.listar_profesores()$$)],
  array['42501 permission denied for function listar_profesores', 'PT401 NO_AUTENTICADO', 'PT403 PROHIBIDO', 'PT403 PROHIBIDO', 'PT403 PROHIBIDO', 'PT403 PROHIBIDO'],
  'SEC-06/CA-50: listar_profesores solo la ejecuta el Administrador (el alumno y el profesor reciben 403)');
select is(array[
    pg_temp.q(null, format('select public.cambiar_estado_profesor(%L, false)', current_setting('rtc.pb')), 'anon'),
    pg_temp.q('-', format('select public.cambiar_estado_profesor(%L, false)', current_setting('rtc.pb'))),
    pg_temp.q('e1511000-0000-0000-0000-0000000000a2', format('select public.cambiar_estado_profesor(%L, false)', current_setting('rtc.pb'))),
    pg_temp.q('e1511000-0000-0000-0000-0000000000a1', format('select public.cambiar_estado_profesor(%L, false)', current_setting('rtc.pb'))),
    pg_temp.q('e1511000-0000-0000-0000-00000000000a', format('select public.cambiar_estado_profesor(%L, false)', current_setting('rtc.pb'))),
    pg_temp.q('e1511000-0000-0000-0000-00000000000b', format('select public.cambiar_estado_profesor(%L, false)', current_setting('rtc.pb')))],
  array['42501 permission denied for function cambiar_estado_profesor', 'PT401 NO_AUTENTICADO', 'PT403 PROHIBIDO', 'PT403 PROHIBIDO', 'PT403 PROHIBIDO', 'PT403 PROHIBIDO'],
  'CA-64/SEC-06: cambiar_estado_profesor solo la ejecuta el Administrador (el profesor B tampoco puede sobre sí mismo)');
select is((select activo::text from public.profesor where id = current_setting('rtc.pb')::uuid) || '/' || (select count(*) from public.profesor where slug = 'pgtap15-z1'),
  'true/0', 'CA-64/CA-49: ninguna de esas llamadas rechazadas cambió el estado de B ni creó un profesor');
select is(array[
    pg_temp.q('e1511000-0000-0000-0000-0000000000a1', $$select public.alta_profesor(null, null, null)$$),
    pg_temp.q('e1511000-0000-0000-0000-00000000000a', $$select public.cambiar_estado_profesor(null, null)$$)],
  array['PT403 PROHIBIDO', 'PT403 PROHIBIDO'], 'SEC-06/SEC-09: el rol se comprueba antes que los campos (con argumentos nulos sigue siendo 403)');

-- 8. privado.es_administrador y el resto de privado: nadie por la API (SEC-04) ---------------------------------------------------
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'privado' and p.proname in ('es_administrador', 'exigir_administrador', 'alta_profesor', 'listar_profesores',
                                                           'cambiar_estado_profesor', 'mail_profesor_alta')
              and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))),
  0, 'SEC-04: es_administrador y las funciones de B15 de privado no son ejecutables por authenticated ni anon');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'privado' and p.proname in ('es_administrador', 'exigir_administrador', 'alta_profesor', 'listar_profesores',
                                                           'cambiar_estado_profesor', 'mail_profesor_alta')), 6,
  'SEC-04: las seis funciones de privado existen (la prueba anterior no pasa en vacío)');
select is(array[
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select privado.es_administrador()$$),
    pg_temp.q('e1511000-0000-0000-0000-0000000000a1', $$select privado.es_administrador()$$),
    pg_temp.q(null, $$select privado.es_administrador()$$, 'anon'),
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select privado.alta_profesor('pgtap15.y@example.test', 'Y', 'pgtap15-y')$$)],
  array['42501 permission denied for function es_administrador', '42501 permission denied for function es_administrador',
        '42501 permission denied for schema privado', '42501 permission denied for function alta_profesor'],
  'SEC-04: ni el Administrador ni una persona ni anon ejecutan privado.es_administrador ni privado.alta_profesor por la API');
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'privado' and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))),
  array['es_profesor', 'mi_alumno_id', 'mi_profesor_id'],
  'SEC-04: las únicas funciones de privado ejecutables por la API son los tres ayudantes de las políticas RLS (ninguna de B15 ni es_administrador)');

-- 9. CA-50: el Administrador que no es profesor ve la lista de profesores y nada de alumnos -------------------------------------
select is(array[
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', 'select count(*) from public.alumno'),
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', 'select count(*) from public.inscripcion'),
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', 'select count(*) from public.reserva'),
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', 'select count(*) from public.clase'),
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', 'select count(*) from public.persona_a_cargo'),
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', 'select count(*) from public.v_alumnos'),
    pg_temp.q('e1511000-0000-0000-0000-00000000000d', 'select count(*) from public.mail_salida')],
  array_fill('0'::text, array[7]),
  'CA-50/ADM-04: el Administrador que no es profesor no lee fichas, vínculos, clases, personas a cargo ni mails (cero filas)');
select is((select array_agg(distinct k order by k) from jsonb_array_elements(pg_temp.q('e1511000-0000-0000-0000-00000000000d', 'select public.listar_profesores()')::jsonb) e,
                                                       jsonb_object_keys(e) k),
  array['activo', 'creado_en', 'mail', 'nombre', 'profesor_id', 'slug'],
  'CA-50/ADM-03: la lista de profesores trae solo columnas del profesor (ningún dato de alumnos)');
select is((select array_agg(e ->> 'nombre') from jsonb_array_elements(pg_temp.q('e1511000-0000-0000-0000-00000000000d', 'select public.listar_profesores()')::jsonb) e),
  (select array_agg(nombre order by nombre, id) from public.profesor), 'ADM-03: la lista sale ordenada por nombre y trae a todos los profesores');
select is((select (e ->> 'activo') from jsonb_array_elements(pg_temp.q('e1511000-0000-0000-0000-00000000000d', 'select public.listar_profesores()')::jsonb) e
             where e ->> 'slug' = 'pgtap15-carla'), 'true', 'ADM-03/CA-64: la lista muestra el estado de cada profesor (Carla, activa)');
select pg_temp.q('e1511000-0000-0000-0000-00000000000d', format('select public.cambiar_estado_profesor(%L, false)', current_setting('rtc.pb')));
select is((select (e ->> 'activo') from jsonb_array_elements(pg_temp.q('e1511000-0000-0000-0000-00000000000d', 'select public.listar_profesores()')::jsonb) e
             where e ->> 'slug' = 'pgtap15-b'), 'false', 'ADM-03/CA-64: tras inactivar a B, la lista lo muestra inactivo');
select pg_temp.q('e1511000-0000-0000-0000-00000000000d', format('select public.cambiar_estado_profesor(%L, true)', current_setting('rtc.pb')));

-- 10. Alta con el mail del Administrador (DEC-31): se acepta y entra como profesor con es_administrador ------------------------
select is(pg_temp.q('e1511000-0000-0000-0000-00000000000d', $$select public.alta_profesor('pgtap15.admin@example.test', 'Admin Profe', 'pgtap15-admprof')$$)::jsonb ->> 'adoptado',
  'false', 'DEC-31: el mail del Administrador se acepta: puede ser además profesor');
select is((select public.sesion_actual()::jsonb -> 'profesor' ->> 'slug' || '|' || (public.sesion_actual()::jsonb ->> 'rol') || '|' || (public.sesion_actual()::jsonb ->> 'es_administrador')
             from (select set_config('request.jwt.claims', '{"sub":"e1511000-0000-0000-0000-00000000000d","role":"authenticated"}', true)) _),
  'pgtap15-admprof|profesor|true', 'DEC-31: el Administrador que es profesor entra como profesor, con es_administrador verdadero');
select is(pg_temp.q('e1511000-0000-0000-0000-00000000000d', 'select jsonb_array_length(public.listar_profesores())::int > 5')::boolean, true,
  'ADM-04: el Administrador que es profesor sigue pudiendo listar profesores');

select * from finish();
rollback;
