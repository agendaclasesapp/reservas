---
titulo: Técnica · Calendario del profesor (RPC y decisiones ADR-023..026)
version: 0.5
fecha: 2026-10-31
publico: equipo técnico
---
# Calendario del profesor: contrato y decisiones

> **En construcción.** Ciclo `calendario-profesor` (bolts B16 a B23). **Construido y aprobado (G2): B16** (la RPC `agenda_profesor_dias` y el lector `leerAgendaDias`) **B17** (el Panel abre en el calendario del día), **B18** (acciones del calendario Día) **y B19** (responder solicitudes y copiar el enlace del día; revisión del Arquitecto: conforme). B20 a B23 siguen planificados. Los ADR figuran como «propuesta» salvo ADR-023 (B16), ADR-024 (parcial, B17) y ADR-025 (construida en B19). El resto de los contratos (`agenda_profesor(p_dia)`, `agenda_publica`, `contadores`, `crear_clase`, `mover_clase`, `cancelar_clase`, `bloquear`, `desbloquear`, `responder_solicitud`) no cambia (INV-01, INV-03).

## Componentes afectados
- `bd-agenda`: RPC nueva y función interna, en la migración aditiva `supabase/migrations/202611001601_agenda_profesor_dias.sql` (B16, construida). Debe estar aplicada en producción antes de publicar la web de B17 (expandir primero).
- `web-panel`: pasa de la lista de un día a un calendario Día/Semana (`src/modulos/panel`). `src/modulos/lista` y `src/ui` no se tocan.

## RPC `public.agenda_profesor_dias(p_desde date, p_hasta date)` (ADR-023, construida en B16)
Devuelve la agenda del profesor de la sesión para cada día de `p_desde` a `p_hasta`, con el mismo cálculo que `agenda_profesor(p_dia)`: `privado.agenda_profesor_dias(p_profesor, p_desde, p_hasta)` recorre `generate_series` con un `lateral` sobre `privado.agenda_profesor`, sin copiarla.

- **Límites (SEC-09):** `p_desde` entre hoy − 366 y hoy + 366; `p_desde <= p_hasta <= p_desde + 6` (1 a 7 días) y `p_hasta <= hoy + 366`, en el huso del profesor con `app_ahora()`. La web pide solo los días visibles dentro del rango (1, 3 o 7) y recorta en el borde (DEC-45 A).
- **Salida (17 columnas, ni una más, SEC-34):** las 13 columnas de `agenda_profesor` más `dia` (date), `clase_inicio` y `clase_fin` (`timestamptz`, inicio y fin reales de la clase; nulos sin clase) y `solicitud_tipo` (`reserva`, `movimiento`, `cancelacion`; nulo sin solicitud). Orden por `dia`, `inicio`, `clase_id`.
- **Cómo lee la web:** una clase que cubre varios huecos llega en varias filas con el mismo `clase_id` y se dibuja una vez; un bloqueo largo llega repetido por hueco. `clase_estado = pendiente` con `solicitud_tipo` reserva o movimiento es PENDIENTE respondible; `confirmada` con `cancelacion` es CONFIRMADA con «Cancelación pendiente»; `confirmada` con `movimiento` es el origen, sin acciones (H-371). Canceladas y rechazadas no salen.
- **Errores:** 401 `NO_AUTENTICADO` o `42501` (sin sesión), 403 `PROHIBIDO` (no es profesor), 422 `DATOS_INVALIDOS` con `campo` `p_desde` o `p_hasta`. No exige profesor activo (INV-05).
- **Seguridad (INV-02, SEC-04):** la pública es `security definer`, `set search_path = ''`, y toma el profesor de `privado.profesor_de_lectura()`, nunca de un parámetro; la interna filtra todo por `p_profesor`; `revoke` a `public` y `anon`, `grant` a `authenticated`. Pruebas: `lista_rpc/16.txt` y `matriz/16.ts`.

