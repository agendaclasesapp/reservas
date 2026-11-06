// CC-05 · Columna de un día (CAL-05..CAL-08): los elementos de un día —huecos libres, bloqueos y clases— en orden
// horario (= orden de lectura), ubicados contra el eje, con el fondo sombreado fuera de los tramos de la grilla
// (CAL-05). Todo lo que se dibuja (posición, carriles, zonas) viene de la lógica: acá no se calcula nada (N-1).
// B20 (CAL-10, CAL-15; CA-74; DEC-45 A): en la vista Semana la columna de hoy va resaltada (`resaltar`) y lleva la línea
// de la hora actual (`lineaAhora`, CC-09); un día fuera de hoy ± 366 (`enRango` falso) es una columna vacía y sombreada,
// decorativa (`aria-hidden`): sin huecos tocables ni lectura.
// B21 (CAL-13, CAL-14; ADR-026): `data-columna-dia` deja al arrastre ubicar la columna bajo el puntero por su geometría
// (una columna fuera de rango no la tiene: no hay destino); con `arrastre` los bloques que la lógica deja mover inician el
// gesto, el que se arrastra sigue al puntero y los huecos destino se resaltan.
import {
  posicionEnEje,
  type BloqueClase as DatosBloque,
  type ColumnaCalendario,
  type EjeCalendario,
  type ElementoBloqueo,
  type ElementoHueco,
} from '../logica';
import type { ArrastreEnColumna } from './arrastre';
import { nombreDelDia, variablesDeElemento, type LineaAhoraDia } from './calendario';
import { BloqueBloqueo } from './BloqueBloqueo';
import { BloqueClase } from './BloqueClase';
import { HuecoLibre } from './HuecoLibre';
import { LineaAhora } from './LineaAhora';
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
  /** Vista Semana: la columna de hoy se resalta (CAL-10). */
  resaltar?: boolean;
  /** Dentro de hoy ± 366; `false` = día no disponible, columna vacía y sombreada (DEC-45 A). */
  enRango?: boolean;
  /** Línea de la hora actual de este día (solo en hoy y dentro del eje), `lineaAhora` de la lógica (CAL-10). */
  lineaAhora?: LineaAhoraDia | null;
  /** B21: el arrastre de clases (escritorio con mouse); sin él nada se arrastra. */
  arrastre?: ArrastreEnColumna;
};

export function ColumnaDia({
  columna,
  zona,
  eje,
  onAbrirHueco,
  onAbrirClase,
  onAbrirBloqueo,
  resaltar = false,
  enRango = true,
  lineaAhora = null,
  arrastre,
}: ColumnaDiaProps) {
  const { dia, elementos, zonasFueraDeTramo } = columna;
  if (!enRango) return <div aria-hidden="true" className={`${estilos.columna} ${estilos.fueraDeRango}`} />;
  return (
    <div
      className={`${estilos.columna}${resaltar ? ` ${estilos.columnaHoy}` : ''}`}
      data-hoy={resaltar || undefined}
      data-columna-dia={dia}
    >
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
                <HuecoLibre
                  key={elemento.clave}
                  hueco={elemento}
                  zona={zona}
                  onAbrir={onAbrirHueco}
                  esDestino={arrastre?.esDestino(elemento) ?? false}
                  destinoActivo={arrastre?.estado.activo === true && arrastre.estado.destino?.inicio === elemento.inicio}
                />
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
                  arrastrable={arrastre?.puedeArrastrar(elemento.clase) ?? false}
                  arrastrando={arrastre?.estado.activo === true && arrastre.estado.origen.claseId === elemento.clase.fila.clase_id}
                  desplazamiento={arrastre?.estado.activo ? { dx: arrastre.estado.dx, dy: arrastre.estado.dy } : undefined}
                  onIniciarArrastre={(evento) => arrastre?.iniciar(evento, elemento.clase, dia)}
                />
              );
          }
        })}
      </ul>
      {lineaAhora ? <LineaAhora arribaHoras={lineaAhora.arribaHoras} /> : null}
    </div>
  );
}
