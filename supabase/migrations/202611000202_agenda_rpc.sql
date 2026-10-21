-- B02 · T02.1 · Huecos y agenda pública (AGE-02, AGE-07, AGE-08, ADR-004, ADR-006) y configuración del
-- profesor (`guardar_configuracion`, `guardar_grilla`; ADR-002). contratos.md §1 y §3, SEC-05, SEC-06, SEC-09.
-- Toda hora sale de `public.app_ahora()` (ADR-014).

-- 1. Huecos generados (ADR-006): seguidos desde el inicio de cada tramo, sin el resto menor que la
--    duración (AGE-02); día y horas interpretados en el huso del profesor (ADR-004, AGE-08).
create function privado.huecos_del_dia(p_profesor uuid, p_dia date)
returns table (inicio timestamptz, fin timestamptz)
language sql
stable
set search_path = ''
as $$
  select (p_dia + t.desde + pg_catalog.make_interval(mins => p.duracion_min * n.i)) at time zone p.zona_horaria,
         (p_dia + t.desde + pg_catalog.make_interval(mins => p.duracion_min * (n.i + 1))) at time zone p.zona_horaria
    from public.profesor p
    join public.grilla_tramo t
      on t.profesor_id = p.id
     and t.dia_semana = extract(isodow from p_dia)
   cross join lateral pg_catalog.generate_series(
           0,
           (extract(epoch from (t.hasta - t.desde))::integer / 60) / p.duracion_min - 1
         ) as n (i)
   where p.id = p_profesor
   order by 1
$$;

-- 2. Estados del día (ADR-006, AGE-07): ocupado = solapa una clase pendiente o confirmada; bloqueado =
--    solapa un bloqueo; si no, libre. Una clase activa que no solapa ningún hueco sale aparte como
--    `ocupado` con su inicio y fin; si solapa alguno, aunque sea en parte, ocupa esos huecos y no se
--    agrega: no hay filas que se pisen. Las clases se leen con el predicado de `clase_sin_solape`
--    (mismo `tstzrange(inicio, fin, '[)')` y mismo `where`) para usar su gist parcial (S03).
create function privado.agenda_publica(p_profesor uuid, p_dia date)
returns table (inicio timestamptz, fin timestamptz, estado text)
language sql
stable
set search_path = ''
as $$
  with r as (
    select pg_catalog.tstzrange(p_dia::timestamp at time zone p.zona_horaria,
                                (p_dia + 1)::timestamp at time zone p.zona_horaria, '[)') as rango
      from public.profesor p
     where p.id = p_profesor
  ),
  h as (
    select h.inicio, h.fin, pg_catalog.tstzrange(h.inicio, h.fin, '[)') as periodo
      from privado.huecos_del_dia(p_profesor, p_dia) h
  ),
  c as (
    select c.inicio, c.fin, pg_catalog.tstzrange(c.inicio, c.fin, '[)') as periodo
      from public.clase c, r
     where c.profesor_id = p_profesor
       and pg_catalog.tstzrange(c.inicio, c.fin, '[)') && r.rango
       and c.estado in ('pendiente', 'confirmada')
  ),
  b as (
    select b.periodo
      from public.bloqueo b, r
     where b.profesor_id = p_profesor
       and b.periodo && r.rango
  )
  select x.inicio, x.fin, x.estado
    from (
      select h.inicio, h.fin,
             case
               when exists (select 1 from c where c.periodo && h.periodo) then 'ocupado'
               when exists (select 1 from b where b.periodo && h.periodo) then 'bloqueado'
               else 'libre'
             end
        from h
      union all
      select c.inicio, c.fin, 'ocupado'
        from c
       where not exists (select 1 from h where h.periodo && c.periodo)
    ) as x (inicio, fin, estado)
   order by x.inicio
$$;

-- 3. `agenda_publica(p_dia)` [A] (contratos.md §3): solo `inicio`, `fin`, `estado` (SEC-07, CA-15).
--    `p_dia` entre hoy − 366 días y hoy + horizonte + 31 días en el huso del profesor (SEC-09, H-010).
create function public.agenda_publica(p_dia date)
returns table (inicio timestamptz, fin timestamptz, estado text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profesor uuid;
  v_zona text;
  v_horizonte integer;
  v_hoy date;
begin
  select p.id, p.zona_horaria, p.horizonte_semanas
    into v_profesor, v_zona, v_horizonte
    from public.profesor p
   limit 1;

  v_hoy := (public.app_ahora() at time zone v_zona)::date;

  if p_dia is null or p_dia < v_hoy - 366 or p_dia > v_hoy + v_horizonte * 7 + 31 then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_dia"}';
  end if;

  return query
    select a.inicio, a.fin, a.estado
      from privado.agenda_publica(v_profesor, p_dia) a;
end;
$$;

-- 4. `guardar_configuracion` [P] (AGE-02, AGE-04, AGE-08). Cambiar el huso conserva los instantes de las
--    clases guardadas (DEC-08 A, ADR-004); cambiar la duración no toca clases (AGE-03).
create function privado.guardar_configuracion(
  p_duracion_min integer,
  p_anticipacion_horas integer,
  p_zona_horaria text
)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_profesor uuid;
begin
  -- SEC-06: rol al inicio.
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'NO_AUTENTICADO';
  end if;
  if not privado.es_profesor() then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;

  if p_duracion_min is null or p_duracion_min < 1 or p_duracion_min > 1440 then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_duracion_min"}';
  end if;
  if p_anticipacion_horas is null or p_anticipacion_horas < 0 then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_anticipacion_horas"}';
  end if;
  -- ADR-004: nombre IANA validado contra pg_timezone_names.
  if p_zona_horaria is null
     or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_zona_horaria) then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_zona_horaria"}';
  end if;

  select p.id into v_profesor from public.profesor p where p.user_id = auth.uid();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profesor::text, 0));

  update public.profesor p
     set duracion_min = p_duracion_min,
         anticipacion_horas = p_anticipacion_horas,
         zona_horaria = p_zona_horaria
   where p.id = v_profesor;

  return (
    select pg_catalog.jsonb_build_object(
             'zona_horaria', p.zona_horaria,
             'duracion_min', p.duracion_min,
             'anticipacion_horas', p.anticipacion_horas,
             'horizonte_semanas', p.horizonte_semanas
           )
      from public.profesor p
     where p.id = v_profesor
  );
