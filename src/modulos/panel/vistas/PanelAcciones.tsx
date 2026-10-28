// Contenido del panel de acciones de un hueco (WEB-06, F-07 paso 3, F-08): hueco libre → «Crear clase»; clase
// ocupada → sus datos y «Mover» / «Cancelar». Se muestra en un diálogo en móvil y en una columna en escritorio
// (`VistaPanel` elige el contenedor). «Bloquear» y «Desbloquear» son de B10: no están. Con el profesor inactivo, «Crear
// clase» y «Mover» quedan deshabilitados y «Cancelar» sigue (PRF-08).
import { useEffect, useRef, useState } from 'react';
import { Boton, Insignia } from '../../../ui';
import type { Dia } from '../../../lib/fechas';
import type { LimitesAgenda } from '../../agenda/logica';
import type { EstadoAlumnos } from '../../lista/logica';
import { accionesFila, MENSAJES_PANEL, permisosPanel, type FilaAgendaProfesor } from '../logica';
import { CancelarClaseForm } from './CancelarClaseForm';
import type { AccionesPanel, ResultadoPanel } from './contrato';
import { CrearClaseForm } from './CrearClaseForm';
import { TEXTOS_PANEL } from './formato';
import { MoverClaseForm } from './MoverClaseForm';
import { nombreVisible } from '../../lista/logica';
import estilos from './Acciones.module.css';

export type PanelAccionesProps = {
  fila: FilaAgendaProfesor;
  zona: string;
  /** Día que mira el panel. */
  dia: Dia;
  limites: LimitesAgenda;
  profesorActivo: boolean;
  alumnos: EstadoAlumnos;
  onReintentarAlumnos: () => void;
  acciones: AccionesPanel;
  onHecho: (resultado: ResultadoPanel) => void;
  /** La agenda quedó desactualizada: hay que volver a leerla. */
  onDesactualizada: () => void;
};

type Modo = 'menu' | 'mover' | 'cancelar';

const TITULO_MODO: Record<Modo | 'crear', string> = {
  crear: 'Crear clase',
  menu: 'Elegí qué hacer con la clase',
  mover: 'Mover la clase',
  cancelar: 'Cancelar la clase',
};

export function PanelAcciones({
  fila,
  zona,
  dia,
  limites,
  profesorActivo,
  alumnos,
  onReintentarAlumnos,
  acciones,
  onHecho,
  onDesactualizada,
}: PanelAccionesProps) {
  const [modo, setModo] = useState<Modo>('menu');
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const permisos = permisosPanel(profesorActivo);
  const puede = accionesFila(fila, profesorActivo);
  const vista = fila.estado === 'libre' ? 'crear' : modo;

  // Al cambiar de paso el foco pasa al título del paso: quien usa lector de pantalla sabe dónde está.
  useEffect(() => {
    tituloRef.current?.focus();
  }, [vista]);

  const volver = () => setModo('menu');

  return (
    <div className={estilos.panel}>
      <h3 ref={tituloRef} tabIndex={-1} className={estilos.titulo}>
        {TITULO_MODO[vista]}
      </h3>
      {vista === 'crear' ? (
        <CrearClaseForm
          fila={fila}
          zona={zona}
          alumnos={alumnos}
          onReintentarAlumnos={onReintentarAlumnos}
          habilitado={permisos.crear}
          acciones={acciones}
          onHecho={onHecho}
          onDesactualizada={onDesactualizada}
        />
      ) : null}
      {vista === 'menu' ? (
        <>
          <dl className={estilos.datos}>
            <div>
              <dt>Toma la clase</dt>
              <dd>{nombreVisible(fila.quien_toma)}</dd>
            </div>
            <div>
              <dt>Titular</dt>
              <dd>{nombreVisible(fila.titular)}</dd>
            </div>
            {fila.observacion ? (
              <div>
                <dt>Observación</dt>
                <dd>{fila.observacion}</dd>
              </div>
            ) : null}
            {fila.clase_estado ? (
              <div>
                <dt>Estado</dt>
                <dd>
                  <Insignia tipo={fila.clase_estado} texto={MENSAJES_PANEL.estadoClase[fila.clase_estado]} />
                </dd>
              </div>
            ) : null}
          </dl>
          <div className={estilos.botones}>
            <Boton deshabilitado={!puede.mover} onClick={() => setModo('mover')}>
              Mover
            </Boton>
            <Boton variante="peligro" deshabilitado={!puede.cancelar} onClick={() => setModo('cancelar')}>
              Cancelar
            </Boton>
          </div>
          {!permisos.mover ? <p className={estilos.nota}>{TEXTOS_PANEL.inactivoNoMueve}</p> : null}
        </>
      ) : null}
      {vista === 'mover' ? (
        <MoverClaseForm
          fila={fila}
          zona={zona}
          dia={dia}
          limites={limites}
          habilitado={permisos.mover}
          elegirAlcance={puede.elegirAlcance}
          acciones={acciones}
          onHecho={onHecho}
          onVolver={volver}
          onDesactualizada={onDesactualizada}
        />
      ) : null}
      {vista === 'cancelar' ? (
        <CancelarClaseForm
          fila={fila}
          zona={zona}
          elegirAlcance={puede.elegirAlcance}
          acciones={acciones}
          onHecho={onHecho}
          onVolver={volver}
          onDesactualizada={onDesactualizada}
        />
      ) : null}
    </div>
  );
}
