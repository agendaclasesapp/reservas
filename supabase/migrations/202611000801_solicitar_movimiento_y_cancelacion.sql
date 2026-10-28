-- B08 · T08.1 · `solicitar_movimiento(p_clase_id, p_destino, p_alcance)` y `solicitar_cancelacion(p_clase_id, p_alcance)` [U],
-- y el mail de solicitud nueva al profesor para los tres tipos.
-- contratos.md §1 y §3, ADR-002 (RPC transaccional, cerrojo y errores), ADR-003 (series), ADR-005 (outbox),
-- ADR-016 y ADR-019 (tope de pendientes por profesor), ADR-018 (inscripción por profesor, profesor inactivo).
-- IDs: SOL-02, SOL-03, SOL-09, SOL-10, RES-01, RES-05, RES-07, AGE-04, AGE-11, AVI-02, SEC-06, SEC-08, SEC-09,
-- SEC-10; CA-13, CA-22, CA-41, CA-63. Toda hora sale de `public.app_ahora()` (ADR-014).
--
-- Modelo (componentes.md §3 y §4): la solicitud nombra la clase de origen (`clase_id`) y su alcance. Un movimiento
-- crea además la reserva destino (`reserva_id`, con `reserva_origen_id` = la de la clase) y sus clases en
-- `pendiente`, que ocupan los huecos destino; la clase de origen sigue `confirmada` (SOL-02). Una cancelación no
-- crea clases (SOL-03). `fecha_clase` es la clase más temprana sobre la que trata: la de origen o, en un
-- movimiento a una fecha anterior, el destino; con ella vence (SOL-08) y cuenta para SOL-10.

-- 1. AVI-02, AVI-07: aviso al profesor de cualquier solicitud nueva. Reemplaza el de B06 (202611000603) con la misma
--    firma; el texto de la de reserva no cambia. Sin la observación ni datos de nacimiento (SEC-29).
create or replace function privado.mail_solicitud_nueva(p_solicitud_id uuid)
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_profesor_id uuid;
  v_alumno_id uuid;
  v_tipo_solicitud text;
  v_alcance text;
  v_destinatario text;
  v_zona text;
  v_inicio timestamptz;
  v_origen timestamptz;
  v_destino timestamptz;
  v_tipo text;
  v_frecuencia smallint;
  v_titular text;
  v_quien text;
  v_cuando text;
  v_que text;
  v_detalle text;
begin
  select s.profesor_id, s.alumno_id, s.tipo, s.alcance, s.fecha_clase, co.inicio,
         coalesce(r.tipo, ro.tipo), coalesce(r.frecuencia_semanas, ro.frecuencia_semanas), a.nombre, pc.nombre,
         p.mail::text, p.zona_horaria
    into v_profesor_id, v_alumno_id, v_tipo_solicitud, v_alcance, v_inicio, v_origen,
         v_tipo, v_frecuencia, v_titular, v_quien, v_destinatario, v_zona
    from public.solicitud s
    join public.alumno a on a.id = s.alumno_id
    join public.profesor p on p.id = s.profesor_id
    left join public.reserva r on r.id = s.reserva_id
    left join public.clase co on co.id = s.clase_id
    left join public.reserva ro on ro.id = co.reserva_id
    left join public.persona_a_cargo pc on pc.id = coalesce(co.persona_a_cargo_id, r.persona_a_cargo_id)
   where s.id = p_solicitud_id;

  if v_tipo_solicitud = 'reserva' then
    v_cuando := pg_catalog.to_char(v_inicio at time zone v_zona, 'DD/MM/YYYY "a las" HH24:MI');
    v_que := 'Solicitud de reserva nueva: ';
    v_detalle := 'Tenés una solicitud de reserva nueva pendiente de respuesta.' || E'\n\n'
      || 'Alumno: ' || coalesce(v_titular, '') || E'\n'
      || case when v_quien is not null then 'Toma la clase: ' || v_quien || E'\n' else '' end
      || case when v_tipo = 'serie'
              then 'Serie ' || case when v_frecuencia = 2 then 'quincenal' else 'semanal' end
                   || ' desde el ' || v_cuando
              else 'Clase el ' || v_cuando end;
  else
    select pg_catalog.min(c.inicio) into v_destino from public.clase c
     where v_tipo_solicitud = 'movimiento' and c.reserva_id = (select s.reserva_id from public.solicitud s
                                                              where s.id = p_solicitud_id);
    v_cuando := pg_catalog.to_char(v_origen at time zone v_zona, 'DD/MM/YYYY "a las" HH24:MI');
    v_que := case when v_tipo_solicitud = 'movimiento' then 'Solicitud de cambio de horario: '
                  else 'Aviso de que no puede ir: ' end;
    v_detalle := case when v_tipo_solicitud = 'movimiento'
                      then 'Tenés una solicitud de cambio de horario pendiente de respuesta.'
                      else 'Tenés un aviso de que no puede ir (solicitud de cancelación) pendiente de respuesta.' end
      || E'\n\n'
      || 'Alumno: ' || coalesce(v_titular, '') || E'\n'
      || case when v_quien is not null then 'Toma la clase: ' || v_quien || E'\n' else '' end
      || 'Clase del ' || v_cuando || E'\n'
      || case when v_destino is not null
              then 'Nuevo horario: ' || pg_catalog.to_char(v_destino at time zone v_zona, 'DD/MM/YYYY "a las" HH24:MI')
                   || E'\n'
              else '' end
      || case when v_alcance = 'desde_aca'
              then 'Alcance: de acá en adelante (serie '
                   || case when v_frecuencia = 2 then 'quincenal' else 'semanal' end || ')'
              else 'Alcance: solo esta clase' end;
  end if;

  return privado.encolar_mail(
    'solicitud_nueva',
    v_profesor_id,
    v_alumno_id,
    v_destinatario,
    v_que || coalesce(v_titular, ''),
    v_detalle || E'\n\n' || 'Entrá a tu panel para confirmarla o rechazarla.' || E'\n');
