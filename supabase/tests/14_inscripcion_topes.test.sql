-- B14 · T14.5 (a) · Restricciones de `inscripcion`, valores de los topes y topes de mails por día (por profesor y global).
-- IDs: ALU-14, ALU-13, AVI-08, SEC-09, SEC-10. CA-60 (rama de mails del día), CA-62.
-- No repite 14_t2_mails (21.º mail en la hora, TOPE_GLOBAL con 399 + 1) ni 04_ingreso (tope de fichas por profesor de origen).
-- Datos sintéticos (@example.test); todo se deshace con el rollback.
begin;
select plan(19);

create function pg_temp.mail(p_profesor uuid, p_dest text default 'pgtap14i.dest@example.test', p_tipo text default 'clase_creada') returns text language plpgsql as $f$
declare v_id uuid; v text;
begin
  v_id := privado.encolar_mail(p_tipo, p_profesor, null, p_dest, 'Asunto', 'Cuerpo');
  select estado || '/' || coalesce(motivo_fallo, '-') into v from public.mail_salida where id = v_id;
  return v;
end;
$f$;

-- 1. Valores de los topes (SEC-10, AVI-08, ALU-13, SOL-10) -------------------------------------------------------------------
select is((select tope_mails_hora || '/' || tope_mails_dia || '/' || tope_mails_dia_global || '/' || tope_fichas_hora || '/' || tope_pendientes || '/' || zona_horaria_app
             from privado.ajustes), '20/200/400/10/10/America/Montevideo',
  'SEC-10: 20 mails por hora y 200 por día por profesor, 400 por día global, 10 fichas por hora, 10 pendientes por alumno y profesor, huso de la instalación');

-- 2. Restricciones de inscripcion (ALU-14, SEC-09) ----------------------------------------------------------------------------
select set_config('rtc.pa', privado.configurar_profesor('pgtap14i.profa@example.test', 'Profe A', 'pgtap14i-a')::text, true) is not null as _;
select set_config('rtc.pb', privado.configurar_profesor('pgtap14i.profb@example.test', 'Profe B', 'pgtap14i-b')::text, true) is not null as _;
select set_config('rtc.pc', privado.configurar_profesor('pgtap14i.profc@example.test', 'Profe C', 'pgtap14i-c')::text, true) is not null as _;
insert into public.alumno (id, estado, nombre, ficha_completada_en) values ('e1412000-0000-0000-0000-000000000001', 'completa', 'Persona I', public.app_ahora());
insert into public.inscripcion (alumno_id, profesor_id, estado) values ('e1412000-0000-0000-0000-000000000001', current_setting('rtc.pa')::uuid, 'pendiente');
select throws_ok(format($$insert into public.inscripcion (alumno_id, profesor_id) values ('e1412000-0000-0000-0000-000000000001', %L)$$, current_setting('rtc.pa')),
  '23505', null, 'ALU-14: una persona tiene una sola inscripción con cada profesor (única por alumno y profesor)');
select lives_ok(format($$insert into public.inscripcion (alumno_id, profesor_id) values ('e1412000-0000-0000-0000-000000000001', %L)$$, current_setting('rtc.pb')),
  'ALU-14: la misma persona se inscribe con otro profesor (estado por defecto pendiente)');
select is((select estado from public.inscripcion where alumno_id = 'e1412000-0000-0000-0000-000000000001' and profesor_id = current_setting('rtc.pb')::uuid),
  'pendiente', 'ALU-14: la inscripción nace pendiente');
select throws_ok(format($$update public.inscripcion set estado = 'aprobada' where profesor_id = %L$$, current_setting('rtc.pb')),
  '23514', null, 'ALU-14: un estado fuera de pendiente, aprobado, rechazado, sin_cuenta y baja se rechaza');
select lives_ok(format($$update public.inscripcion set estado = 'baja' where profesor_id = %L$$, current_setting('rtc.pb')),
  'ALU-14: baja es un estado válido');
select throws_ok(format($$update public.inscripcion set como_llego = repeat('x', 201) where profesor_id = %L$$, current_setting('rtc.pa')),
  '23514', null, 'SEC-09: «cómo llegó» de más de 200 caracteres se rechaza en la inscripción');
select lives_ok(format($$update public.inscripcion set como_llego = repeat('x', 200) where profesor_id = %L$$, current_setting('rtc.pa')),
  'SEC-09: 200 caracteres es el máximo aceptado');
