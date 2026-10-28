-- B14 · T14.1 · RLS por profesor en todas las tablas (ADR-018, ADR-001; contratos.md §2).
-- IDs: NFR-01, PRF-07, ADM-04, SEC-02. Única fuente del profesor: `privado.mi_profesor_id()`.
-- Solo lectura para `authenticated`; toda escritura sigue por RPC `security definer` (ADR-002). `anon` no
-- recibe nada. El Administrador, por serlo, no aparece en ninguna política (ADM-04).

-- 1. Inscripción: el profesor, las suyas; la persona, las suyas con todos sus profesores.
alter table public.inscripcion enable row level security;
revoke all on public.inscripcion from public, anon, authenticated;
grant select on public.inscripcion to authenticated;

create policy inscripcion_lectura on public.inscripcion
  for select to authenticated
  using (profesor_id = (select privado.mi_profesor_id())
         or alumno_id = (select privado.mi_alumno_id()));

-- 2. Profesor: cada uno su fila. El Administrador lista profesores por `v_profesores` (B15).
drop policy profesor_lectura on public.profesor;
create policy profesor_lectura on public.profesor
  for select to authenticated
  using (id = (select privado.mi_profesor_id()));

-- 3. Persona y personas a cargo: la propia, o las de una persona inscripta con el profesor que no esté en
--    `baja`. Una ficha incompleta no tiene inscripción: ningún profesor la ve.
drop policy alumno_lectura on public.alumno;
create policy alumno_lectura on public.alumno
  for select to authenticated
  using (id = (select privado.mi_alumno_id())
         or id in (select i.alumno_id
                     from public.inscripcion i
                    where i.profesor_id = (select privado.mi_profesor_id())
                      and i.estado <> 'baja'));

drop policy persona_a_cargo_lectura on public.persona_a_cargo;
create policy persona_a_cargo_lectura on public.persona_a_cargo
  for select to authenticated
  using (alumno_id = (select privado.mi_alumno_id())
         or alumno_id in (select i.alumno_id
                            from public.inscripcion i
                           where i.profesor_id = (select privado.mi_profesor_id())
                             and i.estado <> 'baja'));

-- 4. Agenda (B02): grilla y bloqueos solo su profesor; reservas y clases su profesor y su alumno (de
--    todos sus profesores).
drop policy grilla_tramo_lectura on public.grilla_tramo;
create policy grilla_tramo_lectura on public.grilla_tramo
  for select to authenticated
  using (profesor_id = (select privado.mi_profesor_id()));

drop policy bloqueo_lectura on public.bloqueo;
create policy bloqueo_lectura on public.bloqueo
  for select to authenticated
  using (profesor_id = (select privado.mi_profesor_id()));

drop policy reserva_lectura on public.reserva;
create policy reserva_lectura on public.reserva
  for select to authenticated
  using (profesor_id = (select privado.mi_profesor_id())
         or alumno_id = (select privado.mi_alumno_id()));

drop policy clase_lectura on public.clase;
create policy clase_lectura on public.clase
  for select to authenticated
  using (profesor_id = (select privado.mi_profesor_id())
         or alumno_id = (select privado.mi_alumno_id()));

-- 5. Mails (B03): solo los de su profesor; los de la aplicación (`profesor_id` nulo) no los ve nadie.
--    Los permisos por columna de B03 (sin asunto ni cuerpo, H-011) no cambian.
drop policy mail_salida_lectura on public.mail_salida;
create policy mail_salida_lectura on public.mail_salida
  for select to authenticated
  using (profesor_id = (select privado.mi_profesor_id()));
