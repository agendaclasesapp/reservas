// Arrastre de una clase con el mouse (CAL-13, CAL-14; ADR-026; F-CAL-08; A11Y-40): Pointer Events nativos, sin librería.
// Solo con `pointerType === 'mouse'`, botón principal y desde 60 rem (quien lo usa pasa `reglas` solo entonces; en táctil
// y con teclado la alternativa es «Mover», NFR-11). El gesto se activa tras 4 px (menos es un clic que abre el detalle);
// el bloque sigue al puntero; `Escape`, soltar fuera de un destino válido o cancelar el gesto lo devuelven a su lugar sin
// llamar a nada. Qué se arrastra y dónde se suelta lo deciden las `reglas` de la lógica; el destino se calcula con la
// geometría de la columna bajo el puntero (`data-columna-dia`) y el eje, no con el elemento que haya debajo.
// Como en `useDeslizamiento`, el gesto vive en una referencia y solo el estado visible (desplazamiento y destino) es estado.
import { useCallback, useEffect, useRef, useState, type PointerEvent as EventoPuntero } from 'react';
import type { Dia } from '../../../lib/fechas';
import type { BloqueClase, DestinoArrastre, EjeCalendario, ElementoHueco, OrigenArrastre } from '../logica';
import { UMBRAL_ARRASTRE_PX, type ClaseSoltada, type EstadoArrastre, type ReglasArrastre } from './arrastre';

type Gesto = {
  id: number;
  x0: number;
  y0: number;
  clase: BloqueClase;
  /** La clase que se arrastra, por su `claseId` (no por su hora de inicio), tal como la dio la lógica al empezar. */
  origen: OrigenArrastre;
  dia: Dia;
  /** Superó el umbral: ya es un arrastre y no un clic. */
  activo: boolean;
  /** `Escape`: el arrastre terminó; solo queda esperar a que suelte para no dejar pasar su clic. */
  cancelado: boolean;
  destino: DestinoArrastre | null;
  grilla: HTMLElement;
};

export type OpcionesArrastre = {
  /** Sin reglas (móvil, lista, sin conexión) no hay arrastre. */
  reglas: ReglasArrastre | undefined;
  /** El eje de la grilla: de `desdeMin` a `hastaMin` es lo que dibuja cada columna. */
  eje: Pick<EjeCalendario, 'desdeMin' | 'hastaMin'>;
  /** Se soltó una clase sobre un destino válido: la vista pide confirmar (CAL-13). */
  alSoltar: (soltada: ClaseSoltada) => void;
};

export type ResultadoArrastre = {
  estado: EstadoArrastre;
  iniciar: (evento: EventoPuntero<HTMLElement>, clase: BloqueClase, dia: Dia) => void;
  esDestino: (hueco: ElementoHueco) => boolean;
};

const INACTIVO: EstadoArrastre = { activo: false };

