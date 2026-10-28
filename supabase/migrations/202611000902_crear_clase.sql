-- B09 · T09.1 · Gestión directa del profesor (1/2): ayudas comunes, mails al titular y `crear_clase`.
-- contratos.md §1 y §3, ADR-002 (RPC transaccional y errores), ADR-003 (series), ADR-004 (husos), ADR-005 (outbox),
-- ADR-014 (`app_ahora()`), ADR-018 (profesor de la sesión, profesor inactivo), ADR-019 (remitente y Reply-To).
-- IDs: PRF-01, PRF-04, PRF-07, PRF-08, AVI-04, SEC-06, SEC-09. CA-27, CA-30, CA-52, CA-63.

-- 1. Hueco elegido por el profesor (AGE-02, PRF-04, SEC-09): obligatorio, futuro según `app_ahora()` y con su día
--    local hasta hoy + 366 días (el alcance de `agenda_profesor`, donde lo ve); si no, 422 `{"campo":<p_campo>}`.
--    Tiene que ser el inicio de un hueco de su grilla: si no, 422 `FUERA_DE_GRILLA`. No aplica la anticipación
--    de AGE-04 (PRF-04). Devuelve el fin del hueco.
create function privado.gestion_validar_hueco(p_profesor_id uuid, p_inicio timestamptz, p_ahora timestamptz,
                                              p_campo text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_zona text;
  v_fin timestamptz;
begin
  select p.zona_horaria into v_zona from public.profesor p where p.id = p_profesor_id;
  if p_inicio is null
     or p_inicio <= p_ahora
     or (p_inicio at time zone v_zona)::date > (p_ahora at time zone v_zona)::date + 366 then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS',
      detail = pg_catalog.jsonb_build_object('campo', p_campo)::text;
  end if;
  v_fin := privado.fin_de_hueco(p_profesor_id, p_inicio);
  if v_fin is null then
    raise exception using errcode = 'PT422', message = 'FUERA_DE_GRILLA';
  end if;
  return v_fin;
end;
$$;

-- 2. Fecha y hora de un instante en el huso del profesor, para los mails (ADR-004).
create function privado.gestion_cuando(p_inicio timestamptz, p_zona text)
returns text
language sql
stable
set search_path = ''
as $$
  select pg_catalog.to_char(p_inicio at time zone p_zona, 'DD/MM/YYYY "a las" HH24:MI') || ' (hora de ' || p_zona || ')'
$$;

-- 3. Mail al titular por una acción del profesor (AVI-04, AVI-07, CA-30): `clase_creada`, `clase_movida` o
--    `clase_cancelada`. `encolar_mail` fija por el tipo el nombre del profesor como remitente y Reply-To a su mail
--    (ADR-019), aplica los topes de AVI-08 y no encola nada si la persona no tiene mail. Un alumno sin cuenta
--    (inscripción `sin_cuenta` con él) no recibe mails (AVI-04, ALU-08). Va solo al titular; de la persona a
--    cargo, solo el nombre (SEC-29). `p_detalle` es el texto de lo que pasó, ya con fechas en su huso.
create function privado.mail_gestion_clase(p_tipo text, p_profesor_id uuid, p_alumno_id uuid,
                                           p_persona_a_cargo_id uuid, p_detalle text)
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_vinculo text;
  v_profesor text;
  v_titular text;
  v_quien text;
begin
  select i.estado into v_vinculo
    from public.inscripcion i
   where i.alumno_id = p_alumno_id and i.profesor_id = p_profesor_id;
  if v_vinculo is distinct from 'aprobado' then
    return null;
  end if;

  select coalesce(privado.nombre_remitente(p.nombre), 'Tu profesor') into v_profesor
    from public.profesor p where p.id = p_profesor_id;
  select a.nombre into v_titular from public.alumno a where a.id = p_alumno_id;
  select pc.nombre into v_quien from public.persona_a_cargo pc where pc.id = p_persona_a_cargo_id;

  return privado.encolar_mail(
    p_tipo,
    p_profesor_id,
    p_alumno_id,
    null,
    v_profesor || case p_tipo
                    when 'clase_creada' then ' te reservó una clase'
                    when 'clase_movida' then ' cambió el horario de tu clase'
                    else ' canceló tu clase' end,
    'Hola' || coalesce(' ' || v_titular, '') || ',' || E'\n\n'
      || v_profesor || ' ' || p_detalle || E'\n'
      || case when v_quien is not null then 'Toma la clase: ' || v_quien || E'\n' else '' end
      || E'\n' || 'Podés ver tus clases en Mis clases. Si tenés dudas, respondé este mail.' || E'\n');
end;
$$;

-- 4. Persona de una clase del profesor (PRF-01, PRF-07, CA-52): solo una persona no borrada con inscripción
--    `aprobado` o `sin_cuenta` con él. Cualquier otra (sin vínculo, pendiente, rechazada, en baja, de otro
--    profesor o inexistente) da 403 `PROHIBIDO`, la misma respuesta, sin revelar si existe. Devuelve el vínculo.
create function privado.gestion_vinculo(p_profesor_id uuid, p_alumno_id uuid)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_vinculo text;
begin
  select i.estado into v_vinculo
    from public.inscripcion i
    join public.alumno a on a.id = i.alumno_id
   where i.alumno_id = p_alumno_id
     and i.profesor_id = p_profesor_id
     and a.estado <> 'borrado';
  if v_vinculo is null or v_vinculo not in ('aprobado', 'sin_cuenta') then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;
  return v_vinculo;
end;
$$;

-- 5. `crear_clase(p_alumno_id, p_persona_a_cargo_id, p_inicio, p_tipo, p_frecuencia, p_observacion)` [P]
--    (PRF-01, PRF-04, PRF-08, AVI-04): el profesor crea una clase suelta o una serie para una persona suya, con o
--    sin cuenta, en un hueco libre de su agenda; la reserva y sus clases nacen `confirmada`, sin solicitud.
--    Orden: rol y cerrojo del profesor (401/403, ADR-002) → activo (409 `PROFESOR_INACTIVO`, PRF-08) → persona
--    suya (403 `PROHIBIDO`) → campos (422 `p_tipo`, `p_frecuencia`, `p_observacion`) → persona a cargo de ese
--    titular (404 `NO_ENCONTRADO`: inexistente o de otro titular) → hueco (422 `p_inicio`, `FUERA_DE_GRILLA`) →
--    hueco libre (409 `HUECO_NO_LIBRE`). Sin anticipación (PRF-04). La serie materializa hasta hoy + horizonte y
--    saltea las fechas siguientes ocupadas o bloqueadas (RES-05, ADR-003); `extender_series` la sigue (SEC-28).
--    Mail `clase_creada` al titular en la misma transacción (ADR-005).
create function privado.crear_clase(
  p_alumno_id uuid,
  p_persona_a_cargo_id uuid,
  p_inicio timestamptz,
  p_tipo text,
  p_frecuencia integer,
  p_observacion text
)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_profesor uuid := privado.profesor_de_sesion();
  v_ahora timestamptz := public.app_ahora();
  v_zona text;
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
  v_fechas jsonb;
  v_salteadas jsonb := '[]'::jsonb;
begin
  perform privado.exigir_profesor_activo(v_profesor);
  perform privado.gestion_vinculo(v_profesor, p_alumno_id);

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

  -- RES-03: quien toma la clase es el titular o una persona a cargo suya.
  if p_persona_a_cargo_id is not null then
    select pc.alumno_id into v_duenio from public.persona_a_cargo pc where pc.id = p_persona_a_cargo_id;
    if v_duenio is distinct from p_alumno_id then
      raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
    end if;
  end if;

  v_fin := privado.gestion_validar_hueco(v_profesor, p_inicio, v_ahora, 'p_inicio');

  -- RES-01: la primera fecha es obligatoria (ADR-003).
  if privado.motivo_no_libre(v_profesor, p_inicio, v_fin) is not null then
    raise exception using errcode = 'PT409', message = 'HUECO_NO_LIBRE',
      detail = pg_catalog.jsonb_build_object('inicio', p_inicio)::text;
  end if;

  select p.zona_horaria into v_zona from public.profesor p where p.id = v_profesor;
  v_dia := (p_inicio at time zone v_zona)::date;
  v_hora := (p_inicio at time zone v_zona)::time;
  v_duracion := (extract(epoch from (v_fin - p_inicio)) / 60)::integer;
  v_hasta := case when v_tipo = 'serie' then privado.horizonte_serie(v_profesor, v_dia, v_ahora) else v_dia end;

  if v_tipo = 'serie' then
    select coalesce(pg_catalog.jsonb_agg(f.inicio order by f.inicio), '[]'::jsonb)
      into v_salteadas
      from privado.fechas_serie(v_profesor, v_dia, v_hora, v_duracion, v_frecuencia, v_dia + 1, v_hasta) f
     where f.estado = 'salteada';
  end if;

  insert into public.reserva (profesor_id, alumno_id, persona_a_cargo_id, tipo, frecuencia_semanas, hora_local,
                              dia_semana, duracion_min, observacion, estado, desde, hasta, materializada_hasta,
                              origen)
  values (v_profesor, p_alumno_id, p_persona_a_cargo_id, v_tipo, v_frecuencia, v_hora,
          extract(isodow from v_dia)::smallint, v_duracion, v_observacion, 'confirmada', v_dia,
          case when v_tipo = 'suelta' then v_dia end, v_hasta, 'profesor')
  returning id into v_reserva_id;

  begin
    insert into public.clase (profesor_id, reserva_id, alumno_id, persona_a_cargo_id, inicio, fin, estado,
                              confirmada_en)
    values (v_profesor, v_reserva_id, p_alumno_id, p_persona_a_cargo_id, p_inicio, v_fin, 'confirmada', v_ahora);

    if v_tipo = 'serie' then
      insert into public.clase (profesor_id, reserva_id, alumno_id, persona_a_cargo_id, inicio, fin, estado,
                                confirmada_en)
      select v_profesor, v_reserva_id, p_alumno_id, p_persona_a_cargo_id, f.inicio, f.fin, 'confirmada', v_ahora
        from privado.fechas_serie(v_profesor, v_dia, v_hora, v_duracion, v_frecuencia, v_dia + 1, v_hasta) f
       where f.estado = 'reservable';
    end if;
  exception when exclusion_violation then
    -- SEC-08: otra transacción ocupó el hueco.
    raise exception using errcode = 'PT409', message = 'HUECO_NO_LIBRE',
      detail = pg_catalog.jsonb_build_object('inicio', p_inicio)::text;
  end;

  select pg_catalog.jsonb_agg(c.inicio order by c.inicio) into v_fechas
    from public.clase c
   where c.reserva_id = v_reserva_id;

  -- AVI-04, CA-30: al titular, en la misma transacción.
  perform privado.mail_gestion_clase(
    'clase_creada', v_profesor, p_alumno_id, p_persona_a_cargo_id,
    case when v_tipo = 'serie'
         then 'te reservó una serie ' || case when v_frecuencia = 2 then 'quincenal' else 'semanal' end
              || ' de clases desde el ' || privado.gestion_cuando(p_inicio, v_zona) || '.'
              || case when pg_catalog.jsonb_array_length(v_salteadas) > 0
                      then E'\n' || 'Fechas que no se pudieron reservar porque estaban ocupadas: '
                           || (select pg_catalog.string_agg(privado.gestion_cuando(s.v::timestamptz, v_zona), '; '
                                                            order by s.v::timestamptz)
                                 from pg_catalog.jsonb_array_elements_text(v_salteadas) as s (v))
                           || '.'
                      else '' end
         else 'te reservó una clase el ' || privado.gestion_cuando(p_inicio, v_zona) || '.' end);

  return pg_catalog.jsonb_build_object(
    'reserva_id', v_reserva_id,
    'fechas', v_fechas,
    'salteadas', v_salteadas);
end;
$$;

create function public.crear_clase(
  p_alumno_id uuid,
  p_persona_a_cargo_id uuid default null,
  p_inicio timestamptz default null,
  p_tipo text default null,
  p_frecuencia integer default null,
  p_observacion text default null
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select privado.crear_clase(p_alumno_id, p_persona_a_cargo_id, p_inicio, p_tipo, p_frecuencia, p_observacion)
$$;

-- 6. Permisos (SEC-04): `privado` no es ejecutable por la API; `crear_clase` [P] (el rol lo valida
--    `profesor_de_sesion`: la persona y el Administrador que no es profesor reciben 403).
revoke execute on function
  privado.gestion_validar_hueco(uuid, timestamptz, timestamptz, text),
  privado.gestion_cuando(timestamptz, text),
  privado.mail_gestion_clase(text, uuid, uuid, uuid, text),
  privado.gestion_vinculo(uuid, uuid),
  privado.crear_clase(uuid, uuid, timestamptz, text, integer, text)
  from public, anon, authenticated;

revoke execute on function public.crear_clase(uuid, uuid, timestamptz, text, integer, text) from public, anon;
grant execute on function public.crear_clase(uuid, uuid, timestamptz, text, integer, text) to authenticated;
