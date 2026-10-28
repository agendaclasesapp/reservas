# Migración de producción a varios profesores (CR-002, ADR-021, ADM-01, NFR-09)

Para el operador. Sin valores secretos ni datos personales en este documento: el mail del profesor y el del
Administrador se escriben a mano en el SQL Editor y no pasan por el repositorio, las variables de GitHub ni los logs.

La migración va en **dos fases** (ADR-021): **expandir** (B14: crea el modelo nuevo y deja las columnas viejas sin
uso) y **contraer** (B15: borra lo viejo). Este documento cubre la expansión (§1 a §4), el alta definitiva del
profesor actual y la contracción (§5); la contracción se hace en un despliegue aparte.

## 1. Antes de empezar

| Condición | Cómo se comprueba |
| --- | --- |
| La expansión terminó su revisión (QA y SecDevOps de B14) y el pull request está en verde | checks `secretos`, `calidad`, `bd`, `workflows`, `codeql` |
| El ensayo local de la expansión y de la vuelta atrás pasa con el código que se va a desplegar | `bash ops/vuelta-atras/ensayar.sh` termina con `ENSAYO OK` (§6) |
| Hay un solo profesor, con mail, vinculado a su cuenta | consulta 1 de §2 |
| El profesor está avisado | elegir un horario sin uso (ver §3, paso 1) |

**Orden con los bolts siguientes.** `supabase-deploy.yml` corre `db push` **sin** `--include-all`: rechaza una migración
con número menor que la última aplicada. Por eso B14 y B15 (la contracción incluida) llegan a producción **antes**
que cualquier migración `2026110006*` o posterior (B06 en adelante). Nunca se despliega B06 con B14 o B15 sin aplicar.

**Tramos y etiquetas (H-330).** Hoy B14, B15 y B06 están en el árbol sin commitear por bolt. Antes de desplegar, el
orquestador arma con el humano un commit por tramo y le pone una etiqueta; **cada tramo se despliega desde su
etiqueta** (Run workflow > «Use workflow from» > la etiqueta; la web, el commit de esa etiqueta en `main`), nunca
desde un árbol que traiga cambios de tramos posteriores. Orden fijo:

| # | Tramo | Etiqueta propuesta | Migraciones que `db push --dry-run` debe listar, **exactamente** | Web |
| --- | --- | --- | --- | --- |
| 1 | B14 (expansión) | `prod-b14` | `202611000510`, `0511`, `0512`, `0513`, `0520`, `0521`, `0522`, `0523`, `0524`, `0525` (10) | la de B14 |
| 2 | B15 sin contracción | `prod-b15a` | `202611000526`, `0530`, `0531` (3) | la de B15 |
| 3 | Contracción, tras el humo de §5.1 | `prod-b15b` | `202611000539` (1) | la misma de B15 |
| 4 | B06 en adelante | `prod-b06` | `202611000601` a `0604` (y las que sigan) | la de B06 |

Si el dry-run lista una migración de más o de menos que su fila, **no se aprueba**: se revisa de qué commit salió.
Un tramo no se despliega hasta que el anterior tenga su humo en verde. La contracción **no** se junta con el alta
(§5.1 va antes de §5.2); si B14 y B15 salieran juntos con la contracción, la vuelta atrás es solo el dump (§6.3).

## 2. Respaldo previo (fuera del repositorio)

`supabase-deploy` ya adjunta un volcado `--schema-only` como artefacto (DEC-19), pero **no tiene datos**. El respaldo
con datos tiene datos personales: va en una carpeta **fuera del clon** y de cualquier carpeta sincronizada con la nube
pública.

    mkdir -p ../respaldo-rtc
    npx supabase@2.121.0 link --project-ref rmokypmznhobapyghfpi        # pide la contraseña de la base
    npx supabase@2.121.0 db dump --linked -f ../respaldo-rtc/esquema-AAAAMMDD.sql
    npx supabase@2.121.0 db dump --linked --data-only -f ../respaldo-rtc/datos-AAAAMMDD.sql

Requiere Docker en marcha. Comprobar que ambos archivos no están vacíos y que `datos-*.sql` menciona `public.alumno`.
No se sube a GitHub, no se adjunta a un issue ni se manda por mail.

