// CC-08 · Bloqueo (CAL-06, CAL-11; CA-71; A11Y-36, SEC-16, SEC-35): un hueco bloqueado se dibuja rayado con el texto
// BLOQUEADO y el motivo si lo tiene. Si el bloqueo es suyo (`propio`, `tocable`) es un botón «Lun 26/10, 10:00 a 11:00, Bloqueado, Torneo»
// que abre «Desbloquear»; si no, es solo texto. El motivo lo escribe una persona: se muestra como texto, nunca como
// HTML (React lo escapa; no se arma HTML con él).
import { Icono } from '../../../ui';
import { formatearHora } from '../../../lib/fechas';
import type { ElementoBloqueo } from '../logica';
import { diaCorto, variablesDeElemento } from './calendario';
import { TEXTOS_CALENDARIO } from './formato';
import estilos from './BloqueBloqueo.module.css';

export type BloqueBloqueoProps = {
  /** Elemento de la lógica: posición, carril, `propio` y `tocable` ya vienen calculados (N-1). */
  bloqueo: ElementoBloqueo;
  /** Huso del profesor (AGE-08). */
  zona: string;
  /** Abre «Desbloquear»; solo se usa si `bloqueo.tocable`. */
  onAbrir?: (bloqueo: ElementoBloqueo) => void;
};

function cuando(bloqueo: ElementoBloqueo, zona: string): string {
  return `${diaCorto(bloqueo.dia)}, ${formatearHora(bloqueo.inicio, zona)} a ${formatearHora(bloqueo.fin, zona)}`;
}

/** «Lun 26/10, 10:00 a 11:00, Bloqueado, Torneo» (A11Y-36); sin motivo, termina en «Bloqueado». */
export function nombreDelBloqueo(bloqueo: ElementoBloqueo, zona: string): string {
  const base = `${cuando(bloqueo, zona)}, ${TEXTOS_CALENDARIO.bloqueado}`;
  return bloqueo.motivo ? `${base}, ${bloqueo.motivo}` : base;
}

export function BloqueBloqueo({ bloqueo, zona, onAbrir }: BloqueBloqueoProps) {
  const posicion = variablesDeElemento(bloqueo.posicion, bloqueo);
  const contenido = (
    <>
      <span className={estilos.estado}>
        <Icono nombre="prohibido" />
        <span className={estilos.texto}>{TEXTOS_CALENDARIO.bloqueado}</span>
      </span>
      {bloqueo.motivo ? <span className={estilos.motivo}>{bloqueo.motivo}</span> : null}
    </>
  );
  return (
    <li className={estilos.item} style={posicion}>
      {bloqueo.tocable && onAbrir ? (
        <button
          type="button"
          className={`${estilos.bloque} ${estilos.bloqueado}`}
          aria-label={nombreDelBloqueo(bloqueo, zona)}
          data-inicio={bloqueo.inicio}
          onClick={() => onAbrir(bloqueo)}
        >
          {contenido}
        </button>
      ) : (
        <div className={`${estilos.bloque} ${estilos.bloqueado}`}>
          <span className={estilos.soloLectores}>{`${cuando(bloqueo, zona)}, `}</span>
          {contenido}
        </div>
      )}
    </li>
  );
}
