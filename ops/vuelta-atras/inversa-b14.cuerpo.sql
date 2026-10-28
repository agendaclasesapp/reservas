-- B14 · Migración INVERSA de la expansión a varios profesores (ADR-021 §8). NO está en supabase/migrations/:
-- la corre el operador a mano (psql con la cadena del pooler de sesión, o el SQL Editor) y solo si la
-- contracción de B15 todavía NO se aplicó. Después de contraer, la vuelta atrás es el dump previo.
-- ARCHIVO GENERADO por ops/vuelta-atras/generar-inversa.py desde el catálogo de una base en B05
-- (migraciones 20261100010* a 20261100050*): las funciones, vistas, triggers, políticas y permisos que
-- restaura son los de B01 a B05. No editar a mano: editar inversa-b14.cuerpo.sql y regenerar.
--
-- Qué hace, en una sola transacción (si algo falla, no queda nada a medias):
--   1. Comprueba que se puede volver: una sola fila de `profesor` y la expansión aplicada.
--   2. Quita políticas RLS, triggers y vistas de `public` (se recrean con la definición de B05).
--   3. Devuelve los datos a la forma de B05: `alumno.estado` y sus columnas desde `inscripcion` (un profesor),
--      `mail_salida`, `privado.ajustes`, `profesor`; borra `inscripcion` y `privado.administrador`.
--   4. Quita las funciones que B05 no tiene (o con otra firma) y recrea las de B05 con sus permisos.
--   5. Recrea vistas, triggers y políticas de B05, y borra las versiones 20261100051* y 20261100052* del registro
--      de migraciones (supabase_migrations.schema_migrations).
-- Lo que se pierde (avisarlo al profesor): las inscripciones `baja` pasan a `rechazado`; los mails sin
-- profesor (de la aplicación) se borran; `remitente_nombre` y `responder_a` de los mails; el slug; el
-- Administrador; las fichas de personas sin inscripción pasan a `pendiente` del único profesor.
-- Con más de un profesor la inversa NO corre (aborta con P0004): ahí solo sirve el dump.

begin;
set local lock_timeout = '10s';

-- 1. Comprobaciones previas ---------------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.inscripcion') is null then
    raise exception using errcode = 'P0004',
      message = 'inversa B14: no existe public.inscripcion (¿ya se aplicó la inversa o la contracción de B15?)';
  end if;
  if (select count(*) from public.profesor) > 1 then
    raise exception using errcode = 'P0004',
      message = 'inversa B14: B05 solo admite un profesor y hay ' || (select count(*) from public.profesor)
                || '; la vuelta atrás es el dump previo';
  end if;
  if exists (select 1 from public.alumno a where a.profesor_id is not null
                and a.profesor_id <> (select p.id from public.profesor p)) then
    raise exception using errcode = 'P0004', message = 'inversa B14: hay alumnos de otro profesor';
  end if;
end;
$$;

-- 2. Fuera políticas, triggers y vistas de public (las de B14 y las de 052*) ---------------------------------
do $$
declare
  r record;
begin
  for r in select pol.schemaname, pol.tablename, pol.policyname from pg_catalog.pg_policies pol
            where pol.schemaname = 'public' loop
    execute pg_catalog.format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
  for r in select t.tgname, n.nspname, c.relname
             from pg_catalog.pg_trigger t
             join pg_catalog.pg_class c on c.oid = t.tgrelid
             join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and not t.tgisinternal loop
    execute pg_catalog.format('drop trigger %I on %I.%I', r.tgname, r.nspname, r.relname);
  end loop;
  for r in select n.nspname, c.relname from pg_catalog.pg_class c
             join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'v' loop
    execute pg_catalog.format('drop view %I.%I', r.nspname, r.relname);
  end loop;
end;
$$;

-- 3. Datos y tablas a la forma de B05 -----------------------------------------------------------------------
-- 3.0 profesor: sin slug ni activo, mail anulable y fila única (B01, ADR-015). Va primero porque `alumno.profesor_id`
-- vuelve a ser obligatorio. Si no había ninguno (instalación sin puesta en marcha) se recrea la fila en blanco de B01
-- con su grilla semilla (AGE-01).
alter table public.profesor
  drop constraint profesor_slug_unico,
  drop constraint profesor_slug_valido,
  drop constraint profesor_mail_unico,
  drop constraint profesor_nombre_largo,
  alter column mail drop not null,
  drop column slug,
  drop column slug_provisional,
  drop column activo,
  drop column creado_en;
