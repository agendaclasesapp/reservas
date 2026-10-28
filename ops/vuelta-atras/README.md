# Vuelta atrás de la expansión de B14 (ADR-021 §8)

| Archivo | Qué es |
| --- | --- |
| `inversa-b14.sql` | Migración inversa lista para correr a mano (NO está en `supabase/migrations/`). Generada. |
| `inversa-b14.cuerpo.sql` | Pasos de datos y de tablas de la inversa (lo único que se edita a mano). |
| `catalogo-b05.sql` | Consulta que lista tablas, columnas, índices y restricciones de B05 (la inversa borra lo que no esté). |
| `generar-inversa.py` | Arma `inversa-b14.sql` con el catálogo de B05 (funciones, vistas, triggers, políticas y permisos). |
| `ensayar.sh` | Ensayo local: B05 con datos, expansión, inversa y comparación (ver `ops/migracion-multiprofesor.md`, §6). |

## Cuándo se usa
Solo con la expansión de B14 aplicada y la contracción de B15 todavía **sin** aplicar, y con a lo sumo un
profesor. Criterios y procedimiento en `ops/migracion-multiprofesor.md`, §6.

## Regenerar (si cambia el cuerpo)
Con la base local en B05 puro (`npx supabase@2.121.0 db reset --version 202611000504 --no-seed`):

    docker exec supabase_db_reservas pg_dump -U postgres -s -n public -n privado --no-owner > b05-schema.sql
    docker exec supabase_db_reservas psql -U postgres -At -c "select format('(%L,%L,%L,%L,%L)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), pg_get_function_arguments(p.oid), pg_get_function_result(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','privado') and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e') order by 1" > b05-funciones.txt
    docker exec -i supabase_db_reservas psql -U postgres -At < ops/vuelta-atras/catalogo-b05.sql > b05-catalogo.txt
    python ops/vuelta-atras/generar-inversa.py --esquema b05-schema.sql --funciones b05-funciones.txt --catalogo b05-catalogo.txt \
      --cuerpo ops/vuelta-atras/inversa-b14.cuerpo.sql --salida ops/vuelta-atras/inversa-b14.sql

Los tres archivos de entrada llevan el esquema de la base, no datos; igual no se versionan.
Después de regenerar, repetir el ensayo: `bash ops/vuelta-atras/ensayar.sh`.
