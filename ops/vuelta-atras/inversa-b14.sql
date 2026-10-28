-- B14 · Migración INVERSA de la expansión a varios profesores (ADR-021 §8). NO está en supabase/migrations/:
-- la corre el operador a mano (psql con la cadena del pooler de sesión, o el SQL Editor) y solo si la
-- contracción de B15 todavía NO se aplicó. Después de contraer, la vuelta atrás es el dump previo.
--
-- ATENCIÓN (H-313): ESTE ARCHIVO DEJA DE SERVIR DESPUÉS DE LA CONTRACCIÓN 202611000539. Esa migración borra
-- columnas, funciones e índices que esta inversa necesita (alumno.profesor_id, motivo_estado, aprobado_en,
-- como_llego, persona_a_cargo.profesor_id, config_publica() y agenda_publica(p_dia) sin slug). No correrla
-- con 0539 aplicada, ni con B14 y B15 salidos juntos con la contracción. Desde la contracción la ÚNICA vuelta
-- atrás es el dump con datos previo a ella (ops/migracion-multiprofesor.md §6.3).
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
delete from public.mail_salida where tipo <> all (array['cuenta_nueva', 'solicitud_nueva', 'cuenta_respondida', 'solicitud_respondida', 'clase_creada', 'clase_movida', 'clase_cancelada', 'recordatorio', 'aviso_inactividad']);
alter table public.mail_salida drop constraint mail_salida_tipo_check;
alter table public.mail_salida add constraint mail_salida_tipo_check check (tipo = any (array['cuenta_nueva', 'solicitud_nueva', 'cuenta_respondida', 'solicitud_respondida', 'clase_creada', 'clase_movida', 'clase_cancelada', 'recordatorio', 'aviso_inactividad']));

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
    ('columna','privado','ajustes','id'),
    ('columna','privado','ajustes','permitir_reloj_prueba'),
    ('columna','privado','ajustes','tope_fichas_hora'),
    ('columna','privado','ajustes','tope_mails_dia'),
    ('columna','privado','ajustes','tope_mails_hora'),
    ('columna','privado','ajustes','tope_pendientes_alumno'),
    ('columna','privado','reloj_prueba','ahora'),
    ('columna','privado','reloj_prueba','id'),
    ('columna','privado','union_descartada','creado_en'),
    ('columna','privado','union_descartada','cuenta_id'),
    ('columna','privado','union_descartada','sin_cuenta_id'),
    ('columna','public','alumno','aprobado_en'),
    ('columna','public','alumno','aviso_inactividad_en'),
    ('columna','public','alumno','borrado_en'),
    ('columna','public','alumno','como_llego'),
    ('columna','public','alumno','creado_en'),
    ('columna','public','alumno','estado'),
    ('columna','public','alumno','fecha_nacimiento'),
    ('columna','public','alumno','ficha_completada_en'),
    ('columna','public','alumno','id'),
    ('columna','public','alumno','mail'),
    ('columna','public','alumno','motivo_estado'),
    ('columna','public','alumno','nombre'),
    ('columna','public','alumno','profesor_id'),
    ('columna','public','alumno','telefono'),
    ('columna','public','alumno','telefono_clave'),
    ('columna','public','alumno','ultimo_ingreso'),
    ('columna','public','alumno','user_id'),
    ('columna','public','bloqueo','id'),
    ('columna','public','bloqueo','motivo'),
    ('columna','public','bloqueo','periodo'),
    ('columna','public','bloqueo','profesor_id'),
    ('columna','public','clase','alumno_id'),
    ('columna','public','clase','confirmada_en'),
    ('columna','public','clase','estado'),
    ('columna','public','clase','fin'),
    ('columna','public','clase','id'),
    ('columna','public','clase','inicio'),
    ('columna','public','clase','movida_a'),
    ('columna','public','clase','persona_a_cargo_id'),
    ('columna','public','clase','profesor_id'),
    ('columna','public','clase','recordatorio_en'),
    ('columna','public','clase','reserva_id'),
    ('columna','public','grilla_tramo','desde'),
    ('columna','public','grilla_tramo','dia_semana'),
    ('columna','public','grilla_tramo','hasta'),
    ('columna','public','grilla_tramo','id'),
    ('columna','public','grilla_tramo','profesor_id'),
    ('columna','public','mail_salida','alumno_id'),
    ('columna','public','mail_salida','asunto'),
    ('columna','public','mail_salida','creado_en'),
    ('columna','public','mail_salida','cuerpo_texto'),
    ('columna','public','mail_salida','destinatario'),
    ('columna','public','mail_salida','enviado_en'),
    ('columna','public','mail_salida','estado'),
    ('columna','public','mail_salida','id'),
    ('columna','public','mail_salida','intentado_en'),
    ('columna','public','mail_salida','motivo_fallo'),
    ('columna','public','mail_salida','profesor_id'),
    ('columna','public','mail_salida','tipo'),
    ('columna','public','persona_a_cargo','alumno_id'),
    ('columna','public','persona_a_cargo','fecha_nacimiento'),
    ('columna','public','persona_a_cargo','id'),
    ('columna','public','persona_a_cargo','nombre'),
    ('columna','public','persona_a_cargo','profesor_id'),
    ('columna','public','profesor','anticipacion_horas'),
    ('columna','public','profesor','duracion_min'),
    ('columna','public','profesor','horizonte_semanas'),
    ('columna','public','profesor','id'),
    ('columna','public','profesor','mail'),
    ('columna','public','profesor','nombre'),
    ('columna','public','profesor','user_id'),
    ('columna','public','profesor','zona_horaria'),
    ('columna','public','reserva','alumno_id'),
    ('columna','public','reserva','desde'),
    ('columna','public','reserva','dia_semana'),
    ('columna','public','reserva','duracion_min'),
    ('columna','public','reserva','estado'),
    ('columna','public','reserva','frecuencia_semanas'),
    ('columna','public','reserva','hasta'),
    ('columna','public','reserva','hora_local'),
    ('columna','public','reserva','id'),
    ('columna','public','reserva','materializada_hasta'),
    ('columna','public','reserva','observacion'),
    ('columna','public','reserva','origen'),
    ('columna','public','reserva','persona_a_cargo_id'),
    ('columna','public','reserva','profesor_id'),
    ('columna','public','reserva','reserva_origen_id'),
    ('columna','public','reserva','tipo'),
    ('indice','privado','ajustes','ajustes_pkey'),
    ('indice','privado','reloj_prueba','reloj_prueba_pkey'),
    ('indice','privado','union_descartada','union_descartada_pkey'),
    ('indice','privado','union_descartada','union_descartada_sin_cuenta'),
    ('indice','public','alumno','alumno_ficha_completada_en'),
    ('indice','public','alumno','alumno_mail_unico'),
    ('indice','public','alumno','alumno_pkey'),
    ('indice','public','alumno','alumno_telefono_clave'),
    ('indice','public','alumno','alumno_user_id_key'),
    ('indice','public','bloqueo','bloqueo_pkey'),
    ('indice','public','bloqueo','bloqueo_profesor_periodo'),
    ('indice','public','clase','clase_alumno_inicio'),
    ('indice','public','clase','clase_pkey'),
    ('indice','public','clase','clase_profesor_inicio'),
    ('indice','public','clase','clase_reserva'),
    ('indice','public','clase','clase_sin_solape'),
    ('indice','public','grilla_tramo','grilla_tramo_pkey'),
    ('indice','public','grilla_tramo','grilla_tramo_sin_solape'),
    ('indice','public','mail_salida','mail_salida_alumno'),
    ('indice','public','mail_salida','mail_salida_pkey'),
    ('indice','public','mail_salida','mail_salida_profesor_creado'),
    ('indice','public','mail_salida','mail_salida_vivas'),
    ('indice','public','persona_a_cargo','persona_a_cargo_alumno'),
    ('indice','public','persona_a_cargo','persona_a_cargo_pkey'),
    ('indice','public','profesor','profesor_fila_unica'),
    ('indice','public','profesor','profesor_pkey'),
    ('indice','public','profesor','profesor_user_id_key'),
    ('indice','public','reserva','reserva_alumno'),
    ('indice','public','reserva','reserva_pkey'),
    ('indice','public','reserva','reserva_profesor'),
    ('restriccion','privado','ajustes','ajustes_id_check'),
    ('restriccion','privado','ajustes','ajustes_pkey'),
    ('restriccion','privado','ajustes','ajustes_tope_fichas_hora_check'),
    ('restriccion','privado','ajustes','ajustes_tope_mails_dia_check'),
    ('restriccion','privado','ajustes','ajustes_tope_mails_hora_check'),
    ('restriccion','privado','ajustes','ajustes_tope_pendientes_alumno_check'),
    ('restriccion','privado','reloj_prueba','reloj_prueba_id_check'),
    ('restriccion','privado','reloj_prueba','reloj_prueba_pkey'),
    ('restriccion','privado','union_descartada','union_descartada_cuenta_id_fkey'),
    ('restriccion','privado','union_descartada','union_descartada_pkey'),
    ('restriccion','privado','union_descartada','union_descartada_sin_cuenta_id_fkey'),
    ('restriccion','public','alumno','alumno_como_llego_largo'),
    ('restriccion','public','alumno','alumno_estado_check'),
    ('restriccion','public','alumno','alumno_fecha_nacimiento_minima'),
    ('restriccion','public','alumno','alumno_motivo_estado_largo'),
    ('restriccion','public','alumno','alumno_nombre_largo'),
    ('restriccion','public','alumno','alumno_pkey'),
    ('restriccion','public','alumno','alumno_profesor_id_fkey'),
    ('restriccion','public','alumno','alumno_telefono_formato'),
    ('restriccion','public','alumno','alumno_user_id_fkey'),
    ('restriccion','public','alumno','alumno_user_id_key'),
    ('restriccion','public','bloqueo','bloqueo_motivo_check'),
    ('restriccion','public','bloqueo','bloqueo_periodo_valido'),
    ('restriccion','public','bloqueo','bloqueo_pkey'),
    ('restriccion','public','bloqueo','bloqueo_profesor_id_fkey'),
    ('restriccion','public','clase','clase_alumno_id_fkey'),
    ('restriccion','public','clase','clase_estado_check'),
    ('restriccion','public','clase','clase_movida_a_fkey'),
    ('restriccion','public','clase','clase_orden'),
    ('restriccion','public','clase','clase_persona_a_cargo_id_fkey'),
    ('restriccion','public','clase','clase_pkey'),
    ('restriccion','public','clase','clase_profesor_id_fkey'),
    ('restriccion','public','clase','clase_reserva_id_fkey'),
    ('restriccion','public','clase','clase_sin_solape'),
    ('restriccion','public','grilla_tramo','grilla_tramo_dia_semana_check'),
    ('restriccion','public','grilla_tramo','grilla_tramo_orden'),
    ('restriccion','public','grilla_tramo','grilla_tramo_pkey'),
    ('restriccion','public','grilla_tramo','grilla_tramo_profesor_id_fkey'),
    ('restriccion','public','grilla_tramo','grilla_tramo_sin_solape'),
    ('restriccion','public','mail_salida','mail_salida_alumno_id_fkey'),
    ('restriccion','public','mail_salida','mail_salida_estado_check'),
    ('restriccion','public','mail_salida','mail_salida_motivo_fallo_check'),
    ('restriccion','public','mail_salida','mail_salida_pkey'),
    ('restriccion','public','mail_salida','mail_salida_profesor_id_fkey'),
    ('restriccion','public','mail_salida','mail_salida_tipo_check'),
    ('restriccion','public','persona_a_cargo','persona_a_cargo_alumno_id_fkey'),
    ('restriccion','public','persona_a_cargo','persona_a_cargo_fecha_nacimiento_minima'),
    ('restriccion','public','persona_a_cargo','persona_a_cargo_nombre_largo'),
    ('restriccion','public','persona_a_cargo','persona_a_cargo_pkey'),
    ('restriccion','public','persona_a_cargo','persona_a_cargo_profesor_id_fkey'),
    ('restriccion','public','profesor','profesor_anticipacion_horas_check'),
    ('restriccion','public','profesor','profesor_duracion_min_check'),
    ('restriccion','public','profesor','profesor_horizonte_semanas_check'),
    ('restriccion','public','profesor','profesor_pkey'),
    ('restriccion','public','profesor','profesor_user_id_fkey'),
    ('restriccion','public','profesor','profesor_user_id_key'),
    ('restriccion','public','reserva','reserva_alumno_id_fkey'),
    ('restriccion','public','reserva','reserva_dia_semana_check'),
    ('restriccion','public','reserva','reserva_duracion_min_check'),
    ('restriccion','public','reserva','reserva_estado_check'),
    ('restriccion','public','reserva','reserva_frecuencia_semanas_check'),
    ('restriccion','public','reserva','reserva_hasta_orden'),
    ('restriccion','public','reserva','reserva_observacion_check'),
    ('restriccion','public','reserva','reserva_origen_check'),
    ('restriccion','public','reserva','reserva_persona_a_cargo_id_fkey'),
    ('restriccion','public','reserva','reserva_pkey'),
    ('restriccion','public','reserva','reserva_profesor_id_fkey'),
    ('restriccion','public','reserva','reserva_reserva_origen_id_fkey'),
    ('restriccion','public','reserva','reserva_serie_con_frecuencia'),
    ('restriccion','public','reserva','reserva_tipo_check'),
    ('tabla','privado','ajustes',''),
    ('tabla','privado','reloj_prueba',''),
    ('tabla','privado','union_descartada',''),
    ('tabla','public','alumno',''),
    ('tabla','public','bloqueo',''),
    ('tabla','public','clase',''),
    ('tabla','public','grilla_tramo',''),
    ('tabla','public','mail_salida',''),
    ('tabla','public','persona_a_cargo',''),
    ('tabla','public','profesor',''),
    ('tabla','public','reserva','');

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
    ('privado','agenda_publica','p_profesor uuid, p_dia date','p_profesor uuid, p_dia date','TABLE(inicio timestamp with time zone, fin timestamp with time zone, estado text)'),
    ('privado','al_completar_ficha','','','trigger'),
    ('privado','al_confirmar_usuario','','','trigger'),
    ('privado','al_ingresar_usuario','','','trigger'),
    ('privado','alta_alumno','p_nombre text, p_telefono text, p_fecha_nacimiento date, p_mail text','p_nombre text, p_telefono text, p_fecha_nacimiento date, p_mail text','jsonb'),
    ('privado','aprobar_cuenta','p_alumno_id uuid, p_motivo text','p_alumno_id uuid, p_motivo text','jsonb'),
    ('privado','barrer_mails','p_ahora timestamp with time zone','p_ahora timestamp with time zone DEFAULT app_ahora()','jsonb'),
    ('privado','completar_ficha','p_nombre text, p_telefono text, p_fecha_nacimiento date, p_como_llego text','p_nombre text, p_telefono text, p_fecha_nacimiento date, p_como_llego text','jsonb'),
    ('privado','configurar_profesor','p_mail citext, p_nombre text','p_mail citext, p_nombre text','void'),
    ('privado','descartar_union','p_cuenta_id uuid, p_sin_cuenta_id uuid','p_cuenta_id uuid, p_sin_cuenta_id uuid','jsonb'),
    ('privado','disparar_mail','p_ids uuid[]','p_ids uuid[]','bigint'),
    ('privado','editar_alumno','p_alumno_id uuid, p_nombre text, p_telefono text, p_fecha_nacimiento date, p_mail text','p_alumno_id uuid, p_nombre text, p_telefono text, p_fecha_nacimiento date, p_mail text','jsonb'),
    ('privado','encolar_mail','p_tipo text, p_alumno_id uuid, p_destinatario text, p_asunto text, p_cuerpo text','p_tipo text, p_alumno_id uuid, p_destinatario text, p_asunto text, p_cuerpo text','uuid'),
    ('privado','es_mail_simple','p text','p text','boolean'),
    ('privado','es_profesor','','','boolean'),
    ('privado','exigir_mail_libre','p_profesor uuid, p_mail text, p_excepto uuid','p_profesor uuid, p_mail text, p_excepto uuid','void'),
    ('privado','guardar_configuracion','p_duracion_min integer, p_anticipacion_horas integer, p_zona_horaria text','p_duracion_min integer, p_anticipacion_horas integer, p_zona_horaria text','jsonb'),
    ('privado','guardar_grilla','p_tramos jsonb','p_tramos jsonb','jsonb'),
    ('privado','guardar_persona_a_cargo','p_id uuid, p_nombre text, p_fecha_nacimiento date','p_id uuid, p_nombre text, p_fecha_nacimiento date','jsonb'),
    ('privado','huecos_del_dia','p_profesor uuid, p_dia date','p_profesor uuid, p_dia date','TABLE(inicio timestamp with time zone, fin timestamp with time zone)'),
    ('privado','mail_cuenta_nueva','p_alumno_id uuid','p_alumno_id uuid','uuid'),
    ('privado','mail_cuenta_respondida','p_alumno_id uuid, p_estado text, p_motivo text','p_alumno_id uuid, p_estado text, p_motivo text','uuid'),
    ('privado','mail_salida_disparar','','','trigger'),
    ('privado','mail_salida_tiempos','','','trigger'),
    ('privado','mi_alumno_id','','','uuid'),
    ('privado','rechazar_cuenta','p_alumno_id uuid, p_motivo text','p_alumno_id uuid, p_motivo text','jsonb'),
    ('privado','responder_cuenta','p_alumno_id uuid, p_estado text, p_motivo text','p_alumno_id uuid, p_estado text, p_motivo text','jsonb'),
    ('privado','sin_contrasena','','','trigger'),
    ('privado','sugerencias_de','p_cuenta_id uuid','p_cuenta_id uuid','jsonb'),
    ('privado','sugerencias_union','p_alumno_id uuid','p_alumno_id uuid','jsonb'),
    ('privado','unir_alumnos','p_cuenta_id uuid, p_sin_cuenta_id uuid','p_cuenta_id uuid, p_sin_cuenta_id uuid','jsonb'),
    ('privado','v_alumnos_solo_lectura','','','trigger'),
    ('privado','validar_fecha_nacimiento','p_valor date, p_campo text','p_valor date, p_campo text','date'),
    ('privado','validar_mail_alumno','p_valor text','p_valor text','text'),
    ('privado','validar_motivo','p_valor text','p_valor text','text'),
    ('privado','validar_nombre','p_valor text, p_campo text','p_valor text, p_campo text','text'),
    ('privado','validar_par_union','p_cuenta_id uuid, p_sin_cuenta_id uuid, p_para_unir boolean','p_cuenta_id uuid, p_sin_cuenta_id uuid, p_para_unir boolean','void'),
    ('privado','validar_telefono','p_valor text, p_campo text','p_valor text, p_campo text','text'),
    ('public','agenda_publica','p_dia date','p_dia date','TABLE(inicio timestamp with time zone, fin timestamp with time zone, estado text)'),
    ('public','alta_alumno','p_nombre text, p_telefono text, p_fecha_nacimiento date, p_mail text','p_nombre text, p_telefono text, p_fecha_nacimiento date, p_mail text DEFAULT NULL::text','jsonb'),
    ('public','app_ahora','','','timestamp with time zone'),
    ('public','aprobar_cuenta','p_alumno_id uuid, p_motivo text','p_alumno_id uuid, p_motivo text DEFAULT NULL::text','jsonb'),
    ('public','completar_ficha','p_nombre text, p_telefono text, p_fecha_nacimiento date, p_como_llego text','p_nombre text, p_telefono text, p_fecha_nacimiento date, p_como_llego text','jsonb'),
    ('public','config_publica','','','jsonb'),
    ('public','descartar_union','p_cuenta_id uuid, p_sin_cuenta_id uuid','p_cuenta_id uuid, p_sin_cuenta_id uuid','jsonb'),
    ('public','editar_alumno','p_alumno_id uuid, p_nombre text, p_telefono text, p_fecha_nacimiento date, p_mail text','p_alumno_id uuid, p_nombre text, p_telefono text, p_fecha_nacimiento date, p_mail text DEFAULT NULL::text','jsonb'),
    ('public','guardar_configuracion','p_duracion_min integer, p_anticipacion_horas integer, p_zona_horaria text','p_duracion_min integer, p_anticipacion_horas integer, p_zona_horaria text','jsonb'),
    ('public','guardar_grilla','p_tramos jsonb','p_tramos jsonb','jsonb'),
    ('public','guardar_persona_a_cargo','p_id uuid, p_nombre text, p_fecha_nacimiento date','p_id uuid, p_nombre text, p_fecha_nacimiento date','jsonb'),
    ('public','ping','','','timestamp with time zone'),
    ('public','rechazar_cuenta','p_alumno_id uuid, p_motivo text','p_alumno_id uuid, p_motivo text DEFAULT NULL::text','jsonb'),
    ('public','sesion_actual','','','jsonb'),
    ('public','sugerencias_union','p_alumno_id uuid','p_alumno_id uuid','jsonb'),
    ('public','unir_alumnos','p_cuenta_id uuid, p_sin_cuenta_id uuid','p_cuenta_id uuid, p_sin_cuenta_id uuid','jsonb');

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

