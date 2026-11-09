// CC-03 · Eje de horas (CAL-04; DEC-44 A, ADR-024): una etiqueta por hora en punto, con las marcas que arma la lógica
// (`ejeCalendario`, que ya cubre lo que queda fuera de la grilla), en el huso del profesor. Es decorativo
// (`aria-hidden`): la hora de cada clase ya va en su nombre accesible. Las líneas por hora y por media hora las dibuja
// la columna de días con el mismo `--cal-alto-hora`.
import type { EjeCalendario } from '../logica';
import type { LineaAhoraDia, VariablesCss } from './calendario';
import { EtiquetaAhora } from './LineaAhora';
import estilos from './Calendario.module.css';

export type EjeHorasProps = {
  eje: Pick<EjeCalendario, 'desdeMin' | 'marcas'>;
  /** B20 (CAL-10): «Ahora 10:42» a la altura de la línea de hoy, si hay una columna de hoy con línea. */
  ahora?: LineaAhoraDia | null;
};

export function EjeHoras({ eje, ahora = null }: EjeHorasProps) {
  return (
    <div className={estilos.eje} aria-hidden="true">
      {eje.marcas
        .filter((marca) => marca.tipo === 'hora')
        .map((marca) => {
          const posicion: VariablesCss = { '--cal-hora': (marca.minutos - eje.desdeMin) / 60 };
          return (
            <time key={marca.minutos} dateTime={marca.minutos < 1440 ? marca.etiqueta : undefined} className={estilos.hora} style={posicion}>
              {marca.etiqueta}
            </time>
          );
        })}
      {ahora ? <EtiquetaAhora arribaHoras={ahora.arribaHoras} hora={ahora.hora} /> : null}
    </div>
  );
}
