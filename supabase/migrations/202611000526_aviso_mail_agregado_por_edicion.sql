-- B15 · T15.0 · DEC-38 (aprobada, opción a): al agregar por edición un mail nuevo a un alumno sin cuenta,
-- `editar_alumno` encola el mismo aviso «te sumó como alumno» del alta (`privado.mail_alumno_sumado`).
-- IDs: AVI-04, ALU-08, ALU-07. Reemplaza `privado.editar_alumno` de 202611000524 (B14 aún no está en
-- producción: `create or replace`, misma firma; `public.editar_alumno` sigue delegando igual).
-- El aviso sale solo cuando la inscripción pasa de `sin_cuenta` a `aprobado` por un mail nuevo; no sale si
-- el mail no cambió, si se quita, si cambia el mail de quien ya tenía uno, ni en ninguna otra edición. El mail
-- ya usado sigue dando 409 `MAIL_YA_REGISTRADO` antes de encolar nada, y el tope de mails del profesor
-- (AVI-08) aplica igual: sobre el tope la fila nace `fallido` `TOPE` y la edición se guarda.

-- `editar_alumno` [P] (ALU-07, ALU-08, DEC-32 A, DEC-36 A, DEC-38 a). Orden: rol → inscripción con quien llama
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

  -- DEC-38 a (AVI-04): el sin cuenta que recibe un mail nuevo pasa a tener cuenta con este profesor; recibe
  -- el mismo aviso del alta, con el mail ya guardado (`encolar_mail` lo lee de la ficha y aplica los topes).
  if v_inscripcion.estado = 'sin_cuenta' and v_estado = 'aprobado' then
    perform privado.mail_alumno_sumado(p_alumno_id, v_profesor);
  end if;

  return pg_catalog.jsonb_build_object('alumno_id', p_alumno_id);
end;
$$;
