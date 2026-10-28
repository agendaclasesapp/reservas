// API pública de la lógica de Configuración (B03 · T03.1; B14 · T14.3). Las vistas importan solo desde aquí.
//
//   useEnlacePropio()          -> { slug, enlace, activo } | null       (WEB-08: enlace para copiar)
//   copiarTexto(texto)         -> Promise<boolean>                       (false: el navegador no dejó)
//   useHusoDelProfesor()       -> { estado: 'cargando' | 'listo' (zona) | 'error' (mensaje, recargar) }
//   useMailsFallidos()         -> registro de mails fallidos de su agenda (WEB-08, AVI-08)
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
