-- Reloj de la aplicación (ADR-014; apoyo de CA-07, CA-08, CA-09, CA-13, CA-25, CA-31, CA-32): pgTAP lo fija con
-- `update privado.reloj_prueba` dentro de su transacción. Aquí se prueba la propia función app_ahora().
begin;
select plan(8);

select ok((select permitir_reloj_prueba from privado.ajustes), 'ADR-014: el seed local habilitó permitir_reloj_prueba');
select is((select ahora from privado.reloj_prueba), null::timestamptz, 'ADR-014: el reloj de prueba arranca vacío');
select is(public.app_ahora(), now(), 'ADR-014: sin override app_ahora() es now()');

update privado.reloj_prueba set ahora = '2026-11-02 13:00:00+00';
select is(public.app_ahora(), '2026-11-02 13:00:00+00'::timestamptz, 'ADR-014: con override app_ahora() devuelve el instante fijado');

update privado.ajustes set permitir_reloj_prueba = false;
select is(public.app_ahora(), now(), 'ADR-014: con el permiso apagado el override se ignora');
update privado.ajustes set permitir_reloj_prueba = true;

select is(public.ping(), '2026-11-02 13:00:00+00'::timestamptz, 'ADR-014: ping() usa app_ahora()');
select is(
  (select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p where p.oid = 'public.app_ahora()'::regprocedure),
  true, 'SEC-05: app_ahora() es security definer con search_path vacío');
select is(
  (select array_agg(r order by r) from unnest(array['anon', 'authenticated']) r where has_function_privilege(r, 'public.app_ahora()', 'execute')),
  array['authenticated'], 'ADR-014: app_ahora() la ejecuta authenticated y no anon');

select * from finish();
rollback;