### Lector `leerAgendaDias(desde, hasta)` (web-panel, B16)
En `src/modulos/panel/logica/agendaDias.ts`, exportado por `index.ts` con `ErrorAgendaDias`, `esquemaFilaAgendaDias`, `FilaAgendaDias`, `TIPOS_SOLICITUD` y `MAX_DIAS_AGENDA = 7`. Es la base de lectura del calendario Día y Semana de B17 y B20.
- Un rango inválido (día mal formado, `hasta < desde`, más de 7 días) no sale a la red.
- Valida cada fila con zod; una columna extra se descarta. Ante forma inválida o error desconocido da el mensaje genérico (H-464, SEC-35).
- Todo fallo se lanza como `ErrorAgendaDias` con `codigo` y `mensaje` del catálogo `src/lib/errores.ts`, sin `details`, filas ni `console` (SEC-17); `mensajeDeError(e)` da el mismo texto.

### Verificación de B16
pgTAP `16_agenda_profesor_dias.test.sql` (62 casos), integración `agenda-dias.test.ts` (12) y matriz `16.ts` (343 casos de la matriz de roles en total), más 21 pruebas unitarias del lector; todo en verde. `00_catalogo.test.sql` sincronizado con `lista_rpc/16.txt` (SEC-04). Rendimiento en local de la llamada de 7 días: mediana 28 ms (umbral 500 ms); la medición con carga queda para B23. Fuentes: handoffs de B16 (developer T16.1, tester T16.2).

## Decisiones (resumen; detalle en `.aidlc/calendario-profesor/arquitectura/adr/`)
| ADR | Decisión | Estado |
| --- | --- | --- |
| ADR-023 | Una RPC de 1 a 7 días en lugar de siete llamadas; el calendario y «Ver como lista» usan esta lectura, y tras una acción se relee el rango visible | construida en B16 (propuesta hasta su aceptación formal) |
| ADR-024 | **B17 construyó el eje y los bloques; la adenda A-1..A-4 se aplica en B18.** La grilla del eje sale de `leerConfiguracionAgenda()`, leída una vez al montar el Panel. La geometría vive en `panel/logica/eje.ts` en el huso del profesor; el eje se amplía para cubrir clases fuera de la grilla (DEC-44 A) y el alto de la hora se adapta con duraciones menores de 30 min (DEC-50 A). Lo tocable lo decide la agenda (hueco `libre` y no `pasada`), no la grilla | construida en parte (B17); adenda A-1..A-4 vigente, a aplicar en B18 |
| ADR-025 | El Panel tiene su propio diálogo de respuesta de solicitudes, con textos y reglas importados de `lista/logica` (mismo RPC `responder_solicitud`, mismo mail). Se responde el PENDIENTE de una reserva o del destino de un movimiento y la CONFIRMADA con cancelación pendiente (DEC-42 A, DEC-43 A, firmadas el 03/11/2026) | construida en B19 (anexo de consecuencias pendiente, P-2) |
| ADR-026 | Arrastre con Pointer Events, solo mouse y desde 60 rem, con umbral de unos 4 px; las reglas viven en `panel/logica/arrastre.ts` y mueven con la misma RPC `mover_clase`. Deslizamiento de la ventana de 3 días con táctil (al menos 48 px y el doble que el vertical, `touch-action: pan-y`). Sin librería nueva | propuesta |

