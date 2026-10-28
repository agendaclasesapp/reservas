-- B07 · T07.1 · `responder_solicitud(p_solicitud_id, p_decision, p_motivo)` [P] y el mail de respuesta al titular.
-- contratos.md §1 y §3, ADR-002 (RPC transaccional y errores), ADR-005 (outbox), ADR-014 (`app_ahora()`),
-- ADR-018 (profesor de la sesión, profesor inactivo), ADR-019 (remitente y Reply-To del profesor).
-- IDs: SOL-04, SOL-05, SOL-06, SOL-08, SOL-10, PRF-07, PRF-08, AVI-03, SEC-06, SEC-09, SEC-29.

-- 1. AVI-03, AVI-07, CA-56: mail al titular con la respuesta y el motivo si lo escribió. `encolar_mail` fija por
--    el tipo `solicitud_respondida` el nombre del profesor como remitente y Reply-To a su mail (ADR-019).
--    Va solo al titular (`p_destinatario` nulo); sin fecha de nacimiento de nadie (SEC-29): de la persona a
--    cargo, solo el nombre. Hora en el huso del profesor (ADR-004).
create function privado.mail_solicitud_respondida(p_solicitud_id uuid)
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_profesor_id uuid;
  v_alumno_id uuid;
  v_tipo_solicitud text;
  v_estado text;
  v_motivo text;
  v_inicio timestamptz;
  v_zona text;
  v_profesor text;
  v_titular text;
  v_quien text;
  v_reserva_tipo text;
  v_frecuencia smallint;
  v_confirmada boolean;
  v_que text;
  v_cuando text;
begin
  select s.profesor_id, s.alumno_id, s.tipo, s.estado, s.motivo, s.fecha_clase, p.zona_horaria,
         coalesce(privado.nombre_remitente(p.nombre), 'Tu profesor'), a.nombre, pc.nombre,
         coalesce(r.tipo, ro.tipo), coalesce(r.frecuencia_semanas, ro.frecuencia_semanas)
    into v_profesor_id, v_alumno_id, v_tipo_solicitud, v_estado, v_motivo, v_inicio, v_zona,
         v_profesor, v_titular, v_quien, v_reserva_tipo, v_frecuencia
    from public.solicitud s
    join public.profesor p on p.id = s.profesor_id
    join public.alumno a on a.id = s.alumno_id
    left join public.reserva r on r.id = s.reserva_id
    left join public.clase co on co.id = s.clase_id
    left join public.reserva ro on ro.id = co.reserva_id
    left join public.persona_a_cargo pc on pc.id = coalesce(r.persona_a_cargo_id, co.persona_a_cargo_id)
   where s.id = p_solicitud_id;

  v_confirmada := v_estado = 'confirmada';
  v_que := case v_tipo_solicitud
             when 'movimiento' then 'cambio de horario'
             when 'cancelacion' then 'cancelación'
             else 'reserva' end;
  v_cuando := pg_catalog.to_char(v_inicio at time zone v_zona, 'DD/MM/YYYY "a las" HH24:MI')
              || ' (hora de ' || v_zona || ')';

  return privado.encolar_mail(
    'solicitud_respondida',
    v_profesor_id,
    v_alumno_id,
    null,
    v_profesor || case when v_confirmada then ' confirmó' else ' rechazó' end || ' tu solicitud de ' || v_que,
    'Hola' || coalesce(' ' || v_titular, '') || ',' || E'\n\n'
      || v_profesor || case when v_confirmada then ' confirmó' else ' rechazó' end
      || ' tu solicitud de ' || v_que || '.' || E'\n\n'
      || case when v_tipo_solicitud = 'reserva' and v_reserva_tipo = 'serie'
              then 'Serie ' || case when v_frecuencia = 2 then 'quincenal' else 'semanal' end
                   || ' desde el ' || v_cuando
              else 'Clase del ' || v_cuando end
      || E'\n'
      || case when v_quien is not null then 'Toma la clase: ' || v_quien || E'\n' else '' end
      || case when v_motivo is null then ''
              when v_confirmada then E'\n' || 'Mensaje: ' || v_motivo || E'\n'
              else E'\n' || 'Motivo: ' || v_motivo || E'\n' end
      || E'\n' || 'Podés ver tus clases en Mis clases.' || E'\n');
end;
$$;

-- 2. Rama de reserva (SOL-05, SOL-06): confirmar pasa la reserva y sus clases pendientes a confirmadas;
--    rechazar las pasa a rechazadas y libera los huecos (la exclusión de `clase` solo mira pendientes y
--    confirmadas, RES-01). Solo toca lo pendiente: lo anulado por una pausa (DEC-35) no vuelve.
create function privado.responder_reserva(p_solicitud_id uuid, p_confirmar boolean, p_ahora timestamptz)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_reserva_id uuid;
  v_profesor_id uuid;
  v_estado text := case when p_confirmar then 'confirmada' else 'rechazada' end;
