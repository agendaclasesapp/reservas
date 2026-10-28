-- B14 · T14.5 (a) · Prueba de catálogo de SEC-32: el aislamiento entre profesores es una propiedad del catálogo.
-- IDs: SEC-32, SEC-02, SEC-04, NFR-01, ADM-04. Agnóstica a las tablas nuevas: recorre `pg_policies` y `pg_attribute`, de modo que
-- cada bolt que agregue una tabla con `profesor_id` queda cubierto sin tocar este archivo. La sonda del final comprueba que el
-- detector detecta (si no, la prueba de arriba pasaría en vacío).
-- Complementa 14_t1_modelo_y_rls (que ya verifica «toda tabla con profesor_id tiene política select con mi_profesor_id()»): aquí
-- además alumno y persona_a_cargo por inscripción, ninguna política con otra función de rol, ninguna RPC con profesor_id de parámetro.
begin;
select plan(13);

-- Detector reutilizable: tablas de public con columna profesor_id sin política SELECT que use mi_profesor_id().
create function pg_temp.sin_politica() returns text[] language sql as $f$
  select coalesce(array_agg(c.relname::text order by c.relname), '{}')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'profesor_id' and not a.attisdropped)
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname
                      and p.cmd in ('SELECT', 'ALL') and p.qual like '%mi_profesor_id()%')
$f$;

-- 1. Toda tabla con profesor_id (SEC-32, NFR-01) -------------------------------------------------------------------------
select is(pg_temp.sin_politica(), '{}'::text[],
  'SEC-32: toda tabla de public con columna profesor_id tiene una política SELECT cuya expresión contiene privado.mi_profesor_id()');
select ok((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r'
              and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'profesor_id' and not a.attisdropped)) >= 8,
  'SEC-32: el detector ve al menos las 8 tablas con profesor_id de B14 (no pasa en vacío)');
select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname in ('profesor', 'inscripcion')
      and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname
                       and p.cmd = 'SELECT' and p.qual like '%mi_profesor_id()%')),
  '{}'::text[], 'SEC-32: profesor (por id) e inscripcion (por profesor_id) se limitan con privado.mi_profesor_id()');

-- 2. alumno y persona_a_cargo por inscripción vigente del profesor (SEC-32, SEC-02) ----------------------------------------
select is(
  (select coalesce(array_agg(p.tablename::text order by p.tablename), '{}') from pg_policies p
    where p.schemaname = 'public' and p.tablename in ('alumno', 'persona_a_cargo') and p.cmd = 'SELECT'
      and not (p.qual like '%inscripcion%' and p.qual like '%mi_profesor_id()%' and p.qual like '%<> ''baja''%')),
  '{}'::text[], 'SEC-32: alumno y persona_a_cargo se limitan por una inscripción del profesor con estado distinto de baja');
select is(
  (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename in ('alumno', 'persona_a_cargo', 'inscripcion')
      and p.qual like '%mi_alumno_id()%'),
  3, 'SEC-02: la persona lee lo suyo por mi_alumno_id() en alumno, persona_a_cargo e inscripcion (las tres)');

-- 3. Ninguna política usa otra función de rol para el profesor (SEC-32, ADR-018) ----------------------------------------------
select is(
  (select coalesce(array_agg((p.tablename || '.' || p.policyname)::text order by p.tablename, p.policyname), '{}') from pg_policies p
    where p.schemaname = 'public' and (p.qual ~ 'es_profesor\(\)|es_administrador\(\)' or p.with_check ~ 'es_profesor\(\)|es_administrador\(\)')),
  '{}'::text[], 'SEC-32/ADM-04: ninguna política usa es_profesor() ni es_administrador() (el Administrador no gana filas por serlo)');
select is(
  (select coalesce(array_agg((p.tablename || '.' || p.policyname)::text order by p.tablename, p.policyname), '{}') from pg_policies p
    where p.schemaname = 'public' and (p.qual in ('true', '(true)') or p.qual is null)),
  '{}'::text[], 'SEC-02: ninguna política es «using (true)» ni sin condición');
select is(
  (select coalesce(array_agg(p.tablename::text order by p.tablename), '{}') from pg_policies p
    where p.schemaname = 'public' and p.qual !~ 'mi_profesor_id\(\)|mi_alumno_id\(\)'),
  '{}'::text[], 'SEC-02: toda política de public se apoya en mi_profesor_id() o mi_alumno_id()');
-- Toda política se evalúa como (select …): una vez por consulta y no por fila (rendimiento, NFR-01).
select is(
  (select coalesce(array_agg((p.tablename || '.' || p.policyname)::text order by p.tablename, p.policyname), '{}') from pg_policies p
    where p.schemaname = 'public' and (regexp_replace(p.qual, '\( SELECT privado\.mi_(profesor|alumno)_id\(\) AS mi_(profesor|alumno)_id\)', '', 'g') ~ 'privado\.mi_(profesor|alumno)_id\(\)')),
  '{}'::text[], 'NFR-01: las funciones de rol en las políticas van envueltas en (select …) para evaluarse una vez por consulta');

-- 4. Ninguna RPC [Prof] toma profesor_id de un parámetro del cliente (SEC-32, SEC-06) ------------------------------------------
-- Hoy ninguna RPC pública de B14 recibe un `p_profesor_id`. B06 agrega `solicitar_reserva(p_profesor_id, …)` y
-- `previsualizar_serie(p_profesor_id, …)` (de la persona hacia el profesor elegido, que valida la inscripción aprobada);
-- cuando existan se agregan aquí con nombre y con su prueba de inscripción.
select is(
  (select coalesce(array_agg(distinct p.proname::text order by p.proname::text), '{}') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proargnames is not null and 'p_profesor_id' = any (p.proargnames)
      and has_function_privilege('authenticated', p.oid, 'execute')),
  '{}'::text[], 'SEC-32/SEC-06: ninguna RPC pública ejecutable recibe p_profesor_id (el profesor sale de mi_profesor_id())');

-- 5. Sonda: el detector detecta (mutación) --------------------------------------------------------------------------------------
create table public.zz_sonda_profesor (id int, profesor_id uuid);
alter table public.zz_sonda_profesor enable row level security;
select is(pg_temp.sin_politica(), array['zz_sonda_profesor'], 'sonda: una tabla con profesor_id y sin política se detecta');
create policy sonda_abierta on public.zz_sonda_profesor for select using (true);
select is(pg_temp.sin_politica(), array['zz_sonda_profesor'], 'sonda: una política «using (true)» no basta, se detecta');
create policy sonda_ok on public.zz_sonda_profesor for select using (profesor_id = (select privado.mi_profesor_id()));
select is(pg_temp.sin_politica(), '{}'::text[], 'sonda: con una política que usa mi_profesor_id() deja de detectarse');

select * from finish();
rollback;