## B17: el Panel abre en el calendario del día (construido y aprobado)
- **Dirección** (`panel/logica/vistaCalendario.ts`, CAL-02): `#/panel?v=dia|semana&d=AAAA-MM-DD`. Sin parámetros abre Día de hoy; `?d=` solo abre Día de ese día; un `v` o `d` inválido, o un día fuera de hoy ± 366, abre Día de hoy. `v=semana` abre Día hasta B20. «Ver como lista» es estado local y no va en la dirección (DEC-47).
- **Eje** (`panel/logica/eje.ts`, CAL-04, DEC-44 A, DEC-50 A): de la hora en punto anterior al primer tramo de la grilla a la posterior al último (08:00 a 18:00 con la grilla inicial), ampliado si una clase o solicitud queda fuera. Con duraciones menores de 30 min el alto de la hora crece para que un hueco mida al menos 44 px.
- **Vistas** (`panel/vistas`): `CalendarioPanel`, `BarraCalendario` (Día anterior / Hoy / Día siguiente, título `dd/mm/aaaa` en un `h2`, flecha fuera de rango deshabilitada con nombre accesible terminado en «, no disponible»), `EjeHoras`, `ColumnaDia`, `BloqueClase` (CONFIRMADA borde sólido, PENDIENTE borde punteado; canceladas y rechazadas no se dibujan) y `AccionesVista` («Ver como lista» / «Ver como calendario»). Se eliminó `SelectorDiaPanel`: **«Elegir día» se perdió en B17 y vuelve en B18** (H-B17-03); no está disponible.
- **Adenda de ADR-024 (A-1..A-4, se aplica en B18):** A-1 sin tramos el eje es 08:00 a 18:00 ampliado por lo visible, y solo se agranda; A-2 el alto de la hora es `min(16,5 rem, max(5,5 rem, 2,75 rem × 60 / duración))`: tope de 16,5 rem (H-472, aceptado el 30/10), con huecos de al menos 44 px hasta 10 min y, debajo, «Ver como lista» como alternativa accesible (excepción a NFR-12/CA-90); A-3 con la configuración en error el eje usa 08:00 a 18:00 ampliado por clases y huecos, sin zonas fuera de tramo, y la duración se infiere del menor hueco libre; A-4 los bloques que se pisan se dibujan en carriles lado a lado. Fuente: `.aidlc/calendario-profesor/arquitectura/adr/ADR-024-grilla-para-el-eje.md`.
- **Flecha de Semana (H-475, firmada el 30/10, se aplica en B20):** la flecha «anterior» se habilita si algún día de la semana anterior entra en el rango de 366 días (lectura de DEC-45 A).
- **Verificación de B17:** confirmada en el navegador (tester T17.3, T17.4) con capturas en `.aidlc/calendario-profesor/calidad/evidencias/ui/WEB-14-dia-*/` y `WEB-16-dia-*/`. Fuentes: handoffs de developer, ux-web, tester, arquitecto y funcional de `bolts/B17-calendario-dia/`.

## B18: acciones del calendario Día (construido; revisión del Arquitecto conforme con observaciones)
- **Lógica** (`panel/logica`): `elementosCalendario.ts` arma los elementos del día (clases, bloqueos, huecos libres, zonas fuera de la grilla) y `eje.ts` calcula la geometría. Adenda de ADR-024 aplicada: **A-2** el alto de la hora no pasa de 16,5 rem y con duraciones menores de 10 min un hueco puede medir menos de 44 px (alternativa «Ver como lista», H-472, CA-83); **A-3** con la configuración en error o sin cargar no se sombrea nada fuera de la grilla, el eje va de 08:00 a 18:00 ampliado por lo leído y los huecos futuros siguen tocables (H-474); **A-4** los elementos que se pisan por el alto mínimo de 44 px van lado a lado en la columna, en orden horario (H-473).
- **Vistas** (`panel/vistas`): `HuecoLibre`, `BloqueBloqueo`, `DetalleCalendario` (diálogo por debajo de 60 rem, columna en escritorio), `LeyendaCalendario`, `AyudaCalendario`, `AccionesVista`; fuera de la grilla y huecos pasados no se tocan. Las acciones (crear, mover, cancelar, desbloquear) usan las mismas RPC y reglas que la lista (INV-01, INV-05: con la agenda inactiva se deshabilitan crear y mover y cancelar sigue).
- **«Elegir día»** (H-B17-03): vuelve a `BarraCalendario`; cambia `d=` en la dirección y rechaza lo que sale de hoy ± 366.
- **Flecha de Semana (DEC-45 A, H-475):** se habilita si algún día queda dentro de hoy ± 366 y lleva al primer día dentro; se aplica en B20.
- **Verificación:** E2E en chromium (escritorio y 360 px) con capturas en `.aidlc/calendario-profesor/calidad/evidencias/ui/WEB-14-acciones-*`; H-B18-T01 (E2E de B17 desactualizadas) corregido. H-B18-T02 abierto por entorno (sin `docker`, dos pruebas de integración de mails no corren).
- **Revisión del Arquitecto:** conforme con observaciones, sin bloqueos; abiertos H-490 (geometría por dos caminos, B20), H-491 (`motivoSinGestion` compartida con la lista, B19) y H-492 (`panel/logica/index.ts`). Fuente: handoffs de B18 en `bolts/B18-calendario-acciones/` e `informe-arquitecto.md`.