begin
  select s.reserva_id, s.profesor_id into v_reserva_id, v_profesor_id
    from public.solicitud s
   where s.id = p_solicitud_id;

  update public.reserva r
     set estado = v_estado
   where r.id = v_reserva_id
     and r.profesor_id = v_profesor_id
     and r.estado = 'pendiente';

  update public.clase c
     set estado = v_estado,
         confirmada_en = case when p_confirmar then p_ahora else c.confirmada_en end
   where c.reserva_id = v_reserva_id
     and c.profesor_id = v_profesor_id
     and c.estado = 'pendiente';
end;
$$;

-- 3. Despachador por tipo (SOL-05, SOL-06). B07 trae la rama de reserva; B08 reemplaza esta función
--    (`create or replace`, misma firma) para sumar `movimiento` y `cancelacion`. Hasta entonces no existen
--    solicitudes de esos tipos (solo las crean `solicitar_movimiento` y `solicitar_cancelacion`, B08).
create function privado.aplicar_respuesta(p_solicitud_id uuid, p_tipo text, p_confirmar boolean, p_ahora timestamptz)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  if p_tipo = 'reserva' then
    perform privado.responder_reserva(p_solicitud_id, p_confirmar, p_ahora);
  else
    raise exception using errcode = 'XX000', message = 'TIPO_SIN_RESPUESTA';
  end if;
end;
$$;

-- 4. `responder_solicitud(p_solicitud_id, p_decision, p_motivo)` [P] (SOL-04..06, SOL-08, PRF-07, PRF-08).
--    Orden (como `responder_cuenta`, 202611000523): rol y cerrojo del profesor (401/403, ADR-002) →
--    `p_decision` (422 `{"campo":"p_decision"}`) → solicitud suya (404 si no existe o es de otro profesor,
--    sin revelar cuál: SEC-06) → profesor activo solo para confirmar (409 `PROFESOR_INACTIVO`; rechazar sí,
--    PRF-08) → pendiente (409 `SOLICITUD_YA_RESPONDIDA`) → horario no pasado según `app_ahora()` (409
--    `SOLICITUD_VENCIDA`, SOL-08, DEC-09) → motivo (422 `{"campo":"motivo"}`, hasta 500, SEC-09) → rama del
--    tipo → solicitud respondida → mail (AVI-03). Nada se escribe antes del motivo validado.
--    Al dejar de estar pendiente, la solicitud ya no cuenta en el tope de SOL-10 (`privado.contar_pendientes`):
--    el alumno vuelve a poder pedir con ese profesor (DEC-27, CA-41).
create function privado.responder_solicitud(p_solicitud_id uuid, p_decision text, p_motivo text)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_profesor uuid := privado.profesor_de_sesion();
  v_decision text := pg_catalog.btrim(coalesce(p_decision, ''));
  v_ahora timestamptz := public.app_ahora();
  v_solicitud public.solicitud%rowtype;
  v_confirmar boolean;
  v_estado text;
  v_motivo text;
begin
  if v_decision not in ('confirmar', 'rechazar') then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_decision"}';
  end if;
  v_confirmar := v_decision = 'confirmar';

  select s.* into v_solicitud
    from public.solicitud s
   where s.id = p_solicitud_id
     and s.profesor_id = v_profesor
     for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
  end if;

  if v_confirmar then
    perform privado.exigir_profesor_activo(v_profesor);
  end if;

  if v_solicitud.estado <> 'pendiente' then
    raise exception using errcode = 'PT409', message = 'SOLICITUD_YA_RESPONDIDA';
  end if;
  if v_solicitud.fecha_clase <= v_ahora then
    raise exception using errcode = 'PT409', message = 'SOLICITUD_VENCIDA';
  end if;

  v_motivo := privado.validar_motivo(p_motivo);
  v_estado := case when v_confirmar then 'confirmada' else 'rechazada' end;

  perform privado.aplicar_respuesta(v_solicitud.id, v_solicitud.tipo, v_confirmar, v_ahora);

  update public.solicitud s
     set estado = v_estado,
         motivo = v_motivo,
         respondida_en = v_ahora
   where s.id = v_solicitud.id;

  -- AVI-03: en la misma transacción (ADR-005); con Gmail caído la respuesta vale igual y el envío fallido
  -- queda en `mail_salida` (NFR-07, CA-34).
  perform privado.mail_solicitud_respondida(v_solicitud.id);

  return pg_catalog.jsonb_build_object('estado', v_estado);
end;
$$;

create function public.responder_solicitud(p_solicitud_id uuid, p_decision text, p_motivo text default null)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select privado.responder_solicitud(p_solicitud_id, p_decision, p_motivo)
$$;

-- 5. Permisos (SEC-04): `privado` no es ejecutable por la API; `responder_solicitud` [P] (el rol lo valida
--    `profesor_de_sesion`: la persona y el Administrador que no es profesor reciben 403).
revoke execute on function
  privado.mail_solicitud_respondida(uuid),
  privado.responder_reserva(uuid, boolean, timestamptz),
  privado.aplicar_respuesta(uuid, text, boolean, timestamptz),
  privado.responder_solicitud(uuid, text, text)
  from public, anon, authenticated;

revoke execute on function public.responder_solicitud(uuid, text, text) from public, anon;
grant execute on function public.responder_solicitud(uuid, text, text) to authenticated;
