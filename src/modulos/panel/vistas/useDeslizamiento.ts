// Deslizamiento horizontal de la ventana de 3 días (CAL-16, CA-81; ADR-026; WCAG 2.5.1): Pointer Events con
// `pointerType === 'touch'`, un desplazamiento horizontal de al menos 48 px y el doble que el vertical. Es un atajo: las
// flechas hacen lo mismo y siguen estando. El contenedor lleva `touch-action: pan-y` (`Calendario.module.css`) para que
// el desplazamiento vertical siga siendo del navegador. Nada se guarda: el gesto vive en una referencia.
import { useRef, type PointerEvent as EventoPuntero } from 'react';

/** ADR-026: desplazamiento horizontal mínimo para contar como deslizamiento. */
export const UMBRAL_DESLIZAMIENTO_PX = 48;

/** -1: la ventana anterior (el dedo va hacia la derecha); 1: la siguiente (hacia la izquierda); 0: no es un deslizamiento. */
export type SentidoDeslizamiento = -1 | 0 | 1;

/** ADR-026: al menos 48 px en horizontal y el doble que en vertical. */
export function sentidoDeslizamiento(dx: number, dy: number): SentidoDeslizamiento {
  if (Math.abs(dx) < UMBRAL_DESLIZAMIENTO_PX || Math.abs(dx) < 2 * Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}

export type ManejadoresDeslizamiento = {
  onPointerDown: (evento: EventoPuntero<HTMLElement>) => void;
  onPointerUp: (evento: EventoPuntero<HTMLElement>) => void;
  onPointerCancel: () => void;
};

/** Manejadores para el contenedor de la ventana; sin `alDeslizar` no hay gesto (`undefined`). */
export function useDeslizamiento(
  alDeslizar: ((sentido: -1 | 1) => void) | undefined,
): ManejadoresDeslizamiento | undefined {
  const inicio = useRef<{ id: number; x: number; y: number } | null>(null);
  if (!alDeslizar) return undefined;
  return {
    onPointerDown: (evento) => {
      inicio.current = evento.pointerType === 'touch' ? { id: evento.pointerId, x: evento.clientX, y: evento.clientY } : null;
    },
    onPointerUp: (evento) => {
      const origen = inicio.current;
      inicio.current = null;
      if (!origen || origen.id !== evento.pointerId || evento.pointerType !== 'touch') return;
      const sentido = sentidoDeslizamiento(evento.clientX - origen.x, evento.clientY - origen.y);
      if (sentido !== 0) alDeslizar(sentido);
    },
    onPointerCancel: () => {
      inicio.current = null;
    },
  };
}
