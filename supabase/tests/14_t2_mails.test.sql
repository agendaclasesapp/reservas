-- B14 · T14.2 · `privado.encolar_mail` con varios profesores: remitente, Reply-To, tope por profesor y tope global.
-- IDs: AVI-07, AVI-08, NFR-09, SEC-10, SEC-11. CA-33, CA-60 (rama de mails).
-- Pruebas propias del developer; datos sintéticos (@example.test); todo se deshace con el rollback.
begin;
select plan(17);

create function pg_temp.encolar(p_tipo text, p_profesor uuid, p_alumno uuid, p_dest text) returns uuid language sql as $f$
  select privado.encolar_mail(p_tipo, p_profesor, p_alumno, p_dest, 'Asunto', 'Cuerpo')
$f$;
create function pg_temp.fila(p_id uuid) returns text language sql as $f$
  select estado || '/' || coalesce(motivo_fallo, '-') from public.mail_salida where id = p_id
$f$;

update privado.reloj_prueba set ahora = '2026-10-21 15:00:00+00';
delete from public.mail_salida;
select set_config('rtc.pa', privado.configurar_profesor('pgtap142.profa@example.test', 'Profe "A" <x@y>' || E'\r\n' || 'Bcc: z@y.test ' || repeat('a', 60), 'pgtap142-a')::text, true) is not null as _;
select set_config('rtc.pb', privado.configurar_profesor('pgtap142.profb@example.test', 'Profe B', 'pgtap142-b')::text, true) is not null as _;
insert into public.alumno (id, estado, nombre, mail, telefono, fecha_nacimiento) values
  ('b1420000-0000-0000-0000-000000000011', 'completa', 'Con mail', 'pgtap142.conmail@example.test', '099 000 111', '1990-01-01'),
  ('b1420000-0000-0000-0000-000000000012', 'completa', 'Sin mail', null, '099 000 222', '1990-01-01');

-- 1. Firma y validaciones (ADR-019) ----------------------------------------------------------------------
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'privado' and p.proname = 'encolar_mail'), 1,
  'ADR-019: queda una sola encolar_mail (la de seis argumentos con p_profesor_id)');
select throws_ok($$select pg_temp.encolar('clase_creada', null, 'b1420000-0000-0000-0000-000000000011', null)$$,
  'PT422', 'DATOS_INVALIDOS', 'ADR-019: sin profesor solo se encolan mails de la aplicación');
select throws_ok($$select pg_temp.encolar('clase_creada', gen_random_uuid(), 'b1420000-0000-0000-0000-000000000011', null)$$,
  'PT404', 'NO_ENCONTRADO', 'ADR-019: un profesor inexistente da 404');
select is(pg_temp.encolar('clase_creada', current_setting('rtc.pb')::uuid, 'b1420000-0000-0000-0000-000000000012', null), null,
  'AVI-04: a una persona sin mail no se encola nada');

-- 2. Remitente y Reply-To (AVI-07, SEC-11) ---------------------------------------------------------------
select set_config('rtc.m1', pg_temp.encolar('clase_creada', current_setting('rtc.pa')::uuid, 'b1420000-0000-0000-0000-000000000011', null)::text, true) is not null as _;
select is((select remitente_nombre !~ '[[:cntrl:]"<>\\]' and char_length(remitente_nombre) <= 70 and remitente_nombre like 'Profe A x@y Bcc: z@y.test a%'
             from public.mail_salida where id = current_setting('rtc.m1')::uuid), true,
  'SEC-11: el nombre del profesor como remitente va sin saltos, comillas ni corchetes y hasta 70 caracteres');
select is((select responder_a || '|' || destinatario from public.mail_salida where id = current_setting('rtc.m1')::uuid),
  'pgtap142.profa@example.test|pgtap142.conmail@example.test', 'AVI-07: de un profesor a su alumno, Reply-To al mail del profesor');
select set_config('rtc.m2', pg_temp.encolar('cuenta_nueva', current_setting('rtc.pb')::uuid, 'b1420000-0000-0000-0000-000000000011', 'pgtap142.profb@example.test')::text, true) is not null as _;
select is((select remitente_nombre || '|' || coalesce(responder_a, '-') || '|' || profesor_id::text from public.mail_salida where id = current_setting('rtc.m2')::uuid),
  'Agenda Clases App|-|' || current_setting('rtc.pb'), 'AVI-07: el aviso al profesor sale con el nombre del servicio y sin Reply-To');
select set_config('rtc.m3', pg_temp.encolar('aviso_inactividad', null, 'b1420000-0000-0000-0000-000000000011', null)::text, true) is not null as _;
select is((select remitente_nombre || '|' || coalesce(profesor_id::text, '-') from public.mail_salida where id = current_setting('rtc.m3')::uuid),
  'Agenda Clases App|-', 'ADR-019: un mail de la aplicación queda con profesor_id nulo y el nombre del servicio');
