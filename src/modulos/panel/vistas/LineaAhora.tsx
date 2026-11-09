// CC-09 · Línea de la hora actual (CAL-10, CA-74; A11Y-46): una línea de 2 px en la columna de hoy, a la altura de la hora
// actual del huso del profesor (`lineaAhora` de la lógica da la posición en horas; la hoja de estilos la multiplica por
// `--cal-alto-hora`), y «Ahora 10:42» junto al eje. Las dos son decorativas (`aria-hidden`): la hora de cada clase ya va
// en su nombre. La línea se mueve a saltos de un minuto (quien la monta vuelve a calcularla), sin animación ni anuncio.
import type { LineaAhoraDia, VariablesCss } from './calendario';
import { TEXTOS_CALENDARIO } from './formato';
import estilos from './Calendario.module.css';

export type LineaAhoraProps = Pick<LineaAhoraDia, 'arribaHoras'>;

/** La línea, dentro de la columna de hoy. No recibe el puntero: los bloques de abajo se siguen tocando. */
export function LineaAhora({ arribaHoras }: LineaAhoraProps) {
  const posicion: VariablesCss = { '--cal-arriba': arribaHoras };
  return <div aria-hidden="true" className={estilos.lineaAhora} style={posicion} />;
}

/** «Ahora 10:42», dentro del eje, a la altura de la línea. */
export function EtiquetaAhora({ arribaHoras, hora }: LineaAhoraDia) {
  const posicion: VariablesCss = { '--cal-arriba': arribaHoras };
  return (
    <span aria-hidden="true" className={estilos.etiquetaAhora} style={posicion}>
      <span>{TEXTOS_CALENDARIO.ahora}</span>
      <span>{hora}</span>
    </span>
  );
}
