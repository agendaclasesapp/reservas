-- B09 · T09.1 · Lecturas del panel del profesor: `agenda_profesor(p_dia)` y `contadores()`.
-- contratos.md §1 y §3, ADR-002 (errores), ADR-004 (husos), ADR-006 (estados del hueco), ADR-014 (`app_ahora()`),
-- ADR-018 (profesor de la sesión, profesor inactivo).
-- IDs: PRF-05, PRF-07, PRF-08, AVI-01, SEC-06, SEC-09. CA-21, CA-28, CA-52, CA-55, CA-63.

-- 1. Profesor de la sesión para una lectura [P] (SEC-06): 401 sin `sub`; 403 si no es profesor (la persona y el
--    Administrador que no es profesor). Como `privado.profesor_de_sesion` pero sin cerrojo: no escribe nada.
--    No mira `activo`: el profesor inactivo sigue viendo su panel (PRF-08).
create function privado.profesor_de_lectura()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_profesor_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'NO_AUTENTICADO';
  end if;
  v_profesor_id := privado.mi_profesor_id();
  if v_profesor_id is null then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;
  return v_profesor_id;
end;
$$;

-- 2. Agenda de un día del profesor (PRF-05, ADR-006): los huecos de su grilla con su estado, como
--    `privado.agenda_publica`, más quién toma la clase, el titular, la observación, el estado de la clase, la
--    solicitud pendiente y no vencida que la alcanza con la regla de SOLICITUD_EN_CURSO (contratos.md §1, la
--    más antigua), o la que la creó si es pendiente (H-371), y el bloqueo. Una clase activa que no solapa
--    ningún hueco sale aparte (AGE-03). Si un hueco solapa más de una clase, muestra la primera. `titular` y `quien_toma` salen null si
--    la persona ya no está en su lista (inscripción en `baja`), como `v_clases`. Al final, dos columnas que no
--    están en contratos.md §3 (aditivas): `reserva_tipo` (la web ofrece «solo esta» o «de acá en adelante»
--    solo en una serie, PRF-02) y `pasada` (`inicio <= app_ahora()`: la web no usa su reloj, ADR-014).
create function privado.agenda_profesor(p_profesor uuid, p_dia date)
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
  pasada boolean
)
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
    -- Mismo predicado que `clase_sin_solape` (gist parcial, S03).
    select c.id, c.inicio, c.fin, pg_catalog.tstzrange(c.inicio, c.fin, '[)') as periodo
      from public.clase c, r
     where c.profesor_id = p_profesor
       and pg_catalog.tstzrange(c.inicio, c.fin, '[)') && r.rango
       and c.estado in ('pendiente', 'confirmada')
  ),
  b as (
    select b.id, b.motivo, b.periodo
      from public.bloqueo b, r
     where b.profesor_id = p_profesor
       and b.periodo && r.rango
  ),
  x as (
    select h.inicio, h.fin, hc.id as clase_id, hb.id as bloqueo_id, hb.motivo as bloqueo_motivo
      from h
      left join lateral (
        select c.id from c where c.periodo && h.periodo order by c.inicio, c.id limit 1
      ) hc on true
      left join lateral (
        select b.id, b.motivo from b where b.periodo && h.periodo order by pg_catalog.lower(b.periodo), b.id limit 1
      ) hb on true
    union all
    select c.inicio, c.fin, c.id, cb.id, cb.motivo
      from c
      left join lateral (
        select b.id, b.motivo from b where b.periodo && c.periodo order by pg_catalog.lower(b.periodo), b.id limit 1
      ) cb on true
     where not exists (select 1 from h where h.periodo && c.periodo)
  )
  select x.inicio,
         x.fin,
         case when x.clase_id is not null then 'ocupado'
              when x.bloqueo_id is not null then 'bloqueado'
              else 'libre' end,
         x.clase_id,
         sp.id,
         case when i.id is not null then coalesce(pc.nombre, a.nombre) end,
         case when i.id is not null then a.nombre end,
         rs.observacion,
         cl.estado,
         x.bloqueo_id,
         x.bloqueo_motivo,
         rs.tipo,
         x.inicio <= public.app_ahora()
    from x
    left join public.clase cl on cl.id = x.clase_id
    left join public.reserva rs on rs.id = cl.reserva_id
    left join public.alumno a on a.id = cl.alumno_id
    left join public.persona_a_cargo pc on pc.id = cl.persona_a_cargo_id
    left join public.inscripcion i
      on i.alumno_id = cl.alumno_id and i.profesor_id = p_profesor and i.estado <> 'baja'
    left join lateral (
      select s.id
        from public.solicitud s
        left join public.clase so on so.id = s.clase_id
       where s.estado = 'pendiente'
         and s.profesor_id = p_profesor
         and s.fecha_clase > public.app_ahora()
         and (s.clase_id = cl.id
              or s.reserva_id = cl.reserva_id
              or (s.alcance = 'desde_aca' and so.reserva_id = cl.reserva_id and so.inicio <= cl.inicio))
       order by s.creada_en, s.id
       limit 1
    ) sp on true
   order by x.inicio, x.clase_id
