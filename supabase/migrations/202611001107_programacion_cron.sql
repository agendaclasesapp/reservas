-- B11 · T11.1 (segunda parte) · Programación en pg_cron de la retención y los recordatorios.
-- IDs: SEC-28, ALU-10, AVI-05, AVI-06. ADR-008 (horarios), ADR-011 (un error se registra y se relanza, así
-- `cron.job_run_details` marca la corrida fallida), H-014.

-- 1. `privado.correr_proceso(p_nombre)`: lo que llama pg_cron. Las funciones `privado.retencion()` y
--    `privado.recordatorios()` registran su corrida y devuelven `ok`; si es `false`, este procedimiento confirma
--    la transacción (la fila de `privado.ejecucion_proceso` queda guardada) y recién entonces relanza el error,
--    que pg_cron anota como `failed` en `cron.job_run_details`. Una función no puede hacer las dos cosas: el error
--    relanzado desharía su propia fila.
--    Es un procedimiento security invoker y sin `SET` (un procedimiento con `SET` o security definer no puede
--    hacer COMMIT); por eso todo va calificado y lo llama solo `postgres` (el dueño de los jobs). Dentro de una
--    transacción explícita (una prueba), el camino con error no puede confirmar y termina con `2D000`.
create procedure privado.correr_proceso(p_nombre text)
language plpgsql
as $$
declare
  v_resultado jsonb;
begin
  if p_nombre = 'retencion' then
    v_resultado := privado.retencion();
  elsif p_nombre = 'recordatorios' then
    v_resultado := privado.recordatorios();
  else
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_nombre"}';
  end if;

  if not (v_resultado ->> 'ok')::boolean then
    commit;
    raise exception using errcode = 'P0001', message = 'PROCESO_FALLIDO',
      detail = p_nombre || ': ' || coalesce(v_resultado ->> 'error', '');
  end if;
end;
$$;

revoke execute on procedure privado.correr_proceso(text) from public, anon, authenticated;

-- 2. pg_cron (ADR-008, SEC-28). `cron.schedule` con nombre es idempotente (reemplaza el job del mismo nombre).
--    Corren como `postgres`, sin argumento de fecha: la hora sale de `app_ahora()` (ADR-014).
select cron.schedule('recordatorios', '*/15 * * * *', 'call privado.correr_proceso(''recordatorios'')');
select cron.schedule('retencion', '30 3 * * *', 'call privado.correr_proceso(''retencion'')');
