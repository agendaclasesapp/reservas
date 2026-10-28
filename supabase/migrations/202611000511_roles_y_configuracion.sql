-- B14 · T14.1 · Funciones de rol, cerrojo por mail, profesor activo y configuración por el operador.
-- ADR-018 (roles, cerrojos, profesor inactivo, fila del profesor; reemplaza ADR-015), ADR-001, SEC-04, SEC-14.
-- IDs: ADM-01, ADM-04, AGE-11, PRF-07, NFR-01, SEC-04, SEC-14.

-- 1. Rol de profesor (ADR-018): la única fuente de «qué profesor soy» para la RLS y las RPC. Exige el mail
--    confirmado (SEC-14). No mira `activo`: el profesor inactivo sigue leyendo lo suyo (PRF-08).
create function privado.mi_profesor_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
    from public.profesor p
    join auth.users u on u.id = p.user_id
   where p.user_id = auth.uid()
     and u.email_confirmed_at is not null
$$;

-- La RLS se evalúa con los permisos de quien consulta: `authenticated` la ejecuta, como `es_profesor` y
-- `mi_alumno_id` (SEC-04, excepción con nombre de ADR-001; la lista de 00_catalogo la suma en T14.5).
revoke execute on function privado.mi_profesor_id() from public, anon;
grant execute on function privado.mi_profesor_id() to authenticated;

-- `es_profesor()` queda como atajo de `mi_profesor_id()` (ADR-018) para las RPC de B02 a B05.
create or replace function privado.es_profesor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select privado.mi_profesor_id() is not null
$$;

-- 2. Administrador (ADM-01, ADM-04): solo lo consultan `sesion_actual` (T14.2) y las RPC `[Adm]` (B15).
--    Ninguna política de RLS lo usa: por serlo no lee ninguna tabla. No ejecutable por la API.
create function privado.es_administrador()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from privado.administrador a
      join auth.users u on u.id = a.user_id
     where a.user_id = auth.uid()
       and u.email_confirmed_at is not null
  )
$$;

revoke execute on function privado.es_administrador() from public, anon, authenticated;

-- 3. Profesor inactivo (AGE-11, PRF-08, DEC-30, DEC-35 A): la llaman las RPC de la lista de ADR-018 antes
--    de crear algo en la agenda de `p_profesor_id`. Un id que no existe da el 404 de siempre.
create function privado.exigir_profesor_activo(p_profesor_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_activo boolean;
begin
  select p.activo into v_activo from public.profesor p where p.id = p_profesor_id;
  if v_activo is null then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
  end if;
  if not v_activo then
    raise exception using errcode = 'PT409', message = 'PROFESOR_INACTIVO';
  end if;
end;
$$;

revoke execute on function privado.exigir_profesor_activo(uuid) from public, anon, authenticated;

-- 4. Cerrojo por mail (ADR-018): lo toma todo lo que toca la unicidad global del mail (trigger de Auth,
--    `alta_alumno`, `editar_alumno`, `alta_profesor`, configuración), siempre después del cerrojo de
--    profesor (`pg_advisory_xact_lock(hashtextextended(<profesor_id>::text, 0))`, ADR-002).
create function privado.bloquear_mail(p_mail text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mail:' || pg_catalog.lower(pg_catalog.btrim(coalesce(p_mail, ''))), 0))
$$;

revoke execute on function privado.bloquear_mail(text) from public, anon, authenticated;

-- 5. Semilla de grilla de AGE-01 (lunes a viernes, 08:00 a 13:00 y 14:00 a 18:00) para un profesor nuevo.
--    Solo si no tiene tramos. La reusa `alta_profesor` (B15).
create function privado.semilla_grilla(p_profesor_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.grilla_tramo (profesor_id, dia_semana, desde, hasta)
  select p_profesor_id, d.dia, t.desde, t.hasta
    from pg_catalog.generate_series(1, 5) as d (dia)
   cross join (values (time '08:00', time '13:00'), (time '14:00', time '18:00')) as t (desde, hasta)
   where not exists (select 1 from public.grilla_tramo g where g.profesor_id = p_profesor_id)
$$;

revoke execute on function privado.semilla_grilla(uuid) from public, anon, authenticated;

-- 6. `privado.configurar_profesor(p_mail, p_nombre, p_slug)` (ADR-018; reemplaza ADR-015): `seed.sql` y la
--    operación. No ejecutable por la API (SEC-04, SEC-15). Idempotente.
--    - Mail de una fila existente: fija nombre y, si viene, slug (deja de ser provisional).
--    - Mail nuevo: crea la fila activa, con el huso de la instalación y la grilla de AGE-01; exige slug.
--      El mail de una persona con ficha completa da 409 `MAIL_YA_REGISTRADO` (profesor y alumno son
--      excluyentes, DEC-31).
--    - Vincula el usuario de Auth con ese mail solo si está confirmado (SEC-14) y borra su ficha incompleta.
create function privado.configurar_profesor(p_mail extensions.citext, p_nombre text, p_slug text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_mail text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_mail::text, '')));
  v_nombre text := pg_catalog.btrim(p_nombre);
  v_slug text := pg_catalog.btrim(p_slug);
  v_id uuid;
  v_user_actual uuid;
  v_user uuid;
begin
  if v_mail !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_mail"}';
  end if;
  if v_nombre is null or v_nombre = '' or pg_catalog.char_length(v_nombre) > 100 then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_nombre"}';
  end if;
  if p_slug is not null and not privado.slug_valido(v_slug) then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_slug"}';
  end if;

  select p.id into v_id from public.profesor p where pg_catalog.lower(p.mail::text) = v_mail;

  if v_id is not null then
    -- Cerrojo de profesor y después el de mail (ADR-018).
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_id::text, 0));
    perform privado.bloquear_mail(v_mail);
  else
    if p_slug is null then
      raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_slug"}';
    end if;
    perform privado.bloquear_mail(v_mail);
    if exists (select 1 from public.alumno a
                where pg_catalog.lower(a.mail::text) = v_mail
                  and a.estado = 'completa') then
      raise exception using errcode = 'PT409', message = 'MAIL_YA_REGISTRADO';
    end if;
  end if;

  if p_slug is not null and exists (
       select 1 from public.profesor p
        where pg_catalog.lower(p.slug::text) = pg_catalog.lower(v_slug)
          and p.id is distinct from v_id) then
    raise exception using errcode = 'PT409', message = 'SLUG_YA_USADO';
  end if;

  if v_id is null then
    insert into public.profesor (nombre, mail, slug, zona_horaria)
    values (v_nombre, v_mail::extensions.citext, v_slug::extensions.citext,
            (select a.zona_horaria_app from privado.ajustes a))
    returning id into v_id;
    perform privado.semilla_grilla(v_id);
  else
    update public.profesor p
       set nombre = v_nombre,
           slug = coalesce(v_slug::extensions.citext, p.slug),
           slug_provisional = case when v_slug is null then p.slug_provisional else false end
     where p.id = v_id;
  end if;

  -- Solo un usuario con el mail confirmado se vincula (SEC-14).
  select u.id into v_user
    from auth.users u
   where pg_catalog.lower(u.email) = v_mail
     and u.email_confirmed_at is not null
   order by u.created_at
   limit 1;

  select p.user_id into v_user_actual from public.profesor p where p.id = v_id for update;
  if v_user_actual is not null and v_user_actual is distinct from v_user then
    raise exception using errcode = 'PT409', message = 'PROFESOR_YA_VINCULADO';
  end if;

  update public.profesor p set user_id = coalesce(v_user, p.user_id) where p.id = v_id;

  -- El trigger de ingreso pudo haberle creado una ficha vacía (nunca tiene inscripciones).
  delete from public.alumno a
   where a.estado = 'ficha_incompleta'
     and (a.user_id = v_user or pg_catalog.lower(a.mail::text) = v_mail);

  return v_id;
