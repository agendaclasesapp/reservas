-- B15 · T15.1 · Alta de profesores por el Administrador (RPC `[Adm]`).
-- ADR-018 («Fila del profesor», cerrojos, roles), ADR-021 (adopción del slug provisional), ADR-019 (remitente del
-- mail de alta), ADR-002 (errores), contratos.md §1 (slug, `MAIL_YA_REGISTRADO`, `SLUG_YA_USADO`) y §3.
-- IDs: ADM-01, ADM-02, ADM-04, AGE-01, AGE-02, SEC-04, SEC-06, SEC-09. DEC-30, DEC-31, DEC-34. Spec §8.
-- Reusa `privado.slug_valido`, `privado.semilla_grilla` y `privado.bloquear_mail` de T14.1.

-- 1. Rol de las RPC `[Adm]` (SEC-06): 401 sin `sub`; 403 si quien llama no es el Administrador (un profesor o
--    una persona). `es_administrador()` exige el mail confirmado (SEC-14) y no la ejecuta `authenticated`.
create function privado.exigir_administrador()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'NO_AUTENTICADO';
  end if;
  if not privado.es_administrador() then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;
end;
$$;

revoke execute on function privado.exigir_administrador() from public, anon, authenticated;

-- 2. Mail de alta al profesor (`profesor_alta`, ADM-02, DEC-34): su enlace y el aviso de que su nombre es
--    público en el enlace y su mail lo ven sus alumnos como dirección de respuesta. Remitente: el nombre del
--    servicio, sin Reply-To (lo fija `encolar_mail` por el tipo, AVI-07). Lleva destinatario explícito (el mail
--    del profesor) y ningún alumno.
--    La dirección del sitio es un ajuste del despliegue (DEC-14: no va en el código): sale del secreto
--    `url_sitio` de Vault (p. ej. `https://<usuario>.github.io/<repositorio>/`); sin él, el mail dice cómo
--    termina el enlace (`#/p/<slug>`).
create function privado.mail_profesor_alta(p_profesor_id uuid, p_adoptado boolean)
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_nombre text;
  v_mail text;
  v_slug text;
  v_url text;
  v_enlace text;
begin
  select p.nombre, p.mail::text, p.slug::text into v_nombre, v_mail, v_slug
    from public.profesor p
   where p.id = p_profesor_id;

  select nullif(pg_catalog.btrim(ds.decrypted_secret), '') into v_url
    from vault.decrypted_secrets ds
   where ds.name = 'url_sitio';

  v_enlace := case
    when v_url is not null then pg_catalog.regexp_replace(v_url, '/+$', '') || '/#/p/' || v_slug
  end;

  return privado.encolar_mail(
    'profesor_alta',
    p_profesor_id,
    null,
    v_mail,
    'Tu agenda en Agenda Clases App',
    'Hola' || coalesce(' ' || v_nombre, '') || ',' || E'\n\n'
      || 'El Administrador de Agenda Clases App te dio de alta como profesor.' || E'\n\n'
      || case
           when v_enlace is not null then 'Tu enlace: ' || v_enlace
           else 'Tu enlace es la dirección de Agenda Clases App terminada en #/p/' || v_slug
         end || E'\n'
      || 'Pasáselo a tus alumnos: con él ven tu agenda y te piden clases.' || E'\n\n'
      || 'Tené en cuenta:' || E'\n'
      || '- Tu nombre es público: lo ve cualquiera que abra tu enlace.' || E'\n'
      || '- Tus alumnos ven tu mail como dirección de respuesta de los mails que la aplicación les manda en tu nombre.'
      || E'\n\n'
      || case
           when p_adoptado then ''
           else 'Tu agenda arranca de lunes a viernes de 08:00 a 13:00 y de 14:00 a 18:00; la cambiás desde Configuración.'
                || E'\n\n'
         end
      || 'Para entrar usá tu cuenta de Google o el código que te llega a este mail.' || E'\n');
end;
$$;

revoke execute on function privado.mail_profesor_alta(uuid, boolean) from public, anon, authenticated;

-- 3. `alta_profesor(p_mail, p_nombre, p_slug)` [Adm] (ADM-02, ADR-018). Orden: rol (401/403) → campos (422
--    `p_mail`, `p_nombre`, `p_slug`: slug de 3 a 30, minúsculas, dígitos y guiones, no reservado) → cerrojo del
--    profesor que ya tiene ese mail y después el del mail (ADR-018) → mail → slug:
--    - mail de un profesor con `slug_provisional` (el que trae la migración, spec §8, ADR-021): lo adopta; fija
--      nombre y slug, apaga `slug_provisional` y conserva id, estado, grilla y datos (`adoptado: true`);
--    - mail de otro profesor: 409 `MAIL_YA_REGISTRADO` sin `details`;
--    - mail de una persona con ficha completa: 409 `MAIL_YA_REGISTRADO` sin `details` (DEC-31: profesor y
--      alumno son excluyentes);
--    - el del Administrador se acepta (DEC-31: puede ser además profesor);
--    - mail nuevo: crea el profesor activo (ADM-05), con el huso de la instalación, la duración y anticipación
--      por defecto de la tabla (AGE-02) y la grilla de AGE-01 (`adoptado: false`);
--    - slug de otro profesor: 409 `SLUG_YA_USADO` (también si otra alta lo toma a la vez).
--    Vincula al usuario de Auth con ese mail si ya está confirmado (SEC-14) y borra su ficha incompleta (nunca
--    tiene inscripción); si todavía no entró, lo vincula el trigger de Auth al confirmar. Encola el mail de alta.
create function privado.alta_profesor(p_mail text, p_nombre text, p_slug text)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_mail text;
  v_nombre text;
  v_slug text := pg_catalog.btrim(p_slug);
  v_id uuid;
  v_provisional boolean;
  v_adoptado boolean := false;
  v_user uuid;
  v_restriccion text;
