-- B07 · T07.1 · Nombre, slug y huso del profesor en cada inscripción, para `v_mis_clases` (contratos.md §2).
-- IDs: RES-06, WEB-05, CA-53, PRF-07, SEC-02, SEC-05.
--
-- `v_mis_clases` es `security_invoker` (SEC-05) y la persona no lee `profesor` (contratos.md §2: solo su
-- profesor lee su fila; 14_rls_cruzada: «nada de profesores»). Para que cada clase lleve el nombre, el slug y
-- el huso de su profesor sin abrir `profesor` ni sumar una función de `privado` ejecutable por
-- `authenticated` (SEC-04), la inscripción guarda una copia que mantienen dos triggers, como `alumno.compartida`
-- (ADR-018, 202611000523). No expone nada nuevo: nombre y slug ya salen en `sesion_actual().inscripciones`
-- y el huso en `config_publica`. Las escrituras siguen siendo solo por RPC (ADR-002).

-- 1. Columnas copiadas del profesor.
alter table public.inscripcion
  add column profesor_nombre text,
  add column profesor_slug text,
  add column profesor_zona_horaria text;

-- 2. Al insertar o actualizar una inscripción, la copia sale siempre de `profesor` (nadie la fija a mano).
create function privado.inscripcion_datos_profesor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select p.nombre, p.slug::text, p.zona_horaria
    into new.profesor_nombre, new.profesor_slug, new.profesor_zona_horaria
    from public.profesor p
   where p.id = new.profesor_id;
  return new;
end;
$$;

revoke execute on function privado.inscripcion_datos_profesor() from public, anon, authenticated;

create trigger inscripcion_datos_profesor
  before insert or update on public.inscripcion
  for each row execute function privado.inscripcion_datos_profesor();

-- 3. Al cambiar el nombre, el slug o el huso del profesor (`guardar_configuracion`, `configurar_profesor`,
--    `alta_profesor`), se refrescan sus inscripciones. El trigger de `alumno.compartida` no se dispara: solo
--    mira `alumno_id`, `profesor_id` y `estado`.
create function privado.profesor_datos_en_inscripcion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.inscripcion i
     set profesor_nombre = new.nombre,
         profesor_slug = new.slug::text,
         profesor_zona_horaria = new.zona_horaria
   where i.profesor_id = new.id;
  return null;
end;
$$;

revoke execute on function privado.profesor_datos_en_inscripcion() from public, anon, authenticated;

create trigger profesor_datos_en_inscripcion
  after update of nombre, slug, zona_horaria on public.profesor
  for each row
  when (old.nombre is distinct from new.nombre
        or old.slug is distinct from new.slug
        or old.zona_horaria is distinct from new.zona_horaria)
  execute function privado.profesor_datos_en_inscripcion();

-- 4. Datos existentes.
update public.inscripcion i
   set profesor_nombre = p.nombre,
       profesor_slug = p.slug::text,
       profesor_zona_horaria = p.zona_horaria
  from public.profesor p
 where p.id = i.profesor_id;
