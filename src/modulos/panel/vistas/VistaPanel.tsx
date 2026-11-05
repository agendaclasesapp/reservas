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
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alerta, Boton, Cargando, Dialogo, ErrorCarga, Icono, Vacio } from '../../../ui';
import { formatearFecha, type Dia } from '../../../lib/fechas';
import type { LimitesAgenda } from '../../agenda/logica';
import type { EstadoAlumnos } from '../../lista/logica';
import {
  MENSAJES_PANEL,
  type Contadores,
  type Decision,
  type EjeCalendario,
  type EstadoLecturaPanel,
  type FilaAgendaDias,
  type NavegacionCalendario,
  type ResultadoRespuestaCalendario,
  type SolicitudEnCalendario,
} from '../logica';
import { AccionesVista, type ResultadoCopia } from './AccionesVista';
import { BarraCalendario } from './BarraCalendario';
import { BloqueoForm } from './BloqueoForm';
import { CalendarioPanel } from './CalendarioPanel';
import type { EstadoCalendario } from './calendario';
import { ContadoresPanel } from './ContadoresPanel';
import type { AccionesPanel, ResultadoPanel } from './contrato';
import { DetalleCalendario } from './DetalleCalendario';
import { fechaConHora, textoRango, TEXTOS_BLOQUEO, TEXTOS_CALENDARIO, TEXTOS_PANEL } from './formato';
import { ListaAgendaProfesor } from './ListaAgendaProfesor';
import estilos from './VistaPanel.module.css';

export type VistaPanelProps = {
  /** Día mostrado (`?d=`), AAAA-MM-DD en el huso del profesor. */
  dia: Dia;
  /** Huso IANA del profesor: las horas se muestran siempre en él (AGE-08). */
  zona: string;
  /** Extremos de `agenda_profesor`: desde un año atrás hasta un año adelante (SEC-09). */
  limites: LimitesAgenda;
  /** Los huecos del día para «Ver como lista» (la misma lectura que el calendario). */
  agenda: EstadoLecturaPanel<FilaAgendaDias[]>;
  /** Lo que se dibuja en la grilla del día: cargando, error con el mensaje genérico o listo con sus clases (CC-02). */
  calendario: EstadoCalendario;
  /** Se vuelve a leer con la grilla anterior a la vista (cambio de día): `aria-busy`. */
  calendarioReleyendo?: boolean;
  /** Eje de horas y alto de la hora que da la lógica (CAL-04, DEC-44 A, DEC-50 A). */
  eje: EjeCalendario;
  /** `navegacionCalendario` de la lógica: título y destinos de las flechas y de «Hoy»; `null` = deshabilitada (CAL-03). */
  navegacion: NavegacionCalendario;
  contadores: EstadoLecturaPanel<Contadores>;
  alumnos: EstadoAlumnos;
  /** `sesion.profesor.activo` (PRF-08). */
  profesorActivo: boolean;
  acciones: AccionesPanel;
  onCambiarDia: (dia: Dia) => void;
  /** Vuelve a leer la agenda: «Reintentar» y después de cada operación. */
  onRecargarAgenda: () => void;
  onRecargarContadores: () => void;
  onRecargarAlumnos: () => void;
  /**
   * «Copiar enlace de este día» (CAL-20, solo vista Día): `enlace` es el de `enlaceDia` de la lógica (`null` = no hay,
   * el botón queda deshabilitado) y `copiar` el portapapeles inyectable (`true` = copió). Sin esta prop no se ofrece.
   */
  copiarEnlace?: { enlace: string | null; copiar: (texto: string) => Promise<boolean> };
  /** Solo para pruebas: fuerza la columna (escritorio) o el diálogo (móvil) en lugar de medir la pantalla. */
  escritorio?: boolean;
};

/** Escritorio: desde 60 rem (el mismo corte `lg` de tokens.css). */
const CONSULTA_ESCRITORIO = '(min-width: 60rem)';

function suscribirPantalla(avisar: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const medida = window.matchMedia(CONSULTA_ESCRITORIO);
  medida.addEventListener('change', avisar);
  return () => medida.removeEventListener('change', avisar);
}

function esEscritorioAhora(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(CONSULTA_ESCRITORIO).matches;
}

function useEscritorio(): boolean {
  return useSyncExternalStore(suscribirPantalla, esEscritorioAhora, () => false);
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
  contadores,
  alumnos,
  profesorActivo,
  acciones,
  onCambiarDia,
  onRecargarAgenda,
  onRecargarContadores,
  onRecargarAlumnos,
  copiarEnlace,
  escritorio,
}: VistaPanelProps) {
  const detectado = useEscritorio();
  const enEscritorio = escritorio ?? detectado;
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoPanel | null>(null);
  const [bloqueando, setBloqueando] = useState(false);
  const [modoLista, setModoLista] = useState(false);
  const [copia, setCopia] = useState<ResultadoCopia>('ninguno');
  /** Una solicitud que ya no se puede responder (vencida, ya respondida): el motivo queda sobre la agenda (`role=alert`). */
  const [falloRespuesta, setFalloRespuesta] = useState('');
  /** B18 (A11Y-48): hubo una acción de la persona; si después falla la lectura, el foco va a «Reintentar». */
  const [accionReciente, setAccionReciente] = useState(false);
  /** Adónde va el foco tras una operación: la grilla (calendario) o el resultado (lista). */
  const [focoTras, setFocoTras] = useState<'grilla' | 'resultado'>('resultado');
  const resultadoRef = useRef<HTMLDivElement>(null);
  const grillaRef = useRef<HTMLDivElement>(null);

  const filas = agenda.datos ?? [];
  const fila = seleccion === null ? undefined : filas.find((f) => f.inicio === seleccion);

  // El resultado se anuncia (región `status`). En la lista recibe el foco (la fila que se tocó ya cambió); en el
  // calendario el foco va a la grilla, porque el bloque que abrió el detalle cambió o ya no existe (A11Y-38).
  useEffect(() => {
    if (resultado === null) return;
    if (focoTras === 'grilla' && grillaRef.current) grillaRef.current.focus();
    else resultadoRef.current?.focus();
  }, [resultado, focoTras]);

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
  const irADia = (nuevo: Dia) => {
    setSeleccion(null);
    setCopia('ninguno');
    setFalloRespuesta('');
    setAccionReciente(false);
    if (nuevo !== dia) onCambiarDia(nuevo);
  };
  const { anterior, siguiente } = navegacion;
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
      dia={dia}
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
      <Cargando etiqueta={TEXTOS_PANEL.cargandoAgenda} renglones={6} />
    ) : agenda.estado === 'error' && agenda.datos === null ? (
      <ErrorCarga mensaje={`${TEXTOS_PANEL.errorAgenda} ${agenda.error ?? ''}`.trim()} onReintentar={onRecargarAgenda} />
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
            vista="dia"
            titulo={navegacion.titulo}
            elegirDia={{ dia, limites, onElegir: irADia }}
            puedeAnterior={anterior !== null}
            puedeSiguiente={siguiente !== null}
            onAnterior={() => anterior && irADia(anterior.dia)}
            onSiguiente={() => siguiente && irADia(siguiente.dia)}
            onHoy={() => irADia(navegacion.hoy.dia)}
          />
          <AccionesVista
            modoLista={modoLista}
            onModo={() => {
              setSeleccion(null);
              setModoLista((actual) => !actual);
            }}
            copiable={copiarEnlace !== undefined}
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
    </>
  );
}
