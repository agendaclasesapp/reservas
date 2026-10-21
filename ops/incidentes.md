# Respuesta a incidentes (SEC-30)

## A. Fuga de un secreto (repo, bundle, log, mail)
1. Contener: rota primero (`ops/rotacion.md`); revocar vale más que borrar del historial.
2. Si el secreto estuvo en el repo público, asume que ya fue copiado. Reescribir el historial es opcional y
   solo después de rotar; avisa a quien tenga clones.
3. Si es una clave `service_role` o `sb_secret_`: rota las claves del proyecto y revisa en los Logs de
   Supabase accesos anómalos desde la fecha de la fuga.
4. Si el workflow detectó la fuga (gitleaks o `escanear-dist`), no publiques: corrige y repite.
5. Registra fecha, qué se filtró, cuánto estuvo expuesto, rotación hecha y causa; si el patrón no se detectó,
   añade una regla a `.gitleaks.toml` y un caso a `prueba-eficacia-gitleaks.mjs`.

## B. Fuga de datos personales (alumnos, reservas, mails)
1. Contener: desactiva la causa (política RLS, función o exposición del Data API) con una migración urgente
   o desde el panel; si hace falta, pausa el proyecto.
2. Alcance: Logs de Supabase (API, Postgres) para saber qué tablas y filas se leyeron y por quién.
3. Rota las credenciales que pudieron verse (`ops/rotacion.md`) e invalida sesiones (Auth > Users).
4. Avisa sin demora a las personas afectadas y al profesor: qué datos y qué hacer. No incluyas los datos en
   el aviso.
5. Corrige con un test que reproduzca la fuga, despliega y deja el registro del incidente en `operacion/`.

## Evidencia
Guarda capturas y logs fuera del repo público. El informe del incidente no lleva valores secretos ni datos
personales.
