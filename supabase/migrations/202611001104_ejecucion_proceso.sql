-- B11 · T11.1 (segunda parte) · Registro de cada corrida de los procesos programados.
-- IDs: SEC-28, ALU-10, AVI-05, AVI-06. ADR-011 (cada corrida de `retencion` y `recordatorios` deja una fila con
-- nombre, inicio, fin, ok, error y cantidades), ADR-008 (jobs de pg_cron), H-014 (revisión semanal, T11.4).
-- Tabla y funciones de `privado`: no son API (ni `anon` ni `authenticated` leen ni ejecutan nada de esto).

-- 1. `privado.ejecucion_proceso`. Una fila por corrida, con o sin error.
--    - `ahora`: el instante de negocio de la corrida (`p_ahora`, que en pg_cron es `app_ahora()`, ADR-014).
--    - `inicio` y `fin`: hora real del servidor (`clock_timestamp()`), para que el runbook vea cuándo corrió y
--      cuánto tardó aunque el reloj de prueba esté activo. No interviene en ninguna regla de negocio.
--    - `error`: SQLSTATE y mensaje, sin `DETAIL` ni `CONTEXT` (pueden traer valores de filas: SEC-17, SEC-29).
create table privado.ejecucion_proceso (
  id bigint generated always as identity primary key,
  nombre text not null check (nombre in ('retencion', 'recordatorios')),
  ahora timestamptz not null,
  inicio timestamptz not null,
  fin timestamptz not null,
  ok boolean not null,
  error text,
  cantidades jsonb not null default '{}'::jsonb,
  constraint ejecucion_proceso_error check (ok = (error is null)),
  constraint ejecucion_proceso_orden check (fin >= inicio)
);

create index ejecucion_proceso_nombre_inicio on privado.ejecucion_proceso (nombre, inicio desc);

revoke all on privado.ejecucion_proceso from public, anon, authenticated;

-- 2. `privado.registrar_ejecucion(...)`: inserta la fila de una corrida y devuelve el jsonb que la función del
--    proceso devuelve al llamador: `{"ok": true, ...cantidades}` o `{"ok": false, "error": "<SQLSTATE>: <mensaje>"}`.
create function privado.registrar_ejecucion(
  p_nombre text,
  p_ahora timestamptz,
  p_inicio timestamptz,
  p_cantidades jsonb,
  p_error text
)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_error text := pg_catalog.left(p_error, 500);
begin
  insert into privado.ejecucion_proceso (nombre, ahora, inicio, fin, ok, error, cantidades)
  values (p_nombre, p_ahora, p_inicio, pg_catalog.clock_timestamp(), v_error is null, v_error,
          case when v_error is null then coalesce(p_cantidades, '{}'::jsonb) else '{}'::jsonb end);

  if v_error is null then
    return pg_catalog.jsonb_build_object('ok', true) || coalesce(p_cantidades, '{}'::jsonb);
  end if;
  return pg_catalog.jsonb_build_object('ok', false, 'error', v_error);
end;
$$;

revoke execute on function privado.registrar_ejecucion(text, timestamptz, timestamptz, jsonb, text)
  from public, anon, authenticated;
