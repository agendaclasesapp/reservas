// B21 · T21.1 · Arrastre en escritorio: qué se arrastra, dónde se suelta y cómo se mueve (ADR-026, ADR-024).
// CAL-13, CAL-14, INV-01, INV-05. Sin reglas propias: se arrastra lo que `accionesFila` deja mover (con el profesor
// inactivo, nada: `permisosPanel`) y se suelta solo sobre un hueco de `destinosLibres`; el movimiento es `moverClase`,
// la misma RPC y los mismos mensajes que «Mover» (CA-87). La RPC es la última barrera: lo leído puede quedar viejo.
// El umbral de 4 px, el seguimiento del puntero y `Escape` son de la vista (ADR-026 A-1).
import type { Dia } from '../../../lib/fechas';
import type { EjeCalendario } from './eje';
import type { ColumnaCalendario, ElementoHueco } from './elementosCalendario';
import { accionesFila, destinosLibres, moverClase, type DependenciasPanel, type ResultadoMover } from './panel';
import type { Alcance, FilaAgendaDias, FilaAgendaProfesor } from './tipos';

/**
 * Una clase que se puede arrastrar. Solo la arma `origenDeArrastre`, así que tenerla ya dice que `accionesFila`
 * ofrece «Mover» para esa fila.
 */
export interface OrigenArrastre {
  claseId: string;
  /** La fila de la clase (`BloqueClase.fila`): la que se pasó a `accionesFila`. */
  fila: FilaAgendaProfesor;
  /** `accionesFila(fila).elegirAlcance`: es de una serie y se elige «solo esta clase» o «de acá en adelante». */
  elegirAlcance: boolean;
}

/** Hueco libre futuro bajo el puntero (CC-07 «Soltar acá»). Minutos del día en el huso del profesor. */
export interface DestinoArrastre {
  /** `clave` del `ElementoHueco` de la columna, para resaltarlo. */
  clave: string;
  dia: Dia;
  /** Instantes reales (ISO): `inicio` es el destino de `mover_clase`. */
  inicio: string;
  fin: string;
  inicioMin: number;
  finMin: number;
  fila: FilaAgendaDias;
}

/** Lo que hace falta para pasar de px a minutos con la escala del eje (`--cal-alto-hora = eje.altoHora`). */
export interface GeometriaEje {
  eje: Pick<EjeCalendario, 'desdeMin' | 'hastaMin' | 'altoHoraRem'>;
  /** Tamaño de 1 rem en px (`parseFloat(getComputedStyle(document.documentElement).fontSize)`). */
  pxPorRem: number;
}

export interface PuntoDeSoltar {
  /** Columna del día bajo el puntero (`calendarioConElementos(...).columnas[i]`). */
  columna: ColumnaCalendario;
  /** `minutosEnPunto(y, geometria)`: null fuera del eje. */
  minutos: number | null;
  /** `origenDeArrastre(...)` de la clase arrastrada; null = no hay arrastre. */
  origen: OrigenArrastre | null;
  /** Reloj de la vista (`useAhora`): un hueco que empezó desde la lectura ya no es destino. */
  ahora?: Date;
}

/**
 * CAL-13, CAL-14, INV-05: la clase de `fila` se puede arrastrar si `accionesFila` ofrece «Mover» (confirmada, no
 * pasada, sin solicitud pendiente y con el profesor activo; DEC-42 A: el destino pendiente de un movimiento es una
 * clase pendiente y no se arrastra). Devuelve null en lo demás.
 */
export function origenDeArrastre(fila: FilaAgendaProfesor, profesorActivo: boolean): OrigenArrastre | null {
  const acciones = accionesFila(fila, profesorActivo);
  if (!acciones.mover || fila.clase_id === null) return null;
  return { claseId: fila.clase_id, fila, elegirAlcance: acciones.elegirAlcance };
}

/** CAL-14, INV-05: `origenDeArrastre(fila, profesorActivo) !== null`. */
export function esArrastrable(fila: FilaAgendaProfesor, profesorActivo: boolean): boolean {
  return origenDeArrastre(fila, profesorActivo) !== null;
}

/**
 * Minuto del día bajo el puntero: `y` son los px desde el borde superior de la columna (la línea de `eje.desdeMin`),
 * con la misma escala que dibuja el eje (`posicionEnEje` × `--cal-alto-hora`). Fuera de `[desdeMin, hastaMin)`, o con
 * una geometría inválida, null (CAL-14: fuera de la grilla).
 */
export function minutosEnPunto(y: number, geometria: GeometriaEje): number | null {
  const { eje, pxPorRem } = geometria;
  const pxPorHora = eje.altoHoraRem * pxPorRem;
  if (!Number.isFinite(y) || !Number.isFinite(pxPorHora) || pxPorHora <= 0 || y < 0) return null;
  const minutos = eje.desdeMin + Math.floor((y / pxPorHora) * 60);
  return minutos < eje.hastaMin ? minutos : null;
}

/**
 * CAL-13, CAL-14, CA-78: el hueco donde se soltaría `origen` con el puntero en `minutos` de `columna`, o null. Solo un
 * hueco de `destinosLibres` (libre y no pasado según la base), dentro de tramo (CAL-05) y que todavía no empezó según
 * `ahora`. Ocupado, bloqueado, pasado, fuera de la grilla o sin origen arrastrable: null.
 */
export function destinoEnPunto({ columna, minutos, origen, ahora = new Date() }: PuntoDeSoltar): DestinoArrastre | null {
  if (origen === null || minutos === null) return null;
  const huecos = columna.elementos.filter((e): e is ElementoHueco => e.tipo === 'hueco');
  const libres = new Set(destinosLibres(huecos.map((h) => h.fila)));
  const hueco = huecos.find(
    (h) =>
      libres.has(h.fila) &&
      h.dentroDeTramo &&
      h.inicioMin <= minutos &&
      minutos < h.finMin &&
      Date.parse(h.fila.inicio) > ahora.getTime(),
  );
  if (!hueco) return null;
  return {
    clave: hueco.clave,
    dia: hueco.dia,
    inicio: hueco.inicio,
    fin: hueco.fin,
    inicioMin: hueco.inicioMin,
    finMin: hueco.finMin,
    fila: hueco.fila,
  };
}

/** El alcance que viaja, como «Mover»: el elegido en una serie; `solo_esta` en una suelta. */
export function alcanceDeArrastre(origen: OrigenArrastre, alcance: Alcance): Alcance {
  return origen.elegirAlcance ? alcance : 'solo_esta';
}

/**
 * CAL-13, INV-01, CA-87: tras confirmar, `mover_clase(origen, destino.inicio, alcance)` con `moverClase`, igual que
 * «Mover»: si otro tomó el destino entre la lectura y la confirmación (o algo cambió), la base lo rechaza y vuelve el
 * mismo `FalloPanel` (código y mensaje). Con un fallo, la vista relee el rango visible y la clase vuelve a su lugar.
 */
export function moverPorArrastre(
  origen: OrigenArrastre,
  destino: Pick<DestinoArrastre, 'inicio'>,
  alcance: Alcance,
  deps: DependenciasPanel,
): Promise<ResultadoMover> {
  return moverClase(origen.claseId, destino.inicio, alcanceDeArrastre(origen, alcance), deps);
}