CREATE OR REPLACE FUNCTION privado.agenda_publica(p_profesor uuid, p_dia date) RETURNS TABLE(inicio timestamp with time zone, fin timestamp with time zone, estado text)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with r as (
    select pg_catalog.tstzrange(p_dia::timestamp at time zone p.zona_horaria,
                                (p_dia + 1)::timestamp at time zone p.zona_horaria, '[)') as rango
      from public.profesor p
     where p.id = p_profesor
  ),
  h as (
    select h.inicio, h.fin, pg_catalog.tstzrange(h.inicio, h.fin, '[)') as periodo
      from privado.huecos_del_dia(p_profesor, p_dia) h
  ),
  c as (
    select c.inicio, c.fin, pg_catalog.tstzrange(c.inicio, c.fin, '[)') as periodo
      from public.clase c, r
     where c.profesor_id = p_profesor
       and pg_catalog.tstzrange(c.inicio, c.fin, '[)') && r.rango
       and c.estado in ('pendiente', 'confirmada')
  ),
  b as (
    select b.periodo
      from public.bloqueo b, r
     where b.profesor_id = p_profesor
       and b.periodo && r.rango
  )
  select x.inicio, x.fin, x.estado
    from (
      select h.inicio, h.fin,
             case
               when exists (select 1 from c where c.periodo && h.periodo) then 'ocupado'
               when exists (select 1 from b where b.periodo && h.periodo) then 'bloqueado'
               else 'libre'
             end
        from h
      union all
      select c.inicio, c.fin, 'ocupado'
        from c
       where not exists (select 1 from h where h.periodo && c.periodo)
    ) as x (inicio, fin, estado)
   order by x.inicio
