// CC-02 · Calendario del Panel (CAL-04..CAL-08, CAL-11, CAL-17, CAL-18; WEB-14, F-CAL-01, F-CAL-04..F-CAL-07,
// F-CAL-11): contenedor de la grilla con sus estados. Cargando (leyenda real y esqueleto, `role="status"`), releyendo
// (la grilla anterior queda con `aria-busy` hasta que llega la nueva), error (mensaje genérico recibido y «Reintentar»,
// `role="alert"`; el foco va a «Reintentar» solo si el error llegó tras una acción, A11Y-48), vacío («No hay clases este
// día» encima de la grilla, que sigue con sus huecos libres) y listo (eje de horas y una columna por día). Un solo
// `role="group"` «Calendario, <título>» descrito por la ayuda (A11Y-35, CC-11). El eje (ya extendido para cubrir lo que
// queda fuera de la grilla, DEC-44 A) y el alto de la hora (DEC-50 A) los da la lógica; el contenedor es enfocable
// por programa (`tabIndex=-1`) para devolver el foco a la grilla cuando el bloque que abrió el detalle ya no existe.
import { useEffect, useId, useRef, type Ref } from 'react';
import { Cargando, ErrorCarga } from '../../../ui';
import type { BloqueClase, EjeCalendario, ElementoBloqueo, ElementoHueco } from '../logica';
import type { EstadoCalendario, VariablesCss } from './calendario';
import { AyudaCalendario } from './AyudaCalendario';
import { ColumnaDia } from './ColumnaDia';
import { EjeHoras } from './EjeHoras';
import { TEXTOS_CALENDARIO, TEXTOS_PANEL } from './formato';
import { LeyendaCalendario } from './LeyendaCalendario';
import estilos from './Calendario.module.css';

export type CalendarioPanelProps = {
  estado: EstadoCalendario;
  /** Se vuelve a leer con la grilla anterior a la vista (cambio de día): `aria-busy` y atenuada. */
  releyendo?: boolean;
  /** Título de la barra, para nombrar el grupo. */
  titulo: string;
  /** Huso del profesor (AGE-08). */
  zona: string;
  /** `ejeCalendario` de la lógica (CAL-04, ADR-024). */
  eje: EjeCalendario;
  onReintentar: () => void;
  /** El error de lectura llegó tras una acción de la persona: el foco pasa a «Reintentar» (A11Y-48). */
  enfocarReintentar?: boolean;
  /** Abre «Crear clase» de un hueco libre tocable; sin él los huecos son solo lectura. */
  onAbrirHueco?: (hueco: ElementoHueco) => void;
  /** Abre el detalle de una clase; sin él los bloques son solo lectura. */
  onAbrirClase?: (clase: BloqueClase) => void;
  /** Abre «Desbloquear» de un bloqueo propio. */
  onAbrirBloqueo?: (bloqueo: ElementoBloqueo) => void;
  /** El grupo de la grilla, para devolverle el foco (A11Y-38). */
  grillaRef?: Ref<HTMLDivElement>;
};

export function CalendarioPanel({
  estado,
  releyendo = false,
  titulo,
  zona,
  eje,
  onReintentar,
  enfocarReintentar = false,
  onAbrirHueco,
  onAbrirClase,
  onAbrirBloqueo,
  grillaRef,
}: CalendarioPanelProps) {
  const idAyuda = useId();
  const errorRef = useRef<HTMLDivElement>(null);
  const hayError = estado.estado === 'error';

  useEffect(() => {
    if (hayError && enfocarReintentar) errorRef.current?.querySelector('button')?.focus();
  }, [hayError, enfocarReintentar]);

  if (estado.estado === 'cargando') {
    return (
      <>
        <LeyendaCalendario />
        <Cargando etiqueta={TEXTOS_CALENDARIO.cargando} renglones={6} />
      </>
    );
  }
  if (estado.estado === 'error') {
    return (
      <div ref={errorRef}>
        <ErrorCarga mensaje={`${TEXTOS_PANEL.errorAgenda} ${estado.mensaje}`.trim()} onReintentar={onReintentar} />
      </div>
    );
  }
  const variables: VariablesCss = {
    '--cal-alto-hora': eje.altoHora,
    '--cal-horas': eje.hastaHora - eje.desdeHora,
  };
  return (
    <>
      <LeyendaCalendario />
      <AyudaCalendario id={idAyuda} />
      {estado.sinClases ? <p className={estilos.vacio}>{TEXTOS_CALENDARIO.sinClasesDia}</p> : null}
      <div
        ref={grillaRef}
        role="group"
        tabIndex={-1}
        aria-label={`${TEXTOS_CALENDARIO.calendario}, ${titulo}`}
        aria-describedby={idAyuda}
        aria-busy={releyendo || undefined}
        className={`${estilos.calendario}${releyendo ? ` ${estilos.releyendo}` : ''}`}
        style={variables}
      >
        <div className={estilos.cuerpo}>
          <EjeHoras eje={eje} />
          <div className={estilos.columnas}>
            {estado.columnas.map((columna) => (
              <ColumnaDia
                key={columna.dia}
                columna={columna}
                zona={zona}
                eje={eje}
                onAbrirHueco={onAbrirHueco}
                onAbrirClase={onAbrirClase}
                onAbrirBloqueo={onAbrirBloqueo}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
