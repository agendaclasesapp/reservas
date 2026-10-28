-- B11 · T11.1 (segunda parte) · Recordatorio del día anterior a cada clase confirmada.
-- IDs: AVI-05, AVI-07, SEC-29, SEC-28, CA-31. ADR-008 (ventana y marca `recordatorio_en`, DEC-10 a), ADR-019
-- (remitente: el nombre del profesor y Reply-To a su mail, lo fija `encolar_mail` por el tipo), ADR-005 (outbox
-- en la misma transacción), ADR-014 (`app_ahora()`).

-- 1. Mail `recordatorio` al titular de una clase (AVI-05, AVI-07). Igual que los mails de gestión de clases
--    (B09): solo a una persona con inscripción `aprobado` con ese profesor (un alumno sin cuenta no recibe
--    mails, AVI-04); persona borrada o sin mail: `encolar_mail` no encola y devuelve null. De la persona a
--    cargo va solo el nombre; ninguna fecha de nacimiento (SEC-29). Fecha y hora en el huso del profesor.
create function privado.mail_recordatorio(p_clase_id uuid)
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_clase public.clase%rowtype;
  v_vinculo text;
  v_profesor text;
  v_zona text;
  v_titular text;
  v_quien text;
begin
  select c.* into v_clase from public.clase c where c.id = p_clase_id;
  if not found then
    return null;
  end if;

  select i.estado into v_vinculo
    from public.inscripcion i
   where i.alumno_id = v_clase.alumno_id and i.profesor_id = v_clase.profesor_id;
  if v_vinculo is distinct from 'aprobado' then
    return null;
  end if;

  select coalesce(privado.nombre_remitente(p.nombre), 'Tu profesor'), p.zona_horaria
    into v_profesor, v_zona
    from public.profesor p where p.id = v_clase.profesor_id;
  select a.nombre into v_titular from public.alumno a where a.id = v_clase.alumno_id;
  select pc.nombre into v_quien from public.persona_a_cargo pc where pc.id = v_clase.persona_a_cargo_id;

  return privado.encolar_mail(
    'recordatorio',
    v_clase.profesor_id,
    v_clase.alumno_id,
    null,
    'Recordatorio: tu clase con ' || v_profesor,
    'Hola' || coalesce(' ' || v_titular, '') || ',' || E'\n\n'
      || 'Te recordamos tu clase con ' || v_profesor || ' el '
      || privado.gestion_cuando(v_clase.inicio, v_zona) || '.' || E'\n'
      || case when v_quien is not null then 'Toma la clase: ' || v_quien || E'\n' else '' end
      || E'\n' || 'Podés ver tus clases en Mis clases. Si tenés dudas, respondé este mail.' || E'\n');
end;
$$;

-- 2. Pasos del proceso (ADR-008, CA-31, DEC-10 a): clases `confirmada` sin `recordatorio_en`, con
--    `inicio ∈ (p_ahora + 23 h 45 min, p_ahora + 24 h]` y confirmadas al menos 24 h antes del inicio (una clase
--    confirmada con menos de 24 h no tiene recordatorio). Con el job cada 15 minutos cada clase cae en una sola
--    corrida, y la marca `recordatorio_en` en la misma transacción que el encolado impide un segundo mail: exactamente
--    uno (CA-31). Una corrida atrasada que deja una clase fuera de la ventana no la manda. La marca se pone aunque
--    no haya mail (alumno sin cuenta o sin mail): la clase ya tuvo su turno.
--    Cerrojos: el del profesor primero y después las filas de sus clases, en el mismo orden que sus RPC (ADR-002),
--    y se vuelve a filtrar con el cerrojo tomado (una clase cancelada o movida en el medio no recibe recordatorio).
--    Devuelve `{"recordatorios": <encolados>, "sin_mail": <marcadas sin mail>}`.
create function privado.pasos_recordatorios(p_ahora timestamptz)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_profesor uuid;
  v_clase uuid;
  v_encolados integer := 0;
  v_sin_mail integer := 0;
begin
  for v_profesor in
    select distinct c.profesor_id
      from public.clase c
     where c.estado = 'confirmada'
       and c.recordatorio_en is null
       and c.inicio > p_ahora + interval '23 hours 45 minutes'
       and c.inicio <= p_ahora + interval '24 hours'
     order by c.profesor_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profesor::text, 0));

    for v_clase in
      select c.id
        from public.clase c
       where c.profesor_id = v_profesor
         and c.estado = 'confirmada'
         and c.recordatorio_en is null
         and c.inicio > p_ahora + interval '23 hours 45 minutes'
         and c.inicio <= p_ahora + interval '24 hours'
       order by c.inicio, c.id
         for update
    loop
      update public.clase c set recordatorio_en = p_ahora where c.id = v_clase;

      -- DEC-10 a: sin recordatorio si se confirmó con menos de 24 h de anticipación (queda marcada igual).
      if exists (select 1 from public.clase c
                  where c.id = v_clase
                    and coalesce(c.confirmada_en, c.inicio - interval '24 hours') <= c.inicio - interval '24 hours') then
        if privado.mail_recordatorio(v_clase) is not null then
          v_encolados := v_encolados + 1;
        else
          v_sin_mail := v_sin_mail + 1;
        end if;
      end if;
    end loop;
  end loop;

  return pg_catalog.jsonb_build_object('recordatorios', v_encolados, 'sin_mail', v_sin_mail);
end;
$$;

-- 3. `privado.recordatorios(p_ahora)` (AVI-05, SEC-28): el job. Corre los pasos en una subtransacción; un
--    error deshace solo los pasos (ningún recordatorio a medias) y queda en `privado.ejecucion_proceso` con
--    `ok = false`. No relanza: lo relanza `privado.correr_proceso` después de confirmar la fila, para que
--    `cron.job_run_details` marque la corrida fallida (202611001107). Devuelve
--    `{"ok": true, "recordatorios": n, "sin_mail": n}` o `{"ok": false, "error": "<SQLSTATE>: <mensaje>"}`.
create function privado.recordatorios(p_ahora timestamptz default public.app_ahora())
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
    v_cantidades := privado.pasos_recordatorios(p_ahora);
  exception when others then
    get stacked diagnostics v_estado = returned_sqlstate, v_mensaje = message_text;
  end;

  return privado.registrar_ejecucion('recordatorios', p_ahora, v_inicio, v_cantidades,
                                     case when v_estado is not null then v_estado || ': ' || v_mensaje end);
end;
$$;

revoke execute on function
  privado.mail_recordatorio(uuid),
  privado.pasos_recordatorios(timestamptz),
  privado.recordatorios(timestamptz)
  from public, anon, authenticated;
