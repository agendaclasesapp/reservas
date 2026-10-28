-- B14 · T14.1 · Expansión del modelo a varios profesores con los datos de B05 (ADR-018, ADR-021 pasos 2 y 3).
-- IDs: ADM-01, ALU-01, ALU-14, AGE-09, AGE-10, AGE-11, NFR-01. Las migraciones de B01 a B05 no se tocan.
-- Todo el archivo corre en una transacción (la CLI aplica cada migración en un lote): si una comprobación
-- falla, nada queda aplicado. Las columnas viejas de `alumno` (`profesor_id`, `motivo_estado`,
-- `aprobado_en`, `como_llego`) y `persona_a_cargo.profesor_id` quedan sin uso y las borra la contracción
-- de B15 (T15.4).

-- 0. Foto del estado de B05 y comprobaciones previas (ADR-021 §3). Se usa una tabla temporal explícita
--    (no `on commit drop`) para que el archivo también corra igual con psql en modo autocommit.
create temp table t14_antes as
select (select count(*) from public.profesor) as profesores,
       (select p.id from public.profesor p order by p.id limit 1) as profesor_id,
       (select p.user_id from public.profesor p order by p.id limit 1) as profesor_user_id,
       (select p.mail is not null from public.profesor p order by p.id limit 1) as profesor_configurado,
       (select count(*) from public.alumno a
         where a.estado in ('pendiente', 'aprobado', 'rechazado', 'sin_cuenta')) as vinculos,
       (select count(*) from public.alumno a) as alumnos;

do $$
declare
  v t14_antes%rowtype;
begin
  select * into v from t14_antes;
  if v.profesores <> 1 then
    raise exception using errcode = 'P0004',
      message = 'ADR-021: se esperaba una sola fila de profesor antes de expandir y hay ' || v.profesores;
  end if;
  -- Instalación sin la puesta en marcha (fila sin mail, como la deja B01 antes de `seed.sql`): la fila no
  -- tiene datos personales ni de nadie más; se borra con su grilla semilla y cada profesor nace después
  -- con `privado.configurar_profesor(p_mail, p_nombre, p_slug)` (seed) o `alta_profesor` (B15).
  if not v.profesor_configurado then
    if exists (select 1 from public.alumno a where a.profesor_id = v.profesor_id)
       or exists (select 1 from public.persona_a_cargo x where x.profesor_id = v.profesor_id)
       or exists (select 1 from public.bloqueo b where b.profesor_id = v.profesor_id)
       or exists (select 1 from public.reserva r where r.profesor_id = v.profesor_id)
       or exists (select 1 from public.clase c where c.profesor_id = v.profesor_id)
       or exists (select 1 from public.mail_salida m where m.profesor_id = v.profesor_id) then
      raise exception using errcode = 'P0004',
        message = 'ADR-021: la fila de profesor no tiene mail pero tiene datos; correr privado.configurar_profesor antes de migrar';
    end if;
    delete from public.grilla_tramo g where g.profesor_id = v.profesor_id;
    delete from public.profesor p where p.id = v.profesor_id;
  end if;
  -- Ningún mail de alumno repetido entre no borrados (el índice pasa a ser global, ADR-018).
  if exists (select 1 from public.alumno a
              where a.mail is not null and a.estado <> 'borrado'
              group by pg_catalog.lower(a.mail::text) having count(*) > 1) then
    raise exception using errcode = 'P0004', message = 'ADR-021: hay mails de alumno repetidos entre no borrados';
  end if;
end;
$$;

-- 1. Ajustes (ADR-016, ADR-019, DEC-27). El tope de pendientes pasa a 10 por alumno y por profesor (SOL-10,
--    lo aplica B06); el de mails por día suma uno global; la ficha valida fechas en el huso de la app.
alter table privado.ajustes rename column tope_pendientes_alumno to tope_pendientes;
alter table privado.ajustes rename constraint ajustes_tope_pendientes_alumno_check to ajustes_tope_pendientes_check;
alter table privado.ajustes
  add column tope_mails_dia_global integer not null default 400 check (tope_mails_dia_global > 0),
  add column zona_horaria_app text not null default 'America/Montevideo'
    check (pg_catalog.btrim(zona_horaria_app) <> '');
