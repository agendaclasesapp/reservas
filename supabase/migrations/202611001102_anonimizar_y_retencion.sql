-- B11 · T11.1 (primera parte) · Anonimizar a la persona y retención por inactividad.
-- IDs: ALU-10, ALU-12, SEC-26, SEC-27, CA-08, CA-45, CA-59. ADR-011 (anonimizar en lugar de borrar filas,
-- DEC-04 A, DEC-05 A), DEC-26 A (el borrado por inactividad es de la persona), H-004 (barrido de centinelas).
-- Funciones de `privado`: no son RPC (no las ejecuta `anon` ni `authenticated`); corren como `postgres`
-- desde `public.borrar_alumno` (security definer) o desde el job.

-- 0. Una reserva conserva alguna clase activa (`pendiente` o `confirmada`, pasada o futura).
create function privado.reserva_con_clases_activas(p_reserva_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.clase c
                  where c.reserva_id = p_reserva_id
                    and c.estado in ('pendiente', 'confirmada'))
$$;

-- 1. `privado.cerrar_agenda_alumno(p_alumno_id, p_profesor_id, p_ahora)`: deja sin nada por delante a la
--    persona con un profesor (`p_profesor_id`) o con todos (null), sin mails (DEC-05 A). El llamador ya tomó
--    el cerrojo de cada profesor afectado (ADR-002).
--      a. sus solicitudes `pendiente` pasan a `anulada` (`respondida_en = p_ahora`, como la pausa de B06), y la
--         reserva que nombra cada una, si sigue `pendiente`, pasa a `cancelada` con sus clases `pendiente`;
--      b. sus clases futuras activas (`pendiente` o `confirmada` con `inicio > p_ahora`) pasan a `cancelada`:
--         la exclusión solo mira las activas, así que los huecos quedan libres (ALU-12, CA-10);
--      c. cada reserva suya que sigue `pendiente` o `confirmada`: sin ninguna clase activa pasa a `cancelada`;
--         una serie abierta que conserva clases pasadas se cierra con `hasta` = hoy en el huso del profesor
--         (al menos `desde`), para que `privado.extender_series` no vuelva a materializarla.
--    Devuelve `{clases_canceladas, solicitudes_anuladas}`.
create function privado.cerrar_agenda_alumno(p_alumno_id uuid, p_profesor_id uuid, p_ahora timestamptz)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_reservas uuid[];
  v_solicitudes integer := 0;
  v_clases integer := 0;
  v_filas integer;
begin
  with anuladas as (
    update public.solicitud s
       set estado = 'anulada', respondida_en = p_ahora
     where s.alumno_id = p_alumno_id
       and (p_profesor_id is null or s.profesor_id = p_profesor_id)
       and s.estado = 'pendiente'
    returning s.reserva_id
  )
  select pg_catalog.count(*)::integer,
         pg_catalog.array_agg(distinct a.reserva_id) filter (where a.reserva_id is not null)
    into v_solicitudes, v_reservas
    from anuladas a;

  if v_reservas is not null then
    with canceladas as (
      update public.reserva r
         set estado = 'cancelada'
       where r.id = any (v_reservas)
         and r.estado = 'pendiente'
      returning r.id
    )
    update public.clase c
       set estado = 'cancelada'
      from canceladas k
     where c.reserva_id = k.id
       and c.estado = 'pendiente';
    get diagnostics v_filas = row_count;
    v_clases := v_clases + v_filas;
  end if;

  update public.clase c
     set estado = 'cancelada'
   where c.alumno_id = p_alumno_id
     and (p_profesor_id is null or c.profesor_id = p_profesor_id)
     and c.estado in ('pendiente', 'confirmada')
     and c.inicio > p_ahora;
  get diagnostics v_filas = row_count;
  v_clases := v_clases + v_filas;

  update public.reserva r
     set estado = case when privado.reserva_con_clases_activas(r.id) then r.estado else 'cancelada' end,
         hasta = case
                   when r.tipo = 'serie' and r.hasta is null and privado.reserva_con_clases_activas(r.id)
                     then greatest(r.desde, (p_ahora at time zone p.zona_horaria)::date)
                   else r.hasta
                 end
    from public.profesor p
   where p.id = r.profesor_id
     and r.alumno_id = p_alumno_id
     and (p_profesor_id is null or r.profesor_id = p_profesor_id)
     and r.estado in ('pendiente', 'confirmada')
     and (not privado.reserva_con_clases_activas(r.id) or (r.tipo = 'serie' and r.hasta is null));

  return pg_catalog.jsonb_build_object('clases_canceladas', v_clases, 'solicitudes_anuladas', v_solicitudes);
