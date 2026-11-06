// Piezas que comparten «Mover» (`MoverClaseForm`) y el diálogo del arrastre (`ConfirmarMovimiento`, CC-12) para que un
// cambio en una no se olvide en la otra (CAL-13, INV-01, CA-87): el grupo «¿Qué movemos?» con sus opciones de alcance y el
// aviso de error con el título, el mensaje de la base y «Ir a la lista» si hay una solicitud en curso. Presentación
// pura: los textos salen de `TEXTOS_MOVER` y de `MENSAJES_PANEL` (lógica).
import { Alerta, GrupoOpciones } from '../../../ui';
import { ALCANCES, MENSAJES_PANEL, type Alcance, type FalloPanel } from '../logica';
import { TEXTOS_MOVER } from './formato';
import estilos from './Acciones.module.css';

const OPCIONES_ALCANCE = ALCANCES.map((a) => ({ valor: a, etiqueta: MENSAJES_PANEL.alcance[a] }));

function esAlcance(valor: string): valor is Alcance {
  return ALCANCES.some((a) => a === valor);
}

export type AlcanceMoverProps = {
  valor: Alcance;
  onCambio: (alcance: Alcance) => void;
  deshabilitado?: boolean;
  /** Error del campo `p_alcance`, si lo hay. */
  error?: string | undefined;
};

/** «¿Qué movemos?»: «Solo esta clase» / «De acá en adelante». Solo se muestra si la clase es de una serie. */
export function AlcanceMover({ valor, onCambio, deshabilitado, error }: AlcanceMoverProps) {
  return (
    <GrupoOpciones
      legend={TEXTOS_MOVER.queMovemos}
      opciones={OPCIONES_ALCANCE}
      valor={valor}
      deshabilitado={deshabilitado}
      onCambio={(v) => {
        if (esAlcance(v)) onCambio(v);
      }}
      error={error}
    />
  );
}

export type AlertaMoverProps = {
  fallo: FalloPanel;
};

/** El aviso de un movimiento que no se hizo: no se cambió nada; con `SOLICITUD_EN_CURSO` manda a responder en la lista. */
export function AlertaMover({ fallo }: AlertaMoverProps) {
  return (
    <Alerta
      tipo="error"
      titulo={TEXTOS_MOVER.errorTitulo}
      accion={
        fallo.codigo === 'SOLICITUD_EN_CURSO' ? (
          <a href="#/lista" className={estilos.enlace}>
            {TEXTOS_MOVER.irALaLista}
          </a>
        ) : undefined
      }
    >
      {fallo.mensaje}
    </Alerta>
  );
}
