-- B14 · T14.1 · Modelo de varios profesores, roles, trigger de Auth y RLS cruzada con dos profesores.
-- IDs: ADM-01, ADM-04, ALU-01, ALU-14, AGE-09, AGE-10, AGE-11, PRF-07, NFR-01, SEC-02, SEC-04, SEC-14.
-- Lo que ve cada rol se mide con `pg_temp.ver`: fija `request.jwt.claims`, cambia a `authenticated`, corre la
-- consulta y vuelve a postgres. Datos sintéticos (@example.test); todo se deshace con el rollback.
begin;
select plan(71);

create function pg_temp.ver(p_sub text, p_sql text, p_como_api boolean default true)
returns text
language plpgsql
as $$
declare
  v text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  if p_como_api then
    execute 'set local role authenticated';
  end if;
  execute p_sql into v;
  if p_como_api then
    execute 'reset role';
  end if;
  return v;
end;
$$;

create function pg_temp.usuario(p_id uuid, p_mail text, p_confirmado boolean)
returns void
language sql
as $$
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_mail,
          case when p_confirmado then now() end, now(), now(), '', '', '', '')
$$;

-- 1. Configuración por el operador ------------------------------------------------------------------------
select set_config('rtc.pa', privado.configurar_profesor('pgtap14.profa@example.test', 'Profe A', 'pgtap-profe-a')::text, true) is not null as _;
select set_config('rtc.pc', privado.configurar_profesor('pgtap14.profc@example.test', 'Profe C', 'pgtap-profe-c')::text, true) is not null as _;
select privado.configurar_administrador('pgtap14.admin@example.test');

select is((select count(*) from public.profesor where slug in ('profesor-prueba', 'profesora-b', 'pgtap-profe-a', 'pgtap-profe-c'))::int, 4,
  'ADR-018: profesor admite N filas (sin profesor_fila_unica)');
select is((select count(*) from pg_indexes where indexname = 'profesor_fila_unica')::int, 0,
  'ADR-018: el índice de fila única de ADR-015 ya no existe');
select ok((select activo and not slug_provisional and zona_horaria = (select zona_horaria_app from privado.ajustes)
             from public.profesor where id = current_setting('rtc.pa')::uuid),
  'AGE-11/ADR-018: un profesor nuevo nace activo, con slug definitivo y el huso de la instalación');
select is((select count(*) from public.grilla_tramo where profesor_id = current_setting('rtc.pa')::uuid)::int, 10,
  'AGE-10: un profesor nuevo nace con su propia grilla de AGE-01 (10 tramos)');
select is((select count(*) from privado.administrador)::int, 1,
  'ADM-01: hay un único Administrador (configurar_administrador reemplaza al anterior)');

-- Reglas del slug (ADM-02) y del mail.
select throws_ok($$select privado.configurar_profesor('pgtap14.x1@example.test', 'X', 'ab')$$,
  'PT422', 'DATOS_INVALIDOS', 'ADM-02: slug de menos de 3 caracteres da 422');
select throws_ok($$select privado.configurar_profesor('pgtap14.x1@example.test', 'X', repeat('a', 31))$$,
  'PT422', 'DATOS_INVALIDOS', 'ADM-02: slug de más de 30 caracteres da 422');
select throws_ok($$select privado.configurar_profesor('pgtap14.x1@example.test', 'X', 'Profe-X')$$,
  'PT422', 'DATOS_INVALIDOS', 'ADM-02: slug con mayúsculas da 422');
select throws_ok($$select privado.configurar_profesor('pgtap14.x1@example.test', 'X', '-profe')$$,
  'PT422', 'DATOS_INVALIDOS', 'ADM-02: slug con guion en el borde da 422');
select throws_ok($$select privado.configurar_profesor('pgtap14.x1@example.test', 'X', 'mis-clases')$$,
  'PT422', 'DATOS_INVALIDOS', 'ADM-02: slug reservado da 422');
select throws_ok($$select privado.configurar_profesor('pgtap14.x1@example.test', 'X', 'pgtap-profe-a')$$,
  'PT409', 'SLUG_YA_USADO', 'ADM-02: slug repetido da 409 SLUG_YA_USADO');
select throws_ok($$select privado.configurar_profesor('pgtap14.x1@example.test', 'X', null)$$,
  'PT422', 'DATOS_INVALIDOS', 'ADR-018: un profesor nuevo sin slug da 422');
