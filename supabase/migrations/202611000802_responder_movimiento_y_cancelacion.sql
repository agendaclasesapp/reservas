-- B08 · T08.1 · Ramas de movimiento y cancelación de `responder_solicitud` (B07, 202611000703) y su mail al titular.
-- contratos.md §1 («Códigos internos»: `TIPO_SIN_RESPUESTA`) y §3, componentes.md §4, ADR-002, ADR-003 (fin de
-- serie), ADR-005 (outbox), ADR-019 (remitente y Reply-To del profesor).
-- IDs: SOL-05, SOL-06, SOL-07, NFR-03, SEC-08, AVI-03; CA-22, CA-23, CA-24.
-- `responder_solicitud` no cambia: valida rol, decisión, solicitud suya, profesor activo al confirmar, pendiente,
-- no vencida y motivo, y llama a `privado.aplicar_respuesta`, que aquí se reemplaza con la misma firma. Todo
-- corre en la transacción de esa RPC (NFR-03, SEC-08): si algo falla, no queda ningún cambio.

-- 1. Fin de serie «de acá en adelante» (ADR-003, SOL-07): `hasta` = el día local previo a la clase (o `desde` si
--    era la primera: la extensión diaria ya no la toca porque `hasta` deja de ser nulo) y las clases activas desde
--    esa clase pasan a `p_estado` (`movida` o `cancelada`). Las anteriores quedan intactas (CA-24). Cancelada
--    desde la primera clase, la reserva pasa a `cancelada` (H-361).
create function privado.terminar_serie(p_clase public.clase, p_estado text)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_dia date;
begin
  select (p_clase.inicio at time zone p.zona_horaria)::date into v_dia
    from public.profesor p where p.id = p_clase.profesor_id;

  update public.reserva r
     set hasta = greatest(r.desde, v_dia - 1),
         -- H-361, componentes.md §4: cancelada desde la primera clase, la reserva queda cancelada (como B09 y
         -- B11); movida no cambia su estado (como mover_clase).
         estado = case when p_estado = 'cancelada' and v_dia <= r.desde then 'cancelada' else r.estado end
   where r.id = p_clase.reserva_id;

  update public.clase c
     set estado = p_estado
   where c.reserva_id = p_clase.reserva_id
     and c.profesor_id = p_clase.profesor_id
     and c.inicio >= p_clase.inicio
     and c.estado in ('pendiente', 'confirmada');
end;
$$;

-- 2. La clase de origen debe seguir confirmada y futura al confirmar; si algo la cambió mientras la solicitud
--    esperaba, 409 `CLASE_NO_MODIFICABLE` antes de escribir nada.
create function privado.clase_origen_vigente(p_solicitud_id uuid, p_ahora timestamptz)
returns public.clase
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_clase public.clase;
begin
  select c.* into v_clase
    from public.solicitud s
    join public.clase c on c.id = s.clase_id and c.profesor_id = s.profesor_id
   where s.id = p_solicitud_id
     for update of c;
  if not found or v_clase.estado <> 'confirmada' or v_clase.inicio <= p_ahora then
    raise exception using errcode = 'PT409', message = 'CLASE_NO_MODIFICABLE';
  end if;
  return v_clase;
end;
$$;

-- 3. Rama de movimiento (SOL-05, SOL-06, SOL-07, NFR-03, CA-22, CA-24). Rechazar: la reserva destino y sus clases
--    pendientes pasan a `rechazada` y el destino queda libre; el origen no cambia. Confirmar: primero el destino
--    (reserva y clases pendientes a `confirmada`, como una reserva) y después el origen: «solo esta» pasa la
--    clase a `movida` con `movida_a` = la clase destino; «de acá en adelante» termina la serie en esa fecha con
--    sus clases siguientes `movida` (la serie nueva ya nació con la solicitud, desde el destino). Una sola
--    transacción: un fallo entre los dos pasos no deja ninguno (SEC-08).
create function privado.responder_movimiento(p_solicitud_id uuid, p_confirmar boolean, p_ahora timestamptz)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_solicitud public.solicitud%rowtype;
  v_origen public.clase;
  v_destino uuid;
