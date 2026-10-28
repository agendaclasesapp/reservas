-- B07 · T07.1 · Lecturas de Mis clases (persona) y de la vista en modo lista (profesor). contratos.md §2.
-- IDs: RES-06, SOL-04, SOL-08, SOL-09, PRF-06, PRF-07, PRF-08, NFR-01, SEC-02, SEC-05, SEC-32.
-- Las tres son `security_invoker` (SEC-05): heredan la RLS de `clase`, `reserva`, `solicitud`, `alumno`,
-- `persona_a_cargo` e `inscripcion`, y además filtran por la sesión: `privado.mi_alumno_id()` la de la persona
-- y `privado.mi_profesor_id()` las del profesor (ADR-018). Toda hora sale de `public.app_ahora()` (ADR-014).
-- Solo lectura: `authenticated` tiene `select` y nada más (las escrituras van por RPC, ADR-002).

-- 1. Criterio común de `solicitud_pendiente` (`{id, tipo, alcance, vencida}` o null) en `v_mis_clases` y
--    `v_clases` (SOL-01..03): la de reserva sobre su reserva, o la de movimiento o cancelación sobre la clase
--    o con su reserva como destino (B08). `vencida`: su horario ya pasó y nadie respondió (SOL-08, CA-25).

-- 2. `v_mis_clases` (persona, RES-06, CA-20, CA-53): sus clases de todos sus profesores, todas las fechas y
--    todos los estados, con su profesor (nombre, slug y huso copiados en `inscripcion`, 202611000701).
--    `pasada`: empezó según `app_ahora()`; la web separa próximas y pasadas con ella, sin reloj propio.
create view public.v_mis_clases
with (security_invoker = true) as
select c.id,
       c.inicio,
       c.fin,
       c.estado,
       coalesce(pc.nombre, a.nombre) as quien_toma,
       c.persona_a_cargo_id,
       r.observacion,
       r.tipo as reserva_tipo,
       r.frecuencia_semanas as frecuencia,
       sp.solicitud_pendiente,
       (c.inicio <= public.app_ahora()) as pasada,
       c.reserva_id,
       c.profesor_id,
       i.profesor_nombre,
       i.profesor_slug,
       i.profesor_zona_horaria as zona_horaria
  from public.clase c
  join public.reserva r on r.id = c.reserva_id
  join public.alumno a on a.id = c.alumno_id
  left join public.persona_a_cargo pc on pc.id = c.persona_a_cargo_id
  left join public.inscripcion i on i.alumno_id = c.alumno_id and i.profesor_id = c.profesor_id
  left join lateral (
    select pg_catalog.jsonb_build_object(
             'id', s.id,
             'tipo', s.tipo,
             'alcance', s.alcance,
             'vencida', s.fecha_clase <= public.app_ahora()) as solicitud_pendiente
      from public.solicitud s
     where s.estado = 'pendiente'
       and s.profesor_id = c.profesor_id
       and (s.clase_id = c.id or s.reserva_id = c.reserva_id)
     order by s.creada_en desc, s.id
     limit 1
  ) sp on true
 where c.alumno_id = (select privado.mi_alumno_id());

revoke all on public.v_mis_clases from public, anon, authenticated;
grant select on public.v_mis_clases to authenticated;

-- 3. `v_clases` (profesor, PRF-06, CA-29): las clases de su agenda, pasadas incluidas, con alumno, titular,
--    quién toma, observación y estado. Filtros de PostgREST: `inicio=gte.…&inicio=lt.…` y `alumno_id=eq.…`.
--    `titular` y `quien_toma` salen null si la persona ya no está en su lista (inscripción en `baja`, RLS).
--    PRF-08: el profesor inactivo las sigue viendo (`mi_profesor_id()` no mira `activo`).
create view public.v_clases
with (security_invoker = true) as
select c.id,
       c.inicio,
       c.fin,
       c.estado,
       c.alumno_id,
       a.nombre as titular,
       coalesce(pc.nombre, a.nombre) as quien_toma,
       c.persona_a_cargo_id,
       r.observacion,
       r.tipo as reserva_tipo,
       r.frecuencia_semanas as frecuencia,
       sp.solicitud_pendiente,
       (c.inicio <= public.app_ahora()) as pasada,
       c.reserva_id,
       c.profesor_id
  from public.clase c
  join public.reserva r on r.id = c.reserva_id
  left join public.alumno a on a.id = c.alumno_id
  left join public.persona_a_cargo pc on pc.id = c.persona_a_cargo_id
  left join lateral (
    select pg_catalog.jsonb_build_object(
             'id', s.id,
             'tipo', s.tipo,
             'alcance', s.alcance,
             'vencida', s.fecha_clase <= public.app_ahora()) as solicitud_pendiente
      from public.solicitud s
     where s.estado = 'pendiente'
       and s.profesor_id = c.profesor_id
       and (s.clase_id = c.id or s.reserva_id = c.reserva_id)
     order by s.creada_en desc, s.id
     limit 1
  ) sp on true
 where c.profesor_id = (select privado.mi_profesor_id());

