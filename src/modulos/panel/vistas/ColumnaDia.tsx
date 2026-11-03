// CC-05 · Columna de un día (CAL-05..CAL-08): los elementos de un día —huecos libres, bloqueos y clases— en orden
// horario (= orden de lectura), ubicados contra el eje, con el fondo sombreado fuera de los tramos de la grilla
// (CAL-05). Todo lo que se dibuja (posición, carriles, zonas) viene de la lógica: acá no se calcula nada (N-1).
import {
  posicionEnEje,
  type BloqueClase as DatosBloque,
  type ColumnaCalendario,
  type EjeCalendario,
  type ElementoBloqueo,
  type ElementoHueco,
} from '../logica';
import { nombreDelDia, variablesDeElemento } from './calendario';
import { BloqueBloqueo } from './BloqueBloqueo';
import { BloqueClase } from './BloqueClase';
import { HuecoLibre } from './HuecoLibre';
import estilos from './Calendario.module.css';

export type ColumnaDiaProps = {
  columna: ColumnaCalendario;
  zona: string;
  eje: Pick<EjeCalendario, 'desdeMin' | 'hastaMin'>;
  /** Abre «Crear clase» de un hueco libre tocable; sin él los huecos son solo lectura. */
  onAbrirHueco?: (hueco: ElementoHueco) => void;
  /** Abre el detalle de una clase tocable; sin él los bloques son solo lectura. */
  onAbrirClase?: (clase: DatosBloque) => void;
  /** Abre «Desbloquear» de un bloqueo propio. */
  onAbrirBloqueo?: (bloqueo: ElementoBloqueo) => void;
};

export function ColumnaDia({ columna, zona, eje, onAbrirHueco, onAbrirClase, onAbrirBloqueo }: ColumnaDiaProps) {
  const { dia, elementos, zonasFueraDeTramo } = columna;
  return (
    <div className={estilos.columna}>
      <div aria-hidden="true" className={estilos.zonas}>
        {zonasFueraDeTramo.map((tramo) => (
          <div
            key={tramo.desdeMin}
            className={estilos.fueraDeTramo}
            style={variablesDeElemento(posicionEnEje(tramo.desdeMin, tramo.hastaMin, eje), { carril: 0, carriles: 1 })}
          />
        ))}
      </div>
      <ul className={estilos.elementos} aria-label={`Clases del ${nombreDelDia(dia)}`}>
        {elementos.map((elemento) => {
          switch (elemento.tipo) {
            case 'hueco':
              return (
                <HuecoLibre key={elemento.clave} hueco={elemento} zona={zona} onAbrir={onAbrirHueco} />
              );
            case 'bloqueo':
              return (
                <BloqueBloqueo key={elemento.clave} bloqueo={elemento} zona={zona} onAbrir={onAbrirBloqueo} />
              );
            case 'clase':
              return (
                <BloqueClase
                  key={elemento.clave}
                  clase={elemento.clase}
                  dia={dia}
                  zona={zona}
                  eje={eje}
                  carril={elemento.carril}
                  carriles={elemento.carriles}
                  onAbrir={elemento.tocable ? onAbrirClase : undefined}
                />
              );
          }
        })}
      </ul>
    </div>
  );
}
