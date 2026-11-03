// CC-03 · Eje de horas (CAL-04; DEC-44 A, ADR-024): una etiqueta por hora en punto, con las marcas que arma la lógica
// (`ejeCalendario`, que ya cubre lo que queda fuera de la grilla), en el huso del profesor. Es decorativo
// (`aria-hidden`): la hora de cada clase ya va en su nombre accesible. Las líneas por hora y por media hora las dibuja
// la columna de días con el mismo `--cal-alto-hora`.
import type { EjeCalendario } from '../logica';
import type { VariablesCss } from './calendario';
import estilos from './Calendario.module.css';

export type EjeHorasProps = {
  eje: Pick<EjeCalendario, 'desdeMin' | 'marcas'>;
};

export function EjeHoras({ eje }: EjeHorasProps) {
  return (
    <div className={estilos.eje} aria-hidden="true">
      {eje.marcas
        .filter((marca) => marca.tipo === 'hora')
        .map((marca) => {
          const posicion: VariablesCss = { '--cal-hora': (marca.minutos - eje.desdeMin) / 60 };
          return (
            <time key={marca.minutos} className={estilos.hora} style={posicion}>
              {marca.etiqueta}
            </time>
          );
        })}
    </div>
  );
}
