-- B14 · T14.1 · Datos del ensayo de la expansión (ADR-021): una base en el estado de B05 con el profesor
-- configurado y vinculado y alumnos en todos los estados de B05. No es una prueba: carga datos SOLO si la base
-- está en el esquema de B05 (sin `public.inscripcion`); en cualquier otra base no hace nada y pg_prove lo
-- cuenta como omitido. Datos ficticios (@example.test).
--
-- Ensayo (desde la raíz del repositorio; lo repite T14.6 en ops/):
--   npx supabase db reset --version 202611000504 --no-seed
--   docker exec -i supabase_db_reservas psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/14_t1_ensayo_datos_b05.sql
--   npx supabase migration up --local            (aplica 20261100051*: los assert de ADR-021 corren dentro)
--   npx supabase test db supabase/tests/14_t1_ensayo_migracion.test.sql
--   npx supabase db reset                         (vuelve a la base de desarrollo)
select to_regclass('public.inscripcion') is null as es_b05 \gset
\if :es_b05
begin;

-- Profesor configurado (ADR-015, B01) y, más abajo, vinculado por el trigger de B04.
select privado.configurar_profesor('ensayo.profesor@example.test', 'Profesor Ensayo');

-- Alumnos en cada estado de B05. Se cargan sin usuario y los usuarios se crean después: el trigger de B04 los
-- vincula conservando el estado (ADR-013), sin pasar por las transiciones que encolan mails.
insert into public.alumno (id, profesor_id, estado, nombre, mail, telefono, fecha_nacimiento, como_llego,
                           motivo_estado, ficha_completada_en, creado_en, aprobado_en)
select v.id::uuid, p.id, v.estado, v.nombre, v.mail, v.telefono, v.nacimiento::date, v.como_llego, v.motivo,
       v.completada::timestamptz, v.creado::timestamptz, v.aprobado::timestamptz
  from public.profesor p
 cross join (values
   ('e2400000-0000-0000-0000-000000000001', 'pendiente', 'Ensayo Pendiente', 'ensayo.pendiente@example.test', '099 100 001', '1990-01-01', 'Por una amiga', null, '2026-10-01 10:00-03', '2026-10-01 09:00-03', null),
   ('e2400000-0000-0000-0000-000000000002', 'aprobado', 'Ensayo Aprobado', 'ensayo.aprobado@example.test', '099 100 002', '1991-02-02', 'Por Instagram', null, '2026-10-02 10:00-03', '2026-10-02 09:00-03', '2026-10-03 10:00-03'),
   ('e2400000-0000-0000-0000-000000000003', 'rechazado', 'Ensayo Rechazado', 'ensayo.rechazado@example.test', '099 100 003', '1992-03-03', 'Por la radio', 'No tengo lugar', '2026-10-04 10:00-03', '2026-10-04 09:00-03', null),
   ('e2400000-0000-0000-0000-000000000004', 'aprobado', 'Ensayo Alta Mail', 'ensayo.alta@example.test', '099 100 004', '1993-04-04', null, null, null, '2026-10-05 09:00-03', '2026-10-05 09:00-03'),
   ('e2400000-0000-0000-0000-000000000005', 'aprobado', 'Ensayo Alta Entro', 'ensayo.alta.entro@example.test', '099 100 005', '1994-05-05', null, null, null, '2026-10-06 09:00-03', '2026-10-06 09:00-03'),
   ('e2400000-0000-0000-0000-000000000006', 'sin_cuenta', 'Ensayo Sin Cuenta', null, '099 100 006', '1995-06-06', null, null, null, '2026-10-07 09:00-03', null),
   ('e2400000-0000-0000-0000-000000000007', 'ficha_incompleta', null, 'ensayo.incompleta@example.test', null, null, null, null, null, '2026-10-08 09:00-03', null)
 ) as v (id, estado, nombre, mail, telefono, nacimiento, como_llego, motivo, completada, creado, aprobado);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', u.id::uuid, 'authenticated', 'authenticated', u.mail, now(), now(), now(), '', '', '', ''
  from (values
    ('e2400000-0000-0000-0000-0000000000a0', 'ensayo.profesor@example.test'),
    ('e2400000-0000-0000-0000-0000000000a1', 'ensayo.pendiente@example.test'),
    ('e2400000-0000-0000-0000-0000000000a2', 'ensayo.aprobado@example.test'),
    ('e2400000-0000-0000-0000-0000000000a3', 'ensayo.rechazado@example.test'),
    ('e2400000-0000-0000-0000-0000000000a5', 'ensayo.alta.entro@example.test'),
    ('e2400000-0000-0000-0000-0000000000a7', 'ensayo.incompleta@example.test')
  ) as u (id, mail);

insert into public.persona_a_cargo (profesor_id, alumno_id, nombre)
select p.id, 'e2400000-0000-0000-0000-000000000002', 'Hijo de Ensayo' from public.profesor p;

insert into public.reserva (id, profesor_id, alumno_id, tipo, hora_local, dia_semana, duracion_min, estado, desde, origen)
select 'e2400000-0000-0000-0000-0000000000b1', p.id, 'e2400000-0000-0000-0000-000000000002', 'suelta', '09:00', 1, 60,
       'confirmada', '2026-11-02', 'profesor'
  from public.profesor p;
insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado)
select p.id, 'e2400000-0000-0000-0000-0000000000b1', 'e2400000-0000-0000-0000-000000000002',
       '2026-11-02 09:00-03', '2026-11-02 10:00-03', 'confirmada'
  from public.profesor p;

insert into public.mail_salida (profesor_id, alumno_id, tipo, destinatario, asunto, cuerpo_texto, estado, motivo_fallo)
select p.id, 'e2400000-0000-0000-0000-000000000002', 'cuenta_respondida', 'ensayo.aprobado@example.test',
       'Tu cuenta', 'Aprobada', 'fallido', 'TOPE'
  from public.profesor p;

commit;
select '1..0 # SKIP datos del ensayo de ADR-021 cargados';
\else
select '1..0 # SKIP datos del ensayo de ADR-021: solo se cargan sobre una base en el estado de B05';
\endif
