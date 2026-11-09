// Vista del panel del profesor `#/panel` (WEB-06, PRF-01, PRF-02, PRF-03, PRF-05, PRF-08, AVI-01, CA-27, CA-28;
// flujos-profesor.md F-07 y F-08). Presentación pura: recibe las lecturas y las acciones ya conectadas por
// `PaginaPanel`. Agenda del día con nombres, contadores en texto con enlace a la lista y, al tocar un hueco, sus
// acciones: un diálogo en móvil y una columna en escritorio. Con el profesor inactivo, aviso y «Crear clase» y «Mover»
// deshabilitados; «Cancelar» sigue (PRF-08). El éxito se anuncia y se muestra sobre la agenda. B10 (AGE-05, AGE-06,
// CA-14, F-09): «Bloquear horarios» abre, en un diálogo, el bloqueo de un rango de horas o de días completos; un hueco
// libre ofrece «Bloquear este horario» y uno bloqueado ofrece «Desbloquear».
// B17 (CAL-01, CAL-03, CAL-07, CAL-08, CAL-19; WEB-14, F-CAL-01..03, F-CAL-09): el día se ve como calendario (grilla con
// eje de horas y bloques de clase); «Ver como lista» (estado local, no va en la dirección) devuelve la lista de huecos
// con las mismas acciones y «Ver como calendario» vuelve a la grilla.
// B18 (CAL-05, CAL-06, CAL-11, CAL-17, CAL-18; WEB-14, F-CAL-04, F-CAL-05, F-CAL-07, F-CAL-11; A11Y-38, A11Y-48, A11Y-53):
// tocar un hueco libre futuro, una clase o un bloqueo propio de la grilla abre el detalle (`DetalleCalendario`: diálogo
// o columna) con las acciones de hoy; al cerrarlo el foco vuelve al bloque (o a la grilla si ya no existe). Repone
// «Elegir día» en la barra (H-B17-03).
// B19 (CAL-12, CAL-20, CA-76, CA-84; DEC-42 A, DEC-43 A; F-CAL-06, F-CAL-10; A11Y-47): con `acciones.responder` el
// detalle y la lista responden una solicitud; confirmar o rechazar se anuncia («Clase confirmada» / «Clase rechazada») y
// el foco va a la grilla; si la solicitud ya no se puede responder se relee y el aviso queda sobre la agenda. Con
// `copiarEnlace`, «Copiar enlace de este día» copia el enlace del día y anuncia «Enlace copiado» (o su fallo).
// B20 (CAL-01, CAL-10, CAL-15, CAL-16, CAL-19; WEB-15, WEB-16; F-CAL-02, F-CAL-03, F-CAL-09; A11Y-49, A11Y-50): la vista
// sale de `navegacion.vista` (la dirección la decide `PaginaPanel`; H-471). En Semana la grilla trae siete columnas o la
// ventana de 3 días (`navegacion.dias`), los encabezados abren la vista Día (y le dan el foco al título), las flechas y
// el deslizamiento de la ventana corren el bloque de días, «Ver como lista» agrupa por día (CC-16) y «Copiar enlace de
// este día» no se ofrece. Los botones Día/Semana y todo destino que cambia la vista van por `onNavegar`.
// B21 (CAL-13, CAL-14, CA-77, CA-78, CA-79, CA-87; ADR-026; F-CAL-08; A11Y-40, A11Y-52): con `reglasArrastre` y desde 60 rem
// el mouse arrastra una clase a un hueco libre; al soltarla sobre un destino válido se abre `ConfirmarMovimiento` (CC-12)
// y, al confirmar, `reglasArrastre.mover` hace lo mismo que «Mover» (mismo anuncio, mismo mensaje de error). Cancelar,
// `Esc` o soltar mal no llaman a nada y el foco vuelve al bloque; tras mover, al bloque movido cuando la lectura nueva
// lo trae. Las reglas no se calculan acá.
import { useEffect, useRef, useState } from 'react';
import { Alerta, Boton, Cargando, Dialogo, ErrorCarga, Icono, Vacio } from '../../../ui';
import { formatearFecha, type Dia } from '../../../lib/fechas';
import type { LimitesAgenda } from '../../agenda/logica';
import type { EstadoAlumnos } from '../../lista/logica';
import {
  abrirDia,
  agruparPorDia,
  MENSAJES_PANEL,
  type Alcance,
  type Contadores,
  type Decision,
  type EjeCalendario,
  type EstadoLecturaPanel,
  type EstadoVistaCalendario,
  type FilaAgendaDias,
  type NavegacionCalendario,
  type ResultadoMover,
  type ResultadoRespuestaCalendario,
  type SolicitudEnCalendario,
} from '../logica';
import { AccionesVista, type ResultadoCopia } from './AccionesVista';
import type { ClaseSoltada, ReglasArrastre } from './arrastre';
import { BarraCalendario } from './BarraCalendario';
import { BloqueoForm } from './BloqueoForm';
import { CalendarioPanel } from './CalendarioPanel';
import type { EstadoCalendario, LineaAhoraDia } from './calendario';
import { ConfirmarMovimiento } from './ConfirmarMovimiento';
import { ContadoresPanel } from './ContadoresPanel';
import { CODIGOS_DESACTUALIZADA, type AccionesPanel, type ResultadoPanel } from './contrato';
import { DetalleCalendario } from './DetalleCalendario';
import {
  fechaConHora,
  resultadoDeMovimiento,
  textoRango,
  TEXTOS_BLOQUEO,
  TEXTOS_CALENDARIO,
  TEXTOS_PANEL,
} from './formato';
import { ListaAgendaProfesor } from './ListaAgendaProfesor';
import { ListaPorDia } from './ListaPorDia';
import { useEscritorio } from './useEscritorio';
import estilos from './VistaPanel.module.css';

