import { Icono, type NombreIcono } from './Icono';
import estilos from './IconoEstado.module.css';

/**
 * Estados que se muestran con texto + ícono + patrón, nunca solo con color (NFR-05, CA-37).
 * Los tipos de dominio (EstadoHueco, EstadoReserva, EstadoCuenta) viven en `logica/tipos.ts` de cada
 * módulo; este tipo es la unión de presentación y es compatible con ellos.
 */
export type TipoEstado =
  | 'libre'
  | 'ocupado'
  | 'bloqueado'
  | 'pendiente'
  | 'confirmada'
  | 'rechazada'
  | 'cancelada'
  | 'pendienteSinRespuesta'
  | 'aprobada'
  | 'sinCuenta';

export type IconoEstadoProps = {
  estado: TipoEstado;
  /** Texto visible alternativo; por defecto el de `TEXTO_ESTADO`. */
  texto?: string;
};

export const TEXTO_ESTADO: Record<TipoEstado, string> = {
  libre: 'Libre',
  ocupado: 'Ocupado',
  bloqueado: 'Bloqueado',
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada',
  pendienteSinRespuesta: 'Pendiente sin respuesta',
  aprobada: 'Aprobada',
  sinCuenta: 'Sin cuenta',
};

const ICONO_ESTADO: Record<TipoEstado, NombreIcono> = {
  libre: 'tilde',
  ocupado: 'persona',
  bloqueado: 'prohibido',
  pendiente: 'reloj',
  confirmada: 'tilde',
  rechazada: 'cruz',
  cancelada: 'menos',
  pendienteSinRespuesta: 'alerta',
  aprobada: 'tilde',
  sinCuenta: 'usuario',
};

/** Ícono decorativo más el texto del estado, en un solo elemento en línea. */
export function IconoEstado({ estado, texto }: IconoEstadoProps) {
  return (
    <span className={`${estilos.estado} ${estilos[estado]}`} data-estado={estado}>
      <Icono nombre={ICONO_ESTADO[estado]} />
      <span>{texto ?? TEXTO_ESTADO[estado]}</span>
    </span>
  );
}
