-- B14 · T14.2 · Alta y edición de alumnos con la persona única y el mail único global.
-- ADR-018 («Alta de alumno con un mail que ya existe», «Edición de la ficha compartida», cerrojos), DEC-29 b,
-- DEC-31, DEC-32 A, DEC-36 A (opción por defecto), ADR-019 (remitente del mail de AVI-04). contratos.md §3.
-- IDs: ALU-07, ALU-08, ALU-09, AVI-04, PRF-07, PRF-08, SEC-06, SEC-09.
-- Reemplaza `exigir_mail_libre`, `alta_alumno` y `editar_alumno` de B05 (202611000503).

drop function privado.exigir_mail_libre(uuid, text, uuid);

-- 1. Mail de un profesor o del Administrador (DEC-31): el alta y la edición dan 409 sin datos.
create function privado.mail_de_rol(p_mail text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.profesor p where pg_catalog.lower(p.mail::text) = pg_catalog.lower(p_mail))
      or exists (select 1 from privado.administrador d where pg_catalog.lower(d.mail::text) = pg_catalog.lower(p_mail))
$$;

revoke execute on function privado.mail_de_rol(text) from public, anon, authenticated;

-- 2. `alta_alumno` [P] (ALU-07, ALU-08, DEC-29 b, DEC-31). Orden: rol → profesor activo (409, PRF-08) →
--    campos (422) → mail, bajo el cerrojo por mail tomado después del de profesor (ADR-018):
--    - de un profesor o del Administrador: 409 `MAIL_YA_REGISTRADO` con `details` nulo;
--    - de una persona ya aprobada con este profesor: 409 con `{"alumno_id"}`;
--    - de una persona con ficha completa: no crea otra ni toca su ficha; su inscripción con este profesor
--      queda `aprobado` sin motivo (aunque estuviera pendiente, rechazada o en baja), `asociado: true`;
--    - de una persona con ficha incompleta: la completa con los datos cargados, como una cuenta nueva;
--    - mail nuevo: persona nueva con `creado_por` y la inscripción aprobada.
--    Con mail encola «te sumó como alumno» (AVI-04). Sin mail: persona sin cuenta con la inscripción
--    `sin_cuenta`, sin mails (ALU-08).
create or replace function privado.alta_alumno(p_nombre text, p_telefono text, p_fecha_nacimiento date, p_mail text)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_ahora timestamptz := public.app_ahora();
  v_profesor uuid := privado.profesor_de_sesion();
  v_nombre text;
  v_telefono text;
  v_mail text;
  v_persona public.alumno%rowtype;
  v_inscripcion public.inscripcion%rowtype;
  v_id uuid;
begin
  perform privado.exigir_profesor_activo(v_profesor);

  v_nombre := privado.validar_nombre(p_nombre, 'p_nombre');
  v_telefono := privado.validar_telefono(p_telefono, 'p_telefono');
  perform privado.validar_fecha_nacimiento(p_fecha_nacimiento, 'p_fecha_nacimiento');
  v_mail := privado.validar_mail_alumno(p_mail);

  if v_mail is null then
    insert into public.alumno (estado, nombre, telefono, fecha_nacimiento, creado_por)
    values ('completa', v_nombre, v_telefono, p_fecha_nacimiento, v_profesor)
    returning id into v_id;
    insert into public.inscripcion (alumno_id, profesor_id, estado, creado_en)
    values (v_id, v_profesor, 'sin_cuenta', v_ahora);
    return pg_catalog.jsonb_build_object('alumno_id', v_id, 'estado', 'sin_cuenta', 'asociado', false);
  end if;

  perform privado.bloquear_mail(v_mail);

  if privado.mail_de_rol(v_mail) then
    raise exception using errcode = 'PT409', message = 'MAIL_YA_REGISTRADO';
  end if;

  select * into v_persona from public.alumno a
   where pg_catalog.lower(a.mail::text) = pg_catalog.lower(v_mail) and a.estado <> 'borrado'
     for update;

  if v_persona.id is null then
    insert into public.alumno (estado, nombre, mail, telefono, fecha_nacimiento, creado_por)
    values ('completa', v_nombre, v_mail::extensions.citext, v_telefono, p_fecha_nacimiento, v_profesor)
    returning id into v_id;
    insert into public.inscripcion (alumno_id, profesor_id, estado, creado_en, aprobado_en)
    values (v_id, v_profesor, 'aprobado', v_ahora, v_ahora);
    perform privado.mail_alumno_sumado(v_id, v_profesor);
    return pg_catalog.jsonb_build_object('alumno_id', v_id, 'estado', 'aprobado', 'asociado', false);
  end if;

  select * into v_inscripcion from public.inscripcion i
   where i.alumno_id = v_persona.id and i.profesor_id = v_profesor
     for update;
  if v_inscripcion.estado = 'aprobado' then
    raise exception using errcode = 'PT409', message = 'MAIL_YA_REGISTRADO',
      detail = pg_catalog.jsonb_build_object('alumno_id', v_persona.id)::text;
  end if;

  if v_persona.estado = 'ficha_incompleta' then
    -- Entró y nunca completó la ficha: no hay ficha que preservar (equivale a la cuenta nueva de ALU-07).
    update public.alumno a
       set nombre = v_nombre,
           telefono = v_telefono,
           fecha_nacimiento = p_fecha_nacimiento,
           estado = 'completa',
           creado_por = v_profesor
     where a.id = v_persona.id;
  end if;

  if v_inscripcion.id is null then
    insert into public.inscripcion (alumno_id, profesor_id, estado, creado_en, aprobado_en)
    values (v_persona.id, v_profesor, 'aprobado', v_ahora, v_ahora);
  else
    update public.inscripcion i
       set estado = 'aprobado', motivo_estado = null, aprobado_en = v_ahora
     where i.id = v_inscripcion.id;
  end if;

  perform privado.mail_alumno_sumado(v_persona.id, v_profesor);

  return pg_catalog.jsonb_build_object(
    'alumno_id', v_persona.id, 'estado', 'aprobado', 'asociado', v_persona.estado = 'completa');