select throws_ok($$insert into public.profesor (nombre, mail, slug) values ('X', 'pgtap14.x2@example.test', 'ayuda')$$,
  '23514', null, 'ADM-02: el CHECK de profesor rechaza un slug reservado aunque no se use la función');
select throws_ok($$insert into public.profesor (nombre, mail, slug) values ('X', 'PGTAP14.PROFA@example.test', 'pgtap-otro')$$,
  '23505', null, 'ADR-018: el mail del profesor es único (sin distinguir mayúsculas)');
select throws_ok($$insert into public.profesor (nombre, slug) values ('X', 'pgtap-sin-mail')$$,
  '23502', null, 'ADR-018: el mail del profesor no es nulo');
select lives_ok($$select privado.configurar_profesor('pgtap14.profa@example.test', 'Profe A', 'pgtap-profe-a')$$,
  'ADR-018: configurar_profesor es idempotente');

-- 2. Trigger de Auth (SEC-14, ALU-01, ALU-14) ---------------------------------------------------------------
-- Persona Y cargada por el profesor A sin usuario: el ingreso con su mail (otras mayúsculas) la vincula.
insert into public.alumno (id, estado, nombre, mail, telefono, creado_por)
values ('e1400000-0000-0000-0000-0000000000f4', 'completa', 'Persona Y', 'pgtap14.y@example.test', '099 111 222', current_setting('rtc.pa')::uuid);
insert into public.inscripcion (alumno_id, profesor_id, estado, aprobado_en)
values ('e1400000-0000-0000-0000-0000000000f4', current_setting('rtc.pa')::uuid, 'aprobado', now());

select pg_temp.usuario('e1400000-0000-0000-0000-0000000000a1', 'pgtap14.profa@example.test', true);
select pg_temp.usuario('e1400000-0000-0000-0000-0000000000b1', 'pgtap14.profb@example.test', true);
select pg_temp.usuario('e1400000-0000-0000-0000-0000000000c1', 'pgtap14.admin@example.test', true);
select pg_temp.usuario('e1400000-0000-0000-0000-0000000000d1', 'pgtap14.x@example.test', true);
select pg_temp.usuario('e1400000-0000-0000-0000-0000000000d2', 'pgtap14.z@example.test', true);
select pg_temp.usuario('e1400000-0000-0000-0000-0000000000d3', 'pgtap14.incompleta@example.test', true);
select pg_temp.usuario('e1400000-0000-0000-0000-0000000000d4', 'PGTAP14.Y@Example.test', true);
select pg_temp.usuario('e1400000-0000-0000-0000-0000000000e1', 'pgtap14.profc@example.test', false);

-- El profesor B se da de alta después de que su usuario entró (tenía ficha incompleta).
select set_config('rtc.pb', privado.configurar_profesor('pgtap14.profb@example.test', 'Profe B', 'pgtap-profe-b')::text, true) is not null as _;

select is((select user_id::text from public.profesor where id = current_setting('rtc.pa')::uuid), 'e1400000-0000-0000-0000-0000000000a1',
  'SEC-14/ADR-018: el trigger vincula al profesor A entre N por su mail confirmado');
select is((select count(*) from public.alumno where user_id = 'e1400000-0000-0000-0000-0000000000a1')::int, 0,
  'ADR-018: el profesor no recibe ficha de alumno');
select is((select user_id::text from public.profesor where id = current_setting('rtc.pb')::uuid), 'e1400000-0000-0000-0000-0000000000b1',
  'ADR-018: configurar_profesor vincula un usuario confirmado que ya existía');
select is((select count(*) from public.alumno where user_id = 'e1400000-0000-0000-0000-0000000000b1')::int, 0,
  'ADR-018: configurar_profesor borra la ficha incompleta de ese usuario');
select is((select user_id::text from privado.administrador), 'e1400000-0000-0000-0000-0000000000c1',
  'ADM-01: el trigger vincula al Administrador por su mail confirmado');
select is((select count(*) from public.alumno where user_id = 'e1400000-0000-0000-0000-0000000000c1')::int, 0,
  'ADM-01/DEC-31: el Administrador que no es profesor no recibe ficha de alumno');
