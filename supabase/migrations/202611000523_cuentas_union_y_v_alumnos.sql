-- B14 · T14.2 · Aprobación por profesor, unión por profesor y lista de alumnos por inscripción.
-- ADR-018 (inscripción, profesor inactivo, edición de la ficha compartida, unión), ADR-013 (regla 3: fusión
-- previa al bucle), ADR-002, ADR-014. contratos.md §2 (`v_alumnos`) y §3.
-- IDs: ALU-03, ALU-04, ALU-05, ALU-09, AVI-03, PRF-07, PRF-08, SEC-06, SEC-09.
-- Reemplaza `responder_cuenta`, `sugerencias_de`, `sugerencias_union`, `validar_par_union`, `unir_alumnos`,
-- `descartar_union` (202611000501, 202611000502) y el cuerpo de `v_alumnos` (los triggers de solo lectura de
-- 202611000504 siguen).

-- 1. Profesor de la sesión para las RPC [P] (SEC-06): 401 sin `sub`; 403 si no es profesor (el
--    Administrador que no es profesor incluido, ADM-04). El `profesor_id` sale siempre de `mi_profesor_id()`.
--    Toma el cerrojo del profesor (ADR-002).
create function privado.profesor_de_sesion()
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_profesor_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'NO_AUTENTICADO';
  end if;
  v_profesor_id := privado.mi_profesor_id();
  if v_profesor_id is null then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profesor_id::text, 0));
  return v_profesor_id;
end;
$$;

revoke execute on function privado.profesor_de_sesion() from public, anon, authenticated;

-- 2. Ficha compartida (DEC-32 A): `alumno.compartida` dice si la persona tiene inscripción (no en `baja`) con
--    más de un profesor. La mantiene un trigger de `inscripcion`, porque la RLS no deja a un profesor ver las
--    inscripciones de otro y `v_alumnos` es `security_invoker`. Solo dice lo mismo que `editable` = false.
--    No encola mails ni aplica topes (ADR-013, regla 5).
alter table public.alumno add column compartida boolean not null default false;

update public.alumno a
   set compartida = (select pg_catalog.count(distinct i.profesor_id) > 1
                       from public.inscripcion i
                      where i.alumno_id = a.id and i.estado <> 'baja');

create function privado.inscripcion_compartida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if tg_op = 'INSERT' then
    v_ids := array[new.alumno_id];
  elsif tg_op = 'UPDATE' then
    v_ids := array[new.alumno_id, old.alumno_id];
  else
    v_ids := array[old.alumno_id];
  end if;

  update public.alumno a
     set compartida = (select pg_catalog.count(distinct i.profesor_id) > 1
                         from public.inscripcion i
                        where i.alumno_id = a.id and i.estado <> 'baja')
   where a.id = any (v_ids);
  return null;
end;
$$;

revoke execute on function privado.inscripcion_compartida() from public, anon, authenticated;

create trigger inscripcion_compartida
  after insert or delete or update of alumno_id, profesor_id, estado on public.inscripcion
  for each row execute function privado.inscripcion_compartida();

-- 3. Sugerencias de unión de una persona con un profesor (ALU-04, DEC-03 a y b, CA-58): alumnos sin cuenta
--    de ese profesor con el mismo `telefono_clave`, menos los descartados. Nunca los de otro profesor.
drop function privado.sugerencias_de(uuid);

create function privado.sugerencias_de(p_cuenta_id uuid, p_profesor_id uuid)
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
    join public.inscripcion ic
      on ic.alumno_id = c.id
     and ic.profesor_id = p_profesor_id
     and ic.estado in ('pendiente', 'aprobado', 'rechazado')
    join public.alumno s
      on s.telefono_clave = c.telefono_clave
     and s.id <> c.id
     and s.estado <> 'borrado'
    join public.inscripcion isc
      on isc.alumno_id = s.id
     and isc.profesor_id = p_profesor_id
     and isc.estado = 'sin_cuenta'
   where c.id = p_cuenta_id
     and c.estado <> 'borrado'
     and not exists (
           select 1 from privado.union_descartada d
            where d.cuenta_id = c.id and d.sin_cuenta_id = s.id)
$$;

revoke execute on function privado.sugerencias_de(uuid, uuid) from public, anon, authenticated;

-- 4. `aprobar_cuenta` / `rechazar_cuenta` [P] (ALU-03, AVI-03, DEC-01 A, DEC-28) sobre la inscripción de la
--    persona con quien llama. Orden: rol → inscripción (404 si no hay o está en `baja`) → profesor activo
--    para aprobar (409, PRF-08) → estado (409 `CUENTA_NO_PENDIENTE`) → motivo (422). `motivo_estado` se
--    reemplaza siempre (H-037). Lo de otro profesor no cambia.
create or replace function privado.responder_cuenta(p_alumno_id uuid, p_estado text, p_motivo text)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_profesor uuid := privado.profesor_de_sesion();
  v_inscripcion public.inscripcion%rowtype;
  v_motivo text;
