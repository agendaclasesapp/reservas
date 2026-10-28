-- B15 · T15.1 · Lista de profesores y pausa (RPC `[Adm]`).
-- ADR-018 (lista de ADM-03 por RPC `security definer` en lugar de la vista `v_profesores`; profesor inactivo,
-- DEC-30, DEC-35 A), ADR-002, contratos.md §2 (`profesor`: el Administrador no lo lee directo) y §3.
-- IDs: ADM-03, ADM-04, ADM-05, AGE-11, SEC-04, SEC-06, SEC-09.

-- 1. `listar_profesores()` [Adm] (ADM-03): solo columnas de `profesor`, nada de alumnos, clases ni solicitudes
--    (ADM-04). Ordenada por nombre. `[]` sin profesores.
create function privado.listar_profesores()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  perform privado.exigir_administrador();

  return coalesce(
    (select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'profesor_id', p.id,
                'nombre', p.nombre,
                'mail', p.mail,
                'slug', p.slug,
                'activo', p.activo,
                'creado_en', p.creado_en)
              order by p.nombre, p.id)
       from public.profesor p),
    '[]'::jsonb);
end;
$$;

create function public.listar_profesores()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select privado.listar_profesores()
$$;

-- 2. `cambiar_estado_profesor(p_profesor_id, p_activo)` [Adm] (ADM-05, DEC-30): la pausa. Orden: rol (401/403)
--    → `p_activo` nulo (422 `{"campo":"p_activo"}`, SEC-09) → cerrojo del profesor (ADR-002) → profesor que no
--    existe (404). Solo cambia `profesor.activo`: no borra ni toca clases, reservas, inscripciones, grilla ni
--    mails; repetirlo con el mismo valor no cambia nada. Con `activo = false` rigen AGE-11 y PRF-08 en las RPC
--    de la lista de ADR-018 (`privado.exigir_profesor_activo`); al reactivarlo todo queda como estaba.
--    Cancelar las solicitudes pendientes al inactivar (AGE-11, SOL-03, SOL-04) necesita la tabla `solicitud`,
--    que nace en B06: esta versión no tiene pendientes que cancelar (ver el handoff de T15.1).
create function privado.cambiar_estado_profesor(p_profesor_id uuid, p_activo boolean)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_activo boolean;
begin
  perform privado.exigir_administrador();

  if p_activo is null then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_activo"}';
  end if;
  if p_profesor_id is null then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_profesor_id::text, 0));

  select p.activo into v_activo from public.profesor p where p.id = p_profesor_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
  end if;

  if v_activo is distinct from p_activo then
    update public.profesor p set activo = p_activo where p.id = p_profesor_id;
  end if;

  return pg_catalog.jsonb_build_object('profesor_id', p_profesor_id, 'activo', p_activo);
end;
$$;

create function public.cambiar_estado_profesor(p_profesor_id uuid, p_activo boolean)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select privado.cambiar_estado_profesor(p_profesor_id, p_activo)
$$;

-- 3. Permisos (SEC-04): las RPC las ejecuta `authenticated` y el rol se comprueba adentro; `privado`, nadie.
revoke execute on function
  privado.listar_profesores(),
  privado.cambiar_estado_profesor(uuid, boolean)
  from public, anon, authenticated;
revoke execute on function
  public.listar_profesores(),
  public.cambiar_estado_profesor(uuid, boolean)
  from public, anon;
grant execute on function
  public.listar_profesores(),
  public.cambiar_estado_profesor(uuid, boolean)
  to authenticated;
