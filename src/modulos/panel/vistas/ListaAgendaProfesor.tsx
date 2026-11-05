// Agenda del día del profesor con nombres (WEB-06, PRF-05, CA-28, NFR-05): cada hueco dice su hora y su estado con
// texto + ícono + patrón y, si está ocupado, quién toma la clase, el titular, la observación y el estado de la clase.
// Un hueco libre o una clase confirmada que no pasó y no tiene pedidos sin responder es un botón (tocarlo abre las
// acciones); un hueco bloqueado con un bloqueo suyo también es un botón (abre «Desbloquear», AGE-06); lo demás es
// solo lectura. Nombres, observaciones y motivos son texto (SEC-16).
// B19 (CAL-12, CA-76; DEC-42 A, DEC-43 A): con `responder`, una solicitud pendiente o una clase con «Cancelación
// pendiente» se responde en su fila (`ResponderSolicitud`); sin él conserva el enlace a la Lista.
import { IconoEstado, Insignia } from '../../../ui';
import { accionesBloqueo, accionesFila, accionesRespuesta, MENSAJES_PANEL, type FilaAgendaDias, type FilaAgendaProfesor } from '../logica';
import type { ResponderSolicitudAccion } from './contrato';
import { fechaCorta, textoRango, TEXTOS_CALENDARIO, TEXTOS_PANEL } from './formato';
import { nombreVisible } from '../../lista/logica';
import { ResponderSolicitud } from './ResponderSolicitud';
import { solicitudDeFila } from './solicitud';
import estilos from './ListaAgendaProfesor.module.css';

export type ListaAgendaProfesorProps = {
  filas: readonly FilaAgendaDias[];
  /** Huso del profesor (AGE-08). */
  zona: string;
  /** `sesion.profesor.activo`: inactivo, los huecos libres abren el aviso y «Mover» queda deshabilitado (PRF-08). */
  profesorActivo: boolean;
  /** `inicio` de la fila cuyas acciones están abiertas. */
  seleccionada: string | null;
  onElegir: (fila: FilaAgendaDias) => void;
  /** Responde una solicitud (CAL-12). Sin él las solicitudes son de solo lectura con el enlace a la Lista. */
  responder?: ResponderSolicitudAccion;
};

/** ¿Tocar esta fila abre acciones? Libre y futuro; ocupado con algo que hacer (mover o cancelar); o bloqueado por él. */
export function esElegible(fila: FilaAgendaProfesor, profesorActivo: boolean): boolean {
  if (fila.estado === 'libre') return !fila.pasada;
  if (fila.estado === 'ocupado') {
    const a = accionesFila(fila, profesorActivo);
    return a.mover || a.cancelar;
  }
  return accionesBloqueo(fila).desbloquear;
}

/** DEC-43 A: confirmada con una cancelación sin responder (la fila trae `solicitud_tipo` en `agenda_profesor_dias`). */
function cancelacionPendiente(fila: FilaAgendaDias): boolean {
  return fila.solicitud_tipo === 'cancelacion';
}

function DetalleOcupado({ fila }: { fila: FilaAgendaDias }) {
  const nombre = nombreVisible(fila.quien_toma);
  const titular = nombreVisible(fila.titular);
  return (
    <>
      <span className={estilos.dato}>Toma la clase: {nombre}</span>
      <span className={estilos.dato}>Titular: {titular}</span>
      {fila.observacion ? <span className={estilos.dato}>Observación: {fila.observacion}</span> : null}
    </>
  );
}

function Estados({ fila }: { fila: FilaAgendaDias }) {
  return (
    <span className={estilos.estados}>
      <IconoEstado estado={fila.estado} />
      {fila.estado === 'ocupado' && fila.clase_estado ? (
        <Insignia tipo={fila.clase_estado} texto={MENSAJES_PANEL.estadoClase[fila.clase_estado]} />
      ) : null}
    </span>
  );
}

function Fila({
  fila,
  zona,
  profesorActivo,
  seleccionada,
  onElegir,
  responder,
}: Omit<ListaAgendaProfesorProps, 'filas' | 'seleccionada'> & { fila: FilaAgendaDias; seleccionada: boolean }) {
  const clase = `${estilos.fila} ${estilos[fila.estado]}${seleccionada ? ` ${estilos.seleccionada}` : ''}`;
  const contenido = (
    <>
      <span className={estilos.cabecera}>
        <span className={estilos.hora}>{textoRango(fila, zona)}</span> <Estados fila={fila} />
      </span>
      {fila.estado === 'ocupado' ? <DetalleOcupado fila={fila} /> : null}
      {fila.estado === 'ocupado' && fila.clase_estado === 'confirmada' && cancelacionPendiente(fila) ? (
        <span className={estilos.dato}>{TEXTOS_CALENDARIO.cancelacionPendiente}</span>
      ) : null}
      {fila.estado === 'bloqueado' && fila.bloqueo_motivo ? (
        <span className={estilos.dato}>Motivo: {fila.bloqueo_motivo}</span>
      ) : null}
    </>
  );

  if (esElegible(fila, profesorActivo)) {
    return (
      <li className={estilos.item}>
        <button
          type="button"
          className={`${clase} ${estilos.boton}`}
          aria-current={seleccionada || undefined}
          onClick={() => onElegir(fila)}
        >
          {contenido}
        </button>
      </li>
    );
  }
  const conPedido = fila.estado === 'ocupado' && !fila.pasada && fila.solicitud_id !== null;
  const pedido = responder ? solicitudDeFila(fila, zona) : null;
  const permitidas = accionesRespuesta(profesorActivo);
  return (
    <li className={estilos.item}>
      <div className={clase} data-estado={fila.estado}>
        {contenido}
        {fila.pasada ? <span className={estilos.aparte}>{TEXTOS_PANEL.yaPaso}</span> : null}
        {responder && pedido && permitidas.rechazar ? (
          <ResponderSolicitud
            variante="lista"
            solicitud={pedido}
            puedeConfirmar={permitidas.confirmar}
            onConfirmar={() => responder(pedido.solicitud, 'confirmar', null)}
            onRechazar={(motivo) => responder(pedido.solicitud, 'rechazar', motivo)}
          />
        ) : conPedido ? (
          <span className={estilos.aparte}>
            {TEXTOS_PANEL.pedidoSinResponder}{' '}
            <a href="#/lista" className={estilos.enlace}>
              {TEXTOS_PANEL.responderEnLista}
              <span className={estilos.soloLectores}> (pedido de la clase del {fechaCorta(fila.inicio, zona)})</span>
            </a>
          </span>
        ) : null}
      </div>
    </li>
  );
}

export function ListaAgendaProfesor({ filas, zona, profesorActivo, seleccionada, onElegir, responder }: ListaAgendaProfesorProps) {
  return (
    <ul className={estilos.huecos} aria-label="Huecos del día">
      {filas.map((fila) => (
        <Fila
          key={`${fila.inicio}|${fila.fin}`}
          fila={fila}
          zona={zona}
          profesorActivo={profesorActivo}
          seleccionada={seleccionada === fila.inicio}
          onElegir={onElegir}
          responder={responder}
        />
      ))}
    </ul>
  );
}