## B19: responder solicitudes y copiar el enlace del día (construido; revisión del Arquitecto conforme)
- **Respuesta** (`panel/logica/respuesta.ts`, ADR-025, CAL-08, CAL-12): adaptador fino sobre `responderSolicitud`, `accionesSolicitud`, `esquemaMotivo`, `LARGO_MAX_MOTIVO` y `MENSAJES_RESPUESTA`, importados de `lista/logica/index.ts` sin cambiarlos (INV-04). Mismo RPC `responder_solicitud` y mismo mail que la Lista. No lanza y los errores pasan por `traducirError` (SEC-17).
  - `solicitudDeBloque(bloque)` y `solicitudDeFila(fila)` devuelven `{ id, tipo, claseId }` o `null`. Hay solicitud para el PENDIENTE de una reserva, para el destino PENDIENTE de un movimiento (DEC-42 A) y para la CONFIRMADA con cancelación pendiente (DEC-43 A); el origen CONFIRMADO de un movimiento da `null` (H-371). Se decide por `estado` y `solicitud_tipo` de `agenda_profesor_dias` (ADR-023); `cancelacionPendiente` es solo presentación (N-2).
  - `accionesRespuesta(activo)` y `puedeConfirmar(activo)` equivalen a `accionesSolicitud({ vencida: false }, activo)`: la agenda solo trae solicitudes no vencidas y, si vence con la pantalla abierta, la base responde 409 `SOLICITUD_VENCIDA` (H-B19-03, aceptado).
  - `confirmarSolicitud` y `rechazarSolicitud(s, motivo, { releer })` devuelven `{ ok: true, estado, mensaje }` o el fallo de la Lista más `desactualizada`. Se relee (`agenda.recargar(); contadores.recargar()`) tras un ok y tras `SOLICITUD_YA_RESPONDIDA`, `SOLICITUD_VENCIDA` o `NO_ENCONTRADO` (`CODIGOS_RESPUESTA_DESACTUALIZADA`, que repite a propósito el conjunto de `lista/vistas/SolicitudesPendientes.tsx`: H-B19-02, atar ambos en B22). El motivo es opcional, de hasta 500 caracteres; vacío va como `null`.
