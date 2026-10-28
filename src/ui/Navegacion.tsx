import { useId, useState, type KeyboardEvent } from 'react';
import { Boton } from './Boton';
import { Icono } from './Icono';
import estilos from './Navegacion.module.css';

/**
 * Estado de la cuenta del alumno: los mismos valores que `sesion_actual().estado` (contratos.md §3, ADR-013).
 * `ficha_incompleta` = ingresó pero no completó la ficha (navegación reducida, F-03); `sin_cuenta` es el alumno
 * que el profesor cargó sin mail (no inicia sesión). H-036.
 */
export type EstadoCuentaNavegacion =
  | 'ficha_incompleta'
  | 'pendiente'
  | 'aprobado'
  | 'rechazado'
  | 'sin_cuenta'
  | 'borrado';

/** Quién navega. */
export type UsuarioNavegacion =
  /** `esAdministrador`: el profesor que además es Administrador ve también «Administración» (ADR-020). */
  | { rol: 'profesor'; esAdministrador?: boolean }
  /** Administrador que no es profesor: solo «Administración» (WEB-10, B15). */
  | { rol: 'administrador' }
  | { rol: 'alumno'; estado: EstadoCuentaNavegacion };

export type NavegacionProps = {
  /** Sin usuario: visitante. */
  usuario?: UsuarioNavegacion;
  /** Ruta actual sin el `#` (p. ej. `useLocation().pathname`): marca `aria-current="page"`. */
  ruta: string;
  /** Si se pasa y hay usuario, agrega el botón "Salir". */
  onSalir?: () => void;
  /**
   * Ruta de «Agenda» de la persona (sin el `#`): la de su profesor elegido o la de su único profesor, que
   * calcula `rutaAgendaDePersona` (WEB-11). Por defecto `/`, que decide el inicio.
   */
  rutaAgenda?: string;
  /** Nombre del landmark. Por defecto "Principal". */
  etiqueta?: string;
};

type Enlace = { texto: string; ruta: string };

const INICIO: Enlace = { texto: 'Inicio', ruta: '/' };
const INGRESAR: Enlace = { texto: 'Ingresar', ruta: '/ingreso' };
const MIS_CLASES: Enlace = { texto: 'Mis clases', ruta: '/mis-clases' };
const FICHA: Enlace = { texto: 'Mi ficha', ruta: '/ficha' };
const PANEL: Enlace = { texto: 'Panel', ruta: '/panel' };
const LISTA: Enlace = { texto: 'Lista', ruta: '/lista' };
const CONFIGURACION: Enlace = { texto: 'Configuración', ruta: '/configuracion' };
const ADMINISTRACION: Enlace = { texto: 'Administración', ruta: '/admin' };

/** Enlaces visibles según rol y estado (flujos.md §1: reglas de acceso, WEB-09, WEB-10, WEB-11). */
function enlacesPara(usuario: UsuarioNavegacion | undefined, rutaAgenda: string): ReadonlyArray<Enlace> {
  const AGENDA: Enlace = { texto: 'Agenda', ruta: rutaAgenda };
  if (!usuario) return [INICIO, INGRESAR];
  if (usuario.rol === 'profesor') {
    return usuario.esAdministrador === true ? [PANEL, LISTA, CONFIGURACION, ADMINISTRACION] : [PANEL, LISTA, CONFIGURACION];
  }
  if (usuario.rol === 'administrador') return [ADMINISTRACION];
  switch (usuario.estado) {
    case 'ficha_incompleta':
      return [FICHA];
    case 'aprobado':
      return [AGENDA, MIS_CLASES, FICHA];
    case 'pendiente':
    case 'rechazado':
      return [AGENDA, FICHA];
    case 'sin_cuenta':
    case 'borrado':
      // Sin acceso a la ficha (la guarda muestra «Sin permisos»): solo la agenda pública.
      return [AGENDA];
  }
}

/**
 * Barra de navegación principal: `<nav aria-label>` con enlaces por rol. Por debajo de 600 px colapsa tras el
 * botón "Menú" (`aria-expanded`); Esc cierra y devuelve el foco al botón. Se pasa a `Layout` por `navegacion`.
 */
export function Navegacion({ usuario, ruta, onSalir, rutaAgenda = '/', etiqueta = 'Principal' }: NavegacionProps) {
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
        {enlacesPara(usuario, rutaAgenda).map((enlace) => (
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
