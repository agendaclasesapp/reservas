-- B02 · T02.1 · Tablas de agenda: `grilla_tramo` (semilla AGE-01), `bloqueo`, `reserva` y `clase` con la
-- exclusión de RES-01, y su RLS de lectura (NFR-01, SEC-01..03). componentes.md §3, ADR-002, ADR-003, ADR-004.
-- Escrituras solo por RPC `security definer` (ADR-002): ninguna política de escritura.

-- 1. Grilla semanal (AGE-01): horas locales en el huso del profesor (ADR-004). `hasta` admite 24:00.
create table public.grilla_tramo (
  id uuid primary key default gen_random_uuid(),
  profesor_id uuid not null references public.profesor (id),
  dia_semana smallint not null check (dia_semana between 1 and 7),  -- ISO: 1 = lunes
  desde time not null,
  hasta time not null,
  constraint grilla_tramo_orden check (hasta > desde),
  -- Tramos del mismo día sin solaparse (componentes.md §3); se tocan en el borde sin solapar.
  constraint grilla_tramo_sin_solape exclude using gist (
    profesor_id with =,
    dia_semana with =,
    tsrange(date '2000-01-01' + desde, date '2000-01-01' + hasta, '[)') with &&
  )
);

-- Semilla AGE-01: lunes a viernes de 08:00 a 13:00 y de 14:00 a 18:00.
insert into public.grilla_tramo (profesor_id, dia_semana, desde, hasta)
select p.id, d.dia, t.desde, t.hasta
  from public.profesor p
 cross join generate_series(1, 5) as d (dia)
 cross join (values (time '08:00', time '13:00'), (time '14:00', time '18:00')) as t (desde, hasta);

-- 2. Bloqueos (AGE-05, AGE-06; los escribe B10). Período semiabierto `[)`; un día completo = 00:00 a 00:00 local.
create table public.bloqueo (
  id uuid primary key default gen_random_uuid(),
  profesor_id uuid not null references public.profesor (id),
  periodo tstzrange not null,
  motivo text check (char_length(motivo) <= 500),  -- SEC-09
  constraint bloqueo_periodo_valido check (
    not isempty(periodo)
    and lower_inc(periodo) and not upper_inc(periodo)
    and not lower_inf(periodo) and not upper_inf(periodo)
  )
);

create index bloqueo_profesor_periodo on public.bloqueo using gist (profesor_id, periodo);

-- 3. Reservas: la regla de una clase suelta o de una serie (RES-02..04, ADR-003; las escriben B06+).
create table public.reserva (
  id uuid primary key default gen_random_uuid(),
  profesor_id uuid not null references public.profesor (id),
  alumno_id uuid not null references public.alumno (id),
  persona_a_cargo_id uuid references public.persona_a_cargo (id),
  tipo text not null check (tipo in ('suelta', 'serie')),
  frecuencia_semanas smallint check (frecuencia_semanas in (1, 2)),
  hora_local time not null,
  dia_semana smallint not null check (dia_semana between 1 and 7),
  duracion_min integer not null check (duracion_min > 0),
  observacion text check (char_length(observacion) <= 500),  -- SEC-09
  estado text not null check (estado in ('pendiente', 'confirmada', 'rechazada', 'cancelada')),
  desde date not null,
  hasta date,                    -- fin de la serie; nulo = sin fin
  materializada_hasta date,
  origen text not null check (origen in ('solicitud', 'profesor')),
  reserva_origen_id uuid references public.reserva (id),
  constraint reserva_serie_con_frecuencia check (tipo = 'suelta' or frecuencia_semanas is not null),
  constraint reserva_hasta_orden check (hasta is null or hasta >= desde)
);

create index reserva_profesor on public.reserva (profesor_id);
create index reserva_alumno on public.reserva (alumno_id);

-- 4. Clases: cada fecha materializada (ADR-003).
create table public.clase (
  id uuid primary key default gen_random_uuid(),
  profesor_id uuid not null references public.profesor (id),
  reserva_id uuid not null references public.reserva (id),
  alumno_id uuid not null references public.alumno (id),
  persona_a_cargo_id uuid references public.persona_a_cargo (id),
  inicio timestamptz not null,
  fin timestamptz not null,
  estado text not null check (estado in ('pendiente', 'confirmada', 'rechazada', 'cancelada', 'movida')),
  confirmada_en timestamptz,
  movida_a uuid references public.clase (id),
  recordatorio_en timestamptz,
  constraint clase_orden check (fin > inicio),
  -- RES-01 (ADR-002): dos clases activas del profesor no se solapan, aunque cambie la duración (AGE-03).
  -- `agenda_publica` lee con este mismo predicado para usar el gist parcial (ADR-006, S03).
  constraint clase_sin_solape exclude using gist (
    profesor_id with =,
    tstzrange(inicio, fin, '[)') with &&
  ) where (estado in ('pendiente', 'confirmada'))
);

create index clase_profesor_inicio on public.clase (profesor_id, inicio);
create index clase_alumno_inicio on public.clase (alumno_id, inicio);
create index clase_reserva on public.clase (reserva_id);

-- 5. RLS (NFR-01, contratos.md §2): `anon` sin acceso; grilla y bloqueos solo el profesor;
--    reservas y clases el profesor todas y el alumno las de su `alumno_id`.
alter table public.grilla_tramo enable row level security;
alter table public.bloqueo enable row level security;
alter table public.reserva enable row level security;
alter table public.clase enable row level security;

revoke all on public.grilla_tramo, public.bloqueo, public.reserva, public.clase from public, anon, authenticated;
grant select on public.grilla_tramo, public.bloqueo, public.reserva, public.clase to authenticated;

create policy grilla_tramo_lectura on public.grilla_tramo
  for select to authenticated
  using ((select privado.es_profesor()));

create policy bloqueo_lectura on public.bloqueo
  for select to authenticated
  using ((select privado.es_profesor()));

create policy reserva_lectura on public.reserva
  for select to authenticated
  using ((select privado.es_profesor()) or alumno_id = (select privado.mi_alumno_id()));

create policy clase_lectura on public.clase
  for select to authenticated
  using ((select privado.es_profesor()) or alumno_id = (select privado.mi_alumno_id()));
