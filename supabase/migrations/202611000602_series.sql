-- B06 · T06.1 · Series materializadas: fechas de una serie con las salteadas, `previsualizar_serie` y la
-- extensión diaria por pg_cron (ADR-003, ADR-004, ADR-008, ADR-014, ADR-018).
-- IDs: RES-01, RES-02, RES-05, RES-07, AGE-03, AGE-10, AGE-11, SEC-06, SEC-09, SEC-28. contratos.md §3.
-- Toda hora sale de `public.app_ahora()` (ADR-014).

-- 1. Por qué un intervalo no está libre en la agenda de un profesor (RES-01, RES-07, AGE-07): `ocupado` si
--    solapa una clase pendiente o confirmada de ese profesor (mismo predicado que `clase_sin_solape`),
--    `bloqueado` si solapa un bloqueo suyo; null si está libre. Ocupado gana, como en `agenda_publica`.
create function privado.motivo_no_libre(p_profesor_id uuid, p_inicio timestamptz, p_fin timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when exists (
      select 1
        from public.clase c
       where c.profesor_id = p_profesor_id
         and c.estado in ('pendiente', 'confirmada')
         and pg_catalog.tstzrange(c.inicio, c.fin, '[)') && pg_catalog.tstzrange(p_inicio, p_fin, '[)')
    ) then 'ocupado'
    when exists (
      select 1
        from public.bloqueo b
       where b.profesor_id = p_profesor_id
         and b.periodo && pg_catalog.tstzrange(p_inicio, p_fin, '[)')
    ) then 'bloqueado'
  end
$$;

-- 2. Fin del hueco generado que empieza en `p_inicio` (AGE-02), o null si `p_inicio` no es el inicio de un
--    hueco de la grilla de ese profesor en ese día local (FUERA_DE_GRILLA).
create function privado.fin_de_hueco(p_profesor_id uuid, p_inicio timestamptz)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select h.fin
    from public.profesor p
   cross join lateral privado.huecos_del_dia(p.id, (p_inicio at time zone p.zona_horaria)::date) h
   where p.id = p_profesor_id
     and h.inicio = p_inicio
$$;

-- 3. Fechas de una serie (ADR-003): cada fecha es fecha local + `hora_local` en el huso del profesor (no
--    instante + 7 días: el horario de verano no corre la clase). De `p_primera` cada `p_frecuencia` semanas,
--    las que caen entre `p_desde` y `p_hasta` (días locales, inclusive). Cada una sale `reservable` o
--    `salteada` con su motivo (RES-05); no escribe nada. La duración es la de la reserva, aunque la grilla
--    haya cambiado (AGE-03): solo saltea si hay solape real.
create function privado.fechas_serie(
  p_profesor_id uuid,
  p_primera date,
  p_hora_local time,
  p_duracion_min integer,
  p_frecuencia integer,
  p_desde date,
  p_hasta date
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
           select (d.dia::date + p_hora_local) at time zone p.zona_horaria as inicio,
                  ((d.dia::date + p_hora_local) at time zone p.zona_horaria)
                    + pg_catalog.make_interval(mins => p_duracion_min) as fin
         ) as f
   cross join lateral (select privado.motivo_no_libre(p_profesor_id, f.inicio, f.fin) as motivo) as m
   where p.id = p_profesor_id
     and p_frecuencia in (1, 2)
     and d.dia::date >= p_desde
   order by f.inicio
$$;

-- 4. Último día local que materializa una serie que empieza en `p_dia` (ADR-003): hoy + `horizonte_semanas`
--    en el huso del profesor, o el día de la primera fecha si cae más allá (SEC-09: series <= horizonte).
create function privado.horizonte_serie(p_profesor_id uuid, p_dia date, p_ahora timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select greatest((p_ahora at time zone p.zona_horaria)::date + p.horizonte_semanas * 7, p_dia)
    from public.profesor p
   where p.id = p_profesor_id
$$;

-- 5. Validación común del primer hueco de una solicitud o una vista previa (SEC-09, AGE-02):
--    `p_inicio` obligatorio y su día local entre hoy − 366 días y hoy + horizonte + 31 días (el alcance de
--    `agenda_publica`, H-010): si no, 422 `{"campo":"p_inicio"}`; que sea el inicio de un hueco generado: si
--    no, 422 `FUERA_DE_GRILLA`. Devuelve el fin del hueco.
create function privado.validar_primer_hueco(p_profesor_id uuid, p_inicio timestamptz, p_ahora timestamptz)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_zona text;
  v_horizonte integer;
  v_hoy date;
  v_dia date;
  v_fin timestamptz;
begin
  select p.zona_horaria, p.horizonte_semanas into v_zona, v_horizonte
    from public.profesor p where p.id = p_profesor_id;
  if p_inicio is null then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_inicio"}';
  end if;
  v_hoy := (p_ahora at time zone v_zona)::date;
  v_dia := (p_inicio at time zone v_zona)::date;
  if v_dia < v_hoy - 366 or v_dia > v_hoy + v_horizonte * 7 + 31 then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_inicio"}';
  end if;
  v_fin := privado.fin_de_hueco(p_profesor_id, p_inicio);
  if v_fin is null then
    raise exception using errcode = 'PT422', message = 'FUERA_DE_GRILLA';
  end if;
  return v_fin;
end;
$$;

-- 6. `previsualizar_serie(p_profesor_id, p_inicio, p_frecuencia)` [U,P] (RES-05, CA-19): las fechas que
--    tendría una serie desde `p_inicio` hasta el horizonte, sin escribir nada, con la misma regla que
--    `solicitar_reserva`. La persona elige el profesor (`p_profesor_id`; desconocido 404, inactivo 409 como
--    la agenda pública, AGE-11); el profesor usa el suyo y `p_profesor_id` se ignora (SEC-06, SEC-32).
--    La primera fecha sale con su estado real: si no es `reservable`, `solicitar_reserva` daría 409.
--    Solo `inicio`, `estado` y `motivo`: lo mismo que ya muestra la agenda pública (SEC-07).
create function privado.previsualizar_serie(p_profesor_id uuid, p_inicio timestamptz, p_frecuencia integer)
returns table (inicio timestamptz, estado text, motivo text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_ahora timestamptz := public.app_ahora();
  v_profesor uuid := privado.mi_profesor_id();
  v_fin timestamptz;
  v_zona text;
  v_dia date;
begin
  if v_profesor is null then
    perform privado.persona_de_sesion();
    v_profesor := p_profesor_id;
    perform privado.exigir_profesor_activo(v_profesor);
  end if;

  if p_frecuencia is null or p_frecuencia not in (1, 2) then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_frecuencia"}';
  end if;
  v_fin := privado.validar_primer_hueco(v_profesor, p_inicio, v_ahora);

  select p.zona_horaria into v_zona from public.profesor p where p.id = v_profesor;
  v_dia := (p_inicio at time zone v_zona)::date;

  return query
    select f.inicio, f.estado, f.motivo
      from privado.fechas_serie(
             v_profesor, v_dia, (p_inicio at time zone v_zona)::time,
             (extract(epoch from (v_fin - p_inicio)) / 60)::integer, p_frecuencia,
             v_dia, privado.horizonte_serie(v_profesor, v_dia, v_ahora)) f;
end;
$$;

create function public.previsualizar_serie(p_profesor_id uuid, p_inicio timestamptz, p_frecuencia integer)
returns table (inicio timestamptz, estado text, motivo text)
language sql
stable
security definer
set search_path = ''
as $$
  select v.inicio, v.estado, v.motivo
    from privado.previsualizar_serie(p_profesor_id, p_inicio, p_frecuencia) v
$$;

-- 7. `privado.extender_series(p_ahora)` (ADR-003, ADR-008; job diario): materializa hasta hoy + horizonte las
--    fechas nuevas de las series pendientes o confirmadas sin `hasta`, con el estado de la serie y salteando
--    las ocupadas o bloqueadas. Solo profesores activos (AGE-11, DEC-35 A): al reactivarlo, la corrida
--    siguiente completa el horizonte. Toma el cerrojo de cada profesor (ADR-002) y devuelve cuántas clases
--    creó, para pgTAP y `cron.job_run_details`. Corre como `postgres`; no es invocable por la API.
create function privado.extender_series(p_ahora timestamptz default public.app_ahora())
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
                                  coalesce(v_reserva.materializada_hasta, v_reserva.desde - 1) + 1, v_hasta) f
       where f.estado = 'reservable';
      get diagnostics v_filas = row_count;
      v_creadas := v_creadas + v_filas;

      update public.reserva r set materializada_hasta = v_hasta where r.id = v_reserva.id;
    end loop;
  end loop;

  return v_creadas;
end;
$$;

-- 8. Permisos (SEC-04): `privado` no es ejecutable por la API; `previsualizar_serie` [U,P].
revoke execute on function
  privado.motivo_no_libre(uuid, timestamptz, timestamptz),
  privado.fin_de_hueco(uuid, timestamptz),
  privado.fechas_serie(uuid, date, time, integer, integer, date, date),
  privado.horizonte_serie(uuid, date, timestamptz),
  privado.validar_primer_hueco(uuid, timestamptz, timestamptz),
  privado.previsualizar_serie(uuid, timestamptz, integer),
  privado.extender_series(timestamptz)
  from public, anon, authenticated;

revoke execute on function public.previsualizar_serie(uuid, timestamptz, integer) from public, anon;
grant execute on function public.previsualizar_serie(uuid, timestamptz, integer) to authenticated;

-- 9. pg_cron (ADR-008, SEC-28): diario 03:10 UTC. `cron.schedule` con nombre es idempotente.
select cron.schedule('extender_series', '10 3 * * *', 'select privado.extender_series()');
