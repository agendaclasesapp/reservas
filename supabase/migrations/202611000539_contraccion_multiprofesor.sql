-- B15 · T15.4 · Contracción de la migración a varios profesores (ADR-021 paso 6; ADM-05, NFR-01).
-- Se aplica en producción con la web de B14 publicada y el humo en verde, y antes de cualquier migración
-- `2026110006*` (ADR-021 §7, `ops/migracion-multiprofesor.md`). Después de esta migración la vuelta atrás es
-- solo el dump (ADR-021 §8): `ops/vuelta-atras/inversa-b14.sql` ya no aplica.
-- Borra lo que la expansión (0510 a 0526) dejó sin uso:
--   - las funciones de transición `config_publica()` y `agenda_publica(p_dia)` sin slug, y su auxiliar
--     `privado.unico_profesor()` (0521);
--   - `alumno.profesor_id`, `alumno.motivo_estado`, `alumno.aprobado_en`, `alumno.como_llego` y
--     `persona_a_cargo.profesor_id` (sus valores viven en `inscripcion` desde 0510; 0525 los vació);
--   - `privado.configurar_profesor(p_mail, p_nombre)` de dos argumentos (0511; queda la de tres, ADR-018).
-- Sin `cascade`: si algo inesperado depende de un objeto, la migración aborta entera y no borra nada.

-- 1. Comprobación (ADR-021 §3: `raise … P0004`, no `assert`): las columnas viejas están vacías. 0525 las vació y
--    nada las escribe desde entonces; un valor ahora sería un dato que esta migración perdería sin copia.
do $$
begin
  if exists (select 1 from public.alumno a
              where a.profesor_id is not null or a.motivo_estado is not null
                 or a.aprobado_en is not null or a.como_llego is not null)
     or exists (select 1 from public.persona_a_cargo pc where pc.profesor_id is not null) then
    raise exception using errcode = 'P0004',
      message = 'ADR-021: hay datos en las columnas viejas de alumno o persona_a_cargo; revisar antes de contraer';
  end if;
end;
$$;

-- 2. Funciones de transición (ADR-021 §2, ADR-020). Sin ellas, PostgREST responde 404 a la llamada sin slug.
drop function public.config_publica();
drop function public.agenda_publica(date);
drop function privado.unico_profesor();

-- 3. `configurar_profesor` de dos argumentos (ADR-015, reemplazada por la de tres en ADR-018).
drop function privado.configurar_profesor(extensions.citext, text);

-- 4. Índices por profesor de B01 (0103). Sus reemplazos sin `profesor_id` son de 0510:
--    `alumno_telefono_clave_persona (telefono_clave)` y `alumno_ficha_origen (ficha_origen_profesor_id,
--    ficha_completada_en)`. Se borran a la vista y no como efecto del `drop column`.
drop index public.alumno_telefono_clave;
drop index public.alumno_ficha_completada_en;

-- 5. Columnas sin uso. Las restricciones de largo (0401, 0501) y las claves foráneas caen con su columna; el permiso
--    de lectura por columnas de 0525 ya no las nombraba.
alter table public.alumno
  drop column profesor_id,
  drop column motivo_estado,
  drop column aprobado_en,
  drop column como_llego;

alter table public.persona_a_cargo
  drop column profesor_id;