select ok((select estado = 'ficha_incompleta' and creado_por is null and ficha_origen_profesor_id is null
             from public.alumno where user_id = 'e1400000-0000-0000-0000-0000000000d1'),
  'ALU-14/DEC-25: un mail sin alta entra como persona con ficha incompleta y sin profesor');
select is((select count(*) from public.inscripcion i join public.alumno a on a.id = i.alumno_id
            where a.user_id = 'e1400000-0000-0000-0000-0000000000d1')::int, 0,
  'ALU-14: la ficha nueva no tiene vínculo con ningún profesor');
select is((select user_id::text from public.alumno where id = 'e1400000-0000-0000-0000-0000000000f4'), 'e1400000-0000-0000-0000-0000000000d4',
  'ADR-018: el ingreso con el mail de una persona existente (global, sin distinguir mayúsculas) la vincula');
select is((select count(*) from public.alumno where user_id = 'e1400000-0000-0000-0000-0000000000d4')::int, 1,
  'ADR-018: la persona vinculada no se duplica');
select is((select user_id from public.profesor where id = current_setting('rtc.pc')::uuid), null,
  'SEC-14: un usuario sin mail confirmado no recibe el rol de profesor');
select is((select count(*) from public.alumno where user_id = 'e1400000-0000-0000-0000-0000000000e1')::int, 0,
  'SEC-14: un usuario sin mail confirmado no recibe ficha');
update auth.users set email_confirmed_at = now() where id = 'e1400000-0000-0000-0000-0000000000e1';
select is((select user_id::text from public.profesor where id = current_setting('rtc.pc')::uuid), 'e1400000-0000-0000-0000-0000000000e1',
  'SEC-14: al confirmar el mail se vincula como profesor');
update auth.users set email_confirmed_at = null where id = 'e1400000-0000-0000-0000-0000000000e1';
select is(pg_temp.ver('e1400000-0000-0000-0000-0000000000e1', 'select privado.mi_profesor_id()::text'), null,
  'SEC-14: mi_profesor_id() es nulo sin mail confirmado');
select throws_ok($$insert into public.alumno (estado, nombre, mail) values ('completa', 'Copia', 'PGTAP14.X@example.test')$$,
  '23505', null, 'ADR-018: el mail de persona es único global entre no borradas');
select throws_ok($$select privado.configurar_profesor('pgtap14.y@example.test', 'Y', 'pgtap-profe-y')$$,
  'PT409', 'MAIL_YA_REGISTRADO', 'DEC-31: el mail de una persona con ficha completa no se da de alta como profesor');

-- 3. Datos de dos profesores ----------------------------------------------------------------------------------
-- X: inscripta con A (aprobada) y con B (pendiente). Z: solo con B. W: sin cuenta de A, en baja. Y: de A.
update public.alumno
   set estado = 'completa', nombre = 'Persona X', telefono = '099 333 444', ficha_completada_en = now(),
       ficha_origen_profesor_id = current_setting('rtc.pa')::uuid
 where user_id = 'e1400000-0000-0000-0000-0000000000d1';
update public.alumno set estado = 'completa', nombre = 'Persona Z', ficha_completada_en = now()
 where user_id = 'e1400000-0000-0000-0000-0000000000d2';
insert into public.alumno (id, estado, nombre, creado_por)
values ('e1400000-0000-0000-0000-0000000000f5', 'completa', 'Persona W', current_setting('rtc.pa')::uuid);
insert into public.inscripcion (alumno_id, profesor_id, estado, aprobado_en, como_llego)
select a.id, current_setting('rtc.pa')::uuid, 'aprobado', now(), 'Por la web' from public.alumno a where a.user_id = 'e1400000-0000-0000-0000-0000000000d1'
union all
select a.id, current_setting('rtc.pb')::uuid, 'pendiente', null, 'Por un amigo' from public.alumno a where a.user_id = 'e1400000-0000-0000-0000-0000000000d1'
union all
select a.id, current_setting('rtc.pb')::uuid, 'aprobado', now(), null from public.alumno a where a.user_id = 'e1400000-0000-0000-0000-0000000000d2'
union all
select 'e1400000-0000-0000-0000-0000000000f5', current_setting('rtc.pa')::uuid, 'baja', null, null;
select set_config('rtc.x', (select id::text from public.alumno where user_id = 'e1400000-0000-0000-0000-0000000000d1'), true) is not null as _;
select set_config('rtc.z', (select id::text from public.alumno where user_id = 'e1400000-0000-0000-0000-0000000000d2'), true) is not null as _;