end;
$$;

-- 2. `privado.anonimizar_alumno(p_alumno_id, p_ahora)` (ADR-011, SEC-26, H-004). En la transacción del
--    llamador y con la fila de la persona bloqueada:
--      - toma el cerrojo de cada profesor con el que tiene algo activo por delante (en orden de id) y cierra
--        su agenda con todos (punto 1; en la retención no hay nada, en `borrar_alumno` ya se cerró);
--      - personas a cargo: `clase` y `reserva` dejan de nombrarlas y se borran;
--      - `alumno`: nombre, mail, teléfono (y con él `telefono_clave`), fecha de nacimiento y `user_id` a
--        nulo, estado `borrado`, `borrado_en = p_ahora`; la fila queda para que el historial cuente (CA-08);
--      - `inscripcion`: `motivo_estado` y `como_llego` a nulo y estado `baja` con todos los profesores
--        (ningún profesor la sigue viendo; CA-45: el motivo de rechazo deja de existir);
--      - `reserva.observacion` y `solicitud.motivo` de todas las suyas a nulo;
--      - `mail_salida` con su `alumno_id` (también los dirigidos al profesor que la nombran, ADR-005):
--        destinatario, asunto, cuerpo y motivo de fallo a nulo, el `tipo` queda; uno `pendiente` o
--        `enviando` pasa a `fallido` para que no salga sin destinatario y para que el PATCH de enviar-mail
--        (filtro `estado=eq.enviando`) no vuelva a escribir un motivo SMTP sobre la fila (H-355, SEC-26);
--      - sus pares descartados de unión (`privado.union_descartada`);
--      - su usuario de Auth: `auth.users` (con identities, sessions, refresh_tokens, one_time_tokens y
--        mfa en cascada) y lo que Auth guarda sin FK (`refresh_tokens` sin sesión, `flow_state`,
--        `audit_log_entries` del usuario). Si ese usuario es también profesor o Administrador no se borra.
--    Idempotente: una persona ya `borrado` (o que no existe) devuelve ceros sin tocar nada.
--    Devuelve `{clases_canceladas, solicitudes_anuladas}`.
create function privado.anonimizar_alumno(p_alumno_id uuid, p_ahora timestamptz default public.app_ahora())
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_user uuid;
  v_estado text;
  v_profesor uuid;
  v_resultado jsonb;
