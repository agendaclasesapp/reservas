-- B06 · T06.1 · `solicitar_reserva(p_profesor_id, …)` y el mail de solicitud nueva al profesor.
-- contratos.md §1 y §3, ADR-002 (RPC transaccional y errores), ADR-003 (series), ADR-005 (outbox),
-- ADR-016 y ADR-019 (tope de pendientes, remitente), ADR-018 (inscripción por profesor, profesor inactivo).
-- IDs: SOL-01, SOL-09, SOL-10, RES-01..05, RES-07, AGE-04, AGE-11, AVI-02, SEC-06, SEC-08, SEC-09, SEC-10.

-- 1. AVI-02, AVI-07: aviso al profesor al que va dirigida la solicitud nueva, con el nombre del servicio y
--    sin Reply-To (lo fija `encolar_mail` por tipo). Se encola en la transacción de la RPC: si la RPC
--    falla, no queda mail (ADR-005). Sin la observación: el detalle se ve en el panel.
create function privado.mail_solicitud_nueva(p_solicitud_id uuid)
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_profesor_id uuid;
  v_alumno_id uuid;
  v_destinatario text;
  v_zona text;
  v_inicio timestamptz;
  v_tipo text;
  v_frecuencia smallint;
  v_titular text;
  v_quien text;
  v_cuando text;
begin
  select s.profesor_id, s.alumno_id, s.fecha_clase, r.tipo, r.frecuencia_semanas, a.nombre, pc.nombre,
         p.mail::text, p.zona_horaria
    into v_profesor_id, v_alumno_id, v_inicio, v_tipo, v_frecuencia, v_titular, v_quien,
         v_destinatario, v_zona
    from public.solicitud s
    join public.reserva r on r.id = s.reserva_id
    join public.alumno a on a.id = s.alumno_id
    join public.profesor p on p.id = s.profesor_id
    left join public.persona_a_cargo pc on pc.id = r.persona_a_cargo_id
   where s.id = p_solicitud_id;

  v_cuando := pg_catalog.to_char(v_inicio at time zone v_zona, 'DD/MM/YYYY "a las" HH24:MI');

  return privado.encolar_mail(
    'solicitud_nueva',
    v_profesor_id,
    v_alumno_id,
    v_destinatario,
    'Solicitud de reserva nueva: ' || coalesce(v_titular, ''),
    'Tenés una solicitud de reserva nueva pendiente de respuesta.' || E'\n\n'
      || 'Alumno: ' || coalesce(v_titular, '') || E'\n'
      || case when v_quien is not null then 'Toma la clase: ' || v_quien || E'\n' else '' end
      || case when v_tipo = 'serie'
              then 'Serie ' || case when v_frecuencia = 2 then 'quincenal' else 'semanal' end
                   || ' desde el ' || v_cuando
              else 'Clase el ' || v_cuando end
      || E'\n\n'
      || 'Entrá a tu panel para confirmarla o rechazarla.' || E'\n');
end;
$$;

-- 2. `solicitar_reserva(p_profesor_id, p_inicio, p_tipo, p_frecuencia, p_persona_a_cargo_id, p_observacion)` [U]
--    (SOL-01, RES-01..05, RES-07): la persona pide una clase suelta o una serie en un hueco libre de la agenda
--    de ese profesor; la reserva y sus clases nacen `pendiente` y ocupan los huecos.
--    Orden (contratos.md §3, ADR-016, ADR-018): rol (401/403) → ficha (403) → inscripción `aprobado` con ese
--    profesor (403 `CUENTA_NO_APROBADA` con `estado` y `profesor_id`; `estado` null sin inscripción o en baja,
--    también con un profesor que no existe: no revela si existe) → profesor activo (409 `PROFESOR_INACTIVO`) →
--    tope de SOL-10 (429) → campos (422) → persona a cargo (404/403) → primer hueco (422 `p_inicio`,
--    `FUERA_DE_GRILLA`) → anticipación (422, AGE-04) → hueco libre (409 `HUECO_NO_LIBRE`). Nada se escribe
--    antes del último paso. La exclusión de `clase` es la última barrera (SEC-08): un `23P01` se relanza
--    como `HUECO_NO_LIBRE`.
create function privado.solicitar_reserva(
  p_profesor_id uuid,
  p_inicio timestamptz,
  p_tipo text,
  p_frecuencia integer,
  p_persona_a_cargo_id uuid,
  p_observacion text
)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_ahora timestamptz := public.app_ahora();
  v_alumno_id uuid;
  v_ficha text;
  v_inscripcion text;
  v_profesor public.profesor%rowtype;
  v_tipo text := pg_catalog.btrim(coalesce(p_tipo, ''));
  v_frecuencia smallint;
  v_observacion text := nullif(pg_catalog.btrim(p_observacion), '');
  v_duenio uuid;
  v_fin timestamptz;
  v_dia date;
  v_hora time;
  v_duracion integer;
  v_hasta date;
  v_reserva_id uuid;
  v_solicitud_id uuid;
  v_fechas jsonb;
  v_salteadas jsonb := '[]'::jsonb;
