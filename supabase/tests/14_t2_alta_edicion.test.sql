-- B14 · T14.2 · Alta y edición de alumnos con la persona única (DEC-29 b, DEC-31, DEC-32 A, DEC-36 A) y dos profesores.
-- IDs: ALU-07, ALU-08, ALU-09, AVI-04, AVI-07, AVI-08, PRF-07, PRF-08, SEC-06, SEC-09. CA-06, CA-27, CA-52, CA-61, CA-63.
-- B15 · T15.0: DEC-38 a (aviso «te sumó» al agregar por edición un mail nuevo a un alumno sin cuenta).
-- Pruebas propias del developer; datos sintéticos (@example.test); todo se deshace con el rollback.
begin;
select plan(32);

create function pg_temp.como(p_sub uuid, p_sql text, p_clave text) returns void language plpgsql as $f$
declare
  v_res text;
  v_det text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql into v_res;
    perform set_config('rtc.' || p_clave || '_est', 'ok', true);
    perform set_config('rtc.' || p_clave || '_res', coalesce(v_res, ''), true);
    perform set_config('rtc.' || p_clave || '_msg', '', true);
    perform set_config('rtc.' || p_clave || '_det', '', true);
  exception when others then
    get stacked diagnostics v_det = pg_exception_detail;
    perform set_config('rtc.' || p_clave || '_est', sqlstate, true);
    perform set_config('rtc.' || p_clave || '_res', '', true);
    perform set_config('rtc.' || p_clave || '_msg', sqlerrm, true);
    perform set_config('rtc.' || p_clave || '_det', coalesce(v_det, ''), true);
  end;
  execute 'reset role';
end;
$f$;
create function pg_temp.r(p_clave text) returns text language sql as $f$
  select current_setting('rtc.' || p_clave || '_est') || ' ' || current_setting('rtc.' || p_clave || '_msg')
$f$;
create function pg_temp.rd(p_clave text) returns text language sql as $f$
  select pg_temp.r(p_clave) || ' ' || current_setting('rtc.' || p_clave || '_det')
$f$;
create function pg_temp.res(p_clave text) returns jsonb language sql as $f$
  select nullif(current_setting('rtc.' || p_clave || '_res'), '')::jsonb
$f$;
create function pg_temp.usuario(p_id uuid, p_mail text) returns void language sql as $f$
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_mail, now(), now(), now(),
          '', '', '', '', '{}')
$f$;
-- Alta como profesor A (o B) y guarda el resultado en rtc.<clave>_*.
create function pg_temp.alta(p_sub uuid, p_nombre text, p_mail text, p_clave text) returns void language sql as $f$
  select pg_temp.como(p_sub, format('select public.alta_alumno(%L, %L, %L, %L)::text', p_nombre, '099 555 666', '1999-09-09', p_mail), p_clave)
$f$;

-- Preparación: A, B, Administrador y Ana (con cuenta, ficha completa, alumna de B).
update privado.reloj_prueba set ahora = '2026-10-21 15:00:00+00';
select set_config('rtc.pa', privado.configurar_profesor('pgtap142.profa@example.test', 'Profe A', 'pgtap142-a')::text, true) is not null as _;
select set_config('rtc.pb', privado.configurar_profesor('pgtap142.profb@example.test', 'Profe B', 'pgtap142-b')::text, true) is not null as _;
select privado.configurar_administrador('pgtap142.admin@example.test');
select pg_temp.usuario('a1420000-0000-0000-0000-00000000000a', 'pgtap142.profa@example.test');
select pg_temp.usuario('a1420000-0000-0000-0000-00000000000b', 'pgtap142.profb@example.test');
select pg_temp.usuario('a1420000-0000-0000-0000-00000000000d', 'pgtap142.admin@example.test');
select pg_temp.usuario('a1420000-0000-0000-0000-000000000001', 'pgtap142.ana@example.test');
update public.alumno set estado = 'completa', nombre = 'Ana Original', telefono = '099 123 456', fecha_nacimiento = '2000-01-01',
                         ficha_completada_en = public.app_ahora()
 where user_id = 'a1420000-0000-0000-0000-000000000001';