end;
$$;

-- 2. Validación común de una solicitud sobre una clase (SOL-02, SOL-03, SOL-09, SOL-10, AGE-11). Orden (como
--    `solicitar_reserva`, contratos.md §3): rol (401/403) → ficha (403 `PROHIBIDO` si `borrado`,
--    `FICHA_INCOMPLETA`) → clase (404 si no existe; 403 `PROHIBIDO` si es de otra persona, SOL-09) → cerrojo del
--    profesor de la clase (ADR-002) → inscripción `aprobado` con ese profesor (403 `CUENTA_NO_APROBADA`, RES-07)
--    → profesor activo (409 `PROFESOR_INACTIVO`, DEC-35 A) → tope de SOL-10 (429, antes de tocar nada) →
--    `p_alcance` (422 `{"campo":"p_alcance"}`; `desde_aca` solo en una serie) → clase confirmada y futura
--    (409 `CLASE_NO_MODIFICABLE`) → sin otra solicitud pendiente que la alcance (409 `SOLICITUD_EN_CURSO`).
--    Solo anula la vencida de esa clase (H-360); cualquier error posterior lo deshace. Devuelve la clase
--    (bloqueada `for update`) y el alcance normalizado.
create function privado.validar_solicitud_sobre_clase(
  p_clase_id uuid,
  p_alcance text,
  p_ahora timestamptz,
  out o_alumno_id uuid,
  out o_clase public.clase,
  out o_alcance text
)
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_ficha text;
  v_duenio uuid;
  v_profesor_id uuid;
  v_inscripcion text;
  v_reserva_tipo text;
  v_en_curso uuid;
