# Operación: revisión semanal de los procesos programados (ALU-10, SEC-28, H-014)

Sin valores secretos en este documento. Alcance: los jobs `recordatorios` y `retencion` de pg_cron (B11).
Se ejecuta en el SQL Editor de Supabase (rol `postgres`) o con `psql` contra la base. `anon` y `authenticated`
no ven ni `cron` ni `privado`.

Los jobs `recordatorios` y `retencion` llaman a `call privado.correr_proceso('<nombre>')` (ratificado, ADR-008).

## 1. Los jobs deben existir

Verificación pendiente en el proyecto alojado (H-358; ver `ops/puesta-en-marcha.md` §9). Consulta exacta, con rol
`postgres` en el SQL Editor:

```sql
show cron.use_background_workers;
```

Valor esperado: `off`. Con `off`, pg_cron ejecuta cada job por una conexión propia y el `COMMIT` dentro de
`privado.correr_proceso` es válido (así se probó con pg_cron local). Con `on`, ese `COMMIT` podría terminar en
`2D000` y se perdería la fila de error (la corrida igual queda `failed`). Si da `on`, avisar al Arquitecto. Anotar
aquí el valor y la fecha cuando se verifique: `cron.use_background_workers = ____ (____-__-__)`.

```sql
select jobname, schedule, command, active, username
from cron.job
where jobname in ('recordatorios', 'retencion')
order by jobname;
```

Normal: dos filas, `active = true`, `username = 'postgres'`:

| jobname | schedule | command |
| --- | --- | --- |
| recordatorios | `*/15 * * * *` | `call privado.correr_proceso('recordatorios')` |
| retencion | `30 3 * * *` | `call privado.correr_proceso('retencion')` (03:30 UTC) |

No normal: falta alguno, `active = false` o el comando es otro. Se vuelve a programar con
`select cron.schedule(...)` de la migración `202611001107_programacion_cron.sql` (con nombre es idempotente).
Hay además `barrer_mails` y `extender_series`, que no son de este documento.

## 2. Fallos de pg_cron (revisión semanal, lunes)

```sql
select j.jobname, d.runid, d.status, d.start_time, d.end_time, d.return_message
from cron.job_run_details d
join cron.job j using (jobid)
where j.jobname in ('recordatorios', 'retencion')
  and d.start_time > now() - interval '7 days'
  and d.status <> 'succeeded'
order by d.start_time desc;
```

Normal: cero filas. Una corrida en curso (`running`) con menos de unos minutos de antigüedad también es normal.
No normal: cualquier `failed` (el mensaje es `PROCESO_FALLIDO`; el motivo está en el paso 3) o una corrida `running`
de horas.

Que el job corre con la frecuencia esperada (la retención 7 veces en 7 días, los recordatorios unas 672):

```sql
select j.jobname, count(*) as corridas, max(d.start_time) as ultima
from cron.job_run_details d
join cron.job j using (jobid)
where j.jobname in ('recordatorios', 'retencion')
  and d.start_time > now() - interval '7 days'
group by j.jobname;
```

No normal: `retencion` con menos de 7 corridas o `ultima` de hace más de un día (ver §5).

## 3. Registro propio de cada corrida

```sql
select nombre, ahora, inicio, fin, ok, error, cantidades
from privado.ejecucion_proceso
where inicio > now() - interval '7 days'
  and (nombre = 'retencion' or not ok)
order by inicio desc;
```

Muestra todas las corridas de la retención y solo las fallidas de los recordatorios (los recordatorios corren cada
15 minutos y dejarían cerca de 700 filas).

- `inicio` y `fin` son hora real del servidor; `ahora` es el instante de negocio (`app_ahora()`). Si el reloj de
  negocio está fijado (ensayos), `ahora` y `inicio` difieren: normal solo fuera de producción.
- `ok = true`: `cantidades` trae `{"avisos": n, "anonimizados": n}` (retención) o `{"recordatorios": n, "sin_mail": n}`.
- `ok = false`: `error` trae `SQLSTATE: mensaje`, sin datos de filas a propósito (SEC-17, SEC-29).

Normal: una fila de `retencion` por día con `ok = true`, `fin - inicio` de segundos, `anonimizados` casi siempre 0
y `avisos` de 0 a pocos. Una corrida de recordatorios con 0 también es normal (no hay clase en la ventana de 15 min).
No normal:
- Cualquier `ok = false`.
- Un día sin fila de `retencion`.
- `anonimizados` o `avisos` muy por encima de lo habitual de golpe (un lote grande suele indicar un hueco previo,
  §5).
- `fin - inicio` de minutos.

Cruce con pg_cron: toda fila `ok = false` debe tener su `failed` en `cron.job_run_details` en la misma hora, y
viceversa. Un `failed` sin fila propia significa que el fallo fue antes de registrar (permisos, función ausente,
transacción cortada): se lee `return_message`.

