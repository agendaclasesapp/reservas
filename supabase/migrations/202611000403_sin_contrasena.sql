-- B04 · H-180 · La app no usa contraseñas: se ingresa solo por código al mail o con Google (ALU-01, ADR-007).
-- El signup con contraseña de GoTrue sigue abierto (no hay opción de config que lo cierre sin apagar el OTP
-- por mail), y una contraseña preregistrada sobrevivía a la confirmación del mail por la víctima (SEC-14):
-- quien preregistraba el mail del profesor o de un alumno dado de alta (ALU-07, ADR-013, ADR-015) entraba
-- después con su contraseña sobre la cuenta ya vinculada.
-- Defensa: `auth.users.encrypted_password` queda siempre vacía. Un trigger BEFORE la vacía en el alta
-- (signUp con contraseña), en la confirmación y en cualquier escritura posterior (updateUser, admin o
-- GoTrue reescribiendo la fila completa). Con la columna en '' GoTrue rechaza todo `grant_type=password`
-- con `invalid_credentials`; el código y Google no la leen.

create function privado.sin_contrasena()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  new.encrypted_password := '';
  return new;
end;
$$;

revoke execute on function privado.sin_contrasena() from public, anon, authenticated;

-- BEFORE: corre antes de `al_confirmar_usuario` (AFTER), así la vinculación nunca ve una contraseña.
create trigger sin_contrasena
  before insert or update on auth.users
  for each row
  when (new.encrypted_password is not null and new.encrypted_password <> '')
  execute function privado.sin_contrasena();

-- Usuarios que ya tenían contraseña antes de esta migración (p. ej. un preregistro pendiente).
update auth.users
   set encrypted_password = ''
 where encrypted_password is not null
   and encrypted_password <> '';
