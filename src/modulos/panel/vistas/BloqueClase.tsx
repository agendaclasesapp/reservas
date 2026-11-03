// CC-06 · Bloque de una clase (CAL-07, CAL-08, CA-72; DEC-42 A, DEC-50 A): ítem de la columna de un día. Confirmada
// (borde sólido) o pendiente (borde punteado), siempre con el texto CONFIRMADA / PENDIENTE (el color nunca es lo único,
// A11Y-41) antes del nombre de quien toma la clase. Posición y alto salen de `posicionEnEje` de la lógica (horas desde
// el comienzo del eje y duración en horas) por `--cal-alto-hora` (la hora la da la lógica, DEC-50 A): el alto es
// proporcional a la duración (CA-72) y nunca baja de `--tactil-min` (NFR-12). El nombre es texto
// (SEC-16, SEC-35): React lo escapa y no se arma HTML con él.
import { Icono } from '../../../ui';
import { nombreVisible } from '../../lista/logica';
import { formatearHora, type Dia } from '../../../lib/fechas';
import { posicionEnEje, type BloqueClase as DatosBloque, type EjeCalendario } from '../logica';
import { diaCorto, variablesDeElemento } from './calendario';
import { TEXTOS_CALENDARIO } from './formato';
import estilos from './BloqueClase.module.css';

export type BloqueClaseProps = {
  clase: DatosBloque;
  /** Día de la columna, para el nombre accesible («Lun 26/10, …»). */
  dia: Dia;
  /** Huso del profesor (AGE-08). */
  zona: string;
  /** Eje del calendario (de la lógica): el bloque se ubica respecto de él. */
  eje: Pick<EjeCalendario, 'desdeMin' | 'hastaMin'>;
  /** Si se da, el bloque es un botón que abre el detalle; si no, es solo lectura. */
  onAbrir?: (clase: DatosBloque) => void;
  /** Carril entre los elementos que se solapan (`carril` desde 0 de `carriles`; ADR-024 A-4). */
  carril?: number;
  carriles?: number;
};

/** «Lun 26/10, 10:00 a 11:00». */
function cuandoDelBloque(clase: DatosBloque, dia: Dia, zona: string): string {
  return `${diaCorto(dia)}, ${formatearHora(clase.inicio, zona)} a ${formatearHora(clase.fin, zona)}`;
}

/** «Lun 26/10, 10:00 a 11:00, Confirmada, Ana Pérez» (A11Y-36). */
export function nombreDelBloque(clase: DatosBloque, dia: Dia, zona: string): string {
  return `${cuandoDelBloque(clase, dia, zona)}, ${TEXTOS_CALENDARIO[clase.estado]}, ${nombreVisible(clase.quien)}`;
}

export function BloqueClase({ clase, dia, zona, eje, onAbrir, carril = 0, carriles = 1 }: BloqueClaseProps) {
  const posicion = variablesDeElemento(posicionEnEje(clase.inicioMin, clase.finMin, eje), { carril, carriles });
  const nombre = nombreDelBloque(clase, dia, zona);
  const clases = `${estilos.bloque} ${estilos[clase.estado]}`;
  const contenido = (
    <>
      <span className={estilos.estado}>
        <Icono nombre={clase.estado === 'confirmada' ? 'tilde' : 'reloj'} />
        <span className={estilos.texto}>{TEXTOS_CALENDARIO[clase.estado]}</span>
      </span>
      <span className={estilos.nombre}>{nombreVisible(clase.quien)}</span>
    </>
  );
  return (
    <li className={estilos.item} style={posicion}>
      {onAbrir ? (
        <button
          type="button"
          className={clases}
          aria-label={nombre}
          data-inicio={clase.fila.inicio}
          onClick={() => onAbrir(clase)}
        >
          {contenido}
        </button>
      ) : (
        <div className={clases}>
          <span className={estilos.soloLectores}>{`${cuandoDelBloque(clase, dia, zona)}, `}</span>
          {contenido}
        </div>
      )}
    </li>
  );
}
