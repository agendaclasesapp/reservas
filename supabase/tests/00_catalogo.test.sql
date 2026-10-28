-- Catálogo de seguridad de la base (SEC-01, SEC-03, SEC-04, SEC-05; casos T-SOL-19, CA-26, NFR-01).
-- Genérico: mira todo lo que existe en `public` y `privado`, de modo que cada bolt queda cubierto sin tocar
-- este archivo. Lo único por bolt es supabase/tests/lista_rpc/BB.txt (developer), que se incrusta abajo con
-- `node tests/soporte/sincronizar-lista-rpc.mjs` (pg_prove corre dentro del contenedor y no lee el repositorio).
begin;
select plan(22);

create temp table lista_rpc (rol text, funcion text) on commit drop;
-- LISTA_RPC:INICIO (generado por tests/soporte/sincronizar-lista-rpc.mjs; no editar a mano)
insert into lista_rpc (rol, funcion) values
  ('authenticated', 'agenda_profesor'),
  ('anon', 'agenda_publica'),
  ('authenticated', 'alta_alumno'),
  ('authenticated', 'alta_profesor'),
  ('authenticated', 'app_ahora'),
  ('authenticated', 'aprobar_cuenta'),
  ('authenticated', 'bloquear'),
  ('authenticated', 'borrar_alumno'),
  ('authenticated', 'cambiar_estado_profesor'),
  ('authenticated', 'cancelar_clase'),
  ('authenticated', 'completar_ficha'),
  ('anon', 'config_publica'),
  ('authenticated', 'contadores'),
  ('authenticated', 'crear_clase'),
  ('authenticated', 'desbloquear'),
  ('authenticated', 'descartar_union'),
  ('authenticated', 'editar_alumno'),
  ('authenticated', 'guardar_configuracion'),
  ('authenticated', 'guardar_grilla'),
  ('authenticated', 'guardar_persona_a_cargo'),
  ('authenticated', 'listar_profesores'),
  ('authenticated', 'mover_clase'),
  ('authenticated', 'pedir_inscripcion'),
  ('anon', 'ping'),
  ('authenticated', 'previsualizar_serie'),
  ('authenticated', 'rechazar_cuenta'),
  ('authenticated', 'responder_solicitud'),
  ('authenticated', 'sesion_actual'),
  ('authenticated', 'solicitar_cancelacion'),
  ('authenticated', 'solicitar_movimiento'),
  ('authenticated', 'solicitar_reserva'),
  ('authenticated', 'sugerencias_union'),
  ('authenticated', 'unir_alumnos');
-- LISTA_RPC:FIN

-- Objetos propios del esquema (sin los de extensiones).
create temp view tablas_publicas as
  select c.oid, c.relname, c.relkind, c.relrowsecurity, c.reloptions
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
     and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e');

create temp view funciones as
  select p.oid, n.nspname, p.proname, p.prosecdef, p.proconfig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'privado') and p.prokind in ('f', 'p')
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');

-- SEC-01 / T-SOL-19 / CA-26: RLS activa en toda tabla.
select is(
  (select coalesce(array_agg(relname::text order by relname), '{}') from tablas_publicas
    where relkind in ('r', 'p') and not relrowsecurity),
  '{}'::text[],
  'SEC-01: toda tabla de public tiene RLS activa');

-- SEC-01: anon sin ningún grant sobre tablas ni vistas (ni a nivel de columna).
select is(
  (select coalesce(array_agg(relname::text order by relname), '{}') from tablas_publicas
    where has_table_privilege('anon', oid, 'select,insert,update,delete,truncate,references,trigger')
       or has_any_column_privilege('anon', oid, 'select,insert,update,references')),
  '{}'::text[],
  'SEC-01: anon no tiene grants sobre tablas ni vistas de public');

-- SEC-03: authenticated sin escritura directa.
select is(
  (select coalesce(array_agg(relname::text order by relname), '{}') from tablas_publicas
    where has_table_privilege('authenticated', oid, 'insert,update,delete,truncate')
       or has_any_column_privilege('authenticated', oid, 'insert,update')),
  '{}'::text[],
  'SEC-03: authenticated no tiene insert/update/delete/truncate sobre public');

-- SEC-03: ninguna política de escritura.
select is(
  (select coalesce(array_agg((tablename || '.' || policyname)::text order by tablename, policyname), '{}')
     from pg_policies where schemaname = 'public' and cmd <> 'SELECT'),
  '{}'::text[],
  'SEC-03: las políticas de public son solo SELECT');

