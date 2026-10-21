-- B01 · T01.2 · Tablas `profesor`, `alumno` y `persona_a_cargo`, funciones de rol y RLS base.
-- ADR-001 (RLS), ADR-013 (alumnos), ADR-015 (alta del profesor), SEC-01, SEC-02, SEC-03, SEC-14.

-- 1. Profesor: fila única creada aquí, sin datos personales (mail y nombre nulos hasta
--    `privado.configurar_profesor`, ADR-015). Configuración de AGE-02, AGE-04 y AGE-08.
create table public.profesor (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  nombre text,
  mail extensions.citext,
  zona_horaria text not null default 'America/Montevideo',
  duracion_min integer not null default 60 check (duracion_min > 0),
  anticipacion_horas integer not null default 24 check (anticipacion_horas >= 0),
  horizonte_semanas integer not null default 26 check (horizonte_semanas > 0)
);

-- Índice único sobre una constante: impide una segunda fila (ADR-015).
create unique index profesor_fila_unica on public.profesor ((true));

insert into public.profesor default values;

-- 2. Alumno: titulares con cuenta y alumnos sin cuenta en una tabla (ADR-013).
create table public.alumno (
  id uuid primary key default gen_random_uuid(),
  profesor_id uuid not null references public.profesor (id),
  user_id uuid unique references auth.users (id) on delete set null,
  estado text not null default 'ficha_incompleta'
    check (estado in ('ficha_incompleta', 'pendiente', 'aprobado', 'rechazado', 'sin_cuenta', 'borrado')),
  nombre text,
  mail extensions.citext,
  telefono text,
  -- DEC-03 a: últimos 8 dígitos tras quitar todo lo que no es dígito.
  telefono_clave text generated always as (
    nullif(right(regexp_replace(coalesce(telefono, ''), '[^0-9]', '', 'g'), 8), '')
  ) stored,
  fecha_nacimiento date,
  como_llego text,
  motivo_estado text,            -- motivo de rechazo visible para la cuenta (ALU-03)
  ficha_completada_en timestamptz,  -- ALU-13; no es dato personal y sobrevive a la anonimización
  creado_en timestamptz not null default public.app_ahora(),
  aprobado_en timestamptz,
  ultimo_ingreso timestamptz,
  aviso_inactividad_en timestamptz,
  borrado_en timestamptz
);

-- Mail único por profesor entre no borrados.
create unique index alumno_mail_unico on public.alumno (profesor_id, mail)
  where mail is not null and estado <> 'borrado';
create index alumno_telefono_clave on public.alumno (profesor_id, telefono_clave)
  where telefono_clave is not null;
create index alumno_ficha_completada_en on public.alumno (profesor_id, ficha_completada_en)
  where ficha_completada_en is not null;

-- 3. Persona a cargo (ALU-06).
create table public.persona_a_cargo (
  id uuid primary key default gen_random_uuid(),
  profesor_id uuid not null references public.profesor (id),
  alumno_id uuid not null references public.alumno (id),
  nombre text not null,
  fecha_nacimiento date
);

create index persona_a_cargo_alumno on public.persona_a_cargo (alumno_id);

-- 4. Funciones de rol (ADR-001). Las dos exigen el mail confirmado del usuario de la sesión (SEC-14).
create function privado.es_profesor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profesor p
      join auth.users u on u.id = p.user_id
     where p.user_id = auth.uid()
       and u.email_confirmed_at is not null
  )
$$;

create function privado.mi_alumno_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.id
    from public.alumno a
    join auth.users u on u.id = a.user_id
   where a.user_id = auth.uid()
     and u.email_confirmed_at is not null
$$;

-- Las políticas de RLS se evalúan con los permisos de quien consulta: `authenticated` necesita
-- ejecutar estas dos funciones. `privado` no está expuesto por PostgREST, así que no son RPC.
grant usage on schema privado to authenticated;
revoke execute on function privado.es_profesor(), privado.mi_alumno_id() from public, anon;
grant execute on function privado.es_profesor(), privado.mi_alumno_id() to authenticated;

-- 5. RLS (SEC-01, SEC-02, SEC-03): solo lectura para `authenticated`; ninguna política de escritura,
--    toda escritura va por RPC `security definer` (ADR-002). `anon` no recibe nada.
alter table public.profesor enable row level security;
alter table public.alumno enable row level security;
alter table public.persona_a_cargo enable row level security;

revoke all on public.profesor, public.alumno, public.persona_a_cargo from public, anon, authenticated;
grant select on public.profesor, public.alumno, public.persona_a_cargo to authenticated;

create policy profesor_lectura on public.profesor
  for select to authenticated
  using ((select privado.es_profesor()));

create policy alumno_lectura on public.alumno
  for select to authenticated
  using ((select privado.es_profesor()) or id = (select privado.mi_alumno_id()));

create policy persona_a_cargo_lectura on public.persona_a_cargo
  for select to authenticated
  using ((select privado.es_profesor()) or alumno_id = (select privado.mi_alumno_id()));
