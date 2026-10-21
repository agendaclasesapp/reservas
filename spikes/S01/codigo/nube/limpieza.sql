-- Limpieza del spike S01 en el proyecto. La ejecuta el orquestador cuando el humano
-- confirme que llegaron los mails. No toca pg_net (lo usa B03) ni el esquema spike_s02.
drop schema if exists spike_s01 cascade;
delete from vault.secrets where name in ('s01_mail_secreto', 's01_url_funcion_mail');