- **Enlace del día** (`panel/logica/enlaceDia.ts`, CAL-20, SEC-16, SEC-36): `enlaceDia(slug, dia)` devuelve `enlaceDeProfesor(slug)` (el mismo que copia Configuración) seguido de `?d=<encodeURIComponent(dia)>`, o `null` si el slug no cumple ADM-02 tal cual (`normalizarSlug(slug) === slug`, de `src/estado`, sin corregirlo) o el día no pasa `esDia`. `useEnlaceDia(dia)` usa el slug de la sesión; `copiarEnlaceDia(enlace)` devuelve `'ok'` o `'fallo'` y por defecto usa `copiarTexto` de Configuración.
- **Vistas** (`panel/vistas`): `ResponderSolicitud`, `RechazoSolicitud` y `solicitud.ts`; `AccionesVista` suma «Copiar enlace de este día» y `AccionesPanel.responder?` llega por props desde `PaginaPanel` (sin `responder`, todo queda como antes de B19). Las vistas usan `FilaAgendaDias` para no perder `solicitud_tipo` (H-B19-01, corregido: si el campo se pierde, falla `tsc`). Sin cambios en `lista`, `agenda`, `mis-clases`, `src/ui`, `src/lib` ni `supabase` (diff vacío; CA-86 rama Lista).
- **Observaciones abiertas del Arquitecto (bajas):** H-B19-A03 (el filtro `estado !== 'ocupado' || pasada` vive en `vistas/solicitud.ts` y debería pasar a `solicitudDeFila`), H-B19-A04 (la marca «Cancelación pendiente» se deriva dos veces, en `ListaAgendaProfesor` y en `BloqueClase`), H-B19-A05 (`hayEnlace` y `enlace` de `AccionesVista` pueden contradecirse) y H-B19-A06 (`solicitudDeBloque` no tiene consumidor hasta B20). Pendientes del Arquitecto: P-1 (actualizar la ficha `web-panel`) y P-2 (anexo de consecuencias en ADR-025).
- **Verificación:** unitarias `respuesta.test.ts` (17), `enlaceDia.test.ts` (12) y `Solicitudes.test.tsx`; suite del Panel 410 en verde. E2E `calendario-solicitudes.spec.ts` 7 de 7 en chromium (escritorio) y la E2E completa de chromium en verde (212 y 1 omitida); integración de mails con Docker 13 de 13. Para la E2E se subió `email_sent` de 30 a 1000 en `supabase/config.toml` (solo base local; PREG-001 aprobada por el humano). No medido: contraste de «Cancelación pendiente», teclado y lector, rechazo a 360 px (B22). Fuentes: handoffs de developer, tester, QA y arquitecto de `bolts/B19-solicitudes-enlace/` e `informe-arquitecto.md`.

## Bolts
B16 lectura de varios días (hecho); B17 Día (hecho) (dirección, navegación, eje, bloques); B18 Día (huecos, bloqueos, detalle, acciones) (hecho); B19 responder solicitudes y copiar enlace (hecho); B20 Semana, hoy y lista agrupada; B21 arrastre; B22 accesibilidad y celular; B23 rendimiento. Fuente: `.aidlc/calendario-profesor/arquitectura/plan-bolts.md`.

## Orden, numeración y despliegue (B16 a B19 hechos; B20 a B23 planificados)
- Los bolts se numeran B16 a B23 y no B01: con B01 la migración `2026110001*` quedaría antes de la última aplicada (`202611001150`) y `supabase db push` la rechazaría, y `lista_rpc/01.txt` y `matriz/01.ts` ya existen. Si el tablero exige B01 se renumeran los IDs; las rutas `16_*` se quedan.
- Los bolts van en serie: todos los funcionales escriben en `src/modulos/panel/`. B16 es aditivo (no toca tablas, vistas ni RLS) y se aplica en producción antes de publicar la web de B17 (la migración aún no consta como aplicada en producción).
- Cambiar el contrato de la RPC después de B16 pide otra migración y rehacer la lectura de B17 y B20 (ADR-023).
- `src/modulos/lista/` no cambia (CA-86); el diálogo propio del Panel evita tocarlo (ADR-025). `package.json` no cambia: B21 lo comprueba (ADR-026).
- Las opciones de DEC-42..45 y DEC-50 caen en `eje.ts` (B17, B20), el diálogo de respuesta (B19) y la regla de la flecha (B20); ver el funcional.