insert into public.persona_a_cargo (alumno_id, nombre) values
  ('e1400000-0000-0000-0000-0000000000f4', 'Hija de Y'),
  (current_setting('rtc.z')::uuid, 'Hijo de Z');
insert into public.bloqueo (profesor_id, periodo) values
  (current_setting('rtc.pa')::uuid, tstzrange('2026-12-01 00:00-03', '2026-12-02 00:00-03', '[)')),
  (current_setting('rtc.pb')::uuid, tstzrange('2026-12-01 00:00-03', '2026-12-02 00:00-03', '[)'));
insert into public.reserva (id, profesor_id, alumno_id, tipo, hora_local, dia_semana, duracion_min, estado, desde, origen) values
  ('e1400000-0000-0000-0000-0000000001a1', current_setting('rtc.pa')::uuid, current_setting('rtc.x')::uuid, 'suelta', '09:00', 1, 60, 'confirmada', '2026-11-02', 'solicitud'),
  ('e1400000-0000-0000-0000-0000000001b1', current_setting('rtc.pb')::uuid, current_setting('rtc.z')::uuid, 'suelta', '09:00', 1, 60, 'confirmada', '2026-11-02', 'solicitud');
insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado) values
  (current_setting('rtc.pa')::uuid, 'e1400000-0000-0000-0000-0000000001a1', current_setting('rtc.x')::uuid, '2026-11-02 09:00-03', '2026-11-02 10:00-03', 'confirmada');
select lives_ok($$insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado) values
  (current_setting('rtc.pb')::uuid, 'e1400000-0000-0000-0000-0000000001b1', current_setting('rtc.z')::uuid, '2026-11-02 09:00-03', '2026-11-02 10:00-03', 'confirmada')$$,
  'AGE-10: el mismo horario puede estar ocupado en la agenda de A y en la de B');
insert into public.mail_salida (profesor_id, alumno_id, tipo, destinatario, asunto, cuerpo_texto, estado, motivo_fallo) values
  (current_setting('rtc.pa')::uuid, current_setting('rtc.x')::uuid, 'cuenta_nueva', 'pgtap14.profa@example.test', 'A', 'a', 'fallido', 'TOPE'),
  (current_setting('rtc.pb')::uuid, current_setting('rtc.z')::uuid, 'cuenta_nueva', 'pgtap14.profb@example.test', 'B', 'b', 'fallido', 'TOPE'),
  (null, null, 'cuenta_nueva', 'pgtap14.app@example.test', 'App', 'c', 'fallido', 'TOPE');

-- 4. RLS cruzada: profesor A (SEC-02, PRF-07, NFR-01) -----------------------------------------------------------
select is(pg_temp.ver('e1400000-0000-0000-0000-0000000000a1', 'select privado.mi_profesor_id()::text'), current_setting('rtc.pa'),
  'ADR-018: mi_profesor_id() devuelve el profesor de la sesión');
select is(pg_temp.ver('e1400000-0000-0000-0000-0000000000a1', 'select count(*) from public.profesor'), '1',
  'PRF-07: el profesor A ve solo su fila de profesor');
select is(pg_temp.ver('e1400000-0000-0000-0000-0000000000a1', 'select string_agg(nombre, '','' order by nombre) from public.alumno'), 'Persona X,Persona Y',
  'PRF-07: el profesor A ve solo las personas inscriptas con él (ni Z de B, ni W en baja, ni fichas incompletas)');
select is(pg_temp.ver('e1400000-0000-0000-0000-0000000000a1', 'select count(*) from public.inscripcion'), '3',
  'PRF-07: el profesor A ve solo sus inscripciones, la baja incluida (no la pendiente de X con B)');
select is(pg_temp.ver('e1400000-0000-0000-0000-0000000000a1', 'select string_agg(nombre, '','') from public.persona_a_cargo'), 'Hija de Y',
  'PRF-07: el profesor A ve las personas a cargo de sus alumnos y no las de B');
select is(pg_temp.ver('e1400000-0000-0000-0000-0000000000a1', format('select count(*) from public.grilla_tramo where profesor_id <> %L', current_setting('rtc.pa'))), '0',
  'AGE-10: el profesor A no ve la grilla de otro profesor');
