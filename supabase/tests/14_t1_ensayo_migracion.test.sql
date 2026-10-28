-- B14 · T14.1 · Resultado del ensayo de la expansión (ADR-021) sobre los datos de 14_t1_ensayo_datos_b05.sql.
-- Solo corre si la base tiene esos datos (ver los pasos en ese archivo); en la base de desarrollo se omite.
-- IDs: NFR-01, ALU-14, AGE-09, SEC-02. Los assert de la migración ya pasaron si la migración se aplicó; esto
-- comprueba fila por fila que no se perdió nada.
select exists (select 1 from public.profesor where mail = 'ensayo.profesor@example.test') as hay_ensayo \gset
\if :hay_ensayo
begin;
select plan(17);

create function pg_temp.ver(p_sub text, p_sql text)
returns text
language plpgsql
as $$
declare
  v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute p_sql into v;
  execute 'reset role';
  return v;
end;
$$;

select set_config('rtc.p', (select id::text from public.profesor), true) is not null as _;

-- Profesor: el mismo, vinculado, con slug provisional sin datos personales (ADR-021 §2).
select is((select count(*) from public.profesor)::int, 1, 'ADR-021: sigue habiendo un solo profesor');
select is((select user_id::text from public.profesor), 'e2400000-0000-0000-0000-0000000000a0',
  'ADR-021: el user_id del profesor queda intacto');
select ok((select slug::text = 'p-' || left(replace(id::text, '-', ''), 8) and slug_provisional and activo
             from public.profesor),
  'AGE-09/ADR-021: el profesor existente recibe el slug provisional p-<8 hex del id> y queda activo');

-- Inscripciones: una por alumno con vínculo, con su estado, motivo, cómo llegó y fechas (ADR-021 §2).
select is((select count(*) from public.inscripcion)::int, 6,
  'ADR-021: tantas inscripciones como alumnos pendientes, aprobados, rechazados y sin cuenta');
select set_eq(
  $$select a.nombre, i.estado, i.motivo_estado, i.como_llego, i.aprobado_en is not null as aprobado, i.profesor_id::text as profesor
      from public.inscripcion i join public.alumno a on a.id = i.alumno_id$$,
  format($$values ('Ensayo Pendiente', 'pendiente', null, 'Por una amiga', false, %1$L),
                  ('Ensayo Aprobado', 'aprobado', null, 'Por Instagram', true, %1$L),
                  ('Ensayo Rechazado', 'rechazado', 'No tengo lugar', 'Por la radio', false, %1$L),
                  ('Ensayo Alta Mail', 'aprobado', null, null, true, %1$L),
                  ('Ensayo Alta Entro', 'aprobado', null, null, true, %1$L),
                  ('Ensayo Sin Cuenta', 'sin_cuenta', null, null, false, %1$L)$$, current_setting('rtc.p')),
  'ADR-021: cada inscripción conserva estado, motivo, cómo llegó y aprobación del alumno de B05');
select is((select i.creado_en from public.inscripcion i where i.alumno_id = 'e2400000-0000-0000-0000-000000000001'),
  '2026-10-01 10:00-03'::timestamptz, 'ADR-021: creado_en de la inscripción = ficha_completada_en si la hubo');
select is((select i.creado_en from public.inscripcion i where i.alumno_id = 'e2400000-0000-0000-0000-000000000006'),
  '2026-10-07 09:00-03'::timestamptz, 'ADR-021: creado_en de la inscripción = creado_en del alumno sin ficha completada');

-- Personas: estados nuevos, profesor de origen y quién las cargó.
select set_eq(
  $$select id::text as id, estado, ficha_origen_profesor_id is not null as con_origen, creado_por is not null as con_creador from public.alumno$$,
  $$values ('e2400000-0000-0000-0000-000000000001', 'completa', true, false),
           ('e2400000-0000-0000-0000-000000000002', 'completa', true, false),
           ('e2400000-0000-0000-0000-000000000003', 'completa', true, false),
           ('e2400000-0000-0000-0000-000000000004', 'completa', false, true),
           ('e2400000-0000-0000-0000-000000000005', 'completa', false, true),
           ('e2400000-0000-0000-0000-000000000006', 'completa', false, true),
           ('e2400000-0000-0000-0000-000000000007', 'ficha_incompleta', false, false)$$,
  'ADR-021: estado de persona, profesor de origen (completó la ficha) y creado_por (lo cargó el profesor)');
select is((select count(*) from public.alumno where user_id is not null)::int, 5,
  'ADR-021: los usuarios vinculados siguen vinculados');
select is((select count(*) from public.alumno
            where profesor_id is not null or motivo_estado is not null or como_llego is not null
               or aprobado_en is not null)::int, 0,
  'H-284, SEC-02: las columnas viejas de alumno quedan vacías (sus valores viven en inscripcion) hasta la contracción de B15');
select is((select count(*) from public.persona_a_cargo)::int + (select count(*) from public.clase)::int
          + (select count(*) from public.mail_salida)::int, 3,
  'ADR-021: personas a cargo, clases y mails se conservan');
select ok((select indexdef !~ 'profesor_id' from pg_indexes where indexname = 'alumno_mail_unico'),
  'ADR-021: el índice de mail de alumno pasó a ser global');

-- Acceso después de migrar (SEC-02, NFR-01).
select is(pg_temp.ver('e2400000-0000-0000-0000-0000000000a0', 'select count(*) from public.alumno'), '6',
  'NFR-01: el profesor sigue viendo a sus alumnos (no la ficha incompleta)');
select is(pg_temp.ver('e2400000-0000-0000-0000-0000000000a0',
  'select (select count(*) from public.clase) + (select count(*) from public.persona_a_cargo) + (select count(*) from public.v_mails_fallidos)'), '3',
  'NFR-01: el profesor sigue viendo sus clases, personas a cargo y mails fallidos');
select is(pg_temp.ver('e2400000-0000-0000-0000-0000000000a2', 'select count(*) from public.inscripcion'), '1',
  'SEC-02: el alumno aprobado ve su inscripción');
select is(pg_temp.ver('e2400000-0000-0000-0000-0000000000a2', 'select count(*) from public.alumno'), '1',
  'SEC-02: el alumno aprobado ve solo su ficha');
select is(pg_temp.ver('e2400000-0000-0000-0000-0000000000a7', 'select count(*) from public.inscripcion'), '0',
  'ALU-14: la ficha incompleta queda sin vínculo');

select * from finish();
rollback;
\else
select '1..0 # SKIP sin datos del ensayo de ADR-021 (ver 14_t1_ensayo_datos_b05.sql)';
\endif
