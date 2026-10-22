-- B03 · T03.1 · Outbox de mails `mail_salida`, registro `v_mails_fallidos` y `privado.encolar_mail`.
-- ADR-005 (con «Ajustes tras S01»), ADR-016 (tope de AVI-08), ADR-014 (`app_ahora()`), contratos.md §2 y §4.
-- IDs: AVI-07, AVI-08, NFR-07, SEC-10, SEC-11.

-- 1. Outbox y registro (componentes.md §3). Asunto y destinatario llegan saneados por `encolar_mail`;
--    todo mail que nombra a un alumno lleva su `alumno_id` (ADR-011 anula destinatario, asunto, cuerpo y
--    motivo al anonimizarlo: por eso son anulables).
create table public.mail_salida (
  id uuid primary key default gen_random_uuid(),
  profesor_id uuid not null references public.profesor (id),
  alumno_id uuid references public.alumno (id),
  tipo text not null check (tipo in (
    'cuenta_nueva', 'solicitud_nueva', 'cuenta_respondida', 'solicitud_respondida', 'clase_creada',
    'clase_movida', 'clase_cancelada', 'recordatorio', 'aviso_inactividad')),
  destinatario text,
  asunto text,
  cuerpo_texto text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'enviando', 'enviado', 'fallido')),
  motivo_fallo text check (pg_catalog.char_length(motivo_fallo) <= 500),
  creado_en timestamptz not null default public.app_ahora(),
  intentado_en timestamptz,
  enviado_en timestamptz
);

-- Cuenta del tope de AVI-08 por ventana móvil.
create index mail_salida_profesor_creado on public.mail_salida (profesor_id, creado_en);
-- Barrido (`privado.barrer_mails`): solo las filas vivas.
create index mail_salida_vivas on public.mail_salida (estado, creado_en)
  where estado in ('pendiente', 'enviando');
-- Anonimización de un alumno (ADR-011, B11).
create index mail_salida_alumno on public.mail_salida (alumno_id) where alumno_id is not null;

-- 2. Fechas del ciclo con `app_ahora()` (ADR-014) aunque la Edge Function no las mande: al reclamar
--    (`pendiente → enviando`) queda `intentado_en`, que el barrido usa para `SIN_CONFIRMACION` (H-017);
--    al marcar `enviado`, `enviado_en`. El motivo se corta a 500 (contratos.md §4).
create function privado.mail_salida_tiempos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.motivo_fallo := pg_catalog.left(new.motivo_fallo, 500);
  if tg_op = 'UPDATE' then
    if new.estado = 'enviando' and old.estado = 'pendiente' then
      new.intentado_en := public.app_ahora();
    end if;
    if new.estado = 'enviado' and old.estado is distinct from 'enviado' then
      new.enviado_en := public.app_ahora();
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function privado.mail_salida_tiempos() from public, anon, authenticated;

create trigger mail_salida_tiempos
  before insert or update on public.mail_salida
  for each row execute function privado.mail_salida_tiempos();

-- 3. Permisos (SEC-01, SEC-03, H-011). El profesor lee por RLS solo las columnas del registro (WEB-08),
--    nunca asunto ni cuerpo; el alumno no ve nada. La Edge Function (`service_role`) lee la fila y
--    solo puede escribir `estado` y `motivo_fallo`: ni insertar, ni borrar, ni cambiar destinatario.
alter table public.mail_salida enable row level security;

revoke all on public.mail_salida from public, anon, authenticated, service_role;
grant select (id, tipo, destinatario, estado, motivo_fallo, creado_en) on public.mail_salida to authenticated;
grant select on public.mail_salida to service_role;
grant update (estado, motivo_fallo) on public.mail_salida to service_role;

create policy mail_salida_lectura on public.mail_salida
  for select to authenticated
  using ((select privado.es_profesor()));

-- 4. Registro de mails fallidos (contratos.md §2; NFR-07, AVI-08): fecha, destinatario, tipo y motivo,
--    incluido `TOPE`. `id` solo identifica la fila en la lista. `security_invoker` (SEC-05): la RLS de
--    `mail_salida` decide quién ve qué.
create view public.v_mails_fallidos
with (security_invoker = true)
as
  select m.id,
         m.creado_en as fecha,
         m.destinatario,
         m.tipo,
         m.motivo_fallo as motivo
    from public.mail_salida m
   where m.estado = 'fallido';

revoke all on public.v_mails_fallidos from public, anon, authenticated, service_role;
grant select on public.v_mails_fallidos to authenticated;

-- 5. `privado.encolar_mail` (ADR-005, ADR-016). Lo llaman las funciones de plantilla de cada bolt dentro
--    de la transacción de su RPC o job: si la operación falla, no queda mail.
--    - `p_destinatario` nulo: va al titular `p_alumno_id`; un alumno sin cuenta, borrado o sin mail no
--      encola nada (AVI-04) y devuelve null.
--    - `p_destinatario` dado (p. ej. el mail del profesor): `p_alumno_id` es el alumno que el mail nombra.
--    Devuelve el id de la fila, que nace `pendiente` o, sobre el tope de AVI-08, `fallido` `TOPE`.
create function privado.encolar_mail(
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
  -- Mail simple: sin espacios, coma, punto y coma ni `<>` (una sola dirección, sin nombre visible).
  c_mail_simple constant text := '^[^@[:space:],;<>]+@[^@[:space:],;<>]+\.[^@[:space:],;<>]+$';
  v_tipo text := pg_catalog.btrim(coalesce(p_tipo, ''));
  v_asunto text;
  v_destinatario text;
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

  v_destinatario := pg_catalog.btrim(pg_catalog.regexp_replace(v_destinatario, c_control, '', 'g'));
  if pg_catalog.char_length(v_destinatario) > 254 or v_destinatario !~ c_mail_simple then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"destinatario"}';
  end if;

  -- Mismo cerrojo que las RPC de escritura (ADR-002); reentrante dentro de ellas. Serializa la cuenta
  -- del tope entre RPC y jobs (ADR-016).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profesor_id::text, 0));

  -- AVI-08 (ADR-016): ventanas móviles de 60 min y 24 h con `app_ahora()`; las filas `TOPE` no cuentan.
  v_ahora := public.app_ahora();
  select a.tope_mails_hora, a.tope_mails_dia into v_tope_hora, v_tope_dia from privado.ajustes a;

  select pg_catalog.count(*) filter (where m.creado_en > v_ahora - interval '60 minutes'),
         pg_catalog.count(*)
    into v_en_hora, v_en_dia
    from public.mail_salida m
   where m.profesor_id = v_profesor_id
     and m.creado_en > v_ahora - interval '24 hours'
     and m.creado_en <= v_ahora
     and not (m.estado = 'fallido' and m.motivo_fallo is not distinct from 'TOPE');

  v_sobre_tope := (v_tope_hora is not null and v_en_hora >= v_tope_hora)
               or (v_tope_dia is not null and v_en_dia >= v_tope_dia);

  -- Sobre el tope la fila nace `fallido` `TOPE`: el trigger de disparo no la ve y la operación sigue (NFR-07).
  insert into public.mail_salida (profesor_id, alumno_id, tipo, destinatario, asunto, cuerpo_texto,
                                  estado, motivo_fallo, creado_en)
  values (v_profesor_id, p_alumno_id, v_tipo, v_destinatario, v_asunto, p_cuerpo,
          case when v_sobre_tope then 'fallido' else 'pendiente' end,
          case when v_sobre_tope then 'TOPE' end,
          v_ahora)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function privado.encolar_mail(text, uuid, text, text, text) from public, anon, authenticated;
