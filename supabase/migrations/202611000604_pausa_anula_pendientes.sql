-- B06 · T06.1 · La pausa anula lo pendiente del profesor (ADR-018 «Anulación al inactivar»).
-- IDs: ADM-05, AGE-11, CA-63, DEC-35, DEC-37.
-- Redefine `privado.cambiar_estado_profesor` de B15 (202611000531) con la misma firma, el mismo contrato y el
-- mismo orden de validación: rol (401/403) → `p_activo` nulo (422 `{"campo":"p_activo"}`) → profesor nulo (404)
-- → cerrojo del profesor (ADR-002) → profesor que no existe (404). El envoltorio público no cambia y
-- `create or replace` conserva los permisos de 202611000531 (SEC-04).
--
-- Al pasar de activo a inactivo, después del `update` y bajo el mismo cerrojo (misma transacción):
--   1. toda solicitud `pendiente` del profesor pasa a `anulada` con `respondida_en = app_ahora()`, vencidas
--      incluidas (DEC-35);
--   2. la reserva que nombra cada una (`reserva_id`: la pedida o la destino de un movimiento), si sigue
--      `pendiente`, pasa a `cancelada`, y sus clases `pendiente` también (el hueco queda libre).
-- No toca clases ni reservas confirmadas ni encola mails (DEC-37). Repetir la inactivación no cambia nada
-- (ya no hay pendientes y `activo` no cambia); reactivar solo cambia `activo` y no restablece nada.
create or replace function privado.cambiar_estado_profesor(p_profesor_id uuid, p_activo boolean)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_activo boolean;
  v_ahora timestamptz;
  v_reservas uuid[];
begin
  perform privado.exigir_administrador();

  if p_activo is null then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_activo"}';
  end if;
  if p_profesor_id is null then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_profesor_id::text, 0));

  select p.activo into v_activo from public.profesor p where p.id = p_profesor_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
  end if;

  if v_activo is distinct from p_activo then
    update public.profesor p set activo = p_activo where p.id = p_profesor_id;

    if v_activo and not p_activo then
      v_ahora := public.app_ahora();

      with anuladas as (
        update public.solicitud s
           set estado = 'anulada', respondida_en = v_ahora
         where s.profesor_id = p_profesor_id
           and s.estado = 'pendiente'
        returning s.reserva_id
      )
      select pg_catalog.array_agg(distinct a.reserva_id) into v_reservas
        from anuladas a
       where a.reserva_id is not null;

      if v_reservas is not null then
        with canceladas as (
          update public.reserva r
             set estado = 'cancelada'
           where r.id = any (v_reservas)
             and r.profesor_id = p_profesor_id
             and r.estado = 'pendiente'
          returning r.id
        )
        update public.clase c
           set estado = 'cancelada'
          from canceladas k
         where c.reserva_id = k.id
           and c.profesor_id = p_profesor_id
           and c.estado = 'pendiente';
      end if;
    end if;
  end if;

  return pg_catalog.jsonb_build_object('profesor_id', p_profesor_id, 'activo', p_activo);
end;
$$;
