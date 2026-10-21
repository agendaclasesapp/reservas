-- Spike S03 (descartable): extensiones, esquema mínimo de agenda y RPC agenda_publica.
-- Base para B01 (extensiones) y B02 (clase con exclusión RES-01, huecos_del_dia, agenda_publica ADR-006).

-- 1. Extensiones que el proyecto necesita en local y en producción.
create extension if not exists btree_gist with schema extensions;
create extension if not exists pg_cron;            -- Supabase la instala en el esquema cron
create extension if not exists pg_net with schema extensions;

create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;

-- 2. Tablas mínimas.
create table public.profesor (
  id uuid primary key default gen_random_uuid(),
  zona_horaria text not null default 'America/Montevideo',
  duracion_min int not null default 60 check (duracion_min between 15 and 240)
);

create table public.grilla_tramo (
  id bigint generated always as identity primary key,
  profesor_id uuid not null references public.profesor(id),
  dia_semana smallint not null check (dia_semana between 1 and 7),
  desde time not null,
  hasta time not null check (hasta > desde)
);
create index grilla_tramo_profesor_dia on public.grilla_tramo (profesor_id, dia_semana);

create table public.bloqueo (
  id bigint generated always as identity primary key,
  profesor_id uuid not null references public.profesor(id),
  periodo tstzrange not null,
  motivo text
);
create index bloqueo_gist on public.bloqueo using gist (profesor_id, periodo);

create table public.clase (
  id bigint generated always as identity primary key,
  profesor_id uuid not null references public.profesor(id),
  alumno_id bigint,
  inicio timestamptz not null,
  fin timestamptz not null check (fin > inicio),
  estado text not null check (estado in ('pendiente','confirmada','rechazada','cancelada','movida')),
  -- RES-01: dos clases activas del mismo profesor no se solapan.
  constraint clase_sin_solape exclude using gist (
    profesor_id with =,
    tstzrange(inicio, fin) with &&
  ) where (estado in ('pendiente','confirmada'))
);
create index clase_profesor_inicio on public.clase (profesor_id, inicio);
create index clase_alumno_inicio on public.clase (alumno_id, inicio);

alter table public.profesor enable row level security;
alter table public.grilla_tramo enable row level security;
alter table public.bloqueo enable row level security;
alter table public.clase enable row level security;
revoke all on public.profesor, public.grilla_tramo, public.bloqueo, public.clase from anon, authenticated;

-- 3. Huecos generados (ADR-006): seguidos desde el inicio de cada tramo, sin resto (AGE-02),
--    interpretados en el huso del profesor (ADR-004).
create or replace function privado.huecos_del_dia(p_profesor uuid, p_dia date)
returns table (inicio timestamptz, fin timestamptz)
language sql stable
set search_path = ''
as $$
  select (p_dia + t.desde + make_interval(mins => p.duracion_min * n)) at time zone p.zona_horaria,
         (p_dia + t.desde + make_interval(mins => p.duracion_min * (n + 1))) at time zone p.zona_horaria
  from public.profesor p
  join public.grilla_tramo t
    on t.profesor_id = p.id and t.dia_semana = extract(isodow from p_dia)
  cross join lateral generate_series(
    0,
    (extract(epoch from (t.hasta - t.desde)) / 60)::int / p.duracion_min - 1
  ) as n
  where p.id = p_profesor
  order by 1
$$;

-- 4. Agenda pública (ADR-006, AGE-07): solo inicio, fin, estado. Ejecutable por anon.
create or replace function public.agenda_publica(p_dia date)
returns table (inicio timestamptz, fin timestamptz, estado text)
language sql stable
security definer
set search_path = ''
as $$
  with p as (
    select id, zona_horaria from public.profesor order by id limit 1
  ),
  r as (
    select p.id as profesor_id,
           tstzrange(p_dia::timestamp at time zone p.zona_horaria,
                     (p_dia + 1)::timestamp at time zone p.zona_horaria) as rango
    from p
  ),
  h as (
    select h.inicio, h.fin from p, privado.huecos_del_dia(p.id, p_dia) h
  ),
  c as (
    select c.inicio, c.fin
    from public.clase c, r
    where c.profesor_id = r.profesor_id
      and c.estado in ('pendiente','confirmada')
      and tstzrange(c.inicio, c.fin) && r.rango
  ),
  b as (
    select b.periodo
    from public.bloqueo b, r
    where b.profesor_id = r.profesor_id and b.periodo && r.rango
  )
  select x.inicio, x.fin, x.estado from (
    select h.inicio, h.fin,
           case
             when exists (select 1 from c where tstzrange(c.inicio, c.fin) && tstzrange(h.inicio, h.fin)) then 'ocupado'
             when exists (select 1 from b where b.periodo && tstzrange(h.inicio, h.fin)) then 'bloqueado'
             else 'libre'
           end as estado
    from h
    union all
    -- Clase activa que no solapa ningún hueco generado (fuera de grilla): se muestra ocupada.
    select c.inicio, c.fin, 'ocupado'
    from c
    where not exists (select 1 from h where tstzrange(h.inicio, h.fin) && tstzrange(c.inicio, c.fin))
  ) x
  order by x.inicio
$$;

revoke execute on function public.agenda_publica(date) from public;
grant execute on function public.agenda_publica(date) to anon, authenticated;
revoke execute on function privado.huecos_del_dia(uuid, date) from public;
