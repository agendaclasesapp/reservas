-- B09 · T09.1 · Gestión directa del profesor (2/2): `mover_clase` y `cancelar_clase`.
-- contratos.md §1 y §3, ADR-002 (RPC transaccional y errores), ADR-003 (series: terminar «de acá en adelante»,
-- nacer por movimiento), ADR-005 (outbox), ADR-014 (`app_ahora()`), ADR-018 (profesor inactivo), ADR-019.
-- IDs: PRF-02, PRF-03, PRF-04, PRF-07, PRF-08, AVI-04, SEC-06, SEC-09. CA-27, CA-30, CA-52, CA-63.

-- 1. Clase del profesor que se va a mover o cancelar, con su reserva y las clases que toca el alcance.
--    Orden común: clase suya (404 `NO_ENCONTRADO`: inexistente o de otro profesor, misma respuesta, SEC-06) →
--    [activo, solo al mover] → `p_alcance` `solo_esta` o `desde_aca` (422 `{"campo":"p_alcance"}`; en una clase
--    suelta vale como `solo_esta`) → clase `confirmada` y futura según `app_ahora()` (409 `CLASE_NO_MODIFICABLE`;
--    una pendiente se responde desde la lista) → ninguna solicitud pendiente y no vencida que alcance las clases
--    tocadas: sobre una de ellas o «de acá en adelante» desde una clase anterior de la serie (409
--    `SOLICITUD_EN_CURSO` `{"solicitud_id"}`: primero se responde). Bloquea las filas tocadas.
--    `desde_aca` en una serie toca la clase y las siguientes confirmadas de la misma reserva (ADR-003).
create function privado.gestion_clase_afectada(
  p_profesor_id uuid,
  p_clase_id uuid,
  p_alcance text,
  p_exigir_activo boolean,
  p_ahora timestamptz,
  out clase public.clase,
  out reserva public.reserva,
  out desde_aca boolean,
  out afectadas uuid[]
)
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alcance text := pg_catalog.btrim(coalesce(p_alcance, ''));
  v_solicitud uuid;
begin
  select c.* into clase
    from public.clase c
   where c.id = p_clase_id
     and c.profesor_id = p_profesor_id
     for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
  end if;

  if p_exigir_activo then
    perform privado.exigir_profesor_activo(p_profesor_id);
  end if;

  if v_alcance not in ('solo_esta', 'desde_aca') then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_alcance"}';
  end if;

  if clase.estado <> 'confirmada' or clase.inicio <= p_ahora then
    raise exception using errcode = 'PT409', message = 'CLASE_NO_MODIFICABLE';
  end if;

  select r.* into reserva from public.reserva r where r.id = clase.reserva_id for update;
  desde_aca := v_alcance = 'desde_aca' and reserva.tipo = 'serie';

  if desde_aca then
    select pg_catalog.array_agg(c.id order by c.inicio) into afectadas
      from public.clase c
     where c.reserva_id = reserva.id
       and c.profesor_id = p_profesor_id
       and c.estado = 'confirmada'
       and c.inicio >= clase.inicio;
    perform 1 from public.clase c where c.id = any (afectadas) for update;
  else
    afectadas := array[clase.id];
  end if;

  -- H-362: regla de contratos.md §1 (la misma de B08). Una vencida no traba la clase; una «de acá en adelante»
  -- pendiente de una clase anterior de la misma serie sí la alcanza.
  select s.id into v_solicitud
    from public.solicitud s
    join public.clase so on so.id = s.clase_id
   where s.estado = 'pendiente'
     and s.profesor_id = p_profesor_id
     and s.fecha_clase > p_ahora
     and so.reserva_id = clase.reserva_id
     and (so.id = any (afectadas) or (s.alcance = 'desde_aca' and so.inicio <= clase.inicio))
   order by s.creada_en, s.id
   limit 1;
  if v_solicitud is not null then
    raise exception using errcode = 'PT409', message = 'SOLICITUD_EN_CURSO',
      detail = pg_catalog.jsonb_build_object('solicitud_id', v_solicitud)::text;
  end if;