## Seguridad en el plan (H-461..H-465, SEC-16, SEC-17, SEC-34..37)
El plan de bolts incorpora los hallazgos de SecDevOps, ya corregidos, sin sumar tareas:
- **B16:** `leerAgendaDias` usa el catálogo de `errores.ts` y ante una respuesta de forma inválida o un error desconocido muestra el mensaje genérico, sin `details`, filas ni `console` (T16.1, H-464). pgTAP `16_*` y `agenda-dias.test.ts` comprueban la lista exacta de columnas de la RPC (T16.2, H-462, SEC-34).
- **B17 a B20:** pruebas de vista con texto hostil (`<img src=x onerror=alert(1)>`, `x"><script>`) en `BloqueClase`, `BloqueBloqueo`, `DetalleCalendario`, `ResponderSolicitud`, Semana y lista agrupada: todo texto se ve literal (T17.2, T18.2, T19.2, T20.2, H-461, SEC-16, SEC-35).
- **B19:** el enlace del día valida el slug con la regla de ADM-02 (sin enlace si no la cumple), lo codifica con `encodeURIComponent` y se prueba con slugs hostiles en `enlaceDia.test.ts` (T19.1, H-463, SEC-36).
- **B20:** paso E2E con sesión de A, cierre y sesión de B en la misma pestaña, y búsqueda de `localStorage`/`sessionStorage` en `src/modulos/panel`, con la salida en el informe de QA; es evidencia, no prueba automatizada (T20.3, H-465, SEC-37).
- Las reglas de negocio siguen en la base: arrastre, responder y cancelar llaman a las RPC existentes (SEC-36).

## Plan de pruebas (planificado)
71 casos en `.aidlc/calendario-profesor/calidad/casos/` (`CA.md`, 52 casos T-CA-67-01..T-CA-90-01; `INV.md`, 19 casos). Rendimiento (T-CA-88-01) solo en B23. Riesgo conocido: NFR-10 (Semana en menos de 2 s p95 con 4G) se mide recién en B23; en B16 una llamada de 7 días por encima de 500 ms en local es un hallazgo (ADR-023).

## Bitácora de versiones

| Versión | Fecha | Bolt | IDs | Cambio |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-10-30 | inception | ADR-023..026, CAL-07..09, CAL-12..16, DEC-42..45, DEC-50, INV-02 | Contrato de `agenda_profesor_dias` y resumen de los ADR, en construcción |
| 0.2 | 2026-10-30 | G1 aprobada | ADR-023..026, H-461..H-465, SEC-16, SEC-17, SEC-34..37 | Orden y numeración de bolts, seguridad incorporada al plan y plan de pruebas; todo planificado, nada construido |
| 0.3 | 2026-10-30 | B16 (G2 aprobada) | CAL-07..09, INV-02, INV-03, INV-05, SEC-04, SEC-17, SEC-34, SEC-35, ADR-023 | RPC `agenda_profesor_dias` y lector `leerAgendaDias` pasan a construidos; 17 columnas; verificación de B16; B17 a B23 siguen planificados |
| 0.4 | 2026-10-30 | B17 (G2 aprobada) | CAL-02, CAL-04, CAL-19, ADR-024, DEC-44, DEC-45, DEC-50, H-472, H-475 | Dirección del Panel, eje, bloques, barra y «Ver como lista» construidos; adenda A-1..A-4 de ADR-024 y tope de 16,5 rem (B18); flecha de Semana (B20); «Elegir día» vuelve en B18 |
| 0.5 | 2026-10-31 | B18 (calendario-profesor) | ADR-024, H-472..H-475, H-B17-03, H-490..H-492 | Acciones del calendario Día, «Elegir día», adenda A-2..A-4 aplicada y revisión del Arquitecto; B19 a B23 siguen planificados |
| 0.6 | 2026-11-04 | B19 (calendario-profesor) | CAL-08, CAL-12, CAL-20, ADR-025, DEC-42, DEC-43, SEC-36, H-B19-01..A06 | Respuesta de solicitudes desde el calendario y enlace del día construidos; ADR-025 construida; revisión del Arquitecto conforme |
