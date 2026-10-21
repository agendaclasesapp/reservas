import { useId, useState, type KeyboardEvent } from 'react';
import { Boton } from './Boton';
import { Icono } from './Icono';
import estilos from './Navegacion.module.css';

export type EstadoCuentaNavegacion = 'sinCuenta' | 'pendiente' | 'aprobada' | 'rechazada';

/** Quién navega. `sinCuenta` = ingresó pero no completó la ficha (navegación reducida, F-03). */
export type UsuarioNavegacion =
  | { rol: 'profesor' }
  | { rol: 'alumno'; estado: EstadoCuentaNavegacion };

export type NavegacionProps = {
  /** Sin usuario: visitante. */
  usuario?: UsuarioNavegacion;
  /** Ruta actual sin el `#` (p. ej. `useLocation().pathname`): marca `aria-current="page"`. */
  ruta: string;
  /** Si se pasa y hay usuario, agrega el botón "Salir". */
  onSalir?: () => void;
  /** Nombre del landmark. Por defecto "Principal". */
  etiqueta?: string;
};

type Enlace = { texto: string; ruta: string };

const AGENDA: Enlace = { texto: 'Agenda', ruta: '/' };
const INGRESAR: Enlace = { texto: 'Ingresar', ruta: '/ingreso' };
const MIS_CLASES: Enlace = { texto: 'Mis clases', ruta: '/mis-clases' };
const FICHA: Enlace = { texto: 'Mi ficha', ruta: '/ficha' };
const PANEL: Enlace = { texto: 'Panel', ruta: '/panel' };
const LISTA: Enlace = { texto: 'Lista', ruta: '/lista' };
const CONFIGURACION: Enlace = { texto: 'Configuración', ruta: '/configuracion' };

/** Enlaces visibles según rol y estado (flujos.md §1: reglas de acceso). */
function enlacesPara(usuario: UsuarioNavegacion | undefined): ReadonlyArray<Enlace> {
  if (!usuario) return [AGENDA, INGRESAR];
  if (usuario.rol === 'profesor') return [PANEL, LISTA, CONFIGURACION];
  if (usuario.estado === 'sinCuenta') return [FICHA];
  if (usuario.estado === 'aprobada') return [AGENDA, MIS_CLASES, FICHA];
  return [AGENDA, FICHA];
}

/**
 * Barra de navegación principal: `<nav aria-label>` con enlaces por rol. Por debajo de 600 px colapsa tras el
 * botón "Menú" (`aria-expanded`); Esc cierra y devuelve el foco al botón. Se pasa a `Layout` por `navegacion`.
 */
export function Navegacion({ usuario, ruta, onSalir, etiqueta = 'Principal' }: NavegacionProps) {
  const idBase = useId();
  const idLista = `${idBase}-lista`;
  const idBoton = `${idBase}-menu`;
  // El menú se abre "en una ruta": al navegar deja de coincidir y se cierra sin efectos.
  const [rutaAbierta, setRutaAbierta] = useState<string | null>(null);
  const abierto = rutaAbierta === ruta;

  const alPresionar = (evento: KeyboardEvent<HTMLElement>) => {
    if (evento.key !== 'Escape' || !abierto) return;
    setRutaAbierta(null);
    document.getElementById(idBoton)?.focus();
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Esc cierra el menú desde cualquier enlace
    <nav aria-label={etiqueta} className={`${estilos.nav} ${abierto ? estilos.abierta : ''}`} onKeyDown={alPresionar}>
      <div className={estilos.menu}>
        <Boton
          id={idBoton}
          variante="secundario"
          aria-expanded={abierto}
          aria-controls={idLista}
          onClick={() => setRutaAbierta(abierto ? null : ruta)}
        >
          <Icono nombre="menu" />
          Menú
        </Boton>
      </div>
      <ul id={idLista} className={estilos.lista}>
        {enlacesPara(usuario).map((enlace) => (
          <li key={enlace.ruta}>
            <a
              href={`#${enlace.ruta}`}
              className={estilos.enlace}
              aria-current={enlace.ruta === ruta ? 'page' : undefined}
            >
              {enlace.texto}
            </a>
          </li>
        ))}
        {usuario && onSalir ? (
          <li>
            <Boton variante="secundario" onClick={onSalir}>
              Salir
            </Boton>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