$$;

CREATE OR REPLACE FUNCTION privado.al_completar_ficha() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform privado.mail_cuenta_nueva(new.id);
  return null;
end;
$$;

CREATE OR REPLACE FUNCTION privado.al_confirmar_usuario() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_profesor_id uuid;
  v_mail text;
  v_nombre text;
begin
  if new.email_confirmed_at is null or new.email is null or pg_catalog.btrim(new.email) = '' then
    return new;
  end if;
  if exists (select 1 from public.profesor p where p.user_id = new.id)
     or exists (select 1 from public.alumno a where a.user_id = new.id) then
    return new;
  end if;

  select p.id into v_profesor_id from public.profesor p limit 1;
  -- Mismo cerrojo que las RPC de escritura (ADR-002): no compite con un alta de alumno con el mismo mail.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profesor_id::text, 0));
  -- Con search_path vacío `=` entre citext resuelve al de text (distingue mayúsculas): se compara
  -- en minúsculas, como `privado.configurar_profesor` (B01).
  v_mail := pg_catalog.lower(new.email);

  -- Profesor: su mail lo fija `privado.configurar_profesor` (ADR-015).
  update public.profesor p
     set user_id = new.id
   where p.user_id is null
     and pg_catalog.lower(p.mail::text) = v_mail;
  if found then
    return new;
  end if;

  -- Alumno no borrado sin usuario con ese mail: dado de alta por el profesor (ALU-07) o cuyo usuario
  -- de Auth se borró (ADR-013). Se vincula conservando su estado. Una fila anonimizada no tiene mail.
  update public.alumno a
     set user_id = new.id
   where a.user_id is null
     and a.estado <> 'borrado'
     and pg_catalog.lower(a.mail::text) = v_mail;
  if found then
    return new;
  end if;

  -- Cuenta nueva (ALU-02): ficha incompleta con el nombre de Google si vino (recortado a SEC-09).
  v_nombre := nullif(
    pg_catalog.left(
      pg_catalog.btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')),
      100),
    '');
  insert into public.alumno (profesor_id, user_id, estado, nombre, mail)
  values (v_profesor_id, new.id, 'ficha_incompleta', v_nombre, new.email::extensions.citext)
  on conflict (profesor_id, mail) where mail is not null and estado <> 'borrado' do nothing;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION privado.al_ingresar_usuario() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  update public.alumno a
     set ultimo_ingreso = public.app_ahora()
   where a.user_id = new.id;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION privado.alta_alumno(p_nombre text, p_telefono text, p_fecha_nacimiento date, p_mail text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_profesor uuid;
  v_nombre text;
  v_telefono text;
  v_mail text;
  v_estado text;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'NO_AUTENTICADO';
  end if;
  if not privado.es_profesor() then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;

  select p.id into v_profesor from public.profesor p where p.user_id = auth.uid();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profesor::text, 0));

  v_nombre := privado.validar_nombre(p_nombre, 'p_nombre');
  v_telefono := privado.validar_telefono(p_telefono, 'p_telefono');
  perform privado.validar_fecha_nacimiento(p_fecha_nacimiento, 'p_fecha_nacimiento');
  v_mail := privado.validar_mail_alumno(p_mail);
  perform privado.exigir_mail_libre(v_profesor, v_mail, null);

  v_estado := case when v_mail is null then 'sin_cuenta' else 'aprobado' end;

  insert into public.alumno (profesor_id, estado, nombre, mail, telefono, fecha_nacimiento, aprobado_en)
  values (v_profesor, v_estado, v_nombre, v_mail::extensions.citext, v_telefono, p_fecha_nacimiento,
          case when v_estado = 'aprobado' then public.app_ahora() end)
  returning id into v_id;

  return pg_catalog.jsonb_build_object('alumno_id', v_id, 'estado', v_estado);
end;
$$;

CREATE OR REPLACE FUNCTION privado.aprobar_cuenta(p_alumno_id uuid, p_motivo text) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  select privado.responder_cuenta(p_alumno_id, 'aprobado', p_motivo)
$$;

CREATE OR REPLACE FUNCTION public.app_ahora() RETURNS timestamp with time zone
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(
    (select r.ahora
       from privado.reloj_prueba r
       cross join privado.ajustes a
      where a.permitir_reloj_prueba
      limit 1),
    pg_catalog.now()
  )
$$;

CREATE OR REPLACE FUNCTION privado.barrer_mails(p_ahora timestamp with time zone DEFAULT public.app_ahora()) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_sin_confirmacion integer;
  v_redisparados integer := 0;
  v_id uuid;
begin
  update public.mail_salida m
     set estado = 'fallido',
         motivo_fallo = 'SIN_CONFIRMACION'
   where m.estado = 'enviando'
     and coalesce(m.intentado_en, m.creado_en) < p_ahora - interval '10 minutes';
  get diagnostics v_sin_confirmacion = row_count;

  for v_id in
    select m.id
      from public.mail_salida m
     where m.estado = 'pendiente'
       and m.creado_en < p_ahora - interval '2 minutes'
     order by m.creado_en
     limit 50
  loop
    if privado.disparar_mail(array[v_id]) is not null then
      v_redisparados := v_redisparados + 1;
    end if;
  end loop;

  return pg_catalog.jsonb_build_object('sin_confirmacion', v_sin_confirmacion, 'redisparados', v_redisparados);
end;
$$;