Consultas de solo lectura en el SQL Editor, antes de desplegar. **Anotar los resultados** (se comparan en §3, paso 5):

    -- 1. Debe dar una fila: 1 profesor, con mail y vinculado (1, 1, 1). Si el mail es null, la migración aborta (P0004).
    select count(*) as profesores, count(mail) as con_mail, count(user_id) as vinculados from public.profesor;
    -- 2. Alumnos por estado (anotar)
    select estado, count(*) from public.alumno group by estado order by estado;
    -- 3. Mails de alumno repetidos entre no borrados: debe dar 0 filas (si no, la migración aborta con P0004)
    select lower(mail), count(*) from public.alumno
     where mail is not null and estado <> 'borrado' group by 1 having count(*) > 1;
    -- 4. Cantidades a conservar (anotar)
    select (select count(*) from public.reserva) as reservas, (select count(*) from public.clase) as clases,
           (select count(*) from public.persona_a_cargo) as personas_a_cargo, (select count(*) from public.mail_salida) as mails;

**Base nueva (sin puesta en marcha).** Si la fila de `profesor` de B01 no tiene mail y no tiene datos, la migración la
borra con su grilla semilla; si no tiene mail pero tiene datos (alumnos, reservas, clases, mails), aborta con `P0004`:
hay que correr `privado.configurar_profesor` antes de migrar (decisión del Arquitecto, ADR-018 «Ajustes de T14.1»).

## 3. Despliegue de B14 (ADR-021, decisión 4)

Se despliega primero la base y enseguida la web: con la base nueva y la web vieja, la agenda pública vieja sigue andando
por las funciones de transición (`config_publica()` y `agenda_publica(p_dia)`, que delegan en el único profesor);
con la web nueva y la base vieja no anda nada. `web.yml` publica en cuanto algo llega a `main`, así que:

1. **Aviso al profesor.** Elegir un horario sin uso. Una sesión abierta con la web vieja puede mostrar el error de
   sesión hasta recargar la página; se le avisa.
2. **Respaldo** y consultas de §2.
3. **Base.** Actions > `supabase-deploy` > Run workflow. Camino recomendado: lanzarlo **desde la rama del pull
   request** (campo «Use workflow from»), con el pull request en verde y **antes** de fusionarlo. Si el environment
   `produccion` solo admite `main`, fusionar y lanzar `supabase-deploy` de inmediato (la web tarda unos minutos en
   publicar; hacerlo en el horario sin uso). Como revisor del environment, mirar antes de aprobar:
   - `db push --dry-run`: debe figurar exactamente la fila 1 de la tabla de §1 (`202611000510` a `0513` y `0520` a `0525`) y **ninguna** `0526`, `0530`, `0531`, `0539` ni `2026110006*`; se despliega desde `prod-b14`;
   - el artefacto `esquema-previo` (solo estructura);
   - el diff de configuración: **no se espera ninguno**. La guardia (`config-permitida.json`) detiene el despliegue si
     aparece un campo no permitido. El nombre del remitente de Auth no viaja por `config push` (ver `ops/mails.md`).
   `db push` aplica cada migración en su propia transacción, con las comprobaciones de ADR-021 adentro (`P0004`): si
   una falla, **no queda nada a medias** y el despliegue se detiene; corregir y volver a lanzar (no es vuelta atrás).
4. **Web.** Fusionar el pull request (o, si ya se fusionó, esperar el run de `web.yml`): jobs `publicar` y
   `verificar-publicado` en verde.
5. **Comprobar los datos** (SQL Editor, solo lectura):

        select slug, slug_provisional, activo, user_id is not null as vinculado from public.profesor;
        select estado, count(*) from public.alumno group by estado order by estado;
        select estado, count(*) from public.inscripcion group by estado order by estado;

   Esperado: una fila de profesor con `slug = p-<8 primeros hex del id>`, `slug_provisional = true`, `activo = true`,
   `vinculado = true`; la suma de inscripciones es la cantidad de alumnos que estaban `pendiente`, `aprobado`,
   `rechazado` o `sin_cuenta` en la consulta 2 de §2; `alumno.estado` solo muestra `ficha_incompleta`, `completa` y
   `borrado`. Reservas, clases, personas a cargo y mails: las cantidades de la consulta 4.
6. **Administrador** (operador, SQL Editor o `psql` con el pooler de sesión):

        select privado.configurar_administrador('<mail del Administrador>');

   Es idempotente; hay una sola fila (otro mail reemplaza al anterior). Falla con 409 `MAIL_YA_REGISTRADO` si ese
   mail es el de una persona con ficha completa (el Administrador no es alumno, DEC-31). El usuario queda vinculado al
   **primer ingreso con el mail confirmado**; el mail no se escribe en el repositorio.