update privado.ajustes set tope_pendientes = 10;

-- 2. Slug (ADM-02): 3 a 30 caracteres, minúsculas, dígitos y guiones sin guion en los bordes, fuera de la
--    lista reservada de ADR-018. Única regla: la usan el CHECK de `profesor` y las RPC (T14.2, B15), que
--    responden 422 o 404 según el caso. No es ejecutable por la API (SEC-04).
create function privado.slug_valido(p_slug text)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select p_slug is not null
     and pg_catalog.char_length(p_slug) between 3 and 30
     and p_slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
     and p_slug <> all (array['admin', 'p', 'ingreso', 'ficha', 'mis-clases', 'panel', 'lista',
                              'configuracion', 'inicio', 'api', 'reservas', 'soporte', 'ayuda'])
$$;

revoke execute on function privado.slug_valido(text) from public, anon, authenticated;

-- 3. Profesor con N filas (ADR-018). Sin el índice de fila única de ADR-015.
drop index public.profesor_fila_unica;

alter table public.profesor
  add column slug extensions.citext,
  add column slug_provisional boolean not null default false,
  add column activo boolean not null default true,       -- AGE-11, PRF-08; lo cambia B15 (ADM-05)
  add column creado_en timestamptz not null default public.app_ahora();

-- Slug provisional del profesor que ya existe (ADR-021 §2): sin datos personales en el repositorio; el
-- Administrador fija el definitivo al adoptarlo en B15.
update public.profesor p
   set slug = 'p-' || pg_catalog.left(pg_catalog.replace(p.id::text, '-', ''), 8),
       slug_provisional = true,
       activo = true;

alter table public.profesor
  alter column slug set not null,
  alter column mail set not null,
  add constraint profesor_slug_unico unique (slug),
  add constraint profesor_slug_valido check (privado.slug_valido(slug::text)),
  add constraint profesor_mail_unico unique (mail),
  add constraint profesor_nombre_largo check (pg_catalog.char_length(nombre) <= 100);

-- 4. Administrador (ADM-01, ADR-018): una sola fila, fuera de la API. El mail lo carga el operador con
--    `privado.configurar_administrador(p_mail)`; el `user_id` lo pone el trigger de Auth con el mail
--    confirmado (SEC-14). Puede ser además profesor (DEC-31).
create table privado.administrador (
  mail extensions.citext primary key,
  user_id uuid unique references auth.users (id) on delete set null,
  creado_en timestamptz not null default public.app_ahora()
);

create unique index administrador_fila_unica on privado.administrador ((true));

revoke all on privado.administrador from public, anon, authenticated;

-- 5. Alumno = persona: ficha única para todos sus profesores (ALU-02, ALU-14, ADR-018).
alter table public.alumno
  alter column profesor_id drop not null,
  add column creado_por uuid references public.profesor (id),               -- profesor que la cargó (DEC-32)
  add column ficha_origen_profesor_id uuid references public.profesor (id); -- enlace al completar (ALU-13)
alter table public.persona_a_cargo alter column profesor_id drop not null;
alter table public.alumno drop constraint alumno_estado_check;

-- 6. Inscripción: el vínculo de la persona con cada profesor (ALU-03, ALU-14, DEC-25, DEC-33).
create table public.inscripcion (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references public.alumno (id),
  profesor_id uuid not null references public.profesor (id),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aprobado', 'rechazado', 'sin_cuenta', 'baja')),
  motivo_estado text constraint inscripcion_motivo_estado_largo check (pg_catalog.char_length(motivo_estado) <= 500),
  como_llego text constraint inscripcion_como_llego_largo check (pg_catalog.char_length(como_llego) <= 200),
  creado_en timestamptz not null default public.app_ahora(),
  aprobado_en timestamptz,
  constraint inscripcion_unica unique (alumno_id, profesor_id)
);

create index inscripcion_profesor_estado on public.inscripcion (profesor_id, estado);