select throws_ok(format($$update public.inscripcion set motivo_estado = repeat('x', 501) where profesor_id = %L$$, current_setting('rtc.pa')),
  '23514', null, 'SEC-09: un motivo de más de 500 caracteres se rechaza en la inscripción');
select throws_ok($$insert into public.inscripcion (alumno_id, profesor_id) values ('e1412000-0000-0000-0000-000000000001', gen_random_uuid())$$,
  '23503', null, 'ALU-14: no hay inscripción con un profesor inexistente');
select throws_ok(format($$insert into public.inscripcion (alumno_id, profesor_id) values (gen_random_uuid(), %L)$$, current_setting('rtc.pc')),
  '23503', null, 'ALU-14: no hay inscripción de una persona inexistente');

-- 3. Tope diario por profesor: 200 en 24 h, y el de A no bloquea a B (AVI-08, CA-60) -----------------------------------------
update privado.reloj_prueba set ahora = '2026-11-10 15:00:00+00';
delete from public.mail_salida;
insert into public.mail_salida (profesor_id, tipo, destinatario, asunto, cuerpo_texto, estado, creado_en)
select current_setting('rtc.pa')::uuid, 'recordatorio', 'x@example.test', 'A', 'C', 'enviado', '2026-11-10 12:00:00+00'::timestamptz - (g || ' seconds')::interval
  from generate_series(1, 199) g;
select is(pg_temp.mail(current_setting('rtc.pa')::uuid), 'pendiente/-', 'AVI-08: con 199 en el día de A, el mail 200 de A sale');
select is(pg_temp.mail(current_setting('rtc.pa')::uuid), 'fallido/TOPE', 'AVI-08/CA-60: con 200 en el día de A, el siguiente de A nace fallido TOPE');
select is(pg_temp.mail(current_setting('rtc.pb')::uuid), 'pendiente/-', 'CA-60: el tope diario de A no bloquea a B');

-- 4. Tope global: 200 de A y 200 de B en el día, el siguiente de cualquiera queda fallido (CA-60, ADR-019) -------------------
delete from public.mail_salida;
insert into public.mail_salida (profesor_id, tipo, destinatario, asunto, cuerpo_texto, estado, creado_en)
select p, 'recordatorio', 'x@example.test', 'M', 'C', 'enviado', '2026-11-10 12:00:00+00'::timestamptz - (g || ' seconds')::interval
  from unnest(array[current_setting('rtc.pa')::uuid, current_setting('rtc.pb')::uuid]) p, generate_series(1, 200) g;
select is(array[pg_temp.mail(current_setting('rtc.pc')::uuid), pg_temp.mail(current_setting('rtc.pc')::uuid, 'pgtap14i.otro@example.test', 'cuenta_nueva')],
  array['fallido/TOPE_GLOBAL', 'fallido/TOPE_GLOBAL'],
  'CA-60/AVI-08: con 200 de A y 200 de B, el siguiente de C (sin mails en el día) nace fallido TOPE_GLOBAL');
-- Decisión de T14.2 registrada en su handoff (diferencia 2): si los dos topes se superan, gana TOPE.
select is(array[pg_temp.mail(current_setting('rtc.pa')::uuid), pg_temp.mail(current_setting('rtc.pb')::uuid)], array['fallido/TOPE', 'fallido/TOPE'],
  'CA-60/AVI-08: el siguiente de A o de B, que ya llegaron a 200, nace fallido (TOPE: gana el del profesor cuando se superan los dos)');
select is(pg_temp.mail(null, 'pgtap14i.app@example.test', 'aviso_inactividad'), 'fallido/TOPE_GLOBAL',
  'AVI-08: un mail de la aplicación (sin profesor) también queda fallido por el tope global');
select is((select count(*)::int from public.mail_salida where creado_en = '2026-11-10 15:00:00+00' and motivo_fallo in ('TOPE', 'TOPE_GLOBAL')), 5,
  'NFR-07: las cinco filas fallidas por tope quedan en el registro con su motivo y no cuentan para la ventana siguiente');
update privado.reloj_prueba set ahora = '2026-11-11 15:00:01+00';
select is(array[pg_temp.mail(current_setting('rtc.pa')::uuid), pg_temp.mail(current_setting('rtc.pc')::uuid)], array['pendiente/-', 'pendiente/-'],
  'AVI-08: pasadas las 24 h de los 400, A y C vuelven a enviar (ventana móvil; las filas TOPE no contaron)');

select * from finish();
rollback;
