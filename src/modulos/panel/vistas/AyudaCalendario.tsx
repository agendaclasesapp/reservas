// CC-11 · Ayuda (WEB-14, CAL-05, CAL-11; A11Y-37): el texto literal de la spec, referenciado por `aria-describedby`
// del grupo del calendario (CalendarioPanel le da el `id`).
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
    </p>
  );
}