begin
  select i.* into v_inscripcion
    from public.inscripcion i
    join public.alumno a on a.id = i.alumno_id
   where i.alumno_id = p_alumno_id and i.profesor_id = v_profesor
     and i.estado <> 'baja' and a.estado <> 'borrado'
     for update of i;
  if not found then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
  end if;

  if p_estado = 'aprobado' then
    perform privado.exigir_profesor_activo(v_profesor);
  end if;

  if not (v_inscripcion.estado = 'pendiente' or (p_estado = 'aprobado' and v_inscripcion.estado = 'rechazado')) then
    raise exception using errcode = 'PT409', message = 'CUENTA_NO_PENDIENTE',
      detail = pg_catalog.jsonb_build_object('estado', v_inscripcion.estado)::text;
  end if;

  v_motivo := privado.validar_motivo(p_motivo);

  update public.inscripcion i
     set estado = p_estado,
         motivo_estado = v_motivo,
         aprobado_en = case when p_estado = 'aprobado' then public.app_ahora() else i.aprobado_en end
   where i.id = v_inscripcion.id;

  perform privado.mail_cuenta_respondida(p_alumno_id, v_profesor, p_estado, v_motivo);

  return pg_catalog.jsonb_build_object(
    'estado', p_estado,
    'sugerencias', case when p_estado = 'aprobado' then privado.sugerencias_de(p_alumno_id, v_profesor)
                        else '[]'::jsonb end);
end;
$$;

