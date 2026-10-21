-- Spike S03: datos sintéticos reproducibles. Un profesor, grilla AGE-01 (L-V 08-13 y 14-18, 60 min),
-- 2 años de clases (2025-11-01 a 2027-10-31) con ~85 % de ocupación, cancelaciones y bloqueos.
select setseed(0.42);

insert into public.profesor (id) values ('00000000-0000-0000-0000-000000000001');

insert into public.grilla_tramo (profesor_id, dia_semana, desde, hasta)
select '00000000-0000-0000-0000-000000000001', d, t.desde, t.hasta
from generate_series(1, 5) d
cross join (values (time '08:00', time '13:00'), (time '14:00', time '18:00')) t(desde, hasta);

-- Días hábiles del período; 1 de cada 30 queda bloqueado completo (feriados, licencias).
create temp table dia_s03 as
select d::date as dia, random() < 1.0 / 30 as bloqueado
from generate_series(date '2025-11-01', date '2027-10-31', interval '1 day') d
where extract(isodow from d) between 1 and 5;

insert into public.bloqueo (profesor_id, periodo, motivo)
select '00000000-0000-0000-0000-000000000001',
       tstzrange(dia::timestamp at time zone 'America/Montevideo',
                 (dia + 1)::timestamp at time zone 'America/Montevideo'),
       'sintetico'
from dia_s03 where bloqueado;

-- Huecos de cada día no bloqueado; ~88 % con clase activa (90 % confirmada, 10 % pendiente).
create temp table hueco_s03 as
select h.inicio, h.fin, random() as r1, random() as r2, random() as r3
from dia_s03 d
cross join lateral privado.huecos_del_dia('00000000-0000-0000-0000-000000000001', d.dia) h
where not d.bloqueado;

insert into public.clase (profesor_id, alumno_id, inicio, fin, estado)
select '00000000-0000-0000-0000-000000000001', (r3 * 60)::int + 1, inicio, fin,
       case when r2 < 0.9 then 'confirmada' else 'pendiente' end
from hueco_s03 where r1 < 0.88;

-- Historial inactivo en el mismo hueco (no cuenta para la exclusión): ~12 % de los huecos.
insert into public.clase (profesor_id, alumno_id, inicio, fin, estado)
select '00000000-0000-0000-0000-000000000001', (r2 * 60)::int + 1, inicio, fin,
       case when r3 < 0.5 then 'cancelada' else 'movida' end
from hueco_s03 where r3 < 0.12;

analyze public.clase;
analyze public.bloqueo;