begin
  select s.* into v_solicitud from public.solicitud s where s.id = p_solicitud_id;

  if not p_confirmar then
    perform privado.responder_reserva(p_solicitud_id, false, p_ahora);
    return;
  end if;

  v_origen := privado.clase_origen_vigente(p_solicitud_id, p_ahora);

  perform privado.responder_reserva(p_solicitud_id, true, p_ahora);

  select c.id into v_destino
    from public.clase c
   where c.reserva_id = v_solicitud.reserva_id
     and c.profesor_id = v_solicitud.profesor_id
   order by c.inicio
   limit 1;

  if v_solicitud.alcance = 'desde_aca' then
    perform privado.terminar_serie(v_origen, 'movida');
  else
    update public.clase c
       set estado = 'movida'
     where c.id = v_origen.id;
  end if;

  update public.clase c
     set movida_a = v_destino
   where c.id = v_origen.id;
end;
$$;

-- 4. Rama de cancelación (SOL-05, SOL-06, SOL-07, CA-23, CA-24). Rechazar: la clase sigue confirmada (no se
--    escribe nada además de la solicitud). Confirmar: «solo esta» cancela la clase (y su reserva si era suelta);
--    «de acá en adelante» termina la serie en esa fecha con las siguientes `cancelada`. Los huecos quedan libres
--    porque la exclusión de `clase` solo mira pendientes y confirmadas (RES-01).
create function privado.responder_cancelacion(p_solicitud_id uuid, p_confirmar boolean, p_ahora timestamptz)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alcance text;
  v_origen public.clase;
begin
  if not p_confirmar then
    return;
  end if;

  select s.alcance into v_alcance from public.solicitud s where s.id = p_solicitud_id;
  v_origen := privado.clase_origen_vigente(p_solicitud_id, p_ahora);

  if v_alcance = 'desde_aca' then
    perform privado.terminar_serie(v_origen, 'cancelada');
  else
    update public.clase c
       set estado = 'cancelada'
     where c.id = v_origen.id;

    update public.reserva r
       set estado = 'cancelada'
     where r.id = v_origen.reserva_id
       and r.tipo = 'suelta'
       and r.estado = 'confirmada';
  end if;
end;
$$;

-- 5. Despachador por tipo: reemplaza el de B07 con la misma firma (contratos.md §1). Suma `movimiento` y
--    `cancelacion` y conserva el `else` con `TIPO_SIN_RESPUESTA` (invariante inalcanzable: `solicitud.tipo` solo
--    admite los tres tipos por su CHECK).
create or replace function privado.aplicar_respuesta(p_solicitud_id uuid, p_tipo text, p_confirmar boolean, p_ahora timestamptz)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  if p_tipo = 'reserva' then
    perform privado.responder_reserva(p_solicitud_id, p_confirmar, p_ahora);
  elsif p_tipo = 'movimiento' then
    perform privado.responder_movimiento(p_solicitud_id, p_confirmar, p_ahora);
  elsif p_tipo = 'cancelacion' then
    perform privado.responder_cancelacion(p_solicitud_id, p_confirmar, p_ahora);
  else
    raise exception using errcode = 'XX000', message = 'TIPO_SIN_RESPUESTA';
  end if;
end;
$$;