select is(pg_temp.ver('e1400000-0000-0000-0000-0000000000a1', 'select count(*) from public.grilla_tramo'), '10',
  'AGE-10: el profesor A ve su grilla');
select is(pg_temp.ver('e1400000-0000-0000-0000-0000000000a1', 'select count(*) from public.bloqueo'), '1',
  'AGE-10: el profesor A ve solo sus bloqueos');
select is(pg_temp.ver('e1400000-0000-0000-0000-0000000000a1', 'select count(*) from public.reserva'), '1',
  'PRF-07: el profesor A ve solo sus reservas');
select is(pg_temp.ver('e1400000-0000-0000-0000-0000000000a1', 'select count(*) from public.clase'), '1',
  'PRF-07: el profesor A ve solo sus clases');
select is(pg_temp.ver('e1400000-0000-0000-0000-0000000000a1', 'select string_agg(destinatario, '','') from public.v_mails_fallidos'), 'pgtap14.profa@example.test',
  'PRF-07: el profesor A ve solo sus mails (ni los de B ni los de la aplicación)');

-- 5. RLS cruzada: profesor B -----------------------------------------------------------------------------------
select is(pg_temp.ver('e1400000-0000-0000-0000-0000000000b1', 'select string_agg(nombre, '','' order by nombre) from public.alumno'), 'Persona X,Persona Z',
  'PRF-07: el profesor B ve la persona compartida X y su alumna Z, no a Y');
select is(pg_temp.ver('e1400000-0000-0000-0000-0000000000b1', format('select count(*) from public.inscripcion where profesor_id = %L', current_setting('rtc.pa'))), '0',
  'SEC-02: el profesor B no ve las inscripciones de A');
select is(pg_temp.ver('e1400000-0000-0000-0000-0000000000b1', format('select count(*) from public.clase where profesor_id = %L', current_setting('rtc.pa'))), '0',
  'SEC-02: el profesor B no ve las clases de A');
select is(pg_temp.ver('e1400000-0000-0000-0000-0000000000b1', 'select string_agg(nombre, '','') from public.persona_a_cargo'), 'Hijo de Z',
  'SEC-02: el profesor B no ve las personas a cargo de alumnos de A');
select is(pg_temp.ver('e1400000-0000-0000-0000-0000000000b1', format('select count(*) from public.profesor where id = %L', current_setting('rtc.pa'))), '0',
  'SEC-02: el profesor B no ve la fila del profesor A');

-- 6. Persona con dos profesores (SEC-02) ----------------------------------------------------------------------
select is(pg_temp.ver('e1400000-0000-0000-0000-0000000000d1', 'select count(*) from public.alumno'), '1',
  'SEC-02: la persona X ve solo su ficha');
select is(pg_temp.ver('e1400000-0000-0000-0000-0000000000d1', 'select count(*) from public.inscripcion'), '2',
  'ALU-14: la persona X ve sus inscripciones con los dos profesores');
select is(pg_temp.ver('e1400000-0000-0000-0000-0000000000d1', 'select count(*) from public.clase'), '1',
  'SEC-02: la persona X ve solo sus clases');
select is(pg_temp.ver('e1400000-0000-0000-0000-0000000000d1',
  'select (select count(*) from public.profesor) + (select count(*) from public.grilla_tramo) + (select count(*) from public.bloqueo) + (select count(*) from public.mail_salida)'), '0',
  'SEC-02: la persona no ve profesores, grillas, bloqueos ni mails');
select is(pg_temp.ver('e1400000-0000-0000-0000-0000000000d2', format('select count(*) from public.alumno where id = %L', current_setting('rtc.x'))), '0',
  'SEC-02: la persona Z no ve la ficha de X aunque compartan profesor');
select is(pg_temp.ver('e1400000-0000-0000-0000-0000000000d3', 'select count(*) from public.inscripcion'), '0',
  'ALU-14: la ficha incompleta no tiene inscripciones');

