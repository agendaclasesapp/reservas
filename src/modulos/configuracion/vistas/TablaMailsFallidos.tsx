// C-75 TablaMailsFallidos (WEB-08, NFR-07, AVI-08, CA-34): fecha, destinatario, tipo y motivo en palabras de
// cada mail que no salió. Presentación pura: los datos y la lectura llegan por props (hook en logica/).
// El motivo `TOPE` y los demás se dicen con texto, no con códigos; el destinatario puede ser nulo (alumno
// borrado, ADR-011). Las fechas se muestran en el huso del profesor (ADR-004), nunca en el del navegador.
import { Cargando, ErrorCarga, Vacio } from '../../../ui';
import { formatearFecha, formatearHora } from '../../../lib/fechas';
import { clasificarMotivo, type MailFallido, type TipoMail } from '../logica';
import estilos from './TablaMailsFallidos.module.css';

export type VistaMailsFallidos =
  | { estado: 'cargando' }
  | { estado: 'error'; mensaje: string; onReintentar: () => void }
  | { estado: 'listo'; mails: readonly MailFallido[] };

export type TablaMailsFallidosProps = {
  vista: VistaMailsFallidos;
  /** Huso del profesor (`config_publica().zona_horaria`). */
  zona: string;
};

export const TEXTO_VACIO = 'No hay mails fallidos';
export const TEXTO_SIN_DESTINATARIO = 'No disponible (alumno borrado)';
export const TEXTO_MOTIVO_TOPE = 'Se superó el tope de envío: el mail no se envió.';
export const TEXTO_MOTIVO_SIN_CONFIRMACION = 'No se confirmó el envío: el mail pudo haber salido o no.';
export const TEXTO_MOTIVO_DESTINATARIO_INVALIDO = 'La dirección de correo no es válida: el mail no se envió.';
export const TEXTO_MOTIVO_CREDENCIALES = 'Gmail no aceptó las credenciales de la casilla.';
export const TEXTO_MOTIVO_DESCONOCIDO = 'Sin motivo registrado.';
export const TEXTO_FECHA_INVALIDA = 'Fecha no válida';

const NOMBRE_TIPO: Record<TipoMail, string> = {
  cuenta_nueva: 'Cuenta nueva',
  solicitud_nueva: 'Solicitud nueva',
  cuenta_respondida: 'Cuenta respondida',
  solicitud_respondida: 'Solicitud respondida',
  clase_creada: 'Clase creada',
  clase_movida: 'Clase movida',
  clase_cancelada: 'Clase cancelada',
  alumno_sumado: 'Alumno sumado',
  recordatorio: 'Recordatorio',
  aviso_inactividad: 'Aviso de inactividad',
  profesor_alta: 'Alta de profesor',
};

const PISTAS_CREDENCIALES = /\b535\b|invalid login|username and password|credencial/i;

/** Motivo en palabras (NFR-07, AVI-08). Un error del servidor de correo conserva su texto como detalle. */
export function textoMotivo(motivo: string | null): { resumen: string; detalle: string | null } {
  switch (clasificarMotivo(motivo)) {
    case 'tope':
      return { resumen: TEXTO_MOTIVO_TOPE, detalle: null };
    case 'sin_confirmacion':
      return { resumen: TEXTO_MOTIVO_SIN_CONFIRMACION, detalle: null };
    case 'destinatario_invalido':
      return { resumen: TEXTO_MOTIVO_DESTINATARIO_INVALIDO, detalle: null };
    case 'desconocido':
      return { resumen: TEXTO_MOTIVO_DESCONOCIDO, detalle: null };
    case 'envio': {
      const detalle = (motivo ?? '').trim();
      return {
        resumen: PISTAS_CREDENCIALES.test(detalle) ? TEXTO_MOTIVO_CREDENCIALES : 'No se pudo enviar el mail.',
        detalle,
      };
    }
  }
}

function textoFecha(fecha: string, zona: string): string {
  try {
    return `${formatearFecha(fecha, zona)}, ${formatearHora(fecha, zona)}`;
  } catch {
    return TEXTO_FECHA_INVALIDA;
  }
}

function FilaMail({ mail, zona }: { mail: MailFallido; zona: string }) {
  const motivo = textoMotivo(mail.motivo);
  const fecha = textoFecha(mail.fecha, zona);
  return (
    <tr className={estilos.fila}>
      <th scope="row" className={estilos.celda} data-etiqueta="Fecha">
        {fecha === TEXTO_FECHA_INVALIDA ? fecha : <time dateTime={mail.fecha}>{fecha}</time>}
      </th>
      <td className={estilos.celda} data-etiqueta="Destinatario">
        {mail.destinatario ?? <span className={estilos.suave}>{TEXTO_SIN_DESTINATARIO}</span>}
      </td>
      <td className={estilos.celda} data-etiqueta="Tipo">
        {NOMBRE_TIPO[mail.tipo]}
      </td>
      <td className={estilos.celda} data-etiqueta="Motivo">
        <span>{motivo.resumen}</span>
        {motivo.detalle ? <span className={`${estilos.detalle} ${estilos.suave}`}>{motivo.detalle}</span> : null}
      </td>
    </tr>
  );
}

/** Cargando, error con «Reintentar», vacío («No hay mails fallidos») o tabla (tarjetas en pantallas angostas). */
export function TablaMailsFallidos({ vista, zona }: TablaMailsFallidosProps) {
  if (vista.estado === 'cargando') return <Cargando etiqueta="Cargando los mails fallidos…" renglones={3} />;
  if (vista.estado === 'error') return <ErrorCarga mensaje={vista.mensaje} onReintentar={vista.onReintentar} />;
  if (vista.mails.length === 0) return <Vacio nivel={3} titulo={TEXTO_VACIO} />;
  return (
    <table className={estilos.tabla}>
      <caption className={estilos.leyenda}>Mails que no se enviaron, del más reciente al más antiguo</caption>
      <thead className={estilos.encabezado}>
        <tr>
          <th scope="col">Fecha</th>
          <th scope="col">Destinatario</th>
          <th scope="col">Tipo</th>
          <th scope="col">Motivo</th>
        </tr>
      </thead>
      <tbody>
        {vista.mails.map((mail) => (
          <FilaMail key={mail.id} mail={mail} zona={zona} />
        ))}
      </tbody>
    </table>
  );
}
