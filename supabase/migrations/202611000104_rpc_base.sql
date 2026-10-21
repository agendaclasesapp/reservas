-- B01 · T01.2 · RPC públicas de la plataforma y alta del profesor.
-- contratos.md §3 (`ping`, `config_publica`), ADR-009 (keep-alive, NFR-08), ADR-015, SEC-04, SEC-05.

-- 1. `ping()` [A]: consulta mínima que mantiene activo el proyecto (NFR-08, keepalive.yml).
create function public.ping()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select public.app_ahora()
$$;

revoke execute on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;

-- 2. `config_publica()` [A]: configuración visible de la agenda; nada de datos personales.
create function public.config_publica()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
           'zona_horaria', p.zona_horaria,
           'duracion_min', p.duracion_min,
           'anticipacion_horas', p.anticipacion_horas,
           'horizonte_semanas', p.horizonte_semanas
         )
    from public.profesor p
   limit 1
$$;

revoke execute on function public.config_publica() from public;
grant execute on function public.config_publica() to anon, authenticated;

-- 3. `privado.configurar_profesor` (ADR-015): paso manual de puesta en marcha y `seed.sql`.
--    No ejecutable por `anon` ni `authenticated` (SEC-04, SEC-15). Idempotente.
create function privado.configurar_profesor(p_mail extensions.citext, p_nombre text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_profesor_id uuid;
  v_user_actual uuid;
  v_user uuid;
begin
  if p_mail is null or p_mail::text !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_mail"}';
  end if;
  if p_nombre is null or pg_catalog.btrim(p_nombre) = '' then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_nombre"}';
  end if;

  select p.id, p.user_id into v_profesor_id, v_user_actual
    from public.profesor p
   for update;

  -- Mismo cerrojo que las RPC de escritura (ADR-002).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profesor_id::text, 0));

  -- Solo un usuario con el mail confirmado se vincula (SEC-14). `auth.users.email` es texto:
  -- se compara sin distinguir mayúsculas como lo haría citext.
  select u.id into v_user
    from auth.users u
   where pg_catalog.lower(u.email) = pg_catalog.lower(p_mail::text)
     and u.email_confirmed_at is not null
   order by u.created_at
   limit 1;

  if v_user_actual is not null and v_user_actual is distinct from v_user then
    raise exception using errcode = 'PT409', message = 'PROFESOR_YA_VINCULADO';
  end if;

  update public.profesor p
     set mail = p_mail,
         nombre = pg_catalog.btrim(p_nombre),
         user_id = coalesce(v_user, p.user_id)
   where p.id = v_profesor_id;

  -- El trigger de ingreso (B04) pudo haberle creado una ficha de alumno vacía.
  if v_user is not null then
    delete from public.alumno a
     where a.user_id = v_user
       and a.estado = 'ficha_incompleta';
  end if;
end;
$$;

revoke execute on function privado.configurar_profesor(extensions.citext, text) from public, anon, authenticated;
