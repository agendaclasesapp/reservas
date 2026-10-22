// API pública de la lógica de Configuración (B03 · T03.1). Las vistas importan solo desde aquí.
export {
  TIPOS_MAIL,
  MOTIVO_TOPE,
  MOTIVO_SIN_CONFIRMACION,
  MOTIVO_DESTINATARIO_INVALIDO,
  esquemaMailFallido,
  type TipoMail,
  type ClaseMotivo,
  type MailFallido,
  type EstadoMailsFallidos,
  type ResultadoMailsFallidos,
} from './tipos';
export { VISTA_MAILS_FALLIDOS, clasificarMotivo, leerMailsFallidos, type LectorMailsFallidos } from './mails-fallidos';
export { useMailsFallidos } from './useMailsFallidos';
