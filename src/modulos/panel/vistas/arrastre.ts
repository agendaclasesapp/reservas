// Contrato de presentación del arrastre de una clase (CAL-13, CAL-14; ADR-026; F-CAL-08). Las reglas —qué se arrastra,
// qué destino es válido, cómo se mueve— son de `logica/arrastre.ts` (T21.1) y llegan por props desde `PaginaPanel`: las
// vistas no las calculan. Acá solo están los tipos de esa frontera y lo que es de gesto (el umbral de 4 px).
import type { PointerEvent as EventoPuntero } from 'react';
import type { Dia } from '../../../lib/fechas';
import type {
  Alcance,
  BloqueClase,
  DestinoArrastre,
  ElementoHueco,
  FilaAgendaProfesor,
  OrigenArrastre,
  ResultadoMover,
} from '../logica';

/** Caja de una columna en píxeles de la pantalla y lo que dibuja: de `desdeMin` a `hastaMin` (ADR-024, ADR-026). */
export type GeometriaArrastre = { arriba: number; alto: number; desdeMin: number; hastaMin: number };

/** ADR-026: por debajo de este desplazamiento (px) el gesto es un clic y abre el detalle; por encima, un arrastre. */
export const UMBRAL_ARRASTRE_PX = 4;

/**
 * Reglas del arrastre (T21.1, `logica/arrastre.ts`), ligadas por `conexionArrastre` (`PaginaPanel`) a las columnas
 * visibles, al reloj de la vista y a los permisos del profesor: con el profesor inactivo `origenDe` es siempre `null`
 * (INV-05, CA-79). Se inyectan por props: las vistas no calculan ninguna regla.
 */
export type ReglasArrastre = {
  /**
   * El origen de la clase que «Mover» deja mover (confirmada, futura, sin solicitud, profesor activo; CAL-14), o `null`
   * si no se arrastra. Trae `claseId` (la identidad de la clase) y `elegirAlcance` (es de una serie).
   */
  origenDe: (fila: FilaAgendaProfesor) => OrigenArrastre | null;
  /** Minutos del día bajo la altura `y` de la pantalla según el eje de la columna; `null` fuera de la grilla. */
  minutosEnPunto: (y: number, geometria: GeometriaArrastre) => number | null;
  /** Hueco libre futuro bajo el punto, o `null` (ocupado, bloqueado, pasado, fuera de la grilla o de la vista). */
  destinoEnPunto: (punto: { dia: Dia; minutos: number | null; origen: OrigenArrastre }) => DestinoArrastre | null;
  /**
   * Mueve con la misma operación y los mismos mensajes que «Mover» (INV-01, CA-87): si la clase dejó de poder moverse,
   * contesta la base, no la vista. No lanza.
   */
  mover: (origen: OrigenArrastre, destino: Pick<DestinoArrastre, 'inicio'>, alcance: Alcance) => Promise<ResultadoMover>;
};

/** Una clase que se está arrastrando: desplazamiento del puntero desde donde se tomó y destino bajo él. */
export type EstadoArrastre =
  | { activo: false }
  | { activo: true; origen: OrigenArrastre; dx: number; dy: number; destino: DestinoArrastre | null };

/** Lo que `CalendarioPanel` le da a cada columna para dibujar el arrastre (CC-05, CC-06, CC-07). */
export type ArrastreEnColumna = {
  estado: EstadoArrastre;
  /** La lógica deja arrastrar esa clase. */
  puedeArrastrar: (clase: BloqueClase) => boolean;
  /** `onPointerDown` del bloque: inicia el gesto si corresponde (solo mouse, solo escritorio). */
  iniciar: (evento: EventoPuntero<HTMLElement>, clase: BloqueClase, dia: Dia) => void;
  /** El hueco es un destino válido para la clase que se arrastra (resaltado y «Soltar acá»). */
  esDestino: (hueco: ElementoHueco) => boolean;
};

/** Lo que se soltó: la clase con su origen, su día y el hueco destino (CAL-13). */
export type ClaseSoltada = { clase: BloqueClase; origen: OrigenArrastre; dia: Dia; destino: DestinoArrastre };