create unique index profesor_fila_unica on public.profesor ((true));
insert into public.profesor (id) select gen_random_uuid() where not exists (select 1 from public.profesor);
insert into public.grilla_tramo (profesor_id, dia_semana, desde, hasta)
select p.id, d.dia, t.desde, t.hasta
  from public.profesor p
 cross join pg_catalog.generate_series(1, 5) as d (dia)
 cross join (values (time '08:00', time '13:00'), (time '14:00', time '18:00')) as t (desde, hasta)
 where not exists (select 1 from public.grilla_tramo g where g.profesor_id = p.id);

-- 3.1 alumno: el estado de vínculo vuelve a la ficha desde `inscripcion` (un solo profesor).
alter table public.alumno drop constraint alumno_estado_check;
drop index public.alumno_mail_unico;

update public.alumno a
   set estado = case
         when a.estado = 'completa' then
           coalesce((select case i.estado when 'baja' then 'rechazado' else i.estado end
                       from public.inscripcion i where i.alumno_id = a.id
                      order by i.creado_en limit 1), 'pendiente')
         else a.estado end,
       motivo_estado = (select i.motivo_estado from public.inscripcion i where i.alumno_id = a.id
                         order by i.creado_en limit 1),
       como_llego = coalesce((select i.como_llego from public.inscripcion i where i.alumno_id = a.id
                               order by i.creado_en limit 1), a.como_llego),
       aprobado_en = (select i.aprobado_en from public.inscripcion i where i.alumno_id = a.id
                       order by i.creado_en limit 1),
       profesor_id = (select p.id from public.profesor p);

alter table public.alumno
  add constraint alumno_estado_check check (estado in
    ('ficha_incompleta', 'pendiente', 'aprobado', 'rechazado', 'sin_cuenta', 'borrado')),
  alter column profesor_id set not null,
  drop column creado_por,
  drop column ficha_origen_profesor_id;

drop index if exists public.alumno_ficha_origen;
drop index if exists public.alumno_telefono_clave_persona;

-- Mail único por profesor (B04): con un solo profesor equivale al global, que ya lo garantizaba.
create unique index alumno_mail_unico on public.alumno (profesor_id, mail)
  where mail is not null and estado <> 'borrado';

update public.persona_a_cargo set profesor_id = (select p.id from public.profesor p) where profesor_id is null;
alter table public.persona_a_cargo alter column profesor_id set not null;

-- Permisos de B01 (0103): `select` de tabla entera. La expansión los dejó por columnas (0525, H-284); revocar a
-- nivel de tabla también quita los de cada columna.
revoke select on public.alumno, public.persona_a_cargo from authenticated;
grant select on public.alumno, public.persona_a_cargo to authenticated;

-- 3.2 inscripcion y administrador fuera.
drop table public.inscripcion;
drop table privado.administrador;

-- 3.3 mail_salida: los mails de la aplicación (sin profesor) no existían en B05.
delete from public.mail_salida where profesor_id is null;
alter table public.mail_salida
  alter column profesor_id set not null,
  drop column remitente_nombre,
  drop column responder_a;
drop index if exists public.mail_salida_creado;
-- Los tipos de mail de B05 (T14.2 agregó otros): los mails de tipos nuevos se borran.
delete from public.mail_salida where tipo <> all (@@TIPOS_MAIL_B05@@);
alter table public.mail_salida drop constraint mail_salida_tipo_check;
alter table public.mail_salida add @@CHECK_TIPO_MAIL_B05@@;

-- 3.4 ajustes (B05: tope de pendientes por alumno = 5).
alter table privado.ajustes
  drop column tope_mails_dia_global,
  drop column zona_horaria_app;
alter table privado.ajustes rename column tope_pendientes to tope_pendientes_alumno;
alter table privado.ajustes rename constraint ajustes_tope_pendientes_check to ajustes_tope_pendientes_alumno_check;
update privado.ajustes set tope_pendientes_alumno = 5;

-- 3.5 Todo lo que T14.2 (migraciones 052*) u otra migración de la expansión agregó y B05 no tiene: tablas,
--     columnas, restricciones e índices. Se compara con el catálogo de B05 (catalogo-b05.sql). Los datos de esas
--     columnas y tablas se pierden con la vuelta atrás.
create temp table t_catalogo_b05 (clase text, esquema text, tabla text, nombre text) on commit drop;
insert into t_catalogo_b05 values
    @@CATALOGO_B05@@;

do $$
declare
  r record;