export type VistaPanelProps = {
  /** Día mostrado (`?d=`), AAAA-MM-DD en el huso del profesor. */
  dia: Dia;
  /** Huso IANA del profesor: las horas se muestran siempre en él (AGE-08). */
  zona: string;
  /** Extremos de `agenda_profesor`: desde un año atrás hasta un año adelante (SEC-09). */
  limites: LimitesAgenda;
  /** Los huecos de lo que se ve para «Ver como lista» (la misma lectura que el calendario): del día, o de toda la Semana o ventana. */
  agenda: EstadoLecturaPanel<FilaAgendaDias[]>;
  /** Lo que se dibuja en la grilla del día: cargando, error con el mensaje genérico o listo con sus clases (CC-02). */
  calendario: EstadoCalendario;
  /** Se vuelve a leer con la grilla anterior a la vista (cambio de día): `aria-busy`. */
  calendarioReleyendo?: boolean;
  /** Eje de horas y alto de la hora que da la lógica (CAL-04, DEC-44 A, DEC-50 A). */
  eje: EjeCalendario;
  /**
   * `navegacionCalendario` de la lógica: vista, días visibles (siete, 3 de la ventana o uno), título y destinos de las
   * flechas y de «Hoy»; `null` = deshabilitada (CAL-03, H-475). La vista sale de acá (H-471).
   */
  navegacion: NavegacionCalendario;
  /** CAL-16: la Semana es la ventana de 3 días (menos de 60 rem). Lo decide `PaginaPanel`; solo vale en la vista Semana. */
  ventana?: boolean;
  contadores: EstadoLecturaPanel<Contadores>;
  alumnos: EstadoAlumnos;
  /** `sesion.profesor.activo` (PRF-08). */
  profesorActivo: boolean;
  acciones: AccionesPanel;
  /** Cambia el día en la vista Día (flechas, «Hoy» y «Elegir día»). */
  onCambiarDia: (dia: Dia) => void;
  /**
   * B20: navega a un estado completo (vista y día): botones Día/Semana, flechas, «Hoy» y deslizamiento en Semana,
   * encabezados que abren la vista Día. Sin él no se ofrecen los botones Día/Semana y la Semana no se puede recorrer.
   */
  onNavegar?: (destino: EstadoVistaCalendario) => void;
  /** B20 (CAL-10): `lineaAhora` de la lógica para un día (null si no es hoy o la hora sale del eje). */
  lineaAhora?: (dia: Dia) => LineaAhoraDia | null;
  /** Vuelve a leer la agenda: «Reintentar» y después de cada operación. */
  onRecargarAgenda: () => void;
  onRecargarContadores: () => void;
  onRecargarAlumnos: () => void;
  /**
   * «Copiar enlace de este día» (CAL-20, solo vista Día): `enlace` es el de `enlaceDia` de la lógica (`null` = no hay,
   * el botón queda deshabilitado) y `copiar` el portapapeles inyectable (`true` = copió). Sin esta prop no se ofrece.
   */
  copiarEnlace?: { enlace: string | null; copiar: (texto: string) => Promise<boolean> };
  /**
   * B21 (CAL-13, CAL-14, ADR-026): reglas del arrastre con el mouse (`reglasDeArrastre` de `PaginaPanel`, sobre
   * `logica/arrastre.ts`). Solo valen desde 60 rem y en la grilla; sin ellas la grilla no arrastra nada.
   */
  reglasArrastre?: ReglasArrastre;
  /** Solo para pruebas: fuerza la columna (escritorio) o el diálogo (móvil) en lugar de medir la pantalla. */
  escritorio?: boolean;
};

