-- B06 · T06.1 · Tabla `solicitud` con RLS por profesor, `v_mis_solicitudes` y el tope de pendientes.
-- componentes.md §3 (`solicitud`), contratos.md §2, ADR-001, ADR-016, ADR-018, ADR-019.
-- IDs: SOL-01, SOL-08, SOL-09, SOL-10, PRF-07, NFR-01, SEC-01..03, SEC-05, SEC-09, SEC-10.
-- Escrituras solo por RPC `security definer` (ADR-002): ninguna política de escritura.

-- 1. Solicitudes de los tres tipos (SOL-01..03). B06 crea las de reserva; B08, movimientos y cancelaciones.
--    `reserva_id`: la reserva pedida (o la destino de un movimiento); `clase_id`: la clase de origen.
--    `fecha_clase`: inicio de la (primera) clase sobre la que trata; con ella se calcula `vencida` (SOL-08).
--    La FK a `alumno` es de una columna, sin cascade y sin unicidad que la incluya (ADR-013, regla de unión).
create table public.solicitud (
  id uuid primary key default gen_random_uuid(),
  profesor_id uuid not null references public.profesor (id),
  alumno_id uuid not null references public.alumno (id),
  tipo text not null check (tipo in ('reserva', 'movimiento', 'cancelacion')),
  alcance text check (alcance in ('solo_esta', 'desde_aca')),
  reserva_id uuid references public.reserva (id),
  clase_id uuid references public.clase (id),
  fecha_clase timestamptz not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'confirmada', 'rechazada', 'anulada')),
  motivo text constraint solicitud_motivo_largo check (pg_catalog.char_length(motivo) <= 500),  -- SEC-09
  creada_en timestamptz not null default public.app_ahora(),
  respondida_en timestamptz,
  constraint solicitud_reserva_con_reserva check (tipo <> 'reserva' or (reserva_id is not null and alcance is null)),
  constraint solicitud_sobre_clase check (tipo = 'reserva' or (clase_id is not null and alcance is not null))
);

-- Una sola solicitud pendiente por clase (componentes.md §3; SOLICITUD_EN_CURSO de B08).
create unique index solicitud_pendiente_por_clase on public.solicitud (clase_id)
  where estado = 'pendiente' and clase_id is not null;
-- Tope de SOL-10 y lista de pendientes del profesor (PRF-06, B07) por fecha de la clase.
create index solicitud_alumno_profesor_pendiente on public.solicitud (alumno_id, profesor_id, fecha_clase)
  where estado = 'pendiente';
create index solicitud_profesor_estado on public.solicitud (profesor_id, estado, fecha_clase);
create index solicitud_reserva on public.solicitud (reserva_id) where reserva_id is not null;

-- 2. RLS (NFR-01, PRF-07, SOL-09, ADR-018): el profesor, las suyas; la persona, las suyas con todos sus
--    profesores. `anon` sin acceso.
alter table public.solicitud enable row level security;

revoke all on public.solicitud from public, anon, authenticated;
grant select on public.solicitud to authenticated;

create policy solicitud_lectura on public.solicitud
  for select to authenticated
  using (profesor_id = (select privado.mi_profesor_id())
         or alumno_id = (select privado.mi_alumno_id()));

-- 3. `v_mis_solicitudes` (alumno, contratos.md §2): sus solicitudes de todos sus profesores con `profesor_id`
--    y `vencida` (pendiente cuyo horario ya pasó, SOL-08, DEC-09). Un profesor no ve nada por esta vista:
--    filtra por la persona de la sesión. Hereda la RLS de `solicitud` (SEC-05).
create view public.v_mis_solicitudes
with (security_invoker = true) as
select s.id,
       s.profesor_id,
       s.tipo,
       s.alcance,
       s.estado,
       (s.estado = 'pendiente' and s.fecha_clase <= public.app_ahora()) as vencida,
       s.fecha_clase,
       s.reserva_id,
       s.clase_id,
       s.motivo,
       s.creada_en,
       s.respondida_en
  from public.solicitud s
 where s.alumno_id = (select privado.mi_alumno_id());

revoke all on public.v_mis_solicitudes from public, anon, authenticated;
grant select on public.v_mis_solicitudes to authenticated;

-- 4. Tope de SOL-10 (ADR-016, ADR-019, DEC-27): pendientes no vencidas de los tres tipos de la persona con
--    ese profesor. Una vencida no cuenta (no se puede responder). Lo usan `solicitar_reserva` (B06) y
--    `solicitar_movimiento` / `solicitar_cancelacion` (B08).
create function privado.contar_pendientes(p_alumno_id uuid, p_profesor_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select pg_catalog.count(*)::integer
    from public.solicitud s
   where s.alumno_id = p_alumno_id
     and s.profesor_id = p_profesor_id
     and s.estado = 'pendiente'
     and s.fecha_clase > public.app_ahora()
$$;

-- 429 `LIMITE_EXCEDIDO` `{"tope":"pendientes","limite":N}` con N = `privado.ajustes.tope_pendientes` (10).
-- Las RPC la llaman tras validar rol y vínculo y antes de tocar huecos: no se crea nada (SEC-10).
create function privado.exigir_tope_pendientes(p_alumno_id uuid, p_profesor_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tope integer;
begin
  select a.tope_pendientes into v_tope from privado.ajustes a;
  if v_tope is not null and privado.contar_pendientes(p_alumno_id, p_profesor_id) >= v_tope then
    raise exception using errcode = 'PT429', message = 'LIMITE_EXCEDIDO',
      detail = pg_catalog.jsonb_build_object('tope', 'pendientes', 'limite', v_tope)::text;
  end if;
end;
$$;

revoke execute on function
  privado.contar_pendientes(uuid, uuid),
  privado.exigir_tope_pendientes(uuid, uuid)
  from public, anon, authenticated;