-- SEC-04: lista blanca de funciones por rol (anon: lo marcado anon; authenticated: toda la lista).
select is(
  (select coalesce(array_agg(distinct proname::text), '{}') from funciones
    where nspname = 'public' and has_function_privilege('anon', oid, 'execute')
      and proname not in (select funcion from lista_rpc where rol = 'anon')),
  '{}'::text[],
  'SEC-04: anon ejecuta solo lo de la lista (sobran)');
select is(
  (select coalesce(array_agg(l.funcion::text order by l.funcion), '{}') from lista_rpc l
    where l.rol = 'anon' and not exists (
      select 1 from funciones f where f.nspname = 'public' and f.proname = l.funcion
         and has_function_privilege('anon', f.oid, 'execute'))),
  '{}'::text[],
  'SEC-04: anon ejecuta toda la lista anon (faltan)');
select is(
  (select coalesce(array_agg(distinct proname::text), '{}') from funciones
    where nspname = 'public' and has_function_privilege('authenticated', oid, 'execute')
      and proname not in (select funcion from lista_rpc)),
  '{}'::text[],
  'SEC-04: authenticated ejecuta solo lo de la lista (sobran)');
select is(
  (select coalesce(array_agg(l.funcion::text order by l.funcion), '{}') from lista_rpc l
    where not exists (
      select 1 from funciones f where f.nspname = 'public' and f.proname = l.funcion
         and has_function_privilege('authenticated', f.oid, 'execute'))),
  '{}'::text[],
  'SEC-04: authenticated ejecuta toda la lista (faltan)');

-- SEC-04 (punto 1, B14): de `privado`, authenticated ejecuta exactamente es_profesor, mi_alumno_id y mi_profesor_id (las
-- políticas de RLS se evalúan con los permisos del invocador; privado no está en [api] schemas, no son RPC); anon,
-- ninguna. es_administrador NO está en la lista: la usan las RPC [Adm] security definer, no las políticas.
select is(
  (select coalesce(array_agg(proname::text order by proname), '{}') from funciones
    where nspname = 'privado' and has_function_privilege('authenticated', oid, 'execute')),
  array['es_profesor', 'mi_alumno_id', 'mi_profesor_id'],
  'SEC-04: de privado authenticated ejecuta exactamente es_profesor, mi_alumno_id y mi_profesor_id');
select is(
  (has_function_privilege('authenticated', 'privado.es_administrador()', 'execute'),
   has_function_privilege('anon', 'privado.es_administrador()', 'execute')),
  (false, false), 'SEC-04 (B14): privado.es_administrador no es ejecutable por authenticated ni por anon');
select is(
  (select coalesce(array_agg(proname::text order by proname), '{}') from funciones
    where nspname = 'privado' and has_function_privilege('anon', oid, 'execute')),
  '{}'::text[],
  'SEC-04: ninguna función de privado es ejecutable por anon');
-- SEC-04 (punto 2): las tres excepciones son security definer, search_path vacío, sin parámetros y sin ACL para public/anon.
select is(
  (select count(*)::int from funciones f join pg_proc p on p.oid = f.oid
    where f.nspname = 'privado' and f.proname in ('es_profesor', 'mi_alumno_id', 'mi_profesor_id')
      and f.prosecdef and f.proconfig @> array['search_path=""'] and p.pronargs = 0
      and not has_function_privilege('anon', f.oid, 'execute')
      and not exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x where x.grantee = 0)),
  3, 'SEC-04: es_profesor, mi_alumno_id y mi_profesor_id son security definer, search_path vacío, sin parámetros y sin ACL para public ni anon');
-- SEC-04 (puntos 3 y 4): USAGE de privado solo para authenticated; ninguna tabla ni secuencia con privilegios de API.
select is(
  (has_schema_privilege('anon', 'privado', 'usage'), has_schema_privilege('authenticated', 'privado', 'usage')),
  (false, true), 'SEC-04: USAGE sobre privado: anon no, authenticated sí');
select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}') from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'privado' and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
      and (has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate,references,trigger')
        or has_table_privilege('authenticated', c.oid, 'select,insert,update,delete,truncate,references,trigger'))),
  '{}'::text[], 'SEC-04: ninguna tabla ni secuencia de privado tiene privilegios para anon ni authenticated');

