-- Semilla SOLO local y CI (`supabase db reset`). Nunca se aplica en producción (ADR-012, ADR-014).
-- Datos ficticios: dominio reservado `.test`.

-- 1. Dos profesores y el Administrador por las mismas funciones que usa el operador (ADR-018, ADM-01).
--    `profesor@example.test` es el de `tests/soporte/usuarios.ts`. Cada profesor nace activo, con el huso
--    de la instalación y la grilla de AGE-01.
select privado.configurar_profesor('profesor@example.test', 'Profesor de Prueba', 'profesor-prueba');
select privado.configurar_profesor('profesora.b@example.test', 'Profesora B de Prueba', 'profesora-b');
select privado.configurar_administrador('admin@example.test');

-- 2. Reloj de prueba habilitado (ADR-014). Es el único lugar del repositorio que lo habilita;
--    la hora sigue siendo la real mientras `privado.reloj_prueba.ahora` sea nulo.
update privado.ajustes set permitir_reloj_prueba = true;

-- 3. Una persona con ficha completa y una inscripción con cada profesor (ALU-14, DEC-25): aprobada con el
--    primero, por cuyo enlace llegó, y pendiente con la segunda. Sin usuario de Auth: un ingreso local con
--    ese mail la vincula conservando ficha e inscripciones (trigger de Auth, ADR-013).
with persona as (
  insert into public.alumno (estado, nombre, mail, telefono, fecha_nacimiento, ficha_completada_en,
                             ficha_origen_profesor_id)
  select 'completa', 'Persona de Prueba', 'persona@example.test', '099 000 001', date '1990-05-10',
         public.app_ahora(), p.id
    from public.profesor p
   where p.slug = 'profesor-prueba'
  returning id, ficha_origen_profesor_id
)
insert into public.inscripcion (alumno_id, profesor_id, estado, como_llego, aprobado_en)
select persona.id, p.id,
       case when p.id = persona.ficha_origen_profesor_id then 'aprobado' else 'pendiente' end,
       case when p.id = persona.ficha_origen_profesor_id then 'Por una amiga' else 'Me pasaron el enlace' end,
       case when p.id = persona.ficha_origen_profesor_id then public.app_ahora() end
  from persona
 cross join public.profesor p;

-- 4. Vault: URL y secreto del disparo de mails (ADR-005, «Ajustes tras S01»). El secreto es el mismo
--    valor de prueba que `MAIL_SECRETO` en `supabase/.env.development` y `.env.example`; el de
--    producción se carga a mano (ADR-012).
select vault.create_secret('http://kong:8000/functions/v1/enviar-mail', 'url_funcion_mail')
 where not exists (select 1 from vault.secrets where name = 'url_funcion_mail');
select vault.create_secret('secreto-solo-local-sin-valor', 'mail_secreto')
 where not exists (select 1 from vault.secrets where name = 'mail_secreto');