begin
  o_alumno_id := privado.persona_de_sesion();

  select a.estado into v_ficha from public.alumno a where a.id = o_alumno_id;
  if v_ficha = 'borrado' then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;
  if v_ficha is distinct from 'completa' then
    raise exception using errcode = 'PT403', message = 'FICHA_INCOMPLETA';
  end if;

  -- SOL-09: la clase existe y es de esta persona (titular; la de una persona a cargo también es suya).
  select c.alumno_id, c.profesor_id into v_duenio, v_profesor_id from public.clase c where c.id = p_clase_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
  end if;
  if v_duenio <> o_alumno_id then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;

  -- ADR-002: el cerrojo del profesor de la clase serializa el tope y los huecos con las demás RPC de esa agenda.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profesor_id::text, 0));
  select c.* into o_clase from public.clase c where c.id = p_clase_id for update;

  -- RES-07, ALU-03: el vínculo con el profesor de la clase, aunque otro la haya aprobado.
  select i.estado into v_inscripcion
    from public.inscripcion i
   where i.alumno_id = o_alumno_id and i.profesor_id = v_profesor_id;
  if v_inscripcion is distinct from 'aprobado' then
    raise exception using errcode = 'PT403', message = 'CUENTA_NO_APROBADA',
      detail = pg_catalog.jsonb_build_object(
        'estado', case when v_inscripcion = 'baja' then null else v_inscripcion end,
        'profesor_id', v_profesor_id)::text;
  end if;

  -- AGE-11, CA-63, DEC-35 A.
  perform privado.exigir_profesor_activo(v_profesor_id);

  -- SOL-10, SEC-10, CA-41: reservas, movimientos y cancelaciones pendientes con ese profesor; nada creado aún.
  perform privado.exigir_tope_pendientes(o_alumno_id, v_profesor_id);

  -- SEC-09: alcance; «de acá en adelante» solo si la clase es de una serie (SOL-02, SOL-03).
  o_alcance := pg_catalog.btrim(coalesce(p_alcance, ''));
  select r.tipo into v_reserva_tipo from public.reserva r where r.id = o_clase.reserva_id;
  if o_alcance not in ('solo_esta', 'desde_aca') or (o_alcance = 'desde_aca' and v_reserva_tipo <> 'serie') then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_alcance"}';
  end if;

  if o_clase.estado <> 'confirmada' or o_clase.inicio <= p_ahora then
    raise exception using errcode = 'PT409', message = 'CLASE_NO_MODIFICABLE';
  end if;

  -- Una sola solicitud pendiente por clase (índice `solicitud_pendiente_por_clase`), y ninguna que se pise con
  -- otra de la misma serie: una «de acá en adelante» pendiente alcanza a las clases siguientes y una nueva «de
  -- acá en adelante» alcanza a las que tienen la suya. Las vencidas no cuentan: ya no se pueden confirmar.
  select s.id into v_en_curso
    from public.solicitud s
    join public.clase so on so.id = s.clase_id
   where s.estado = 'pendiente'
     and s.profesor_id = v_profesor_id
     and s.fecha_clase > p_ahora
     and so.reserva_id = o_clase.reserva_id
     and (so.id = o_clase.id
          or (s.alcance = 'desde_aca' and so.inicio <= o_clase.inicio)
          or (o_alcance = 'desde_aca' and so.inicio >= o_clase.inicio))
   order by s.creada_en, s.id
   limit 1;
  if v_en_curso is not null then
    raise exception using errcode = 'PT409', message = 'SOLICITUD_EN_CURSO',
      detail = pg_catalog.jsonb_build_object('solicitud_id', v_en_curso)::text;
  end if;

  -- H-360, contratos.md §1: una pendiente vencida de esta misma clase ocuparía el índice
  -- `solicitud_pendiente_por_clase`; se anula como en la pausa (0604), sin mail, con su destino cancelado.
  with anuladas as (
    update public.solicitud s
       set estado = 'anulada', respondida_en = p_ahora
     where s.clase_id = o_clase.id
       and s.estado = 'pendiente'
       and s.fecha_clase <= p_ahora
    returning s.reserva_id
  ), canceladas as (
    update public.reserva r
       set estado = 'cancelada'
     where r.id in (select a.reserva_id from anuladas a)
       and r.estado = 'pendiente'
    returning r.id
  )
  update public.clase c
     set estado = 'cancelada'
    from canceladas k
   where c.reserva_id = k.id
     and c.estado = 'pendiente';
end;
$$;

-- 3. AGE-04, CA-13, DEC-07 A: el alumno pide con `anticipacion_horas` del profesor (el límite exacto se acepta).
create function privado.exigir_anticipacion(p_profesor_id uuid, p_inicio timestamptz, p_ahora timestamptz)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_horas integer;
begin
  select p.anticipacion_horas into v_horas from public.profesor p where p.id = p_profesor_id;
  if p_inicio < p_ahora + pg_catalog.make_interval(hours => v_horas) then
    raise exception using errcode = 'PT422', message = 'ANTICIPACION_INSUFICIENTE',
      detail = pg_catalog.jsonb_build_object('horas_minimas', v_horas, 'inicio', p_inicio)::text;
  end if;
end;
$$;

