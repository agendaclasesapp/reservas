-- B01 · T01.2 · Ajustes de la aplicación y reloj (ADR-014, ADR-016).

-- 1. Ajustes: una sola fila. Los topes anti-abuso son datos de la spec (§6, CR-001): no hay RPC que
--    los cambie; un cambio es un CR más una migración (ADR-016). El reloj de prueba nace apagado y
--    ninguna migración lo enciende: solo `supabase/seed.sql` (local y CI).
create table privado.ajustes (
  id smallint primary key default 1 check (id = 1),
  permitir_reloj_prueba boolean not null default false,
  tope_pendientes_alumno integer not null check (tope_pendientes_alumno > 0),  -- SOL-10
  tope_mails_hora integer not null check (tope_mails_hora > 0),                -- AVI-08
  tope_mails_dia integer not null check (tope_mails_dia > 0),                  -- AVI-08
  tope_fichas_hora integer not null check (tope_fichas_hora > 0)               -- ALU-13
);

insert into privado.ajustes (tope_pendientes_alumno, tope_mails_hora, tope_mails_dia, tope_fichas_hora)
values (5, 20, 200, 10);

-- 2. Reloj de prueba: una sola fila; `ahora` nulo = hora real.
create table privado.reloj_prueba (
  id smallint primary key default 1 check (id = 1),
  ahora timestamptz
);

insert into privado.reloj_prueba (ahora) values (null);

revoke all on privado.ajustes, privado.reloj_prueba from public, anon, authenticated;

-- 3. Única fuente de hora de las reglas de negocio (ADR-014). Es el único lugar del esquema que lee
--    la hora del servidor.
create function public.app_ahora()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select r.ahora
       from privado.reloj_prueba r
       cross join privado.ajustes a
      where a.permitir_reloj_prueba
      limit 1),
    pg_catalog.now()
  )
$$;

revoke execute on function public.app_ahora() from public, anon;
grant execute on function public.app_ahora() to authenticated;
