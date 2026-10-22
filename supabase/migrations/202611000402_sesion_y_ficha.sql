-- B04 · T04.1 · RPC de sesión, ficha y personas a cargo (contratos.md §3).
-- `sesion_actual`, `completar_ficha` (ALU-02, ALU-13) y `guardar_persona_a_cargo` (ALU-06).
-- ADR-002 (RPC que delega en privado, cerrojo del profesor, errores PTxxx), ADR-014 (`app_ahora()`),
-- ADR-016 (tope de fichas), SEC-06, SEC-09, SEC-10, SEC-15, SEC-29.

-- 1. Validaciones compartidas (SEC-09). Las usan las RPC de este bolt; lanzan 422 con el campo.
create function privado.validar_nombre(p_valor text, p_campo text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := pg_catalog.btrim(p_valor);
begin
  if v is null or v = '' or pg_catalog.char_length(v) > 100 then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS',
      detail = pg_catalog.jsonb_build_object('campo', p_campo)::text;
  end if;
  return v;
end;
$$;

create function privado.validar_fecha_nacimiento(p_valor date, p_campo text)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  v_hoy date;
begin
  select (public.app_ahora() at time zone p.zona_horaria)::date into v_hoy from public.profesor p limit 1;
  if p_valor is null or p_valor < date '1900-01-01' or p_valor > v_hoy then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS',
      detail = pg_catalog.jsonb_build_object('campo', p_campo)::text;
  end if;
  return p_valor;
end;
$$;

revoke execute on function privado.validar_nombre(text, text), privado.validar_fecha_nacimiento(date, text)
  from public, anon, authenticated;

-- 2. `sesion_actual()` [U]: rol y estado de quien tiene la sesión. `motivo_rechazo` solo con la
--    cuenta rechazada (ALU-03, WEB-03). Una sesión sin cuenta en la app (sin vínculo) da 401.
create function public.sesion_actual()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
  v_alumno_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'NO_AUTENTICADO';
  end if;

  if privado.es_profesor() then
    select pg_catalog.jsonb_build_object(
             'rol', 'profesor', 'alumno_id', null, 'estado', null,
             'nombre', p.nombre, 'mail', p.mail, 'motivo_rechazo', null)
      into v_resultado
      from public.profesor p
     where p.user_id = auth.uid();
    return v_resultado;
  end if;

  v_alumno_id := privado.mi_alumno_id();
  if v_alumno_id is null then
    raise exception using errcode = 'PT401', message = 'NO_AUTENTICADO';
  end if;

  select pg_catalog.jsonb_build_object(
           'rol', 'alumno', 'alumno_id', a.id, 'estado', a.estado,
           'nombre', a.nombre, 'mail', a.mail,
           'motivo_rechazo', case when a.estado = 'rechazado' then a.motivo_estado end)
    into v_resultado
    from public.alumno a
   where a.id = v_alumno_id;
  return v_resultado;
end;
$$;

revoke execute on function public.sesion_actual() from public, anon;
grant execute on function public.sesion_actual() to authenticated;

-- 3. `completar_ficha` [U] (ALU-02, ALU-13, SEC-09, SEC-10). Orden: rol → estado → campos → tope.
--    El tope cuenta las fichas completadas en los últimos 60 min de `app_ahora()` bajo el cerrojo
--    del profesor (ADR-016); al superarlo: 429 sin cambiar el estado. El mail al profesor (AVI-02)
--    lo agrega B05.
create function privado.completar_ficha(
  p_nombre text, p_telefono text, p_fecha_nacimiento date, p_como_llego text)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_ahora timestamptz := public.app_ahora();
  v_alumno_id uuid;
  v_profesor_id uuid;
  v_estado text;
  v_nombre text;
  v_telefono text := pg_catalog.btrim(p_telefono);
  v_como_llego text := pg_catalog.btrim(p_como_llego);
  v_tope integer;
  v_recientes integer;
begin
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'NO_AUTENTICADO';
  end if;
  v_alumno_id := privado.mi_alumno_id();
  if v_alumno_id is null or privado.es_profesor() then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;

  select a.profesor_id into v_profesor_id from public.alumno a where a.id = v_alumno_id;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profesor_id::text, 0));
  select a.estado into v_estado from public.alumno a where a.id = v_alumno_id for update;

  if v_estado in ('borrado', 'sin_cuenta') then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;
  if v_estado <> 'ficha_incompleta' then
    raise exception using errcode = 'PT409', message = 'FICHA_YA_COMPLETA';
  end if;

  v_nombre := privado.validar_nombre(p_nombre, 'p_nombre');
  if v_telefono is null
     or pg_catalog.char_length(v_telefono) > 20
     or v_telefono !~ '^\+?[0-9 ().-]+$'
     or pg_catalog.char_length(pg_catalog.regexp_replace(v_telefono, '[^0-9]', '', 'g')) not between 6 and 15 then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_telefono"}';
  end if;
  perform privado.validar_fecha_nacimiento(p_fecha_nacimiento, 'p_fecha_nacimiento');
  if v_como_llego is null or v_como_llego = '' or pg_catalog.char_length(v_como_llego) > 200 then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_como_llego"}';
  end if;

  select a.tope_fichas_hora into v_tope from privado.ajustes a;
  if v_tope is not null then
    select count(*) into v_recientes
      from public.alumno a
     where a.profesor_id = v_profesor_id
       and a.ficha_completada_en > v_ahora - interval '60 minutes'
       and a.ficha_completada_en <= v_ahora;
    if v_recientes >= v_tope then
      raise exception using errcode = 'PT429', message = 'LIMITE_EXCEDIDO',
        detail = pg_catalog.jsonb_build_object('tope', 'fichas', 'limite', v_tope)::text;
    end if;
  end if;

  update public.alumno a
     set nombre = v_nombre,
         telefono = v_telefono,
         fecha_nacimiento = p_fecha_nacimiento,
         como_llego = v_como_llego,
         estado = 'pendiente',
         ficha_completada_en = v_ahora
   where a.id = v_alumno_id;

  return pg_catalog.jsonb_build_object('estado', 'pendiente');
