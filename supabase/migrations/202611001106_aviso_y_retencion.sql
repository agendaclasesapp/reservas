-- B11 · T11.1 (segunda parte) · Aviso de inactividad 7 días antes del borrado y retención con registro.
-- IDs: AVI-06, AVI-07, ALU-10, ALU-11, SEC-28, SEC-29, CA-32. ADR-011 (aviso y marca `aviso_inactividad_en`;
-- cada corrida en `privado.ejecucion_proceso`), ADR-019 (mail de la aplicación: el nombre del servicio, sin
-- Reply-To y `profesor_id` nulo), DEC-26 A (el plazo es de la persona, con todos sus profesores).

-- 1. Mail `aviso_inactividad` (AVI-06, AVI-07): de la aplicación, no de un profesor, así que `p_profesor_id`
--    es nulo y `encolar_mail` pone «Agenda Clases App» como remitente, sin Reply-To, y solo el tope global.
--    Va a la persona; sin mail (alumno sin cuenta) o borrada, no encola y devuelve null. La fecha es el día del
--    vencimiento en el huso de la aplicación (`privado.ajustes.zona_horaria_app`). Sin fecha de nacimiento ni
--    datos de personas a cargo (SEC-29).
create function privado.mail_aviso_inactividad(p_alumno_id uuid, p_vence_en timestamptz)
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_nombre text;
  v_zona text;
begin
  select a.nombre into v_nombre from public.alumno a where a.id = p_alumno_id;
  select aj.zona_horaria_app into v_zona from privado.ajustes aj;

  return privado.encolar_mail(
    'aviso_inactividad',
    null,
    p_alumno_id,
    null,
    'Tus datos en Agenda Clases App se borran en 7 días',
    'Hola' || coalesce(' ' || v_nombre, '') || ',' || E'\n\n'
      || 'Tu cuenta de Agenda Clases App lleva casi 6 meses sin clases ni ingresos. A partir del '
      || pg_catalog.to_char(p_vence_en at time zone coalesce(v_zona, 'UTC'), 'DD/MM/YYYY')
      || ' vamos a borrar tus datos: nombre, mail, teléfono, fecha de nacimiento, personas a cargo y tu cuenta.'
      || E'\n\n'
      || 'Si querés conservarlos, ingresá a la aplicación con este mail antes de esa fecha.' || E'\n\n'
      || 'Este mensaje es automático.' || E'\n');
end;
$$;

-- 2. Pasos de la retención (ALU-10, AVI-06, DEC-26 A):
--    a) Aviso: a cada persona con vencimiento en `(p_ahora, p_ahora + 7 días]` que todavía no tuvo aviso para
--       ese vencimiento. «Todavía no»: `aviso_inactividad_en` nulo o anterior a `vence_en - 7 días` (un aviso
--       de un vencimiento anterior, que una clase posterior corrió, no cuenta). El ingreso limpia la marca
--       (ALU-11, 202611001101). Bloquea la fila, recalcula y marca `aviso_inactividad_en = p_ahora` aunque no
--       haya mail (la persona ya tuvo su aviso). Con el job diario, el aviso sale entre 7 y 6 días antes (CA-32).
--    b) Borrado: el bucle de la primera parte, igual (bloquear, recalcular, `privado.anonimizar_alumno`).
--    Devuelve `{"avisos": <encolados>, "anonimizados": n}`.
create function privado.pasos_retencion(p_ahora timestamptz)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_id uuid;
  v_vence timestamptz;
  v_marca timestamptz;
  v_avisos integer := 0;
  v_anonimizados integer := 0;
begin
  for v_id in
    select v.alumno_id
      from privado.vencimientos_inactividad(p_ahora) v
      join public.alumno a on a.id = v.alumno_id
     where v.vence_en > p_ahora
       and v.vence_en <= p_ahora + interval '7 days'
       and (a.aviso_inactividad_en is null or a.aviso_inactividad_en < v.vence_en - interval '7 days')
     order by v.alumno_id
  loop
    select a.aviso_inactividad_en into v_marca from public.alumno a where a.id = v_id for update;
    v_vence := privado.vence_inactividad_en(v_id, p_ahora);
    if v_vence is not null and v_vence > p_ahora and v_vence <= p_ahora + interval '7 days'
       and (v_marca is null or v_marca < v_vence - interval '7 days') then
      if privado.mail_aviso_inactividad(v_id, v_vence) is not null then
        v_avisos := v_avisos + 1;
      end if;
      update public.alumno a set aviso_inactividad_en = p_ahora where a.id = v_id;
    end if;
  end loop;

  for v_id in
    select v.alumno_id
      from privado.vencimientos_inactividad(p_ahora) v
     where v.vence_en <= p_ahora
     order by v.alumno_id
  loop
    perform 1 from public.alumno a where a.id = v_id for update;
    v_vence := privado.vence_inactividad_en(v_id, p_ahora);
    if v_vence is not null and v_vence <= p_ahora then
      perform privado.anonimizar_alumno(v_id, p_ahora);
      v_anonimizados := v_anonimizados + 1;
    end if;
  end loop;

  return pg_catalog.jsonb_build_object('avisos', v_avisos, 'anonimizados', v_anonimizados);
end;
$$;

-- 3. `privado.retencion(p_ahora)` (ALU-10, AVI-06, SEC-28): misma firma que la primera parte (202611001102),
--    ahora con el aviso y el registro. Corre los pasos en una subtransacción: un error los deshace todos y queda
--    en `privado.ejecucion_proceso` con `ok = false`; no relanza (lo hace `privado.correr_proceso`, 202611001107).
--    Devuelve `{"ok": true, "avisos": n, "anonimizados": n}` o `{"ok": false, "error": "<SQLSTATE>: <mensaje>"}`.
create or replace function privado.retencion(p_ahora timestamptz default public.app_ahora())
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_inicio timestamptz := pg_catalog.clock_timestamp();
  v_cantidades jsonb;
  v_estado text;
  v_mensaje text;
begin
  begin
    v_cantidades := privado.pasos_retencion(p_ahora);
  exception when others then
    get stacked diagnostics v_estado = returned_sqlstate, v_mensaje = message_text;
  end;

  return privado.registrar_ejecucion('retencion', p_ahora, v_inicio, v_cantidades,
                                     case when v_estado is not null then v_estado || ': ' || v_mensaje end);
end;
$$;

revoke execute on function
  privado.mail_aviso_inactividad(uuid, timestamptz),
  privado.pasos_retencion(timestamptz),
  privado.retencion(timestamptz)
  from public, anon, authenticated;