-- 7. Datos (ADR-021 §2): una inscripción por cada alumno con estado de vínculo de B05; la ficha pasa a los
--    estados de persona. Quien completó la ficha (B04) llegó por la agenda del único profesor: ese es su
--    profesor de origen. Quien no la completó y está aprobado o sin cuenta lo cargó el profesor (B05).
insert into public.inscripcion (alumno_id, profesor_id, estado, motivo_estado, como_llego, creado_en, aprobado_en)
select a.id, a.profesor_id, a.estado, a.motivo_estado, a.como_llego,
       coalesce(a.ficha_completada_en, a.creado_en), a.aprobado_en
  from public.alumno a
 where a.estado in ('pendiente', 'aprobado', 'rechazado', 'sin_cuenta');

update public.alumno a
   set ficha_origen_profesor_id = case
         when a.ficha_completada_en is not null and a.estado in ('pendiente', 'aprobado', 'rechazado')
           then a.profesor_id end,
       creado_por = case
         when a.ficha_completada_en is null and a.estado in ('aprobado', 'sin_cuenta')
           then a.profesor_id end,
       estado = case
         when a.estado in ('pendiente', 'aprobado', 'rechazado', 'sin_cuenta') then 'completa'
         else a.estado end;

alter table public.alumno
  add constraint alumno_estado_check check (estado in ('ficha_incompleta', 'completa', 'borrado'));

-- Mail único global entre no borrados (ADR-018): una persona, una cuenta.
drop index public.alumno_mail_unico;
create unique index alumno_mail_unico on public.alumno (mail)
  where mail is not null and estado <> 'borrado';
-- Tope de fichas por profesor de origen y cupo sin enlace (ALU-13, T14.2) y unión por teléfono (ALU-04).
create index alumno_ficha_origen on public.alumno (ficha_origen_profesor_id, ficha_completada_en)
  where ficha_completada_en is not null;
create index alumno_telefono_clave_persona on public.alumno (telefono_clave)
  where telefono_clave is not null;

-- 8. Mails (ADR-019): remitente con el nombre del profesor y Reply-To a su mail; `profesor_id` nulo para los
--    mails de la aplicación. Sin saltos de línea ni controles (SEC-11): la Edge Function arma las cabeceras.
alter table public.mail_salida
  alter column profesor_id drop not null,
  add column remitente_nombre text
    constraint mail_salida_remitente_nombre_valido
    check (pg_catalog.char_length(remitente_nombre) <= 200 and remitente_nombre !~ '[[:cntrl:]]'),
  add column responder_a text
    constraint mail_salida_responder_a_valido
    check (pg_catalog.char_length(responder_a) <= 320 and responder_a !~ '[[:cntrl:]]');
-- Tope global por día (AVI-08, `TOPE_GLOBAL`).
create index mail_salida_creado on public.mail_salida (creado_en);

-- 9. Comprobaciones posteriores (ADR-021 §3). Cualquier falla revierte todo el archivo.
do $$
declare
  v t14_antes%rowtype;
begin
  select * into v from t14_antes;
  if (select count(*) from public.inscripcion) <> v.vinculos then
    raise exception using errcode = 'P0004', message = 'ADR-021: no hay tantas inscripciones como alumnos con vínculo';
  end if;
  if (select count(*) from public.alumno) <> v.alumnos then
    raise exception using errcode = 'P0004', message = 'ADR-021: cambió la cantidad de alumnos';
  end if;
  if exists (select 1 from public.inscripcion i join public.alumno a on a.id = i.alumno_id
              where a.estado <> 'completa') then
    raise exception using errcode = 'P0004', message = 'ADR-021: una inscripción apunta a una ficha no completa';
  end if;
  if v.profesor_configurado then
    if (select count(*) from public.profesor) <> 1
       or not exists (select 1 from public.profesor p
                       where p.id = v.profesor_id
                         and p.user_id is not distinct from v.profesor_user_id
                         and p.slug_provisional) then
      raise exception using errcode = 'P0004', message = 'ADR-021: el profesor existente no conservó su user_id o su slug provisional';
    end if;
  elsif exists (select 1 from public.profesor) then
    raise exception using errcode = 'P0004', message = 'ADR-021: quedó una fila de profesor sin configurar';
  end if;
end;
$$;

drop table t14_antes;
