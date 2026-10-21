-- Spike S01 en el proyecto (NO es migracion: no va por db push, para no ensuciar el historial
-- que arranca B01). Todo en el esquema spike_s01; los secretos de Vault con prefijo s01_.
-- Se aplica con `node s01_nube.mjs aplicar` (lee la contrasena de la base del entorno).
create extension if not exists pg_net with schema extensions;

create schema if not exists spike_s01;
revoke all on schema spike_s01 from public, anon, authenticated;

create table if not exists spike_s01.mail_prueba (
  id bigint generated always as identity primary key,
  para text not null,
  asunto text not null,
  cuerpo text not null,
  request_id bigint,
  creado timestamptz not null default now()
);

create or replace function spike_s01.mail_prueba_disparar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secreto text;
  v_req bigint;
begin
  select ds.decrypted_secret into v_url
    from vault.decrypted_secrets ds where ds.name = 's01_url_funcion_mail';
  select ds.decrypted_secret into v_secreto
    from vault.decrypted_secrets ds where ds.name = 's01_mail_secreto';
  if v_url is null or v_secreto is null then
    raise warning 'S01: falta s01_url_funcion_mail o s01_mail_secreto en Vault';
    return new;
  end if;
  v_req := net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'id', new.id, 'para', new.para, 'asunto', new.asunto, 'cuerpo', new.cuerpo),
    headers := jsonb_build_object(
      'Content-Type', 'application/json', 'x-mail-secreto', v_secreto),
    timeout_milliseconds := 20000
  );
  update spike_s01.mail_prueba set request_id = v_req where id = new.id;
  return new;
end
$$;

revoke all on function spike_s01.mail_prueba_disparar() from public, anon, authenticated;

drop trigger if exists mail_prueba_ai on spike_s01.mail_prueba;
create trigger mail_prueba_ai
  after insert on spike_s01.mail_prueba
  for each row execute function spike_s01.mail_prueba_disparar();
