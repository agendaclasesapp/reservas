// Solicitud pendiente del profesor (WEB-07, PRF-06, SOL-04, SOL-08, PRF-08, SEC-16; flujos-profesor.md F-10):
// tipo, quién toma la clase, fecha y hora en el huso del profesor (origen y destino si es un cambio de horario),
// alcance y observación, con «Confirmar» y «Rechazar». Todo lo que viene de la base es texto plano.
// Una solicitud vencida (su horario pasó sin respuesta) no tiene acciones. Con el profesor inactivo «Confirmar»
// queda deshabilitado y «Rechazar» sigue disponible.
import { Alerta, Boton, Insignia } from '../../../ui';
import { formatearFecha, formatearHora } from '../../../lib/fechas';
import { accionesSolicitud, MENSAJES_RESPUESTA, nombreVisible, textoTipoSolicitud, type Decision, type SolicitudPendiente } from '../logica';
import estilos from './TarjetaSolicitud.module.css';

export type TarjetaSolicitudProps = {
  solicitud: SolicitudPendiente;
  /** Huso del profesor, para mostrar la fecha y la hora (ADR-004). */
  zona: string;
  /** Operación en curso sobre esta solicitud: el botón correspondiente queda `aria-busy`. */
  ocupada?: Decision | null;
  /** Error de la última operación (mensaje ya traducido). */
  error?: string;
  /** false con el profesor inactivo (PRF-08): «Confirmar» queda deshabilitado. */
  profesorActivo?: boolean;
  onConfirmar: (solicitud: SolicitudPendiente) => void;
  onRechazar: (solicitud: SolicitudPendiente) => void;
};

/** «lunes, 2 de noviembre, de 10:00 a 11:00» en el huso del profesor. */
export function textoHorario(inicio: string, fin: string | null, zona: string): string {
  const hasta = fin === null ? '' : ` a ${formatearHora(fin, zona)}`;
  return `${formatearFecha(inicio, zona)}, de ${formatearHora(inicio, zona)}${hasta}`;
}

function textoSerie(s: SolicitudPendiente): string | null {
  if (s.reserva_tipo !== 'serie') return null;
  return s.frecuencia === 2 ? 'Serie quincenal' : 'Serie semanal';
}

export function TarjetaSolicitud({
  solicitud,
  zona,
  ocupada = null,
  error,
  profesorActivo = true,
  onConfirmar,
  onRechazar,
}: TarjetaSolicitudProps) {
  const nombre = nombreVisible(solicitud.titular);
  const idTitulo = `solicitud-${solicitud.id}`;
  const acciones = accionesSolicitud(solicitud, profesorActivo);
  const puedeResponder = !solicitud.vencida;
  const observacion = solicitud.observacion?.trim() ?? '';
  const serie = textoSerie(solicitud);
  const esCambio = solicitud.tipo === 'movimiento';
  // Reserva: la primera clase pedida. Cambio de horario: de dónde sale y adónde va. Cancelación: la clase de origen.
  const cuando = {
    destino: solicitud.destino_inicio ?? solicitud.fecha_clase,
    destinoFin: solicitud.destino_inicio === null ? null : solicitud.destino_fin,
  };
  const referencia = textoHorario(solicitud.fecha_clase, null, zona);
  const nombreAccion = (verbo: string) => `${verbo} la solicitud de ${nombre} para ${referencia}`;
  return (
    <article className={estilos.tarjeta} aria-labelledby={idTitulo}>
      <h3 id={idTitulo} className={estilos.titulo}>
        {nombre}
      </h3>
      <p className={estilos.tipo}>{textoTipoSolicitud(solicitud)}</p>
      {solicitud.vencida ? (
        <p className={estilos.sinRespuesta}>
          <Insignia tipo="pendienteSinRespuesta" />
          <span> {MENSAJES_RESPUESTA.vencida}</span>
        </p>
      ) : null}
      <dl className={estilos.datos}>
        {solicitud.quien_toma ? (
          <div>
            <dt>Quién toma la clase</dt>
            <dd>{solicitud.quien_toma}</dd>
          </div>
        ) : null}
        {esCambio && solicitud.origen_inicio ? (
          <div>
            <dt>Clase actual</dt>
            <dd>{textoHorario(solicitud.origen_inicio, solicitud.origen_fin, zona)}</dd>
          </div>
        ) : null}
        {solicitud.tipo === 'cancelacion' && solicitud.origen_inicio ? (
          <div>
            <dt>Clase a cancelar</dt>
            <dd>{textoHorario(solicitud.origen_inicio, solicitud.origen_fin, zona)}</dd>
          </div>
        ) : null}
        {solicitud.tipo !== 'cancelacion' ? (
          <div>
            <dt>{esCambio ? 'Nuevo horario' : 'Fecha y hora'}</dt>
            <dd>{textoHorario(cuando.destino, cuando.destinoFin, zona)}</dd>
          </div>
        ) : null}
        {serie !== null ? (
          <div>
            <dt>Tipo</dt>
            <dd>{serie}</dd>
          </div>
        ) : null}
        {observacion !== '' ? (
          <div>
            <dt>Observación</dt>
            <dd className={estilos.observacion}>{observacion}</dd>
          </div>
        ) : null}
      </dl>
      {error ? <Alerta tipo="error">{error}</Alerta> : null}
      {puedeResponder ? (
        <div className={estilos.acciones}>
          <Boton
            aria-label={`${nombreAccion('Confirmar')}${acciones.confirmar ? '' : ', no disponible con la agenda inactiva'}`}
            cargando={ocupada === 'confirmar'}
            textoCargando="Confirmando…"
            deshabilitado={!acciones.confirmar || ocupada === 'rechazar'}
            onClick={() => onConfirmar(solicitud)}
          >
            Confirmar
          </Boton>
          <Boton
            variante="peligro"
            aria-label={nombreAccion('Rechazar')}
            deshabilitado={!acciones.rechazar || ocupada !== null}
            onClick={() => onRechazar(solicitud)}
          >
            Rechazar
          </Boton>
        </div>
      ) : null}
    </article>
  );
}