-- 4. `solicitar_movimiento(p_clase_id, p_destino, p_alcance)` [U] (SOL-02, SOL-07, RES-05, RES-07, CA-22).
--    Tras la validación común: destino (422 `{"campo":"p_destino"}` nulo o fuera del rango de `agenda_publica`;
--    422 `FUERA_DE_GRILLA` si no es el inicio de un hueco de la agenda del profesor DE LA CLASE: un hueco de otro
--    profesor no sirve, RES-07) → anticipación del origen y del destino (422, DEC-07 A) → destino libre (409
--    `HUECO_NO_LIBRE`). Recién entonces escribe: la reserva destino (`suelta` con «solo esta»; con «de acá en
--    adelante», `serie` con la misma frecuencia desde el destino hasta el horizonte, salteando las fechas
--    ocupadas o bloqueadas como RES-05) y sus clases `pendiente`, la solicitud y el mail al profesor (AVI-02).
--    La clase de origen sigue `confirmada` (SOL-02). Un `23P01` concurrente se relanza como `HUECO_NO_LIBRE`.
create function privado.solicitar_movimiento(p_clase_id uuid, p_destino timestamptz, p_alcance text)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_ahora timestamptz := public.app_ahora();
  v_validada record;
  v_alumno_id uuid;
  v_clase public.clase;
  v_alcance text;
  v_origen public.reserva%rowtype;
  v_profesor public.profesor%rowtype;
  v_hoy date;
  v_dia date;
  v_hora time;
  v_fin timestamptz;
  v_duracion integer;
  v_hasta date;
  v_es_serie boolean;
  v_reserva_id uuid;
  v_solicitud_id uuid;
  v_fechas jsonb;
  v_salteadas jsonb := '[]'::jsonb;
begin
  select * into v_validada from privado.validar_solicitud_sobre_clase(p_clase_id, p_alcance, v_ahora);
  v_alumno_id := v_validada.o_alumno_id;
  v_clase := v_validada.o_clase;
  v_alcance := v_validada.o_alcance;

  select * into v_profesor from public.profesor p where p.id = v_clase.profesor_id;
  select * into v_origen from public.reserva r where r.id = v_clase.reserva_id;

  -- SEC-09: el destino, con el rango de `agenda_publica` (H-010), en el huso de ese profesor.
  if p_destino is null then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_destino"}';
  end if;
  v_hoy := (v_ahora at time zone v_profesor.zona_horaria)::date;
  v_dia := (p_destino at time zone v_profesor.zona_horaria)::date;
  if v_dia < v_hoy - 366 or v_dia > v_hoy + v_profesor.horizonte_semanas * 7 + 31 then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_destino"}';
  end if;
  -- RES-07: solo un hueco generado por la grilla del profesor de la clase.
  v_fin := privado.fin_de_hueco(v_profesor.id, p_destino);
  if v_fin is null then
    raise exception using errcode = 'PT422', message = 'FUERA_DE_GRILLA';
  end if;

  -- AGE-04, CA-13, DEC-07 A: en un movimiento se miden el origen y el destino.
  perform privado.exigir_anticipacion(v_profesor.id, v_clase.inicio, v_ahora);
  perform privado.exigir_anticipacion(v_profesor.id, p_destino, v_ahora);

  -- RES-01: el primer destino es obligatorio (ADR-003).
  if privado.motivo_no_libre(v_profesor.id, p_destino, v_fin) is not null then
    raise exception using errcode = 'PT409', message = 'HUECO_NO_LIBRE',
      detail = pg_catalog.jsonb_build_object('inicio', p_destino)::text;
  end if;

  v_es_serie := v_alcance = 'desde_aca';
  v_hora := (p_destino at time zone v_profesor.zona_horaria)::time;
  v_duracion := (extract(epoch from (v_fin - p_destino)) / 60)::integer;
  v_hasta := case when v_es_serie then privado.horizonte_serie(v_profesor.id, v_dia, v_ahora) else v_dia end;

  -- SOL-07, RES-05: la serie nueva saltea las fechas ocupadas o bloqueadas y las informa.
  if v_es_serie then
    select coalesce(pg_catalog.jsonb_agg(f.inicio order by f.inicio), '[]'::jsonb)
      into v_salteadas
      from privado.fechas_serie(v_profesor.id, v_dia, v_hora, v_duracion, v_origen.frecuencia_semanas,
                                v_dia + 1, v_hasta) f
     where f.estado = 'salteada';
  end if;

  insert into public.reserva (profesor_id, alumno_id, persona_a_cargo_id, tipo, frecuencia_semanas, hora_local,
                              dia_semana, duracion_min, observacion, estado, desde, hasta, materializada_hasta,
                              origen, reserva_origen_id)
  values (v_profesor.id, v_alumno_id, v_clase.persona_a_cargo_id,
          case when v_es_serie then 'serie' else 'suelta' end,
          case when v_es_serie then v_origen.frecuencia_semanas end,
          v_hora, extract(isodow from v_dia)::smallint, v_duracion, v_origen.observacion, 'pendiente', v_dia,
          case when v_es_serie then null else v_dia end, v_hasta, 'solicitud', v_origen.id)
  returning id into v_reserva_id;

  begin
    insert into public.clase (profesor_id, reserva_id, alumno_id, persona_a_cargo_id, inicio, fin, estado)
    values (v_profesor.id, v_reserva_id, v_alumno_id, v_clase.persona_a_cargo_id, p_destino, v_fin, 'pendiente');

    if v_es_serie then
      insert into public.clase (profesor_id, reserva_id, alumno_id, persona_a_cargo_id, inicio, fin, estado)
      select v_profesor.id, v_reserva_id, v_alumno_id, v_clase.persona_a_cargo_id, f.inicio, f.fin, 'pendiente'
        from privado.fechas_serie(v_profesor.id, v_dia, v_hora, v_duracion, v_origen.frecuencia_semanas,
                                  v_dia + 1, v_hasta) f
       where f.estado = 'reservable';
    end if;
  exception when exclusion_violation then
    -- SEC-08, CA-17: otra transacción ocupó el hueco.
    raise exception using errcode = 'PT409', message = 'HUECO_NO_LIBRE',
      detail = pg_catalog.jsonb_build_object('inicio', p_destino)::text;
  end;

  select pg_catalog.jsonb_agg(c.inicio order by c.inicio) into v_fechas
    from public.clase c
   where c.reserva_id = v_reserva_id;

  insert into public.solicitud (profesor_id, alumno_id, tipo, alcance, reserva_id, clase_id, fecha_clase, estado,
                                creada_en)
  values (v_profesor.id, v_alumno_id, 'movimiento', v_alcance, v_reserva_id, v_clase.id,
          least(v_clase.inicio, p_destino), 'pendiente', v_ahora)
  returning id into v_solicitud_id;

  -- AVI-02: al profesor de la clase, en la misma transacción (ADR-005).
  perform privado.mail_solicitud_nueva(v_solicitud_id);

  return pg_catalog.jsonb_build_object(
    'solicitud_id', v_solicitud_id,
    'fechas', v_fechas,
    'salteadas', v_salteadas);
