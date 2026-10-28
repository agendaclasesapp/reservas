-- B03 · Corrección de H-130 · El disparo de `enviar-mail` firma con HMAC en vez de mandar el secreto.
-- ADR-005 «Ajustes tras S01», contratos.md §4. IDs: H-130, SEC-10, SEC-11, SEC-17, AVI-07.
--
-- Antes la llamada llevaba `x-mail-secreto: <mail_secreto>` y pg_net la deja en `net.http_request_queue`,
-- tabla que anon y authenticated pueden leer (ACL de PUBLIC de la plataforma, no revocable desde una
-- migración). Ahora viajan:
--   x-mail-ts    segundos desde epoch, en decimal;
--   x-mail-firma hex(HMAC-SHA256(clave = mail_secreto, mensaje = ts || '.' || cuerpo)).
-- El secreto no sale de Vault. Lo que queda en la cola (ts, firma e ids) solo sirve para repetir esa misma
-- llamada dentro de la ventana de la función (300 s), y repetirla solo reclama filas que sigan `pendiente`.
--
-- Reloj: `clock_timestamp()`, no `app_ahora()`. El ts no es una regla de negocio sino la marca de la llamada
-- que la función compara con su reloj real; con el reloj de prueba activo (ADR-014, seed de local y CI)
-- `app_ahora()` devuelve un instante fijo y toda llamada caería fuera de la ventana. Tampoco `now()`, que es el
-- inicio de la transacción: en el barrido o en una transacción larga quedaría viejo antes de salir.
--
-- Cuerpo: se serializa una sola vez a texto, se firma ese texto y se envía ese mismo texto convertido a jsonb.
-- pg_net guarda `convert_to(body::text, 'UTF8')`, y la salida de texto de jsonb es canónica: el texto de
-- `v_cuerpo::jsonb` es byte a byte `v_cuerpo` (lo comprueba supabase/tests/03_hmac_disparo.test.sql).

-- pgcrypto viene instalada en `extensions` en Supabase (local y nube); idempotente por si un entorno no la trae.
create extension if not exists pgcrypto with schema extensions;

create or replace function privado.disparar_mail(p_ids uuid[])
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secreto text;
  v_cuerpo text;
  v_ts text;
  v_firma text;
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

  v_cuerpo := pg_catalog.jsonb_build_object('ids', pg_catalog.to_jsonb(p_ids))::text;
  v_ts := pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint::text;
  v_firma := pg_catalog.encode(
    extensions.hmac(
      pg_catalog.convert_to(v_ts || '.' || v_cuerpo, 'UTF8'),
      pg_catalog.convert_to(v_secreto, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  -- 20 s: mayor que el tope de 15 s por mail de la función (H-017).
  return net.http_post(
    url := v_url,
    body := v_cuerpo::jsonb,
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'x-mail-ts', v_ts,
      'x-mail-firma', v_firma
    ),
    timeout_milliseconds := 20000
  );
end;
$$;

revoke execute on function privado.disparar_mail(uuid[]) from public, anon, authenticated;