7. **Humo** (§4).
8. **Alta definitiva y contracción** (B15, §5) en un despliegue aparte, solo con la web de B14 publicada y el humo en verde.

## 4. Humo con el slug provisional

El enlace del profesor es `https://agendaclasesapp.github.io/reservas/#/p/<slug provisional>` (el slug sale de la
consulta del paso 5). Marcar cada punto:

- [ ] La agenda pública del enlace carga con el nombre del profesor y sus horarios (AGE-09).
- [ ] El profesor ingresa con su cuenta de siempre (su `user_id` no cambió) y ve su agenda y la misma cantidad de
      alumnos por estado que antes.
- [ ] Un alumno aprobado ingresa, ve sus clases y reserva una clase de prueba; el profesor la ve.
- [ ] El Administrador ingresa y llega a `#/admin` (con B15 también lista y da de alta profesores).
- [ ] Un mail de prueba (alta de clase o respuesta a una cuenta) llega con el **nombre del profesor** como remitente
      y su mail en «Responder a»; el código de ingreso llega con el **nombre del servicio** (AVI-07, `ops/mails.md`).
- [ ] `keepalive` manual en verde (`public.ping` sigue ahí).
- [ ] Sin errores nuevos en Logs > Postgres y en Edge Functions > `enviar-mail` del panel.

Hasta B15, para dar de alta otro profesor el operador usa
`select privado.configurar_profesor('<mail>', '<nombre>', '<slug>');` (devuelve el id).

## 5. Alta definitiva del profesor actual y contracción (B15, ADR-021 decisiones 5 y 6)

Precondiciones: B14 desplegada, web de B14 publicada y el humo de §4 en verde. Nada de B06 (`2026110006*`) está
desplegado todavía.

### 5.1 Alta del profesor actual (ADM-01, ADM-02)
1. **`url_sitio` en Vault** (SQL Editor, una vez; `ops/mails.md`), para que el mail de alta lleve el enlace completo:

        select vault.create_secret('https://agendaclasesapp.github.io/reservas/', 'url_sitio');

2. **Migraciones de B15 sin contracción**, desde la etiqueta `prod-b15a` (§1). `supabase-deploy` (como en §3, paso 3).
   El `db push --dry-run` debe listar **exactamente** `202611000526`, `202611000530` y `202611000531`, y **no**
   `202611000539` ni `2026110006*`: la contracción va aparte (§5.2). Después, publicar la web de B15.
3. **Antes del alta, leer la fila provisional** (SQL Editor, solo lectura; H-331):

        select id, slug, slug_provisional, mail, activo, user_id is not null as vinculado from public.profesor;

   Tiene que haber **una** fila, con `slug_provisional = true`, `vinculado = true` y el **mail del profesor actual**.
   Ese es el mail que se escribe en el alta: `alta_profesor` solo adopta la fila provisional si el mail coincide. Si el
   mail que se iba a escribir no es el de esa fila, no dar el alta y aclararlo con el humano.
4. **Alta.** El Administrador ingresa a `#/admin` > Alta con el **mail del profesor actual** (el vinculado), su nombre
   (público) y el **slug definitivo** (minúsculas, números y guiones; no reservado). `alta_profesor` adopta la fila de
   slug provisional: responde `adoptado: true` y conserva id, `user_id`, agenda y alumnos. Errores: 422 slug inválido
   o reservado, 409 `SLUG_YA_USADO`. El profesor recibe el mail de alta con su enlace.

   **Si responde `adoptado: false`**, el alta creó un profesor **nuevo** y la fila provisional con los alumnos quedó
   sin adoptar. **Parar** ahí: no dar más altas, no repartir el enlace, no ejecutar la contracción. **Inactivar** el
   profesor nuevo (`update public.profesor set activo = false where id = '<id del nuevo>';`) y decidir con el humano.
   **No borrar nada** (ni la fila nueva ni la provisional).
5. **Comprobar** (SQL Editor, solo lectura):

        select slug, slug_provisional, activo, user_id is not null as vinculado from public.profesor;

   Esperado: una sola fila; `slug` el definitivo, `slug_provisional = false`, `activo = true`, `vinculado = true`; y las cantidades de
   alumnos, inscripciones, reservas y clases iguales a las de §2.
