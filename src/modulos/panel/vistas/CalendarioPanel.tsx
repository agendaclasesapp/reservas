// CC-02 · Calendario del Panel (CAL-04..CAL-08, CAL-11, CAL-17, CAL-18; WEB-14, F-CAL-01, F-CAL-04..F-CAL-07,
// F-CAL-11): contenedor de la grilla con sus estados. Cargando (leyenda real y esqueleto, `role="status"`), releyendo
// (la grilla anterior queda con `aria-busy` hasta que llega la nueva), error (mensaje genérico recibido y «Reintentar»,
// `role="alert"`; el foco va a «Reintentar» solo si el error llegó tras una acción, A11Y-48), vacío («No hay clases este
// día» encima de la grilla, que sigue con sus huecos libres) y listo (eje de horas y una columna por día). Un solo
// `role="group"` «Calendario, <título>» descrito por la ayuda (A11Y-35, CC-11). El eje (ya extendido para cubrir lo que
// queda fuera de la grilla, DEC-44 A) y el alto de la hora (DEC-50 A) los da la lógica; el contenedor es enfocable
// por programa (`tabIndex=-1`) para devolver el foco a la grilla cuando el bloque que abrió el detalle ya no existe.
// B20 (CAL-10, CAL-15, CAL-16, CAL-18; WEB-15; F-CAL-02, F-CAL-03; A11Y-44, A11Y-46): en la vista Semana la grilla suma
// una fila de encabezados «Lun 26/10» (CC-04, abren la vista Día), una columna por día visible —siete, o los 3 de la
// ventana bajo 60 rem—, la columna de hoy resaltada con la línea de la hora actual (CC-09) y «No hay clases esta
// semana»; con `onDeslizar` (solo la ventana de 3 días) el dedo la corre con Pointer Events (ADR-026). Los días y su
// estado (`esHoy`, `enRango`), las flechas y la posición de la línea vienen de la lógica: acá no se calcula nada.
// B21 (CAL-13, CAL-14; ADR-026; A11Y-40): con `reglasArrastre` (solo desde 60 rem; la lógica decide qué se arrastra y
// dónde se suelta) el mouse arrastra una clase confirmada futura a un hueco libre; al soltar sobre un destino válido se
// llama a `onSoltarClase` (la vista pide confirmar). El contenedor de la grilla lleva `data-calendario` para ubicar las
// columnas; el arrastre no le pone manejadores (empieza en el bloque y sigue en `window`), así que no pisa los del
// deslizamiento: gestos disjuntos, touch en la ventana de 3 días y mouse en escritorio (ADR-026 A-2).
// B22 (A11Y-35, A11Y-37; NFR-11): la grilla es un solo tope de Tab (`useTecladoGrilla`: ítem activo con `tabIndex=0`, el
// resto `-1`) y las flechas, Inicio y Fin mueven el foco entre los ítems tocables; Tab sale de la grilla (sin trampas).
import { useEffect, useId, useRef, type Ref } from 'react';
import { Cargando, ErrorCarga } from '../../../ui';
import type { Dia } from '../../../lib/fechas';
import type { ArrastreEnColumna, ClaseSoltada, ReglasArrastre } from './arrastre';
import type {
  BloqueClase,
  DiaVisible,
  EjeCalendario,
  ElementoBloqueo,
  ElementoHueco,
  VistaCalendario,
} from '../logica';
import type { EstadoCalendario, LineaAhoraDia, VariablesCss } from './calendario';
import { AyudaCalendario } from './AyudaCalendario';
import { ColumnaDia } from './ColumnaDia';
import { EjeHoras } from './EjeHoras';
import { EncabezadoDia } from './EncabezadoDia';
import { TEXTOS_CALENDARIO, TEXTOS_PANEL } from './formato';
import { LeyendaCalendario } from './LeyendaCalendario';
import { itemsNavegables, useTecladoGrilla } from './tecladoGrilla';
import { useArrastreClase } from './useArrastreClase';
import { useDeslizamiento } from './useDeslizamiento';
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
  /** B20: la vista; en Semana hay encabezados por día y «No hay clases esta semana». Por defecto, Día. */
  vista?: VistaCalendario;
  /** B20: los días visibles de `navegacionCalendario` (hoy, dentro del rango). Sin ellos, todos en rango y ninguno es hoy. */
  dias?: readonly DiaVisible[];
  /** B20 (CAL-10): `lineaAhora` de la lógica para un día (null si no es hoy o la hora sale del eje). */
  lineaAhora?: (dia: Dia) => LineaAhoraDia | null;
  /** B20 (CAL-15): abre la vista Día de un encabezado; sin él los encabezados son solo texto. */
  onAbrirDia?: (dia: Dia) => void;
  /** B20 (CAL-16, ADR-026): deslizamiento con el dedo; solo en la ventana de 3 días (-1 anterior, 1 siguiente). */
  onDeslizar?: (sentido: -1 | 1) => void;
  /** B21 (CAL-13, ADR-026): reglas del arrastre con el mouse; solo se pasan desde 60 rem y con la lógica conectada. */
  reglasArrastre?: ReglasArrastre;
  /** B21 (CAL-13): se soltó la clase sobre un hueco destino válido; la vista pide confirmar el movimiento. */
  onSoltarClase?: (soltada: ClaseSoltada) => void;
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
  vista = 'dia',
  dias,
  lineaAhora,
  onAbrirDia,
  onDeslizar,
  reglasArrastre,
  onSoltarClase,
}: CalendarioPanelProps) {
  const idAyuda = useId();
  const errorRef = useRef<HTMLDivElement>(null);
  const hayError = estado.estado === 'error';
  const deslizamiento = useDeslizamiento(onDeslizar);
  const arrastre = useArrastreClase({
    reglas: onSoltarClase ? reglasArrastre : undefined,
    eje,
    alSoltar: (soltada) => onSoltarClase?.(soltada),
  });
  const enColumna: ArrastreEnColumna | undefined = reglasArrastre
    ? {
        estado: arrastre.estado,
        puedeArrastrar: (clase) => reglasArrastre.origenDe(clase.fila) !== null,
        iniciar: arrastre.iniciar,
        esDestino: arrastre.esDestino,
      }
    : undefined;

  // A11Y-37: los ítems tocables de las columnas en rango, en el orden del DOM; un solo tope de Tab para todos.
  const items = itemsNavegables(
    estado.estado === 'listo' ? estado.columnas : [],
    (dia) => dias?.find((d) => d.dia === dia)?.enRango ?? true,
    { hueco: onAbrirHueco !== undefined, clase: onAbrirClase !== undefined, bloqueo: onAbrirBloqueo !== undefined },
  );
  const teclado = useTecladoGrilla(items);

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
  const esSemana = vista === 'semana';
  // Cada columna con su estado de día (hoy, dentro del rango); sin `dias`, todas en rango y ninguna es hoy.
  const visibles: DiaVisible[] = estado.columnas.map(
    (columna) => dias?.find((d) => d.dia === columna.dia) ?? { dia: columna.dia, enRango: true, esHoy: false },
  );
  const lineas = visibles.map((d) => (d.enRango && lineaAhora ? lineaAhora(d.dia) : null));
  const lineaDeHoy = lineas.find((linea) => linea !== null) ?? null;
  return (
    <>
      <LeyendaCalendario />
      <AyudaCalendario id={idAyuda} />
      {estado.sinClases ? (
        <p className={estilos.vacio}>{esSemana ? TEXTOS_CALENDARIO.sinClasesSemana : TEXTOS_CALENDARIO.sinClasesDia}</p>
      ) : null}
      <div
        ref={grillaRef}
        role="group"
        tabIndex={-1}
        aria-label={`${TEXTOS_CALENDARIO.calendario}, ${titulo}`}
        aria-describedby={idAyuda}
        aria-busy={releyendo || undefined}
        data-calendario=""
        data-arrastrando={arrastre.estado.activo || undefined}
        className={`${estilos.calendario}${releyendo ? ` ${estilos.releyendo}` : ''}${deslizamiento ? ` ${estilos.deslizable}` : ''}`}
        style={variables}
        {...deslizamiento}
      >
        {esSemana ? (
          <div className={estilos.encabezados}>
            <div aria-hidden="true" />
            <div className={estilos.columnas}>
              {visibles.map((d) => (
                <EncabezadoDia key={d.dia} dia={d.dia} esHoy={d.esHoy} enRango={d.enRango} onAbrir={onAbrirDia} />
              ))}
            </div>
          </div>
        ) : null}
        <div className={estilos.cuerpo}>
          <EjeHoras eje={eje} ahora={lineaDeHoy} />
          <div className={`${estilos.columnas} ${estilos.cuerpoColumnas}`}>
            {estado.columnas.map((columna, i) => (
              <ColumnaDia
                key={columna.dia}
                columna={columna}
                zona={zona}
                eje={eje}
                onAbrirHueco={onAbrirHueco}
                onAbrirClase={onAbrirClase}
                onAbrirBloqueo={onAbrirBloqueo}
                resaltar={esSemana && visibles[i]?.esHoy === true}
                enRango={visibles[i]?.enRango ?? true}
                lineaAhora={lineas[i] ?? null}
                arrastre={enColumna}
                navegacionDe={(clave) => teclado.navegacionDe(columna.dia, clave)}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