revoke all on public.v_clases from public, anon, authenticated;
grant select on public.v_clases to authenticated;

-- 4. `v_solicitudes_pendientes` (profesor, PRF-06, SOL-04, SOL-08, CA-21, CA-55): sus solicitudes pendientes
--    ordenadas por `fecha_clase`, con `vencida`, tipo, alcance, origen y destino. Ningún otro profesor las ve
--    (SOL-04, PRF-07). Reserva: sin origen; destino = su primera clase. Movimiento (B08): origen = la clase,
--    destino = primera clase de la reserva destino. Cancelación (B08): origen = la clase, sin destino.
--    Con el profesor inactivo no hay pendientes: se anulan al inactivarlo (AGE-11, PRF-08).
create view public.v_solicitudes_pendientes
with (security_invoker = true) as
select s.id,
       s.tipo,
       s.alcance,
       s.fecha_clase,
       (s.fecha_clase <= public.app_ahora()) as vencida,
       s.alumno_id,
       a.nombre as titular,
       coalesce(pc.nombre, a.nombre) as quien_toma,
       coalesce(r.observacion, ro.observacion) as observacion,
       coalesce(r.tipo, ro.tipo) as reserva_tipo,
       coalesce(r.frecuencia_semanas, ro.frecuencia_semanas) as frecuencia,
       co.inicio as origen_inicio,
       co.fin as origen_fin,
       d.inicio as destino_inicio,
       d.fin as destino_fin,
       s.reserva_id,
       s.clase_id,
       s.creada_en,
       s.profesor_id
  from public.solicitud s
  left join public.reserva r on r.id = s.reserva_id
  left join public.clase co on co.id = s.clase_id
  left join public.reserva ro on ro.id = co.reserva_id
  left join public.alumno a on a.id = s.alumno_id
  left join public.persona_a_cargo pc on pc.id = coalesce(r.persona_a_cargo_id, co.persona_a_cargo_id)
  left join lateral (
    select c.inicio, c.fin
      from public.clase c
     where c.reserva_id = s.reserva_id
       and c.profesor_id = s.profesor_id
     order by c.inicio
     limit 1
  ) d on true
 where s.profesor_id = (select privado.mi_profesor_id())
   and s.estado = 'pendiente'
 order by s.fecha_clase, s.id;

revoke all on public.v_solicitudes_pendientes from public, anon, authenticated;
grant select on public.v_solicitudes_pendientes to authenticated;

-- 5. Solo lectura por la API (H-210, SEC-03): las tres vistas tienen joins y no son actualizables; sin
--    triggers INSTEAD OF un POST, PATCH o DELETE fallaría en el rewriter con 55000 y PostgREST daría 500.
--    Con ellos Postgres comprueba los privilegios (solo `select`) y responde 42501: 401 (anon) o 403 (con
--    sesión). Reusa `privado.v_alumnos_solo_lectura()` de 202611000504, que lanza 42501 sin datos.
create trigger v_mis_clases_sin_insert instead of insert on public.v_mis_clases
  for each row execute function privado.v_alumnos_solo_lectura();
create trigger v_mis_clases_sin_update instead of update on public.v_mis_clases
  for each row execute function privado.v_alumnos_solo_lectura();
create trigger v_mis_clases_sin_delete instead of delete on public.v_mis_clases
  for each row execute function privado.v_alumnos_solo_lectura();

create trigger v_clases_sin_insert instead of insert on public.v_clases
  for each row execute function privado.v_alumnos_solo_lectura();
create trigger v_clases_sin_update instead of update on public.v_clases
  for each row execute function privado.v_alumnos_solo_lectura();
create trigger v_clases_sin_delete instead of delete on public.v_clases
  for each row execute function privado.v_alumnos_solo_lectura();

create trigger v_solicitudes_pendientes_sin_insert instead of insert on public.v_solicitudes_pendientes
  for each row execute function privado.v_alumnos_solo_lectura();
create trigger v_solicitudes_pendientes_sin_update instead of update on public.v_solicitudes_pendientes
  for each row execute function privado.v_alumnos_solo_lectura();
create trigger v_solicitudes_pendientes_sin_delete instead of delete on public.v_solicitudes_pendientes
  for each row execute function privado.v_alumnos_solo_lectura();