end;
$$;

-- 2. `mover_clase(p_clase_id, p_destino, p_alcance)` [P] (PRF-02, PRF-04, PRF-08, AVI-04): el profesor mueve una
--    clase confirmada a un hueco libre de su agenda y queda confirmada al instante, sin solicitud.
--    Orden: rol y cerrojo (401/403) → `gestion_clase_afectada` (404, 409 `PROFESOR_INACTIVO`, 422 `p_alcance`,
--    409 `CLASE_NO_MODIFICABLE`, 409 `SOLICITUD_EN_CURSO`) → destino (422 `{"campo":"p_destino"}` nulo, pasado o
--    más allá de hoy + 366 días; 422 `FUERA_DE_GRILLA`) → destino libre sin contar las clases que se mueven (409
--    `HUECO_NO_LIBRE`; el mismo horario de la clase también). Sin anticipación (PRF-04).
--    `solo_esta`: la clase pasa a `movida` con `movida_a` y nace una reserva suelta en el destino.
--    `desde_aca` en una serie: la serie termina el día anterior (`hasta`; si era la primera fecha, `hasta` queda
--    en `desde`, por `reserva_hasta_orden`) y esa clase y las siguientes confirmadas pasan a `movida`; nace una
--    serie con la misma frecuencia desde el destino, que materializa hasta el horizonte y saltea las fechas
--    ocupadas o bloqueadas (RES-05, ADR-003); `extender_series` la sigue (SEC-28). La reserva nueva lleva
--    `origen = 'profesor'` y `reserva_origen_id`. Mail `clase_movida` al titular (AVI-04, ADR-005).
create function privado.mover_clase(p_clase_id uuid, p_destino timestamptz, p_alcance text)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_profesor uuid := privado.profesor_de_sesion();
  v_ahora timestamptz := public.app_ahora();
  v_zona text;
  v_af record;
  v_fin timestamptz;
  v_dia date;
  v_hora time;
  v_duracion integer;
  v_hasta date;
  v_frecuencia smallint;
  v_reserva_id uuid;
  v_nueva uuid;
  v_fechas jsonb;
  v_salteadas jsonb := '[]'::jsonb;
  v_detalle text;