-- 7. Administrador que no es profesor (ADM-04, NFR-01) --------------------------------------------------------
select is(pg_temp.ver('e1400000-0000-0000-0000-0000000000c1',
  'select (select count(*) from public.alumno) + (select count(*) from public.inscripcion) + (select count(*) from public.persona_a_cargo)
        + (select count(*) from public.reserva) + (select count(*) from public.clase) + (select count(*) from public.mail_salida)
        + (select count(*) from public.grilla_tramo) + (select count(*) from public.bloqueo) + (select count(*) from public.profesor)'), '0',
  'ADM-04: el Administrador, por serlo, no lee ninguna fila de ninguna tabla');
-- es_administrador() no es ejecutable por la API: se evalúa como postgres con los claims de la sesión.
select is(pg_temp.ver('e1400000-0000-0000-0000-0000000000c1', 'select privado.es_administrador()::text', false), 'true',
  'ADM-01: es_administrador() es verdadero para el Administrador');
select is(pg_temp.ver('e1400000-0000-0000-0000-0000000000a1', 'select privado.es_administrador()::text', false), 'false',
  'ADM-01: es_administrador() es falso para un profesor');
select is(pg_temp.ver('e1400000-0000-0000-0000-0000000000a1', 'select privado.es_profesor()::text'), 'true',
  'ADR-018: es_profesor() equivale a mi_profesor_id() no nulo');
select set_config('request.jwt.claims', '', true) is not null as _;
select ok(not privado.es_administrador() and privado.mi_profesor_id() is null,
  'ADM-04: sin sesión no hay rol de Administrador ni de profesor');

-- 8. Profesor inactivo (AGE-11, PRF-08) -------------------------------------------------------------------------
select lives_ok(format('select privado.exigir_profesor_activo(%L)', current_setting('rtc.pa')),
  'AGE-11: exigir_profesor_activo deja pasar a un profesor activo');
update public.profesor set activo = false where id = current_setting('rtc.pa')::uuid;
select throws_ok(format('select privado.exigir_profesor_activo(%L)', current_setting('rtc.pa')),
  'PT409', 'PROFESOR_INACTIVO', 'AGE-11: exigir_profesor_activo da 409 PROFESOR_INACTIVO con el profesor inactivo');
select throws_ok($$select privado.exigir_profesor_activo('00000000-0000-0000-0000-000000000000')$$,
  'PT404', 'NO_ENCONTRADO', 'AGE-09: exigir_profesor_activo da 404 con un profesor inexistente');
select is(pg_temp.ver('e1400000-0000-0000-0000-0000000000a1', 'select count(*) from public.clase'), '1',
  'PRF-08: el profesor inactivo sigue leyendo lo suyo');

-- 9. Catálogo y privilegios (NFR-01, SEC-04) --------------------------------------------------------------------
select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'profesor_id' and not a.attisdropped)
      and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname
                       and p.cmd = 'SELECT' and p.qual like '%mi_profesor_id()%')),
  '{}'::text[], 'NFR-01: toda tabla con profesor_id tiene una política de lectura que usa privado.mi_profesor_id()');
select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  '{}'::text[], 'NFR-01: toda tabla de public tiene RLS activa (inscripcion incluida)');
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and qual like '%es_profesor()%'),
  0, 'ADR-018: ninguna política usa ya es_profesor() (única fuente: mi_profesor_id)');
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""'] and p.pronargs = 0
          and has_function_privilege('authenticated', p.oid, 'execute')
          and not has_function_privilege('anon', p.oid, 'execute')
     from pg_proc p where p.oid = 'privado.mi_profesor_id()'::regprocedure),
  'SEC-04: mi_profesor_id es security definer, search_path vacío, sin parámetros, solo para authenticated');
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'privado'
      and p.proname in ('es_administrador', 'exigir_profesor_activo', 'bloquear_mail', 'semilla_grilla', 'slug_valido',
                        'configurar_profesor', 'configurar_administrador', 'al_confirmar_usuario')
      and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))),
  '{}'::text[], 'SEC-04: las funciones nuevas de privado (salvo mi_profesor_id) no las ejecuta anon ni authenticated');
select ok(not has_table_privilege('authenticated', 'privado.administrador', 'select')
          and not has_table_privilege('anon', 'privado.administrador', 'select'),
  'ADM-01: privado.administrador no tiene privilegios para la API');
select ok(not has_table_privilege('anon', 'public.inscripcion', 'select')
          and not has_table_privilege('authenticated', 'public.inscripcion', 'insert')
          and not has_table_privilege('authenticated', 'public.inscripcion', 'update')
          and not has_table_privilege('authenticated', 'public.inscripcion', 'delete'),
  'SEC-02: inscripcion es de solo lectura para authenticated y sin acceso para anon');

select * from finish();
rollback;
