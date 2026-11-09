// Conexión del arrastre con la lógica (CAL-13, CAL-14, INV-01, INV-05; ADR-026): arma las `ReglasArrastre` que consumen
// las vistas con las funciones de `logica/arrastre.ts` (T21.1), ligadas a las columnas visibles, al eje, al reloj de la
// vista y a los permisos del profesor. No guarda nada ni calcula reglas: solo cierra los argumentos que la vista no
// conoce. Lo usa `PaginaPanel`; las vistas reciben el resultado por props.
import {
  destinoEnPunto,
  minutosEnPunto,
  moverPorArrastre,
  origenDeArrastre,
  type ColumnaCalendario,
  type EjeCalendario,
} from '../logica';
import type { ReglasArrastre } from './arrastre';

export type OpcionesReglasArrastre = {
  /** Las columnas que dibuja la grilla (`calendarioConElementos`): los destinos salen de las filas visibles. */
  columnas: readonly ColumnaCalendario[];
  /** Para la escala (`altoHoraRem`) con la que se dibujó el eje. */
  eje: Pick<EjeCalendario, 'altoHoraRem'>;
  /** `sesion.profesor.activo`: con el profesor inactivo nada se arrastra (INV-05, CA-79). */
  profesorActivo: boolean;
  /** El reloj de la vista (`useAhora`): un hueco que ya empezó no es destino. */
  ahora: Date;
};

export function reglasDeArrastre({ columnas, eje, profesorActivo, ahora }: OpcionesReglasArrastre): ReglasArrastre {
  return {
    origenDe: (fila) => origenDeArrastre(fila, profesorActivo),
    // Los px por rem salen de la caja real de la columna: alto = horas del eje × alto de la hora en rem × px por rem.
    minutosEnPunto: (y, { arriba, alto, desdeMin, hastaMin }) => {
      const remsDeLaColumna = ((hastaMin - desdeMin) / 60) * eje.altoHoraRem;
      return minutosEnPunto(y - arriba, { eje: { desdeMin, hastaMin, altoHoraRem: eje.altoHoraRem }, pxPorRem: alto / remsDeLaColumna });
    },
    destinoEnPunto: ({ dia, minutos, origen }) => {
      const columna = columnas.find((c) => c.dia === dia);
      // Si el profesor quedó inactivo a mitad del gesto, `origenDeArrastre` ya no lo deja mover: no hay destino.
      const vigente = origenDeArrastre(origen.fila, profesorActivo);
      return columna ? destinoEnPunto({ columna, minutos, origen: vigente, ahora }) : null;
    },
    // Siempre contesta la base (`moverClase`): si la clase ya no se puede mover, el mensaje es el de «Mover» (INV-01).
    mover: (origen, destino, alcance) => moverPorArrastre(origen, destino, alcance),
  };
}
