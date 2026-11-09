-- B16 · T16.1 · Lectura de varios días de la agenda del profesor: `agenda_profesor_dias(p_desde, p_hasta)`.
-- contratos.md §2 (calendario-profesor), ADR-023 (una RPC en vez de siete llamadas), ADR-002 (errores), ADR-004
-- (husos), ADR-014 (`app_ahora()`). IDs: CAL-07, CAL-08, CAL-09, INV-02, INV-03, INV-05, SEC-04, SEC-05, SEC-06,
-- SEC-09, SEC-32, SEC-34.
-- Expandir: no crea tablas, vistas ni políticas RLS; `agenda_profesor(p_dia)`, `agenda_publica` y `contadores` no
-- cambian (INV-03).

-- 1. Agenda de varios días de un profesor (ADR-023): por cada día de `p_desde` a `p_hasta`, las filas de
--    `privado.agenda_profesor(p_profesor, dia)` —la misma función, sin copiarla: la igualdad día a día es por
--    construcción— y, al final, `dia`, el inicio y el fin reales de la clase (CAL-07, CA-72: una clase de 60 min
--    sobre huecos de 30 llega en dos filas con el mismo `clase_inicio`/`clase_fin`) y el tipo de la solicitud
--    pendiente (CAL-08, DEC-42, DEC-43). Canceladas y rechazadas no salen porque `agenda_profesor` no las trae
--    (CAL-09). Los `join` a `clase` y `solicitud` también filtran por `profesor_id` (defensa en profundidad, INV-02).
--    Orden: `dia`, `inicio`, `clase_id`; a igualdad, el de `agenda_profesor` (`ordinality`).
create function privado.agenda_profesor_dias(p_profesor uuid, p_desde date, p_hasta date)
returns table (
  inicio timestamptz,
  fin timestamptz,
  estado text,
  clase_id uuid,
  solicitud_id uuid,
  quien_toma text,
  titular text,
  observacion text,
  clase_estado text,
  bloqueo_id uuid,
  bloqueo_motivo text,
  reserva_tipo text,
  pasada boolean,
  dia date,
  clase_inicio timestamptz,
  clase_fin timestamptz,
  solicitud_tipo text
)
language sql
stable
set search_path = ''
as $$
  select a.inicio,
         a.fin,
         a.estado,
         a.clase_id,
         a.solicitud_id,
         a.quien_toma,
         a.titular,
         a.observacion,
         a.clase_estado,
         a.bloqueo_id,
         a.bloqueo_motivo,
         a.reserva_tipo,
         a.pasada,
         d.dia,
         cl.inicio,
         cl.fin,
         s.tipo
    from pg_catalog.generate_series(0, p_hasta - p_desde) as g(n)
   cross join lateral (select p_desde + g.n as dia) d
   cross join lateral privado.agenda_profesor(p_profesor, d.dia) with ordinality as a
    left join public.clase cl
      on cl.id = a.clase_id and cl.profesor_id = p_profesor
    left join public.solicitud s
      on s.id = a.solicitud_id and s.profesor_id = p_profesor
   order by d.dia, a.inicio, a.clase_id, a.ordinality
$$;

-- 2. `agenda_profesor_dias(p_desde, p_hasta)` [P] (contratos.md §2; SEC-06, SEC-09, SEC-32): solo la agenda de
--    `privado.profesor_de_lectura()` (no recibe profesor). Orden de los errores: rol (401, 403) → `p_desde` →
--    `p_hasta`. En el huso del profesor y con `app_ahora()`: `p_desde` entre hoy − 366 y hoy + 366;
--    `p_hasta` de `p_desde` a `p_desde + 6` (de 1 a 7 días) y no después de hoy + 366. Si no, 422
--    `{"campo":"p_desde"}` o `{"campo":"p_hasta"}`. No exige el profesor activo: el inactivo ve su agenda (INV-05,
--    PRF-08).
create function public.agenda_profesor_dias(p_desde date, p_hasta date)
returns table (
  inicio timestamptz,
  fin timestamptz,
  estado text,
  clase_id uuid,
  solicitud_id uuid,
  quien_toma text,
  titular text,
  observacion text,
  clase_estado text,
  bloqueo_id uuid,
  bloqueo_motivo text,
  reserva_tipo text,
  pasada boolean,
  dia date,
  clase_inicio timestamptz,
  clase_fin timestamptz,
  solicitud_tipo text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profesor uuid := privado.profesor_de_lectura();
  v_hoy date;
begin
  select (public.app_ahora() at time zone p.zona_horaria)::date into v_hoy
    from public.profesor p
   where p.id = v_profesor;

  if p_desde is null or p_desde < v_hoy - 366 or p_desde > v_hoy + 366 then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_desde"}';
  end if;

  if p_hasta is null or p_hasta < p_desde or p_hasta > p_desde + 6 or p_hasta > v_hoy + 366 then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_hasta"}';
  end if;

  return query
    select a.inicio, a.fin, a.estado, a.clase_id, a.solicitud_id, a.quien_toma, a.titular, a.observacion,
           a.clase_estado, a.bloqueo_id, a.bloqueo_motivo, a.reserva_tipo, a.pasada,
           a.dia, a.clase_inicio, a.clase_fin, a.solicitud_tipo
      from privado.agenda_profesor_dias(v_profesor, p_desde, p_hasta) a;
end;
$$;

-- 3. Permisos (SEC-04): `privado.agenda_profesor_dias` no es ejecutable por la API; `agenda_profesor_dias` [P]
--    solo para `authenticated` (el rol lo valida `profesor_de_lectura`).
revoke execute on function privado.agenda_profesor_dias(uuid, date, date) from public, anon, authenticated;

revoke execute on function public.agenda_profesor_dias(date, date) from public, anon;
grant execute on function public.agenda_profesor_dias(date, date) to authenticated;
