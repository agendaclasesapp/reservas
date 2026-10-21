-- Limpieza del spike S02 en el proyecto real (NO se ejecutó; la corre el orquestador o DevOps al cerrar S02).
-- Quita los triggers de auth.users, el esquema spike_s02 y el usuario de prueba.
begin;
drop trigger if exists spike_s02_al_confirmar_usuario on auth.users;
drop trigger if exists spike_s02_al_ingresar_usuario on auth.users;
drop schema if exists spike_s02 cascade;
delete from auth.users where email = 'agendaclasesapp+s02@gmail.com';
commit;
