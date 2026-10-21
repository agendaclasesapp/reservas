# Política de seguridad

ReservaTuClase es un proyecto público. Los secretos viven solo en Supabase (Edge Functions, Auth) y en
los secretos de GitHub del environment `produccion`; nunca en el repositorio, en `dist/` ni en logs
(NFR-02, SEC-18 a SEC-23).

## Cómo reportar una vulnerabilidad
- Usa «Report a vulnerability» en la pestaña Security del repositorio `agendaclasesapp/reservas`
  (aviso privado de GitHub). No abras un issue público ni publiques datos de personas.
- Incluye qué viste, cómo reproducirlo y qué impacto tiene. No pruebes contra datos de otras personas.
- Se acusa recibo en unos días; el proyecto lo mantiene una persona, sin plazo contractual.

## Si encuentras un secreto expuesto
Avisa por el mismo canal sin copiar el valor. El responsable lo rota según `ops/rotacion.md` y sigue
`ops/incidentes.md`.

## Alcance
Aplicación web (GitHub Pages), base y Auth en Supabase, Edge Function `enviar-mail`, workflows de
`.github/`. Fuera de alcance: denegación de servicio e ingeniería social.

## Controles automáticos
gitleaks sobre el historial y sobre `dist/`, escaneo de JWT del bundle, `npm audit`, Dependabot, CodeQL,
zizmor, `supabase db lint` y guardia de `config push`. Procedimientos operativos: `ops/`.
