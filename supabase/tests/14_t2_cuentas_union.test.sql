-- B14 · T14.2 · Aprobación por profesor, unión por profesor y `v_alumnos` por inscripción con dos profesores.
-- IDs: ALU-03, ALU-04, ALU-05, ALU-09, AVI-03, AVI-07, PRF-07, PRF-08, SEC-02, SEC-06. CA-04, CA-07, CA-52, CA-58.
-- Pruebas propias del developer; datos sintéticos (@example.test); todo se deshace con el rollback.
begin;
select plan(27);

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
create function pg_temp.res(p_clave text) returns jsonb language sql as $f$
  select nullif(current_setting('rtc.' || p_clave || '_res'), '')::jsonb
$f$;
create function pg_temp.usuario(p_id uuid, p_mail text) returns void language sql as $f$
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_mail, now(), now(), now(),
          '', '', '', '', '{}')
$f$;

-- Preparación ---------------------------------------------------------------------------------------------
update privado.reloj_prueba set ahora = '2026-10-21 15:00:00+00';
select set_config('rtc.pa', privado.configurar_profesor('pgtap142.profa@example.test', 'Profe A', 'pgtap142-a')::text, true) is not null as _;
select set_config('rtc.pb', privado.configurar_profesor('pgtap142.profb@example.test', 'Profe B', 'pgtap142-b')::text, true) is not null as _;
select privado.configurar_administrador('pgtap142.admin@example.test');
select pg_temp.usuario('a1420000-0000-0000-0000-00000000000a', 'pgtap142.profa@example.test');
select pg_temp.usuario('a1420000-0000-0000-0000-00000000000b', 'pgtap142.profb@example.test');
select pg_temp.usuario('a1420000-0000-0000-0000-00000000000d', 'pgtap142.admin@example.test');
select pg_temp.usuario('a1420000-0000-0000-0000-000000000001', 'pgtap142.ana@example.test');
update public.alumno set estado = 'completa', nombre = 'Ana', telefono = '099 123-456', fecha_nacimiento = '2000-01-01',
                         ficha_completada_en = public.app_ahora(), ficha_origen_profesor_id = current_setting('rtc.pa')::uuid
 where user_id = 'a1420000-0000-0000-0000-000000000001';
select set_config('rtc.ana', (select id::text from public.alumno where user_id = 'a1420000-0000-0000-0000-000000000001'), true) is not null as _;

insert into public.alumno (id, estado, nombre, mail, telefono, fecha_nacimiento, creado_por) values
  ('b1420000-0000-0000-0000-000000000001', 'completa', 'Sin cuenta de A', null, '+598 99123456', '1990-01-01', current_setting('rtc.pa')::uuid),
  ('b1420000-0000-0000-0000-000000000002', 'completa', 'Sin cuenta de B', null, '099-123-456', '1991-01-01', current_setting('rtc.pb')::uuid),
  ('b1420000-0000-0000-0000-000000000003', 'completa', 'Beto', 'pgtap142.beto@example.test', '091 000 000', '1992-01-01', null),
  ('b1420000-0000-0000-0000-000000000004', 'completa', 'Compartida', 'pgtap142.comp@example.test', '092 000 000', '1993-01-01', current_setting('rtc.pa')::uuid);
insert into public.inscripcion (alumno_id, profesor_id, estado, como_llego) values
  (current_setting('rtc.ana')::uuid, current_setting('rtc.pa')::uuid, 'pendiente', 'Por una amiga'),
  (current_setting('rtc.ana')::uuid, current_setting('rtc.pb')::uuid, 'pendiente', 'Por Instagram'),
  ('b1420000-0000-0000-0000-000000000001', current_setting('rtc.pa')::uuid, 'sin_cuenta', null),
  ('b1420000-0000-0000-0000-000000000002', current_setting('rtc.pb')::uuid, 'sin_cuenta', null),
  ('b1420000-0000-0000-0000-000000000003', current_setting('rtc.pb')::uuid, 'pendiente', 'Por el club'),
  ('b1420000-0000-0000-0000-000000000004', current_setting('rtc.pa')::uuid, 'aprobado', null);
insert into public.persona_a_cargo (id, alumno_id, nombre) values
  ('c1420000-0000-0000-0000-000000000001', 'b1420000-0000-0000-0000-000000000001', 'Hijo del sin cuenta');

