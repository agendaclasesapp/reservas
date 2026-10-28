-- Catálogo de tablas, columnas, índices y restricciones de public y privado (una fila por objeto, con el formato
-- de una lista VALUES de SQL). Se corre sobre una base en B05 puro; lo lee generar-inversa.py.
select format('(%L,%L,%L,%L)', 'tabla', n.nspname, c.relname, '')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname in ('public', 'privado') and c.relkind in ('r', 'p')
union all
select format('(%L,%L,%L,%L)', 'columna', n.nspname, c.relname, a.attname)
  from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
 where n.nspname in ('public', 'privado') and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped
union all
select format('(%L,%L,%L,%L)', 'indice', n.nspname, c.relname, i.relname)
  from pg_index x join pg_class i on i.oid = x.indexrelid join pg_class c on c.oid = x.indrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname in ('public', 'privado') and c.relkind in ('r', 'p')
union all
select format('(%L,%L,%L,%L)', 'restriccion', n.nspname, c.relname, k.conname)
  from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
 where n.nspname in ('public', 'privado') and c.relkind in ('r', 'p')
order by 1;
