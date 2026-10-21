import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import estilos from './Layout.module.css';

export type LayoutProps = {
  children: ReactNode;
  /** Barra de navegación (C-13), ya construida por quien monta la app. */
  navegacion?: ReactNode;
  /** Clave de la ruta actual (p. ej. `location.pathname`): al cambiar, el foco va al `h1` (A11Y-13). */
  rutaActual?: string;
  /** Título del documento por ruta (A11Y-12), p. ej. "Agenda". Se publica como "Agenda · ReservaTuClase". */
  titulo?: string;
};

export const NOMBRE_APP = 'ReservaTuClase';
export const ID_CONTENIDO = 'contenido';

/** Con rutas hash, un `href="#contenido"` cambiaría la ruta de la SPA: se enfoca el `<main>` a mano. */
function irAlContenido(evento: MouseEvent<HTMLAnchorElement>) {
  evento.preventDefault();
  document.getElementById(ID_CONTENIDO)?.focus();
}

/** Estructura de la app: enlace "Ir al contenido", cabecera con navegación, `<main>` y foco por ruta. */
export function Layout({ children, navegacion, rutaActual, titulo }: LayoutProps) {
  const principal = useRef<HTMLElement>(null);
  const rutaAnterior = useRef(rutaActual);

  useEffect(() => {
    document.title = titulo ? `${titulo} · ${NOMBRE_APP}` : NOMBRE_APP;
  }, [titulo]);

  useEffect(() => {
    if (rutaAnterior.current === rutaActual) return;
    rutaAnterior.current = rutaActual;
    const destino = principal.current?.querySelector<HTMLElement>('h1') ?? principal.current;
    if (destino) {
      if (!destino.hasAttribute('tabindex')) destino.setAttribute('tabindex', '-1');
      destino.focus();
    }
  }, [rutaActual]);

  return (
    <div className={estilos.pagina}>
      <a href={`#${ID_CONTENIDO}`} className={estilos.saltar} onClick={irAlContenido}>
        Ir al contenido
      </a>
      <header className={estilos.cabecera}>
        <div className={estilos.cabeceraInterior}>
          <p className={estilos.marca}>{NOMBRE_APP}</p>
          {navegacion}
        </div>
      </header>
      <main id={ID_CONTENIDO} ref={principal} tabIndex={-1} className={estilos.principal}>
        {children}
      </main>
    </div>
  );
}