CREATE OR REPLACE FUNCTION privado.completar_ficha(p_nombre text, p_telefono text, p_fecha_nacimiento date, p_como_llego text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
declare
  v_ahora timestamptz := public.app_ahora();
  v_alumno_id uuid;
  v_profesor_id uuid;
  v_estado text;
  v_nombre text;
  v_telefono text := pg_catalog.btrim(p_telefono);
  v_como_llego text := pg_catalog.btrim(p_como_llego);
  v_tope integer;
  v_recientes integer;
begin
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'NO_AUTENTICADO';
  end if;
  v_alumno_id := privado.mi_alumno_id();
  if v_alumno_id is null or privado.es_profesor() then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;

  select a.profesor_id into v_profesor_id from public.alumno a where a.id = v_alumno_id;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profesor_id::text, 0));
  select a.estado into v_estado from public.alumno a where a.id = v_alumno_id for update;

  if v_estado in ('borrado', 'sin_cuenta') then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;
  if v_estado <> 'ficha_incompleta' then
    raise exception using errcode = 'PT409', message = 'FICHA_YA_COMPLETA';
  end if;

  v_nombre := privado.validar_nombre(p_nombre, 'p_nombre');
  if v_telefono is null
     or pg_catalog.char_length(v_telefono) > 20
     or v_telefono !~ '^\+?[0-9 ().-]+$'
     or pg_catalog.char_length(pg_catalog.regexp_replace(v_telefono, '[^0-9]', '', 'g')) not between 6 and 15 then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_telefono"}';
  end if;
  perform privado.validar_fecha_nacimiento(p_fecha_nacimiento, 'p_fecha_nacimiento');
  if v_como_llego is null or v_como_llego = '' or pg_catalog.char_length(v_como_llego) > 200 then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_como_llego"}';
  end if;

  select a.tope_fichas_hora into v_tope from privado.ajustes a;
  if v_tope is not null then
    select count(*) into v_recientes
      from public.alumno a
     where a.profesor_id = v_profesor_id
       and a.ficha_completada_en > v_ahora - interval '60 minutes'
       and a.ficha_completada_en <= v_ahora;
    if v_recientes >= v_tope then
      raise exception using errcode = 'PT429', message = 'LIMITE_EXCEDIDO',
        detail = pg_catalog.jsonb_build_object('tope', 'fichas', 'limite', v_tope)::text;
    end if;
  end if;

  update public.alumno a
     set nombre = v_nombre,
         telefono = v_telefono,
         fecha_nacimiento = p_fecha_nacimiento,
         como_llego = v_como_llego,
         estado = 'pendiente',
         ficha_completada_en = v_ahora
   where a.id = v_alumno_id;

  return pg_catalog.jsonb_build_object('estado', 'pendiente');
end;
$_$;

CREATE OR REPLACE FUNCTION privado.configurar_profesor(p_mail extensions.citext, p_nombre text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_profesor_id uuid;
  v_user_actual uuid;
  v_user uuid;
begin
  if p_mail is null or p_mail::text !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_mail"}';
  end if;
  if p_nombre is null or pg_catalog.btrim(p_nombre) = '' then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_nombre"}';
  end if;

  select p.id, p.user_id into v_profesor_id, v_user_actual
    from public.profesor p
   for update;

  -- Mismo cerrojo que las RPC de escritura (ADR-002).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profesor_id::text, 0));

  -- Solo un usuario con el mail confirmado se vincula (SEC-14). `auth.users.email` es texto:
  -- se compara sin distinguir mayúsculas como lo haría citext.
  select u.id into v_user
    from auth.users u
   where pg_catalog.lower(u.email) = pg_catalog.lower(p_mail::text)
     and u.email_confirmed_at is not null
   order by u.created_at
   limit 1;

  if v_user_actual is not null and v_user_actual is distinct from v_user then
    raise exception using errcode = 'PT409', message = 'PROFESOR_YA_VINCULADO';
  end if;

  update public.profesor p
     set mail = p_mail,
         nombre = pg_catalog.btrim(p_nombre),
         user_id = coalesce(v_user, p.user_id)
   where p.id = v_profesor_id;

  -- El trigger de ingreso (B04) pudo haberle creado una ficha de alumno vacía.
  if v_user is not null then
    delete from public.alumno a
     where a.user_id = v_user
       and a.estado = 'ficha_incompleta';
  end if;
end;
$_$;

CREATE OR REPLACE FUNCTION privado.descartar_union(p_cuenta_id uuid, p_sin_cuenta_id uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  perform privado.validar_par_union(p_cuenta_id, p_sin_cuenta_id, false);

  insert into privado.union_descartada (cuenta_id, sin_cuenta_id)
  values (p_cuenta_id, p_sin_cuenta_id)
  on conflict do nothing;

  return pg_catalog.jsonb_build_object('cuenta_id', p_cuenta_id);
end;
$$;

CREATE OR REPLACE FUNCTION privado.disparar_mail(p_ids uuid[]) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_url text;
  v_secreto text;
begin
  if p_ids is null or pg_catalog.cardinality(p_ids) = 0 then
    return null;
  end if;

  select ds.decrypted_secret into v_url
    from vault.decrypted_secrets ds where ds.name = 'url_funcion_mail';
  select ds.decrypted_secret into v_secreto
    from vault.decrypted_secrets ds where ds.name = 'mail_secreto';
  if v_url is null or v_secreto is null then
    raise warning 'enviar-mail: falta url_funcion_mail o mail_secreto en Vault; el mail queda pendiente';
    return null;
  end if;

  -- 20 s: mayor que el tope de 15 s por mail de la función (H-017).
  return net.http_post(
    url := v_url,
    body := pg_catalog.jsonb_build_object('ids', pg_catalog.to_jsonb(p_ids)),
    headers := pg_catalog.jsonb_build_object('Content-Type', 'application/json', 'x-mail-secreto', v_secreto),
    timeout_milliseconds := 20000
  );
end;
$$;

CREATE OR REPLACE FUNCTION privado.editar_alumno(p_alumno_id uuid, p_nombre text, p_telefono text, p_fecha_nacimiento date, p_mail text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_profesor uuid;
  v_alumno public.alumno%rowtype;
  v_nombre text;
  v_telefono text;
  v_mail text;
  v_estado text;
begin
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'NO_AUTENTICADO';
  end if;
  if not privado.es_profesor() then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;

  select p.id into v_profesor from public.profesor p where p.user_id = auth.uid();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profesor::text, 0));

  select * into v_alumno from public.alumno a
   where a.id = p_alumno_id and a.profesor_id = v_profesor
     and a.estado in ('pendiente', 'aprobado', 'rechazado', 'sin_cuenta')
     for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
  end if;

  v_nombre := privado.validar_nombre(p_nombre, 'p_nombre');
  v_telefono := privado.validar_telefono(p_telefono, 'p_telefono');
  perform privado.validar_fecha_nacimiento(p_fecha_nacimiento, 'p_fecha_nacimiento');
  v_mail := privado.validar_mail_alumno(p_mail);
  v_estado := v_alumno.estado;

  if pg_catalog.lower(coalesce(v_mail, '')) <> pg_catalog.lower(coalesce(v_alumno.mail::text, '')) then
    if v_alumno.user_id is not null or v_alumno.estado not in ('sin_cuenta', 'aprobado') then
      raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_mail"}';
    end if;
    perform privado.exigir_mail_libre(v_profesor, v_mail, p_alumno_id);
    v_estado := case when v_mail is null then 'sin_cuenta' else 'aprobado' end;
  else
    v_mail := v_alumno.mail::text;
  end if;

  update public.alumno a
     set nombre = v_nombre,
         telefono = v_telefono,
         fecha_nacimiento = p_fecha_nacimiento,
         mail = v_mail::extensions.citext,
         estado = v_estado,
         aprobado_en = case when v_estado = 'aprobado' and a.estado = 'sin_cuenta' then public.app_ahora()
                            else a.aprobado_en end
   where a.id = p_alumno_id;

  return pg_catalog.jsonb_build_object('alumno_id', p_alumno_id);
end;
$$;