/** El botón de la clase de la grilla con ese `clase_id`: dos clases pueden empezar a la misma hora (carriles). */
function bloqueDeClase(grilla: HTMLElement | null, claseId: string | null): HTMLElement | undefined {
  if (claseId === null) return undefined;
  return Array.from(grilla?.querySelectorAll<HTMLElement>('[data-tipo="clase"]') ?? []).find(
    (el) => el.dataset['claseId'] === claseId,
  );
}

/** El botón de la clase que empieza en `inicio`: solo para la clase ya movida, cuyo destino era un hueco libre (nadie más empieza ahí). */
function bloqueEnInicio(grilla: HTMLElement | null, inicio: string): HTMLElement | undefined {
  return Array.from(grilla?.querySelectorAll<HTMLElement>('[data-tipo="clase"]') ?? []).find(
    (el) => el.dataset['inicio'] === inicio,
  );
}

function tituloDelHueco(fila: FilaAgendaDias, zona: string): string {
  const cuando = `${formatearFecha(fila.inicio, zona)}, ${textoRango(fila, zona)}`;
  if (fila.estado === 'libre') return `Hueco libre del ${cuando}`;
  if (fila.estado === 'bloqueado') return `Horario bloqueado del ${cuando}`;
  return `Clase del ${cuando}`;
}

