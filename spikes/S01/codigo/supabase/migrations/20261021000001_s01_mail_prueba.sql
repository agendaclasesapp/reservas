-- Spike S01 (ADR-005): tabla de prueba + trigger after insert que llama a la Edge Function
-- con pg_net, leyendo URL y secreto de Vault. Codigo descartable: B03 lo reemplaza por
-- privado.mail_salida / privado.encolar_mail.
create extension if not exists pg_net with schema extensions;

create table public.mail_prueba (
  id bigint generated always as identity primary key,
  para text not null,
  asunto text not null,
  cuerpo text not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'enviado', 'fallido')),
  motivo text,
  request_id bigint,
  creado timestamptz not null default now()
);

alter table public.mail_prueba enable row level security;
revoke all on public.mail_prueba from anon, authenticated;

create or replace function public.mail_prueba_disparar()
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
    from vault.decrypted_secrets ds where ds.name = 'url_funcion_mail';
  select ds.decrypted_secret into v_secreto
    from vault.decrypted_secrets ds where ds.name = 'mail_secreto';
  if v_url is null or v_secreto is null then
    -- Sin configuracion no se dispara; en B03 el barrido de pendientes la recoge.
    raise warning 'S01: falta url_funcion_mail o mail_secreto en Vault';
    return new;
  end if;

  -- pg_net encola en net.http_request_queue dentro de esta transaccion; el worker
  -- solo ve la fila si la transaccion confirma (un rollback la descarta).
  v_req := net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'id', new.id, 'para', new.para, 'asunto', new.asunto, 'cuerpo', new.cuerpo),
    headers := jsonb_build_object(
      'Content-Type', 'application/json', 'x-mail-secreto', v_secreto),
    timeout_milliseconds := 20000
  );
  update public.mail_prueba set request_id = v_req where id = new.id;
  return new;
end
$$;

revoke all on function public.mail_prueba_disparar() from public, anon, authenticated;

create trigger mail_prueba_ai
  after insert on public.mail_prueba
  for each row execute function public.mail_prueba_disparar();
