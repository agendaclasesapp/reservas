// Agenda del día del profesor con nombres (WEB-06, PRF-05, CA-28, NFR-05): cada hueco dice su hora y su estado con
// texto + ícono + patrón y, si está ocupado, quién toma la clase, el titular, la observación y el estado de la clase.
// Un hueco libre o una clase confirmada que no pasó y no tiene pedidos sin responder es un botón (tocarlo abre las
// acciones); un hueco bloqueado con un bloqueo suyo también es un botón (abre «Desbloquear», AGE-06); lo demás es
// solo lectura. Nombres, observaciones y motivos son texto (SEC-16).
import { IconoEstado, Insignia } from '../../../ui';
import { accionesBloqueo, accionesFila, MENSAJES_PANEL, type FilaAgendaProfesor } from '../logica';
import { fechaCorta, textoRango, TEXTOS_PANEL } from './formato';
import { nombreVisible } from '../../lista/logica';
import estilos from './ListaAgendaProfesor.module.css';

export type ListaAgendaProfesorProps = {
  filas: readonly FilaAgendaProfesor[];
  /** Huso del profesor (AGE-08). */
  zona: string;
  /** `sesion.profesor.activo`: inactivo, los huecos libres abren el aviso y «Mover» queda deshabilitado (PRF-08). */
  profesorActivo: boolean;
  /** `inicio` de la fila cuyas acciones están abiertas. */
  seleccionada: string | null;
  onElegir: (fila: FilaAgendaProfesor) => void;
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

function DetalleOcupado({ fila }: { fila: FilaAgendaProfesor }) {
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

function Estados({ fila }: { fila: FilaAgendaProfesor }) {
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
}: Omit<ListaAgendaProfesorProps, 'filas' | 'seleccionada'> & { fila: FilaAgendaProfesor; seleccionada: boolean }) {
  const clase = `${estilos.fila} ${estilos[fila.estado]}${seleccionada ? ` ${estilos.seleccionada}` : ''}`;
  const contenido = (
    <>
      <span className={estilos.cabecera}>
        <span className={estilos.hora}>{textoRango(fila, zona)}</span> <Estados fila={fila} />
      </span>
      {fila.estado === 'ocupado' ? <DetalleOcupado fila={fila} /> : null}
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
  return (
    <li className={estilos.item}>
      <div className={clase} data-estado={fila.estado}>
        {contenido}
        {fila.pasada ? <span className={estilos.aparte}>{TEXTOS_PANEL.yaPaso}</span> : null}
        {conPedido ? (
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

export function ListaAgendaProfesor({ filas, zona, profesorActivo, seleccionada, onElegir }: ListaAgendaProfesorProps) {
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
        />
      ))}
    </ul>
  );
}
