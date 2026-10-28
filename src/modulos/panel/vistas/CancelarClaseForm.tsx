// «Cancelar» (PRF-03, PRF-08, WEB-06, F-08): confirmación con alcance («solo esta clase» o «de acá en adelante» si es
// de una serie). Libera los huecos y funciona con el profesor inactivo. 409 SOLICITUD_EN_CURSO manda a responder primero
// en la lista. Los nombres son texto (SEC-16).
import { useState } from 'react';
import { Alerta, Boton, GrupoOpciones } from '../../../ui';
import { ALCANCES, MENSAJES_PANEL, type Alcance, type FalloPanel, type FilaAgendaProfesor } from '../logica';
import { CODIGOS_DESACTUALIZADA, type AccionesPanel, type ResultadoPanel } from './contrato';
import { fechaCorta } from './formato';
import { nombreVisible } from '../../lista/logica';
import estilos from './Acciones.module.css';

export type CancelarClaseFormProps = {
  fila: FilaAgendaProfesor;
  zona: string;
  /** `accionesFila(...).elegirAlcance`: la clase es de una serie. */
  elegirAlcance: boolean;
  acciones: Pick<AccionesPanel, 'cancelar'>;
  onHecho: (resultado: ResultadoPanel) => void;
  onVolver: () => void;
  onDesactualizada: () => void;
};

const OPCIONES_ALCANCE = ALCANCES.map((a) => ({ valor: a, etiqueta: MENSAJES_PANEL.alcance[a] }));

function esAlcance(valor: string): valor is Alcance {
  return ALCANCES.some((a) => a === valor);
}

export function CancelarClaseForm({ fila, zona, elegirAlcance, acciones, onHecho, onVolver, onDesactualizada }: CancelarClaseFormProps) {
  const [alcance, setAlcance] = useState<Alcance>('solo_esta');
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<FalloPanel | null>(null);

  const nombre = nombreVisible(fila.quien_toma);
  const cuando = fechaCorta(fila.inicio, zona);

  const confirmar = async () => {
    if (fila.clase_id === null) return;
    setFallo(null);
    setEnviando(true);
    const alcanceEfectivo: Alcance = elegirAlcance ? alcance : 'solo_esta';
    const r = await acciones.cancelar(fila.clase_id, alcanceEfectivo);
    setEnviando(false);
    if (!r.ok) {
      setFallo(r);
      if (CODIGOS_DESACTUALIZADA.has(r.codigo)) onDesactualizada();
      return;
    }
    onHecho({
      mensaje:
        alcanceEfectivo === 'desde_aca' && r.canceladas !== 1
          ? `Se cancelaron ${r.canceladas} clases de ${nombre} desde el ${cuando}`
          : `Clase cancelada: ${nombre}, ${cuando}`,
      detalle: 'El horario quedó libre. Si el titular tiene mail, le avisamos.',
      salteadas: [],
    });
  };

  const enAlcance = fallo?.campo === 'p_alcance' && elegirAlcance;
  const errorGeneral = fallo && !enAlcance ? fallo : null;

  return (
    <form
      className={estilos.formulario}
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault();
        if (!enviando) void confirmar();
      }}
    >
      <p className={estilos.pregunta}>
        {`¿Cancelamos la clase de ${nombre} del ${cuando}?`}
        {elegirAlcance ? ' Es parte de una serie.' : ''}
      </p>

      {elegirAlcance ? (
        <GrupoOpciones
          legend="¿Qué cancelamos?"
          opciones={OPCIONES_ALCANCE}
          valor={alcance}
          onCambio={(v) => {
            if (esAlcance(v)) setAlcance(v);
          }}
          error={enAlcance ? fallo.mensaje : undefined}
        />
      ) : null}

      {errorGeneral ? (
        <Alerta
          tipo="error"
          titulo="No se pudo cancelar la clase"
          accion={
            errorGeneral.codigo === 'SOLICITUD_EN_CURSO' ? (
              <a href="#/lista" className={estilos.enlace}>
                Ir a la lista
              </a>
            ) : undefined
          }
        >
          {errorGeneral.mensaje}
        </Alerta>
      ) : null}

      <div className={estilos.botones}>
        <Boton type="submit" variante="peligro" cargando={enviando} textoCargando="Cancelando…">
          Confirmar cancelación
        </Boton>
        <Boton variante="secundario" onClick={onVolver}>
          Volver
        </Boton>
      </div>
    </form>
  );
}
