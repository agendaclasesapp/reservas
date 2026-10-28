# Despliegue de producción por tramos (ADR-021, CR-002)

La migración a varios profesores se despliega en cuatro tramos, cada uno desde su etiqueta, en este orden.
Un tramo no sale hasta que el anterior tenga su humo en verde. La guía paso a paso es `ops/migracion-multiprofesor.md`;
aquí solo va lo que el equipo del cliente debe saber para ejecutarlo en `supabase-deploy`. Las etiquetas las crea el
equipo del proyecto; este documento no las crea.

| # | Tramo | Etiqueta | `db push --dry-run` debe listar exactamente | Condición para pasar al siguiente |
| --- | --- | --- | --- | --- |
| 1 | B14 (expansión) | `prod-b14` | `202611000510`, `0511`, `0512`, `0513`, `0520` a `0525` (10) | humo con el slug provisional (§4 de la guía) |
| 2 | B15 sin contracción | `prod-b15a` | `202611000526`, `0530`, `0531` (3) | alta del profesor actual y humo de §5.1 |
| 3 | Contracción | `prod-b15b` | `202611000539` (1) | humo posterior a la contracción |
| 4 | B06 en adelante | `prod-b06` | `202611000601` a `0604` y las que sigan | humo propio de B06 |

Reglas:

- Si el dry-run lista una migración de más o de menos que su fila, no se aprueba: se revisa de qué commit salió.
- La contracción (`prod-b15b`) nunca se junta con el alta; si B14 y B15 salieran juntos con la contracción, la vuelta
  atrás es solo el dump.
- Antes del tramo 1: respaldo completo de la base fuera del repositorio. La migración inversa de `ops/vuelta-atras/` sirve
  solo antes de la contracción y con un único profesor; después, o con más de un profesor, solo el dump.
- Se aplican por entorno: primero `qa` (`${QA_SUPABASE_PROJECT_REF}`) con los cuatro tramos, después `prod`
  (`${PROD_SUPABASE_PROJECT_REF}`). En `prod` aprueba el revisor del environment `produccion`.
- `supabase-deploy.yml` despliega el árbol del ref desde el que se lanza: se lanza con "Use workflow from" la etiqueta
  del tramo (`${TRAMO_ETIQUETA}`), no desde `main` si `main` ya trae tramos posteriores.