6. **Aviso.** El enlace provisional `#/p/p-<hex>` **deja de valer**: avisar al profesor y a sus alumnos antes de repartir
   el nuevo (el del mail de alta).
7. **Humo con el slug definitivo** (repetir §4 con el enlace nuevo): la agenda pública del enlace nuevo carga; el
   profesor ingresa con su cuenta y ve la misma cantidad de alumnos; el Administrador ve en `#/admin` la lista con
   enlace y estado (y ningún alumno); un alumno reserva; mail de prueba; `keepalive`; sin errores nuevos en los logs.

### 5.2 Contracción (`202611000539`)
Borra: `config_publica()` y `agenda_publica(p_dia)` sin slug; `privado.unico_profesor()`; `configurar_profesor` de dos
argumentos; las columnas `alumno.profesor_id`, `alumno.motivo_estado`, `alumno.aprobado_en`, `alumno.como_llego` y
`persona_a_cargo.profesor_id`; y los índices `public.alumno_telefono_clave` y `public.alumno_ficha_completada_en`.
**La inversa de §6.2 (`inversa-b14.sql`) deja de servir después de esto** (el archivo lo dice en su primer comentario):
desde la contracción la **única** vuelta atrás es el dump con datos previo (§6.3).

Se aplica **solo si** se cumplen las cuatro:
- la web de B14 está publicada (`verificar-publicado` en verde): la web vieja usa las funciones que se borran;
- el humo de §5.1, paso 7, está en verde;
- el tramo sale de la etiqueta `prod-b15b` y el dry-run lista solo `202611000539`;
- ninguna migración `2026110006*` se desplegó antes: `db push` sin `--include-all` rechaza una migración con número
  menor que la última aplicada, y `202611000539` es menor que `2026110006*`. La contracción va **siempre antes**.

Pasos:
1. Respaldo nuevo (§2): es el único camino de vuelta.
2. `supabase-deploy` desde la etiqueta `prod-b15b`, con `202611000539` como única migración pendiente (no lanzarlo
   desde un árbol que traiga B06).
3. Como revisor mirar que el `db push --dry-run` liste **solo** `202611000539`.
4. Si **aborta con `P0004`**: no aplica nada (corre en su transacción). **No forzar**: no editar la migración ni
   vaciar columnas a mano. Revisar con el humano qué datos quedan en las columnas viejas (por ejemplo `alumno.profesor_id`
   o `persona_a_cargo.profesor_id` que no coinciden con `inscripcion` ni con la fila adoptada) y escalar antes de reintentar.
5. Comprobar (solo lectura): las dos consultas dan 0 filas y `to_regprocedure` da null;

        select table_name, column_name from information_schema.columns where table_schema = 'public'
         and ((table_name = 'alumno' and column_name in ('profesor_id','motivo_estado','aprobado_en','como_llego'))
           or (table_name = 'persona_a_cargo' and column_name = 'profesor_id'));
        select indexname from pg_indexes where schemaname = 'public'
         and indexname in ('alumno_telefono_clave','alumno_ficha_completada_en');
        select to_regprocedure('privado.unico_profesor()');

   Repetir el humo de §5.1 paso 7 y `keepalive`.
6. Recién entonces se arma `prod-b06` y se despliegan B06 y los bolts siguientes.

## 6. Vuelta atrás

### 6.1 Cuándo se vuelve atrás y con qué

| Situación | Qué hacer |
| --- | --- |
| `db push` aborta (por ejemplo `P0004`) | No hay nada que deshacer: cada migración corre en su transacción. Leer el error, corregir y relanzar. |
| Aplicada la expansión, falla el humo por los **datos** (cantidades que no cuadran, el profesor no ingresa, estados mal) y la contracción **no** se aplicó, con un solo profesor | **Migración inversa** (§6.2). |
| Falla solo la **web** (la base está bien) | Revertir el commit de la web en `main`: `web.yml` publica la versión anterior. Mientras tanto la agenda pública vieja funciona por las funciones de transición; el resto de la web vieja no, así que no dejarlo así. |
| Hay **más de un profesor** (ya se dio de alta otro) | La inversa **no corre** (aborta con `P0004`): solo el dump (§6.3). Decidir con el humano. |
| Ya se aplicó la contracción de B15 (§5.2) o B14 y B15 salieron juntos con ella | Solo el dump (§6.3). **`inversa-b14.sql` no se corre**: ya no sirve. |