begin
  select * into v_af from privado.gestion_clase_afectada(v_profesor, p_clase_id, p_alcance, true, v_ahora);

  v_fin := privado.gestion_validar_hueco(v_profesor, p_destino, v_ahora, 'p_destino');
  if p_destino = (v_af.clase).inicio then
    raise exception using errcode = 'PT409', message = 'HUECO_NO_LIBRE',
      detail = pg_catalog.jsonb_build_object('inicio', p_destino)::text;
  end if;

  select p.zona_horaria into v_zona from public.profesor p where p.id = v_profesor;

  -- Libera lo que se mueve: el destino se mide sin esas clases (RES-01).
  update public.clase c set estado = 'movida' where c.id = any (v_af.afectadas);
  if v_af.desde_aca then
    update public.reserva r
       set hasta = greatest(((v_af.clase).inicio at time zone v_zona)::date - 1, r.desde)
     where r.id = (v_af.reserva).id;
  end if;

  if privado.motivo_no_libre(v_profesor, p_destino, v_fin) is not null then
    raise exception using errcode = 'PT409', message = 'HUECO_NO_LIBRE',
      detail = pg_catalog.jsonb_build_object('inicio', p_destino)::text;
  end if;

  v_dia := (p_destino at time zone v_zona)::date;
  v_hora := (p_destino at time zone v_zona)::time;
  v_duracion := (extract(epoch from (v_fin - p_destino)) / 60)::integer;
  if v_af.desde_aca then
    v_frecuencia := (v_af.reserva).frecuencia_semanas;
    v_hasta := privado.horizonte_serie(v_profesor, v_dia, v_ahora);
    select coalesce(pg_catalog.jsonb_agg(f.inicio order by f.inicio), '[]'::jsonb)
      into v_salteadas
      from privado.fechas_serie(v_profesor, v_dia, v_hora, v_duracion, v_frecuencia, v_dia + 1, v_hasta) f
     where f.estado = 'salteada';
  else
    v_hasta := v_dia;
  end if;

  insert into public.reserva (profesor_id, alumno_id, persona_a_cargo_id, tipo, frecuencia_semanas, hora_local,
                              dia_semana, duracion_min, observacion, estado, desde, hasta, materializada_hasta,
                              origen, reserva_origen_id)
  values (v_profesor, (v_af.clase).alumno_id, (v_af.clase).persona_a_cargo_id,
          case when v_af.desde_aca then 'serie' else 'suelta' end, v_frecuencia, v_hora,
          extract(isodow from v_dia)::smallint, v_duracion, (v_af.reserva).observacion, 'confirmada', v_dia,
          case when v_af.desde_aca then null else v_dia end, v_hasta, 'profesor', (v_af.reserva).id)
  returning id into v_reserva_id;

  begin
    insert into public.clase (profesor_id, reserva_id, alumno_id, persona_a_cargo_id, inicio, fin, estado,
                              confirmada_en)
    values (v_profesor, v_reserva_id, (v_af.clase).alumno_id, (v_af.clase).persona_a_cargo_id, p_destino, v_fin,
            'confirmada', v_ahora)
    returning id into v_nueva;

    if v_af.desde_aca then
      insert into public.clase (profesor_id, reserva_id, alumno_id, persona_a_cargo_id, inicio, fin, estado,
                                confirmada_en)
      select v_profesor, v_reserva_id, (v_af.clase).alumno_id, (v_af.clase).persona_a_cargo_id, f.inicio, f.fin,
             'confirmada', v_ahora
        from privado.fechas_serie(v_profesor, v_dia, v_hora, v_duracion, v_frecuencia, v_dia + 1, v_hasta) f
       where f.estado = 'reservable';
    end if;
  exception when exclusion_violation then
    -- SEC-08: otra transacción ocupó el hueco.
    raise exception using errcode = 'PT409', message = 'HUECO_NO_LIBRE',
      detail = pg_catalog.jsonb_build_object('inicio', p_destino)::text;
  end;

  update public.clase c set movida_a = v_nueva where c.id = (v_af.clase).id;

  select pg_catalog.jsonb_agg(c.inicio order by c.inicio) into v_fechas
    from public.clase c
   where c.reserva_id = v_reserva_id;

  -- AVI-04, CA-30: al titular, en la misma transacción.
  v_detalle := case
    when v_af.desde_aca then
      'cambió el horario de tu serie de clases: desde la clase del '
        || privado.gestion_cuando((v_af.clase).inicio, v_zona) || ', pasa a ser '
        || case when v_frecuencia = 2 then 'quincenal' else 'semanal' end
        || ' desde el ' || privado.gestion_cuando(p_destino, v_zona) || '.'
        || case when pg_catalog.jsonb_array_length(v_salteadas) > 0
                then E'\n' || 'Fechas que no se pudieron reservar porque estaban ocupadas: '
                     || (select pg_catalog.string_agg(privado.gestion_cuando(s.v::timestamptz, v_zona), '; '
                                                      order by s.v::timestamptz)
                           from pg_catalog.jsonb_array_elements_text(v_salteadas) as s (v))
                     || '.'
                else '' end
    else
      'cambió el horario de tu clase del ' || privado.gestion_cuando((v_af.clase).inicio, v_zona)
        || ': ahora es el ' || privado.gestion_cuando(p_destino, v_zona) || '.'
  end;
  perform privado.mail_gestion_clase('clase_movida', v_profesor, (v_af.clase).alumno_id,
                                     (v_af.clase).persona_a_cargo_id, v_detalle);

  return pg_catalog.jsonb_build_object(
    'clase_id', v_nueva,
    'fechas', v_fechas,
    'salteadas', v_salteadas);
end;
$$;

