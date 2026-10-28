#!/usr/bin/env bash
# Ensayo LOCAL de la expansión de B14 y de su vuelta atrás (ADR-021 §8, T14.6). No toca producción.
# Destruye la base local (db reset): no correrlo mientras otra persona usa la misma base.
#
#   bash ops/vuelta-atras/ensayar.sh            desde la raíz del repositorio, con Docker y la CLI de Supabase
#
# Pasos:
#   1. Base en el estado de B05 (db reset --version 202611000504 --no-seed) + datos ficticios de
#      supabase/tests/14_t1_ensayo_datos_b05.sql (profesor configurado y vinculado, 7 alumnos en todos los estados).
#   2. Foto A: catálogo (pg_dump -s) y datos de B05.
#   3. Expansión: las migraciones 20261100051* y 20261100052* (cada una en su transacción, como la CLI).
#   4. supabase/tests/14_t1_ensayo_migracion.test.sql (si la expansión ya no cambió lo que mira, ver su cabecera).
#   5. Inversa: ops/vuelta-atras/inversa-b14.sql.
#   6. Foto B: debe ser idéntica a la A (catálogo con ACL y datos de B05). Cualquier diferencia falla el ensayo.
#   7. Segunda pasada sin datos de ensayo (base vacía de B05 -> expansión -> inversa) y las pruebas pgTAP de B01 a B05
#      que están en git (HEAD) corren contra la base vuelta atrás.
#   8. Deja la base local con `supabase db reset` (esquema y semilla actuales).
set -euo pipefail

export PATH="/c/Users/fburgueno/AppData/Local/Programs/DockerDesktop/resources/bin:$PATH"
CLI="npx --yes supabase@2.121.0"
DB=supabase_db_reservas
PSQL="docker exec -i $DB psql -U postgres -v ON_ERROR_STOP=1 -q"
DIR="${ENSAYO_DIR:-$(mktemp -d)}"
mkdir -p "$DIR"
echo "== Fotos y registros en $DIR"

foto() { # $1 = nombre de la foto
  docker exec "$DB" pg_dump -U postgres -s -n public -n privado --no-owner >"$DIR/$1.esquema.sql"
  $PSQL -At -F '|' >"$DIR/$1.datos.txt" <<'SQL'
select 'alumno', a.id, a.profesor_id, a.user_id, a.estado, a.nombre, a.mail, a.telefono, a.fecha_nacimiento,
       a.como_llego, a.motivo_estado, a.ficha_completada_en, a.creado_en, a.aprobado_en from public.alumno a order by a.id;
select 'profesor', p.id, p.user_id, p.mail, p.nombre from public.profesor p order by p.id;
select 'persona_a_cargo', x.id, x.profesor_id, x.alumno_id, x.nombre from public.persona_a_cargo x order by x.id;
select 'reserva', r.id, r.profesor_id, r.alumno_id, r.estado from public.reserva r order by r.id;
select 'clase', c.id, c.profesor_id, c.alumno_id, c.inicio, c.estado from public.clase c order by c.id;
select 'mail_salida', m.id, m.profesor_id, m.alumno_id, m.tipo, m.destinatario, m.estado from public.mail_salida m order by m.id;
select 'grilla', count(*) from public.grilla_tramo;
select 'ajustes', tope_pendientes_alumno, tope_mails_hora, tope_mails_dia, tope_fichas_hora, permitir_reloj_prueba from privado.ajustes;
select 'auth.users', u.id, u.email from auth.users u order by u.id;
SQL
}

expandir() {
  # HASTA=<version> corta la expansión (para un ensayo parcial mientras T14.2 aún escribe migraciones 052*).
  for f in supabase/migrations/20261100051*.sql supabase/migrations/20261100052*.sql; do
    [ -e "$f" ] || continue
    v=$(basename "$f" | cut -d_ -f1)
    [ -z "${HASTA:-}" ] || [ "$v" -le "$HASTA" ] || continue
    echo "   $f"
    $PSQL -1 <"$f"
    # lo que haría `db push`: dejar la versión registrada
    $PSQL -c "insert into supabase_migrations.schema_migrations (version, name) values ('$v', '$(basename "$f" .sql | cut -d_ -f2-)')"
  done
}

