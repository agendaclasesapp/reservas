# Migración de producción a varios profesores (CR-002, ADR-021, ADM-01, NFR-09)

Para el operador. Sin valores secretos ni datos personales en este documento: el mail del profesor y el del
Administrador se escriben a mano en el SQL Editor y no pasan por el repositorio, las variables de GitHub ni los logs.

La migración va en **dos fases** (ADR-021): **expandir** (B14: crea el modelo nuevo y deja las columnas viejas sin
uso) y **contraer** (B15: borra lo viejo). Este documento cubre la expansión; la contracción tiene sus pasos en B15
(T15.5) y se hace en un despliegue aparte.

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
Se puede desplegar B14 solo (con contracción aparte, tras el humo) o B14 y B15 juntos; en este último caso la
contracción sale en el mismo push y la vuelta atrás es solo el dump (§6.3).

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
   - `db push --dry-run`: deben figurar las migraciones `202611000510` a `20261100052x` y **ninguna** `2026110006*`;
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
8. **Contracción** (B15) en un despliegue aparte, solo con la web de B14 publicada y el humo en verde.

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

## 5. Alta definitiva del profesor actual (B15, ADR-021 decisión 5)

El Administrador lo da de alta en `#/admin` con su mail, nombre y **slug definitivo**: `alta_profesor` adopta la fila
`slug_provisional` y conserva id, `user_id`, agenda y alumnos. **El enlace provisional deja de valer**: avisar al
profesor y a sus alumnos antes de repartir el nuevo.

## 6. Vuelta atrás

### 6.1 Cuándo se vuelve atrás y con qué

| Situación | Qué hacer |
| --- | --- |
| `db push` aborta (por ejemplo `P0004`) | No hay nada que deshacer: cada migración corre en su transacción. Leer el error, corregir y relanzar. |
| Aplicada la expansión, falla el humo por los **datos** (cantidades que no cuadran, el profesor no ingresa, estados mal) y la contracción **no** se aplicó, con un solo profesor | **Migración inversa** (§6.2). |
| Falla solo la **web** (la base está bien) | Revertir el commit de la web en `main`: `web.yml` publica la versión anterior. Mientras tanto la agenda pública vieja funciona por las funciones de transición; el resto de la web vieja no, así que no dejarlo así. |
| Hay **más de un profesor** (ya se dio de alta otro) | La inversa **no corre** (aborta con `P0004`): solo el dump (§6.3). Decidir con el humano. |
| Ya se aplicó la contracción de B15 (o B14 y B15 salieron juntos) | Solo el dump (§6.3). |

### 6.2 Migración inversa (`ops/vuelta-atras/`)

`inversa-b14.sql` deja la base como B05 (RLS, funciones, vistas, triggers, permisos y datos). Lo que **se pierde**: las
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
