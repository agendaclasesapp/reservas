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
| 4 | B06 en adelante | `prod-b06` | `202611000601` a `0604` y las que sigan hasta `1150` | humo propio de B06 |
| 5 | Calendario del profesor (B16 a B23) | `prod-calendario` | `202611001601` (1; solo la función `agenda_profesor_dias`, sin tablas ni RLS) | humo de Día y Semana (§ abajo) |

Reglas:

- Si el dry-run lista una migración de más o de menos que su fila, no se aprueba: se revisa de qué commit salió.
- La contracción (`prod-b15b`) nunca se junta con el alta; si B14 y B15 salieran juntos con la contracción, la vuelta
  atrás es solo el dump.
- Antes del tramo 1: respaldo completo de la base fuera del repositorio. La migración inversa de `ops/vuelta-atras/` sirve
  solo antes de la contracción y con un único profesor; después, o con más de un profesor, solo el dump.
- Se aplican por entorno: primero `qa` (`${QA_SUPABASE_PROJECT_REF}`) con los cuatro tramos, después `prod`
  (`${PROD_SUPABASE_PROJECT_REF}`). En `prod` aprueba el revisor del environment `produccion`. Si el cliente no tiene
  `qa` (PREG-004, opción c), se va directo a `prod`, un tramo por vez, cada uno con su humo.
- El revisor del environment aprueba **antes** de que el job arranque: el `db push --dry-run` del workflow se ve
  después de aprobar y `db push` corre enseguida. Por eso la comprobación de la fila se hace **antes de lanzar**, con el
  mismo `db push --dry-run` desde un checkout de la etiqueta (`git worktree add ../tramo <etiqueta>`, `supabase link`).
- Los tramos 2 y 3 salen de un mismo commit de B15. Si el repositorio no tiene un commit con exactamente las migraciones
  de la fila, se crea un commit de tramo que solo borra de su árbol las migraciones posteriores (`git rm`) y se
  etiqueta ese commit; la secuencia de comandos está en `.aidlc/<proyecto>/operacion/runbook-despliegue-prod.md` §3.
- `supabase-deploy.yml` despliega el árbol del ref desde el que se lanza: se lanza con "Use workflow from" la etiqueta
  del tramo (`${TRAMO_ETIQUETA}`), no desde `main` si `main` ya trae tramos posteriores.

## Tramo 5 · calendario del profesor (una migración, solo funciones)

- Es aditivo: no toca tablas, vistas ni políticas RLS. Sale después del tramo 4 y **antes** de publicar la web nueva
  (la web de Día y Semana llama a `agenda_profesor_dias`; sin la función falla con 404). Si la web ya salió, el calendario
  muestra el error con «Reintentar» hasta aplicar la migración.
- **Integrar el PR a `main` es lo que publica la web en Pages:** el PR `feature/calendario-profesor` no se integra hasta que este
  tramo esté aplicado y verificado con el SQL de `runbook.md` §4.
- Vuelta atrás: primero la web (`web.yml` sobre el commit anterior), después, si hace falta, quitar las dos funciones
  (`drop function public.agenda_profesor_dias(date, date); drop function privado.agenda_profesor_dias(uuid, date, date);`).
  No hay datos que perder. El dump previo sigue siendo el último recurso.
- Humo: con sesión de profesor, abrir `${PROD_SITIO_URL}#/panel` (calendario Día) y `#/panel?v=semana`; deben verse los
  bloques de la agenda y responder una solicitud pendiente. Detalle y verificaciones SQL en
  `.aidlc/<proyecto>/operacion/runbook.md` (calendario-profesor).