begin
  for r in select n.nspname, c.relname from pg_catalog.pg_class c
             join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname in ('public', 'privado') and c.relkind in ('r', 'p')
              and not exists (select 1 from t_catalogo_b05 b
                               where b.clase = 'tabla' and b.esquema = n.nspname and b.tabla = c.relname) loop
    execute pg_catalog.format('drop table %I.%I cascade', r.nspname, r.relname);
  end loop;
  for r in select n.nspname, c.relname, a.attname
             from pg_catalog.pg_attribute a
             join pg_catalog.pg_class c on c.oid = a.attrelid
             join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname in ('public', 'privado') and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped
              and not exists (select 1 from t_catalogo_b05 b
                               where b.clase = 'columna' and b.esquema = n.nspname and b.tabla = c.relname
                                 and b.nombre = a.attname) loop
    execute pg_catalog.format('alter table %I.%I drop column %I', r.nspname, r.relname, r.attname);
  end loop;
  for r in select n.nspname, c.relname, k.conname as conname
             from pg_catalog.pg_constraint k
             join pg_catalog.pg_class c on c.oid = k.conrelid
             join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname in ('public', 'privado') and c.relkind in ('r', 'p')
              and not exists (select 1 from t_catalogo_b05 b
                               where b.clase = 'restriccion' and b.esquema = n.nspname and b.tabla = c.relname
                                 and b.nombre = k.conname) loop
    execute pg_catalog.format('alter table %I.%I drop constraint %I', r.nspname, r.relname, r.conname);
  end loop;
  for r in select n.nspname, i.relname
             from pg_catalog.pg_index x
             join pg_catalog.pg_class i on i.oid = x.indexrelid
             join pg_catalog.pg_class c on c.oid = x.indrelid
             join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname in ('public', 'privado') and c.relkind in ('r', 'p')
              and not exists (select 1 from t_catalogo_b05 b
                               where b.clase = 'indice' and b.esquema = n.nspname and b.tabla = c.relname
                                 and b.nombre = i.relname) loop
    execute pg_catalog.format('drop index %I.%I', r.nspname, r.relname);
  end loop;
end;
$$;

-- 4. Funciones: fuera las que B05 no tiene (o con otra firma) y recreadas las de B05 ---------------------------
create temp table t_funciones_b05 (esquema text, nombre text, identidad text, argumentos text, resultado text)
  on commit drop;
insert into t_funciones_b05 values
    @@FUNCIONES_B05@@;

do $$
declare
  r record;
begin
  for r in
    select n.nspname, p.proname,
           pg_catalog.pg_get_function_identity_arguments(p.oid) as identidad
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'privado')
       and not exists (select 1 from pg_catalog.pg_depend d where d.objid = p.oid and d.deptype = 'e')
       and not exists (select 1 from t_funciones_b05 b
                        where b.esquema = n.nspname and b.nombre = p.proname
                          and b.identidad = pg_catalog.pg_get_function_identity_arguments(p.oid)
                          and b.argumentos = pg_catalog.pg_get_function_arguments(p.oid)
                          and b.resultado = pg_catalog.pg_get_function_result(p.oid))
  loop
    execute pg_catalog.format('drop function %I.%I(%s)', r.nspname, r.proname, r.identidad);
  end loop;
end;
$$;

@@CREAR_FUNCIONES@@

-- Permisos: las funciones nuevas nacen con los privilegios por defecto del esquema (anon, authenticated,
-- service_role); se parte de cero y se aplican los de B05.
do $$
declare
  r record;
begin
  for r in
    select n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) as identidad
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'privado')
       and not exists (select 1 from pg_catalog.pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute pg_catalog.format('revoke all on function %I.%I(%s) from public, anon, authenticated, service_role',
                              r.nspname, r.proname, r.identidad);
  end loop;
end;
$$;

@@ACL_FUNCIONES@@

-- 5. Vistas, triggers y políticas de B05 ---------------------------------------------------------------------
@@CREAR_VISTAS@@

-- Las vistas nuevas nacen con los privilegios por defecto: se parte de cero.
do $$
declare
  r record;
begin
  for r in select c.relname from pg_catalog.pg_class c
             join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'v' loop
    execute pg_catalog.format('revoke all on public.%I from public, anon, authenticated, service_role', r.relname);
  end loop;
end;
$$;

@@ACL_VISTAS@@

@@CREAR_TRIGGERS@@

@@CREAR_POLITICAS@@

-- 6. Comprobaciones finales ---------------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.inscripcion') is not null or to_regclass('privado.administrador') is not null then
    raise exception using errcode = 'P0004', message = 'inversa B14: quedaron tablas de B14';
  end if;
  if exists (select 1 from public.alumno a where a.estado not in
             ('ficha_incompleta', 'pendiente', 'aprobado', 'rechazado', 'sin_cuenta', 'borrado')) then
    raise exception using errcode = 'P0004', message = 'inversa B14: estado de alumno que B05 no conoce';
  end if;
end;
$$;

-- 7. Registro de migraciones: la base vuelve a B05, así que las versiones de la expansión dejan de estar
--    aplicadas. Sin esto, `db push` se negaría a seguir (versiones remotas que el repositorio ya no tiene) o no
--    reaplicaría la expansión corregida.
delete from supabase_migrations.schema_migrations
 where version like '20261100051%' or version like '20261100052%';

commit;
