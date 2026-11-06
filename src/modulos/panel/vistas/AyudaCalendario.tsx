// CC-11 · Ayuda (WEB-14, CAL-05, CAL-11; A11Y-37): el texto literal de la spec, referenciado por `aria-describedby`
// del grupo del calendario (CalendarioPanel le da el `id`). B22 (P-2, DEC-48): suma una línea solo para el lector con el
// teclado de la grilla (H-478).
import { TEXTOS_CALENDARIO } from './formato';
import estilos from './Calendario.module.css';

export type AyudaCalendarioProps = {
  /** `id` al que apunta el `aria-describedby` del grupo. */
  id: string;
};

export function AyudaCalendario({ id }: AyudaCalendarioProps) {
  return (
    <p id={id} className={estilos.ayuda}>
      {TEXTOS_CALENDARIO.ayuda}
      {/* P-2 (DEC-48): solo para el lector; entra en la descripción del grupo (A11Y-37). */}
      <span className={estilos.soloLectores}>{`. ${TEXTOS_CALENDARIO.ayudaTeclado}`}</span>
    </p>
  );
}
