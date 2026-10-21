-- Spike S02 (descartable). Triggers sobre auth.users de ADR-007: vinculación solo con mail
-- confirmado (H-003, SEC-14) y último ingreso (ALU-11). Esquema mínimo, no el de B01/B04.
create extension if not exists citext with schema extensions;
create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;

create table public.profesor (
  id smallint primary key default 1 check (id = 1),
  email extensions.citext not null,
  user_id uuid unique references auth.users (id)
);

create table public.alumno (
  id bigint generated always as identity primary key,
  user_id uuid unique references auth.users (id),
  email extensions.citext,
  nombre text,
  estado text not null check (estado in ('ficha_incompleta', 'pendiente', 'aprobado', 'rechazado', 'sin_cuenta')),
  ultimo_ingreso timestamptz
);
alter table public.profesor enable row level security;
alter table public.alumno enable row level security;

-- Traza del spike: cada disparo deja qué hizo, para probar que sin confirmar no hace nada.
create table privado.traza_trigger (
  id bigint generated always as identity primary key,
  disparador text not null,
  operacion text not null,
  user_id uuid not null,
  confirmado boolean not null,
  accion text not null
);

create function privado.al_confirmar_usuario() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_accion text;
begin
  if new.email_confirmed_at is null then
    v_accion := 'nada: sin confirmar';
  elsif exists (select 1 from public.profesor p where p.user_id = new.id)
     or exists (select 1 from public.alumno a where a.user_id = new.id) then
    v_accion := 'nada: ya vinculado';
  else
    update public.profesor p set user_id = new.id
     where p.user_id is null and p.email = new.email::extensions.citext;
    if found then
      v_accion := 'vincula profesor';
    else
      update public.alumno a set user_id = new.id
       where a.user_id is null and a.estado = 'aprobado' and a.email = new.email::extensions.citext;
      if found then
        v_accion := 'vincula alumno dado de alta';
      else
        insert into public.alumno (user_id, email, nombre, estado)
        values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', 'ficha_incompleta');
        v_accion := 'crea alumno ficha_incompleta';
      end if;
    end if;
  end if;
  insert into privado.traza_trigger (disparador, operacion, user_id, confirmado, accion)
  values ('al_confirmar_usuario', tg_op, new.id, new.email_confirmed_at is not null, v_accion);
  return new;
end;
$$;

create function privado.al_ingresar_usuario() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.alumno a set ultimo_ingreso = new.last_sign_in_at where a.user_id = new.id;
  insert into privado.traza_trigger (disparador, operacion, user_id, confirmado, accion)
  values ('al_ingresar_usuario', tg_op, new.id, new.email_confirmed_at is not null,
          case when found then 'actualiza ultimo_ingreso' else 'nada: sin alumno' end);
  return new;
end;
$$;

revoke execute on function privado.al_confirmar_usuario() from public, anon, authenticated;
revoke execute on function privado.al_ingresar_usuario() from public, anon, authenticated;

create trigger al_confirmar_usuario
  after insert or update of email_confirmed_at on auth.users
  for each row execute function privado.al_confirmar_usuario();

create trigger al_ingresar_usuario
  after update of last_sign_in_at on auth.users
  for each row when (new.last_sign_in_at is distinct from old.last_sign_in_at)
  execute function privado.al_ingresar_usuario();
