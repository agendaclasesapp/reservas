-- B14 · T14.1 · Trigger de Auth con varios profesores, Administrador y persona por mail global.
-- ADR-018 (roles, cerrojo por mail), ADR-007 (triggers sobre auth.users, H-003), ADR-013 (revinculación).
-- IDs: ALU-01, ALU-14, ADM-01, SEC-14. Reemplaza el cuerpo de B04 (202611000401); el trigger
-- `al_confirmar_usuario` (after insert or update of email_confirmed_at) sigue apuntando a esta función.
--
-- Orden (DEC-31): profesor entre N por su mail, después Administrador y, si no es ninguno de los dos,
-- persona por mail global. Profesor y Administrador pueden coincidir: se vinculan los dos. Nadie se registra
-- como profesor: un mail sin alta entra como persona con la ficha incompleta y sin vínculo con nadie
-- (ALU-14, DEC-25: la inscripción nace al completar la ficha desde un enlace, T14.2). Rol y vínculo solo con
-- el mail confirmado (SEC-14). Idempotente: un usuario ya vinculado no cambia nada.
create or replace function privado.al_confirmar_usuario()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_mail text;
  v_nombre text;
  v_es_profesor boolean;
  v_es_administrador boolean;
begin
  if new.email_confirmed_at is null or new.email is null or pg_catalog.btrim(new.email) = '' then
    return new;
  end if;
  if exists (select 1 from public.alumno a where a.user_id = new.id) then
    return new;
  end if;

  -- Con search_path vacío `=` entre citext resuelve al de text: se compara en minúsculas.
  v_mail := pg_catalog.lower(pg_catalog.btrim(new.email));
  -- Cerrojo por mail (ADR-018): no compite con un alta de alumno o de profesor con el mismo mail.
  perform privado.bloquear_mail(v_mail);

  -- Profesor: su fila la crea `configurar_profesor` o `alta_profesor` (B15) con ese mail.
  update public.profesor p
     set user_id = new.id
   where p.user_id is null
     and pg_catalog.lower(p.mail::text) = v_mail;
  v_es_profesor := found or exists (select 1 from public.profesor p where p.user_id = new.id);

  -- Administrador: su mail lo fija `configurar_administrador` (ADM-01).
  update privado.administrador a
     set user_id = new.id
   where a.user_id is null
     and pg_catalog.lower(a.mail::text) = v_mail;
  v_es_administrador := found or exists (select 1 from privado.administrador a where a.user_id = new.id);

  if v_es_profesor or v_es_administrador then
    return new;
  end if;

  -- Persona no borrada sin usuario con ese mail (global): cargada por un profesor (ALU-07) o cuyo usuario de
  -- Auth se borró (ADR-013). Se vincula conservando su ficha y sus inscripciones.
  update public.alumno a
     set user_id = new.id
   where a.user_id is null
     and a.estado <> 'borrado'
     and pg_catalog.lower(a.mail::text) = v_mail;
  if found then
    return new;
  end if;

  -- Cuenta nueva (ALU-02): ficha incompleta sin profesor, con el nombre de Google si vino (SEC-09).
  v_nombre := nullif(
    pg_catalog.left(
      pg_catalog.btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')),
      100),
    '');
  insert into public.alumno (user_id, estado, nombre, mail)
  values (new.id, 'ficha_incompleta', v_nombre, new.email::extensions.citext)
  on conflict (mail) where mail is not null and estado <> 'borrado' do nothing;
  return new;
end;
$$;