### 6.2 Migración inversa (`ops/vuelta-atras/`)

**Solo antes de la contracción `202611000539`** (después no sirve; el archivo lo advierte en su primer comentario). `inversa-b14.sql` deja la base como B05 (RLS, funciones, vistas, triggers, permisos y datos). Lo que **se pierde**: las
inscripciones `baja` pasan a `rechazado`; los mails sin profesor (de la aplicación) se borran; `remitente_nombre` y
`responder_a` de los mails; el slug; el Administrador; lo creado por B14 que B05 no tiene (columnas y tablas nuevas);
las fichas de personas sin inscripción pasan a `pendiente` del único profesor. Las altas hechas entre la expansión y la
vuelta atrás se conservan como alumnos del único profesor.

1. **Respaldo nuevo** (§2), aunque ya haya uno de antes de la expansión.
2. **Web primero**: revertir en `main` el commit de B14 y esperar `web.yml` en verde (con la base de B05, la web de
   B14 no funciona).
3. Correr la inversa con la cadena del pooler de sesión (Settings > Database > Connection string > Session pooler;
   la contraseña no va en la línea de comandos):

        psql "<cadena del pooler de sesión>" -v ON_ERROR_STOP=1 -f ops/vuelta-atras/inversa-b14.sql

   Corre en **una transacción**: si falla, no cambia nada. También sirve pegarla en el SQL Editor. Al final borra las
   versiones `20261100051*` y `20261100052*` de `supabase_migrations.schema_migrations`, para que `db push` no se
   queje de versiones remotas que ya no están en el repositorio.
4. **Comprobar**: `select * from public.profesor;` (una fila, sin `slug`), `select estado, count(*) from public.alumno
   group by 1;` (los estados de B05 con las cantidades de §2), humo de B05 (ingreso del profesor, de un alumno, agenda
   pública) y `keepalive` manual.
5. **No relanzar `supabase-deploy`** con la expansión hasta corregirla, ensayar de nuevo (§7) y revisar.

### 6.3 Solo el dump

No hay recuperación a un punto en el tiempo en Supabase Free. La vuelta atrás con el dump es una restauración completa
y destructiva: se decide con el humano, se hace en horario sin uso y se **ensaya primero en una base local**
(`supabase db reset` + `psql -f` de `esquema-*.sql` y de `datos-*.sql`). En producción: vaciar los esquemas `public` y
`privado`, aplicar `esquema-*.sql`, luego `datos-*.sql`, y volver a cargar a mano lo que no viaja en el dump (secretos
y Vault, `ops/mails.md`). Esta restauración **no se ensayó** en T14.6: el ensayo cubre la inversa.

## 7. Ensayo local (cómo se probó y cómo se repite)

    bash ops/vuelta-atras/ensayar.sh      # desde la raíz; destruye la base local (db reset)

Con Docker y la CLI `supabase@2.121.0`. Hace, en este orden:

1. `db reset --version 202611000504 --no-seed` (B05) y carga `supabase/tests/14_t1_ensayo_datos_b05.sql`: el profesor
   configurado y vinculado y 7 alumnos en todos los estados de B05, con persona a cargo, reserva, clase y mail.
2. Foto A (catálogo `pg_dump -s` de `public` y `privado` y datos).
3. Aplica las migraciones `20261100051*` y `20261100052*`, cada una en su transacción y registrando la versión como
   lo hace `db push`.
4. `supabase/tests/14_t1_ensayo_migracion.test.sql` (la expansión no perdió nada).
5. Corre `ops/vuelta-atras/inversa-b14.sql`.
6. Foto B: el catálogo (con permisos) y los datos tienen que ser **idénticos** a la foto A, y el registro de migraciones
   no puede quedar con versiones de la expansión.
7. Pasada sin datos: las pruebas pgTAP de B01 a B05 (las de `HEAD`) dan lo mismo contra «B05 puro» que contra «B05 →
   expansión → inversa». Sin `seed.sql` no hay reloj de prueba (ADR-014): 22 pruebas fallan igual en ambas; lo que se
   exige es que sean las mismas.
8. `db reset` final.

**Se repite** cada vez que cambia una migración `20261100051*` o `20261100052*`, y siempre antes de desplegar.
Si cambia la lista de objetos de B05 hay que regenerar la inversa (`ops/vuelta-atras/README.md`).