/** El clic que el navegador manda al soltar tras un arrastre no debe abrir el detalle: se traga una sola vez. */
function tragarElProximoClic(): void {
  const tragar = (evento: Event) => {
    evento.stopPropagation();
    evento.preventDefault();
  };
  window.addEventListener('click', tragar, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', tragar, { capture: true }), 0);
}

/** El destino bajo el puntero: la columna del día por su posición horizontal y los minutos por la geometría del eje. */
function destinoBajo(
  gesto: Gesto,
  x: number,
  y: number,
  reglas: ReglasArrastre,
  eje: Pick<EjeCalendario, 'desdeMin' | 'hastaMin'>,
): DestinoArrastre | null {
  for (const columna of gesto.grilla.querySelectorAll<HTMLElement>('[data-columna-dia]')) {
    const caja = columna.getBoundingClientRect();
    const dia = columna.dataset['columnaDia'];
    if (!dia || x < caja.left || x >= caja.right || y < caja.top || y > caja.bottom) continue;
    const minutos = reglas.minutosEnPunto(y, {
      arriba: caja.top,
      alto: caja.height,
      desdeMin: eje.desdeMin,
      hastaMin: eje.hastaMin,
    });
    if (minutos === null) return null;
    return reglas.destinoEnPunto({ dia, minutos, origen: gesto.origen });
  }
  return null;
}

export function useArrastreClase({ reglas, eje, alSoltar }: OpcionesArrastre): ResultadoArrastre {
  const [estado, setEstado] = useState<EstadoArrastre>(INACTIVO);
  const gesto = useRef<Gesto | null>(null);
  const quitar = useRef<(() => void) | null>(null);
  // Los manejadores se registran al empezar el gesto: leen lo último por referencia, no lo de ese momento.
  const ultimo = useRef({ reglas, eje, alSoltar });
  useEffect(() => {
    ultimo.current = { reglas, eje, alSoltar };
  });

  const terminar = useCallback(() => {
    quitar.current?.();
    quitar.current = null;
    gesto.current = null;
    setEstado(INACTIVO);
  }, []);

  // Sin reglas (por ejemplo, la ventana se achicó bajo 60 rem a mitad del gesto) el arrastre se cancela; y al desmontar.
  const hayReglas = reglas !== undefined;
  useEffect(() => (hayReglas ? terminar : undefined), [hayReglas, terminar]);

  const iniciar = useCallback(
    (evento: EventoPuntero<HTMLElement>, clase: BloqueClase, dia: Dia) => {
      const actuales = ultimo.current;
      if (!actuales.reglas || evento.pointerType !== 'mouse' || evento.button !== 0) return;
      const origen = actuales.reglas.origenDe(clase.fila);
      if (!origen) return;
      const grilla = evento.currentTarget.closest<HTMLElement>('[data-calendario]');
      if (!grilla) return;
      terminar();
      const actual: Gesto = {
        id: evento.pointerId,
        x0: evento.clientX,
        y0: evento.clientY,
        clase,
        origen,
        dia,
        activo: false,
        cancelado: false,
        destino: null,
        grilla,
      };
      gesto.current = actual;
      // El bloque sigue recibiendo el gesto aunque el puntero salga de él.
      evento.currentTarget.setPointerCapture?.(evento.pointerId);

      const alMover = (e: PointerEvent) => {
        if (e.pointerId !== actual.id || actual.cancelado) return;
        const dx = e.clientX - actual.x0;
        const dy = e.clientY - actual.y0;
        if (!actual.activo && Math.hypot(dx, dy) < UMBRAL_ARRASTRE_PX) return;
        const { reglas: r, eje: ejeActual } = ultimo.current;
        if (!r) return;
        actual.activo = true;
        actual.destino = destinoBajo(actual, e.clientX, e.clientY, r, ejeActual);
        setEstado({ activo: true, origen: actual.origen, dx, dy, destino: actual.destino });
      };
      const alSoltarPuntero = (e: PointerEvent) => {
        if (e.pointerId !== actual.id) return;
        const { activo: fueArrastre, cancelado, destino } = actual;
        terminar();
        if (!fueArrastre) return;
        tragarElProximoClic();
        if (!cancelado && destino) ultimo.current.alSoltar({ clase: actual.clase, origen: actual.origen, dia: actual.dia, destino });
      };
      const alCancelar = (e: PointerEvent) => {
        if (e.pointerId !== actual.id) return;
        const fueArrastre = actual.activo;
        terminar();
        if (fueArrastre) tragarElProximoClic();
      };
      // ADR-026: `Escape` cancela; el bloque vuelve a su lugar y el clic de soltar no abre nada.
      const alTeclear = (e: KeyboardEvent) => {
        if (e.key !== 'Escape' || !actual.activo || actual.cancelado) return;
        e.preventDefault();
        e.stopPropagation();
        actual.cancelado = true;
        setEstado(INACTIVO);
      };

      window.addEventListener('pointermove', alMover);
      window.addEventListener('pointerup', alSoltarPuntero);
      window.addEventListener('pointercancel', alCancelar);
      window.addEventListener('keydown', alTeclear, true);
      quitar.current = () => {
        window.removeEventListener('pointermove', alMover);
        window.removeEventListener('pointerup', alSoltarPuntero);
        window.removeEventListener('pointercancel', alCancelar);
        window.removeEventListener('keydown', alTeclear, true);
      };
    },
    [terminar],
  );

  const esDestino = useCallback(
    (hueco: ElementoHueco): boolean => {
      if (!estado.activo || !reglas) return false;
      return reglas.destinoEnPunto({ dia: hueco.dia, minutos: hueco.inicioMin, origen: estado.origen })?.inicio === hueco.inicio;
    },
    [estado, reglas],
  );

  return { estado, iniciar, esDestino };
}