select set_config('rtc.ana', (select id::text from public.alumno where user_id = 'a1420000-0000-0000-0000-000000000001'), true) is not null as _;
insert into public.inscripcion (alumno_id, profesor_id, estado, aprobado_en)
values (current_setting('rtc.ana')::uuid, current_setting('rtc.pb')::uuid, 'aprobado', public.app_ahora());

-- 1. alta_alumno: mail nuevo y sin mail (ALU-07, ALU-08, AVI-04) ---------------------------------------------
select pg_temp.alta('a1420000-0000-0000-0000-00000000000a', 'Nuevo', 'pgtap142.nuevo@example.test', 'al_nuevo');
select is(pg_temp.res('al_nuevo') - 'alumno_id', '{"estado":"aprobado","asociado":false}'::jsonb, 'ALU-07: mail nuevo crea la persona con la inscripción aprobada');
select set_config('rtc.nuevo', pg_temp.res('al_nuevo') ->> 'alumno_id', true) is not null as _;
select is((select a.creado_por = current_setting('rtc.pa')::uuid and a.estado = 'completa' and a.user_id is null and i.estado = 'aprobado'
             from public.alumno a join public.inscripcion i on i.alumno_id = a.id where a.id = current_setting('rtc.nuevo')::uuid),
  true, 'DEC-32: la persona nueva queda con creado_por = A, sin usuario y aprobada con A');
select is((select remitente_nombre || '|' || responder_a || '|' || destinatario from public.mail_salida
            where tipo = 'alumno_sumado' and alumno_id = current_setting('rtc.nuevo')::uuid and profesor_id = current_setting('rtc.pa')::uuid),
  'Profe A|pgtap142.profa@example.test|pgtap142.nuevo@example.test', 'AVI-04/AVI-07: «te sumó como alumno» con el nombre de A y Reply-To a su mail');
select pg_temp.alta('a1420000-0000-0000-0000-00000000000a', 'Sin Mail', '  ', 'al_sin');
select is(pg_temp.res('al_sin') - 'alumno_id', '{"estado":"sin_cuenta","asociado":false}'::jsonb, 'ALU-08: sin mail queda sin cuenta');
select set_config('rtc.sin', pg_temp.res('al_sin') ->> 'alumno_id', true) is not null as _;
select is((select count(*)::int from public.mail_salida where alumno_id = current_setting('rtc.sin')::uuid), 0, 'AVI-04: el alumno sin cuenta no recibe mails');

-- 2. DEC-29 b: el mail de una persona con ficha completa la asocia sin tocar su ficha --------------------------
select pg_temp.alta('a1420000-0000-0000-0000-00000000000a', 'Nombre que carga A', 'PGTAP142.Ana@example.test', 'al_ana');
select is(pg_temp.res('al_ana'), jsonb_build_object('alumno_id', current_setting('rtc.ana')::uuid, 'estado', 'aprobado', 'asociado', true),
  'DEC-29 b/CA-61: el alta con el mail de Ana (alumna de B) la asocia con A sin crear otra persona');
select is((select nombre || '|' || telefono || '|' || fecha_nacimiento::text from public.alumno where id = current_setting('rtc.ana')::uuid),
  'Ana Original|099 123 456|2000-01-01', 'DEC-29 b: la ficha de Ana no cambia con los datos que cargó A');
select is((select count(*)::int from public.alumno where lower(mail::text) = 'pgtap142.ana@example.test'), 1, 'ALU-07: no se crea otra persona');
select is((select count(*)::int from public.mail_salida where tipo = 'alumno_sumado' and alumno_id = current_setting('rtc.ana')::uuid
            and profesor_id = current_setting('rtc.pa')::uuid), 1, 'AVI-04: Ana recibe el aviso de que A la sumó');
select is((select string_agg(estado, ',' order by profesor_id = current_setting('rtc.pa')::uuid desc) from public.inscripcion
            where alumno_id = current_setting('rtc.ana')::uuid), 'aprobado,aprobado', 'DEC-28: el vínculo con B no cambia');
