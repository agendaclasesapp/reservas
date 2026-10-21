-- Spike S03, escenario de estrés: 9 profesores más con las mismas clases (x10 filas en clase).
insert into public.profesor (id)
select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid from generate_series(2, 10) n;
insert into public.clase (profesor_id, alumno_id, inicio, fin, estado)
select p.id, c.alumno_id, c.inicio, c.fin, c.estado
from public.clase c cross join public.profesor p
where c.profesor_id = '00000000-0000-0000-0000-000000000001' and p.id <> c.profesor_id;
analyze public.clase;
select count(*) as clases_total from public.clase;