create function public.mover_clase(p_clase_id uuid, p_destino timestamptz default null, p_alcance text default null)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select privado.mover_clase(p_clase_id, p_destino, p_alcance)
$$;

-- 3. `cancelar_clase(p_clase_id, p_alcance)` [P] (PRF-03, PRF-08, AVI-04): el profesor cancela una clase
--    confirmada o una serie desde esa fecha, y los huecos se liberan (la exclusión de `clase` solo mira
--    pendientes y confirmadas, RES-01). No exige el profesor activo: inactivo, sigue cancelando (PRF-08, CA-63).
--    Orden: rol y cerrojo (401/403) → `gestion_clase_afectada` (404, 422 `p_alcance`, 409 `CLASE_NO_MODIFICABLE`,
--    409 `SOLICITUD_EN_CURSO`).
--    `solo_esta`: esa clase pasa a `cancelada` (en una suelta, también su reserva).
--    `desde_aca` en una serie: esa clase y las siguientes confirmadas pasan a `cancelada` y la serie termina el
--    día anterior (`hasta`, ADR-003; `extender_series` ya no la sigue); desde la primera fecha, la reserva queda
--    `cancelada` con `hasta = desde`. Devuelve `{canceladas}`. Mail `clase_cancelada` al titular (ADR-005).
create function privado.cancelar_clase(p_clase_id uuid, p_alcance text)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_profesor uuid := privado.profesor_de_sesion();
  v_ahora timestamptz := public.app_ahora();
  v_zona text;
  v_af record;
  v_dia date;
  v_canceladas integer;
begin
  select * into v_af from privado.gestion_clase_afectada(v_profesor, p_clase_id, p_alcance, false, v_ahora);
  select p.zona_horaria into v_zona from public.profesor p where p.id = v_profesor;

  update public.clase c set estado = 'cancelada' where c.id = any (v_af.afectadas);
  get diagnostics v_canceladas = row_count;

  if v_af.desde_aca then
    v_dia := ((v_af.clase).inicio at time zone v_zona)::date;
    update public.reserva r
       set hasta = greatest(v_dia - 1, r.desde),
           estado = case when v_dia <= r.desde then 'cancelada' else r.estado end
     where r.id = (v_af.reserva).id;
  elsif (v_af.reserva).tipo = 'suelta' then
    update public.reserva r set estado = 'cancelada' where r.id = (v_af.reserva).id;
  end if;

  -- AVI-04, CA-30: al titular, en la misma transacción.
  perform privado.mail_gestion_clase(
    'clase_cancelada', v_profesor, (v_af.clase).alumno_id, (v_af.clase).persona_a_cargo_id,
    case when v_af.desde_aca
         then 'canceló tu serie de clases desde la clase del ' || privado.gestion_cuando((v_af.clase).inicio, v_zona)
              || ' (' || v_canceladas || case when v_canceladas = 1 then ' clase).' else ' clases).' end
         else 'canceló tu clase del ' || privado.gestion_cuando((v_af.clase).inicio, v_zona) || '.' end);

  return pg_catalog.jsonb_build_object('canceladas', v_canceladas);
end;
$$;

create function public.cancelar_clase(p_clase_id uuid, p_alcance text default null)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select privado.cancelar_clase(p_clase_id, p_alcance)
$$;

-- 4. Permisos (SEC-04): `privado` no es ejecutable por la API; `mover_clase` y `cancelar_clase` [P] (el rol lo
--    valida `profesor_de_sesion`).
revoke execute on function
  privado.gestion_clase_afectada(uuid, uuid, text, boolean, timestamptz),
  privado.mover_clase(uuid, timestamptz, text),
  privado.cancelar_clase(uuid, text)
  from public, anon, authenticated;

revoke execute on function public.mover_clase(uuid, timestamptz, text) from public, anon;
grant execute on function public.mover_clase(uuid, timestamptz, text) to authenticated;
revoke execute on function public.cancelar_clase(uuid, text) from public, anon;
grant execute on function public.cancelar_clase(uuid, text) to authenticated;
