// Vista del panel del profesor `#/panel` (WEB-06, PRF-01, PRF-02, PRF-03, PRF-05, PRF-08, AVI-01, CA-27, CA-28;
// flujos-profesor.md F-07 y F-08). Presentación pura: recibe las lecturas y las acciones ya conectadas por
// `PaginaPanel`. Agenda del día con nombres, contadores en texto con enlace a la lista y, al tocar un hueco, sus
// acciones: un diálogo en móvil y una columna en escritorio. Con el profesor inactivo, aviso y «Crear clase» y «Mover»
// deshabilitados; «Cancelar» sigue (PRF-08). El éxito se anuncia y se muestra sobre la agenda. «Bloquear» y
// «Desbloquear» son de B10.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alerta, Boton, Cargando, Dialogo, ErrorCarga, Icono, Vacio } from '../../../ui';
import { formatearFecha, type Dia } from '../../../lib/fechas';
import type { LimitesAgenda } from '../../agenda/logica';
import type { EstadoAlumnos } from '../../lista/logica';
import { MENSAJES_PANEL, type Contadores, type EstadoLecturaPanel, type FilaAgendaProfesor } from '../logica';
import { ContadoresPanel } from './ContadoresPanel';
import type { AccionesPanel, ResultadoPanel } from './contrato';
import { fechaConHora, textoRango, TEXTOS_PANEL } from './formato';
import { ListaAgendaProfesor } from './ListaAgendaProfesor';
import { PanelAcciones } from './PanelAcciones';
import { SelectorDiaPanel } from './SelectorDiaPanel';
import estilos from './VistaPanel.module.css';

export type VistaPanelProps = {
  /** Día mostrado (`?d=`), AAAA-MM-DD en el huso del profesor. */
  dia: Dia;
  /** Huso IANA del profesor: las horas se muestran siempre en él (AGE-08). */
  zona: string;
  /** Extremos de `agenda_profesor`: desde un año atrás hasta un año adelante (SEC-09). */
  limites: LimitesAgenda;
  agenda: EstadoLecturaPanel<FilaAgendaProfesor[]>;
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

function tituloDelHueco(fila: FilaAgendaProfesor, zona: string): string {
  const cuando = `${formatearFecha(fila.inicio, zona)}, ${textoRango(fila, zona)}`;
  return fila.estado === 'libre' ? `Hueco libre del ${cuando}` : `Clase del ${cuando}`;
}

export function VistaPanel({
  dia,
  zona,
  limites,
  agenda,
  contadores,
  alumnos,
  profesorActivo,
  acciones,
  onCambiarDia,
  onRecargarAgenda,
  onRecargarContadores,
  onRecargarAlumnos,
  escritorio,
}: VistaPanelProps) {
  const detectado = useEscritorio();
  const enEscritorio = escritorio ?? detectado;
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoPanel | null>(null);
  const resultadoRef = useRef<HTMLDivElement>(null);
  const columnaRef = useRef<HTMLHeadingElement>(null);

  const filas = agenda.datos ?? [];
  const fila = seleccion === null ? undefined : filas.find((f) => f.inicio === seleccion);

  // El resultado se anuncia (región `status`) y recibe el foco: la fila que se tocó ya cambió.
  useEffect(() => {
    if (resultado !== null) resultadoRef.current?.focus();
  }, [resultado]);

  // En escritorio la columna aparece junto a la agenda: el foco pasa a su título al elegir otro hueco.
  useEffect(() => {
    if (enEscritorio && seleccion !== null) columnaRef.current?.focus();
  }, [enEscritorio, seleccion]);

  const cerrar = () => setSeleccion(null);
  const elegir = (f: FilaAgendaProfesor) => {
    setResultado(null);
    setSeleccion(f.inicio);
  };
  const hecho = (r: ResultadoPanel) => {
    setResultado(r);
    setSeleccion(null);
    onRecargarAgenda();
  };

  const contenido = fila ? (
    <PanelAcciones
      key={fila.inicio}
      fila={fila}
      zona={zona}
      dia={dia}
      limites={limites}
      profesorActivo={profesorActivo}
      alumnos={alumnos}
      onReintentarAlumnos={onRecargarAlumnos}
      acciones={acciones}
      onHecho={hecho}
      onDesactualizada={onRecargarAgenda}
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
        />
      </>
    );

  return (
    <>
      <div className={enEscritorio && fila ? estilos.conColumna : estilos.sola}>
        <div className={estilos.principal}>
          <ContadoresPanel lectura={contadores} onReintentar={onRecargarContadores} />
          {!profesorActivo ? <Alerta tipo="aviso">{MENSAJES_PANEL.profesorInactivo}</Alerta> : null}
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
          <SelectorDiaPanel
            dia={dia}
            zona={zona}
            limites={limites}
            onCambio={(nuevo) => {
              setSeleccion(null);
              onCambiarDia(nuevo);
            }}
          />
          <p className={estilos.nota}>Horarios en el huso {zona}.</p>
          {lista}
        </div>
        {enEscritorio && fila ? (
          <aside aria-labelledby="panel-columna-titulo" className={estilos.columna}>
            <div className={estilos.columnaCabecera}>
              <h2 id="panel-columna-titulo" ref={columnaRef} tabIndex={-1} className={estilos.columnaTitulo}>
                {tituloDelHueco(fila, zona)}
              </h2>
              <Boton variante="secundario" onClick={cerrar}>
                Cerrar
              </Boton>
            </div>
            {contenido}
          </aside>
        ) : null}
      </div>
      {!enEscritorio && fila ? (
        <Dialogo abierto titulo={tituloDelHueco(fila, zona)} onCerrar={cerrar}>
          {contenido}
        </Dialogo>
      ) : null}
    </>
  );
}