begin
  perform privado.exigir_administrador();

  v_mail := pg_catalog.lower(nullif(pg_catalog.btrim(p_mail), ''));
  if v_mail is null or not privado.es_mail_simple(v_mail) then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_mail"}';
  end if;
  v_nombre := privado.validar_nombre(p_nombre, 'p_nombre');
  if not privado.slug_valido(v_slug) then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_slug"}';
  end if;

  -- Cerrojos (ADR-018): primero el del profesor de ese mail, si existe; después el del mail. Un profesor nuevo
  -- con ese mail solo lo crea quien tiene el cerrojo del mail, así que la segunda lectura es la que vale.
  select p.id into v_id from public.profesor p where pg_catalog.lower(p.mail::text) = v_mail;
  if v_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_id::text, 0));
  end if;
  perform privado.bloquear_mail(v_mail);

  select p.id, p.slug_provisional into v_id, v_provisional
    from public.profesor p
   where pg_catalog.lower(p.mail::text) = v_mail
     for update;

  if v_id is not null and not v_provisional then
    raise exception using errcode = 'PT409', message = 'MAIL_YA_REGISTRADO';
  end if;
  if v_id is null and exists (select 1 from public.alumno a
                               where pg_catalog.lower(a.mail::text) = v_mail
                                 and a.estado = 'completa') then
    raise exception using errcode = 'PT409', message = 'MAIL_YA_REGISTRADO';
  end if;

  if exists (select 1 from public.profesor p
              where p.slug = v_slug::extensions.citext
                and p.id is distinct from v_id) then
    raise exception using errcode = 'PT409', message = 'SLUG_YA_USADO';
  end if;

  begin
    if v_id is null then
      insert into public.profesor (nombre, mail, slug, zona_horaria)
      values (v_nombre, v_mail::extensions.citext, v_slug::extensions.citext,
              (select a.zona_horaria_app from privado.ajustes a))
      returning id into v_id;
      perform privado.semilla_grilla(v_id);
    else
      update public.profesor p
         set nombre = v_nombre,
             slug = v_slug::extensions.citext,
             slug_provisional = false
       where p.id = v_id;
      v_adoptado := true;
    end if;
  exception when unique_violation then
    -- Dos altas a la vez con el mismo slug y mails distintos: la segunda ve la restricción de unicidad.
    get stacked diagnostics v_restriccion = constraint_name;
    if v_restriccion = 'profesor_slug_unico' then
      raise exception using errcode = 'PT409', message = 'SLUG_YA_USADO';
    end if;
    raise;
  end;

  -- Solo un usuario con el mail confirmado se vincula (SEC-14), y solo si la fila no tiene uno ya.
  select u.id into v_user
    from auth.users u
   where pg_catalog.lower(u.email) = v_mail
     and u.email_confirmed_at is not null
     and not exists (select 1 from public.profesor p where p.user_id = u.id)
   order by u.created_at
   limit 1;

  update public.profesor p
     set user_id = v_user
   where p.id = v_id
     and p.user_id is null
     and v_user is not null;

  -- El trigger de ingreso pudo haberle creado una ficha vacía (CA-61, rama de B15): se reemplaza.
  delete from public.alumno a
   where a.estado = 'ficha_incompleta'
     and (a.user_id = v_user or pg_catalog.lower(a.mail::text) = v_mail);

  perform privado.mail_profesor_alta(v_id, v_adoptado);

  return pg_catalog.jsonb_build_object('profesor_id', v_id, 'slug', v_slug, 'adoptado', v_adoptado);
end;
$$;

create function public.alta_profesor(p_mail text, p_nombre text, p_slug text)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select privado.alta_profesor(p_mail, p_nombre, p_slug)
$$;

-- 4. Permisos (SEC-04): la RPC la ejecuta `authenticated` y el rol se comprueba adentro; `privado`, nadie.
revoke execute on function privado.alta_profesor(text, text, text) from public, anon, authenticated;
revoke execute on function public.alta_profesor(text, text, text) from public, anon;
grant execute on function public.alta_profesor(text, text, text) to authenticated;
