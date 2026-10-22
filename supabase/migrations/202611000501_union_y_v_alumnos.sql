-- B05 · T05.1 · Uniones descartadas, validaciones de alta y edición, y `v_alumnos` (ALU-04, ALU-09).
-- ADR-013 (alumnos y unión), ADR-014 (edad con `app_ahora()`), ADR-004 (hoy en el huso del profesor),
-- SEC-02, SEC-05, SEC-09.

-- 1. Sugerencias de unión descartadas (ALU-04, DEC-03 b). En `privado`: solo la leen y escriben las RPC.
--    Se borra con cualquiera de los dos alumnos (la unión borra el sin cuenta, ALU-05).
create table privado.union_descartada (
  cuenta_id uuid not null references public.alumno (id) on delete cascade,
  sin_cuenta_id uuid not null references public.alumno (id) on delete cascade,
  creado_en timestamptz not null default public.app_ahora(),
  primary key (cuenta_id, sin_cuenta_id)
);

create index union_descartada_sin_cuenta on privado.union_descartada (sin_cuenta_id);

revoke all on privado.union_descartada from public, anon, authenticated;

-- 2. Validaciones de entrada (SEC-09, contratos.md §1 «Campos de la ficha»). Las de nombre y fecha de
--    nacimiento son de B04 (`privado.validar_nombre`, `privado.validar_fecha_nacimiento`).
create function privado.validar_telefono(p_valor text, p_campo text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := pg_catalog.btrim(p_valor);
begin
  if v is null
     or pg_catalog.char_length(v) > 20
     or v !~ '^\+?[0-9 ().-]+$'
     or pg_catalog.char_length(pg_catalog.regexp_replace(v, '[^0-9]', '', 'g')) not between 6 and 15 then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS',
      detail = pg_catalog.jsonb_build_object('campo', p_campo)::text;
  end if;
  return v;
end;
$$;

-- Mail como dato (`alta_alumno`, `editar_alumno`): vacío = sin mail; si no, mail simple de B03
-- (`privado.es_mail_simple`, contratos.md §4) o 422 `{"campo":"p_mail"}`.
create function privado.validar_mail_alumno(p_valor text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := nullif(pg_catalog.btrim(p_valor), '');
begin
  if v is not null and not privado.es_mail_simple(v) then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_mail"}';
  end if;
  return v;
end;
$$;

-- Motivo de aprobar o rechazar (AVI-03, ALU-03): vacío = sin motivo; hasta 500 caracteres (SEC-09).
create function privado.validar_motivo(p_valor text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := nullif(pg_catalog.btrim(p_valor), '');
begin
  if pg_catalog.char_length(v) > 500 then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"motivo"}';
  end if;
  return v;
end;
$$;

revoke execute on function privado.validar_telefono(text, text), privado.validar_mail_alumno(text),
  privado.validar_motivo(text)
  from public, anon, authenticated;

-- Respaldo en la tabla (SEC-09): el motivo guardado no pasa de 500.
alter table public.alumno
  add constraint alumno_motivo_estado_largo check (char_length(motivo_estado) <= 500);

-- 3. Sugerencias de unión de una cuenta (ALU-04, DEC-03 a y b): alumnos sin cuenta con el mismo
--    `telefono_clave`, menos los descartados. Un sin cuenta o un borrado no tiene sugerencias.
create function privado.sugerencias_de(p_cuenta_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object('sin_cuenta_id', s.id, 'nombre', s.nombre, 'telefono', s.telefono)
             order by s.nombre, s.id),
           '[]'::jsonb)
    from public.alumno c
    join public.alumno s
      on s.profesor_id = c.profesor_id
     and s.telefono_clave = c.telefono_clave
     and s.estado = 'sin_cuenta'
     and s.id <> c.id
   where c.id = p_cuenta_id
     and c.estado not in ('sin_cuenta', 'borrado')
     and not exists (
           select 1 from privado.union_descartada d
            where d.cuenta_id = c.id and d.sin_cuenta_id = s.id)
$$;

revoke execute on function privado.sugerencias_de(uuid) from public, anon, authenticated;

-- 4. `v_alumnos` (ALU-09; contratos.md §2): solo el profesor. `security_invoker` (SEC-05) y además el
--    filtro explícito de rol, porque la RLS de `alumno` deja a la cuenta leer su propia fila (SEC-02).
--    Lista los estados de ALU-09 (pendiente, aprobado, rechazado, sin cuenta); no las fichas
--    incompletas ni los borrados. Edad en años cumplidos al día de hoy en el huso del profesor,
--    con `app_ahora()` (ADR-014, ADR-004).
create view public.v_alumnos
with (security_invoker = true)
as
  select a.id,
         a.estado,
         a.nombre,
         a.mail::text as mail,
         a.telefono,
         a.fecha_nacimiento,
         a.como_llego,
         a.motivo_estado,
         a.user_id is not null as con_usuario,
         a.creado_en,
         a.ficha_completada_en,
         a.aprobado_en,
         extract(year from pg_catalog.age(
           (public.app_ahora() at time zone p.zona_horaria)::date::timestamp,
           a.fecha_nacimiento::timestamp))::integer as edad
    from public.alumno a
    join public.profesor p on p.id = a.profesor_id
   where a.estado in ('pendiente', 'aprobado', 'rechazado', 'sin_cuenta')
     and (select privado.es_profesor());

revoke all on public.v_alumnos from public, anon, authenticated;
grant select on public.v_alumnos to authenticated;