select set_config('rtc.m4', pg_temp.encolar('alumno_sumado', current_setting('rtc.pb')::uuid, 'b1420000-0000-0000-0000-000000000011', null)::text, true) is not null as _;
select is(pg_temp.fila(current_setting('rtc.m4')::uuid), 'pendiente/-', 'ADR-019: el tipo alumno_sumado existe');

-- 3. Tope por profesor (AVI-08: 20 en 60 min) ------------------------------------------------------------
insert into public.mail_salida (profesor_id, tipo, destinatario, asunto, cuerpo_texto, estado, creado_en)
select current_setting('rtc.pa')::uuid, 'clase_creada', 'x@example.test', 'A', 'C', 'enviado', public.app_ahora() - interval '30 minutes'
  from generate_series(1, 19) g;   -- 19 + m1 = 20 de A en la hora
select is(pg_temp.fila(pg_temp.encolar('clase_creada', current_setting('rtc.pa')::uuid, 'b1420000-0000-0000-0000-000000000011', null)),
  'fallido/TOPE', 'AVI-08/CA-60: el 21.º mail de A en la hora nace fallido TOPE');
select is(pg_temp.fila(pg_temp.encolar('clase_creada', current_setting('rtc.pb')::uuid, 'b1420000-0000-0000-0000-000000000011', null)),
  'pendiente/-', 'AVI-08/CA-60: B sigue enviando con A en el tope');
select is(pg_temp.fila(pg_temp.encolar('clase_creada', current_setting('rtc.pa')::uuid, 'b1420000-0000-0000-0000-000000000011', 'no es mail')),
  'fallido/DESTINATARIO_INVALIDO', 'H-141: un destinatario inválido se registra aunque A esté en el tope');

-- 4. Tope global (AVI-08: 400 en 24 h de toda la aplicación, TOPE_GLOBAL) --------------------------------
-- Hasta ahora cuentan: 20 de A, m2, m3, m4 y el de B = 24 (las filas TOPE y DESTINATARIO_INVALIDO no cuentan).
select is((select count(*)::int from public.mail_salida where creado_en > public.app_ahora() - interval '24 hours'
            and not (estado = 'fallido' and motivo_fallo in ('TOPE', 'TOPE_GLOBAL', 'DESTINATARIO_INVALIDO'))), 24,
  'AVI-08: la cuenta global incluye las filas sin profesor y excluye TOPE y DESTINATARIO_INVALIDO');
insert into public.mail_salida (profesor_id, tipo, destinatario, asunto, cuerpo_texto, estado, creado_en)
select null, 'aviso_inactividad', 'x@example.test', 'A', 'C', 'enviado', public.app_ahora() - interval '20 hours'
  from generate_series(1, 375) g;   -- 399
select is(pg_temp.fila(pg_temp.encolar('clase_creada', current_setting('rtc.pb')::uuid, 'b1420000-0000-0000-0000-000000000011', null)),
  'pendiente/-', 'AVI-08: el mail 400 del día todavía sale');
select set_config('rtc.g1', pg_temp.encolar('clase_creada', current_setting('rtc.pb')::uuid, 'b1420000-0000-0000-0000-000000000011', null)::text, true) is not null as _;
select is(array[pg_temp.fila(current_setting('rtc.g1')::uuid),
                pg_temp.fila(pg_temp.encolar('aviso_inactividad', null, 'b1420000-0000-0000-0000-000000000011', null))],
  array['fallido/TOPE_GLOBAL', 'fallido/TOPE_GLOBAL'],
  'AVI-08/CA-60: con 400 en el día, el siguiente de cualquier profesor (o de la aplicación) nace fallido TOPE_GLOBAL');
update privado.reloj_prueba set ahora = '2026-10-21 19:00:01+00';   -- las 375 de hace 20 h salen de la ventana
select is(pg_temp.fila(pg_temp.encolar('clase_creada', current_setting('rtc.pb')::uuid, 'b1420000-0000-0000-0000-000000000011', null)),
  'pendiente/-', 'AVI-08: ventana móvil de 24 h: las filas TOPE_GLOBAL no cuentan y al salir las viejas vuelve a enviar');

-- 5. Registro (WEB-08): B ve su fila TOPE_GLOBAL; A no la ve.
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"a1420000-0000-0000-0000-00000000000b"}', true) is not null as _;
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', 'a1420000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated',
        'pgtap142.profb@example.test', now(), now(), now(), '', '', '', '');
set local role authenticated;
select is((select count(*)::int from public.v_mails_fallidos where id = current_setting('rtc.g1')::uuid and motivo = 'TOPE_GLOBAL'), 1,
  'WEB-08/NFR-07: el profesor ve en su registro la fila TOPE_GLOBAL');
reset role;

select * from finish();
rollback;