CREATE OR REPLACE FUNCTION privado.encolar_mail(p_tipo text, p_alumno_id uuid, p_destinatario text, p_asunto text, p_cuerpo text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  -- SEC-11, H-012: controles C0, DEL, C1 y separadores de línea Unicode.
  c_control constant text := '[[:cntrl:]\u0080-\u009f  ]+';
  v_tipo text := pg_catalog.btrim(coalesce(p_tipo, ''));
  v_asunto text;
  v_destinatario text;
  v_invalido boolean;
  v_profesor_id uuid;
  v_ahora timestamptz;
  v_tope_hora integer;
  v_tope_dia integer;
  v_en_hora integer;
  v_en_dia integer;
  v_sobre_tope boolean;
  v_id uuid;
begin
  if v_tipo not in ('cuenta_nueva', 'solicitud_nueva', 'cuenta_respondida', 'solicitud_respondida',
                    'clase_creada', 'clase_movida', 'clase_cancelada', 'recordatorio', 'aviso_inactividad') then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"tipo"}';
  end if;

  v_asunto := pg_catalog.left(
    pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(p_asunto, ''), c_control, ' ', 'g')), 200);
  if v_asunto = '' then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"asunto"}';
  end if;
  if p_cuerpo is null then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"cuerpo"}';
  end if;

  if p_alumno_id is not null then
    select a.profesor_id,
           case when a.estado not in ('sin_cuenta', 'borrado') then a.mail::text end
      into v_profesor_id, v_destinatario
      from public.alumno a
     where a.id = p_alumno_id;
    if not found then
      raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
    end if;
  else
    select p.id into v_profesor_id from public.profesor p limit 1;
  end if;

  if p_destinatario is not null then
    v_destinatario := p_destinatario;
  elsif p_alumno_id is null then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"destinatario"}';
  end if;

  -- AVI-04: alumno sin cuenta, borrado o sin mail: no hay a quién escribir.
  if v_destinatario is null then
    return null;
  end if;

  -- H-141 (NFR-07): un destinatario inválido no revierte la operación; queda registrado y no se envía.
  v_destinatario := pg_catalog.btrim(pg_catalog.regexp_replace(v_destinatario, c_control, '', 'g'));
  v_invalido := not privado.es_mail_simple(v_destinatario);
  if v_invalido then
    v_destinatario := pg_catalog.left(v_destinatario, 254);
  end if;

  -- Mismo cerrojo que las RPC de escritura (ADR-002); reentrante dentro de ellas. Serializa la cuenta
  -- del tope entre RPC y jobs (ADR-016).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profesor_id::text, 0));

  -- AVI-08 (ADR-016): ventanas móviles de 60 min y 24 h con `app_ahora()`; las filas `TOPE` y
  -- `DESTINATARIO_INVALIDO` no cuentan.
  v_ahora := public.app_ahora();
  select a.tope_mails_hora, a.tope_mails_dia into v_tope_hora, v_tope_dia from privado.ajustes a;

  select pg_catalog.count(*) filter (where m.creado_en > v_ahora - interval '60 minutes'),
         pg_catalog.count(*)
    into v_en_hora, v_en_dia
    from public.mail_salida m
   where m.profesor_id = v_profesor_id
     and m.creado_en > v_ahora - interval '24 hours'
     and m.creado_en <= v_ahora
     and not (m.estado = 'fallido' and coalesce(m.motivo_fallo, '') in ('TOPE', 'DESTINATARIO_INVALIDO'));

  v_sobre_tope := not v_invalido
              and ((v_tope_hora is not null and v_en_hora >= v_tope_hora)
                or (v_tope_dia is not null and v_en_dia >= v_tope_dia));

  -- Inválido o sobre el tope, la fila nace `fallido`: el trigger de disparo no la ve y la operación
  -- sigue (NFR-07).
  insert into public.mail_salida (profesor_id, alumno_id, tipo, destinatario, asunto, cuerpo_texto,
                                  estado, motivo_fallo, creado_en)
  values (v_profesor_id, p_alumno_id, v_tipo, v_destinatario, v_asunto, p_cuerpo,
          case when v_invalido or v_sobre_tope then 'fallido' else 'pendiente' end,
          case when v_invalido then 'DESTINATARIO_INVALIDO' when v_sobre_tope then 'TOPE' end,
          v_ahora)
  returning id into v_id;

  return v_id;
end;
$$;

CREATE OR REPLACE FUNCTION privado.es_mail_simple(p text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $_$
  select p is not null and pg_catalog.char_length(p) <= 254
     and p ~ '^[^@[:space:],;<>]+@[^@[:space:],;<>]+\.[^@[:space:],;<>]+$'
$_$;

CREATE OR REPLACE FUNCTION privado.es_profesor() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1
      from public.profesor p
      join auth.users u on u.id = p.user_id
     where p.user_id = auth.uid()
       and u.email_confirmed_at is not null
  )
$$;

CREATE OR REPLACE FUNCTION privado.exigir_mail_libre(p_profesor uuid, p_mail text, p_excepto uuid) RETURNS void
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
declare
  v_existente uuid;
begin
  if p_mail is null then
    return;
  end if;
  select a.id into v_existente
    from public.alumno a
   where a.profesor_id = p_profesor
     and a.estado <> 'borrado'
     and a.id is distinct from p_excepto
     and pg_catalog.lower(a.mail::text) = pg_catalog.lower(p_mail)
   limit 1;
  if found or exists (
       select 1 from public.profesor p
        where p.id = p_profesor and pg_catalog.lower(p.mail::text) = pg_catalog.lower(p_mail)) then
    raise exception using errcode = 'PT409', message = 'MAIL_YA_REGISTRADO',
      detail = pg_catalog.jsonb_build_object('alumno_id', v_existente)::text;
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION privado.guardar_configuracion(p_duracion_min integer, p_anticipacion_horas integer, p_zona_horaria text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_profesor uuid;
begin
  -- SEC-06: rol al inicio.
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'NO_AUTENTICADO';
  end if;
  if not privado.es_profesor() then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;

  if p_duracion_min is null or p_duracion_min < 1 or p_duracion_min > 1440 then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_duracion_min"}';
  end if;
  if p_anticipacion_horas is null or p_anticipacion_horas < 0 then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_anticipacion_horas"}';
  end if;
  -- ADR-004: nombre IANA validado contra pg_timezone_names.
  if p_zona_horaria is null
     or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_zona_horaria) then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_zona_horaria"}';
  end if;

  select p.id into v_profesor from public.profesor p where p.user_id = auth.uid();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profesor::text, 0));

  update public.profesor p
     set duracion_min = p_duracion_min,
         anticipacion_horas = p_anticipacion_horas,
         zona_horaria = p_zona_horaria
   where p.id = v_profesor;

  return (
    select pg_catalog.jsonb_build_object(
             'zona_horaria', p.zona_horaria,
             'duracion_min', p.duracion_min,
             'anticipacion_horas', p.anticipacion_horas,
             'horizonte_semanas', p.horizonte_semanas
           )
      from public.profesor p
     where p.id = v_profesor
  );
end;
$$;

CREATE OR REPLACE FUNCTION privado.guardar_grilla(p_tramos jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
declare
  v_profesor uuid;
  v_tramo jsonb;
begin
  -- SEC-06: rol al inicio.
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'NO_AUTENTICADO';
  end if;
  if not privado.es_profesor() then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;

  if p_tramos is null
     or pg_catalog.jsonb_typeof(p_tramos) <> 'array'
     or pg_catalog.jsonb_array_length(p_tramos) > 50 then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_tramos"}';
  end if;

  for v_tramo in select e.value from pg_catalog.jsonb_array_elements(p_tramos) e loop
    if pg_catalog.jsonb_typeof(v_tramo) <> 'object'
       or pg_catalog.jsonb_typeof(v_tramo -> 'dia_semana') is distinct from 'number'
       or (v_tramo ->> 'dia_semana') !~ '^[1-7]$'
       or pg_catalog.jsonb_typeof(v_tramo -> 'desde') is distinct from 'string'
       or (v_tramo ->> 'desde') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or pg_catalog.jsonb_typeof(v_tramo -> 'hasta') is distinct from 'string'
       or (v_tramo ->> 'hasta') !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$'
       or (v_tramo ->> 'hasta')::time <= (v_tramo ->> 'desde')::time then
      raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_tramos"}';
    end if;
  end loop;

  -- Solape entre tramos del mismo día (se pueden tocar en el borde).
  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(p_tramos) with ordinality as a (t, i)
      join pg_catalog.jsonb_array_elements(p_tramos) with ordinality as b (t, j)
        on a.i < b.j
       and (a.t ->> 'dia_semana') = (b.t ->> 'dia_semana')
       and (a.t ->> 'desde')::time < (b.t ->> 'hasta')::time
       and (b.t ->> 'desde')::time < (a.t ->> 'hasta')::time
  ) then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_tramos"}';
  end if;

  select p.id into v_profesor from public.profesor p where p.user_id = auth.uid();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profesor::text, 0));

  delete from public.grilla_tramo g where g.profesor_id = v_profesor;

  insert into public.grilla_tramo (profesor_id, dia_semana, desde, hasta)
  select v_profesor, (e.value ->> 'dia_semana')::smallint, (e.value ->> 'desde')::time, (e.value ->> 'hasta')::time
    from pg_catalog.jsonb_array_elements(p_tramos) e;

  return (
    select coalesce(
             pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object(
                 'dia_semana', g.dia_semana,
                 'desde', pg_catalog.to_char(g.desde, 'HH24:MI'),
                 'hasta', pg_catalog.to_char(g.hasta, 'HH24:MI')
               )
               order by g.dia_semana, g.desde
             ),
             '[]'::jsonb
           )
      from public.grilla_tramo g
     where g.profesor_id = v_profesor
  );
end;
$_$;

CREATE OR REPLACE FUNCTION privado.guardar_persona_a_cargo(p_id uuid, p_nombre text, p_fecha_nacimiento date) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_alumno_id uuid;
  v_profesor_id uuid;
  v_estado text;
  v_nombre text;
  v_duenio uuid;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'NO_AUTENTICADO';
  end if;
  v_alumno_id := privado.mi_alumno_id();
  if v_alumno_id is null or privado.es_profesor() then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;

  select a.profesor_id, a.estado into v_profesor_id, v_estado from public.alumno a where a.id = v_alumno_id;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profesor_id::text, 0));

  if v_estado in ('borrado', 'sin_cuenta') then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;
  if v_estado = 'ficha_incompleta' then
    raise exception using errcode = 'PT403', message = 'FICHA_INCOMPLETA';
  end if;

  if p_id is not null then
    select pc.alumno_id into v_duenio from public.persona_a_cargo pc where pc.id = p_id for update;
    if not found then
      raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
    end if;
    if v_duenio <> v_alumno_id then
      raise exception using errcode = 'PT403', message = 'PROHIBIDO';
    end if;
  end if;

  v_nombre := privado.validar_nombre(p_nombre, 'p_nombre');
  perform privado.validar_fecha_nacimiento(p_fecha_nacimiento, 'p_fecha_nacimiento');

  if p_id is null then
    insert into public.persona_a_cargo (profesor_id, alumno_id, nombre, fecha_nacimiento)
    values (v_profesor_id, v_alumno_id, v_nombre, p_fecha_nacimiento)
    returning id into v_id;
  else
    update public.persona_a_cargo pc
       set nombre = v_nombre,
           fecha_nacimiento = p_fecha_nacimiento
     where pc.id = p_id
    returning pc.id into v_id;
  end if;

  return pg_catalog.jsonb_build_object('id', v_id);
end;
$$;