begin
  -- SEC-06: rol al inicio (401 sin `sub`; 403 profesor, Administrador o sin persona).
  v_alumno_id := privado.persona_de_sesion();

  -- ADR-002: cerrojo del profesor de la agenda; serializa el tope y los huecos con las demás RPC.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(coalesce(p_profesor_id::text, ''), 0));

  select a.estado into v_ficha from public.alumno a where a.id = v_alumno_id;
  if v_ficha = 'borrado' then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;
  if v_ficha is distinct from 'completa' then
    raise exception using errcode = 'PT403', message = 'FICHA_INCOMPLETA';
  end if;

  -- ALU-03, CA-03, CA-51, CA-52: el vínculo con ese profesor, aunque otro la haya aprobado.
  select i.estado into v_inscripcion
    from public.inscripcion i
   where i.alumno_id = v_alumno_id and i.profesor_id = p_profesor_id;
  if v_inscripcion is distinct from 'aprobado' then
    raise exception using errcode = 'PT403', message = 'CUENTA_NO_APROBADA',
      detail = pg_catalog.jsonb_build_object(
        'estado', case when v_inscripcion = 'baja' then null else v_inscripcion end,
        'profesor_id', p_profesor_id)::text;
  end if;

  -- AGE-11, DEC-35 A.
  perform privado.exigir_profesor_activo(p_profesor_id);

  -- SOL-10, SEC-10: antes de tocar huecos.
  perform privado.exigir_tope_pendientes(v_alumno_id, p_profesor_id);

  -- Campos (SEC-09).
  if v_tipo not in ('suelta', 'serie') then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_tipo"}';
  end if;
  if v_tipo = 'serie' then
    if p_frecuencia is null or p_frecuencia not in (1, 2) then
      raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_frecuencia"}';
    end if;
    v_frecuencia := p_frecuencia;
  end if;
  if pg_catalog.char_length(v_observacion) > 500 then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_observacion"}';
  end if;

  -- RES-03, SOL-09: quien toma la clase es el titular o una persona a cargo suya.
  if p_persona_a_cargo_id is not null then
    select pc.alumno_id into v_duenio from public.persona_a_cargo pc where pc.id = p_persona_a_cargo_id;
    if not found then
      raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
    end if;
    if v_duenio <> v_alumno_id then
      raise exception using errcode = 'PT403', message = 'PROHIBIDO';
    end if;
  end if;

  select * into v_profesor from public.profesor p where p.id = p_profesor_id;
  v_fin := privado.validar_primer_hueco(p_profesor_id, p_inicio, v_ahora);

  -- AGE-04: el hueco empieza al menos `anticipacion_horas` después de ahora (el límite exacto se acepta).
  if p_inicio < v_ahora + pg_catalog.make_interval(hours => v_profesor.anticipacion_horas) then
    raise exception using errcode = 'PT422', message = 'ANTICIPACION_INSUFICIENTE',
      detail = pg_catalog.jsonb_build_object('horas_minimas', v_profesor.anticipacion_horas, 'inicio', p_inicio)::text;
  end if;

  -- RES-01, RES-07: la primera fecha es obligatoria (ADR-003).
  if privado.motivo_no_libre(p_profesor_id, p_inicio, v_fin) is not null then
    raise exception using errcode = 'PT409', message = 'HUECO_NO_LIBRE',
      detail = pg_catalog.jsonb_build_object('inicio', p_inicio)::text;
  end if;

  v_dia := (p_inicio at time zone v_profesor.zona_horaria)::date;
  v_hora := (p_inicio at time zone v_profesor.zona_horaria)::time;
  v_duracion := (extract(epoch from (v_fin - p_inicio)) / 60)::integer;
  v_hasta := case when v_tipo = 'serie' then privado.horizonte_serie(p_profesor_id, v_dia, v_ahora) else v_dia end;

  -- RES-05: las fechas siguientes ocupadas o bloqueadas se saltean y se informan.
  if v_tipo = 'serie' then
    select coalesce(pg_catalog.jsonb_agg(f.inicio order by f.inicio), '[]'::jsonb)
      into v_salteadas
      from privado.fechas_serie(p_profesor_id, v_dia, v_hora, v_duracion, v_frecuencia, v_dia + 1, v_hasta) f
     where f.estado = 'salteada';
  end if;

  insert into public.reserva (profesor_id, alumno_id, persona_a_cargo_id, tipo, frecuencia_semanas, hora_local,
                              dia_semana, duracion_min, observacion, estado, desde, hasta, materializada_hasta,
                              origen)
  values (p_profesor_id, v_alumno_id, p_persona_a_cargo_id, v_tipo, v_frecuencia, v_hora,
          extract(isodow from v_dia)::smallint, v_duracion, v_observacion, 'pendiente', v_dia,
          case when v_tipo = 'suelta' then v_dia end, v_hasta, 'solicitud')
  returning id into v_reserva_id;

  begin
    insert into public.clase (profesor_id, reserva_id, alumno_id, persona_a_cargo_id, inicio, fin, estado)
    values (p_profesor_id, v_reserva_id, v_alumno_id, p_persona_a_cargo_id, p_inicio, v_fin, 'pendiente');

    if v_tipo = 'serie' then
      insert into public.clase (profesor_id, reserva_id, alumno_id, persona_a_cargo_id, inicio, fin, estado)
      select p_profesor_id, v_reserva_id, v_alumno_id, p_persona_a_cargo_id, f.inicio, f.fin, 'pendiente'
        from privado.fechas_serie(p_profesor_id, v_dia, v_hora, v_duracion, v_frecuencia, v_dia + 1, v_hasta) f
       where f.estado = 'reservable';
    end if;
  exception when exclusion_violation then
    -- SEC-08, CA-17: otra transacción ocupó el hueco.
    raise exception using errcode = 'PT409', message = 'HUECO_NO_LIBRE',
      detail = pg_catalog.jsonb_build_object('inicio', p_inicio)::text;
  end;

  select pg_catalog.jsonb_agg(c.inicio order by c.inicio) into v_fechas
    from public.clase c
   where c.reserva_id = v_reserva_id;

  insert into public.solicitud (profesor_id, alumno_id, tipo, reserva_id, fecha_clase, estado, creada_en)
  values (p_profesor_id, v_alumno_id, 'reserva', v_reserva_id, p_inicio, 'pendiente', v_ahora)
  returning id into v_solicitud_id;

  -- AVI-02, CA-30, CA-55: al profesor de la solicitud, en la misma transacción.
  perform privado.mail_solicitud_nueva(v_solicitud_id);

  return pg_catalog.jsonb_build_object(
    'solicitud_id', v_solicitud_id,
    'reserva_id', v_reserva_id,
    'fechas', v_fechas,
    'salteadas', v_salteadas);
end;
$$;

create function public.solicitar_reserva(
  p_profesor_id uuid,
  p_inicio timestamptz,
  p_tipo text,
  p_frecuencia integer default null,
  p_persona_a_cargo_id uuid default null,
  p_observacion text default null
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select privado.solicitar_reserva(p_profesor_id, p_inicio, p_tipo, p_frecuencia, p_persona_a_cargo_id, p_observacion)
$$;

-- 3. Permisos (SEC-04): `privado` no es ejecutable por la API; `solicitar_reserva` [U].
revoke execute on function
  privado.mail_solicitud_nueva(uuid),
  privado.solicitar_reserva(uuid, timestamptz, text, integer, uuid, text)
  from public, anon, authenticated;

revoke execute on function public.solicitar_reserva(uuid, timestamptz, text, integer, uuid, text) from public, anon;
grant execute on function public.solicitar_reserva(uuid, timestamptz, text, integer, uuid, text) to authenticated;
