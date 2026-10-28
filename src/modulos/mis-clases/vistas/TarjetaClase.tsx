// Una clase de Mis clases (WEB-05, RES-06, SOL-08, CA-25, CA-53; flujos.md F-06): fecha y hora en el huso de SU
// profesor, el profesor, quién toma la clase, la observación y el estado (texto + ícono, nunca solo color).
// Todo lo que viene de la base (profesor, quién toma, observación) es texto: React lo escapa (SEC-16).
// B08 (SOL-02, SOL-03, AGE-11; F-06): una clase confirmada futura sin solicitud pendiente ofrece «Mover» y «Avisar que
// no voy»; con una solicitud de movimiento o cancelación pendiente sigue confirmada y lleva la marca «Movimiento
// pendiente» o «Cancelación pendiente». Tras enviar, la tarjeta cuenta qué se pidió y las fechas salteadas.
import { useEffect, useRef } from 'react';
import { Alerta, Insignia, type TipoInsignia } from '../../../ui';
import botones from '../../../ui/Boton.module.css';
import { formatearFecha, formatearHora } from '../../../lib/fechas';
import {
  esPendienteSinRespuesta,
  horarioDeClase,
  MENSAJES_CAMBIOS,
  profesorDeClase,
  puedePedirCambio,
  textoEstadoClase,
  textoSolicitudDeClase,
  type ClaseMia,
} from '../logica';
import type { CambioHecho, ModoCambio } from './CambiarClase';
import estilos from './TarjetaClase.module.css';

export const MENSAJES_TARJETA = {
  mover: 'Mover',
  avisar: 'Avisar que no voy',
  marcaMovimiento: 'Movimiento pendiente',
  marcaCancelacion: 'Cancelación pendiente',
  tituloPedido: 'Pedido enviado',
  salteadas: 'Estas fechas se saltearon porque ya estaban ocupadas o bloqueadas:',
} as const;

/** Marca de una solicitud de cambio pendiente sobre la clase confirmada (SOL-02, SOL-03); null si no hay. */
export function marcaDeSolicitud(clase: ClaseMia): string | null {
  const s = clase.solicitud_pendiente;
  if (!s || s.vencida || clase.pasada) return null;
  if (s.tipo === 'movimiento') return MENSAJES_TARJETA.marcaMovimiento;
  if (s.tipo === 'cancelacion') return MENSAJES_TARJETA.marcaCancelacion;
  return null;
}

export type TarjetaClaseProps = {
  clase: ClaseMia;
  /** Muestra el huso junto a la hora: hace falta cuando hay clases en más de un huso (CA-53). */
  mostrarHuso?: boolean;
  /** Solicitud pendiente de respuesta, destacada arriba de Próximas. */
  destacada?: boolean;
  /** Abre el diálogo de mover; sin él la tarjeta no ofrece la acción. */
  onMover?: (clase: ClaseMia) => void;
  /** Abre el diálogo de avisar que no voy; sin él la tarjeta no ofrece la acción. */
  onAvisar?: (clase: ClaseMia) => void;
  /** Lo que se acaba de pedir sobre esta clase (éxito): se cuenta en la tarjeta y se enfoca. */
  hecho?: Pick<CambioHecho, 'modo' | 'salteadas' | 'zona'>;
};

/** Insignia de la clase: «pendiente sin respuesta» si venció (CA-25); cambiada de horario se ve como cancelada. */
export function insigniaDeClase(clase: ClaseMia): TipoInsignia {
  if (esPendienteSinRespuesta(clase)) return 'pendienteSinRespuesta';
  switch (clase.estado) {
    case 'pendiente':
      return 'pendiente';
    case 'confirmada':
      return 'confirmada';
    case 'rechazada':
      return 'rechazada';
    case 'cancelada':
    case 'movida':
      return 'cancelada';
  }
}

function textoSerie(clase: ClaseMia): string | null {
  if (clase.reserva_tipo !== 'serie') return null;
  return clase.frecuencia === 2 ? 'Serie quincenal' : 'Serie semanal';
}

