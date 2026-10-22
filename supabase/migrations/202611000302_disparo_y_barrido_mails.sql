-- B03 · T03.1 · Disparo de la Edge Function `enviar-mail` con pg_net y barrido con pg_cron.
-- ADR-005 «Ajustes tras S01» (Vault, solo `ids`, 20 s, H-017), ADR-008 (jobs), contratos.md §4.
-- IDs: AVI-07, NFR-07, SEC-11, SEC-28.

-- 1. Una llamada a la función por un lote de ids. URL y secreto salen de Vault (`url_funcion_mail`,
--    `mail_secreto`): el código es igual en todos los entornos. El cuerpo lleva solo `{"ids": [...]}`:
--    destinatario, asunto y cuerpo no viajan por `net.http_request_queue` (SEC-17). pg_net encola
--    dentro de la transacción y su worker solo ve la llamada si confirma (S01: rollback no dispara).
--    Sin configuración no llama (aviso en el log): la fila queda `pendiente` para el barrido.
create function privado.disparar_mail(p_ids uuid[])
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secreto text;
begin
  if p_ids is null or pg_catalog.cardinality(p_ids) = 0 then
    return null;
  end if;

  select ds.decrypted_secret into v_url
    from vault.decrypted_secrets ds where ds.name = 'url_funcion_mail';
  select ds.decrypted_secret into v_secreto
    from vault.decrypted_secrets ds where ds.name = 'mail_secreto';
  if v_url is null or v_secreto is null then
    raise warning 'enviar-mail: falta url_funcion_mail o mail_secreto en Vault; el mail queda pendiente';
    return null;
  end if;

  -- 20 s: mayor que el tope de 15 s por mail de la función (H-017).
  return net.http_post(
    url := v_url,
    body := pg_catalog.jsonb_build_object('ids', pg_catalog.to_jsonb(p_ids)),
    headers := pg_catalog.jsonb_build_object('Content-Type', 'application/json', 'x-mail-secreto', v_secreto),
    timeout_milliseconds := 20000
  );
end;
$$;

revoke execute on function privado.disparar_mail(uuid[]) from public, anon, authenticated;

-- 2. Trigger `after insert` solo para filas `pendiente`: una fila `fallido` `TOPE` (AVI-08) no llama.
--    Una llamada por mail: la función reclama de a una fila y el tope de 20 s de pg_net cubre un mail.
create function privado.mail_salida_disparar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.disparar_mail(array[new.id]);
  return null;
end;
$$;

revoke execute on function privado.mail_salida_disparar() from public, anon, authenticated;

create trigger mail_salida_disparo
  after insert on public.mail_salida
  for each row
  when (new.estado = 'pendiente')
  execute function privado.mail_salida_disparar();

-- 3. Barrido (ADR-005, ADR-008, H-017), cada 5 min:
--    a) `enviando` de más de 10 min → `fallido` `SIN_CONFIRMACION`, sin reintento (DEC-10 b: pudo salir);
--    b) `pendiente` de más de 2 min (llamada perdida o sin presupuesto) → se vuelve a disparar, de a una,
--       hasta 50 por corrida. Devuelve lo que hizo, para pgTAP y para `cron.job_run_details`.
create function privado.barrer_mails(p_ahora timestamptz default public.app_ahora())
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sin_confirmacion integer;
  v_redisparados integer := 0;
  v_id uuid;
begin
  update public.mail_salida m
     set estado = 'fallido',
         motivo_fallo = 'SIN_CONFIRMACION'
   where m.estado = 'enviando'
     and coalesce(m.intentado_en, m.creado_en) < p_ahora - interval '10 minutes';
  get diagnostics v_sin_confirmacion = row_count;

  for v_id in
    select m.id
      from public.mail_salida m
     where m.estado = 'pendiente'
       and m.creado_en < p_ahora - interval '2 minutes'
     order by m.creado_en
     limit 50
  loop
    if privado.disparar_mail(array[v_id]) is not null then
      v_redisparados := v_redisparados + 1;
    end if;
  end loop;

  return pg_catalog.jsonb_build_object('sin_confirmacion', v_sin_confirmacion, 'redisparados', v_redisparados);
end;
$$;

revoke execute on function privado.barrer_mails(timestamptz) from public, anon, authenticated;

-- 4. pg_cron (ADR-008, SEC-28): `cron.schedule` con nombre es idempotente (reemplaza el job del mismo
--    nombre). Corre como `postgres` y sin argumento: la hora sale de `app_ahora()`.
select cron.schedule('barrer_mails', '*/5 * * * *', 'select privado.barrer_mails()');
