// Contenido del panel de acciones de un hueco (WEB-06, F-07 paso 3, F-08): hueco libre → «Crear clase»; clase
// ocupada → sus datos y «Mover» / «Cancelar»; hueco libre → además «Bloquear este horario» (AGE-05); hueco
// bloqueado → «Desbloquear» (AGE-06). Se muestra en un diálogo en móvil y en una columna en escritorio (`VistaPanel`
// elige el contenedor). Con el profesor inactivo, «Crear clase» y «Mover» quedan deshabilitados y «Cancelar» sigue
// (PRF-08); bloquear y desbloquear no dependen de que esté activo.
import { useEffect, useRef, useState } from 'react';
import { Boton, Insignia } from '../../../ui';
import type { Dia } from '../../../lib/fechas';
import type { LimitesAgenda } from '../../agenda/logica';
import type { EstadoAlumnos } from '../../lista/logica';
import { accionesBloqueo, accionesFila, MENSAJES_PANEL, permisosPanel, type FilaAgendaProfesor } from '../logica';
import { BloqueoForm } from './BloqueoForm';
import { CancelarClaseForm } from './CancelarClaseForm';
import type { AccionesPanel, ResultadoPanel } from './contrato';
import { CrearClaseForm } from './CrearClaseForm';
import { DesbloquearForm } from './DesbloquearForm';
import { TEXTOS_BLOQUEO, TEXTOS_PANEL } from './formato';
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
  /** Se sigue el enlace de una clase que impide un bloqueo: se cierra el diálogo o la columna. */
  onIrAConflicto: () => void;
};

type Modo = 'menu' | 'mover' | 'cancelar' | 'bloquear';

const TITULO_MODO: Record<Modo | 'crear' | 'desbloquear', string> = {
  crear: 'Crear clase',
  menu: 'Elegí qué hacer con la clase',
  mover: 'Mover la clase',
  cancelar: 'Cancelar la clase',
  bloquear: TEXTOS_BLOQUEO.tituloBloquearHueco,
  desbloquear: TEXTOS_BLOQUEO.tituloDesbloquear,
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
  onIrAConflicto,
}: PanelAccionesProps) {
  const [modo, setModo] = useState<Modo>('menu');
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const permisos = permisosPanel(profesorActivo);
  const puede = accionesFila(fila, profesorActivo);
  const bloqueos = accionesBloqueo(fila);
  const vista =
    fila.estado === 'libre'
      ? modo === 'bloquear' && bloqueos.bloquear
        ? 'bloquear'
        : 'crear'
      : fila.estado === 'bloqueado'
        ? 'desbloquear'
        : modo;

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
      {vista === 'crear' && bloqueos.bloquear ? (
        <div className={estilos.otraAccion}>
          <p className={estilos.nota}>{TEXTOS_BLOQUEO.ofrecerBloquear}</p>
          <Boton variante="secundario" onClick={() => setModo('bloquear')}>
            {TEXTOS_BLOQUEO.bloquearHueco}
          </Boton>
        </div>
      ) : null}
      {vista === 'bloquear' ? (
        <BloqueoForm
          origen={{ tipo: 'hueco', fila }}
          zona={zona}
          limites={limites}
          acciones={acciones}
          onHecho={onHecho}
          onDesactualizada={onDesactualizada}
          onVolver={volver}
          onIrAConflicto={onIrAConflicto}
        />
      ) : null}
      {vista === 'desbloquear' ? (
        <DesbloquearForm fila={fila} zona={zona} acciones={acciones} onHecho={onHecho} onDesactualizada={onDesactualizada} />
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
