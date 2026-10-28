-- B03 · Corrección de H-130 · El disparo de `enviar-mail` firma con HMAC y el secreto no queda en la cola de pg_net.
-- IDs: H-130, SEC-10, SEC-11, SEC-17, AVI-07. Migración 202611001150_firma_hmac_mails.sql.
-- Se mira `net.http_request_queue` dentro de la transacción; todo se deshace con el rollback (pg_net no llama).
-- Reloj de prueba activo y lejos del real (ADR-014) para comprobar que `x-mail-ts` sale del reloj real.
begin;
select plan(16);

delete from public.mail_salida;
update privado.ajustes set permitir_reloj_prueba = true;
update privado.reloj_prueba set ahora = '2030-01-07 15:00:00+00';

create function pg_temp.secreto() returns text language sql stable as $f$
  select decrypted_secret from vault.decrypted_secrets where name = 'mail_secreto'
$f$;
-- Llamadas de la cola cuyo cuerpo es exactamente `{"ids": [p_id]}`.
create function pg_temp.llamadas(p_id uuid) returns setof net.http_request_queue language sql stable as $f$
  select q.* from net.http_request_queue q
   where convert_from(q.body, 'UTF8')::jsonb = jsonb_build_object('ids', jsonb_build_array(p_id))
$f$;
-- La firma que tendría que llevar una llamada: hex(HMAC-SHA256(mail_secreto, ts || '.' || cuerpo tal como se guardó)).
create function pg_temp.firma_esperada(q net.http_request_queue) returns text language sql stable as $f$
  select encode(extensions.hmac(convert_to((q.headers ->> 'x-mail-ts') || '.', 'UTF8') || q.body,
                                convert_to(pg_temp.secreto(), 'UTF8'), 'sha256'), 'hex')
$f$;

select isnt(pg_temp.secreto(), null, 'H-130: el stack local tiene mail_secreto en Vault (seed)');
select has_function('extensions', 'hmac', array['bytea', 'bytea', 'text'], 'H-130: pgcrypto expone extensions.hmac(bytea, bytea, text)');
select is(public.app_ahora(), '2030-01-07 15:00:00+00'::timestamptz, 'ADR-014: el reloj de prueba está activo y lejos del real');

-- A. Disparo por el trigger de `mail_salida` (AVI-07) ----------------------------------------------------------
with f as (insert into public.mail_salida (tipo, destinatario, asunto, cuerpo_texto)
            values ('aviso_inactividad', 'pgtap.h130@example.test', 'Asunto-h130', 'Cuerpo-h130') returning id)
select set_config('rtc.h1', (select id::text from f), true) is not null as _;

select is((select count(*)::int from pg_temp.llamadas(current_setting('rtc.h1')::uuid)), 1,
  'AVI-07: la fila pendiente deja una llamada en la cola con solo ids');
select is((select count(*)::int from net.http_request_queue q
            where strpos(q.headers::text, pg_temp.secreto()) > 0
               or strpos(convert_from(q.body, 'UTF8'), pg_temp.secreto()) > 0
               or strpos(q.url, pg_temp.secreto()) > 0), 0,
  'H-130_SEC-10: ninguna fila de net.http_request_queue contiene el valor de mail_secreto');
select is((select count(*)::int from net.http_request_queue q where q.headers ? 'x-mail-secreto'), 0,
  'H-130: ninguna llamada lleva la cabecera x-mail-secreto');
select is((select array[q.headers ? 'x-mail-ts', q.headers ? 'x-mail-firma'] from pg_temp.llamadas(current_setting('rtc.h1')::uuid) q),
  array[true, true], 'H-130: la llamada lleva x-mail-ts y x-mail-firma');
select matches((select q.headers ->> 'x-mail-firma' from pg_temp.llamadas(current_setting('rtc.h1')::uuid) q),
  '^[0-9a-f]{64}$', 'H-130: x-mail-firma son 64 dígitos hex (SHA-256)');
select is((select q.headers ->> 'x-mail-firma' from pg_temp.llamadas(current_setting('rtc.h1')::uuid) q),
  (select pg_temp.firma_esperada(q) from pg_temp.llamadas(current_setting('rtc.h1')::uuid) q),
  'H-130: la firma es la HMAC-SHA256 de ts.cuerpo sobre los bytes exactos que guarda pg_net');
select ok((select abs((q.headers ->> 'x-mail-ts')::bigint - extract(epoch from clock_timestamp())) <= 60
             from pg_temp.llamadas(current_setting('rtc.h1')::uuid) q),
  'H-130_ADR-014: x-mail-ts es el reloj real (clock_timestamp), no app_ahora()');
select is((select count(*)::int from net.http_request_queue q
            where convert_from(q.body, 'UTF8') ~* 'pgtap\.h130|Asunto-h130|Cuerpo-h130'), 0,
  'SEC-17: la cola no lleva destinatario, asunto ni cuerpo');

-- B. Disparo del barrido (`barrer_mails` vuelve a llamar a una pendiente vieja) ---------------------------------
with f as (insert into public.mail_salida (tipo, destinatario, asunto, cuerpo_texto, creado_en)
            values ('aviso_inactividad', 'pgtap.h130b@example.test', 'x', 'c', public.app_ahora() - interval '10 minutes') returning id)
select set_config('rtc.h2', (select id::text from f), true) is not null as _;
select is((select count(*)::int from pg_temp.llamadas(current_setting('rtc.h2')::uuid)), 1, 'AVI-07: la pendiente vieja ya tiene la llamada del trigger');
select ok((privado.barrer_mails() is not null), 'AVI-07: el barrido corre');
select is((select array[count(*)::int::text, bool_and(q.headers ->> 'x-mail-firma' = pg_temp.firma_esperada(q))::text]
             from pg_temp.llamadas(current_setting('rtc.h2')::uuid) q),
  array['2', 'true'], 'H-130: el barrido vuelve a disparar con una firma válida y sin el secreto');

-- C. Misma firma y permisos que antes ---------------------------------------------------------------------------
select is((select array[p.prosecdef, coalesce(p.proconfig, '{}') @> array['search_path=""']] from pg_proc p
            where p.oid = 'privado.disparar_mail(uuid[])'::regprocedure),
  array[true, true], 'SEC-05: disparar_mail sigue security definer con search_path vacío');
select is(has_function_privilege('anon', 'privado.disparar_mail(uuid[])', 'execute')
       or has_function_privilege('authenticated', 'privado.disparar_mail(uuid[])', 'execute')
       or has_function_privilege('service_role', 'privado.disparar_mail(uuid[])', 'execute'), false,
  'SEC-11: disparar_mail sigue sin ser ejecutable por roles de la API');

select * from finish();
rollback;
