// CC-12 · Confirmar el movimiento de una clase soltada en un hueco (CAL-13, CAL-14, CA-77, CA-87; F-CAL-08; A11Y-40,
// A11Y-52): un diálogo «Mover clase» con el texto «Mover la clase de Ana Pérez del Lun 26/10 10:00 al Mar 27/10 11:00»;
// si la clase es de una serie, «solo esta clase» / «de acá en adelante» (los textos de «Mover»); botones «Mover» y
// «Cancelar». «Cancelar», `Esc` o cerrarlo no cambia nada: la clase vuelve a su lugar (quien lo abre no llama a nada).
// Estados: elegir alcance (solo una serie), enviando (`aria-busy`, no se cierra) y error (el mismo mensaje y título que
// «Mover», CA-87: no se cambió nada; el diálogo queda abierto para cancelar o reintentar). No llama a la red: recibe
// `onConfirmar`, que devuelve el resultado de «Mover» (el Developer lo conecta, N-1). Con `ok`, quien lo abre lo cierra.
import { useState } from 'react';
import { Boton, Dialogo } from '../../../ui';
import { formatearHora, type Dia } from '../../../lib/fechas';
import { nombreVisible } from '../../lista/logica';
import { type Alcance, type BloqueClase as DatosBloque, type FalloPanel, type ResultadoMover } from '../logica';
import { diaCorto } from './calendario';
import { TEXTOS_MOVER } from './formato';
import { AlcanceMover, AlertaMover } from './PiezasMover';
import estilos from './Acciones.module.css';

export type ConfirmarMovimientoProps = {
  clase: DatosBloque;
  /** Día de la columna donde estaba la clase. */
  dia: Dia;
  /** Hueco donde se soltó (un destino válido de la lógica). */
  destino: { dia: Dia; inicio: string };
  /** Huso del profesor (AGE-08). */
  zona: string;
  /** `origen.elegirAlcance` (de la lógica): la clase es de una serie. */
  esSerie: boolean;
  /** Confirma con el alcance elegido; devuelve el resultado de «Mover» (no lanza). */
  onConfirmar: (alcance: Alcance) => Promise<ResultadoMover>;
  /** «Cancelar», `Esc` o cerrar: no cambia nada. */
  onCancelar: () => void;
};

/** «Mover la clase de Ana Pérez del Lun 26/10 10:00 al Mar 27/10 11:00». */
export function textoMovimiento(clase: DatosBloque, dia: Dia, destino: { dia: Dia; inicio: string }, zona: string): string {
  return `Mover la clase de ${nombreVisible(clase.quien)} del ${diaCorto(dia)} ${formatearHora(clase.inicio, zona)} al ${diaCorto(destino.dia)} ${formatearHora(destino.inicio, zona)}`;
}

export function ConfirmarMovimiento({ clase, dia, destino, zona, esSerie, onConfirmar, onCancelar }: ConfirmarMovimientoProps) {
  const [alcance, setAlcance] = useState<Alcance>('solo_esta');
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<FalloPanel | null>(null);

  const confirmar = async () => {
    if (enviando) return;
    setFallo(null);
    setEnviando(true);
    const r = await onConfirmar(esSerie ? alcance : 'solo_esta');
    // Con `ok` quien lo abrió ya lo cerró; con un fallo queda abierto, con el aviso, para cancelar o reintentar.
    if (!r.ok) {
      setEnviando(false);
      setFallo(r);
    }
  };

  return (
    <Dialogo
      abierto
      titulo={TEXTOS_MOVER.titulo}
      textoCerrar={TEXTOS_MOVER.cancelar}
      onCerrar={() => {
        if (!enviando) onCancelar();
      }}
      acciones={
        <Boton cargando={enviando} textoCargando={TEXTOS_MOVER.moviendo} onClick={() => void confirmar()}>
          {TEXTOS_MOVER.mover}
        </Boton>
      }
    >
      <div className={estilos.formulario} aria-busy={enviando || undefined}>
        <p>{textoMovimiento(clase, dia, destino, zona)}</p>
        {esSerie ? (
          <AlcanceMover valor={alcance} onCambio={setAlcance} deshabilitado={enviando} />
        ) : null}
        {fallo ? <AlertaMover fallo={fallo} /> : null}
      </div>
    </Dialogo>
  );
}
