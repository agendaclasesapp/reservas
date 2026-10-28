-- B11 · T11.1 (primera parte) · `borrar_alumno` [P] (ALU-12, DEC-26 A, CA-10, CA-45, CA-57, SEC-06, SEC-27).
-- contratos.md §3: `borrar_alumno(p_alumno_id)` → `{clases_canceladas, solicitudes_anuladas}`; 404.
--
-- Orden: rol (401 sin `sub`, 403 si quien llama no es profesor: alumno o Administrador) → cerrojo del profesor
-- (ADR-002, en `privado.profesor_de_sesion`) → inscripción con quien llama que no esté en `baja` (404 si no
-- existe, es de otro profesor o ya la borró: no revela si existe, SEC-06). No exige el profesor activo: no crea
-- nada en su agenda (ADR-018). Sin mails (DEC-05 A).
--
-- Con ese profesor, en la misma transacción:
--   1. anula sus solicitudes pendientes y cancela sus clases futuras (los huecos quedan libres) y cierra sus
--      series (`privado.cerrar_agenda_alumno`);
--   2. sus clases pasadas con él quedan sin datos de la persona: `reserva.observacion` y `solicitud.motivo` a
--      nulo, y los mails de ese profesor que la nombran (registro de fallos, WEB-08) sin destinatario, asunto,
--      cuerpo ni motivo (uno `pendiente` o `enviando` pasa a `fallido`, H-355);
--   3. la inscripción pasa a `baja` con `motivo_estado` y `como_llego` a nulo (CA-45): la RLS deja de
--      mostrarle a la persona y a sus personas a cargo (`v_clases` da `titular` null);
--   4. si la persona no tiene usuario de Auth (alumno sin cuenta) y no le queda inscripción con otro profesor
--      fuera de `baja`, se anonimiza como en ALU-10 (`privado.anonimizar_alumno`). Con cuenta, su cuenta y su
--      ficha siguen y vencen por inactividad; lo suyo con otros profesores no cambia (un profesor nunca borra
--      la cuenta de una persona).
create function privado.borrar_alumno(p_alumno_id uuid)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_profesor uuid := privado.profesor_de_sesion();
  v_ahora timestamptz := public.app_ahora();
  v_inscripcion uuid;
  v_user uuid;
  v_resultado jsonb;
  v_anonimizado jsonb;
begin
  select i.id into v_inscripcion
    from public.inscripcion i
   where i.alumno_id = p_alumno_id
     and i.profesor_id = v_profesor
     and i.estado <> 'baja'
     for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
  end if;

  select a.user_id into v_user from public.alumno a where a.id = p_alumno_id for update;

  v_resultado := privado.cerrar_agenda_alumno(p_alumno_id, v_profesor, v_ahora);

  update public.reserva r set observacion = null
   where r.alumno_id = p_alumno_id and r.profesor_id = v_profesor and r.observacion is not null;
  update public.solicitud s set motivo = null
   where s.alumno_id = p_alumno_id and s.profesor_id = v_profesor and s.motivo is not null;
  update public.mail_salida m
     set destinatario = null,
         asunto = null,
         cuerpo_texto = null,
         motivo_fallo = null,
         estado = case when m.estado in ('pendiente', 'enviando') then 'fallido' else m.estado end
   where m.alumno_id = p_alumno_id and m.profesor_id = v_profesor;

  update public.inscripcion i
     set estado = 'baja', motivo_estado = null, como_llego = null
   where i.id = v_inscripcion;

  if v_user is null
     and not exists (select 1 from public.inscripcion i
                      where i.alumno_id = p_alumno_id and i.estado <> 'baja') then
    v_anonimizado := privado.anonimizar_alumno(p_alumno_id, v_ahora);
    v_resultado := pg_catalog.jsonb_build_object(
      'clases_canceladas',
      (v_resultado ->> 'clases_canceladas')::integer + (v_anonimizado ->> 'clases_canceladas')::integer,
      'solicitudes_anuladas',
      (v_resultado ->> 'solicitudes_anuladas')::integer + (v_anonimizado ->> 'solicitudes_anuladas')::integer);
  end if;

  return v_resultado;
end;
$$;

create function public.borrar_alumno(p_alumno_id uuid)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select privado.borrar_alumno(p_alumno_id)
$$;

-- Permisos (SEC-04): `privado` no es ejecutable por la API; `borrar_alumno` [P] solo `authenticated` (anon:
-- 401 `42501` de PostgREST, contratos.md §1).
revoke execute on function privado.borrar_alumno(uuid) from public, anon, authenticated;
revoke execute on function public.borrar_alumno(uuid) from public, anon;
grant execute on function public.borrar_alumno(uuid) to authenticated;