select pg_temp.alta('a1420000-0000-0000-0000-00000000000a', 'Otra vez', 'pgtap142.ana@example.test', 'al_ana2');
select is(pg_temp.rd('al_ana2'), 'PT409 MAIL_YA_REGISTRADO ' || jsonb_build_object('alumno_id', current_setting('rtc.ana')::uuid)::text,
  'CA-06: con el mail de una alumna ya aprobada de A da 409 con su alumno_id');
update public.inscripcion set estado = 'rechazado', motivo_estado = 'Antes no'
 where alumno_id = current_setting('rtc.ana')::uuid and profesor_id = current_setting('rtc.pa')::uuid;
select pg_temp.alta('a1420000-0000-0000-0000-00000000000a', 'Otra vez', 'pgtap142.ana@example.test', 'al_ana3');
select is((select estado || '/' || coalesce(motivo_estado, '-') from public.inscripcion
            where alumno_id = current_setting('rtc.ana')::uuid and profesor_id = current_setting('rtc.pa')::uuid),
  'aprobado/-', 'ALU-07: aunque estuviera rechazada, el alta la deja aprobada y sin motivo');

-- DEC-31: mail de un profesor o del Administrador: 409 sin datos.
select pg_temp.alta('a1420000-0000-0000-0000-00000000000a', 'X', 'pgtap142.profb@example.test', 'al_pb');
select pg_temp.alta('a1420000-0000-0000-0000-00000000000a', 'X', 'pgtap142.admin@example.test', 'al_adm');
select pg_temp.alta('a1420000-0000-0000-0000-00000000000a', 'X', 'pgtap142.profa@example.test', 'al_pa');
select is(array[pg_temp.rd('al_pb'), pg_temp.rd('al_adm'), pg_temp.rd('al_pa')],
  array['PT409 MAIL_YA_REGISTRADO ', 'PT409 MAIL_YA_REGISTRADO ', 'PT409 MAIL_YA_REGISTRADO '],
  'DEC-31/CA-61: el mail de un profesor (otro o el propio) o del Administrador da 409 sin details');

-- Ficha incompleta: se completa con los datos cargados (equivale a la cuenta nueva).
select pg_temp.usuario('a1420000-0000-0000-0000-000000000002', 'pgtap142.fede@example.test');
select pg_temp.alta('a1420000-0000-0000-0000-00000000000a', 'Fede Cargado', 'pgtap142.fede@example.test', 'al_fede');
select is((select a.estado || '|' || a.nombre || '|' || (a.creado_por = current_setting('rtc.pa')::uuid)::text || '|' || (pg_temp.res('al_fede') ->> 'asociado')
             from public.alumno a where a.user_id = 'a1420000-0000-0000-0000-000000000002'),
  'completa|Fede Cargado|true|false', 'ADR-018: el alta sobre una ficha incompleta la completa con los datos de A');

-- Rol y profesor inactivo (PRF-08, CA-63).
update public.profesor set activo = false where id = current_setting('rtc.pa')::uuid;
select pg_temp.alta('a1420000-0000-0000-0000-00000000000a', 'Inactivo', 'pgtap142.inact@example.test', 'al_inact');
select pg_temp.alta('a1420000-0000-0000-0000-00000000000b', 'De B', 'pgtap142.deb@example.test', 'al_b');
select is(pg_temp.r('al_inact') || '|' || pg_temp.r('al_b'), 'PT409 PROFESOR_INACTIVO|ok ',
  'PRF-08/CA-63: A inactivo no da de alta; B sí');
update public.profesor set activo = true where id = current_setting('rtc.pa')::uuid;
select pg_temp.alta('a1420000-0000-0000-0000-00000000000d', 'X', null, 'al_r_adm');
select pg_temp.alta('a1420000-0000-0000-0000-000000000001', 'X', null, 'al_r_alu');
select is(array[pg_temp.r('al_r_adm'), pg_temp.r('al_r_alu')], array['PT403 PROHIBIDO', 'PT403 PROHIBIDO'],
  'SEC-06: Administrador y alumno no dan de alta alumnos');
select pg_temp.alta('a1420000-0000-0000-0000-00000000000a', 'X', 'no es mail', 'al_422');
select is(pg_temp.rd('al_422'), 'PT422 DATOS_INVALIDOS {"campo":"p_mail"}', 'SEC-09: un mail inválido da 422 p_mail');

