-- B14 · T14.2 · Lectura pública por el enlace del profesor (`#/p/<slug>`) y funciones de transición.
-- ADR-020 (lectura pública, transición), ADR-018 (profesor inactivo), ADR-006 (agenda sin datos), ADR-021 §2.
-- IDs: AGE-07, AGE-09, AGE-10, AGE-11, NFR-09, SEC-06, SEC-09. contratos.md §1 («Slug») y §3.

-- 1. Profesor de un slug (ADM-02, AGE-09): un slug inválido, reservado o que no es de nadie da null, y las
--    RPC responden con el mismo 404 `NO_ENCONTRADO` para todos (SEC-06). Sin distinguir mayúsculas (citext).
create function privado.profesor_por_slug(p_slug text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
    from public.profesor p
   where privado.slug_valido(pg_catalog.lower(pg_catalog.btrim(p_slug)))
     and pg_catalog.lower(p.slug::text) = pg_catalog.lower(pg_catalog.btrim(p_slug))
$$;

revoke execute on function privado.profesor_por_slug(text) from public, anon, authenticated;

-- 2. Lógica común: configuración visible y agenda de un profesor ya resuelto.
create function privado.config_publica(p_profesor_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case when p.activo
    then pg_catalog.jsonb_build_object(
           'profesor_id', p.id,
           'nombre', p.nombre,
           'activo', true,
           'zona_horaria', p.zona_horaria,
           'duracion_min', p.duracion_min,
           'anticipacion_horas', p.anticipacion_horas,
           'horizonte_semanas', p.horizonte_semanas)
    -- AGE-11: del profesor inactivo solo el nombre y el aviso; nada de su agenda.
    else pg_catalog.jsonb_build_object('profesor_id', p.id, 'nombre', p.nombre, 'activo', false)
  end
    from public.profesor p
   where p.id = p_profesor_id
$$;

-- `p_dia` entre hoy − 366 días y hoy + horizonte + 31 días en el huso del profesor (SEC-09, H-010).
create function privado.agenda_publica_de(p_profesor_id uuid, p_dia date)
returns table (inicio timestamptz, fin timestamptz, estado text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_zona text;
  v_horizonte integer;
  v_hoy date;
begin
  perform privado.exigir_profesor_activo(p_profesor_id);

  select p.zona_horaria, p.horizonte_semanas into v_zona, v_horizonte
    from public.profesor p where p.id = p_profesor_id;
  v_hoy := (public.app_ahora() at time zone v_zona)::date;

  if p_dia is null or p_dia < v_hoy - 366 or p_dia > v_hoy + v_horizonte * 7 + 31 then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_dia"}';
  end if;

  return query
    select a.inicio, a.fin, a.estado
      from privado.agenda_publica(p_profesor_id, p_dia) a;
end;
$$;

revoke execute on function privado.config_publica(uuid), privado.agenda_publica_de(uuid, date)
  from public, anon, authenticated;

-- 3. `config_publica(p_slug)` [A] (AGE-09, AGE-11, DEC-34): el nombre es lo único del profesor que es
--    público. Slug desconocido: 404.
create function public.config_publica(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profesor uuid := privado.profesor_por_slug(p_slug);
begin
  if v_profesor is null then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
  end if;
  return privado.config_publica(v_profesor);
end;
$$;

revoke execute on function public.config_publica(text) from public;
grant execute on function public.config_publica(text) to anon, authenticated;

-- 4. `agenda_publica(p_slug, p_dia)` [A] (AGE-07, AGE-10, CA-15): solo `inicio`, `fin`, `estado` de ese
--    profesor. Orden: slug (404) → activo (409 `PROFESOR_INACTIVO`) → `p_dia` (422).
create function public.agenda_publica(p_slug text, p_dia date)
returns table (inicio timestamptz, fin timestamptz, estado text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profesor uuid := privado.profesor_por_slug(p_slug);
begin
  if v_profesor is null then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
  end if;
  return query
    select a.inicio, a.fin, a.estado
      from privado.agenda_publica_de(v_profesor, p_dia) a;
end;
$$;

revoke execute on function public.agenda_publica(text, date) from public;
grant execute on function public.agenda_publica(text, date) to anon, authenticated;

-- 5. Transición (ADR-021 §2, ADR-020): la web de B05 sigue andando mientras se despliega la nueva. Delegan
--    en el único profesor; con cero o más de uno responden 404 `NO_ENCONTRADO`. Las borra la contracción de
--    B15 (T15.4). `config_publica()` conserva la forma de B01.
create function privado.unico_profesor()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select pg_catalog.count(*) from public.profesor) <> 1 then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
  end if;
  select p.id into v_id from public.profesor p;
  return v_id;
end;
$$;

revoke execute on function privado.unico_profesor() from public, anon, authenticated;

create or replace function public.config_publica()
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
           'horizonte_semanas', p.horizonte_semanas)
    from public.profesor p
   where p.id = privado.unico_profesor()
$$;

create or replace function public.agenda_publica(p_dia date)
returns table (inicio timestamptz, fin timestamptz, estado text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.inicio, a.fin, a.estado
    from privado.agenda_publica_de(privado.unico_profesor(), p_dia) a
$$;