-- SEC-04: alter default privileges revoca execute (y los grants de tabla) a los roles de la API.
create function public.zz_sonda_fn() returns int language sql as 'select 1';
create function privado.zz_sonda_fn() returns int language sql as 'select 1';
create table public.zz_sonda_tabla (id int);
select is(
  (select array_agg(r order by r) from (
     select 'public.fn:' || rol as r from unnest(array['anon', 'authenticated']) rol
      where has_function_privilege(rol, 'public.zz_sonda_fn()', 'execute')
     union all
     select 'privado.fn:' || rol from unnest(array['anon', 'authenticated']) rol
      where has_function_privilege(rol, 'privado.zz_sonda_fn()', 'execute')
     union all
     select 'public.tabla:' || rol from unnest(array['anon', 'authenticated']) rol
      where has_table_privilege(rol, 'public.zz_sonda_tabla', 'select,insert,update,delete')) t),
  null::text[],
  'SEC-04: una función o tabla nueva no queda accesible a anon ni authenticated por defecto');

-- SEC-05: security definer con search_path vacío (las sondas de arriba no son security definer).
select is(
  (select coalesce(array_agg((nspname || '.' || proname)::text order by nspname, proname), '{}') from funciones
    where prosecdef and not coalesce(proconfig @> array['search_path=""'], false)),
  '{}'::text[],
  'SEC-05: toda función security definer fija search_path vacío');

-- SEC-05: vistas de public con security_invoker.
select is(
  (select coalesce(array_agg(relname::text order by relname), '{}') from tablas_publicas
    where relkind = 'v' and not exists (
      select 1 from unnest(coalesce(reloptions, '{}')) o
       where o in ('security_invoker=true', 'security_invoker=on', 'security_invoker=1'))),
  '{}'::text[],
  'SEC-05: toda vista de public tiene security_invoker = true');

-- SEC-01: public no tiene objetos que esquiven RLS (vistas materializadas, tablas foráneas).
select is(
  (select coalesce(array_agg(relname::text order by relname), '{}') from tablas_publicas where relkind in ('m', 'f')),
  '{}'::text[],
  'SEC-01: public no tiene vistas materializadas ni tablas foráneas (no tienen RLS)');

-- ADR-013 «Regla de unión» (H-241), reglas 1 a 3, sobre toda FK hacia public.alumno(id) de public y privado.
-- Regla 1: FK de una columna (las compuestas las saltaría el bucle de privado.unir_alumnos).
select is(
  (select coalesce(array_agg((conrelid::regclass || '.' || conname)::text order by conname), '{}')
     from pg_constraint where contype = 'f' and confrelid = 'public.alumno'::regclass and cardinality(conkey) <> 1),
  '{}'::text[], 'ADR-013 regla 1: toda FK hacia alumno es de una sola columna');
-- Regla 2: sin cascade ni set null, salvo privado.union_descartada (la unión la excluye a propósito).
select is(
  (select coalesce(array_agg((conrelid::regclass || '.' || conname)::text order by conname), '{}')
     from pg_constraint where contype = 'f' and confrelid = 'public.alumno'::regclass and confdeltype in ('c', 'n', 'd')
      and conrelid <> 'privado.union_descartada'::regclass),
  '{}'::text[], 'ADR-013 regla 2: ninguna FK hacia alumno con cascade ni set null (salvo union_descartada)');
-- Regla 3: sin índice único ni exclusión que incluya la columna FK, salvo la lista blanca:
--   privado.union_descartada (se va con el sin cuenta) e public.inscripcion (única por alumno y profesor; la fusión
--   de inscripciones va antes del bucle en privado.unir_alumnos y la prueba está en 14_t2_cuentas_union).
select is(
  (select coalesce(array_agg(distinct (c.conrelid::regclass || '.' || i.indexrelid::regclass)::text), '{}')
     from pg_constraint c
     join pg_index i on i.indrelid = c.conrelid and (i.indisunique or i.indisexclusion)
    where c.contype = 'f' and c.confrelid = 'public.alumno'::regclass
      and c.conkey[1] = any (i.indkey::int2[])
      and c.conrelid::regclass::text not in ('privado.union_descartada', 'inscripcion')),
  '{}'::text[], 'ADR-013 regla 3: ninguna tabla fuera de la lista blanca tiene unicidad que incluya la FK a alumno');
select is(
  (select array_agg(t order by t) from (select c.conrelid::regclass::text t from pg_constraint c
     join pg_index i on i.indrelid = c.conrelid and i.indisunique
    where c.contype = 'f' and c.confrelid = 'public.alumno'::regclass and c.conkey[1] = any (i.indkey::int2[])
      and c.conrelid::regclass::text in ('privado.union_descartada', 'inscripcion') group by 1) x),
  array['inscripcion', 'privado.union_descartada'],
  'ADR-013 regla 3: la lista blanca es exactamente union_descartada e inscripcion (esta última con fusión previa)');

select * from finish();
rollback;