-- 5. `sugerencias_union` [P] (ALU-04): lectura; 404 sin inscripción con quien llama.
create or replace function privado.sugerencias_union(p_alumno_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_profesor uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'NO_AUTENTICADO';
  end if;
  v_profesor := privado.mi_profesor_id();
  if v_profesor is null then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;
  if not exists (
       select 1
         from public.inscripcion i
         join public.alumno a on a.id = i.alumno_id
        where i.alumno_id = p_alumno_id and i.profesor_id = v_profesor
          and i.estado <> 'baja' and a.estado <> 'borrado') then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
  end if;
  return privado.sugerencias_de(p_alumno_id, v_profesor);
end;
$$;

-- 6. Par de unión (ALU-04, ALU-05, CA-58): los dos inscriptos con quien llama (si no, 404). 409
--    `UNION_NO_VALIDA` si el segundo no es un sin cuenta de ese profesor (o tiene otra inscripción), si la
--    inscripción del primero no es `aprobado` (para unir) o pendiente, aprobada o rechazada (para
--    descartar), o si sus `telefono_clave` no coinciden. Devuelve el profesor.
drop function privado.validar_par_union(uuid, uuid, boolean);

create function privado.validar_par_union(p_cuenta_id uuid, p_sin_cuenta_id uuid, p_para_unir boolean)
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_profesor uuid := privado.profesor_de_sesion();
  v_cuenta public.alumno%rowtype;
  v_sin_cuenta public.alumno%rowtype;
  v_estado_cuenta text;
  v_estado_sin_cuenta text;
begin
  select i.estado into v_estado_cuenta
    from public.alumno a
    join public.inscripcion i on i.alumno_id = a.id and i.profesor_id = v_profesor and i.estado <> 'baja'
   where a.id = p_cuenta_id and a.estado <> 'borrado'
     for update of a, i;
  if not found then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
  end if;
  select i.estado into v_estado_sin_cuenta
    from public.alumno a
    join public.inscripcion i on i.alumno_id = a.id and i.profesor_id = v_profesor and i.estado <> 'baja'
   where a.id = p_sin_cuenta_id and a.estado <> 'borrado'
     for update of a, i;
  if not found then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
  end if;
  select * into v_cuenta from public.alumno a where a.id = p_cuenta_id;
  select * into v_sin_cuenta from public.alumno a where a.id = p_sin_cuenta_id;

  if v_estado_sin_cuenta <> 'sin_cuenta'
     or v_cuenta.id = v_sin_cuenta.id
     or (p_para_unir and v_estado_cuenta <> 'aprobado')
     or (not p_para_unir and v_estado_cuenta not in ('pendiente', 'aprobado', 'rechazado'))
     or v_cuenta.telefono_clave is null
     or v_cuenta.telefono_clave <> v_sin_cuenta.telefono_clave
     or exists (select 1 from public.inscripcion o
                 where o.alumno_id = p_sin_cuenta_id and o.profesor_id <> v_profesor) then
    raise exception using errcode = 'PT409', message = 'UNION_NO_VALIDA';
  end if;
  return v_profesor;
end;
$$;

-- `unir_alumnos` [P] (ALU-05, NFR-03): fusión de inscripciones antes del bucle genérico (ADR-013 regla 3,
-- ADR-018): la cuenta ya tiene la suya aprobada con este profesor y el sin cuenta solo tiene esa, así que la
-- del sin cuenta se borra. Después el bucle reasigna a la cuenta toda FK hacia `alumno(id)` (reservas,
-- clases, personas a cargo, mails y lo que agreguen bolts siguientes) y se borra el sin cuenta.
create or replace function privado.unir_alumnos(p_cuenta_id uuid, p_sin_cuenta_id uuid)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_profesor uuid;
  v_fk record;
begin
  v_profesor := privado.validar_par_union(p_cuenta_id, p_sin_cuenta_id, true);

  delete from public.inscripcion i
   where i.alumno_id = p_sin_cuenta_id and i.profesor_id = v_profesor;

  for v_fk in
    select n.nspname as esquema, c.relname as tabla, att.attname as columna
      from pg_catalog.pg_constraint k
      join pg_catalog.pg_class c on c.oid = k.conrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      join pg_catalog.pg_attribute att on att.attrelid = k.conrelid and att.attnum = k.conkey[1]
     where k.contype = 'f'
       and k.confrelid = 'public.alumno'::pg_catalog.regclass
       and pg_catalog.array_length(k.conkey, 1) = 1
       and k.conrelid <> 'privado.union_descartada'::pg_catalog.regclass
     order by 1, 2, 3
  loop
    execute pg_catalog.format('update %I.%I set %I = $1 where %I = $2',
                              v_fk.esquema, v_fk.tabla, v_fk.columna, v_fk.columna)
      using p_cuenta_id, p_sin_cuenta_id;
  end loop;

  -- Las uniones descartadas del sin cuenta se van con él (on delete cascade).
  delete from public.alumno a where a.id = p_sin_cuenta_id;

  return pg_catalog.jsonb_build_object('cuenta_id', p_cuenta_id);
end;
$$;

-- `descartar_union` [P] (ALU-04, DEC-03 b): la sugerencia no vuelve a aparecer. Repetirlo no cambia nada.
create or replace function privado.descartar_union(p_cuenta_id uuid, p_sin_cuenta_id uuid)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
begin
  perform privado.validar_par_union(p_cuenta_id, p_sin_cuenta_id, false);

  insert into privado.union_descartada (cuenta_id, sin_cuenta_id)
  values (p_cuenta_id, p_sin_cuenta_id)
  on conflict do nothing;

  return pg_catalog.jsonb_build_object('cuenta_id', p_cuenta_id);
end;
$$;

revoke execute on function privado.validar_par_union(uuid, uuid, boolean) from public, anon, authenticated;

-- 7. `v_alumnos` (ALU-09, PRF-07; contratos.md §2): una fila por inscripción con quien mira, sin `baja` ni
--    fichas incompletas o borradas. Estado, «cómo llegó», motivo, alta y aprobación son de la inscripción;
--    el resto, de la persona. `editable` (DEC-32 A): la cargó él, sin usuario de Auth y sin otro profesor.
--    `security_invoker` (SEC-05) más el filtro explícito por `mi_profesor_id()`: la persona ve sus propias
--    inscripciones por RLS y aquí no ve nada (SEC-02). Edad con `app_ahora()` en el huso del profesor.
--    Mismas columnas y orden que B05 más `editable` al final (los triggers de 202611000504 siguen).
create or replace view public.v_alumnos
with (security_invoker = true)
as
  select a.id,
         i.estado,
         a.nombre,
         a.mail::text as mail,
         a.telefono,
         a.fecha_nacimiento,
         i.como_llego,
         i.motivo_estado,
         a.user_id is not null as con_usuario,
         i.creado_en,
         a.ficha_completada_en,
         i.aprobado_en,
         extract(year from pg_catalog.age(
           (public.app_ahora() at time zone p.zona_horaria)::date::timestamp,
           a.fecha_nacimiento::timestamp))::integer as edad,
         (a.creado_por is not distinct from i.profesor_id and a.user_id is null and not a.compartida) as editable
    from public.inscripcion i
    join public.alumno a on a.id = i.alumno_id
    join public.profesor p on p.id = i.profesor_id
   where i.profesor_id = (select privado.mi_profesor_id())
     and i.estado <> 'baja'
     and a.estado = 'completa';

revoke all on public.v_alumnos from public, anon, authenticated;
grant select on public.v_alumnos to authenticated;
