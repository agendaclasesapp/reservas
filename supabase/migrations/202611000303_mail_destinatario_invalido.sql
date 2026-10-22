-- B03 · H-141 (NFR-07, ADR-005 «Ajuste de B03», contratos.md §4): un destinatario que no es mail simple
-- ya no revierte la operación que encola. La fila nace `fallido` con motivo `DESTINATARIO_INVALIDO`
-- (destinatario saneado y cortado a 254, para que el profesor vea cuál era), sin disparo, y no cuenta
-- para el tope de AVI-08. La validación pasa a `privado.es_mail_simple`, que B05 reutiliza.

-- 1. Mail simple: una sola dirección, sin espacios, coma, punto y coma ni `<>`, hasta 254 caracteres.
create function privado.es_mail_simple(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is not null and pg_catalog.char_length(p) <= 254
     and p ~ '^[^@[:space:],;<>]+@[^@[:space:],;<>]+\.[^@[:space:],;<>]+$'
$$;

revoke execute on function privado.es_mail_simple(text) from public, anon, authenticated;

-- 2. `privado.encolar_mail` (ADR-005, ADR-016). Lo llaman las funciones de plantilla de cada bolt dentro
--    de la transacción de su RPC o job: si la operación falla, no queda mail.
--    - `p_destinatario` nulo: va al titular `p_alumno_id`; un alumno sin cuenta, borrado o sin mail no
--      encola nada (AVI-04) y devuelve null.
--    - `p_destinatario` dado (p. ej. el mail del profesor): `p_alumno_id` es el alumno que el mail nombra.
--    - 422 `{"campo":"destinatario"}` solo si faltan a la vez `p_alumno_id` y `p_destinatario`.
--    Devuelve el id de la fila, que nace `pendiente` o `fallido` con motivo `DESTINATARIO_INVALIDO`
--    (H-141) o, sobre el tope de AVI-08, `TOPE`.
create or replace function privado.encolar_mail(
  p_tipo text,
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
  v_tipo text := pg_catalog.btrim(coalesce(p_tipo, ''));
  v_asunto text;
  v_destinatario text;
  v_invalido boolean;
  v_profesor_id uuid;
  v_ahora timestamptz;
  v_tope_hora integer;
  v_tope_dia integer;
  v_en_hora integer;
  v_en_dia integer;
  v_sobre_tope boolean;
  v_id uuid;
begin
  if v_tipo not in ('cuenta_nueva', 'solicitud_nueva', 'cuenta_respondida', 'solicitud_respondida',
                    'clase_creada', 'clase_movida', 'clase_cancelada', 'recordatorio', 'aviso_inactividad') then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"tipo"}';
  end if;

  v_asunto := pg_catalog.left(
    pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(p_asunto, ''), c_control, ' ', 'g')), 200);
  if v_asunto = '' then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"asunto"}';
  end if;
  if p_cuerpo is null then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"cuerpo"}';
  end if;

  if p_alumno_id is not null then
    select a.profesor_id,
           case when a.estado not in ('sin_cuenta', 'borrado') then a.mail::text end
      into v_profesor_id, v_destinatario
      from public.alumno a
     where a.id = p_alumno_id;
    if not found then
      raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
    end if;
  else
    select p.id into v_profesor_id from public.profesor p limit 1;
  end if;

  if p_destinatario is not null then
    v_destinatario := p_destinatario;
  elsif p_alumno_id is null then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"destinatario"}';
  end if;

  -- AVI-04: alumno sin cuenta, borrado o sin mail: no hay a quién escribir.
  if v_destinatario is null then
    return null;
  end if;

  -- H-141 (NFR-07): un destinatario inválido no revierte la operación; queda registrado y no se envía.
  v_destinatario := pg_catalog.btrim(pg_catalog.regexp_replace(v_destinatario, c_control, '', 'g'));
  v_invalido := not privado.es_mail_simple(v_destinatario);
  if v_invalido then
    v_destinatario := pg_catalog.left(v_destinatario, 254);
  end if;

  -- Mismo cerrojo que las RPC de escritura (ADR-002); reentrante dentro de ellas. Serializa la cuenta
  -- del tope entre RPC y jobs (ADR-016).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profesor_id::text, 0));

  -- AVI-08 (ADR-016): ventanas móviles de 60 min y 24 h con `app_ahora()`; las filas `TOPE` y
  -- `DESTINATARIO_INVALIDO` no cuentan.
  v_ahora := public.app_ahora();
  select a.tope_mails_hora, a.tope_mails_dia into v_tope_hora, v_tope_dia from privado.ajustes a;

  select pg_catalog.count(*) filter (where m.creado_en > v_ahora - interval '60 minutes'),
         pg_catalog.count(*)
    into v_en_hora, v_en_dia
    from public.mail_salida m
   where m.profesor_id = v_profesor_id
     and m.creado_en > v_ahora - interval '24 hours'
     and m.creado_en <= v_ahora
     and not (m.estado = 'fallido' and coalesce(m.motivo_fallo, '') in ('TOPE', 'DESTINATARIO_INVALIDO'));

  v_sobre_tope := not v_invalido
              and ((v_tope_hora is not null and v_en_hora >= v_tope_hora)
                or (v_tope_dia is not null and v_en_dia >= v_tope_dia));

  -- Inválido o sobre el tope, la fila nace `fallido`: el trigger de disparo no la ve y la operación
  -- sigue (NFR-07).
  insert into public.mail_salida (profesor_id, alumno_id, tipo, destinatario, asunto, cuerpo_texto,
                                  estado, motivo_fallo, creado_en)
  values (v_profesor_id, p_alumno_id, v_tipo, v_destinatario, v_asunto, p_cuerpo,
          case when v_invalido or v_sobre_tope then 'fallido' else 'pendiente' end,
          case when v_invalido then 'DESTINATARIO_INVALIDO' when v_sobre_tope then 'TOPE' end,
          v_ahora)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function privado.encolar_mail(text, uuid, text, text, text) from public, anon, authenticated;
