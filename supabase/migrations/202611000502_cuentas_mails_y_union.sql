-- B05 · T05.1 · Mails de cuenta (AVI-02, AVI-03), aprobación y rechazo (ALU-03, H-037) y unión de
-- alumnos (ALU-04, ALU-05). contratos.md §1 y §3; ADR-002 (RPC que delega en privado, cerrojo del
-- profesor, errores PTxxx), ADR-005 (outbox, una plantilla por tipo), ADR-013, ADR-014, SEC-06, SEC-09.

-- 1. Plantillas (ADR-005): asunto y cuerpo en texto plano; `privado.encolar_mail` sanea y aplica el tope.

-- AVI-02: al profesor, por cada cuenta nueva pendiente. Lleva el `alumno_id` que nombra (ADR-011).
-- Con el profesor todavía sin mail (ADR-015) no hay a quién escribir: no encola nada.
create function privado.mail_cuenta_nueva(p_alumno_id uuid)
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_destinatario text;
  v_nombre text;
begin
  select p.mail::text, a.nombre
    into v_destinatario, v_nombre
    from public.alumno a
    join public.profesor p on p.id = a.profesor_id
   where a.id = p_alumno_id;
  if v_destinatario is null then
    return null;
  end if;

  return privado.encolar_mail(
    'cuenta_nueva',
    p_alumno_id,
    v_destinatario,
    'Cuenta nueva pendiente de aprobación: ' || coalesce(v_nombre, ''),
    'Hay una cuenta nueva pendiente de aprobación.' || E'\n\n'
      || 'Nombre: ' || coalesce(v_nombre, '') || E'\n\n'
      || 'Entrá a la lista de alumnos para ver su ficha y aprobarla o rechazarla.' || E'\n');
end;
$$;

-- AVI-03: al titular, cuando el profesor aprueba o rechaza su cuenta, con el motivo si lo escribió.
create function privado.mail_cuenta_respondida(p_alumno_id uuid, p_estado text, p_motivo text)
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_nombre text;
  v_aprobada boolean := p_estado = 'aprobado';
begin
  select a.nombre into v_nombre from public.alumno a where a.id = p_alumno_id;

  return privado.encolar_mail(
    'cuenta_respondida',
    p_alumno_id,
    null,
    case when v_aprobada then 'Tu cuenta fue aprobada' else 'Tu cuenta fue rechazada' end,
    'Hola' || coalesce(' ' || v_nombre, '') || ',' || E'\n\n'
      || case when v_aprobada
              then 'El profesor aprobó tu cuenta. Ya podés pedir clases desde la agenda.'
              else 'El profesor rechazó tu cuenta, así que por ahora no podés pedir clases.' end
      || case when p_motivo is null then ''
              when v_aprobada then E'\n\n' || 'Mensaje del profesor: ' || p_motivo
              else E'\n\n' || 'Motivo: ' || p_motivo end
      || E'\n');
end;
$$;

revoke execute on function privado.mail_cuenta_nueva(uuid), privado.mail_cuenta_respondida(uuid, text, text)
  from public, anon, authenticated;

-- 2. AVI-02 con `completar_ficha` (B04): la ficha pasa de `ficha_incompleta` a `pendiente` solo ahí.
--    El trigger corre en la misma transacción: con 429 (ALU-13) no hay update y no hay mail.
create function privado.al_completar_ficha()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.mail_cuenta_nueva(new.id);
  return null;
end;
$$;

revoke execute on function privado.al_completar_ficha() from public, anon, authenticated;

create trigger al_completar_ficha
  after update of estado on public.alumno
  for each row
  when (old.estado = 'ficha_incompleta' and new.estado = 'pendiente')
  execute function privado.al_completar_ficha();

-- 3. `aprobar_cuenta` / `rechazar_cuenta` [P] (ALU-03, AVI-03, DEC-01 A). Orden: rol → cuenta → estado
--    → motivo. Se responde una cuenta pendiente; una rechazada se puede aprobar después. Otro estado:
--    409 `CUENTA_NO_PENDIENTE` (código propuesto: contratos.md §3 dice 409 sin nombrarlo; ver handoff).
--    H-037: `motivo_estado` se reemplaza siempre, con el motivo nuevo o con null, así una cuenta aprobada
--    no conserva el motivo de un rechazo anterior.
create function privado.responder_cuenta(p_alumno_id uuid, p_estado text, p_motivo text)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_profesor uuid;
  v_estado text;
  v_motivo text;
begin
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'NO_AUTENTICADO';
  end if;
  if not privado.es_profesor() then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;

  select p.id into v_profesor from public.profesor p where p.user_id = auth.uid();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profesor::text, 0));

  select a.estado into v_estado
    from public.alumno a
   where a.id = p_alumno_id and a.profesor_id = v_profesor
     for update;
  if not found or v_estado = 'borrado' then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
  end if;
  if not (v_estado = 'pendiente' or (p_estado = 'aprobado' and v_estado = 'rechazado')) then
    raise exception using errcode = 'PT409', message = 'CUENTA_NO_PENDIENTE',
      detail = pg_catalog.jsonb_build_object('estado', v_estado)::text;
  end if;

  v_motivo := privado.validar_motivo(p_motivo);

  update public.alumno a
     set estado = p_estado,
         motivo_estado = v_motivo,
         aprobado_en = case when p_estado = 'aprobado' then public.app_ahora() else a.aprobado_en end
   where a.id = p_alumno_id;

  perform privado.mail_cuenta_respondida(p_alumno_id, p_estado, v_motivo);

  return pg_catalog.jsonb_build_object(
    'estado', p_estado,
    'sugerencias', case when p_estado = 'aprobado' then privado.sugerencias_de(p_alumno_id) else '[]'::jsonb end);
