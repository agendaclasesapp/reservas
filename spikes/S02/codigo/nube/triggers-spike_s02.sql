-- Spike S02 (descartable) en el proyecto real: los mismos triggers de la migración local
-- (20261021000001_s02_triggers_auth.sql), todo en el esquema spike_s02 para no tocar public ni
-- el esquema spike_s01. Se aplica SIN `db push` con `node nube/sql.mjs nube/triggers-spike_s02.sql`.
-- H-003 / SEC-14: vincula o crea solo con email_confirmed_at puesto. Limpieza: nube/limpieza-spike_s02.sql.
create extension if not exists citext with schema extensions;
create schema spike_s02;
revoke all on schema spike_s02 from public, anon, authenticated;

create table spike_s02.profesor (
  id smallint primary key default 1 check (id = 1),
  email extensions.citext not null,
  user_id uuid unique references auth.users (id) on delete set null
);

create table spike_s02.alumno (
  id bigint generated always as identity primary key,
  user_id uuid unique references auth.users (id) on delete cascade,
  email extensions.citext,
  nombre text,
  estado text not null check (estado in ('ficha_incompleta', 'pendiente', 'aprobado', 'rechazado', 'sin_cuenta')),
  ultimo_ingreso timestamptz
);

create table spike_s02.traza_trigger (
  id bigint generated always as identity primary key,
  momento timestamptz not null default now(),
  disparador text not null,
  operacion text not null,
  user_id uuid not null,
  email text,
  confirmado boolean not null,
  accion text not null
);
alter table spike_s02.profesor enable row level security;
alter table spike_s02.alumno enable row level security;
alter table spike_s02.traza_trigger enable row level security;

create function spike_s02.al_confirmar_usuario() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_accion text;
begin
  if new.email_confirmed_at is null then
    v_accion := 'nada: sin confirmar';
  elsif exists (select 1 from spike_s02.profesor p where p.user_id = new.id)
     or exists (select 1 from spike_s02.alumno a where a.user_id = new.id) then
    v_accion := 'nada: ya vinculado';
  else
    update spike_s02.profesor p set user_id = new.id
     where p.user_id is null and p.email = new.email::extensions.citext;
    if found then
      v_accion := 'vincula profesor';
    else
      update spike_s02.alumno a set user_id = new.id
       where a.user_id is null and a.estado = 'aprobado' and a.email = new.email::extensions.citext;
      if found then
        v_accion := 'vincula alumno dado de alta';
      else
        insert into spike_s02.alumno (user_id, email, nombre, estado)
        values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', 'ficha_incompleta');
        v_accion := 'crea alumno ficha_incompleta';
      end if;
    end if;
  end if;
  insert into spike_s02.traza_trigger (disparador, operacion, user_id, email, confirmado, accion)
  values ('al_confirmar_usuario', tg_op, new.id, new.email, new.email_confirmed_at is not null, v_accion);
  return new;
end;
$$;

create function spike_s02.al_ingresar_usuario() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update spike_s02.alumno a set ultimo_ingreso = new.last_sign_in_at where a.user_id = new.id;
  insert into spike_s02.traza_trigger (disparador, operacion, user_id, email, confirmado, accion)
  values ('al_ingresar_usuario', tg_op, new.id, new.email, new.email_confirmed_at is not null,
          case when found then 'actualiza ultimo_ingreso' else 'nada: sin alumno' end);
  return new;
end;
$$;

revoke execute on function spike_s02.al_confirmar_usuario() from public, anon, authenticated;
revoke execute on function spike_s02.al_ingresar_usuario() from public, anon, authenticated;

-- Nombres con prefijo spike_s02_ para no chocar con triggers de otros spikes sobre auth.users.
create trigger spike_s02_al_confirmar_usuario
  after insert or update of email_confirmed_at on auth.users
  for each row execute function spike_s02.al_confirmar_usuario();

create trigger spike_s02_al_ingresar_usuario
  after update of last_sign_in_at on auth.users
  for each row when (new.last_sign_in_at is distinct from old.last_sign_in_at)
  execute function spike_s02.al_ingresar_usuario();

-- Datos ficticios (dominio reservado .test): el profesor no coincide con la casilla de prueba.
insert into spike_s02.profesor (email) values ('profe@rtc.test');
