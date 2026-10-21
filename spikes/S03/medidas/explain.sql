-- Spike S03: plan y tiempo de agenda_publica. Ejecutar con psql -U postgres.
\pset pager off
-- (a) Llamada a la RPC tal como la ve PostgREST (función security definer: no se inlinea).
explain (analyze, buffers) select * from public.agenda_publica('2026-05-12');
-- (b) Cuerpo de la función con el día literal, para ver el uso de índices.
set search_path = '';
explain (analyze, buffers)
  with p as (select id, zona_horaria from public.profesor order by id limit 1),
  r as (select p.id as profesor_id,
               tstzrange('2026-05-12'::date::timestamp at time zone p.zona_horaria,
                         ('2026-05-12'::date + 1)::timestamp at time zone p.zona_horaria) as rango from p),
  h as (select h.inicio, h.fin from p, privado.huecos_del_dia(p.id, '2026-05-12') h),
  c as (select c.inicio, c.fin from public.clase c, r
        where c.profesor_id = r.profesor_id and c.estado in ('pendiente','confirmada')
          and tstzrange(c.inicio, c.fin) && r.rango),
  b as (select b.periodo from public.bloqueo b, r where b.profesor_id = r.profesor_id and b.periodo && r.rango)
  select x.* from (
    select h.inicio, h.fin, case
      when exists (select 1 from c where tstzrange(c.inicio, c.fin) && tstzrange(h.inicio, h.fin)) then 'ocupado'
      when exists (select 1 from b where b.periodo && tstzrange(h.inicio, h.fin)) then 'bloqueado'
      else 'libre' end as estado from h
    union all
    select c.inicio, c.fin, 'ocupado' from c
    where not exists (select 1 from h where tstzrange(h.inicio, h.fin) && tstzrange(c.inicio, c.fin))
  ) x order by x.inicio;
reset search_path;
-- (c) Tiempo dentro de la base: 200 días distintos, ms por llamada.
do $$
declare d date; t0 timestamptz; ms numeric[] := '{}';
begin
  for i in 0..199 loop
    d := date '2025-11-03' + (i * 3);
    t0 := clock_timestamp();
    perform * from public.agenda_publica(d);
    ms := ms || extract(epoch from clock_timestamp() - t0) * 1000;
  end loop;
  raise notice 'en_base ms: p50=% p95=% max=%',
    round((select percentile_cont(0.5) within group (order by v) from unnest(ms) v)::numeric, 3),
    round((select percentile_cont(0.95) within group (order by v) from unnest(ms) v)::numeric, 3),
    round((select max(v) from unnest(ms) v)::numeric, 3);
end $$;
-- (d) Muestra de respuesta: claves y estados de un día.
select * from public.agenda_publica('2026-05-12');