-- 3. editar_alumno (DEC-32 A, DEC-36 A) --------------------------------------------------------------------
create function pg_temp.editar(p_sub uuid, p_id text, p_nombre text, p_mail text, p_clave text) returns void language sql as $f$
  select pg_temp.como(p_sub, format('select public.editar_alumno(%L, %L, %L, %L, %L)::text', p_id, p_nombre, '099 777 888', '1998-08-08', p_mail), p_clave)
$f$;
select pg_temp.editar('a1420000-0000-0000-0000-00000000000a', current_setting('rtc.nuevo'), 'Nuevo Editado', 'pgtap142.nuevo@example.test', 'ed_ok');
select is(pg_temp.r('ed_ok') || (select nombre from public.alumno where id = current_setting('rtc.nuevo')::uuid), 'ok Nuevo Editado',
  'DEC-32: A edita la ficha que cargó, sin usuario y sin otro profesor');
select is((select count(*)::int from public.mail_salida where tipo = 'alumno_sumado' and alumno_id = current_setting('rtc.nuevo')::uuid
            and profesor_id = current_setting('rtc.pa')::uuid), 1,
  'DEC-38: editar otros campos sin cambiar el mail no repite el aviso «te sumó» (solo el del alta)');
select pg_temp.editar('a1420000-0000-0000-0000-00000000000a', current_setting('rtc.ana'), 'Ana Pisada', 'pgtap142.ana@example.test', 'ed_ana');
select is(pg_temp.r('ed_ana') || '|' || (select nombre from public.alumno where id = current_setting('rtc.ana')::uuid),
  'PT403 PROHIBIDO|Ana Original', 'DEC-32: la ficha de quien tiene cuenta no la edita el profesor (403)');
select pg_temp.editar('a1420000-0000-0000-0000-00000000000a', pg_temp.res('al_b') ->> 'alumno_id', 'X', null, 'ed_ajeno');
select is(pg_temp.r('ed_ajeno'), 'PT404 NO_ENCONTRADO', 'PRF-07/CA-52: editar a una persona sin inscripción con quien llama da 404');

-- DEC-36 A: agregar un mail nuevo a un sin cuenta lo vuelve aprobado; un mail ya usado no asocia.
select pg_temp.editar('a1420000-0000-0000-0000-00000000000a', current_setting('rtc.sin'), 'Sin Mail', 'pgtap142.agregado@example.test', 'ed_add');
select is((select estado from public.inscripcion where alumno_id = current_setting('rtc.sin')::uuid), 'aprobado',
  'DEC-36 A/ALU-07: agregar un mail nuevo a un alumno sin cuenta lo deja aprobado');
select is((select string_agg(estado || '|' || remitente_nombre || '|' || responder_a || '|' || destinatario, ',') from public.mail_salida
            where tipo = 'alumno_sumado' and alumno_id = current_setting('rtc.sin')::uuid and profesor_id = current_setting('rtc.pa')::uuid),
  'pendiente|Profe A|pgtap142.profa@example.test|pgtap142.agregado@example.test',
  'DEC-38 a/AVI-04: al agregarle un mail nuevo, el alumno sin cuenta recibe el mismo aviso «te sumó» del alta');
select pg_temp.editar('a1420000-0000-0000-0000-00000000000a', current_setting('rtc.sin'), 'Sin Mail', 'pgtap142.ana@example.test', 'ed_usado');
select is(pg_temp.rd('ed_usado'), 'PT409 MAIL_YA_REGISTRADO ' || jsonb_build_object('alumno_id', current_setting('rtc.ana')::uuid)::text,
  'DEC-36 A: con el mail de otra persona que ya es alumna suya da 409 con su alumno_id y no la asocia');
select pg_temp.editar('a1420000-0000-0000-0000-00000000000a', current_setting('rtc.sin'), 'Sin Mail', 'pgtap142.deb@example.test', 'ed_otro');
select pg_temp.editar('a1420000-0000-0000-0000-00000000000a', current_setting('rtc.sin'), 'Sin Mail', 'pgtap142.profb@example.test', 'ed_prof');
select is(array[pg_temp.rd('ed_otro'), pg_temp.rd('ed_prof')],
  array['PT409 MAIL_YA_REGISTRADO {"alumno_id": null}', 'PT409 MAIL_YA_REGISTRADO '],
  'DEC-36 A/DEC-31: mail de una persona de otro profesor o de un profesor: 409 sin datos de otro');
