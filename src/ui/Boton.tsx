import type { MouseEvent, ReactNode } from 'react';
import estilos from './Boton.module.css';

export type VarianteBoton = 'primario' | 'secundario' | 'peligro';

export type BotonProps = {
  variante?: VarianteBoton;
  /** Operación en curso: muestra `textoCargando`, marca `aria-busy` y ignora clics (sin perder el foco). */
  cargando?: boolean;
  /** Texto mientras `cargando`, p. ej. "Enviando…". Por defecto sigue `children`. */
  textoCargando?: string;
  deshabilitado?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (evento: MouseEvent<HTMLButtonElement>) => void;
  id?: string;
  'aria-label'?: string;
  'aria-expanded'?: boolean;
  'aria-controls'?: string;
  children: ReactNode;
};

/** Botón nativo con variantes; objetivo táctil de 44 px (NFR-06). */
export function Boton({
  variante = 'primario',
  cargando = false,
  textoCargando,
  deshabilitado = false,
  type = 'button',
  onClick,
  children,
  ...aria
}: BotonProps) {
  const manejarClic = (evento: MouseEvent<HTMLButtonElement>) => {
    if (cargando) {
      evento.preventDefault();
      return;
    }
    onClick?.(evento);
  };
  return (
    <button
      {...aria}
      type={type}
      className={`${estilos.boton} ${estilos[variante]}`}
      disabled={deshabilitado}
      aria-busy={cargando || undefined}
      aria-disabled={cargando || undefined}
      onClick={manejarClic}
    >
      {cargando && textoCargando !== undefined ? textoCargando : children}
    </button>
  );
}