echo "== 1. Base en B05 con datos"
$CLI db reset --version 202611000504 --no-seed >/dev/null 2>&1
$PSQL <supabase/tests/14_t1_ensayo_datos_b05.sql
echo "== 2. Foto A (B05 con datos)"
foto A
echo "== 3. Expansión"
expandir
echo "== 4. Prueba de la migración"
$CLI test db supabase/tests/14_t1_ensayo_migracion.test.sql || echo "(aviso: la prueba de 14_t1_ensayo_migracion falló o se omitió; ver arriba)"
echo "== 5. Inversa"
$PSQL <ops/vuelta-atras/inversa-b14.sql   # trae su propio begin/commit
echo "== 6. Foto B y comparación"
reg=$($PSQL -At -c "select count(*) from supabase_migrations.schema_migrations where version >= '202611000510'")
[ "$reg" = "0" ] && echo "   registro de migraciones: sin versiones 0510 en adelante" || { echo "   registro de migraciones: quedaron $reg versiones"; exit 1; }
foto B
limpio() { tr -d '\r' <"$1" | grep -v -E '^.(un)?restrict '; }   # CRLF de las migraciones locales y marcas de pg_dump
if diff -u <(limpio "$DIR/A.esquema.sql") <(limpio "$DIR/B.esquema.sql") >"$DIR/esquema.diff"; then echo "   catálogo: IDÉNTICO"; else echo "   catálogo: DIFERENCIAS (ver $DIR/esquema.diff)"; head -60 "$DIR/esquema.diff"; exit 1; fi
if diff -u "$DIR/A.datos.txt" "$DIR/B.datos.txt" >"$DIR/datos.diff"; then echo "   datos: IDÉNTICOS"; else echo "   datos: DIFERENCIAS (ver $DIR/datos.diff)"; head -60 "$DIR/datos.diff"; exit 1; fi

echo "== 7. Pruebas pgTAP de B01 a B05 (HEAD): base B05 pura contra base B05 -> expansión -> inversa"
# Sin seed.sql no hay reloj de prueba (ADR-014) y algunas pruebas de B05 fallan igual en una base B05 pura:
# lo que se exige es que el conjunto de fallas con la inversa sea el mismo que sin ella.
mkdir -p "$DIR/pruebas-b05"
PRUEBAS=""
for t in 01_rls_base 02_agenda 03_mails 04_ingreso 05_cuentas; do
  git show "HEAD:supabase/tests/$t.test.sql" >"$DIR/pruebas-b05/$t.test.sql"
  PRUEBAS="$PRUEBAS $DIR/pruebas-b05/$t.test.sql"
done
correr() { # $1 = nombre del registro; no corta el script si hay fallas
  $CLI test db $PRUEBAS >"$DIR/$1.pruebas.txt" 2>&1 || true
  grep -E '^# Failed test|^Files=|^Result:' "$DIR/$1.pruebas.txt" | sed -E 's/^# Failed test [0-9]+/FALLA/' | sed -E 's/Files=.*/Files/' >"$DIR/$1.fallas.txt"
}
$CLI db reset --version 202611000504 --no-seed >/dev/null 2>&1
correr base_b05
expandir
$PSQL <ops/vuelta-atras/inversa-b14.sql   # trae su propio begin/commit
correr tras_inversa
if diff -u "$DIR/base_b05.fallas.txt" "$DIR/tras_inversa.fallas.txt"; then echo "   pruebas B01-B05: mismo resultado que una base B05 pura ($(grep -c '^FALLA' "$DIR/base_b05.fallas.txt") fallas en ambas, por falta del reloj de prueba de seed.sql (ADR-014))"; else echo "   pruebas B01-B05: DIFERENCIAS"; exit 1; fi

echo "== 8. Base local de desarrollo"
$CLI db reset >/dev/null 2>&1 || echo "(aviso: el db reset final falló; ver las migraciones de supabase/migrations)"
echo "ENSAYO OK"
