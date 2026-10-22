-- B05 · H-210 · `v_alumnos` de solo lectura por la API (SEC-03, SEC-05).
-- La vista tiene un join y no es actualizable: un POST, PATCH o DELETE directo fallaba en el rewriter con
-- 55000 («cannot insert into view») antes de comprobar permisos, y PostgREST lo devolvía como 500.
-- Con triggers INSTEAD OF la vista pasa el rewriter y Postgres comprueba los privilegios: anon y
-- authenticated no tienen insert, update ni delete (revocados en 202611000501), así que fallan con 42501
-- y PostgREST responde 401 (anon) o 403 (con sesión). Si un rol con privilegios llega al trigger
-- (service_role, superusuario), el trigger también lanza 42501. El mensaje no lleva datos.
create function privado.v_alumnos_solo_lectura()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'PROHIBIDO';
end;
$$;

revoke execute on function privado.v_alumnos_solo_lectura() from public, anon, authenticated;

create trigger v_alumnos_sin_insert
  instead of insert on public.v_alumnos
  for each row execute function privado.v_alumnos_solo_lectura();

create trigger v_alumnos_sin_update
  instead of update on public.v_alumnos
  for each row execute function privado.v_alumnos_solo_lectura();

create trigger v_alumnos_sin_delete
  instead of delete on public.v_alumnos
  for each row execute function privado.v_alumnos_solo_lectura();
