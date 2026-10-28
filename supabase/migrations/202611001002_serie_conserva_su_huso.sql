-- B10 · T10.1 · Una serie conserva el huso con el que se creó (ADR-022, H-393): la reserva guarda el huso del
-- profesor al crearla y `privado.extender_series` materializa sus fechas nuevas en ese huso, no en el actual.
-- Así, después de cambiar el huso, la serie sigue a la misma hora real (DEC-08 A, ADR-004, ADR-003).
-- IDs: AGE-08, AGE-10, RES-05, SEC-28. contratos.md §3. Toda hora sale de `public.app_ahora()` (ADR-014).

-- 1. `reserva.zona_horaria`: el huso del profesor al crear la reserva. Las filas existentes toman el huso actual
--    de su profesor (sin despliegue previo con cambios de huso, es el mismo con que se crearon).
alter table public.reserva add column zona_horaria text;

update public.reserva r
   set zona_horaria = p.zona_horaria
  from public.profesor p
 where p.id = r.profesor_id;

alter table public.reserva alter column zona_horaria set not null;

-- 2. Lo fija siempre un trigger desde `profesor.zona_horaria` (nadie lo pone a mano). Los cuatro sitios que
--    insertan reservas tienen el cerrojo del profesor y calcularon `hora_local` con ese mismo huso.
create function privado.fijar_zona_reserva()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select p.zona_horaria into new.zona_horaria
    from public.profesor p
   where p.id = new.profesor_id;
  return new;
end;
$$;

revoke execute on function privado.fijar_zona_reserva() from public, anon, authenticated;

create trigger reserva_zona_horaria
  before insert on public.reserva
  for each row execute function privado.fijar_zona_reserva();

-- 3. `privado.fechas_serie` con un último parámetro `p_zona` (ADR-022): interpreta fecha + `hora_local` en
--    `p_zona`, o en el huso actual del profesor si es nulo. El resto, como en 202611000602 (ADR-003, RES-05,
--    AGE-03). Las RPC que crean una serie lo llaman sin `p_zona`: huso actual = huso de la serie nueva.
drop function privado.fechas_serie(uuid, date, time, integer, integer, date, date);

create function privado.fechas_serie(
  p_profesor_id uuid,
  p_primera date,
  p_hora_local time,
  p_duracion_min integer,
  p_frecuencia integer,
  p_desde date,
  p_hasta date,
  p_zona text default null
)
returns table (inicio timestamptz, fin timestamptz, estado text, motivo text)
language sql
stable
set search_path = ''
as $$
  select f.inicio, f.fin,
         case when m.motivo is null then 'reservable' else 'salteada' end,
         m.motivo
    from public.profesor p
   cross join lateral pg_catalog.generate_series(
           p_primera::timestamp, p_hasta::timestamp,
           pg_catalog.make_interval(days => 7 * greatest(coalesce(p_frecuencia, 1), 1))
         ) as d (dia)
   cross join lateral (
           select (d.dia::date + p_hora_local) at time zone coalesce(p_zona, p.zona_horaria) as inicio,
                  ((d.dia::date + p_hora_local) at time zone coalesce(p_zona, p.zona_horaria))
                    + pg_catalog.make_interval(mins => p_duracion_min) as fin
         ) as f
   cross join lateral (select privado.motivo_no_libre(p_profesor_id, f.inicio, f.fin) as motivo) as m
   where p.id = p_profesor_id
     and p_frecuencia in (1, 2)
     and d.dia::date >= p_desde
   order by f.inicio
$$;

revoke execute on function privado.fechas_serie(uuid, date, time, integer, integer, date, date, text)
  from public, anon, authenticated;

-- 4. `privado.extender_series` como en 202611000602, pero cada serie se materializa en su propio huso
--    (`reserva.zona_horaria`, ADR-022). El tope `hoy + horizonte` sigue en el huso actual del profesor.
--    `create or replace` conserva el revoke de 202611000602 y el job de pg_cron.
create or replace function privado.extender_series(p_ahora timestamptz default public.app_ahora())
returns integer
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_profesor record;
  v_reserva record;
  v_hasta date;
  v_creadas integer := 0;
  v_filas integer;
begin
  for v_profesor in
    select p.id, p.zona_horaria, p.horizonte_semanas
      from public.profesor p
     where p.activo
       and exists (select 1 from public.reserva r
                    where r.profesor_id = p.id and r.tipo = 'serie' and r.hasta is null
                      and r.estado in ('pendiente', 'confirmada'))
     order by p.id
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profesor.id::text, 0));
    v_hasta := (p_ahora at time zone v_profesor.zona_horaria)::date + v_profesor.horizonte_semanas * 7;

    for v_reserva in
      select r.*
        from public.reserva r
       where r.profesor_id = v_profesor.id
         and r.tipo = 'serie'
         and r.hasta is null
         and r.estado in ('pendiente', 'confirmada')
         and coalesce(r.materializada_hasta, r.desde - 1) < v_hasta
       order by r.desde, r.id
         for update
    loop
      insert into public.clase (profesor_id, reserva_id, alumno_id, persona_a_cargo_id, inicio, fin, estado,
                                confirmada_en)
      select v_reserva.profesor_id, v_reserva.id, v_reserva.alumno_id, v_reserva.persona_a_cargo_id,
             f.inicio, f.fin, v_reserva.estado,
             case when v_reserva.estado = 'confirmada' then p_ahora end
        from privado.fechas_serie(v_reserva.profesor_id, v_reserva.desde, v_reserva.hora_local,
                                  v_reserva.duracion_min, v_reserva.frecuencia_semanas,
                                  coalesce(v_reserva.materializada_hasta, v_reserva.desde - 1) + 1, v_hasta,
                                  v_reserva.zona_horaria) f
       where f.estado = 'reservable';
      get diagnostics v_filas = row_count;
      v_creadas := v_creadas + v_filas;

      update public.reserva r set materializada_hasta = v_hasta where r.id = v_reserva.id;
    end loop;
  end loop;

  return v_creadas;
end;
$$;