-- 6. AVI-03, CA-23, CA-56: mail al titular con la respuesta y el motivo. Reemplaza el de B07 con la misma firma;
--    el texto de una reserva no cambia. En un movimiento o una cancelación nombra la clase de origen (no
--    `fecha_clase`, que en un movimiento a una fecha anterior es el destino), el nuevo horario del movimiento y
--    el alcance. Remitente y Reply-To del profesor por el tipo `solicitud_respondida` (ADR-019); solo al
--    titular; sin fecha de nacimiento de nadie (SEC-29); horas en el huso del profesor (ADR-004).
create or replace function privado.mail_solicitud_respondida(p_solicitud_id uuid)
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
  v_estado text;
  v_motivo text;
  v_inicio timestamptz;
  v_destino timestamptz;
  v_zona text;
  v_profesor text;
  v_titular text;
  v_quien text;
  v_reserva_tipo text;
  v_frecuencia smallint;
  v_confirmada boolean;
  v_que text;
  v_cuando text;
  v_alcance_txt text := '';
begin
  select s.profesor_id, s.alumno_id, s.tipo, s.alcance, s.estado, s.motivo,
         case when s.tipo = 'reserva' then s.fecha_clase else co.inicio end, p.zona_horaria,
         coalesce(privado.nombre_remitente(p.nombre), 'Tu profesor'), a.nombre, pc.nombre,
         coalesce(ro.tipo, r.tipo), coalesce(ro.frecuencia_semanas, r.frecuencia_semanas)
    into v_profesor_id, v_alumno_id, v_tipo_solicitud, v_alcance, v_estado, v_motivo, v_inicio, v_zona,
         v_profesor, v_titular, v_quien, v_reserva_tipo, v_frecuencia
    from public.solicitud s
    join public.profesor p on p.id = s.profesor_id
    join public.alumno a on a.id = s.alumno_id
    left join public.reserva r on r.id = s.reserva_id
    left join public.clase co on co.id = s.clase_id
    left join public.reserva ro on ro.id = co.reserva_id
    left join public.persona_a_cargo pc on pc.id = coalesce(co.persona_a_cargo_id, r.persona_a_cargo_id)
   where s.id = p_solicitud_id;

  if v_tipo_solicitud = 'movimiento' then
    select pg_catalog.min(c.inicio) into v_destino
      from public.clase c
     where c.reserva_id = (select s.reserva_id from public.solicitud s where s.id = p_solicitud_id);
  end if;

  v_confirmada := v_estado = 'confirmada';
  v_que := case v_tipo_solicitud
             when 'movimiento' then 'cambio de horario'
             when 'cancelacion' then 'cancelación'
             else 'reserva' end;
  v_cuando := pg_catalog.to_char(v_inicio at time zone v_zona, 'DD/MM/YYYY "a las" HH24:MI')
              || ' (hora de ' || v_zona || ')';
  if v_tipo_solicitud <> 'reserva' then
    v_alcance_txt := case when v_destino is not null
                          then 'Nuevo horario: ' || pg_catalog.to_char(v_destino at time zone v_zona,
                                                                       'DD/MM/YYYY "a las" HH24:MI') || E'\n'
                          else '' end
      || case when v_alcance = 'desde_aca'
              then 'Alcance: de acá en adelante (serie '
                   || case when v_frecuencia = 2 then 'quincenal' else 'semanal' end || ')' || E'\n'
              else 'Alcance: solo esta clase' || E'\n' end;
  end if;

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
      || v_alcance_txt
      || case when v_quien is not null then 'Toma la clase: ' || v_quien || E'\n' else '' end
      || case when v_motivo is null then ''
              when v_confirmada then E'\n' || 'Mensaje: ' || v_motivo || E'\n'
              else E'\n' || 'Motivo: ' || v_motivo || E'\n' end
      || E'\n' || 'Podés ver tus clases en Mis clases.' || E'\n');
end;
$$;

-- 7. Permisos (SEC-04): nada de esto es ejecutable por la API.
revoke execute on function
  privado.terminar_serie(public.clase, text),
  privado.clase_origen_vigente(uuid, timestamptz),
  privado.responder_movimiento(uuid, boolean, timestamptz),
  privado.responder_cancelacion(uuid, boolean, timestamptz),
  privado.aplicar_respuesta(uuid, text, boolean, timestamptz),
  privado.mail_solicitud_respondida(uuid)
  from public, anon, authenticated;