end;
$$;

create function public.guardar_configuracion(
  p_duracion_min integer,
  p_anticipacion_horas integer,
  p_zona_horaria text
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select privado.guardar_configuracion(p_duracion_min, p_anticipacion_horas, p_zona_horaria)
$$;

-- 5. `guardar_grilla` [P] (AGE-01): reemplaza todos los tramos. Hasta 50 tramos (SEC-09), horas `HH:MM`
--    (`hasta` admite 24:00), `hasta` > `desde`, sin solapes en un mismo día; si no, 422 `{"campo":"p_tramos"}`.
--    No toca clases ni solicitudes (AGE-03).
create function privado.guardar_grilla(p_tramos jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_profesor uuid;
  v_tramo jsonb;
begin
  -- SEC-06: rol al inicio.
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'NO_AUTENTICADO';
  end if;
  if not privado.es_profesor() then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;

  if p_tramos is null
     or pg_catalog.jsonb_typeof(p_tramos) <> 'array'
     or pg_catalog.jsonb_array_length(p_tramos) > 50 then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_tramos"}';
  end if;

  for v_tramo in select e.value from pg_catalog.jsonb_array_elements(p_tramos) e loop
    if pg_catalog.jsonb_typeof(v_tramo) <> 'object'
       or pg_catalog.jsonb_typeof(v_tramo -> 'dia_semana') is distinct from 'number'
       or (v_tramo ->> 'dia_semana') !~ '^[1-7]$'
       or pg_catalog.jsonb_typeof(v_tramo -> 'desde') is distinct from 'string'
       or (v_tramo ->> 'desde') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or pg_catalog.jsonb_typeof(v_tramo -> 'hasta') is distinct from 'string'
       or (v_tramo ->> 'hasta') !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$'
       or (v_tramo ->> 'hasta')::time <= (v_tramo ->> 'desde')::time then
      raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_tramos"}';
    end if;
  end loop;

  -- Solape entre tramos del mismo día (se pueden tocar en el borde).
  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(p_tramos) with ordinality as a (t, i)
      join pg_catalog.jsonb_array_elements(p_tramos) with ordinality as b (t, j)
        on a.i < b.j
       and (a.t ->> 'dia_semana') = (b.t ->> 'dia_semana')
       and (a.t ->> 'desde')::time < (b.t ->> 'hasta')::time
       and (b.t ->> 'desde')::time < (a.t ->> 'hasta')::time
  ) then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_tramos"}';
  end if;

  select p.id into v_profesor from public.profesor p where p.user_id = auth.uid();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profesor::text, 0));

  delete from public.grilla_tramo g where g.profesor_id = v_profesor;

  insert into public.grilla_tramo (profesor_id, dia_semana, desde, hasta)
  select v_profesor, (e.value ->> 'dia_semana')::smallint, (e.value ->> 'desde')::time, (e.value ->> 'hasta')::time
    from pg_catalog.jsonb_array_elements(p_tramos) e;

  return (
    select coalesce(
             pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object(
                 'dia_semana', g.dia_semana,
                 'desde', pg_catalog.to_char(g.desde, 'HH24:MI'),
                 'hasta', pg_catalog.to_char(g.hasta, 'HH24:MI')
               )
               order by g.dia_semana, g.desde
             ),
             '[]'::jsonb
           )
      from public.grilla_tramo g
     where g.profesor_id = v_profesor
  );
end;
$$;

create function public.guardar_grilla(p_tramos jsonb)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select privado.guardar_grilla(p_tramos)
$$;

-- 6. Permisos (SEC-04): `privado` no es ejecutable por la API; `agenda_publica` [A]; el resto [P].
revoke execute on function
  privado.huecos_del_dia(uuid, date),
  privado.agenda_publica(uuid, date),
  privado.guardar_configuracion(integer, integer, text),
  privado.guardar_grilla(jsonb)
  from public, anon, authenticated;

revoke execute on function public.agenda_publica(date) from public;
grant execute on function public.agenda_publica(date) to anon, authenticated;

revoke execute on function
  public.guardar_configuracion(integer, integer, text),
  public.guardar_grilla(jsonb)
  from public, anon;
grant execute on function
  public.guardar_configuracion(integer, integer, text),
  public.guardar_grilla(jsonb)
  to authenticated;
