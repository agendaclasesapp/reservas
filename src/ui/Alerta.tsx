import type { ReactNode } from 'react';
import { Icono, type NombreIcono } from './Icono';
import estilos from './Alerta.module.css';

export type TipoAlerta = 'error' | 'aviso' | 'info' | 'exito';

export type AlertaProps = {
  tipo: TipoAlerta;
  /** Título corto en negrita (no es un encabezado: no altera la jerarquía de la página). */
  titulo?: string;
  children: ReactNode;
  /** Acción sugerida (botón o enlace) ya construida por quien lo usa. */
  accion?: ReactNode;
};

const ICONO: Record<TipoAlerta, NombreIcono> = {
  error: 'cruz',
  aviso: 'alerta',
  info: 'info',
  exito: 'tilde',
};

/** Nombre del tipo, anunciado por el lector de pantalla antes del mensaje (el color no es el único canal). */
const NOMBRE_TIPO: Record<TipoAlerta, string> = {
  error: 'Error',
  aviso: 'Aviso',
  info: 'Información',
  exito: 'Éxito',
};

/** Mensaje en línea: ícono distinto + texto + color. `role=alert` para errores, `role=status` para el resto (A11Y-24). */
export function Alerta({ tipo, titulo, children, accion }: AlertaProps) {
  return (
    <div role={tipo === 'error' ? 'alert' : 'status'} className={`${estilos.alerta} ${estilos[tipo]}`} data-tipo={tipo}>
      <span className={estilos.icono}>
        <Icono nombre={ICONO[tipo]} etiqueta={NOMBRE_TIPO[tipo]} />
      </span>
      <div className={estilos.cuerpo}>
        {titulo ? <p className={estilos.titulo}>{titulo}</p> : null}
        <div className={estilos.texto}>{children}</div>
        {accion ? <div className={estilos.accion}>{accion}</div> : null}
      </div>
    </div>
  );
}
