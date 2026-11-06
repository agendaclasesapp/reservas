// Teclado de la grilla del calendario (A11Y-35, A11Y-37; CAL-05, CAL-11; NFR-11): un solo tope de Tab y flechas dentro de
// la grilla (ítem activo con `tabindex=0`, el resto `-1`; «roving tabindex»). ↑/↓ van entre los ítems del día; en Semana
// ←/→ pasan al ítem del mismo horario (o el más cercano) del día contiguo; Inicio/Fin al primero/último del día. Enter y
// Espacio son los del botón (abren el detalle). Es solo presentación: qué ítems son tocables lo decide la lógica
// (`tocable`), acá no se calcula ninguna regla de la agenda (N-1). Lo decorativo (pasado, fuera de grilla, otro
// profesor) no es ítem: no lleva botón y no entra en el orden.
import { useState, type FocusEvent, type KeyboardEvent } from 'react';
import type { ColumnaCalendario } from '../logica';

/** Un ítem navegable de la grilla, en orden de lectura: columnas de izquierda a derecha y, dentro, por hora. */
export type ItemNavegable = {
  /** `<día>|<clave del elemento>`: único también en Semana. */
  id: string;
  /** Posición de la columna entre las del calendario. */
  columna: number;
  /** Minutos desde la medianoche del día, para elegir «el mismo horario» en la columna contigua. */
  inicioMin: number;
};

export type TeclaDeGrilla = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';

const TECLAS: readonly string[] = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];

export function esTeclaDeGrilla(tecla: string): tecla is TeclaDeGrilla {
  return TECLAS.includes(tecla);
}

/** Atributos y manejadores que la columna pone al botón de cada ítem navegable (el botón es el elemento interactivo). */
export type NavegacionDeItem = {
  'data-nav': string;
  tabIndex: 0 | -1;
  onKeyDown: (evento: KeyboardEvent<HTMLElement>) => void;
  onFocus: (evento: FocusEvent<HTMLElement>) => void;
};

/** Quién de los elementos de una columna es ítem navegable: el que se dibuja como botón (`tocable` + su acción). */
export type QuienEsTocable = {
  hueco: boolean;
  clase: boolean;
  bloqueo: boolean;
};

export function idDeItem(dia: string, clave: string): string {
  return `${dia}|${clave}`;
}

/** El `data-nav` del ítem que contiene al objetivo del evento, si es de la grilla. */
function itemDe(objetivo: Element): string | null {
  return objetivo.closest('[data-nav]')?.getAttribute('data-nav') ?? null;
}

/** Los ítems navegables de las columnas con su día en rango, en el orden del DOM (A11Y-35). */
export function itemsNavegables(
  columnas: readonly ColumnaCalendario[],
  enRango: (dia: string) => boolean,
  acciones: QuienEsTocable,
): ItemNavegable[] {
  return columnas.flatMap((columna, i) =>
    !enRango(columna.dia)
      ? []
      : columna.elementos
          .filter((e) => e.tocable && (e.tipo === 'hueco' ? acciones.hueco : e.tipo === 'clase' ? acciones.clase : acciones.bloqueo))
          .map((e) => ({ id: idDeItem(columna.dia, e.clave), columna: i, inicioMin: e.inicioMin })),
  );
}

/** El ítem activo: el elegido si sigue en la grilla; si no, el primero (la grilla siempre tiene un solo tope de Tab). */
export function itemActivo(items: readonly ItemNavegable[], elegido: string | null): string | null {
  return items.find((i) => i.id === elegido)?.id ?? items[0]?.id ?? null;
}

/**
 * A qué ítem pasa el foco con una tecla (A11Y-37), o `null` si no hay a dónde ir (no da la vuelta: los extremos son
 * extremos). ←/→ saltan las columnas sin ítems y eligen el de horario más cercano (a igual distancia, el más temprano).
 */
export function destinoDeTecla(items: readonly ItemNavegable[], actual: string, tecla: TeclaDeGrilla): string | null {
  const i = items.findIndex((item) => item.id === actual);
  const item = items[i];
  if (!item) return null;
  const delDia = items.filter((otro) => otro.columna === item.columna);
  switch (tecla) {
    case 'Home':
      return delDia[0]?.id ?? null;
    case 'End':
      return delDia[delDia.length - 1]?.id ?? null;
    case 'ArrowUp':
    case 'ArrowDown': {
      const j = delDia.findIndex((otro) => otro.id === actual) + (tecla === 'ArrowUp' ? -1 : 1);
      return delDia[j]?.id ?? null;
    }
    case 'ArrowLeft':
    case 'ArrowRight': {
      const sentido = tecla === 'ArrowLeft' ? -1 : 1;
      const lejanos = items
        .filter((otro) => (otro.columna - item.columna) * sentido > 0)
        .sort((a, b) => Math.abs(a.columna - item.columna) - Math.abs(b.columna - item.columna));
      const primera = lejanos[0]?.columna;
      if (primera === undefined) return null;
      const contiguos = lejanos.filter((otro) => otro.columna === primera);
      const cercano = contiguos.reduce((mejor, otro) =>
        Math.abs(otro.inicioMin - item.inicioMin) < Math.abs(mejor.inicioMin - item.inicioMin) ? otro : mejor,
      );
      return cercano.id;
    }
  }
}

export type TecladoGrilla = {
  /** Atributos y manejadores del botón de un ítem de la columna `dia`. */
  navegacionDe: (dia: string, clave: string) => NavegacionDeItem;
};

/**
 * Un solo tope de Tab para toda la grilla. El ítem activo sigue al foco (también cuando el foco vuelve a un bloque por
 * programa, A11Y-38, A11Y-52) y es un valor derivado: si el elegido ya no está, vale el primero.
 */
export function useTecladoGrilla(items: readonly ItemNavegable[]): TecladoGrilla {
  const [elegido, setElegido] = useState<string | null>(null);
  const activo = itemActivo(items, elegido);
  const alEnfocar = (evento: FocusEvent<HTMLElement>) => {
    const id = itemDe(evento.currentTarget);
    if (id && items.some((i) => i.id === id)) setElegido(id);
  };
  const alTeclear = (evento: KeyboardEvent<HTMLElement>) => {
    if (evento.altKey || evento.ctrlKey || evento.metaKey || evento.shiftKey || !esTeclaDeGrilla(evento.key)) return;
    const actual = itemDe(evento.currentTarget);
    if (!actual) return;
    const destino = destinoDeTecla(items, actual, evento.key);
    // Con o sin destino la flecha no desplaza la página: la grilla es la que la usa.
    evento.preventDefault();
    if (destino === null) return;
    const botones = Array.from(evento.currentTarget.closest('[data-calendario]')?.querySelectorAll<HTMLElement>('[data-nav]') ?? []);
    botones.find((b) => b.getAttribute('data-nav') === destino)?.focus();
  };
  return {
    navegacionDe: (dia, clave) => {
      const id = idDeItem(dia, clave);
      return { 'data-nav': id, tabIndex: id === activo ? 0 : -1, onKeyDown: alTeclear, onFocus: alEnfocar };
    },
  };
}
