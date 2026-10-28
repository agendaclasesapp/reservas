import type { ReactNode } from 'react';
import estilos from './EnlaceAccion.module.css';

export type EnlaceAccionProps = {
  /** Ruta de destino (hash), p. ej. "#/p/ana". */
  href: string;
  /** Texto del enlace. */
  children: ReactNode;
};

/** Enlace que va solo en su línea («Ver la agenda…»): mismo estilo y área táctil mínima de 44 px (NFR-06, CA-38). */
export function EnlaceAccion({ href, children }: EnlaceAccionProps) {
  return (
    <a href={href} className={estilos.enlace}>
      {children}
    </a>
  );
}
