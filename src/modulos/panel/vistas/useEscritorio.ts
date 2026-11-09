// Escritorio o móvil del Panel (CAL-16, WEB-15): desde 60 rem (el corte `lg` de tokens.css) hay columna de acciones y la
// vista Semana muestra los siete días; por debajo, un diálogo y la ventana de 3 días. Lo comparten `PaginaPanel` (que
// pide a la lógica la semana o la ventana) y `VistaPanel` (que elige columna o diálogo).
import { useSyncExternalStore } from 'react';
import { ANCHO_MINIMO_SEMANA_REM } from '../logica';

/** Una sola fuente del corte: `ANCHO_MINIMO_SEMANA_REM` (CAL-16); B21 usa el mismo para el arrastre (ADR-026). */
const CONSULTA_ESCRITORIO = `(min-width: ${ANCHO_MINIMO_SEMANA_REM}rem)`;

function suscribirPantalla(avisar: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const medida = window.matchMedia(CONSULTA_ESCRITORIO);
  medida.addEventListener('change', avisar);
  return () => medida.removeEventListener('change', avisar);
}

function esEscritorioAhora(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(CONSULTA_ESCRITORIO).matches;
}

export function useEscritorio(): boolean {
  return useSyncExternalStore(suscribirPantalla, esEscritorioAhora, () => false);
}
