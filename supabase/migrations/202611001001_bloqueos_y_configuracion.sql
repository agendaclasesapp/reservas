-- B10 · T10.1 · Configuración de la agenda por profesor y bloqueos: `guardar_configuracion` (tope de la
-- anticipación, H-140), `bloquear(p_desde, p_hasta, p_motivo)` y `desbloquear(p_bloqueo_id)`.
-- contratos.md §1 y §3, ADR-002 (RPC transaccional y errores), ADR-004 (husos; DEC-08 A), ADR-014 (`app_ahora()`),
-- ADR-018 (profesor de la sesión).
-- IDs: AGE-03, AGE-05, AGE-06, AGE-10, SEC-06, SEC-09. CA-12, CA-14, CA-52, CA-54.
-- `guardar_grilla` (B02, 202611000202) ya cumple el contrato por profesor y no cambia.

-- 1. `guardar_configuracion` [P] (AGE-02, AGE-03, AGE-04, AGE-08, AGE-10): reemplaza la de B02 con la misma firma.
--    Solo escribe la fila de `mi_profesor_id()` (CA-54); no toca clases, reservas ni solicitudes: cambiar la
--    duración conserva el horario de lo guardado (AGE-03, CA-12; cada reserva guarda su `duracion_min`) y cambiar
--    el huso conserva los instantes (DEC-08 A, ADR-004). Límites de entrada (SEC-09): duración 1 a 1440 minutos,
--    anticipación 0 a 8784 horas (366 días, el alcance de `agenda_profesor`; H-140), zona IANA de
--    `pg_timezone_names`. Orden: rol (y cerrojo) → duración → anticipación → zona.
create or replace function privado.guardar_configuracion(
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
  v_profesor uuid := privado.profesor_de_sesion();
begin
  if p_duracion_min is null or p_duracion_min < 1 or p_duracion_min > 1440 then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_duracion_min"}';
  end if;
  if p_anticipacion_horas is null or p_anticipacion_horas < 0 or p_anticipacion_horas > 8784 then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_anticipacion_horas"}';
  end if;
  if p_zona_horaria is null
     or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_zona_horaria) then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_zona_horaria"}';
  end if;

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

-- 2. `bloquear` [P] (AGE-05, AGE-10, CA-14): un hueco, un rango de horas o días completos (00:00 a 00:00 en el
--    huso del profesor) de su propia agenda, período `[p_desde, p_hasta)`. Orden: rol (y cerrojo) → `p_desde`
--    (422 `{"campo":"p_desde"}` si es nulo o anterior a las 00:00 de hoy − 366 días en su huso) → `p_hasta` (422
--    `{"campo":"p_hasta"}` si es nulo, no es posterior a `p_desde`, el rango pasa de 366 días locales o pasa de
--    las 00:00 de hoy + 367 días en su huso: el día hoy + 366 entra completo; los extremos pasan, SEC-09, H-015,
--    H-394) → motivo opcional con `privado.validar_motivo` (vacío = null, hasta 500 caracteres tras `btrim`; 422
--    `{"campo":"motivo"}`, como `responder_solicitud`) → conflictos: toda clase suya `pendiente` o `confirmada` que solapa el período (las
--    pendientes son las de una solicitud de reserva o de movimiento; una cancelación pendiente tiene su clase
--    confirmada) da 409 `BLOQUEO_CON_RESERVAS` con `[{clase_id, inicio, estado, alumno}]` ordenado por `inicio`
--    (`alumno`: quien toma la clase, como `quien_toma` de `agenda_profesor`; null si la persona está en `baja`
--    con él). Nada se escribe antes del último paso. No exige el profesor activo (no está en la lista de ADR-018).
create function privado.bloquear(p_desde timestamptz, p_hasta timestamptz, p_motivo text)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_profesor uuid := privado.profesor_de_sesion();
  v_zona text;
  v_hoy date;
  v_motivo text;
  v_conflictos jsonb;
  v_bloqueo uuid;
begin
  select p.zona_horaria into v_zona from public.profesor p where p.id = v_profesor;
  v_hoy := (public.app_ahora() at time zone v_zona)::date;

  if p_desde is null
     or p_desde < (v_hoy - 366)::timestamp at time zone v_zona then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_desde"}';
  end if;
  if p_hasta is null
     or p_hasta <= p_desde
     or (p_hasta at time zone v_zona) > (p_desde at time zone v_zona) + interval '366 days'
     or p_hasta > (v_hoy + 367)::timestamp at time zone v_zona then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_hasta"}';
  end if;
  v_motivo := privado.validar_motivo(p_motivo);

  -- Mismo predicado que `clase_sin_solape` (gist parcial, S03).
  select pg_catalog.jsonb_agg(
           pg_catalog.jsonb_build_object(
             'clase_id', c.id,
             'inicio', c.inicio,
             'estado', c.estado,
             'alumno', case when i.id is not null then coalesce(pc.nombre, a.nombre) end
           )
           order by c.inicio, c.id
         )
    into v_conflictos
    from public.clase c
    join public.alumno a on a.id = c.alumno_id
    left join public.persona_a_cargo pc on pc.id = c.persona_a_cargo_id
    left join public.inscripcion i
      on i.alumno_id = c.alumno_id and i.profesor_id = v_profesor and i.estado <> 'baja'
   where c.profesor_id = v_profesor
     and c.estado in ('pendiente', 'confirmada')
     and pg_catalog.tstzrange(c.inicio, c.fin, '[)') && pg_catalog.tstzrange(p_desde, p_hasta, '[)');

  if v_conflictos is not null then
    raise exception using errcode = 'PT409', message = 'BLOQUEO_CON_RESERVAS', detail = v_conflictos::text;
  end if;

  insert into public.bloqueo (profesor_id, periodo, motivo)
  values (v_profesor, pg_catalog.tstzrange(p_desde, p_hasta, '[)'), v_motivo)
  returning id into v_bloqueo;

  return pg_catalog.jsonb_build_object('bloqueo_id', v_bloqueo);
end;
$$;

create function public.bloquear(p_desde timestamptz, p_hasta timestamptz, p_motivo text default null)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select privado.bloquear(p_desde, p_hasta, p_motivo)
$$;

-- 3. `desbloquear` [P] (AGE-06, AGE-10, CA-14, CA-52): borra un bloqueo suyo y esos huecos vuelven a libres. Un
--    bloqueo de otro profesor, inexistente o nulo da el mismo 404 `NO_ENCONTRADO` sin tocar nada (SEC-06).
create function privado.desbloquear(p_bloqueo_id uuid)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_profesor uuid := privado.profesor_de_sesion();
begin
  delete from public.bloqueo b
   where b.id = p_bloqueo_id
     and b.profesor_id = v_profesor;
  if not found then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
  end if;
end;
$$;

create function public.desbloquear(p_bloqueo_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  select privado.desbloquear(p_bloqueo_id)
$$;

-- 4. Permisos (SEC-04): `privado` no es ejecutable por la API; `bloquear` y `desbloquear` [P] (el rol lo valida
--    `profesor_de_sesion`). `guardar_configuracion` conserva los permisos de B02 (`create or replace`).
revoke execute on function
  privado.guardar_configuracion(integer, integer, text),
  privado.bloquear(timestamptz, timestamptz, text),
  privado.desbloquear(uuid)
  from public, anon, authenticated;

revoke execute on function
  public.bloquear(timestamptz, timestamptz, text),
  public.desbloquear(uuid)
  from public, anon;
grant execute on function
  public.bloquear(timestamptz, timestamptz, text),
  public.desbloquear(uuid)
  to authenticated;
