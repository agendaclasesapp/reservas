import type { ReactElement } from 'react';
import estilos from './Icono.module.css';

export type NombreIcono =
  | 'tilde'
  | 'persona'
  | 'prohibido'
  | 'reloj'
  | 'cruz'
  | 'menos'
  | 'alerta'
  | 'info'
  | 'usuario'
  | 'cerrar'
  | 'flechaIzquierda'
  | 'flechaDerecha'
  | 'calendario'
  | 'menu';

export type IconoProps = {
  nombre: NombreIcono;
  /** Si se da, el ícono es informativo (role="img"); si no, es decorativo (aria-hidden). */
  etiqueta?: string;
  grande?: boolean;
};

const CIRCULO = <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />;

const DIBUJOS: Record<NombreIcono, ReactElement> = {
  tilde: (
    <>
      {CIRCULO}
      <path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  persona: (
    <>
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <circle cx="12" cy="9.5" r="2.5" className={estilos.contraste} />
      <path d="M7.5 17c.6-2.4 2.3-3.5 4.5-3.5s3.9 1.1 4.5 3.5z" className={estilos.contraste} />
    </>
  ),
  prohibido: (
    <>
      {CIRCULO}
      <path d="M5.6 18.4L18.4 5.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  reloj: (
    <>
      {CIRCULO}
      <path d="M12 7v5l3 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  cruz: (
    <>
      {CIRCULO}
      <path d="M9 9l6 6M15 9l-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  menos: (
    <>
      {CIRCULO}
      <path d="M8 12h8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  alerta: (
    <>
      <path d="M12 3.5L22 20.5H2z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 10v4.5M12 17.5v.01" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  info: (
    <>
      {CIRCULO}
      <path d="M12 11v5M12 8v.01" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  usuario: (
    <>
      <circle cx="12" cy="8" r="3.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M5 20c.8-3.6 3.5-5.5 7-5.5s6.2 1.9 7 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  cerrar: <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
  flechaIzquierda: <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  flechaDerecha: <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  calendario: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
};

/** Set de íconos SVG en línea (sistema-diseno.md §7). Decorativo salvo que se pase `etiqueta`. */
export function Icono({ nombre, etiqueta, grande = false }: IconoProps) {
  const clase = grande ? `${estilos.icono} ${estilos.grande}` : estilos.icono;
  const accesibilidad =
    etiqueta === undefined
      ? ({ 'aria-hidden': true, focusable: false } as const)
      : ({ role: 'img', 'aria-label': etiqueta } as const);
  return (
    <svg className={clase} viewBox="0 0 24 24" {...accesibilidad}>
      {DIBUJOS[nombre]}
    </svg>
  );
}
