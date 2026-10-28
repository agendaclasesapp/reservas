// Lista de las clases que impiden un bloqueo (AGE-05, CA-14, F-09 paso 2): fecha, hora, quién toma la clase y su
// estado, cada una con un enlace al día del panel donde está. Los nombres son texto (SEC-16).
import { diaDeInstante } from '../../../lib/fechas';
import { textoConflicto, type ConflictoBloqueo } from '../logica';
import { TEXTOS_BLOQUEO } from './formato';
import estilos from './Acciones.module.css';

export type ConflictosBloqueoProps = {
  conflictos: readonly ConflictoBloqueo[];
  /** Huso del profesor (AGE-08). */
  zona: string;
  /** Se llama al seguir un enlace, para que quien lo muestra cierre su diálogo o columna. */
  onIr?: () => void;
};

export function ConflictosBloqueo({ conflictos, zona, onIr }: ConflictosBloqueoProps) {
  if (conflictos.length === 0) return null;
  return (
    <ul className={estilos.conflictos} aria-label="Clases que impiden el bloqueo">
      {conflictos.map((c) => (
        <li key={c.clase_id}>
          <a href={`#/panel?d=${diaDeInstante(c.inicio, zona)}`} className={estilos.enlace} onClick={onIr}>
            {textoConflicto(c, zona)}
            <span className={estilos.soloLectores}>{TEXTOS_BLOQUEO.verEnElPanel}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
