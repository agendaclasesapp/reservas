-- B14 · T14.2 · Sesión, ficha única de la persona, pedido de acceso y personas a cargo con varios profesores.
-- ADR-018 (persona, inscripción, profesor inactivo, huso de la ficha), ADR-019 (tope de fichas por profesor de
-- origen), ADR-020 (forma de la sesión, profesor de origen), ADR-002, ADR-014. contratos.md §1 y §3.
-- IDs: ALU-02, ALU-03, ALU-06, ALU-13, ALU-14, AGE-11, AVI-02, SEC-06, SEC-09, SEC-10.
-- Reemplaza `sesion_actual`, `completar_ficha` (cuatro argumentos), `guardar_persona_a_cargo` y
-- `validar_fecha_nacimiento` de B04 (202611000402).

-- 1. Fecha de nacimiento entre 1900-01-01 y hoy en el huso de la aplicación: la ficha es de la persona, no
--    de un profesor (ADR-018, contratos.md §1).
create or replace function privado.validar_fecha_nacimiento(p_valor date, p_campo text)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  v_hoy date;
begin
  select (public.app_ahora() at time zone a.zona_horaria_app)::date into v_hoy from privado.ajustes a;
  if p_valor is null or p_valor < date '1900-01-01' or p_valor > v_hoy then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS',
      detail = pg_catalog.jsonb_build_object('campo', p_campo)::text;
  end if;
  return p_valor;
end;
$$;

