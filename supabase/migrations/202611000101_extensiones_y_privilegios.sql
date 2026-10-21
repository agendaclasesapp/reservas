-- B01 · T01.2 · Extensiones, esquema `privado` y privilegios por defecto.
-- ADR-001 (RLS como autorización), SEC-01, SEC-03, SEC-04. Base probada en el spike S03.

-- 1. Extensiones (todas idempotentes: pg_net ya está instalado en el proyecto desde S01).
--    Se crean antes de tocar los privilegios por defecto para no alterar los de sus funciones.
create extension if not exists btree_gist with schema extensions;  -- exclusión de `clase` (RES-01, B02)
create extension if not exists citext with schema extensions;      -- mails sin distinguir mayúsculas
create extension if not exists pg_net with schema extensions;      -- disparo de la Edge Function (ADR-005, B03)
create extension if not exists pg_cron;                            -- procesos programados (ADR-008); Supabase la ubica en `cron`

-- 2. Esquema de lógica interna: no está en `[api] schemas` de PostgREST (SEC-04).
create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;

-- 3. Revocaciones por defecto (SEC-01, SEC-03, SEC-04): todo objeto nuevo nace sin permisos para
--    `anon` y `authenticated`; cada migración otorga explícito objeto por objeto.
--    Global: ninguna función nueva es ejecutable por `public` (el rol que incluye a todos).
alter default privileges revoke execute on functions from public;
--    `public`: Supabase concede por defecto todo a anon y authenticated en tablas, secuencias y funciones.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
--    `privado`: por si alguna vez se le agregaran concesiones por defecto.
alter default privileges in schema privado revoke all on tables from anon, authenticated;
alter default privileges in schema privado revoke all on sequences from anon, authenticated;
alter default privileges in schema privado revoke execute on functions from anon, authenticated;