export function VistaPanel({
  dia,
  zona,
  limites,
  agenda,
  calendario,
  calendarioReleyendo = false,
  eje,
  navegacion,
  ventana: ventanaDePagina = false,
  contadores,
  alumnos,
  profesorActivo,
  acciones,
  onCambiarDia,
  onNavegar,
  lineaAhora,
  onRecargarAgenda,
  onRecargarContadores,
  onRecargarAlumnos,
  copiarEnlace,
  reglasArrastre,
  escritorio,
}: VistaPanelProps) {
  const detectado = useEscritorio();
  const enEscritorio = escritorio ?? detectado;
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoPanel | null>(null);
  const [bloqueando, setBloqueando] = useState(false);
  const [modoLista, setModoLista] = useState(false);
  const [copia, setCopia] = useState<ResultadoCopia>('ninguno');
  /** B21 (CAL-13): la clase soltada sobre un hueco que espera la confirmación; `null` = ninguna. */
  const [movimiento, setMovimiento] = useState<ClaseSoltada | null>(null);
  /** Una solicitud que ya no se puede responder (vencida, ya respondida): el motivo queda sobre la agenda (`role=alert`). */
  const [falloRespuesta, setFalloRespuesta] = useState('');
  /** B18 (A11Y-48): hubo una acción de la persona; si después falla la lectura, el foco va a «Reintentar». */
  const [accionReciente, setAccionReciente] = useState(false);
  /** Adónde va el foco tras una operación: la grilla (calendario) o el resultado (lista). */
  const [focoTras, setFocoTras] = useState<'grilla' | 'resultado'>('resultado');
  const resultadoRef = useRef<HTMLDivElement>(null);
  const grillaRef = useRef<HTMLDivElement>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  /** F-CAL-03: un encabezado de la Semana abrió la vista Día; al llegar el título recibe el foco. */
  const enfocarTitulo = useRef(false);
  /** B21 (A11Y-52): `inicio` de la clase movida; el foco va a su bloque cuando la lectura nueva lo trae. */
  const enfocarClase = useRef<string | null>(null);
  const esSemana = navegacion.vista === 'semana';
  /** CAL-16: la Semana en la ventana de 3 días (menos de 60 rem), según `PaginaPanel`. */
  const ventana = esSemana && ventanaDePagina;

  const filas = agenda.datos ?? [];
  const fila = seleccion === null ? undefined : filas.find((f) => f.inicio === seleccion);

  // El resultado se anuncia (región `status`). En la lista recibe el foco (la fila que se tocó ya cambió); en el
  // calendario el foco va a la grilla, porque el bloque que abrió el detalle cambió o ya no existe (A11Y-38).
  useEffect(() => {
    if (resultado === null) return;
    if (focoTras === 'grilla' && grillaRef.current) grillaRef.current.focus();
    else resultadoRef.current?.focus();
  }, [resultado, focoTras]);

  // A11Y-52: tras mover, el foco vuelve al bloque movido (la grilla ya lo tiene, o cuando llega la relectura).
  useEffect(() => {
    if (enfocarClase.current === null) return;
    const bloque = bloqueEnInicio(grillaRef.current, enfocarClase.current);
    if (!bloque) return;
    enfocarClase.current = null;
    bloque.focus();
  });

  /** Cierra el detalle y devuelve el foco al bloque que lo abrió, o a la grilla si ya no existe (A11Y-38). */
  const cerrar = () => {
    if (!modoLista && enEscritorio && seleccion !== null) {
      const grilla = grillaRef.current;
      const origen = Array.from(grilla?.querySelectorAll<HTMLElement>('[data-inicio]') ?? []).find(
        (el) => el.dataset['inicio'] === seleccion,
      );
      (origen ?? grilla)?.focus();
    }
    setSeleccion(null);
  };
  // F-CAL-03: después de abrir la vista Día desde un encabezado, el foco pasa al título (no se mueve en otros cambios).
  useEffect(() => {
    if (enfocarTitulo.current && navegacion.vista === 'dia') {
      enfocarTitulo.current = false;
      tituloRef.current?.focus();
    }
  }, [navegacion.vista, navegacion.dia]);
  /** Va a un estado de la vista: Día a Día por `onCambiarDia`, lo demás (otra vista, la Semana) por `onNavegar`. */
  const irA = (destino: EstadoVistaCalendario) => {
    if (destino.vista === navegacion.vista && destino.dia === dia) return;
    setSeleccion(null);
    setMovimiento(null);
    enfocarClase.current = null;
    setCopia('ninguno');
    setFalloRespuesta('');
    setAccionReciente(false);
    if (destino.vista === 'dia' && navegacion.vista === 'dia') onCambiarDia(destino.dia);
    else onNavegar?.(destino);
  };
  const irADia = (nuevo: Dia) => irA({ vista: navegacion.vista, dia: nuevo });
  const { anterior, siguiente } = navegacion;
  /** CAL-15: un encabezado dentro del rango abre la vista Día de ese día (`abrirDia`); fuera del rango no hace nada. */
  const abrirDesdeEncabezado = (nuevo: Dia) => {
    const visible = navegacion.dias.find((d) => d.dia === nuevo);
    const destino = visible ? abrirDia(visible) : null;
    if (!destino) return;
    enfocarTitulo.current = true;
    irA(destino);
  };
  /** CAL-16, ADR-026: deslizar a la izquierda es la ventana siguiente; a la derecha, la anterior (como las flechas). */
  const deslizar = (sentido: -1 | 1) => {
    const destino = sentido === 1 ? siguiente : anterior;
    if (destino) irA(destino);
  };
  const elegir = (f: FilaAgendaDias) => {
    setResultado(null);
    setFalloRespuesta('');
    setSeleccion(f.inicio);
  };
  /** Tocar un elemento de la grilla: el detalle se abre por el `inicio` de su fila. */
  const abrirDesdeGrilla = (inicio: string) => {
    setResultado(null);
    setFalloRespuesta('');
    setSeleccion(inicio);
  };
  const hecho = (r: ResultadoPanel, releer = true) => {
    setResultado(r);
    setSeleccion(null);
    setFocoTras(modoLista ? 'resultado' : 'grilla');
    setAccionReciente(true);
    if (releer) {
      onRecargarAgenda();
      onRecargarContadores();
    }
  };
  /** La agenda quedó desactualizada (HUECO_NO_LIBRE, etc.): se relee el rango visible y los contadores (CA-87). */
  const desactualizada = () => {
    onRecargarAgenda();
    onRecargarContadores();
  };

  /**
   * CAL-12 · F-CAL-06: confirma o rechaza la solicitud. Con `ok` se anuncia «Clase confirmada» / «Clase rechazada» y el
   * foco va a la grilla (A11Y-47); la relectura (el bloque pasa a CONFIRMADA o desaparece sin recargar la página) la
   * pidió la lógica (`releer`). Si ya no se puede responder (`desactualizada`, también releída) el motivo queda sobre la
   * agenda; los demás fallos los muestra quien responde, en su diálogo o junto a los botones.
   */
  const responder = acciones.responder;
  const alResponder = responder
    ? async (
        solicitud: SolicitudEnCalendario,
        decision: Decision,
        motivo: string | null,
      ): Promise<ResultadoRespuestaCalendario> => {
        setFalloRespuesta('');
        const r = await responder(solicitud, decision, motivo);
        if (r.ok) {
          const mensaje = r.estado === 'confirmada' ? TEXTOS_CALENDARIO.claseConfirmada : TEXTOS_CALENDARIO.claseRechazada;
          hecho({ mensaje, salteadas: [] }, false);
        } else if (r.desactualizada) {
          setFalloRespuesta(r.mensaje);
          setSeleccion(null);
          if (!modoLista) grillaRef.current?.focus();
        }
        return r;
      }
    : undefined;

  /**
   * CAL-13 · F-CAL-08: la clase se soltó sobre un destino válido. El foco pasa a su bloque antes de abrir el diálogo,
   * para que al cerrarlo sin mover vuelva ahí (A11Y-52); la confirmación se pide, no se mueve nada todavía.
   */
  const alSoltarClase = (soltada: ClaseSoltada) => {
    bloqueDeClase(grillaRef.current, soltada.origen.claseId)?.focus();
    setResultado(null);
    setFalloRespuesta('');
    setMovimiento(soltada);
  };
  /** «Cancelar», `Esc` o cerrar: no cambia nada y el foco queda en el bloque, que sigue en su lugar (CAL-14). */
  const cancelarMovimiento = () => {
    if (movimiento) bloqueDeClase(grillaRef.current, movimiento.origen.claseId)?.focus();
    setMovimiento(null);
  };
  /** «Mover» del diálogo: la misma operación que «Mover» (CA-87); un fallo queda en el diálogo y, si la agenda cambió, se relee. */
  const confirmarMovimiento = async (
    { origen, destino }: ClaseSoltada,
    reglas: ReglasArrastre,
    alcance: Alcance,
  ): Promise<ResultadoMover> => {
    // Como en la lógica (`alcanceDeArrastre`): solo una serie lleva el alcance elegido; el anuncio sale de lo que viajó.
    const viaja: Alcance = origen.elegirAlcance ? alcance : 'solo_esta';
    const r = await reglas.mover(origen, destino, viaja);
    if (r.ok) {
      enfocarClase.current = destino.inicio;
      setMovimiento(null);
      hecho(resultadoDeMovimiento(viaja, destino.inicio, zona, r.salteadas));
    } else if (CODIGOS_DESACTUALIZADA.has(r.codigo)) {
      desactualizada();
    }
    return r;
  };

  const alCopiar = async () => {
    if (!copiarEnlace || copiarEnlace.enlace === null) return;
    setCopia((await copiarEnlace.copiar(copiarEnlace.enlace)) ? 'copiado' : 'fallo');
  };

  const detalle = fila ? (
    <DetalleCalendario
      enEscritorio={enEscritorio}
      titulo={tituloDelHueco(fila, zona)}
      onCerrar={cerrar}
      fila={fila}
      zona={zona}
      dia={fila.dia}
      limites={limites}
      profesorActivo={profesorActivo}
      alumnos={alumnos}
      onReintentarAlumnos={onRecargarAlumnos}
      acciones={acciones}
      onHecho={hecho}
      onDesactualizada={desactualizada}
      onIrAConflicto={cerrar}
      responder={alResponder}
    />
  ) : null;

  const lista =
    agenda.estado === 'cargando' ? (
      <Cargando etiqueta={esSemana ? TEXTOS_PANEL.cargandoAgendaSemana : TEXTOS_PANEL.cargandoAgenda} renglones={6} />
    ) : agenda.estado === 'error' && agenda.datos === null ? (
      <ErrorCarga mensaje={`${TEXTOS_PANEL.errorAgenda} ${agenda.error ?? ''}`.trim()} onReintentar={onRecargarAgenda} />
    ) : esSemana ? (
      <>
        <p className={estilos.nota}>{TEXTOS_PANEL.tocarHueco}</p>
        <ListaPorDia
          dias={agruparPorDia(navegacion.dias, filas)}
          zona={zona}
          profesorActivo={profesorActivo}
          seleccionada={fila ? fila.inicio : null}
          onElegir={elegir}
          responder={alResponder}
        />
      </>
    ) : filas.length === 0 ? (
      <Vacio nivel={3} titulo={TEXTOS_PANEL.sinHuecos} texto={TEXTOS_PANEL.sinHuecosAyuda} />
    ) : (
      <>
        <p className={estilos.nota}>{TEXTOS_PANEL.tocarHueco}</p>
        <ListaAgendaProfesor
          filas={filas}
          zona={zona}
          profesorActivo={profesorActivo}
          seleccionada={fila ? fila.inicio : null}
          onElegir={elegir}
          responder={alResponder}
        />
      </>
    );

  return (
    <>
      <div className={enEscritorio && fila ? estilos.conColumna : estilos.sola}>
        <div className={estilos.principal}>
          <ContadoresPanel lectura={contadores} onReintentar={onRecargarContadores} />
          {!profesorActivo ? <Alerta tipo="aviso">{MENSAJES_PANEL.profesorInactivo}</Alerta> : null}
          <div className={estilos.barra}>
            <Boton
              variante="secundario"
              onClick={() => {
                setResultado(null);
                setSeleccion(null);
                setBloqueando(true);
              }}
            >
              {TEXTOS_BLOQUEO.abrir}
            </Boton>
          </div>
          {/* Región siempre montada para que el resultado se anuncie sin mover el foco antes de tiempo. */}
          <div ref={resultadoRef} tabIndex={-1} role="status" aria-live="polite" className={estilos.resultado}>
            {resultado !== null ? (
              <div className={estilos.exito}>
                <p className={estilos.exitoTitulo}>
                  <Icono nombre="tilde" etiqueta="Éxito" />
                  <span>{resultado.mensaje}</span>
                </p>
                {resultado.detalle ? <p className={estilos.exitoDetalle}>{resultado.detalle}</p> : null}
                {resultado.salteadas.length > 0 ? (
                  <>
                    <p className={estilos.exitoDetalle}>{MENSAJES_PANEL.salteadas}</p>
                    <ul className={estilos.salteadas}>
                      {resultado.salteadas.map((s) => (
                        <li key={s}>{fechaConHora(s, zona)}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
          {falloRespuesta !== '' ? <Alerta tipo="error">{falloRespuesta}</Alerta> : null}
          <BarraCalendario
            vista={navegacion.vista}
            ventana={ventana}
            tituloRef={tituloRef}
            titulo={navegacion.titulo}
            onVista={onNavegar ? (vista) => irA({ vista, dia }) : undefined}
            elegirDia={{ dia, limites, onElegir: irADia }}
            puedeAnterior={anterior !== null}
            puedeSiguiente={siguiente !== null}
            onAnterior={() => anterior && irA(anterior)}
            onSiguiente={() => siguiente && irA(siguiente)}
            onHoy={() => irA(navegacion.hoy)}
          />
          <AccionesVista
            modoLista={modoLista}
            onModo={() => {
              setSeleccion(null);
              setModoLista((actual) => !actual);
            }}
            copiable={!esSemana && copiarEnlace !== undefined}
            hayEnlace={copiarEnlace?.enlace != null}
            onCopiar={() => void alCopiar()}
            copia={copia}
            enlace={copiarEnlace?.enlace ?? null}
          />
          <p className={estilos.nota}>Horarios en el huso {zona}.</p>
          {modoLista ? (
            lista
          ) : (
            <CalendarioPanel
              estado={calendario}
              releyendo={calendarioReleyendo}
              titulo={navegacion.titulo}
              zona={zona}
              eje={eje}
              onReintentar={onRecargarAgenda}
              enfocarReintentar={accionReciente}
              onAbrirHueco={(hueco) => abrirDesdeGrilla(hueco.inicio)}
              onAbrirClase={(clase) => abrirDesdeGrilla(clase.fila.inicio)}
              onAbrirBloqueo={(bloqueo) => abrirDesdeGrilla(bloqueo.inicio)}
              grillaRef={grillaRef}
              vista={navegacion.vista}
              dias={navegacion.dias}
              lineaAhora={lineaAhora}
              onAbrirDia={esSemana && onNavegar ? abrirDesdeEncabezado : undefined}
              onDeslizar={ventana && onNavegar ? deslizar : undefined}
              reglasArrastre={enEscritorio ? reglasArrastre : undefined}
              onSoltarClase={alSoltarClase}
            />
          )}
        </div>
        {enEscritorio && fila ? detalle : null}
      </div>
      <Dialogo abierto={bloqueando} titulo={TEXTOS_BLOQUEO.tituloDialogo} onCerrar={() => setBloqueando(false)}>
        <BloqueoForm
          origen={{ tipo: 'periodo', dia }}
          zona={zona}
          limites={limites}
          acciones={acciones}
          onHecho={(r) => {
            setBloqueando(false);
            hecho(r);
          }}
          onDesactualizada={desactualizada}
          onIrAConflicto={() => setBloqueando(false)}
        />
      </Dialogo>
      {!enEscritorio && fila ? detalle : null}
      {movimiento && reglasArrastre ? (
        <ConfirmarMovimiento
          clase={movimiento.clase}
          dia={movimiento.dia}
          destino={movimiento.destino}
          zona={zona}
          esSerie={movimiento.origen.elegirAlcance}
          onConfirmar={(alcance) => confirmarMovimiento(movimiento, reglasArrastre, alcance)}
          onCancelar={cancelarMovimiento}
        />
      ) : null}
    </>
  );
}