## 4. Si la retención o los recordatorios fallan

**Verlo:** consultas de §2 y §3. El `error` dice la causa (por ejemplo un `42501` de permisos, un `23xxx` de
integridad, un `57014` de tiempo). Para el log completo, Supabase > Logs > Postgres, filtrando `PROCESO_FALLIDO`.
No copies mails ni nombres de esos logs a tickets.

**Reintentar a mano:** primero corregir la causa. Después, como `postgres`:

```sql
call privado.correr_proceso('retencion');      -- o 'recordatorios'
```

Fuera de una transacción explícita (el SQL Editor la ejecuta como sentencia suelta). Si dentro de una transacción
falla, termina con `2D000`: es esperado, no se puede confirmar la fila. Resultado: una fila nueva en
`privado.ejecucion_proceso` con `ok = true`, y la corrida fallida anterior queda como historial.
Los pasos son idempotentes: las marcas `recordatorio_en` y `aviso_inactividad_en` se ponen en la misma transacción
que el mail, así que repetir no duplica recordatorios ni avisos. `correr_proceso` con otro nombre da `PT422`.

**Recordatorios:** el reintento solo alcanza a las clases cuyo inicio cae en `(ahora + 23h45, ahora + 24h]`. Una
clase que ya salió de esa ventana no recibe recordatorio (el hueco no se recupera; se anota el incidente en
`incidentes.md` si afectó a alguien). No hay que reprogramar nada a mano.

**Mails:** que los avisos y recordatorios se hayan encolado no garantiza el envío; eso se revisa en `mails.md`
(mails fallidos y barrido).

## 5. Riesgo: retención sin correr más de 7 días

El aviso sale cuando la persona vence en `(ahora, ahora + 7 días]`, pero el borrado no espera al aviso: se anonimiza
a quien venció (6 meses, ADR-011), lo haya recibido o no. Si la retención no corre más de 7 días y vuelve a correr,
puede anonimizar, en la primera corrida, a alguien que pasó de «fuera de la ventana de aviso» a «vencido» sin
haber recibido el mail. El anonimizado no se recupera (el usuario de Auth se borra).

**Antes de reactivar o relanzar la retención tras un hueco de más de 7 días** (job inactivo, fallo sostenido, base
pausada, restauración):

1. Confirmar la causa del hueco y que está resuelta (§3 devuelve la última corrida buena y la fecha).
2. Revisar a quién alcanzaría la primera corrida. Las columnas y la regla exacta están en
   `supabase/migrations/2026110011*` (`privado.retencion` y `pasos_retencion`); la consulta de apoyo es contar las
   personas con `aviso_inactividad_en` nulo o anterior a `vence_en - 7 días` y `vence_en <= now()`. Si esa cifra es
   mayor de lo esperable, no relanzar sin revisión.
3. Para dar el aviso a quienes lo perdieron, la salida segura es postergar su vencimiento (que ingresen o
   tomen una clase) o pedir al Arquitecto una CR de un periodo de gracia. No se edita `aviso_inactividad_en` a
   mano ni se baja el plazo.
4. Si la cifra es la esperada, `call privado.correr_proceso('retencion');` y revisar la fila resultante en §3
   (`anonimizados`).

DEC-39 está cerrada (opción a, 2026-10-25): no habrá período de gracia, así que este paso es **el único control** antes de reactivar el proceso; si el job estuvo parado más de 7 días, quien opera revisa a mano a quién alcanzaría.

Mientras el job esté parado, no borra a nadie: el riesgo aparece solo al volver. Por eso §2 (frecuencia de 7 corridas)
se revisa cada semana y el hueco no debería pasar de 7 días.

## 6. Crecimiento de privado.ejecucion_proceso (regla, ADR-011)

Crece unas 97 filas por día (96 de recordatorios y 1 de retención), sin depuración automática. A ese ritmo son unas
35 000 filas por año. Revisar el tamaño cada trimestre:

```sql
select count(*) as filas, min(inicio) as desde from privado.ejecucion_proceso;
```

Regla: por encima de 100 000 filas, borrar a mano las corridas correctas de recordatorios de más de 90 días. Se
conservan las fallidas y todas las de retención:

```sql
delete from privado.ejecucion_proceso
where nombre = 'recordatorios' and ok and inicio < now() - interval '90 days';
```

## 7. Resumen de la revisión semanal

1. §1: dos jobs activos.
2. §2: sin `failed`, retención 7 corridas.
3. §3: una fila `ok = true` de retención por día; cero `ok = false`.
4. Cualquier excepción: §4; con hueco de retención de más de 7 días, §5 antes de reactivar.
