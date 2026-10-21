import { IconoEstado, type TipoEstado } from './IconoEstado';

/** Estados de una reserva (RES, SOL) o de una cuenta de alumno (ALU) que se muestran como insignia. */
export type TipoInsignia = Extract<
  TipoEstado,
  'pendiente' | 'confirmada' | 'rechazada' | 'cancelada' | 'pendienteSinRespuesta' | 'aprobada' | 'sinCuenta'
>;

export type InsigniaProps = {
  tipo: TipoInsignia;
  /** Texto visible alternativo; por defecto el de `TEXTO_ESTADO`. */
  texto?: string;
};

/** Insignia de estado de reserva o cuenta: texto + ícono + patrón de borde, nunca solo color (NFR-05, CA-37). */
export function Insignia({ tipo, texto }: InsigniaProps) {
  return <IconoEstado estado={tipo} texto={texto} />;
}