end;
$$;

create function privado.aprobar_cuenta(p_alumno_id uuid, p_motivo text)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select privado.responder_cuenta(p_alumno_id, 'aprobado', p_motivo)
$$;

create function privado.rechazar_cuenta(p_alumno_id uuid, p_motivo text)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select privado.responder_cuenta(p_alumno_id, 'rechazado', p_motivo)
$$;

create function public.aprobar_cuenta(p_alumno_id uuid, p_motivo text default null)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select privado.aprobar_cuenta(p_alumno_id, p_motivo)
$$;

create function public.rechazar_cuenta(p_alumno_id uuid, p_motivo text default null)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select privado.rechazar_cuenta(p_alumno_id, p_motivo)
$$;

-- 4. `sugerencias_union` [P] (ALU-04): lectura, sin cerrojo.
create function privado.sugerencias_union(p_alumno_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'NO_AUTENTICADO';
  end if;
  if not privado.es_profesor() then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;
  if not exists (
       select 1
         from public.alumno a
         join public.profesor p on p.id = a.profesor_id
        where a.id = p_alumno_id and p.user_id = auth.uid() and a.estado <> 'borrado') then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
  end if;
  return privado.sugerencias_de(p_alumno_id);
end;
$$;

create function public.sugerencias_union(p_alumno_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select privado.sugerencias_union(p_alumno_id)
$$;

-- 5. Par de unión (ALU-04): rol, cerrojo y validación compartidos por `unir_alumnos` y `descartar_union`.
--    404 si falta alguno de los dos (o está borrado). 409 `UNION_NO_VALIDA` (código propuesto, ver
--    handoff) si el segundo no es un alumno sin cuenta, si el primero no es una cuenta (aprobada, para
--    unir: ALU-05 pasa todo «a la cuenta aprobada») o si sus `telefono_clave` no coinciden.
create function privado.validar_par_union(p_cuenta_id uuid, p_sin_cuenta_id uuid, p_para_unir boolean)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_profesor uuid;
  v_cuenta public.alumno%rowtype;
  v_sin_cuenta public.alumno%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'NO_AUTENTICADO';
  end if;
  if not privado.es_profesor() then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;

  select p.id into v_profesor from public.profesor p where p.user_id = auth.uid();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profesor::text, 0));

  select * into v_cuenta from public.alumno a
   where a.id = p_cuenta_id and a.profesor_id = v_profesor and a.estado <> 'borrado'
     for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
  end if;
  select * into v_sin_cuenta from public.alumno a
   where a.id = p_sin_cuenta_id and a.profesor_id = v_profesor and a.estado <> 'borrado'
     for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
  end if;

  if v_sin_cuenta.estado <> 'sin_cuenta'
     or v_cuenta.id = v_sin_cuenta.id
     or (p_para_unir and v_cuenta.estado <> 'aprobado')
     or (not p_para_unir and v_cuenta.estado not in ('pendiente', 'aprobado', 'rechazado'))
     or v_cuenta.telefono_clave is null
     or v_cuenta.telefono_clave <> v_sin_cuenta.telefono_clave then
    raise exception using errcode = 'PT409', message = 'UNION_NO_VALIDA';
  end if;
end;
$$;

-- `unir_alumnos` [P] (ALU-05, NFR-03): reasigna al alumno con cuenta todo lo que apunta al sin cuenta
-- (reservas, clases, personas a cargo, mails y lo que agreguen bolts siguientes, como las solicitudes),
-- recorriendo las FK hacia `alumno(id)` del catálogo, y borra el sin cuenta. Una transacción.
create function privado.unir_alumnos(p_cuenta_id uuid, p_sin_cuenta_id uuid)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_fk record;
begin
  perform privado.validar_par_union(p_cuenta_id, p_sin_cuenta_id, true);

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
create function privado.descartar_union(p_cuenta_id uuid, p_sin_cuenta_id uuid)
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

create function public.unir_alumnos(p_cuenta_id uuid, p_sin_cuenta_id uuid)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select privado.unir_alumnos(p_cuenta_id, p_sin_cuenta_id)
$$;

create function public.descartar_union(p_cuenta_id uuid, p_sin_cuenta_id uuid)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select privado.descartar_union(p_cuenta_id, p_sin_cuenta_id)
$$;

-- 6. Permisos (SEC-04): las RPC [P] solo para `authenticated` (el rol se comprueba adentro, SEC-06).
revoke execute on function
  privado.responder_cuenta(uuid, text, text),
  privado.aprobar_cuenta(uuid, text),
  privado.rechazar_cuenta(uuid, text),
  privado.sugerencias_union(uuid),
  privado.validar_par_union(uuid, uuid, boolean),
  privado.unir_alumnos(uuid, uuid),
  privado.descartar_union(uuid, uuid)
  from public, anon, authenticated;

revoke execute on function
  public.aprobar_cuenta(uuid, text),
  public.rechazar_cuenta(uuid, text),
  public.sugerencias_union(uuid),
  public.unir_alumnos(uuid, uuid),
  public.descartar_union(uuid, uuid)
  from public, anon;

grant execute on function
  public.aprobar_cuenta(uuid, text),
  public.rechazar_cuenta(uuid, text),
  public.sugerencias_union(uuid),
  public.unir_alumnos(uuid, uuid),
  public.descartar_union(uuid, uuid)
  to authenticated;