end;
$$;

revoke execute on function privado.configurar_profesor(extensions.citext, text, text) from public, anon, authenticated;

-- La versión de dos argumentos (B01) queda hasta la contracción de B15 (ADR-021 §6): actualiza la fila con
-- ese mail y no crea profesores (sin slug, 422 `{"campo":"p_slug"}`).
create or replace function privado.configurar_profesor(p_mail extensions.citext, p_nombre text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.configurar_profesor(p_mail, p_nombre, null::text);
end;
$$;

-- 7. `privado.configurar_administrador(p_mail)` (ADM-01): paso del operador desde el SQL Editor (el mail es
--    un ajuste del despliegue y no va en el repositorio) y `seed.sql`. Hay un único Administrador: otro mail
--    reemplaza al anterior. Vincula el usuario confirmado (SEC-14) y borra su ficha incompleta; el mail de
--    una persona con ficha completa da 409 `MAIL_YA_REGISTRADO` (el Administrador no es alumno, DEC-31).
create function privado.configurar_administrador(p_mail extensions.citext)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_mail text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_mail::text, '')));
  v_user uuid;
begin
  if v_mail !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_mail"}';
  end if;

  perform privado.bloquear_mail(v_mail);

  if exists (select 1 from public.alumno a
              where pg_catalog.lower(a.mail::text) = v_mail
                and a.estado = 'completa') then
    raise exception using errcode = 'PT409', message = 'MAIL_YA_REGISTRADO';
  end if;

  select u.id into v_user
    from auth.users u
   where pg_catalog.lower(u.email) = v_mail
     and u.email_confirmed_at is not null
   order by u.created_at
   limit 1;

  delete from privado.administrador a where pg_catalog.lower(a.mail::text) <> v_mail;

  insert into privado.administrador (mail, user_id)
  values (v_mail::extensions.citext, v_user)
  on conflict (mail) do update set user_id = coalesce(excluded.user_id, privado.administrador.user_id);

  if v_user is not null then
    delete from public.alumno a where a.user_id = v_user and a.estado = 'ficha_incompleta';
  end if;
end;
$$;

revoke execute on function privado.configurar_administrador(extensions.citext) from public, anon, authenticated;
