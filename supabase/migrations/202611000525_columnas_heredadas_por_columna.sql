-- B14 · Corrección H-284 (SEC-02, SEC-06, X-01): las columnas que la expansión (0510) dejó sin uso en `alumno`
-- (`profesor_id`, `motivo_estado`, `como_llego`, `aprobado_en`) y en `persona_a_cargo` (`profesor_id`) guardaban
-- lo que cargó el profesor de B05. Con varios profesores, `alumno_lectura` deja leer la fila de una persona a
-- cada profesor con el que está inscripta, y el `grant select` de tabla entera de B01 (0103) le daba esas columnas
-- por PostgREST: el motivo, cómo llegó y la fecha de aprobación de otro profesor.
-- Va en un archivo propio y no dentro de 0510 porque el permiso por columnas tiene que nombrar el juego final de
-- columnas de la expansión (`compartida` llega en 0523); el vaciado viaja con él para que la corrección sea una
-- sola unidad. Los valores ya están copiados en `inscripcion` (0510, paso 7) y la vuelta atrás los recupera de ahí
-- (`ops/vuelta-atras/inversa-b14.cuerpo.sql`, 3.1). En B05 solo los alumnos con vínculo tenían esos datos.
-- Las columnas las borra la contracción de B15 (T15.4).

-- 1. Vaciado: nada de B05 queda en columnas sin uso.
update public.alumno
   set profesor_id = null, motivo_estado = null, como_llego = null, aprobado_en = null
 where profesor_id is not null or motivo_estado is not null or como_llego is not null or aprobado_en is not null;

update public.persona_a_cargo set profesor_id = null where profesor_id is not null;

-- 2. Lectura por columnas para `authenticated` (como `mail_salida`, 0301). Fuera: las cuatro columnas viejas y
--    `ficha_origen_profesor_id` (dice por qué profesor llegó la persona; solo la usa `privado.completar_ficha`,
--    que es `security definer`). `creado_por` queda: la usa `v_alumnos` (`security_invoker`) para `editable`.
--    Una columna nueva de `alumno` o `persona_a_cargo` no es legible hasta que una migración la agregue aquí.
revoke select on public.alumno, public.persona_a_cargo from authenticated;

grant select (id, user_id, estado, nombre, mail, telefono, telefono_clave, fecha_nacimiento, ficha_completada_en,
              creado_en, ultimo_ingreso, aviso_inactividad_en, borrado_en, creado_por, compartida)
  on public.alumno to authenticated;

grant select (id, alumno_id, nombre, fecha_nacimiento) on public.persona_a_cargo to authenticated;