CREATE OR REPLACE FUNCTION privado.huecos_del_dia(p_profesor uuid, p_dia date) RETURNS TABLE(inicio timestamp with time zone, fin timestamp with time zone)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select (p_dia + t.desde + pg_catalog.make_interval(mins => p.duracion_min * n.i)) at time zone p.zona_horaria,
         (p_dia + t.desde + pg_catalog.make_interval(mins => p.duracion_min * (n.i + 1))) at time zone p.zona_horaria
    from public.profesor p
    join public.grilla_tramo t
      on t.profesor_id = p.id
     and t.dia_semana = extract(isodow from p_dia)
   cross join lateral pg_catalog.generate_series(
           0,
           (extract(epoch from (t.hasta - t.desde))::integer / 60) / p.duracion_min - 1
         ) as n (i)
   where p.id = p_profesor
   order by 1
$$;

CREATE OR REPLACE FUNCTION privado.mail_cuenta_nueva(p_alumno_id uuid) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_destinatario text;
  v_nombre text;
begin
  select p.mail::text, a.nombre
    into v_destinatario, v_nombre
    from public.alumno a
    join public.profesor p on p.id = a.profesor_id
   where a.id = p_alumno_id;
  if v_destinatario is null then
    return null;
  end if;

  return privado.encolar_mail(
    'cuenta_nueva',
    p_alumno_id,
    v_destinatario,
    'Cuenta nueva pendiente de aprobación: ' || coalesce(v_nombre, ''),
    'Hay una cuenta nueva pendiente de aprobación.' || E'\n\n'
      || 'Nombre: ' || coalesce(v_nombre, '') || E'\n\n'
      || 'Entrá a la lista de alumnos para ver su ficha y aprobarla o rechazarla.' || E'\n');
end;
$$;

CREATE OR REPLACE FUNCTION privado.mail_cuenta_respondida(p_alumno_id uuid, p_estado text, p_motivo text) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_nombre text;
  v_aprobada boolean := p_estado = 'aprobado';
begin
  select a.nombre into v_nombre from public.alumno a where a.id = p_alumno_id;

  return privado.encolar_mail(
    'cuenta_respondida',
    p_alumno_id,
    null,
    case when v_aprobada then 'Tu cuenta fue aprobada' else 'Tu cuenta fue rechazada' end,
    'Hola' || coalesce(' ' || v_nombre, '') || ',' || E'\n\n'
      || case when v_aprobada
              then 'El profesor aprobó tu cuenta. Ya podés pedir clases desde la agenda.'
              else 'El profesor rechazó tu cuenta, así que por ahora no podés pedir clases.' end
      || case when p_motivo is null then ''
              when v_aprobada then E'\n\n' || 'Mensaje del profesor: ' || p_motivo
              else E'\n\n' || 'Motivo: ' || p_motivo end
      || E'\n');
end;
$$;

CREATE OR REPLACE FUNCTION privado.mail_salida_disparar() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform privado.disparar_mail(array[new.id]);
  return null;
end;
$$;

CREATE OR REPLACE FUNCTION privado.mail_salida_tiempos() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  new.motivo_fallo := pg_catalog.left(new.motivo_fallo, 500);
  if tg_op = 'UPDATE' then
    if new.estado = 'enviando' and old.estado = 'pendiente' then
      new.intentado_en := public.app_ahora();
    end if;
    if new.estado = 'enviado' and old.estado is distinct from 'enviado' then
      new.enviado_en := public.app_ahora();
    end if;
  end if;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION privado.mi_alumno_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select a.id
    from public.alumno a
    join auth.users u on u.id = a.user_id
   where a.user_id = auth.uid()
     and u.email_confirmed_at is not null
$$;

CREATE OR REPLACE FUNCTION privado.rechazar_cuenta(p_alumno_id uuid, p_motivo text) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  select privado.responder_cuenta(p_alumno_id, 'rechazado', p_motivo)
$$;

CREATE OR REPLACE FUNCTION privado.responder_cuenta(p_alumno_id uuid, p_estado text, p_motivo text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_profesor uuid;
  v_estado text;
  v_motivo text;
begin
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'NO_AUTENTICADO';
  end if;
  if not privado.es_profesor() then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;

  select p.id into v_profesor from public.profesor p where p.user_id = auth.uid();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profesor::text, 0));

  select a.estado into v_estado
    from public.alumno a
   where a.id = p_alumno_id and a.profesor_id = v_profesor
     for update;
  if not found or v_estado = 'borrado' then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
  end if;
  if not (v_estado = 'pendiente' or (p_estado = 'aprobado' and v_estado = 'rechazado')) then
    raise exception using errcode = 'PT409', message = 'CUENTA_NO_PENDIENTE',
      detail = pg_catalog.jsonb_build_object('estado', v_estado)::text;
  end if;

  v_motivo := privado.validar_motivo(p_motivo);

  update public.alumno a
     set estado = p_estado,
         motivo_estado = v_motivo,
         aprobado_en = case when p_estado = 'aprobado' then public.app_ahora() else a.aprobado_en end
   where a.id = p_alumno_id;

  perform privado.mail_cuenta_respondida(p_alumno_id, p_estado, v_motivo);

  return pg_catalog.jsonb_build_object(
    'estado', p_estado,
    'sugerencias', case when p_estado = 'aprobado' then privado.sugerencias_de(p_alumno_id) else '[]'::jsonb end);
end;
$$;

CREATE OR REPLACE FUNCTION privado.sin_contrasena() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  new.encrypted_password := '';
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION privado.sugerencias_de(p_cuenta_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select coalesce(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object('sin_cuenta_id', s.id, 'nombre', s.nombre, 'telefono', s.telefono)
             order by s.nombre, s.id),
           '[]'::jsonb)
    from public.alumno c
    join public.alumno s
      on s.profesor_id = c.profesor_id
     and s.telefono_clave = c.telefono_clave
     and s.estado = 'sin_cuenta'
     and s.id <> c.id
   where c.id = p_cuenta_id
     and c.estado not in ('sin_cuenta', 'borrado')
     and not exists (
           select 1 from privado.union_descartada d
            where d.cuenta_id = c.id and d.sin_cuenta_id = s.id)
$$;

