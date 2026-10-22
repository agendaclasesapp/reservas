-- B05 · T05.1 · Alta y edición de alumnos por el profesor (ALU-07, ALU-08, ALU-09; DEC-03 c).
-- contratos.md §1 («Campos de la ficha»), §3 y §4 (mail como dato con `privado.es_mail_simple`);
-- ADR-002, ADR-013, ADR-014, SEC-06, SEC-09.

-- 1. Mail ya usado (DEC-03 c): otro alumno no borrado del profesor con ese mail, o el mail del propio
--    profesor (su usuario de Auth se vincula como profesor y la fila de alumno nunca se vincularía).
--    409 `MAIL_YA_REGISTRADO` con `{"alumno_id": …}` (null si es el del profesor).
create function privado.exigir_mail_libre(p_profesor uuid, p_mail text, p_excepto uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_existente uuid;
begin
  if p_mail is null then
    return;
  end if;
  select a.id into v_existente
    from public.alumno a
   where a.profesor_id = p_profesor
     and a.estado <> 'borrado'
     and a.id is distinct from p_excepto
     and pg_catalog.lower(a.mail::text) = pg_catalog.lower(p_mail)
   limit 1;
  if found or exists (
       select 1 from public.profesor p
        where p.id = p_profesor and pg_catalog.lower(p.mail::text) = pg_catalog.lower(p_mail)) then
    raise exception using errcode = 'PT409', message = 'MAIL_YA_REGISTRADO',
      detail = pg_catalog.jsonb_build_object('alumno_id', v_existente)::text;
  end if;
end;
$$;

revoke execute on function privado.exigir_mail_libre(uuid, text, uuid) from public, anon, authenticated;

-- 2. `alta_alumno` [P]. Con mail: cuenta ya aprobada sin usuario; la persona entra con Google o con
--    código con ese mail y el trigger de B04 la vincula conservando el estado (ALU-07). Sin mail:
--    `sin_cuenta`, no inicia sesión ni recibe mails (ALU-08). Orden: rol → campos → mail libre.
create function privado.alta_alumno(p_nombre text, p_telefono text, p_fecha_nacimiento date, p_mail text)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_profesor uuid;
  v_nombre text;
  v_telefono text;
  v_mail text;
  v_estado text;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'NO_AUTENTICADO';
  end if;
  if not privado.es_profesor() then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;

  select p.id into v_profesor from public.profesor p where p.user_id = auth.uid();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profesor::text, 0));

  v_nombre := privado.validar_nombre(p_nombre, 'p_nombre');
  v_telefono := privado.validar_telefono(p_telefono, 'p_telefono');
  perform privado.validar_fecha_nacimiento(p_fecha_nacimiento, 'p_fecha_nacimiento');
  v_mail := privado.validar_mail_alumno(p_mail);
  perform privado.exigir_mail_libre(v_profesor, v_mail, null);

  v_estado := case when v_mail is null then 'sin_cuenta' else 'aprobado' end;

  insert into public.alumno (profesor_id, estado, nombre, mail, telefono, fecha_nacimiento, aprobado_en)
  values (v_profesor, v_estado, v_nombre, v_mail::extensions.citext, v_telefono, p_fecha_nacimiento,
          case when v_estado = 'aprobado' then public.app_ahora() end)
  returning id into v_id;

  return pg_catalog.jsonb_build_object('alumno_id', v_id, 'estado', v_estado);
end;
$$;

create function public.alta_alumno(p_nombre text, p_telefono text, p_fecha_nacimiento date, p_mail text default null)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select privado.alta_alumno(p_nombre, p_telefono, p_fecha_nacimiento, p_mail)
$$;

-- 3. `editar_alumno` [P]: nombre, teléfono, fecha de nacimiento y mail de un alumno de la lista
--    (estados de ALU-09; si no, 404). El mail se cambia solo en un alumno sin usuario de Auth (sin
--    cuenta o dado de alta con mail y que todavía no entró): agregarlo lo vuelve cuenta aprobada como
--    en ALU-07; quitarlo lo deja sin cuenta como en ALU-08. En una cuenta con usuario el mail es su
--    identidad de ingreso: otro valor da 422 `{"campo":"p_mail"}`. `p_mail` vacío o null = sin mail.
create function privado.editar_alumno(
  p_alumno_id uuid, p_nombre text, p_telefono text, p_fecha_nacimiento date, p_mail text)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_profesor uuid;
  v_alumno public.alumno%rowtype;
  v_nombre text;
  v_telefono text;
  v_mail text;
  v_estado text;
begin
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'NO_AUTENTICADO';
  end if;
  if not privado.es_profesor() then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;

  select p.id into v_profesor from public.profesor p where p.user_id = auth.uid();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profesor::text, 0));

  select * into v_alumno from public.alumno a
   where a.id = p_alumno_id and a.profesor_id = v_profesor
     and a.estado in ('pendiente', 'aprobado', 'rechazado', 'sin_cuenta')
     for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
  end if;

  v_nombre := privado.validar_nombre(p_nombre, 'p_nombre');
  v_telefono := privado.validar_telefono(p_telefono, 'p_telefono');
  perform privado.validar_fecha_nacimiento(p_fecha_nacimiento, 'p_fecha_nacimiento');
  v_mail := privado.validar_mail_alumno(p_mail);
  v_estado := v_alumno.estado;

  if pg_catalog.lower(coalesce(v_mail, '')) <> pg_catalog.lower(coalesce(v_alumno.mail::text, '')) then
    if v_alumno.user_id is not null or v_alumno.estado not in ('sin_cuenta', 'aprobado') then
      raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_mail"}';
    end if;
    perform privado.exigir_mail_libre(v_profesor, v_mail, p_alumno_id);
    v_estado := case when v_mail is null then 'sin_cuenta' else 'aprobado' end;
  else
    v_mail := v_alumno.mail::text;
  end if;

  update public.alumno a
     set nombre = v_nombre,
         telefono = v_telefono,
         fecha_nacimiento = p_fecha_nacimiento,
         mail = v_mail::extensions.citext,
         estado = v_estado,
         aprobado_en = case when v_estado = 'aprobado' and a.estado = 'sin_cuenta' then public.app_ahora()
                            else a.aprobado_en end
   where a.id = p_alumno_id;

  return pg_catalog.jsonb_build_object('alumno_id', p_alumno_id);
end;
$$;

create function public.editar_alumno(
  p_alumno_id uuid, p_nombre text, p_telefono text, p_fecha_nacimiento date, p_mail text default null)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select privado.editar_alumno(p_alumno_id, p_nombre, p_telefono, p_fecha_nacimiento, p_mail)
$$;

-- 4. Permisos (SEC-04).
revoke execute on function
  privado.alta_alumno(text, text, date, text),
  privado.editar_alumno(uuid, text, text, date, text)
  from public, anon, authenticated;
revoke execute on function
  public.alta_alumno(text, text, date, text),
  public.editar_alumno(uuid, text, text, date, text)
  from public, anon;
grant execute on function
  public.alta_alumno(text, text, date, text),
  public.editar_alumno(uuid, text, text, date, text)
  to authenticated;
