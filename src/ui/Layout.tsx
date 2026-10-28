import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import estilos from './Layout.module.css';

export type LayoutProps = {
  children: ReactNode;
  /** Barra de navegación (C-13), ya construida por quien monta la app. */
  navegacion?: ReactNode;
  /** Clave de la ruta actual (p. ej. `location.pathname`): al cambiar, el foco va al `h1` (A11Y-13). */
  rutaActual?: string;
  /** Título del documento por ruta (A11Y-12), p. ej. "Agenda". Se publica como "Agenda · Agenda Clases App". */
  titulo?: string;
};

export const NOMBRE_APP = 'Agenda Clases App';
export const ID_CONTENIDO = 'contenido';
/** Atributos `width`/`height` del ícono (evitan el salto de maquetación); el tamaño visible lo fija `--icono-marca`. */
const ICONO_PX = 40;

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
          <p className={estilos.marca}>
            {/* Decorativo: el nombre ya está como texto al lado (WEB-12, A11Y: sin nombre repetido). */}
            <img
              src={`${import.meta.env.BASE_URL}icono-192.png`}
              alt=""
              width={ICONO_PX}
              height={ICONO_PX}
              className={estilos.icono}
            />
            <span>{NOMBRE_APP}</span>
          </p>
          {navegacion}
        </div>
      </header>
      <main id={ID_CONTENIDO} ref={principal} tabIndex={-1} className={estilos.principal}>
        {children}
      </main>
    </div>
  );
}
