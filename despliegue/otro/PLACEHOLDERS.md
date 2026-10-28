# Placeholders

Todo lo que depende del ambiente del cliente. Ninguno lleva valor aquí; los secretos se cargan en GitHub o en
Supabase (nombres en el `README.md`).

| Placeholder | Descripción | Ejemplo | Obligatorio |
| --- | --- | --- | --- |
| `${GH_USUARIO}` | usuario u organización de GitHub dueña del repositorio | `mi-organizacion` | sí |
| `${GH_REPOSITORIO}` | nombre del repositorio (también es `VITE_BASE`) | `reservas` | sí |
| `${PROD_SITIO_URL}` | URL pública de la web de producción | `https://mi-organizacion.github.io/reservas/` | sí |
| `${QA_SITIO_URL}` | URL pública de la web de qa | `https://mi-organizacion.github.io/reservas-qa/` | sí |
| `${PROD_SUPABASE_PROJECT_REF}` | referencia del proyecto Supabase de producción | `abcdefghijklmnopqrst` | sí |
| `${QA_SUPABASE_PROJECT_REF}` | referencia del proyecto Supabase de qa | `abcdefghijklmnopqrst` | sí |
| `${QA_GH_ENVIRONMENT}` | nombre del environment de GitHub para qa | `qa` | sí |
| `${ADMIN_EMAIL}` | mail del Administrador inicial | `admin@ejemplo.com` | sí |
| `${TRAMO_ETIQUETA}` | etiqueta del tramo que se despliega | `prod-b14` | solo en la migración por tramos |