begin
  select a.user_id, a.estado into v_user, v_estado
    from public.alumno a
   where a.id = p_alumno_id
     for update;
  if not found or v_estado = 'borrado' then
    return pg_catalog.jsonb_build_object('clases_canceladas', 0, 'solicitudes_anuladas', 0);
  end if;

  for v_profesor in
    select x.profesor_id
      from (select c.profesor_id from public.clase c
             where c.alumno_id = p_alumno_id and c.estado in ('pendiente', 'confirmada') and c.inicio > p_ahora
            union
            select s.profesor_id from public.solicitud s
             where s.alumno_id = p_alumno_id and s.estado = 'pendiente') x
     order by x.profesor_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profesor::text, 0));
  end loop;

  v_resultado := privado.cerrar_agenda_alumno(p_alumno_id, null, p_ahora);

  update public.clase c set persona_a_cargo_id = null
   where c.alumno_id = p_alumno_id and c.persona_a_cargo_id is not null;
  update public.reserva r set persona_a_cargo_id = null
   where r.alumno_id = p_alumno_id and r.persona_a_cargo_id is not null;
  delete from public.persona_a_cargo pc where pc.alumno_id = p_alumno_id;

  update public.alumno a
     set nombre = null,
         mail = null,
         telefono = null,
         fecha_nacimiento = null,
         user_id = null,
         aviso_inactividad_en = null,
         estado = 'borrado',
         borrado_en = p_ahora
   where a.id = p_alumno_id;

  update public.inscripcion i
     set motivo_estado = null,
         como_llego = null,
         estado = 'baja'
   where i.alumno_id = p_alumno_id;

  update public.reserva r set observacion = null
   where r.alumno_id = p_alumno_id and r.observacion is not null;
  update public.solicitud s set motivo = null
   where s.alumno_id = p_alumno_id and s.motivo is not null;

  update public.mail_salida m
     set destinatario = null,
         asunto = null,
         cuerpo_texto = null,
         motivo_fallo = null,
         estado = case when m.estado in ('pendiente', 'enviando') then 'fallido' else m.estado end
   where m.alumno_id = p_alumno_id;

  delete from privado.union_descartada d
   where d.cuenta_id = p_alumno_id or d.sin_cuenta_id = p_alumno_id;

  if v_user is not null
     and not exists (select 1 from public.profesor p where p.user_id = v_user)
     and not exists (select 1 from privado.administrador ad where ad.user_id = v_user) then
    delete from auth.refresh_tokens t where t.user_id = v_user::text;
    delete from auth.flow_state f where f.user_id = v_user;
    delete from auth.audit_log_entries e
     where e.payload ->> 'actor_id' = v_user::text
        or e.payload -> 'traits' ->> 'user_id' = v_user::text;
    delete from auth.users u where u.id = v_user;
  end if;

  return v_resultado;
end;
$$;

-- 3. `privado.retencion(p_ahora)` (ALU-10, ALU-11, DEC-26 A, SEC-27): anonimiza a cada persona vencida
--    (`privado.vence_inactividad_en(...) <= p_ahora`). Bloquea la fila y vuelve a calcular el vencimiento antes
--    de anonimizar, así un ingreso o una clase nueva que se confirmó en el medio la salva. Idempotente: una
--    segunda corrida no encuentra a nadie (las borradas quedan fuera). Devuelve `{anonimizados}`.
--    La segunda parte de T11.1 la reemplaza con la misma firma para sumar el aviso de 7 días (AVI-06) y el
--    registro en `privado.ejecucion_proceso` (SEC-28).
create function privado.retencion(p_ahora timestamptz default public.app_ahora())
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_id uuid;
  v_vence timestamptz;
  v_anonimizados integer := 0;
begin
  for v_id in
    select v.alumno_id
      from privado.vencimientos_inactividad(p_ahora) v
     where v.vence_en <= p_ahora
     order by v.alumno_id
  loop
    perform 1 from public.alumno a where a.id = v_id for update;
    v_vence := privado.vence_inactividad_en(v_id, p_ahora);
    if v_vence is not null and v_vence <= p_ahora then
      perform privado.anonimizar_alumno(v_id, p_ahora);
      v_anonimizados := v_anonimizados + 1;
    end if;
  end loop;

  return pg_catalog.jsonb_build_object('anonimizados', v_anonimizados);
end;
$$;

revoke execute on function
  privado.reserva_con_clases_activas(uuid),
  privado.cerrar_agenda_alumno(uuid, uuid, timestamptz),
  privado.anonimizar_alumno(uuid, timestamptz),
  privado.retencion(timestamptz)
  from public, anon, authenticated;
