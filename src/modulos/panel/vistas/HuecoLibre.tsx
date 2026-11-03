// CC-07 · Hueco libre (CAL-05, CAL-11; CA-70; A11Y-36, A11Y-41): un hueco libre futuro dentro de la grilla es un botón
// «Lun 26/10, 10:00 a 11:00, Libre» que abre «Crear clase»; uno que ya pasó (o que cae fuera de los tramos) es
// decorativo: sin marca de libre, sin botón y fuera del árbol de accesibilidad. Posición, alto y carril los da la
// lógica; acá solo se dibuja (N-1).
import { Icono } from '../../../ui';
import { formatearHora } from '../../../lib/fechas';
import type { ElementoHueco } from '../logica';
import { diaCorto, variablesDeElemento } from './calendario';
import { TEXTOS_CALENDARIO } from './formato';
import estilos from './HuecoLibre.module.css';

export type HuecoLibreProps = {
  /** Elemento de la lógica: posición, carril y `tocable` ya vienen calculados (N-1). */
  hueco: ElementoHueco;
  /** Huso del profesor (AGE-08). */
  zona: string;
  /** Abre «Crear clase» para este hueco; solo se llama si `hueco.tocable`. */
  onAbrir?: (hueco: ElementoHueco) => void;
};

/** «Lun 26/10, 10:00 a 11:00, Libre» (A11Y-36). */
export function nombreDelHueco(hueco: ElementoHueco, zona: string): string {
  return `${diaCorto(hueco.dia)}, ${formatearHora(hueco.inicio, zona)} a ${formatearHora(hueco.fin, zona)}, ${TEXTOS_CALENDARIO.libre}`;
}

export function HuecoLibre({ hueco, zona, onAbrir }: HuecoLibreProps) {
  const posicion = variablesDeElemento(hueco.posicion, hueco);
  if (!hueco.tocable || !onAbrir) {
    return <li aria-hidden="true" className={`${estilos.item} ${estilos.pasado}`} style={posicion} />;
  }
  return (
    <li className={estilos.item} style={posicion}>
      <button
        type="button"
        className={`${estilos.bloque} ${estilos.libre}`}
        aria-label={nombreDelHueco(hueco, zona)}
        data-inicio={hueco.inicio}
        onClick={() => onAbrir(hueco)}
      >
        <span className={estilos.estado}>
          <Icono nombre="tilde" />
          <span className={estilos.texto}>{TEXTOS_CALENDARIO.libre}</span>
        </span>
      </button>
    </li>
  );
}
