// CC-04 · Encabezado de un día de la vista Semana (CAL-15, CAL-10; CA-80; F-CAL-03; A11Y-49): «Lun 26/10» y, en hoy,
// «Hoy» en texto con `aria-current="date"` (el resaltado de la columna no es lo único que lo dice, 1.4.1). Un botón
// «Abrir el Lun 26/10, vista Día» abre la vista Día de ese día. Un día fuera de hoy ± 366 (DEC-45 A) queda deshabilitado y
// dice por qué en su nombre: no abre Día. Sin `onAbrir` es solo texto.
import type { Dia } from '../../../lib/fechas';
import { diaCorto } from './calendario';
import { TEXTOS_CALENDARIO } from './formato';
import estilos from './Calendario.module.css';

export type EncabezadoDiaProps = {
  dia: Dia;
  /** Hoy en el huso del profesor (`DiaVisible.esHoy`). */
  esHoy: boolean;
  /** Dentro de hoy ± 366 (`DiaVisible.enRango`). */
  enRango: boolean;
  /** Abre la vista Día de este día; solo se llama si el día está en rango. */
  onAbrir?: (dia: Dia) => void;
};

/** «Abrir el Lun 26/10, vista Día» (A11Y-49); en hoy suma «, hoy». */
export function nombreDelEncabezado(dia: Dia, esHoy: boolean): string {
  return `Abrir el ${diaCorto(dia)}${esHoy ? `, ${TEXTOS_CALENDARIO.hoy.toLowerCase()}` : ''}, vista ${TEXTOS_CALENDARIO.dia}`;
}

export function EncabezadoDia({ dia, esHoy, enRango, onAbrir }: EncabezadoDiaProps) {
  const contenido = (
    <>
      <span className={estilos.diaCorto}>{diaCorto(dia)}</span>
      {esHoy ? (
        <>
          {' '}
          <span className={estilos.marcaHoy}>{TEXTOS_CALENDARIO.hoy}</span>
        </>
      ) : null}
    </>
  );
  const clase = `${estilos.encabezado}${esHoy ? ` ${estilos.encabezadoHoy}` : ''}`;
  if (!enRango) {
    return (
      <button
        type="button"
        className={clase}
        disabled
        aria-label={`${diaCorto(dia)}${TEXTOS_CALENDARIO.noDisponible}`}
        aria-current={esHoy ? 'date' : undefined}
      >
        {contenido}
      </button>
    );
  }
  if (!onAbrir) {
    return (
      <div className={clase} aria-current={esHoy ? 'date' : undefined}>
        {contenido}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={clase}
      aria-label={nombreDelEncabezado(dia, esHoy)}
      aria-current={esHoy ? 'date' : undefined}
      onClick={() => onAbrir(dia)}
    >
      {contenido}
    </button>
  );
}