-- 2. «Cómo llegaste» (DEC-33, SEC-09): 1 a 200 caracteres tras `btrim`.
create function privado.validar_como_llego(p_valor text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := pg_catalog.btrim(p_valor);
begin
  if v is null or v = '' or pg_catalog.char_length(v) > 200 then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_como_llego"}';
  end if;
  return v;
end;
$$;

-- 3. Persona de la sesión para las RPC del alumno: 401 sin `sub`; 403 `PROHIBIDO` para un profesor, el
--    Administrador o una sesión sin ficha (SEC-06, DEC-31: profesor y alumno son excluyentes).
create function privado.persona_de_sesion()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_alumno_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'NO_AUTENTICADO';
  end if;
  v_alumno_id := privado.mi_alumno_id();
  if v_alumno_id is null or privado.mi_profesor_id() is not null or privado.es_administrador() then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;
  return v_alumno_id;
end;
$$;

revoke execute on function privado.validar_como_llego(text), privado.persona_de_sesion()
  from public, anon, authenticated;

-- 4. `sesion_actual()` [U] (ADR-020, WEB-03, WEB-11): rol (profesor, después Administrador, después
--    persona), su profesor y las inscripciones de la persona sin las de `baja`; `motivo_rechazo` solo con
--    la inscripción rechazada (ALU-03). Una sesión que no es nada de eso da 401.
create or replace function public.sesion_actual()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profesor_id uuid;
  v_es_admin boolean;
  v_alumno_id uuid;
  v_resultado jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'NO_AUTENTICADO';
  end if;

  v_profesor_id := privado.mi_profesor_id();
  v_es_admin := privado.es_administrador();

  if v_profesor_id is not null then
    select pg_catalog.jsonb_build_object(
             'rol', 'profesor', 'es_administrador', v_es_admin,
             'profesor', pg_catalog.jsonb_build_object('id', p.id, 'slug', p.slug::text, 'nombre', p.nombre,
                                                       'activo', p.activo),
             'alumno_id', null, 'estado', null, 'nombre', p.nombre, 'mail', p.mail::text,
             'inscripciones', '[]'::jsonb)
      into v_resultado
      from public.profesor p
     where p.id = v_profesor_id;
    return v_resultado;
  end if;

  if v_es_admin then
    select pg_catalog.jsonb_build_object(
             'rol', 'administrador', 'es_administrador', true, 'profesor', null,
             'alumno_id', null, 'estado', null, 'nombre', null, 'mail', a.mail::text,
             'inscripciones', '[]'::jsonb)
      into v_resultado
      from privado.administrador a
     where a.user_id = auth.uid();
    return v_resultado;
  end if;

  v_alumno_id := privado.mi_alumno_id();
  if v_alumno_id is null then
    raise exception using errcode = 'PT401', message = 'NO_AUTENTICADO';
  end if;

  select pg_catalog.jsonb_build_object(
           'rol', 'alumno', 'es_administrador', false, 'profesor', null,
           'alumno_id', a.id, 'estado', a.estado, 'nombre', a.nombre, 'mail', a.mail::text,
           'inscripciones', coalesce((
             select pg_catalog.jsonb_agg(
                      pg_catalog.jsonb_build_object(
                        'profesor_id', p.id,
                        'slug', p.slug::text,
                        'profesor_nombre', p.nombre,
                        'profesor_activo', p.activo,
                        'estado', i.estado,
                        'motivo_rechazo', case when i.estado = 'rechazado' then i.motivo_estado end)
                      order by p.nombre, p.id)
               from public.inscripcion i
               join public.profesor p on p.id = i.profesor_id
              where i.alumno_id = a.id
                and i.estado <> 'baja'), '[]'::jsonb))
    into v_resultado
    from public.alumno a
   where a.id = v_alumno_id;
  return v_resultado;
end;
$$;

revoke execute on function public.sesion_actual() from public, anon;
grant execute on function public.sesion_actual() to authenticated;

-- 5. `completar_ficha(…, p_slug, p_como_llego)` [U] (ALU-02, ALU-13, ALU-14, AVI-02).
--    Orden: rol → slug (404) → ficha (403 borrada, 409 ya completa) → profesor activo (409) → campos (422)
--    → tope (429). Con slug, «cómo llegaste» es obligatorio, nace la inscripción pendiente con ese profesor
--    y se encola el mail de cuenta nueva; sin slug no hay vínculo y `p_como_llego` no se guarda.
--    Tope de ALU-13 (ADR-019): fichas completadas en 60 min con el mismo profesor de origen (las sin enlace
--    entre sí), bajo el cerrojo de ese profesor o el del cupo sin enlace. Superado: 429, la ficha sigue
--    incompleta y no hay mail.
drop function public.completar_ficha(text, text, date, text);
drop function privado.completar_ficha(text, text, date, text);

create function privado.completar_ficha(
  p_nombre text, p_telefono text, p_fecha_nacimiento date, p_slug text, p_como_llego text)
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
  v_telefono text;
  v_como_llego text;
  v_tope integer;
  v_recientes integer;
begin
  v_alumno_id := privado.persona_de_sesion();

  if p_slug is not null then
    v_profesor_id := privado.profesor_por_slug(p_slug);
    if v_profesor_id is null then
      raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profesor_id::text, 0));
  else
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fichas:sin-enlace', 0));
  end if;

  select a.estado into v_estado from public.alumno a where a.id = v_alumno_id for update;
  if v_estado = 'borrado' then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;
  if v_estado <> 'ficha_incompleta' then
    raise exception using errcode = 'PT409', message = 'FICHA_YA_COMPLETA';
  end if;

  if v_profesor_id is not null then
    perform privado.exigir_profesor_activo(v_profesor_id);
  end if;

  v_nombre := privado.validar_nombre(p_nombre, 'p_nombre');
  v_telefono := privado.validar_telefono(p_telefono, 'p_telefono');
  perform privado.validar_fecha_nacimiento(p_fecha_nacimiento, 'p_fecha_nacimiento');
  if v_profesor_id is not null then
    v_como_llego := privado.validar_como_llego(p_como_llego);
  end if;

  select a.tope_fichas_hora into v_tope from privado.ajustes a;
  select pg_catalog.count(*) into v_recientes
    from public.alumno a
   where a.ficha_origen_profesor_id is not distinct from v_profesor_id
     and a.ficha_completada_en > v_ahora - interval '60 minutes'
     and a.ficha_completada_en <= v_ahora;
  if v_recientes >= v_tope then
    raise exception using errcode = 'PT429', message = 'LIMITE_EXCEDIDO',
      detail = pg_catalog.jsonb_build_object('tope', 'fichas', 'limite', v_tope)::text;
  end if;

  update public.alumno a
     set nombre = v_nombre,
         telefono = v_telefono,
         fecha_nacimiento = p_fecha_nacimiento,
         estado = 'completa',
         ficha_completada_en = v_ahora,
         ficha_origen_profesor_id = v_profesor_id
   where a.id = v_alumno_id;

  if v_profesor_id is null then
    return pg_catalog.jsonb_build_object('estado', 'completa', 'inscripcion', null);
  end if;

  insert into public.inscripcion (alumno_id, profesor_id, estado, como_llego, creado_en)
  values (v_alumno_id, v_profesor_id, 'pendiente', v_como_llego, v_ahora);

  perform privado.mail_cuenta_nueva(v_alumno_id, v_profesor_id);

  return pg_catalog.jsonb_build_object(
    'estado', 'completa',
    'inscripcion', pg_catalog.jsonb_build_object('profesor_id', v_profesor_id, 'estado', 'pendiente'));
