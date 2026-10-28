// Tabla de rutas hash de todos los módulos (ADR-007, ADR-020; GitHub Pages no reescribe direcciones, §4).
// Cada módulo se carga diferido desde src/modulos/<m>/vistas/Pagina.tsx (default export).
// Las guardas de src/estado deciden qué se ve en cada ruta (ficha obligatoria, CA-02; rutas por rol; WEB-09).
// `#/p/:slug` es la agenda de un profesor: la ruta le pasa el slug y le compone «Pedir acceso» de `ficha`
// (agenda no importa de otro módulo, componentes.md §5). El selector de profesor de `inicio` va arriba en las
// pantallas de la persona (WEB-11).
import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import {
  createHashRouter,
  Navigate,
  Outlet,
  useLocation,
  useMatches,
  useNavigate,
  useParams,
  type RouteObject,
} from 'react-router';
import {
  cerrarSesion,
  GuardaDeRuta,
  refrescarSesion,
  useAnotarVisitaDeProfesor,
  useProfesorElegido,
  usuarioNavegacion,
  useSesion,
} from './estado';
import { rutaAgendaDePersona } from './modulos/inicio/logica';
import type { ContextoSolicitud, PaginaAgendaRutaProps } from './modulos/agenda/vistas/Pagina';
import { Cargando } from './ui/Cargando';
import { ErrorCarga } from './ui/ErrorCarga';
import { Layout } from './ui/Layout';
import { Navegacion } from './ui/Navegacion';
import { SinPermisos } from './ui/SinPermisos';
import './ui/tokens.css';
import './ui/base.css';

type CargaPagina = () => Promise<{ default: ComponentType }>;

export interface RutaModulo {
  modulo: string;
  path: string;
  titulo: string;
  cargar: CargaPagina;
}

// «Pedir acceso» (ALU-14) solo se descarga cuando la agenda lo muestra: la ruta de agenda sigue liviana (ADR-017).
const PedirAccesoDiferido = lazy(() => import('./modulos/ficha/vistas/PedirAcceso'));

function pedirAcceso(slug: string): ReactNode {
  return (
    <Suspense fallback={null}>
      <PedirAccesoDiferido slug={slug} />
    </Suspense>
  );
}

// El formulario de solicitud (WEB-04) solo se descarga cuando un alumno aprobado toca un hueco libre (ADR-017).
const SolicitudDiferida = lazy(() => import('./modulos/solicitud/vistas/SolicitudDeHueco'));

function solicitud(contexto: ContextoSolicitud): ReactNode {
  return (
    <Suspense fallback={null}>
      <SolicitudDiferida
        profesorId={contexto.profesorId}
        profesorNombre={contexto.profesorNombre}
        zona={contexto.zona}
        hueco={contexto.hueco}
        onCerrar={contexto.onCerrar}
        onCambioAgenda={contexto.onCambioAgenda}
      />
    </Suspense>
  );
}

/** La agenda del profesor del slug de la ruta; `key` la reinicia al cambiar de profesor. */
function conSlug(Agenda: ComponentType<PaginaAgendaRutaProps>): ComponentType {
  return function AgendaDelProfesor() {
    const { slug = '' } = useParams();
    return <Agenda key={slug} slug={slug} pedirAcceso={pedirAcceso} solicitud={solicitud} />;
  };
}

export const RUTAS_MODULOS: readonly RutaModulo[] = [
  { modulo: 'inicio', path: '/', titulo: 'Inicio', cargar: () => import('./modulos/inicio/vistas/Pagina') },
  {
    modulo: 'agenda',
    path: '/p/:slug',
    titulo: 'Agenda',
    cargar: () => import('./modulos/agenda/vistas/Pagina').then((m) => ({ default: conSlug(m.default) })),
  },
  { modulo: 'ingreso', path: '/ingreso', titulo: 'Ingreso', cargar: () => import('./modulos/ingreso/vistas/Pagina') },
  { modulo: 'ficha', path: '/ficha', titulo: 'Ficha', cargar: () => import('./modulos/ficha/vistas/Pagina') },
  {
    modulo: 'solicitud',
    path: '/solicitud',
    titulo: 'Solicitud',
    cargar: () => import('./modulos/solicitud/vistas/Pagina'),
  },
  {
    modulo: 'mis-clases',
    path: '/mis-clases',
    titulo: 'Mis clases',
    cargar: () => import('./modulos/mis-clases/vistas/Pagina'),
  },
  { modulo: 'panel', path: '/panel', titulo: 'Panel', cargar: () => import('./modulos/panel/vistas/Pagina') },
  { modulo: 'lista', path: '/lista', titulo: 'Lista', cargar: () => import('./modulos/lista/vistas/Pagina') },
  {
    modulo: 'configuracion',
    path: '/configuracion',
    titulo: 'Configuración',
    cargar: () => import('./modulos/configuracion/vistas/Pagina'),
  },
  {
    modulo: 'admin',
    path: '/admin',
    titulo: 'Administración',
    cargar: () => import('./modulos/admin/vistas/Pagina'),
  },
];

// WEB-11: el selector se descarga con la primera pantalla de una persona y no se pinta con un solo vínculo.
const SelectorProfesorDiferido = lazy(() => import('./modulos/inicio/vistas/Selector'));

interface Manejador {
  titulo?: string;
}

function Raiz() {
  const { pathname } = useLocation();
  const navegar = useNavigate();
  const sesion = useSesion();
  const elegido = useProfesorElegido();
  useAnotarVisitaDeProfesor(pathname, sesion);
  const titulo = useMatches()
    .map((m) => (m.handle as Manejador | undefined)?.titulo)
    .filter((t): t is string => t !== undefined)
    .at(-1);
  const salir = () => {
    void cerrarSesion()
      .catch(() => undefined)
      .then(() => navegar('/', { replace: true }));
  };
  const esPersona = sesion.tipo === 'sesion' && sesion.sesion.rol === 'alumno';
  return (
    <Layout
      rutaActual={pathname}
      titulo={titulo}
      navegacion={
        <Navegacion
          usuario={usuarioNavegacion(sesion)}
          ruta={pathname}
          onSalir={salir}
          // WEB-11: «Agenda» lleva a la agenda del profesor elegido (o del único); si no, `/` decide.
          rutaAgenda={rutaAgendaDePersona(sesion, elegido)}
        />
      }
    >
      {esPersona ? (
        <Suspense fallback={null}>
          <SelectorProfesorDiferido />
        </Suspense>
      ) : null}
      <GuardaDeRuta
        esperando={<Cargando />}
        sinPermisos={(motivo, destino) => <SinPermisos motivo={motivo} destino={destino} />}
        error={(mensaje) => <ErrorCarga mensaje={mensaje} onReintentar={() => void refrescarSesion()} />}
      >
        <Outlet />
      </GuardaDeRuta>
    </Layout>
  );
}

function SinContenido() {
  return null;
}

export const rutas: RouteObject[] = [
  {
    Component: Raiz,
    HydrateFallback: SinContenido,
    children: [
      ...RUTAS_MODULOS.map(
        (r): RouteObject => ({
          path: r.path,
          handle: { titulo: r.titulo } satisfies Manejador,
          lazy: () => r.cargar().then((m) => ({ Component: m.default })),
        }),
      ),
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];

export function crearRouter() {
  return createHashRouter(rutas);
}