-- 1. aprobar_cuenta / rechazar_cuenta por profesor (ALU-03, DEC-28, AVI-03) ---------------------------------
select pg_temp.como('a1420000-0000-0000-0000-00000000000a', format('select public.aprobar_cuenta(%L)::text', current_setting('rtc.ana')), 'ap_a');
select is(pg_temp.res('ap_a'), jsonb_build_object('estado', 'aprobado', 'sugerencias', jsonb_build_array(jsonb_build_object(
    'sin_cuenta_id', 'b1420000-0000-0000-0000-000000000001', 'nombre', 'Sin cuenta de A', 'telefono', '+598 99123456'))),
  'ALU-03/ALU-04/CA-58: A aprueba a Ana y solo le sugiere el sin cuenta de A, no el de B');
select is((select string_agg(estado, ',' order by profesor_id = current_setting('rtc.pa')::uuid desc) from public.inscripcion
            where alumno_id = current_setting('rtc.ana')::uuid), 'aprobado,pendiente',
  'DEC-28: aprobar con A no cambia el vínculo con B');
select is((select remitente_nombre || '|' || responder_a || '|' || destinatario || '|' || asunto from public.mail_salida
            where tipo = 'cuenta_respondida' and profesor_id = current_setting('rtc.pa')::uuid and alumno_id = current_setting('rtc.ana')::uuid),
  'Profe A|pgtap142.profa@example.test|pgtap142.ana@example.test|Profe A aprobó tu acceso',
  'AVI-03/AVI-07: el mail de respuesta sale con el nombre de A y Reply-To a su mail');
select pg_temp.como('a1420000-0000-0000-0000-00000000000a', format('select public.aprobar_cuenta(%L)::text', current_setting('rtc.ana')), 'ap_a2');
select is(pg_temp.r('ap_a2') || ' ' || current_setting('rtc.ap_a2_det'), 'PT409 CUENTA_NO_PENDIENTE {"estado": "aprobado"}',
  'ALU-03: aprobar dos veces da 409 CUENTA_NO_PENDIENTE con el estado');
select pg_temp.como('a1420000-0000-0000-0000-00000000000b', format('select public.rechazar_cuenta(%L, %L)::text', current_setting('rtc.ana'), 'Sin cupo'), 're_b');
select is((select estado || '/' || motivo_estado from public.inscripcion
            where alumno_id = current_setting('rtc.ana')::uuid and profesor_id = current_setting('rtc.pb')::uuid),
  'rechazado/Sin cupo', 'ALU-03: B rechaza con motivo en su inscripción');
select is((select estado || '/' || coalesce(motivo_estado, '-') from public.inscripcion
            where alumno_id = current_setting('rtc.ana')::uuid and profesor_id = current_setting('rtc.pa')::uuid),
  'aprobado/-', 'DEC-28: el rechazo de B no toca la aprobación de A');
select pg_temp.como('a1420000-0000-0000-0000-00000000000a', 'select public.aprobar_cuenta(''b1420000-0000-0000-0000-000000000003'')::text', 'ap_ajeno');
select pg_temp.como('a1420000-0000-0000-0000-00000000000a', 'select public.rechazar_cuenta(''b1420000-0000-0000-0000-000000000002'')::text', 're_ajeno');
select is(array[pg_temp.r('ap_ajeno'), pg_temp.r('re_ajeno')], array['PT404 NO_ENCONTRADO', 'PT404 NO_ENCONTRADO'],
  'PRF-07/CA-52: aprobar o rechazar a una persona sin inscripción con quien llama da 404');
select pg_temp.como('a1420000-0000-0000-0000-00000000000d', format('select public.aprobar_cuenta(%L)::text', current_setting('rtc.ana')), 'ap_adm');
select pg_temp.como('a1420000-0000-0000-0000-000000000001', format('select public.aprobar_cuenta(%L)::text', current_setting('rtc.ana')), 'ap_alu');
select is(array[pg_temp.r('ap_adm'), pg_temp.r('ap_alu')], array['PT403 PROHIBIDO', 'PT403 PROHIBIDO'],
  'SEC-06/ADM-04: el Administrador y el alumno no aprueban cuentas');

