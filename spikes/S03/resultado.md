# Spike S03 · Agenda del día y extensiones locales — resultado

Fecha: 2026-10-21 · Tarea TS03.1 · Base de NFR-04 (B13) · ADR-006, ADR-010 · Código descartable en `spikes/S03/`.

## Pregunta

¿La agenda de un día cabe en una RPC rápida y están btree_gist, pg_cron y pg_net en el stack local?

## Respuesta corta

**Sí, las cuatro condiciones se cumplen.**

| Criterio de salida (`arquitectura/spikes.md`) | Medido | Cumple |
| --- | --- | --- |
| btree_gist, pg_cron y pg_net se crean en local | Las tres se crean en la migración durante `supabase start`; pg_cron ejecuta un job y pg_net hace un GET con respuesta 200 | Sí, no hace falta plan B |
| p95 de la RPC < 150 ms en local (50 llamadas por PostgREST) | p95 **7,8 ms** y 6,0 ms en dos corridas (p50 5,7 y 4,6; máx 10,7 ms). Con 10 veces más filas (45 000 clases): p95 7,1 ms | Sí, unas 20 veces por debajo del tope |
| Ruta de agenda ≤ 200 kB gzip | **198,8 kB** gzip con supabase-js completo en la entrada (V1); **146,9 kB** si la agenda usa solo postgrest-js y supabase-js va en un chunk aparte (V2) | Sí, pero V1 tiene apenas 1,2 kB de margen (ver «Qué cambia») |
| La exclusión rechaza dos inserciones concurrentes | La segunda transacción espera el commit de la primera y recibe `23P01`; con rollback de la primera, la segunda entra; de 10 inserciones simultáneas, pasa 1 y se rechazan 9 | Sí |

## Entorno

- Supabase CLI 2.121.0 (`npx`), Postgres **17.11** (imagen `supabase/postgres:17.11.0.004`), Docker Desktop en
  Windows 11. Proyecto `rtc-s03`, puertos 574xx. Servicios excluidos: studio, imgproxy, vector, logflare,
  storage-api, realtime, edge-runtime, postgres-meta y supavisor.
- Node 22.19.0. React 19.3.1, react-router 7.18.4, react-aria-components 1.22.1, @supabase/supabase-js 2.118.0,
  date-fns 4.4.0, @date-fns/tz 1.5.0 y Vite 7.3.7.

## Método

1. `supabase/migrations/20261021000001_s03_esquema.sql`: `create extension` de btree_gist (en `extensions`),
   pg_cron (Supabase la instala en `pg_catalog`, con el esquema `cron`) y pg_net (`extensions`; las
   funciones quedan en `net`). Tablas mínimas `profesor`, `grilla_tramo`, `bloqueo` (gist) y `clase` con
   `EXCLUDE USING gist (profesor_id WITH =, tstzrange(inicio, fin) WITH &&) WHERE estado IN
   ('pendiente','confirmada')` e índices `(profesor_id, inicio)` y `(alumno_id, inicio)`, todas con RLS
   activa y sin grants a anon ni a authenticated. `privado.huecos_del_dia(profesor, dia)` (SQL, `stable`) y
   `public.agenda_publica(p_dia date)` (`security definer`, `search_path = ''`, ejecutable por anon y
   authenticated), que devuelve solo `inicio`, `fin` y `estado`.
2. `supabase/seed.sql` (setseed 0.42): 1 profesor, grilla AGE-01 (L-V 08-13 y 14-18, 60 min,
   America/Montevideo), días hábiles del 2025-11-01 al 2027-10-31 (522 días, 18 bloqueados completos) y
   alrededor del 88 % de los huecos con clase activa. Resultado: **3 983 clases activas** (3 574 confirmadas y
   409 pendientes), 517 canceladas en el mismo hueco y 18 bloqueos.
3. Comprobación de extensiones: `cron.schedule('s03-tic','2 seconds', …)` → 2 ejecuciones `succeeded` en 5 s;
   `net.http_get('http://kong:8000/rest/v1/')` desde la base → `status_code 200`.
4. `medidas/explain.sql`: `explain (analyze, buffers)` de la llamada y del cuerpo de la función con el día
   literal, y 200 llamadas dentro de la base sobre días distintos. Salida en `medidas/explain.log`.
5. `medidas/medir-rpc.mjs`: 5 llamadas de calentamiento y 50 medidas, como anon, a
   `POST /rest/v1/rpc/agenda_publica` por Kong (`127.0.0.1:57421`), con 50 días distintos (paso de 13 días;
   algunos caen en fin de semana y devuelven 0 filas). Mide de punta a punta con `fetch` desde Node en el host.
6. `medidas/estres-x10.sql`: 9 profesores más con las mismas clases (45 000 filas en `clase`); se repitieron
   los pasos 4 y 5.