end;
$$;

-- 3. `editar_alumno` [P] (ALU-07, ALU-08, DEC-32 A, DEC-36 A). Orden: rol → inscripción con quien llama
--    (404) → ficha editable (403 `PROHIBIDO`: la cargó él, sin usuario y sin otro profesor) → campos (422) →
--    mail. No exige el profesor activo (ADR-018). El mail se cambia solo con la inscripción `sin_cuenta` o
--    `aprobado` (si no, 422 `{"campo":"p_mail"}`): agregarlo vuelve aprobada la inscripción (ALU-07);
--    quitarlo la deja `sin_cuenta` (ALU-08). Un mail ya usado no asocia (uniría dos personas): 409
--    `MAIL_YA_REGISTRADO`, con `alumno_id` solo si esa persona ya es alumna suya.
create or replace function privado.editar_alumno(
  p_alumno_id uuid, p_nombre text, p_telefono text, p_fecha_nacimiento date, p_mail text)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_profesor uuid := privado.profesor_de_sesion();
  v_alumno public.alumno%rowtype;
  v_inscripcion public.inscripcion%rowtype;
  v_nombre text;
  v_telefono text;
  v_mail text;
  v_estado text;
  v_otra uuid;
begin
  select i.* into v_inscripcion
    from public.inscripcion i
    join public.alumno a on a.id = i.alumno_id
   where i.alumno_id = p_alumno_id and i.profesor_id = v_profesor
     and i.estado <> 'baja' and a.estado = 'completa'
     for update of i, a;
  if not found then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
  end if;
  select * into v_alumno from public.alumno a where a.id = p_alumno_id;

  if v_alumno.creado_por is distinct from v_profesor or v_alumno.user_id is not null or v_alumno.compartida then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;

  v_nombre := privado.validar_nombre(p_nombre, 'p_nombre');
  v_telefono := privado.validar_telefono(p_telefono, 'p_telefono');
  perform privado.validar_fecha_nacimiento(p_fecha_nacimiento, 'p_fecha_nacimiento');
  v_mail := privado.validar_mail_alumno(p_mail);
  v_estado := v_inscripcion.estado;

  if pg_catalog.lower(coalesce(v_mail, '')) <> pg_catalog.lower(coalesce(v_alumno.mail::text, '')) then
    if v_inscripcion.estado not in ('sin_cuenta', 'aprobado') then
      raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_mail"}';
    end if;
    if v_mail is not null then
      perform privado.bloquear_mail(v_mail);
      if privado.mail_de_rol(v_mail) then
        raise exception using errcode = 'PT409', message = 'MAIL_YA_REGISTRADO';
      end if;
      select a.id into v_otra from public.alumno a
       where pg_catalog.lower(a.mail::text) = pg_catalog.lower(v_mail)
         and a.estado <> 'borrado' and a.id <> p_alumno_id;
      if v_otra is not null then
        raise exception using errcode = 'PT409', message = 'MAIL_YA_REGISTRADO',
          detail = pg_catalog.jsonb_build_object('alumno_id',
            case when exists (select 1 from public.inscripcion i
                               where i.alumno_id = v_otra and i.profesor_id = v_profesor
                                 and i.estado <> 'baja') then v_otra end)::text;
      end if;
    end if;
    v_estado := case when v_mail is null then 'sin_cuenta' else 'aprobado' end;
  else
    v_mail := v_alumno.mail::text;
  end if;

  update public.alumno a
     set nombre = v_nombre,
         telefono = v_telefono,
         fecha_nacimiento = p_fecha_nacimiento,
         mail = v_mail::extensions.citext
   where a.id = p_alumno_id;

  if v_estado <> v_inscripcion.estado then
    update public.inscripcion i
       set estado = v_estado,
           aprobado_en = case when v_estado = 'aprobado' then public.app_ahora() else i.aprobado_en end
     where i.id = v_inscripcion.id;
  end if;

  return pg_catalog.jsonb_build_object('alumno_id', p_alumno_id);
end;
$$;