end;
$$;

create function public.completar_ficha(
  p_nombre text, p_telefono text, p_fecha_nacimiento date, p_slug text default null, p_como_llego text default null)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select privado.completar_ficha(p_nombre, p_telefono, p_fecha_nacimiento, p_slug, p_como_llego)
$$;

revoke execute on function privado.completar_ficha(text, text, date, text, text) from public, anon, authenticated;
revoke execute on function public.completar_ficha(text, text, date, text, text) from public, anon;
grant execute on function public.completar_ficha(text, text, date, text, text) to authenticated;

-- 6. `pedir_inscripcion(p_slug, p_como_llego)` [U] (ALU-14, DEC-25, DEC-33, AVI-02): la persona con ficha
--    completa pide acceso a otro profesor. Crea la inscripción pendiente o vuelve `pendiente` una en `baja`;
--    con otra existente, 409 `CUENTA_NO_PENDIENTE` con su estado. No cuenta en el tope de fichas (ADR-019):
--    lo acotan la unicidad de la inscripción y el tope de mails.
--    Orden: rol → slug (404) → ficha (403) → profesor activo (409) → inscripción existente (409) → campo (422).
create function privado.pedir_inscripcion(p_slug text, p_como_llego text)
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
  v_inscripcion public.inscripcion%rowtype;
  v_como_llego text;
begin
  v_alumno_id := privado.persona_de_sesion();

  v_profesor_id := privado.profesor_por_slug(p_slug);
  if v_profesor_id is null then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profesor_id::text, 0));

  select a.estado into v_estado from public.alumno a where a.id = v_alumno_id for update;
  if v_estado = 'borrado' then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;
  if v_estado <> 'completa' then
    raise exception using errcode = 'PT403', message = 'FICHA_INCOMPLETA';
  end if;

  perform privado.exigir_profesor_activo(v_profesor_id);

  select * into v_inscripcion from public.inscripcion i
   where i.alumno_id = v_alumno_id and i.profesor_id = v_profesor_id
     for update;
  if found and v_inscripcion.estado <> 'baja' then
    raise exception using errcode = 'PT409', message = 'CUENTA_NO_PENDIENTE',
      detail = pg_catalog.jsonb_build_object('estado', v_inscripcion.estado)::text;
  end if;

  v_como_llego := privado.validar_como_llego(p_como_llego);

  if v_inscripcion.id is null then
    insert into public.inscripcion (alumno_id, profesor_id, estado, como_llego, creado_en)
    values (v_alumno_id, v_profesor_id, 'pendiente', v_como_llego, v_ahora);
  else
    update public.inscripcion i
       set estado = 'pendiente', como_llego = v_como_llego, motivo_estado = null,
           creado_en = v_ahora, aprobado_en = null
     where i.id = v_inscripcion.id;
  end if;

  perform privado.mail_cuenta_nueva(v_alumno_id, v_profesor_id);

  return pg_catalog.jsonb_build_object('profesor_id', v_profesor_id, 'estado', 'pendiente');
end;
$$;

create function public.pedir_inscripcion(p_slug text, p_como_llego text)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select privado.pedir_inscripcion(p_slug, p_como_llego)
$$;

revoke execute on function privado.pedir_inscripcion(text, text) from public, anon, authenticated;
revoke execute on function public.pedir_inscripcion(text, text) from public, anon;
grant execute on function public.pedir_inscripcion(text, text) to authenticated;

-- 7. `guardar_persona_a_cargo` [U] (ALU-06): las personas a cargo son de la persona, no de un profesor
--    (`persona_a_cargo.profesor_id` queda sin uso, ADR-021). Cerrojo por persona en lugar del de profesor.
create or replace function privado.guardar_persona_a_cargo(p_id uuid, p_nombre text, p_fecha_nacimiento date)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alumno_id uuid;
  v_estado text;
  v_nombre text;
  v_duenio uuid;
  v_id uuid;
begin
  v_alumno_id := privado.persona_de_sesion();

  select a.estado into v_estado from public.alumno a where a.id = v_alumno_id for update;
  if v_estado = 'borrado' then
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
    insert into public.persona_a_cargo (alumno_id, nombre, fecha_nacimiento)
    values (v_alumno_id, v_nombre, p_fecha_nacimiento)
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