7. `medidas/concurrencia.sh`: seis casos con dos o más sesiones `psql` en paralelo (resultado en
   `medidas/concurrencia.log`).
8. `app/`: app Vite vacía con `createHashRouter`, una ruta `/` lazy de agenda (Calendar de
   react-aria-components, `supabase.rpc('agenda_publica')`, `Intl.DateTimeFormat`, date-fns y `TZDate`), una
   ruta `/ingreso` lazy y `supabase.auth.getSession()` en paralelo, como pide ADR-006. `app/medir-bundle.mjs`
   recorre el manifest de Vite (entrada + chunk de agenda + sus imports) y suma gzip nivel 9. Variante V2 en
   `app/v2/` y `vite.config.v2.ts`. Desglose por paquete con `vite.config.diag.ts`.

## Números

### RPC `agenda_publica`

| Medida | 4 000 clases | 45 000 clases (x10) |
| --- | --- | --- |
| `explain analyze` de la llamada (primera, caché fría de la sesión) | 3,55 ms, 1 335 buffers hit | 3,83 ms |
| `explain analyze` del cuerpo con día literal | 0,43 ms; plan 0,30 ms | 0,48 ms |
| En la base, 200 días distintos: p50 / p95 / máx | 0,56 / 0,90 / 1,22 ms | 0,54 / 0,98 / 1,19 ms |
| PostgREST, 50 llamadas, corrida 1: min / p50 / **p95** / máx | 4,2 / 5,7 / **7,8** / 10,7 ms | 3,1 / 4,8 / **7,1** / 12,4 ms |
| PostgREST, corrida 2 | 3,8 / 4,6 / **6,0** / 8,7 ms | — |
| Respuesta: claves y tamaño | solo `estado, fin, inicio`; ≤ 847 B por día | igual |

Plan: las clases del día salen de un **Bitmap Index Scan sobre `clase_sin_solape`**, el gist de la exclusión,
con `profesor_id = … AND tstzrange(inicio, fin) && rango`; no hace falta un índice extra para esta consulta.
`bloqueo` va por Seq Scan porque tiene 18 filas, y el subplan ni se ejecuta si el hueco ya está ocupado.
El tiempo por PostgREST lo pone casi entero el viaje HTTP por Kong (unos 5 ms), no la consulta (menos de 1 ms).

### Bundle (`vite build`, gzip nivel 9)

| Variante | Entrada | Chunk agenda | **Ruta de agenda** | Todo el JS |
| --- | --- | --- | --- | --- |
| V1: supabase-js completo en la entrada | 155,7 kB | 43,1 kB | **198,8 kB** (662,8 kB sin comprimir) | 199,0 kB |
| V2: postgrest-js en la ruta y supabase-js en un chunk lazy aparte (53,7 kB) | 103,7 kB | 43,1 kB | **146,9 kB** | 199,3 kB |

Desglose gzip por paquete (diagnóstico, un chunk por paquete): react-dom 64,8 · supabase-js y sus partes
60,1 (auth-js 24,8, realtime-js 10,1, phoenix 7,9, storage-js 6,0, postgrest-js 5,5, supabase-js 4,6,
iceberg-js 1,6, functions-js 1,3) · react-router 30,7 · react-aria y stately 25,0 + @internationalized/date
9,4 + react-aria-components 2,9 · date-fns 5,6 + @date-fns/tz 1,7 · react 3,4 · scheduler 1,6 kB.
Realtime, phoenix, storage, functions e iceberg (unos 27 kB) no se usan y supabase-js v2 los arrastra igual.

### Exclusión concurrente (Postgres 17, read committed)

| Caso | Resultado |
| --- | --- |
| 1. A inserta [10:00,11:00) y espera 3 s; B inserta [10:30,11:30) mientras A sigue abierta | B queda bloqueada hasta el commit de A y recibe `ERROR conflicting key value violates exclusion constraint "clase_sin_solape"` (SQLSTATE 23P01). Queda 1 activa |
| 2. Igual, pero A hace rollback | B entra. Queda 1 activa |
| 3. 10 inserciones autocommit simultáneas del mismo hueco | 1 ok y 9 rechazadas. Queda 1 activa |
| 4. Solape con estado `cancelada` | Se inserta: la exclusión solo mira las activas |
| 5. Otro profesor en el mismo instante | Se inserta |
| 6. Contiguas [10,11) y [11,12) | Se insertan las dos: el rango `[)` no solapa |

## Qué cambia

### Para B01 (T01.2, T01.3)
- Las tres extensiones se crean en la migración base tal cual: `create extension btree_gist with schema
  extensions`, `create extension pg_cron` (sin `with schema`: va a `pg_catalog` y crea `cron`) y `create
  extension pg_net with schema extensions` (crea `net`). **No hace falta plan B para pg_cron**: en pruebas
  se pueden programar y ejecutar jobs reales.
