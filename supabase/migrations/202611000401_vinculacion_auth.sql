-- B04 · T04.1 · Vinculación de usuarios de Auth con la app y límites de entrada de la ficha.
-- ADR-007 (triggers sobre auth.users, H-003), ADR-013 (revinculación), ADR-015 (profesor), ADR-014
-- (hora), SEC-09, SEC-14, SEC-15, SEC-29. Base probada: spikes/S02/codigo/supabase/migrations/.

-- 1. Límites de entrada (SEC-09) como respaldo de la validación de las RPC. `fecha_nacimiento <= hoy`
--    depende de la hora: lo comprueban las RPC con `app_ahora()`, no un CHECK.
alter table public.alumno
  add constraint alumno_nombre_largo check (char_length(nombre) <= 100),
  add constraint alumno_telefono_formato check (
    char_length(telefono) <= 20
    and telefono ~ '^\+?[0-9 ().-]+$'
    and char_length(regexp_replace(telefono, '[^0-9]', '', 'g')) between 6 and 15
  ),
  add constraint alumno_como_llego_largo check (char_length(como_llego) <= 200),
  add constraint alumno_fecha_nacimiento_minima check (fecha_nacimiento >= date '1900-01-01');

-- SEC-29: la persona a cargo guarda solo nombre y fecha de nacimiento (tabla de B01).
alter table public.persona_a_cargo
  add constraint persona_a_cargo_nombre_largo check (char_length(nombre) <= 100),
  add constraint persona_a_cargo_fecha_nacimiento_minima check (fecha_nacimiento >= date '1900-01-01');

-- 2. Vinculación solo con mail confirmado (SEC-14, H-003). Código y Google crean el usuario sin
--    confirmar y lo confirman en un UPDATE posterior, con `full_name` ya presente (S02); el insert ya
--    confirmado (fixtures) también vincula. Idempotente: un usuario ya vinculado no cambia nada.
--    Es el único lugar que asigna el rol de profesor (SEC-15).
create function privado.al_confirmar_usuario()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_profesor_id uuid;
  v_mail text;
  v_nombre text;
begin
  if new.email_confirmed_at is null or new.email is null or pg_catalog.btrim(new.email) = '' then
    return new;
  end if;
  if exists (select 1 from public.profesor p where p.user_id = new.id)
     or exists (select 1 from public.alumno a where a.user_id = new.id) then
    return new;
  end if;

  select p.id into v_profesor_id from public.profesor p limit 1;
  -- Mismo cerrojo que las RPC de escritura (ADR-002): no compite con un alta de alumno con el mismo mail.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profesor_id::text, 0));
  -- Con search_path vacío `=` entre citext resuelve al de text (distingue mayúsculas): se compara
  -- en minúsculas, como `privado.configurar_profesor` (B01).
  v_mail := pg_catalog.lower(new.email);

  -- Profesor: su mail lo fija `privado.configurar_profesor` (ADR-015).
  update public.profesor p
     set user_id = new.id
   where p.user_id is null
     and pg_catalog.lower(p.mail::text) = v_mail;
  if found then
    return new;
  end if;

  -- Alumno no borrado sin usuario con ese mail: dado de alta por el profesor (ALU-07) o cuyo usuario
  -- de Auth se borró (ADR-013). Se vincula conservando su estado. Una fila anonimizada no tiene mail.
  update public.alumno a
     set user_id = new.id
   where a.user_id is null
     and a.estado <> 'borrado'
     and pg_catalog.lower(a.mail::text) = v_mail;
  if found then
    return new;
  end if;

  -- Cuenta nueva (ALU-02): ficha incompleta con el nombre de Google si vino (recortado a SEC-09).
  v_nombre := nullif(
    pg_catalog.left(
      pg_catalog.btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')),
      100),
    '');
  insert into public.alumno (profesor_id, user_id, estado, nombre, mail)
  values (v_profesor_id, new.id, 'ficha_incompleta', v_nombre, new.email::extensions.citext)
  on conflict (profesor_id, mail) where mail is not null and estado <> 'borrado' do nothing;
  return new;
end;
$$;

-- 3. Último ingreso (ALU-11): en el primer ingreso corre después de la confirmación. La hora sale de
--    `app_ahora()` (ADR-014) para que el plazo de ALU-10 se pruebe con el reloj de prueba.
create function privado.al_ingresar_usuario()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.alumno a
     set ultimo_ingreso = public.app_ahora()
   where a.user_id = new.id;
  return new;
end;
$$;

revoke execute on function privado.al_confirmar_usuario(), privado.al_ingresar_usuario()
  from public, anon, authenticated;

create trigger al_confirmar_usuario
  after insert or update of email_confirmed_at on auth.users
  for each row execute function privado.al_confirmar_usuario();

create trigger al_ingresar_usuario
  after update of last_sign_in_at on auth.users
  for each row
  when (new.last_sign_in_at is distinct from old.last_sign_in_at)
  execute function privado.al_ingresar_usuario();