function textoFechaSalteada(inicio: string, zona: string): string {
  return `${formatearFecha(inicio, zona)}, ${formatearHora(inicio, zona)}`;
}

type PedidoEnviadoProps = { modo: ModoCambio; salteadas: readonly string[]; zona: string; enfocar: boolean };

/** Éxito del pedido: se enfoca cuando la clase ya muestra su marca (tras recargar), porque los botones desaparecen. */
function PedidoEnviado({ modo, salteadas, zona, enfocar }: PedidoEnviadoProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (enfocar) ref.current?.focus();
  }, [enfocar]);
  return (
    <div ref={ref} tabIndex={-1} className={estilos.pedido}>
      <Alerta tipo="exito" titulo={MENSAJES_TARJETA.tituloPedido}>
        <p className={estilos.parrafo}>{modo === 'mover' ? MENSAJES_CAMBIOS.movimientoPedido : MENSAJES_CAMBIOS.cancelacionPedida}</p>
        {salteadas.length > 0 ? (
          <>
            <p className={estilos.parrafo}>{MENSAJES_TARJETA.salteadas}</p>
            <ul className={estilos.salteadas}>
              {salteadas.map((s) => (
                <li key={s}>{textoFechaSalteada(s, zona)}</li>
              ))}
            </ul>
          </>
        ) : null}
      </Alerta>
    </div>
  );
}

export function TarjetaClase({ clase, mostrarHuso = false, destacada = false, onMover, onAvisar, hecho }: TarjetaClaseProps) {
  const horario = horarioDeClase(clase);
  const idTitulo = `clase-${clase.id}`;
  const serie = textoSerie(clase);
  const observacion = clase.observacion?.trim() ?? '';
  const aviso = textoSolicitudDeClase(clase);
  const horas = `${horario.desde} a ${horario.hasta}`;
  const marca = marcaDeSolicitud(clase);
  const puedeCambiar = (onMover !== undefined || onAvisar !== undefined) && puedePedirCambio(clase);
  return (
    <article className={`${estilos.tarjeta} ${destacada ? estilos.destacada : ''}`} aria-labelledby={idTitulo}>
      <h4 id={idTitulo} className={estilos.titulo}>
        {horario.fecha}, {horas}
        {mostrarHuso ? ` (${horario.zona})` : ''}
      </h4>
      <p className={estilos.estado}>
        <Insignia tipo={insigniaDeClase(clase)} texto={textoEstadoClase(clase)} />
        {marca !== null ? <Insignia tipo="pendiente" texto={marca} /> : null}
      </p>
      {aviso !== null ? <p className={estilos.aviso}>{aviso}</p> : null}
      <dl className={estilos.datos}>
        <div>
          <dt>Profesor</dt>
          <dd>{profesorDeClase(clase)}</dd>
        </div>
        {clase.quien_toma ? (
          <div>
            <dt>Quién toma la clase</dt>
            <dd>{clase.quien_toma}</dd>
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
      {hecho ? (
        <PedidoEnviado modo={hecho.modo} salteadas={hecho.salteadas} zona={hecho.zona} enfocar={marca !== null} />
      ) : null}
      {puedeCambiar ? (
        <div role="group" aria-label="Acciones de la clase" className={estilos.acciones}>
          {onMover ? (
            <button
              type="button"
              className={`${botones.boton} ${botones.secundario}`}
              aria-haspopup="dialog"
              aria-describedby={idTitulo}
              onClick={() => onMover(clase)}
            >
              {MENSAJES_TARJETA.mover}
            </button>
          ) : null}
          {onAvisar ? (
            <button
              type="button"
              className={`${botones.boton} ${botones.secundario}`}
              aria-haspopup="dialog"
              aria-describedby={idTitulo}
              onClick={() => onAvisar(clase)}
            >
              {MENSAJES_TARJETA.avisar}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