-- Profesor inactivo (PRF-08): no aprueba, sí rechaza.
update public.profesor set activo = false where id = current_setting('rtc.pb')::uuid;
select pg_temp.como('a1420000-0000-0000-0000-00000000000b', format('select public.aprobar_cuenta(%L)::text', current_setting('rtc.ana')), 'ap_inact');
select is(pg_temp.r('ap_inact'), 'PT409 PROFESOR_INACTIVO', 'PRF-08/CA-63: un profesor inactivo no aprueba accesos');
select pg_temp.como('a1420000-0000-0000-0000-00000000000b', 'select public.rechazar_cuenta(''b1420000-0000-0000-0000-000000000003'')::text', 're_inact');
select is(pg_temp.r('re_inact'), 'ok ', 'PRF-08: un profesor inactivo sí rechaza un pendiente');
update public.profesor set activo = true where id = current_setting('rtc.pb')::uuid;

-- 2. Unión por profesor (ALU-04, ALU-05, ADR-013 regla 3) -----------------------------------------------------
select pg_temp.como('a1420000-0000-0000-0000-00000000000b', format('select public.sugerencias_union(%L)::text', current_setting('rtc.ana')), 'su_b');
select is(pg_temp.res('su_b') @> '[{"sin_cuenta_id":"b1420000-0000-0000-0000-000000000002"}]' and jsonb_array_length(pg_temp.res('su_b')) = 1,
  true, 'ALU-04: B ve solo su sin cuenta como sugerencia para Ana');
select pg_temp.como('a1420000-0000-0000-0000-00000000000a', 'select public.sugerencias_union(''b1420000-0000-0000-0000-000000000002'')::text', 'su_ajeno');
select is(pg_temp.r('su_ajeno'), 'PT404 NO_ENCONTRADO', 'PRF-07: sugerencias de una persona de otro profesor dan 404');
select pg_temp.como('a1420000-0000-0000-0000-00000000000a', format('select public.unir_alumnos(%L, %L)::text', current_setting('rtc.ana'), 'b1420000-0000-0000-0000-000000000002'), 'un_ajeno');
select is(pg_temp.r('un_ajeno'), 'PT404 NO_ENCONTRADO', 'ALU-04/CA-58: A no une a Ana con un sin cuenta de B (404)');
select pg_temp.como('a1420000-0000-0000-0000-00000000000b', format('select public.unir_alumnos(%L, %L)::text', current_setting('rtc.ana'), 'b1420000-0000-0000-0000-000000000002'), 'un_rech');
select is(pg_temp.r('un_rech'), 'PT409 UNION_NO_VALIDA', 'ALU-05: B no une a una cuenta que tiene rechazada (aunque A la aprobó)');
select pg_temp.como('a1420000-0000-0000-0000-00000000000a', format('select public.unir_alumnos(%L, %L)::text', current_setting('rtc.ana'), 'b1420000-0000-0000-0000-000000000001'), 'un_a');
select is(pg_temp.res('un_a'), jsonb_build_object('cuenta_id', current_setting('rtc.ana')::uuid), 'ALU-05: A une a Ana con su sin cuenta');
select is((select count(*)::int from public.alumno where id = 'b1420000-0000-0000-0000-000000000001')
          + (select count(*)::int from public.inscripcion where alumno_id = 'b1420000-0000-0000-0000-000000000001'),
  0, 'ADR-013 regla 3: la inscripción del sin cuenta se borra antes del bucle y el sin cuenta deja de existir');
select is((select string_agg(estado, ',') from public.inscripcion
            where alumno_id = current_setting('rtc.ana')::uuid and profesor_id = current_setting('rtc.pa')::uuid),
  'aprobado', 'ALU-05: Ana queda con una sola inscripción aprobada con A');
select is((select alumno_id from public.persona_a_cargo where id = 'c1420000-0000-0000-0000-000000000001'),
  current_setting('rtc.ana')::uuid, 'ALU-05: la persona a cargo del sin cuenta pasa a Ana');
select pg_temp.como('a1420000-0000-0000-0000-00000000000b', format('select public.descartar_union(%L, %L)::text', current_setting('rtc.ana'), 'b1420000-0000-0000-0000-000000000002'), 'de_b');
select pg_temp.como('a1420000-0000-0000-0000-00000000000b', format('select public.sugerencias_union(%L)::text', current_setting('rtc.ana')), 'su_b2');
select is(pg_temp.r('de_b') || pg_temp.res('su_b2')::text, 'ok []', 'ALU-04: B descarta la sugerencia (con la cuenta rechazada) y no vuelve');

