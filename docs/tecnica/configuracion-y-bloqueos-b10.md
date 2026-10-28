---
titulo: Técnica · Configuración del profesor, bloqueos y huso por reserva (B10)
version: 0.1
fecha: 2026-10-26
publico: equipo técnico
---
# Técnica · Configuración del profesor, bloqueos y huso por reserva (B10)

> Estado: **construido y verificado** (E2E `WEB-08-configuracion` y `WEB-08-bloqueo`). Resumen de lo construido; la fuente completa es `.aidlc/reservatuclase/arquitectura/contratos.md` §3, `arquitectura/adr/ADR-022-serie-conserva-su-huso.md` y los handoffs de B10. Sin valores secretos.

## 1. Migraciones

| Migración | Qué hace |
| --- | --- |
| `202611001001_bloqueos_y_configuracion` | RPC `bloquear` y `desbloquear` (`privado.bloquear`) y los ajustes de `guardar_configuracion` |
| `202611001002_serie_conserva_su_huso` | `reserva.zona_horaria` y la regla de ADR-022 |

## 2. Operaciones del profesor

| RPC | Reglas | Errores |
| --- | --- | --- |
| `bloquear(p_desde, p_hasta, p_motivo)` | Un hueco, un rango de horas o días completos. Desde las 00:00 de hoy - 366 días hasta hoy + 366 días inclusive; hasta 366 días de largo; motivo opcional de hasta 500 caracteres, que solo ve el profesor. No exige agenda activa. Si en el período hay clases confirmadas o pedidos pendientes, se rechaza y devuelve la lista; el borde (clase que termina a las 10:00, bloqueo desde las 10:00) no es conflicto (AGE-05) | 403 para un alumno; 409 con la lista de conflictos |
| `desbloquear(p_bloqueo_id)` | Borra el bloqueo entero y sus huecos vuelven a libres (AGE-06). No exige agenda activa | 404 `NO_ENCONTRADO` si el bloqueo es de otro profesor, no existe o es nulo: misma respuesta, sin tocar nada |
| `guardar_configuracion` | Anticipación de 0 a 8784 horas (366 días, H-140); duración de 1 a 1440 minutos; huso IANA. Cambiar el huso no toca reservas ni clases (AGE-08) | error junto al campo; no se guarda nada |

Cambiar la duración o la grilla no mueve clases ni pedidos (AGE-03). Los textos de la configuración están en `src/modulos/configuracion/logica/agenda-tipos.ts` (`MENSAJES_CONFIGURACION`) y los de bloqueo en `src/modulos/panel/logica/tipos.ts` (`MENSAJES_BLOQUEO`). El motivo del bloqueo no aparece en el calendario público.

## 3. Cambio de huso y series (ADR-022)

- `reserva.zona_horaria` la fija un trigger al insertar la reserva y no se actualiza nunca. No hay un trigger que impida un `update`: lo garantiza ADR-001 (la API no escribe en `reserva`).
- Las series ya pactadas siguen a la misma hora real, también en las fechas que el job agrega después del cambio; en el huso nuevo se ven corridas.
- Las series nuevas usan el huso nuevo.
- Las clases ya guardadas mantienen su momento real.

## 4. Capa web

`#/configuracion` (secciones y botones en `manuales/profesor.md`) y, en `#/panel`, el diálogo «Bloquear horarios». Cada conflicto de un bloqueo rechazado enlaza al día del panel (`#/panel?d=AAAA-MM-DD`) y muestra fecha, hora, alumno y estado.

## Bitácora de versiones

| Versión | Fecha | Bolt | IDs | Cambio |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-10-26 | B10 | AGE-03, AGE-05, AGE-06, AGE-08, WEB-08, ADR-022, H-140, H-393, H-394 | Primera versión |
