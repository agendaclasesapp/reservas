// API pública de la lógica de Configuración (B03 · T03.1; B14 · T14.3). Las vistas importan solo desde aquí.
//
//   useEnlacePropio()          -> { slug, enlace, activo } | null       (WEB-08: enlace para copiar)
//   copiarTexto(texto)         -> Promise<boolean>                       (false: el navegador no dejó)
//   useHusoDelProfesor()       -> { estado: 'cargando' | 'listo' (zona) | 'error' (mensaje, recargar) }
//   useMailsFallidos()         -> registro de mails fallidos de su agenda (WEB-08, AVI-08)
//
// B10 · T10.1 · Configuración de la agenda (WEB-08, AGE-01..04, AGE-08, AGE-10, SEC-09):
//   const { lectura, recargar, guardarConfiguracion, guardarGrilla } = useConfiguracionAgenda();
//     lectura: { estado: 'cargando' | 'listo' | 'error', datos: { config, grilla } | null, error }
//     await guardarConfiguracion({ duracionMin, anticipacionHoras, zonaHoraria })
//       -> { ok: true, zona_horaria, duracion_min, anticipacion_horas, horizonte_semanas } | { ok: false, mensaje, campo }
//     await guardarGrilla([{ dia_semana: 1..7, desde: 'HH:MM', hasta: 'HH:MM' | '24:00' }])
//       -> { ok: true, grilla } | { ok: false, mensaje, campo: 'p_tramos', validacion: { porTramo, general } | null }
//   validarConfiguracion(entrada) / validarGrilla(tramos)   -> para marcar el campo o el tramo antes de guardar
//   advertenciaCambioHuso(actual, nueva)  -> texto a confirmar antes de cambiar el huso (solo su agenda) | null
//   avisoSinEfectoEnClases(cambiaDuracion, cambiaGrilla?) -> texto de AGE-03 (CA-12) | null
//   zonasHorarias(actual)                 -> husos IANA para elegir
export {
  ANTICIPACION_HORAS_MAXIMA,
  ANTICIPACION_HORAS_MINIMA,
  CAMPOS_CONFIGURACION,
  DIAS_SEMANA,
  DURACION_MIN_MAXIMA,
  DURACION_MIN_MINIMA,
  MAX_TRAMOS_GRILLA,
  MENSAJES_CONFIGURACION,
  esquemaConfiguracionAgenda,
  esquemaTramo,
  type AgendaConfigurada,
  type CampoConfiguracion,
  type ConfiguracionAgenda,
  type DiaSemana,
  type EntradaConfiguracion,
  type ErrorTramo,
  type FalloConfiguracion,
  type ResultadoConfiguracion,
  type ResultadoGrilla,
  type TramoGrilla,
  type ValidacionGrilla,
} from './agenda-tipos';
export {
  advertenciaCambioHuso,
  avisoSinEfectoEnClases,
  dependenciasConfiguracion,
  esZonaValida,
  falloConfiguracion,
  guardarConfiguracion,
  guardarGrilla,
  horaCorta,
  leerConfiguracionAgenda,
  validarConfiguracion,
  validarGrilla,
  zonasHorarias,
  type DependenciasConfiguracion,
} from './agenda';
export {
  useConfiguracionAgenda,
  type EscritoresConfiguracion,
  type EstadoConfiguracionAgenda,
  type LectorConfiguracion,
  type ResultadoUseConfiguracion,
} from './useConfiguracionAgenda';
export {
  TIPOS_MAIL,
  MOTIVO_TOPE,
  MOTIVO_TOPE_GLOBAL,
  MOTIVO_SIN_CONFIRMACION,
  MOTIVO_DESTINATARIO_INVALIDO,
  esquemaMailFallido,
  type TipoMail,
  type ClaseMotivo,
  type MailFallido,
  type EstadoMailsFallidos,
  type ResultadoMailsFallidos,
} from './tipos';
export {
  VISTA_MAILS_FALLIDOS,
  clasificarMotivo,
  esTopeGlobal,
  leerMailsFallidos,
  type LectorMailsFallidos,
} from './mails-fallidos';
export {
  copiarTexto,
  enlaceDeProfesor,
  leerHusoPropio,
  profesorDeSesion,
  useEnlacePropio,
  useHusoDelProfesor,
  type EnlacePropio,
  type HusoDelProfesor,
  type LectorHusoPropio,
} from './profesor';
export { useMailsFallidos } from './useMailsFallidos';