$$;

-- 3. `agenda_profesor(p_dia)` [P] (PRF-05, PRF-07, PRF-08, SEC-09): solo la agenda de `mi_profesor_id()` (no
--    recibe profesor). `p_dia` entre hoy − 366 y hoy + 366 días en el huso del profesor (el alcance de
--    `bloquear`); fuera de rango o nulo, 422 `{"campo":"p_dia"}`. El profesor inactivo la sigue viendo.
create function public.agenda_profesor(p_dia date)
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
  pasada boolean
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

  if p_dia is null or p_dia < v_hoy - 366 or p_dia > v_hoy + 366 then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_dia"}';
  end if;

  return query
    select a.inicio, a.fin, a.estado, a.clase_id, a.solicitud_id, a.quien_toma, a.titular, a.observacion,
           a.clase_estado, a.bloqueo_id, a.bloqueo_motivo, a.reserva_tipo, a.pasada
      from privado.agenda_profesor(v_profesor, p_dia) a;
end;
$$;

-- 4. `contadores()` [P] (AVI-01, CA-21, CA-55): los del profesor que mira, nunca los de otro.
--    `solicitudes_pendientes`: sus solicitudes `pendiente` cuyo horario no pasó (las vencidas ya no se pueden
--    responder, SOL-08, y figuran aparte en su lista). `cuentas_pendientes`: sus inscripciones `pendiente` de
--    personas no borradas (ALU-03, DEC-28).
create function privado.contadores()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_profesor uuid := privado.profesor_de_lectura();
  v_ahora timestamptz := public.app_ahora();
  v_solicitudes integer;
  v_cuentas integer;
begin
  select pg_catalog.count(*)::integer into v_solicitudes
    from public.solicitud s
   where s.profesor_id = v_profesor
     and s.estado = 'pendiente'
     and s.fecha_clase > v_ahora;

  select pg_catalog.count(*)::integer into v_cuentas
    from public.inscripcion i
    join public.alumno a on a.id = i.alumno_id
   where i.profesor_id = v_profesor
     and i.estado = 'pendiente'
     and a.estado <> 'borrado';

  return pg_catalog.jsonb_build_object('solicitudes_pendientes', v_solicitudes, 'cuentas_pendientes', v_cuentas);
end;
$$;

create function public.contadores()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select privado.contadores()
$$;

-- 5. Permisos (SEC-04): `privado` no es ejecutable por la API; `agenda_profesor` y `contadores` [P] (el rol lo
--    valida `profesor_de_lectura`).
revoke execute on function
  privado.profesor_de_lectura(),
  privado.agenda_profesor(uuid, date),
  privado.contadores()
  from public, anon, authenticated;

revoke execute on function public.agenda_profesor(date) from public, anon;
grant execute on function public.agenda_profesor(date) to authenticated;
revoke execute on function public.contadores() from public, anon;
grant execute on function public.contadores() to authenticated;