end;
$$;

create function public.completar_ficha(
  p_nombre text, p_telefono text, p_fecha_nacimiento date, p_como_llego text)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select privado.completar_ficha(p_nombre, p_telefono, p_fecha_nacimiento, p_como_llego)
$$;

revoke execute on function privado.completar_ficha(text, text, date, text) from public, anon, authenticated;
revoke execute on function public.completar_ficha(text, text, date, text) from public, anon;
grant execute on function public.completar_ficha(text, text, date, text) to authenticated;

-- 4. `guardar_persona_a_cargo` [U] (ALU-06, SEC-29): alta con `p_id` nulo, edición de una propia.
--    Solo nombre y fecha de nacimiento. Exige la ficha completa (ALU-02).
create function privado.guardar_persona_a_cargo(p_id uuid, p_nombre text, p_fecha_nacimiento date)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alumno_id uuid;
  v_profesor_id uuid;
  v_estado text;
  v_nombre text;
  v_duenio uuid;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'NO_AUTENTICADO';
  end if;
  v_alumno_id := privado.mi_alumno_id();
  if v_alumno_id is null or privado.es_profesor() then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;

  select a.profesor_id, a.estado into v_profesor_id, v_estado from public.alumno a where a.id = v_alumno_id;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profesor_id::text, 0));

  if v_estado in ('borrado', 'sin_cuenta') then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;
  if v_estado = 'ficha_incompleta' then
    raise exception using errcode = 'PT403', message = 'FICHA_INCOMPLETA';
  end if;

  if p_id is not null then
    select pc.alumno_id into v_duenio from public.persona_a_cargo pc where pc.id = p_id for update;
    if not found then
      raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
    end if;
    if v_duenio <> v_alumno_id then
      raise exception using errcode = 'PT403', message = 'PROHIBIDO';
    end if;
  end if;

  v_nombre := privado.validar_nombre(p_nombre, 'p_nombre');
  perform privado.validar_fecha_nacimiento(p_fecha_nacimiento, 'p_fecha_nacimiento');

  if p_id is null then
    insert into public.persona_a_cargo (profesor_id, alumno_id, nombre, fecha_nacimiento)
    values (v_profesor_id, v_alumno_id, v_nombre, p_fecha_nacimiento)
    returning id into v_id;
  else
    update public.persona_a_cargo pc
       set nombre = v_nombre,
           fecha_nacimiento = p_fecha_nacimiento
     where pc.id = p_id
    returning pc.id into v_id;
  end if;

  return pg_catalog.jsonb_build_object('id', v_id);
end;
$$;

create function public.guardar_persona_a_cargo(p_id uuid, p_nombre text, p_fecha_nacimiento date)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select privado.guardar_persona_a_cargo(p_id, p_nombre, p_fecha_nacimiento)
$$;

revoke execute on function privado.guardar_persona_a_cargo(uuid, text, date) from public, anon, authenticated;
revoke execute on function public.guardar_persona_a_cargo(uuid, text, date) from public, anon;
grant execute on function public.guardar_persona_a_cargo(uuid, text, date) to authenticated;