end;
$$;

-- 5. `solicitar_cancelacion(p_clase_id, p_alcance)` [U] (SOL-03, CA-23, CA-24): tras la validación común,
--    anticipación de la clase (422, CA-13). No crea clases: la clase sigue `confirmada` hasta la respuesta.
create function privado.solicitar_cancelacion(p_clase_id uuid, p_alcance text)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_ahora timestamptz := public.app_ahora();
  v_validada record;
  v_alumno_id uuid;
  v_clase public.clase;
  v_alcance text;
  v_solicitud_id uuid;
begin
  select * into v_validada from privado.validar_solicitud_sobre_clase(p_clase_id, p_alcance, v_ahora);
  v_alumno_id := v_validada.o_alumno_id;
  v_clase := v_validada.o_clase;
  v_alcance := v_validada.o_alcance;

  perform privado.exigir_anticipacion(v_clase.profesor_id, v_clase.inicio, v_ahora);

  insert into public.solicitud (profesor_id, alumno_id, tipo, alcance, clase_id, fecha_clase, estado, creada_en)
  values (v_clase.profesor_id, v_alumno_id, 'cancelacion', v_alcance, v_clase.id, v_clase.inicio, 'pendiente',
          v_ahora)
  returning id into v_solicitud_id;

  perform privado.mail_solicitud_nueva(v_solicitud_id);

  return pg_catalog.jsonb_build_object('solicitud_id', v_solicitud_id);
end;
$$;

create function public.solicitar_movimiento(p_clase_id uuid, p_destino timestamptz, p_alcance text)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select privado.solicitar_movimiento(p_clase_id, p_destino, p_alcance)
$$;

create function public.solicitar_cancelacion(p_clase_id uuid, p_alcance text)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select privado.solicitar_cancelacion(p_clase_id, p_alcance)
$$;

-- 6. Permisos (SEC-04): `privado` no es ejecutable por la API; las dos RPC [U] (el rol lo valida
--    `persona_de_sesion`: profesor y Administrador reciben 403). `create or replace` conserva los de
--    `mail_solicitud_nueva`; se repiten por claridad.
revoke execute on function
  privado.mail_solicitud_nueva(uuid),
  privado.validar_solicitud_sobre_clase(uuid, text, timestamptz),
  privado.exigir_anticipacion(uuid, timestamptz, timestamptz),
  privado.solicitar_movimiento(uuid, timestamptz, text),
  privado.solicitar_cancelacion(uuid, text)
  from public, anon, authenticated;

revoke execute on function public.solicitar_movimiento(uuid, timestamptz, text) from public, anon;
grant execute on function public.solicitar_movimiento(uuid, timestamptz, text) to authenticated;
revoke execute on function public.solicitar_cancelacion(uuid, text) from public, anon;
grant execute on function public.solicitar_cancelacion(uuid, text) to authenticated;
