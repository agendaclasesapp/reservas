-- B14 · T14.2 · Outbox de mails con varios profesores: remitente y Reply-To por fila, tope por profesor y
-- global, y las plantillas de cuenta (cuenta nueva, cuenta respondida, alumno sumado).
-- ADR-019 (remitente, Reply-To, topes), ADR-005 (outbox), ADR-016, ADR-014 (`app_ahora()`), contratos.md §4.
-- IDs: AVI-02, AVI-03, AVI-04, AVI-07, AVI-08, NFR-09, SEC-10, SEC-11.
-- Reemplaza `privado.encolar_mail` de cinco argumentos (B03, 202611000301 y 202611000303), que tomaba el
-- profesor de `alumno.profesor_id` o con `limit 1`, y las plantillas de B05 (202611000502).

-- 1. Tipos nuevos (ADR-019): `alumno_sumado` (AVI-04, ALU-07) y `profesor_alta` (B15).
alter table public.mail_salida drop constraint mail_salida_tipo_check;
alter table public.mail_salida add constraint mail_salida_tipo_check check (tipo in (
  'cuenta_nueva', 'solicitud_nueva', 'cuenta_respondida', 'solicitud_respondida', 'clase_creada',
  'clase_movida', 'clase_cancelada', 'alumno_sumado', 'recordatorio', 'aviso_inactividad', 'profesor_alta'));

