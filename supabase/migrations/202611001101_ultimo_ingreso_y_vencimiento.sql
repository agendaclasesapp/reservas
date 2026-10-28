-- B11 · T11.1 (primera parte) · Último ingreso y vencimiento por inactividad de la persona.
-- IDs: ALU-10, ALU-11, SEC-27. ADR-011 (referencia de inactividad, DEC-04 A) con DEC-26 A: el plazo es de la
-- persona, sobre su actividad con cualquier profesor, no por vínculo.
-- La segunda parte de T11.1 (aviso de inactividad, `privado.ejecucion_proceso`, pg_cron) reutiliza
-- `privado.vencimientos_inactividad` para el aviso de 7 días (AVI-06).

-- 1. Último ingreso (ALU-11): reemplaza el trigger de B04 (202611000401) con la misma firma. Además de
--    renovar `ultimo_ingreso` con `app_ahora()` (ADR-014), limpia `aviso_inactividad_en` (ADR-011: un ingreso
--    posterior al aviso lo deja sin efecto y el aviso puede volver a salir en el plazo nuevo). Una persona ya
--    borrada no tiene usuario (`user_id` nulo), así que no la toca.
create or replace function privado.al_ingresar_usuario()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.alumno a
     set ultimo_ingreso = public.app_ahora(),
         aviso_inactividad_en = null
   where a.user_id = new.id
     and a.estado <> 'borrado';
  return new;
end;
$$;

revoke execute on function privado.al_ingresar_usuario() from public, anon, authenticated;

-- 2. Vencimiento de una persona (ALU-10, DEC-26 A). Null si ya está borrada o si tiene alguna clase futura
--    activa (`pendiente` o `confirmada` con `inicio > p_ahora`) con cualquier profesor: mientras tenga clases
--    por delante no vence. Si no, vence 6 meses después de la mayor de:
--      - el fin de su última clase `confirmada` ya empezada, con cualquier profesor;
--      - la aprobación más reciente de cualquiera de sus inscripciones (`aprobado_en`);
--      - su registro (`alumno.creado_en`; el alta del profesor para un alumno sin cuenta);
--      - su último ingreso (ALU-11).
--    Una cuenta que ningún profesor aprobó y sin clases queda así en registro o último ingreso (ADR-011).
--    Los meses se cuentan en UTC (`set timezone`) para que el resultado no dependa del huso de la sesión:
--    «6 meses menos un día» no vence y «6 meses» sí (SEC-27).
create function privado.vence_inactividad_en(p_alumno_id uuid, p_ahora timestamptz)
returns timestamptz
language sql
stable
set search_path = ''
set timezone to 'UTC'
as $$
  select greatest(
           a.creado_en,
           a.ultimo_ingreso,
           (select pg_catalog.max(i.aprobado_en)
              from public.inscripcion i
             where i.alumno_id = a.id),
           (select pg_catalog.max(c.fin)
              from public.clase c
             where c.alumno_id = a.id
               and c.estado = 'confirmada'
               and c.inicio <= p_ahora)
         ) + interval '6 months'
    from public.alumno a
   where a.id = p_alumno_id
     and a.estado <> 'borrado'
     and not exists (
           select 1
             from public.clase c
            where c.alumno_id = a.id
              and c.estado in ('pendiente', 'confirmada')
              and c.inicio > p_ahora)
$$;

-- 3. Vencimientos de todas las personas no borradas sin clases futuras activas, para el job de retención y
--    para el aviso de 7 días de la segunda parte (`vence_en - interval '7 days' <= p_ahora`).
create function privado.vencimientos_inactividad(p_ahora timestamptz)
returns table (alumno_id uuid, vence_en timestamptz)
language sql
stable
set search_path = ''
as $$
  select a.id, v.vence_en
    from public.alumno a
    cross join lateral (select privado.vence_inactividad_en(a.id, p_ahora) as vence_en) v
   where a.estado <> 'borrado'
     and v.vence_en is not null
$$;

revoke execute on function
  privado.vence_inactividad_en(uuid, timestamptz),
  privado.vencimientos_inactividad(timestamptz)
  from public, anon, authenticated;
