// CC-13 · Detalle del elemento tocado del calendario (CAL-05, CAL-06, CAL-11; CA-70, CA-71, CA-79; F-CAL-04,
// F-CAL-05, F-CAL-07; A11Y-38, A11Y-53; SEC-16, SEC-35): quién toma la clase, el titular y la observación (o el
// motivo del bloqueo) con las acciones de hoy de `PanelAcciones` y sus formularios, sin reglas nuevas: qué se ofrece
// lo decide la lógica (`accionesFila`, `accionesBloqueo`, `permisosPanel`). En un `Dialogo` por debajo de 60 rem
// (foco al título y atrapado; Esc y «Cerrar» lo cierran) y en una columna en escritorio (el foco pasa a su `h2`,
// `tabIndex=-1`; Esc y «Cerrar» lo cierran y quien lo monta devuelve el foco al bloque que lo abrió). Con la agenda
// inactiva «Mover» y «Crear clase» quedan deshabilitados con su porqué y «Cancelar» sigue (PRF-08, A11Y-53). Todo
// texto de la base se muestra como texto: no hay HTML armado con él.
import { useEffect, useRef } from 'react';
import { Boton, Dialogo } from '../../../ui';
import { accionesFila } from '../logica';
import { TEXTOS_PANEL } from './formato';
import { PanelAcciones, type PanelAccionesProps } from './PanelAcciones';
import estilos from './DetalleCalendario.module.css';

export type DetalleCalendarioProps = PanelAccionesProps & {
  /** Escritorio (>= 60 rem): columna; si no, diálogo. */
  enEscritorio: boolean;
  /** «Clase del jueves 12 de noviembre, 10:00 a 11:00»: nombra el diálogo y la columna. */
  titulo: string;
  /** «Cerrar» y Esc: quien lo monta devuelve el foco (A11Y-38). */
  onCerrar: () => void;
};

const ID_TITULO = 'panel-columna-titulo';

export function DetalleCalendario({ enEscritorio, titulo, onCerrar, ...panel }: DetalleCalendarioProps) {
  const tituloRef = useRef<HTMLHeadingElement>(null);

  // En columna el foco pasa a su título al abrirla o al tocar otro elemento (A11Y-38).
  useEffect(() => {
    if (enEscritorio) tituloRef.current?.focus();
  }, [enEscritorio, panel.fila.inicio]);

  // Una clase que no se gestiona dice por qué (como la lista): ya pasó, o tiene un pedido sin responder (`solicitud_id`
  // o pendiente), que se responde en la Lista. Es el permiso de las acciones sin mirar si el profesor está activo.
  const { fila } = panel;
  const gestionable = accionesFila(fila, true);
  const sinGestion = fila.estado === 'ocupado' && !gestionable.mover && !gestionable.cancelar;
  // Esc cierra la columna si el foco está en ella; un diálogo abierto encima (rechazo, confirmación) se queda con su Esc.
  const columnaRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!enEscritorio) return;
    const alTecla = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape' && !evento.defaultPrevented && columnaRef.current?.contains(document.activeElement)) {
        onCerrar();
      }
    };
    document.addEventListener('keydown', alTecla);
    return () => document.removeEventListener('keydown', alTecla);
  }, [enEscritorio, onCerrar]);

  const contenido = (
    <>
      <PanelAcciones key={fila.inicio} {...panel} />
      {sinGestion && fila.pasada ? <p className={estilos.nota}>{TEXTOS_PANEL.yaPaso}</p> : null}
      {sinGestion && !fila.pasada ? (
        <p className={estilos.nota}>
          {TEXTOS_PANEL.pedidoSinResponder} <a href="#/lista">{TEXTOS_PANEL.responderEnLista}</a>
        </p>
      ) : null}
    </>
  );

  if (!enEscritorio) {
    return (
      <Dialogo abierto titulo={titulo} onCerrar={onCerrar}>
        {contenido}
      </Dialogo>
    );
  }
  return (
    <aside ref={columnaRef} aria-labelledby={ID_TITULO} className={estilos.columna}>
      <div className={estilos.cabecera}>
        <h2 id={ID_TITULO} ref={tituloRef} tabIndex={-1} className={estilos.titulo}>
          {titulo}
        </h2>
        <Boton variante="secundario" onClick={onCerrar}>
          Cerrar
        </Boton>
      </div>
      {contenido}
    </aside>
  );
}
