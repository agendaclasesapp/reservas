-- Semilla SOLO local y CI (`supabase db reset`). Nunca se aplica en producción (ADR-012, ADR-014).
-- Datos ficticios: dominio reservado `.test`.

-- 1. Profesor de desarrollo por la misma función que se usa en la puesta en marcha (ADR-015).
select privado.configurar_profesor('profesor@example.test', 'Profesor de Prueba');

-- 2. Reloj de prueba habilitado (ADR-014). Es el único lugar del repositorio que lo habilita;
--    la hora sigue siendo la real mientras `privado.reloj_prueba.ahora` sea nulo.
update privado.ajustes set permitir_reloj_prueba = true;

-- 3. Vault: URL y secreto del disparo de mails (ADR-005, «Ajustes tras S01»). El secreto es el mismo
--    valor de prueba que `MAIL_SECRETO` en `supabase/.env.development` y `.env.example`; el de
--    producción se carga a mano (ADR-012).
select vault.create_secret('http://kong:8000/functions/v1/enviar-mail', 'url_funcion_mail')
 where not exists (select 1 from vault.secrets where name = 'url_funcion_mail');
select vault.create_secret('secreto-solo-local-sin-valor', 'mail_secreto')
 where not exists (select 1 from vault.secrets where name = 'mail_secreto');