CREATE OR REPLACE FUNCTION privado.sugerencias_union(p_alumno_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
begin
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'NO_AUTENTICADO';
  end if;
  if not privado.es_profesor() then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;
  if not exists (
       select 1
         from public.alumno a
         join public.profesor p on p.id = a.profesor_id
        where a.id = p_alumno_id and p.user_id = auth.uid() and a.estado <> 'borrado') then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
  end if;
  return privado.sugerencias_de(p_alumno_id);
end;
$$;

CREATE OR REPLACE FUNCTION privado.unir_alumnos(p_cuenta_id uuid, p_sin_cuenta_id uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
declare
  v_fk record;
begin
  perform privado.validar_par_union(p_cuenta_id, p_sin_cuenta_id, true);

  for v_fk in
    select n.nspname as esquema, c.relname as tabla, att.attname as columna
      from pg_catalog.pg_constraint k
      join pg_catalog.pg_class c on c.oid = k.conrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      join pg_catalog.pg_attribute att on att.attrelid = k.conrelid and att.attnum = k.conkey[1]
     where k.contype = 'f'
       and k.confrelid = 'public.alumno'::pg_catalog.regclass
       and pg_catalog.array_length(k.conkey, 1) = 1
       and k.conrelid <> 'privado.union_descartada'::pg_catalog.regclass
     order by 1, 2, 3
  loop
    execute pg_catalog.format('update %I.%I set %I = $1 where %I = $2',
                              v_fk.esquema, v_fk.tabla, v_fk.columna, v_fk.columna)
      using p_cuenta_id, p_sin_cuenta_id;
  end loop;

  -- Las uniones descartadas del sin cuenta se van con él (on delete cascade).
  delete from public.alumno a where a.id = p_sin_cuenta_id;

  return pg_catalog.jsonb_build_object('cuenta_id', p_cuenta_id);
end;
$_$;

CREATE OR REPLACE FUNCTION privado.v_alumnos_solo_lectura() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  raise exception using errcode = '42501', message = 'PROHIBIDO';
end;
$$;

CREATE OR REPLACE FUNCTION privado.validar_fecha_nacimiento(p_valor date, p_campo text) RETURNS date
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
declare
  v_hoy date;
begin
  select (public.app_ahora() at time zone p.zona_horaria)::date into v_hoy from public.profesor p limit 1;
  if p_valor is null or p_valor < date '1900-01-01' or p_valor > v_hoy then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS',
      detail = pg_catalog.jsonb_build_object('campo', p_campo)::text;
  end if;
  return p_valor;
end;
$$;

CREATE OR REPLACE FUNCTION privado.validar_mail_alumno(p_valor text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
declare
  v text := nullif(pg_catalog.btrim(p_valor), '');
begin
  if v is not null and not privado.es_mail_simple(v) then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_mail"}';
  end if;
  return v;
end;
$$;

CREATE OR REPLACE FUNCTION privado.validar_motivo(p_valor text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
declare
  v text := nullif(pg_catalog.btrim(p_valor), '');
begin
  if pg_catalog.char_length(v) > 500 then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"motivo"}';
  end if;
  return v;
end;
$$;

CREATE OR REPLACE FUNCTION privado.validar_nombre(p_valor text, p_campo text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
declare
  v text := pg_catalog.btrim(p_valor);
begin
  if v is null or v = '' or pg_catalog.char_length(v) > 100 then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS',
      detail = pg_catalog.jsonb_build_object('campo', p_campo)::text;
  end if;
  return v;
end;
$$;

CREATE OR REPLACE FUNCTION privado.validar_par_union(p_cuenta_id uuid, p_sin_cuenta_id uuid, p_para_unir boolean) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_profesor uuid;
  v_cuenta public.alumno%rowtype;
  v_sin_cuenta public.alumno%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'NO_AUTENTICADO';
  end if;
  if not privado.es_profesor() then
    raise exception using errcode = 'PT403', message = 'PROHIBIDO';
  end if;

  select p.id into v_profesor from public.profesor p where p.user_id = auth.uid();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profesor::text, 0));

  select * into v_cuenta from public.alumno a
   where a.id = p_cuenta_id and a.profesor_id = v_profesor and a.estado <> 'borrado'
     for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
  end if;
  select * into v_sin_cuenta from public.alumno a
   where a.id = p_sin_cuenta_id and a.profesor_id = v_profesor and a.estado <> 'borrado'
     for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'NO_ENCONTRADO';
  end if;

  if v_sin_cuenta.estado <> 'sin_cuenta'
     or v_cuenta.id = v_sin_cuenta.id
     or (p_para_unir and v_cuenta.estado <> 'aprobado')
     or (not p_para_unir and v_cuenta.estado not in ('pendiente', 'aprobado', 'rechazado'))
     or v_cuenta.telefono_clave is null
     or v_cuenta.telefono_clave <> v_sin_cuenta.telefono_clave then
    raise exception using errcode = 'PT409', message = 'UNION_NO_VALIDA';
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION privado.validar_telefono(p_valor text, p_campo text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $_$
declare
  v text := pg_catalog.btrim(p_valor);
begin
  if v is null
     or pg_catalog.char_length(v) > 20
     or v !~ '^\+?[0-9 ().-]+$'
     or pg_catalog.char_length(pg_catalog.regexp_replace(v, '[^0-9]', '', 'g')) not between 6 and 15 then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS',
      detail = pg_catalog.jsonb_build_object('campo', p_campo)::text;
  end if;
  return v;
end;
$_$;

CREATE OR REPLACE FUNCTION public.agenda_publica(p_dia date) RETURNS TABLE(inicio timestamp with time zone, fin timestamp with time zone, estado text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_profesor uuid;
  v_zona text;
  v_horizonte integer;
  v_hoy date;
begin
  select p.id, p.zona_horaria, p.horizonte_semanas
    into v_profesor, v_zona, v_horizonte
    from public.profesor p
   limit 1;

  v_hoy := (public.app_ahora() at time zone v_zona)::date;

  if p_dia is null or p_dia < v_hoy - 366 or p_dia > v_hoy + v_horizonte * 7 + 31 then
    raise exception using errcode = 'PT422', message = 'DATOS_INVALIDOS', detail = '{"campo":"p_dia"}';
  end if;

  return query
    select a.inicio, a.fin, a.estado
      from privado.agenda_publica(v_profesor, p_dia) a;
end;
$$;

CREATE OR REPLACE FUNCTION public.alta_alumno(p_nombre text, p_telefono text, p_fecha_nacimiento date, p_mail text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select privado.alta_alumno(p_nombre, p_telefono, p_fecha_nacimiento, p_mail)
$$;

CREATE OR REPLACE FUNCTION public.aprobar_cuenta(p_alumno_id uuid, p_motivo text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select privado.aprobar_cuenta(p_alumno_id, p_motivo)
$$;

CREATE OR REPLACE FUNCTION public.completar_ficha(p_nombre text, p_telefono text, p_fecha_nacimiento date, p_como_llego text) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select privado.completar_ficha(p_nombre, p_telefono, p_fecha_nacimiento, p_como_llego)
$$;

CREATE OR REPLACE FUNCTION public.config_publica() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select pg_catalog.jsonb_build_object(
           'zona_horaria', p.zona_horaria,
           'duracion_min', p.duracion_min,
           'anticipacion_horas', p.anticipacion_horas,
           'horizonte_semanas', p.horizonte_semanas
         )
    from public.profesor p
   limit 1
$$;

CREATE OR REPLACE FUNCTION public.descartar_union(p_cuenta_id uuid, p_sin_cuenta_id uuid) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select privado.descartar_union(p_cuenta_id, p_sin_cuenta_id)
$$;

CREATE OR REPLACE FUNCTION public.editar_alumno(p_alumno_id uuid, p_nombre text, p_telefono text, p_fecha_nacimiento date, p_mail text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select privado.editar_alumno(p_alumno_id, p_nombre, p_telefono, p_fecha_nacimiento, p_mail)
$$;

CREATE OR REPLACE FUNCTION public.guardar_configuracion(p_duracion_min integer, p_anticipacion_horas integer, p_zona_horaria text) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select privado.guardar_configuracion(p_duracion_min, p_anticipacion_horas, p_zona_horaria)
$$;

CREATE OR REPLACE FUNCTION public.guardar_grilla(p_tramos jsonb) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select privado.guardar_grilla(p_tramos)
$$;

CREATE OR REPLACE FUNCTION public.guardar_persona_a_cargo(p_id uuid, p_nombre text, p_fecha_nacimiento date) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select privado.guardar_persona_a_cargo(p_id, p_nombre, p_fecha_nacimiento)
$$;

CREATE OR REPLACE FUNCTION public.ping() RETURNS timestamp with time zone
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select public.app_ahora()
$$;

CREATE OR REPLACE FUNCTION public.rechazar_cuenta(p_alumno_id uuid, p_motivo text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select privado.rechazar_cuenta(p_alumno_id, p_motivo)
$$;

CREATE OR REPLACE FUNCTION public.sesion_actual() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_resultado jsonb;
  v_alumno_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'NO_AUTENTICADO';
  end if;

  if privado.es_profesor() then
    select pg_catalog.jsonb_build_object(
             'rol', 'profesor', 'alumno_id', null, 'estado', null,
             'nombre', p.nombre, 'mail', p.mail, 'motivo_rechazo', null)
      into v_resultado
      from public.profesor p
     where p.user_id = auth.uid();
    return v_resultado;
  end if;

  v_alumno_id := privado.mi_alumno_id();
  if v_alumno_id is null then
    raise exception using errcode = 'PT401', message = 'NO_AUTENTICADO';
  end if;

  select pg_catalog.jsonb_build_object(
           'rol', 'alumno', 'alumno_id', a.id, 'estado', a.estado,
           'nombre', a.nombre, 'mail', a.mail,
           'motivo_rechazo', case when a.estado = 'rechazado' then a.motivo_estado end)
    into v_resultado
    from public.alumno a
   where a.id = v_alumno_id;
  return v_resultado;
end;
$$;

CREATE OR REPLACE FUNCTION public.sugerencias_union(p_alumno_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select privado.sugerencias_union(p_alumno_id)
$$;

CREATE OR REPLACE FUNCTION public.unir_alumnos(p_cuenta_id uuid, p_sin_cuenta_id uuid) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select privado.unir_alumnos(p_cuenta_id, p_sin_cuenta_id)
$$;

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

REVOKE ALL ON FUNCTION privado.agenda_publica(p_profesor uuid, p_dia date) FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.al_completar_ficha() FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.al_confirmar_usuario() FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.al_ingresar_usuario() FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.alta_alumno(p_nombre text, p_telefono text, p_fecha_nacimiento date, p_mail text) FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.aprobar_cuenta(p_alumno_id uuid, p_motivo text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.app_ahora() FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_ahora() TO service_role;
GRANT ALL ON FUNCTION public.app_ahora() TO authenticated;

REVOKE ALL ON FUNCTION privado.barrer_mails(p_ahora timestamp with time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.completar_ficha(p_nombre text, p_telefono text, p_fecha_nacimiento date, p_como_llego text) FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.configurar_profesor(p_mail extensions.citext, p_nombre text) FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.descartar_union(p_cuenta_id uuid, p_sin_cuenta_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.disparar_mail(p_ids uuid[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.editar_alumno(p_alumno_id uuid, p_nombre text, p_telefono text, p_fecha_nacimiento date, p_mail text) FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.encolar_mail(p_tipo text, p_alumno_id uuid, p_destinatario text, p_asunto text, p_cuerpo text) FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.es_mail_simple(p text) FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.es_profesor() FROM PUBLIC;
GRANT ALL ON FUNCTION privado.es_profesor() TO authenticated;

REVOKE ALL ON FUNCTION privado.exigir_mail_libre(p_profesor uuid, p_mail text, p_excepto uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.guardar_configuracion(p_duracion_min integer, p_anticipacion_horas integer, p_zona_horaria text) FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.guardar_grilla(p_tramos jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.guardar_persona_a_cargo(p_id uuid, p_nombre text, p_fecha_nacimiento date) FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.huecos_del_dia(p_profesor uuid, p_dia date) FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.mail_cuenta_nueva(p_alumno_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.mail_cuenta_respondida(p_alumno_id uuid, p_estado text, p_motivo text) FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.mail_salida_disparar() FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.mail_salida_tiempos() FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.mi_alumno_id() FROM PUBLIC;
GRANT ALL ON FUNCTION privado.mi_alumno_id() TO authenticated;

REVOKE ALL ON FUNCTION privado.rechazar_cuenta(p_alumno_id uuid, p_motivo text) FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.responder_cuenta(p_alumno_id uuid, p_estado text, p_motivo text) FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.sin_contrasena() FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.sugerencias_de(p_cuenta_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.sugerencias_union(p_alumno_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.unir_alumnos(p_cuenta_id uuid, p_sin_cuenta_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.v_alumnos_solo_lectura() FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.validar_fecha_nacimiento(p_valor date, p_campo text) FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.validar_mail_alumno(p_valor text) FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.validar_motivo(p_valor text) FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.validar_nombre(p_valor text, p_campo text) FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.validar_par_union(p_cuenta_id uuid, p_sin_cuenta_id uuid, p_para_unir boolean) FROM PUBLIC;

REVOKE ALL ON FUNCTION privado.validar_telefono(p_valor text, p_campo text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.agenda_publica(p_dia date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.agenda_publica(p_dia date) TO service_role;
GRANT ALL ON FUNCTION public.agenda_publica(p_dia date) TO anon;
GRANT ALL ON FUNCTION public.agenda_publica(p_dia date) TO authenticated;

REVOKE ALL ON FUNCTION public.alta_alumno(p_nombre text, p_telefono text, p_fecha_nacimiento date, p_mail text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.alta_alumno(p_nombre text, p_telefono text, p_fecha_nacimiento date, p_mail text) TO service_role;
GRANT ALL ON FUNCTION public.alta_alumno(p_nombre text, p_telefono text, p_fecha_nacimiento date, p_mail text) TO authenticated;

REVOKE ALL ON FUNCTION public.aprobar_cuenta(p_alumno_id uuid, p_motivo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.aprobar_cuenta(p_alumno_id uuid, p_motivo text) TO service_role;
GRANT ALL ON FUNCTION public.aprobar_cuenta(p_alumno_id uuid, p_motivo text) TO authenticated;

REVOKE ALL ON FUNCTION public.completar_ficha(p_nombre text, p_telefono text, p_fecha_nacimiento date, p_como_llego text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.completar_ficha(p_nombre text, p_telefono text, p_fecha_nacimiento date, p_como_llego text) TO service_role;
GRANT ALL ON FUNCTION public.completar_ficha(p_nombre text, p_telefono text, p_fecha_nacimiento date, p_como_llego text) TO authenticated;

REVOKE ALL ON FUNCTION public.config_publica() FROM PUBLIC;
GRANT ALL ON FUNCTION public.config_publica() TO service_role;
GRANT ALL ON FUNCTION public.config_publica() TO anon;
GRANT ALL ON FUNCTION public.config_publica() TO authenticated;

REVOKE ALL ON FUNCTION public.descartar_union(p_cuenta_id uuid, p_sin_cuenta_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.descartar_union(p_cuenta_id uuid, p_sin_cuenta_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.descartar_union(p_cuenta_id uuid, p_sin_cuenta_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.editar_alumno(p_alumno_id uuid, p_nombre text, p_telefono text, p_fecha_nacimiento date, p_mail text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.editar_alumno(p_alumno_id uuid, p_nombre text, p_telefono text, p_fecha_nacimiento date, p_mail text) TO service_role;
GRANT ALL ON FUNCTION public.editar_alumno(p_alumno_id uuid, p_nombre text, p_telefono text, p_fecha_nacimiento date, p_mail text) TO authenticated;

REVOKE ALL ON FUNCTION public.guardar_configuracion(p_duracion_min integer, p_anticipacion_horas integer, p_zona_horaria text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.guardar_configuracion(p_duracion_min integer, p_anticipacion_horas integer, p_zona_horaria text) TO service_role;
GRANT ALL ON FUNCTION public.guardar_configuracion(p_duracion_min integer, p_anticipacion_horas integer, p_zona_horaria text) TO authenticated;

REVOKE ALL ON FUNCTION public.guardar_grilla(p_tramos jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.guardar_grilla(p_tramos jsonb) TO service_role;
GRANT ALL ON FUNCTION public.guardar_grilla(p_tramos jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.guardar_persona_a_cargo(p_id uuid, p_nombre text, p_fecha_nacimiento date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.guardar_persona_a_cargo(p_id uuid, p_nombre text, p_fecha_nacimiento date) TO service_role;
GRANT ALL ON FUNCTION public.guardar_persona_a_cargo(p_id uuid, p_nombre text, p_fecha_nacimiento date) TO authenticated;

REVOKE ALL ON FUNCTION public.ping() FROM PUBLIC;
GRANT ALL ON FUNCTION public.ping() TO service_role;
GRANT ALL ON FUNCTION public.ping() TO anon;
GRANT ALL ON FUNCTION public.ping() TO authenticated;

REVOKE ALL ON FUNCTION public.rechazar_cuenta(p_alumno_id uuid, p_motivo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rechazar_cuenta(p_alumno_id uuid, p_motivo text) TO service_role;
GRANT ALL ON FUNCTION public.rechazar_cuenta(p_alumno_id uuid, p_motivo text) TO authenticated;

REVOKE ALL ON FUNCTION public.sesion_actual() FROM PUBLIC;
GRANT ALL ON FUNCTION public.sesion_actual() TO service_role;
GRANT ALL ON FUNCTION public.sesion_actual() TO authenticated;

REVOKE ALL ON FUNCTION public.sugerencias_union(p_alumno_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sugerencias_union(p_alumno_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.sugerencias_union(p_alumno_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.unir_alumnos(p_cuenta_id uuid, p_sin_cuenta_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.unir_alumnos(p_cuenta_id uuid, p_sin_cuenta_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.unir_alumnos(p_cuenta_id uuid, p_sin_cuenta_id uuid) TO authenticated;

-- 5. Vistas, triggers y políticas de B05 ---------------------------------------------------------------------
CREATE VIEW public.v_alumnos WITH (security_invoker='true') AS
 SELECT a.id,
    a.estado,
    a.nombre,
    (a.mail)::text AS mail,
    a.telefono,
    a.fecha_nacimiento,
    a.como_llego,
    a.motivo_estado,
    (a.user_id IS NOT NULL) AS con_usuario,
    a.creado_en,
    a.ficha_completada_en,
    a.aprobado_en,
    (EXTRACT(year FROM age((((public.app_ahora() AT TIME ZONE p.zona_horaria))::date)::timestamp without time zone, (a.fecha_nacimiento)::timestamp without time zone)))::integer AS edad
   FROM (public.alumno a
     JOIN public.profesor p ON ((p.id = a.profesor_id)))
  WHERE ((a.estado = ANY (ARRAY['pendiente'::text, 'aprobado'::text, 'rechazado'::text, 'sin_cuenta'::text])) AND ( SELECT privado.es_profesor() AS es_profesor));

CREATE VIEW public.v_mails_fallidos WITH (security_invoker='true') AS
 SELECT id,
    creado_en AS fecha,
    destinatario,
    tipo,
    motivo_fallo AS motivo
   FROM public.mail_salida m
  WHERE (estado = 'fallido'::text);

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

GRANT ALL ON TABLE public.v_alumnos TO service_role;
GRANT SELECT ON TABLE public.v_alumnos TO authenticated;

GRANT SELECT ON TABLE public.v_mails_fallidos TO authenticated;

CREATE TRIGGER al_completar_ficha AFTER UPDATE OF estado ON public.alumno FOR EACH ROW WHEN (((old.estado = 'ficha_incompleta'::text) AND (new.estado = 'pendiente'::text))) EXECUTE FUNCTION privado.al_completar_ficha();

CREATE TRIGGER mail_salida_disparo AFTER INSERT ON public.mail_salida FOR EACH ROW WHEN ((new.estado = 'pendiente'::text)) EXECUTE FUNCTION privado.mail_salida_disparar();

CREATE TRIGGER mail_salida_tiempos BEFORE INSERT OR UPDATE ON public.mail_salida FOR EACH ROW EXECUTE FUNCTION privado.mail_salida_tiempos();

CREATE TRIGGER v_alumnos_sin_delete INSTEAD OF DELETE ON public.v_alumnos FOR EACH ROW EXECUTE FUNCTION privado.v_alumnos_solo_lectura();

CREATE TRIGGER v_alumnos_sin_insert INSTEAD OF INSERT ON public.v_alumnos FOR EACH ROW EXECUTE FUNCTION privado.v_alumnos_solo_lectura();

CREATE TRIGGER v_alumnos_sin_update INSTEAD OF UPDATE ON public.v_alumnos FOR EACH ROW EXECUTE FUNCTION privado.v_alumnos_solo_lectura();

CREATE POLICY alumno_lectura ON public.alumno FOR SELECT TO authenticated USING ((( SELECT privado.es_profesor() AS es_profesor) OR (id = ( SELECT privado.mi_alumno_id() AS mi_alumno_id))));

CREATE POLICY bloqueo_lectura ON public.bloqueo FOR SELECT TO authenticated USING (( SELECT privado.es_profesor() AS es_profesor));

CREATE POLICY clase_lectura ON public.clase FOR SELECT TO authenticated USING ((( SELECT privado.es_profesor() AS es_profesor) OR (alumno_id = ( SELECT privado.mi_alumno_id() AS mi_alumno_id))));

CREATE POLICY grilla_tramo_lectura ON public.grilla_tramo FOR SELECT TO authenticated USING (( SELECT privado.es_profesor() AS es_profesor));

CREATE POLICY mail_salida_lectura ON public.mail_salida FOR SELECT TO authenticated USING (( SELECT privado.es_profesor() AS es_profesor));

CREATE POLICY persona_a_cargo_lectura ON public.persona_a_cargo FOR SELECT TO authenticated USING ((( SELECT privado.es_profesor() AS es_profesor) OR (alumno_id = ( SELECT privado.mi_alumno_id() AS mi_alumno_id))));

CREATE POLICY profesor_lectura ON public.profesor FOR SELECT TO authenticated USING (( SELECT privado.es_profesor() AS es_profesor));

CREATE POLICY reserva_lectura ON public.reserva FOR SELECT TO authenticated USING ((( SELECT privado.es_profesor() AS es_profesor) OR (alumno_id = ( SELECT privado.mi_alumno_id() AS mi_alumno_id))));

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
