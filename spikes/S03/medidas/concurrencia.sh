#!/usr/bin/env bash
# Spike S03: la exclusión clase_sin_solape (RES-01) con dos transacciones concurrentes.
# Requiere el stack rtc-s03 levantado y docker en el PATH.
DB=supabase_db_rtc-s03
P="'00000000-0000-0000-0000-000000000001'"
q() { docker exec -i $DB psql -U postgres -v ON_ERROR_STOP=1 -At "$@"; }
q -c "delete from public.clase where inicio >= '2026-05-16' and inicio < '2026-05-17'" >/dev/null

echo "== Caso 1: A inserta y espera 3 s antes del commit; B inserta un solape mientras A sigue abierta"
( q -c "begin; insert into public.clase(profesor_id,inicio,fin,estado) values ($P,'2026-05-16 10:00Z','2026-05-16 11:00Z','pendiente'); select 'A inserto ' || clock_timestamp()::time; select pg_sleep(3); commit; select 'A commit ' || clock_timestamp()::time;" 2>&1 | sed 's/^/  A: /' ) &
( sleep 1; q -c "select 'B empieza ' || clock_timestamp()::time; insert into public.clase(profesor_id,inicio,fin,estado) values ($P,'2026-05-16 10:30Z','2026-05-16 11:30Z','confirmada');" 2>&1 | sed 's/^/  B: /'; q -c "select 'B termina ' || clock_timestamp()::time" | sed 's/^/  B: /' ) &
wait
q -c "select 'activas en el hueco: ' || count(*) from public.clase where inicio >= '2026-05-16' and inicio < '2026-05-17' and estado in ('pendiente','confirmada')"

echo "== Caso 2: A hace rollback; B (que esperaba) entra"
q -c "delete from public.clase where inicio >= '2026-05-16' and inicio < '2026-05-17'" >/dev/null
( q -c "begin; insert into public.clase(profesor_id,inicio,fin,estado) values ($P,'2026-05-16 10:00Z','2026-05-16 11:00Z','pendiente'); select pg_sleep(3); rollback;" >/dev/null 2>&1; echo "  A: rollback" ) &
( sleep 1; q -c "insert into public.clase(profesor_id,inicio,fin,estado) values ($P,'2026-05-16 10:30Z','2026-05-16 11:30Z','confirmada');" 2>&1 | sed 's/^/  B: /' ) &
wait
q -c "select 'activas en el hueco: ' || count(*) from public.clase where inicio >= '2026-05-16' and inicio < '2026-05-17' and estado in ('pendiente','confirmada')"

echo "== Caso 3: 10 inserciones autocommit simultaneas del mismo hueco"
q -c "delete from public.clase where inicio >= '2026-05-16' and inicio < '2026-05-17'" >/dev/null
for i in $(seq 1 10); do
  ( q -c "insert into public.clase(profesor_id,inicio,fin,estado) values ($P,'2026-05-16 13:00Z','2026-05-16 14:00Z','pendiente')" >/dev/null 2>&1 && echo ok || echo rechazada ) &
done | sort | uniq -c | sed 's/^/  /'
wait
q -c "select 'activas en el hueco: ' || count(*) from public.clase where inicio >= '2026-05-16' and inicio < '2026-05-17' and estado in ('pendiente','confirmada')"

echo "== Caso 4: un solape con estado cancelada no choca (la exclusión solo mira pendiente/confirmada)"
q -c "insert into public.clase(profesor_id,inicio,fin,estado) values ($P,'2026-05-16 13:00Z','2026-05-16 14:00Z','cancelada') returning 'insertada id ' || id" 2>&1 | sed 's/^/  /'
echo "== Caso 5: otro profesor en el mismo instante no choca"
q -c "insert into public.clase(profesor_id,inicio,fin,estado) values ('00000000-0000-0000-0000-000000000002','2026-05-16 13:00Z','2026-05-16 14:00Z','confirmada') returning 'insertada id ' || id" 2>&1 | sed 's/^/  /'
echo "== Caso 6: clases contiguas [10,11) y [11,12) no se solapan"
q -c "delete from public.clase where inicio >= '2026-05-16' and inicio < '2026-05-17'; insert into public.clase(profesor_id,inicio,fin,estado) values ($P,'2026-05-16 10:00Z','2026-05-16 11:00Z','confirmada'),($P,'2026-05-16 11:00Z','2026-05-16 12:00Z','confirmada') returning 'insertada id ' || id" 2>&1 | sed 's/^/  /'
q -c "delete from public.clase where inicio >= '2026-05-16' and inicio < '2026-05-17'" >/dev/null