- Desde la base, `http://kong:8000` responde (pg_net → Kong del stack local). La URL de la Edge Function la
  confirma S01.
- `config.toml`: el stack corre con studio, imgproxy, vector, logflare, storage-api, realtime, edge-runtime,
  postgres-meta y supavisor excluidos; en CI vale la pena el mismo `-x` (salvo edge-runtime, que S01
  necesita).
- SPA (T01.1): con supabase-js completo en la entrada, la base ya pesa 155,7 kB gzip y deja 44 kB para todo
  lo de agenda. Hay que decidir ahora la forma de carga (ver «Para el Arquitecto»), porque `src/lib/` solo se
  toca en B01 y B12.
- `@internationalized/date` (lo usa el Calendar de React Aria para el `value`) entra como dependencia
  transitiva: B01 debería declararla explícita.

### Para B02 (T02.1)
- El diseño de ADR-006 (huecos generados, `security definer`, una llamada por día) rinde de sobra: p95 de
  7,8 ms frente a un tope de 150 ms. Para leer las clases del día alcanza el gist de la exclusión; el índice
  `(profesor_id, inicio)` sigue sirviendo para otras consultas (rango por fecha, `v_clases`).
- Filtrar las clases del día con `tstzrange(inicio, fin) && rango` **y** con
  `estado in ('pendiente','confirmada')` (el mismo predicado del `WHERE` de la exclusión): así el planner usa
  el índice parcial.
- Para RES-01 basta con la exclusión. La RPC que confirma o crea clases tiene que traducir el `23P01` al
  error del catálogo de `contratos.md` §1, que es lo que ve el usuario. El advisory lock de ADR-002 sigue
  haciendo falta para las reglas que no son de solape, como los topes y las solicitudes.
- Las clases contiguas no chocan con `[)`; las canceladas y movidas no ocupan el hueco.

### Para el Arquitecto (`arquitectura/spikes.md`, columna Resultado; no se editó)
- Propuesta de texto: «S03 cumple. Las tres extensiones se crean en local (pg_cron ejecuta jobs y pg_net
  llega a Kong). RPC con 4 000 clases: p95 de 7,8 ms por PostgREST y < 1 ms en la base, usando el gist de la
  exclusión. Ruta de agenda: 198,8 kB gzip con supabase-js en la entrada (margen 1,2 kB) y 146,9 kB con
  postgrest-js en la agenda y supabase-js lazy. La exclusión rechaza la inserción concurrente con 23P01.»
- **Decisión sugerida (ADR-010 o ADR-006)**: el tope de 200 kB se cumple con V1, pero sin margen para la
  capa `logica/`, las vistas, el CSS y los componentes que faltan. Opciones: (a) V2: la agenda pública lee
  con `@supabase/postgrest-js` (5,5 kB) y supabase-js va en un chunk propio que se baja en paralelo para
  `getSession`; ahorra unos 52 kB de la ruta; (b) subir el tope; (c) quedarse con V1 y vigilarlo en B13.
  Hay que fijarlo antes de T01.1. react-hook-form y zod no deben entrar en la ruta de agenda: solo en las
  rutas con formularios.
- Interpretación tomada en el spike, para confirmar en B02: «una clase activa que no coincide con ningún
  hueco» se implementó como «que no **solapa** ningún hueco». Si una clase solapa parcialmente un hueco
  (por ejemplo, después de cambiar la duración, AGE-03), ese hueco sale `ocupado` y la clase no se agrega
  aparte.

## Archivos

- `spikes/S03/supabase/config.toml`, `supabase/migrations/20261021000001_s03_esquema.sql`, `supabase/seed.sql`
- `spikes/S03/medidas/explain.sql`, `medir-rpc.mjs`, `estres-x10.sql`, `concurrencia.sh` y los logs
  `explain.log`, `explain-x10.log`, `rpc-1.log`, `rpc-2.log`, `rpc-x10.log`, `concurrencia.log`
- `spikes/S03/app/` (package.json, vite.config*.ts, `src/`, `v2/`, `medir-bundle.mjs`)
- `spikes/S03/.gitignore` (excluye node_modules, dist*, `.temp`, `.branches`)

## Cómo reproducir

```sh
cd spikes/S03
npx --yes supabase@2.121.0 start -x studio,imgproxy,vector,logflare,storage-api,realtime,edge-runtime,postgres-meta,supavisor
docker exec -i supabase_db_rtc-s03 psql -U postgres < medidas/explain.sql
ANON_KEY=<ANON_KEY de supabase status> node medidas/medir-rpc.mjs
bash medidas/concurrencia.sh
cd app && npm install && npm run medir && npx vite build -c vite.config.v2.ts && node medir-bundle.mjs dist-v2
cd .. && npx --yes supabase@2.121.0 stop --no-backup
```