-- 2. Nombre visible del remitente (ADR-019, SEC-11): sin controles, comillas, `<`, `>` ni `\`, hasta 70
--    caracteres. La Edge Function lo pasa a nodemailer como objeto (`{name, address}`), que lo codifica.
create function privado.nombre_remitente(p_nombre text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    pg_catalog.left(
      pg_catalog.btrim(pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(coalesce(p_nombre, ''), '[[:cntrl:]\u0080-\u009f  "<>\\]+', ' ', 'g'),
        '[[:space:]]+', ' ', 'g')),
      70),
    '')
$$;

revoke execute on function privado.nombre_remitente(text) from public, anon, authenticated;

-- 3. `privado.encolar_mail(p_tipo, p_profesor_id, p_alumno_id, p_destinatario, p_asunto, p_cuerpo)`
--    (ADR-019, contratos.md §4). Lo llaman las plantillas de cada bolt dentro de la transacción de su RPC o
--    job: si la operación falla, no queda mail.
--    - `p_profesor_id`: el profesor del mail; nulo solo para los mails de la aplicación
--      (`aviso_inactividad`, B11). Otro tipo sin profesor: 422 `{"campo":"profesor_id"}`.
--    - `p_destinatario` nulo: va a la persona `p_alumno_id`; borrada o sin mail (alumno sin cuenta, AVI-04)
--      no encola nada y devuelve null. Dado (p. ej. el mail del profesor): `p_alumno_id` es la persona
--      que el mail nombra (ADR-011).
--    - Remitente: de un profesor a su alumno, el nombre del profesor y `responder_a` su mail; avisos al
--      profesor, de la aplicación y de alta de profesor, «Agenda Clases App» sin Reply-To (AVI-07).
--    - Topes (AVI-08): 20 en 60 min y 200 en 24 h por profesor (`TOPE`) y 400 en 24 h de toda la aplicación
--      (`TOPE_GLOBAL`), sin contar las filas `TOPE`, `TOPE_GLOBAL` ni `DESTINATARIO_INVALIDO`. Sobre un tope
--      la fila nace `fallido` y la operación sigue (NFR-07).
create function privado.encolar_mail(
  p_tipo text,
  p_profesor_id uuid,
  p_alumno_id uuid,
  p_destinatario text,
  p_asunto text,
  p_cuerpo text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- SEC-11, H-012: controles C0, DEL, C1 y separadores de línea Unicode.
  c_control constant text := '[[:cntrl:]\u0080-\u009f  ]+';
  c_servicio constant text := 'Agenda Clases App';
  v_tipo text := pg_catalog.btrim(coalesce(p_tipo, ''));
  v_asunto text;
  v_destinatario text;
  v_invalido boolean;
  v_profesor_nombre text;
  v_profesor_mail text;
  v_remitente text := c_servicio;
  v_responder_a text;
  v_ahora timestamptz;
  v_tope_hora integer;
  v_tope_dia integer;
  v_tope_global integer;
  v_en_hora integer := 0;
  v_en_dia integer := 0;
  v_en_global integer;
  v_motivo text;
  v_id uuid;
begin
  if v_tipo not in ('cuenta_nueva', 'solicitud_nueva', 'cuenta_respondida', 'solicitud_respondida',
                    'clase_creada', 'clase_movida', 'clase_cancelada', 'alumno_sumado', 'recordatorio',
                    'aviso_inactividad', 'profesor_alta') then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"tipo"}';
  end if;
  if p_profesor_id is null and v_tipo <> 'aviso_inactividad' then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"profesor_id"}';
  end if;

  v_asunto := pg_catalog.left(
    pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(p_asunto, ''), c_control, ' ', 'g')), 200);
  if v_asunto = '' then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"asunto"}';
  end if;
  if p_cuerpo is null then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"cuerpo"}';
  end if;
  if p_alumno_id is null and p_destinatario is null then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"destinatario"}';
  end if;

  if p_profesor_id is not null then
    select p.nombre, p.mail::text into v_profesor_nombre, v_profesor_mail
      from public.profesor p
     where p.id = p_profesor_id;
    if not found then
      raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
    end if;
  end if;

  if p_alumno_id is not null then
    select case when a.estado <> 'borrado' then a.mail::text end
      into v_destinatario
      from public.alumno a
     where a.id = p_alumno_id;
    if not found then
      raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
    end if;
  end if;

  if p_destinatario is not null then
    v_destinatario := p_destinatario;
  end if;

  -- AVI-04: persona borrada o sin mail (alumno sin cuenta): no hay a quién escribir.
  if v_destinatario is null then
    return null;
  end if;

  -- H-141 (NFR-07): un destinatario inválido no revierte la operación; queda registrado y no se envía.
  v_destinatario := pg_catalog.btrim(pg_catalog.regexp_replace(v_destinatario, c_control, '', 'g'));
  v_invalido := not privado.es_mail_simple(v_destinatario);
  if v_invalido then
    v_destinatario := pg_catalog.left(v_destinatario, 254);
  end if;

  -- AVI-07: de un profesor a su alumno, su nombre y Reply-To a su mail (instantánea al encolar).
  if v_tipo in ('cuenta_respondida', 'solicitud_respondida', 'clase_creada', 'clase_movida',
                'clase_cancelada', 'alumno_sumado', 'recordatorio') then
    v_remitente := coalesce(privado.nombre_remitente(v_profesor_nombre), c_servicio);
    v_responder_a := case
      when v_profesor_mail !~ c_control and privado.es_mail_simple(v_profesor_mail) then v_profesor_mail end;
  end if;

  -- Cerrojos (ADR-002, ADR-019): el del profesor (reentrante dentro de sus RPC) y después el global, que
  -- serializa la cuenta del tope de toda la aplicación.
  if p_profesor_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_profesor_id::text, 0));
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mails:global', 0));

  v_ahora := public.app_ahora();
  select a.tope_mails_hora, a.tope_mails_dia, a.tope_mails_dia_global
    into v_tope_hora, v_tope_dia, v_tope_global
    from privado.ajustes a;

  if p_profesor_id is not null then
    select pg_catalog.count(*) filter (where m.creado_en > v_ahora - interval '60 minutes'),
           pg_catalog.count(*)
      into v_en_hora, v_en_dia
      from public.mail_salida m
     where m.profesor_id = p_profesor_id
       and m.creado_en > v_ahora - interval '24 hours'
       and m.creado_en <= v_ahora
       and not (m.estado = 'fallido'
                and coalesce(m.motivo_fallo, '') in ('TOPE', 'TOPE_GLOBAL', 'DESTINATARIO_INVALIDO'));
  end if;

  select pg_catalog.count(*)
    into v_en_global
    from public.mail_salida m
   where m.creado_en > v_ahora - interval '24 hours'
     and m.creado_en <= v_ahora
     and not (m.estado = 'fallido'
              and coalesce(m.motivo_fallo, '') in ('TOPE', 'TOPE_GLOBAL', 'DESTINATARIO_INVALIDO'));

  v_motivo := case
    when v_invalido then 'DESTINATARIO_INVALIDO'
    when p_profesor_id is not null
         and (v_en_hora >= v_tope_hora or v_en_dia >= v_tope_dia) then 'TOPE'
    when v_en_global >= v_tope_global then 'TOPE_GLOBAL'
  end;

  -- Con motivo, la fila nace `fallido`: el trigger de disparo no la ve y la operación sigue (NFR-07).
  insert into public.mail_salida (profesor_id, alumno_id, tipo, destinatario, asunto, cuerpo_texto,
                                  remitente_nombre, responder_a, estado, motivo_fallo, creado_en)
  values (p_profesor_id, p_alumno_id, v_tipo, v_destinatario, v_asunto, p_cuerpo,
          v_remitente, v_responder_a,
          case when v_motivo is null then 'pendiente' else 'fallido' end,
          v_motivo, v_ahora)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function privado.encolar_mail(text, uuid, uuid, text, text, text) from public, anon, authenticated;

-- La versión de cinco argumentos deducía el profesor de la ficha: con varios profesores no sirve.
drop function privado.encolar_mail(text, uuid, text, text, text);

-- 4. Plantillas de cuenta (ADR-005: asunto y cuerpo en texto plano; `encolar_mail` sanea y aplica topes).
--    El trigger `al_completar_ficha` de B05 ya no se dispara (la ficha no pasa a `pendiente`): el mail de
--    cuenta nueva lo encolan `completar_ficha` y `pedir_inscripcion` sobre la inscripción.
drop trigger al_completar_ficha on public.alumno;
drop function privado.al_completar_ficha();
drop function privado.mail_cuenta_nueva(uuid);
drop function privado.mail_cuenta_respondida(uuid, text, text);

-- AVI-02: al profesor al que la persona pidió acceso. Nombre del servicio, sin Reply-To (AVI-07).
create function privado.mail_cuenta_nueva(p_alumno_id uuid, p_profesor_id uuid)
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_destinatario text;
  v_nombre text;
begin
  select p.mail::text into v_destinatario from public.profesor p where p.id = p_profesor_id;
  select a.nombre into v_nombre from public.alumno a where a.id = p_alumno_id;

  return privado.encolar_mail(
    'cuenta_nueva',
    p_profesor_id,
    p_alumno_id,
    v_destinatario,
    'Pedido de acceso pendiente de aprobación: ' || coalesce(v_nombre, ''),
    'Una persona te pidió acceso y está pendiente de aprobación.' || E'\n\n'
      || 'Nombre: ' || coalesce(v_nombre, '') || E'\n\n'
      || 'Entrá a la lista de alumnos para ver su ficha y aprobarla o rechazarla.' || E'\n');
end;
$$;

-- AVI-03: a la persona, cuando el profesor aprueba o rechaza su acceso, con el motivo si lo escribió.
create function privado.mail_cuenta_respondida(p_alumno_id uuid, p_profesor_id uuid, p_estado text, p_motivo text)
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_nombre text;
  v_profesor text;
  v_aprobada boolean := p_estado = 'aprobado';
begin
  select a.nombre into v_nombre from public.alumno a where a.id = p_alumno_id;
  select coalesce(privado.nombre_remitente(p.nombre), 'Tu profesor') into v_profesor
    from public.profesor p where p.id = p_profesor_id;

  return privado.encolar_mail(
    'cuenta_respondida',
    p_profesor_id,
    p_alumno_id,
    null,
    case when v_aprobada then v_profesor || ' aprobó tu acceso' else v_profesor || ' rechazó tu acceso' end,
    'Hola' || coalesce(' ' || v_nombre, '') || ',' || E'\n\n'
      || case when v_aprobada
              then v_profesor || ' aprobó tu acceso. Ya podés pedirle clases desde su agenda.'
              else v_profesor || ' rechazó tu acceso, así que por ahora no podés pedirle clases.' end
      || case when p_motivo is null then ''
              when v_aprobada then E'\n\n' || 'Mensaje: ' || p_motivo
              else E'\n\n' || 'Motivo: ' || p_motivo end
      || E'\n');
end;
$$;

-- AVI-04 (ALU-07): a la persona que un profesor sumó como alumno con su mail.
create function privado.mail_alumno_sumado(p_alumno_id uuid, p_profesor_id uuid)
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_nombre text;
  v_profesor text;
begin
  select a.nombre into v_nombre from public.alumno a where a.id = p_alumno_id;
  select coalesce(privado.nombre_remitente(p.nombre), 'Tu profesor') into v_profesor
    from public.profesor p where p.id = p_profesor_id;

  return privado.encolar_mail(
    'alumno_sumado',
    p_profesor_id,
    p_alumno_id,
    null,
    v_profesor || ' te sumó como alumno',
    'Hola' || coalesce(' ' || v_nombre, '') || ',' || E'\n\n'
      || v_profesor || ' te sumó como alumno en Agenda Clases App. Ya podés pedirle clases desde su agenda.'
      || E'\n\n'
      || 'Para entrar usá tu cuenta de Google o el código que te llega a este mail.' || E'\n');
end;
$$;

revoke execute on function
  privado.mail_cuenta_nueva(uuid, uuid),
  privado.mail_cuenta_respondida(uuid, uuid, text, text),
  privado.mail_alumno_sumado(uuid, uuid)
  from public, anon, authenticated;