-- 3. v_alumnos por inscripción (ALU-09, PRF-07, DEC-32, DEC-33) ----------------------------------------------
select pg_temp.como('a1420000-0000-0000-0000-00000000000a',
  $$select string_agg(nombre || ':' || estado || ':' || coalesce(como_llego, '-') || ':' || editable, ',' order by nombre) from public.v_alumnos$$, 'va');
select is(current_setting('rtc.va_res'), 'Ana:aprobado:Por una amiga:false,Compartida:aprobado:-:true',
  'ALU-09/DEC-33: A ve a sus personas con el estado y «cómo llegó» de su inscripción; Ana (con cuenta) no es editable');
select pg_temp.como('a1420000-0000-0000-0000-00000000000b',
  $$select string_agg(nombre || ':' || estado || ':' || coalesce(motivo_estado, '-') || ':' || coalesce(como_llego, '-'), ',' order by nombre) from public.v_alumnos$$, 'vb');
select is(current_setting('rtc.vb_res'), 'Ana:rechazado:Sin cupo:Por Instagram,Beto:rechazado:-:Por el club,Sin cuenta de B:sin_cuenta:-:-',
  'PRF-07/CA-52: B ve solo sus inscripciones, con su estado, motivo y «cómo llegó»');
select pg_temp.como('a1420000-0000-0000-0000-000000000001', 'select count(*)::text from public.v_alumnos', 'v_alu');
select pg_temp.como('a1420000-0000-0000-0000-00000000000d', 'select count(*)::text from public.v_alumnos', 'v_adm');
select is(current_setting('rtc.v_alu_res') || '/' || current_setting('rtc.v_adm_res'), '0/0',
  'SEC-02/ADM-04: la persona y el Administrador no ven filas de v_alumnos');
select pg_temp.como('a1420000-0000-0000-0000-00000000000a',
  $$select (edad::text || '/' || to_char(creado_en, 'YYYY') || '/' || con_usuario::text) from public.v_alumnos where nombre = 'Ana'$$, 'va_edad');
select is(current_setting('rtc.va_edad_res'), '26/2026/true', 'ALU-09: edad con app_ahora y con_usuario');

-- Ficha compartida (DEC-32 A): con una inscripción de otro profesor deja de ser editable; en baja, vuelve.
insert into public.inscripcion (alumno_id, profesor_id, estado) values
  ('b1420000-0000-0000-0000-000000000004', current_setting('rtc.pb')::uuid, 'aprobado');
select pg_temp.como('a1420000-0000-0000-0000-00000000000a', $$select editable::text from public.v_alumnos where nombre = 'Compartida'$$, 'ed1');
update public.inscripcion set estado = 'baja'
 where alumno_id = 'b1420000-0000-0000-0000-000000000004' and profesor_id = current_setting('rtc.pb')::uuid;
select pg_temp.como('a1420000-0000-0000-0000-00000000000a', $$select editable::text from public.v_alumnos where nombre = 'Compartida'$$, 'ed2');
select is(current_setting('rtc.ed1_res') || '/' || current_setting('rtc.ed2_res'), 'false/true',
  'DEC-32: editable es falso mientras otro profesor tiene a la persona y vuelve con la baja');
select pg_temp.como('a1420000-0000-0000-0000-00000000000b', $$select count(*)::text from public.v_alumnos where nombre = 'Compartida'$$, 'ed3');
select is(current_setting('rtc.ed3_res'), '0', 'ADR-018: una inscripción en baja no aparece en la lista de ese profesor');
select is((select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'v_alumnos'
            and column_name in ('editable', 'como_llego', 'motivo_estado', 'estado')), 4,
  'contratos.md §2: v_alumnos expone editable, como_llego, motivo_estado y estado');
select is((select count(*)::int from pg_trigger where tgrelid = 'public.v_alumnos'::regclass and tgname like 'v_alumnos_sin_%'), 3,
  'H-210: v_alumnos sigue con sus triggers de solo lectura');

select * from finish();
rollback;