select pg_temp.editar('a1420000-0000-0000-0000-00000000000a', current_setting('rtc.sin'), 'Sin Mail', '', 'ed_quitar');
select is((select coalesce(a.mail::text, '-') || '/' || i.estado from public.alumno a join public.inscripcion i on i.alumno_id = a.id
            where a.id = current_setting('rtc.sin')::uuid), '-/sin_cuenta', 'ALU-08: quitar el mail lo deja sin cuenta');
select is((select count(*)::int from public.mail_salida where tipo = 'alumno_sumado' and alumno_id = current_setting('rtc.sin')::uuid), 1,
  'DEC-38: el mail ya usado (409) y quitar el mail no encolan otro aviso');

-- DEC-38 con el tope de mails del profesor (AVI-08): la edición se guarda y el aviso nace fallido `TOPE`;
-- cambiar después el mail de quien ya lo tenía no repite el aviso.
select pg_temp.alta('a1420000-0000-0000-0000-00000000000a', 'Tope', null, 'al_tope');
select set_config('rtc.tope', pg_temp.res('al_tope') ->> 'alumno_id', true) is not null as _;
update privado.ajustes set tope_mails_hora = 1;
select pg_temp.editar('a1420000-0000-0000-0000-00000000000a', current_setting('rtc.tope'), 'Tope', 'pgtap142.tope@example.test', 'ed_tope');
select is(pg_temp.r('ed_tope') || '|' || (select i.estado from public.inscripcion i where i.alumno_id = current_setting('rtc.tope')::uuid)
          || '|' || (select string_agg(m.estado || '/' || coalesce(m.motivo_fallo, '-'), ',') from public.mail_salida m
                      where m.tipo = 'alumno_sumado' and m.alumno_id = current_setting('rtc.tope')::uuid),
  'ok |aprobado|fallido/TOPE', 'DEC-38/AVI-08: sobre el tope del profesor la edición se guarda y el aviso nace fallido TOPE');
update privado.ajustes set tope_mails_hora = 20;
select pg_temp.editar('a1420000-0000-0000-0000-00000000000a', current_setting('rtc.tope'), 'Tope', 'pgtap142.tope2@example.test', 'ed_tope2');
select is(pg_temp.r('ed_tope2') || '|' || (select count(*)::int from public.mail_salida
                                            where tipo = 'alumno_sumado' and alumno_id = current_setting('rtc.tope')::uuid)::text,
  'ok |1', 'DEC-38: cambiar el mail de un alumno que ya tenía uno no manda otro aviso');

-- Ficha compartida: B asocia a «Nuevo» (sin usuario) y A ya no la edita.
select pg_temp.alta('a1420000-0000-0000-0000-00000000000b', 'Lo que carga B', 'pgtap142.nuevo@example.test', 'al_b_nuevo');
select is(pg_temp.res('al_b_nuevo') ->> 'asociado', 'true', 'DEC-29 b: B asocia a la persona que cargó A (con o sin usuario)');
select pg_temp.editar('a1420000-0000-0000-0000-00000000000a', current_setting('rtc.nuevo'), 'Nuevo Otra Vez', 'pgtap142.nuevo@example.test', 'ed_comp');
select is(pg_temp.r('ed_comp'), 'PT403 PROHIBIDO', 'DEC-32: con otro profesor la ficha ya no es editable (403)');

-- Inactivo: editar no exige el profesor activo (ADR-018).
update public.profesor set activo = false where id = current_setting('rtc.pa')::uuid;
select pg_temp.editar('a1420000-0000-0000-0000-00000000000a', current_setting('rtc.sin'), 'Sin Mail Inactivo', null, 'ed_inact');
select is(pg_temp.r('ed_inact'), 'ok ', 'PRF-08: con el profesor inactivo editar_alumno sigue disponible');

select * from finish();
rollback;
