// C-24 AgendaDia (WEB-01, AGE-07): presentación de la agenda de un día. No lee datos: recibe la `vista`
// ya resuelta por quien la monta (PaginaAgenda). Los huecos son públicos (sin nombres, SEC-07).
import { Cargando, ErrorCarga, Vacio } from '../../../ui';
import type { Dia } from '../../../lib/fechas';
import type { Hueco, LimitesAgenda } from '../logica';
import { ListaHuecos, resumenHuecos } from './ListaHuecos';
import { SelectorDia } from './SelectorDia';
import estilos from './AgendaDia.module.css';

/** Estado de la carga de los huecos del día como unión discriminada. */
export type VistaHuecos =
  | { estado: 'cargando' }
  | { estado: 'error'; mensaje: string; onReintentar: () => void }
  | { estado: 'listo'; huecos: readonly Hueco[] };

export type AgendaDiaProps = {
  dia: Dia;
  /** Huso IANA del profesor: las horas se muestran siempre en él (AGE-08). */
  zona: string;
  limites: LimitesAgenda;
  vista: VistaHuecos;
  onCambiarDia: (dia: Dia) => void;
  /** Contrato para B06: si se pasa, el hueco libre es un botón. La invitación a ingresar no es de esta vista. */
  onElegirHueco?: (hueco: Hueco) => void;
};

function Resultado({ vista, dia, zona, onElegirHueco }: Pick<AgendaDiaProps, 'vista' | 'dia' | 'zona' | 'onElegirHueco'>) {
  switch (vista.estado) {
    case 'cargando':
      return <Cargando etiqueta="Cargando los huecos del día…" renglones={6} />;
    case 'error':
      return <ErrorCarga mensaje={vista.mensaje} onReintentar={vista.onReintentar} />;
    case 'listo':
      return vista.huecos.length === 0 ? (
        <Vacio nivel={3} titulo="No hay huecos este día" texto="Elegí otro día para ver sus horarios." />
      ) : (
        <ListaHuecos huecos={vista.huecos} dia={dia} zona={zona} onElegir={onElegirHueco} />
      );
  }
}

export function AgendaDia({ dia, zona, limites, vista, onCambiarDia, onElegirHueco }: AgendaDiaProps) {
  const resumen = vista.estado === 'listo' && vista.huecos.length > 0 ? resumenHuecos(vista.huecos) : '';
  return (
    <div className={estilos.agenda}>
      <SelectorDia dia={dia} zona={zona} limites={limites} onCambio={onCambiarDia} />
      <p className={estilos.huso}>Horarios en el huso {zona}.</p>
      {/* Región siempre montada para que el resumen se anuncie sin mover el foco. */}
      <p role="status" className={estilos.soloLectores}>
        {resumen}
      </p>
      <Resultado vista={vista} dia={dia} zona={zona} onElegirHueco={onElegirHueco} />
    </div>
  );
}
