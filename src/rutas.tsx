// Tabla de rutas hash de todos los módulos (ADR-007; GitHub Pages no reescribe direcciones, §4).
// Cada módulo se carga diferido desde src/modulos/<m>/vistas/Pagina.tsx (default export).
import type { ComponentType } from 'react';
import { createHashRouter, Navigate, Outlet, useLocation, useMatches, type RouteObject } from 'react-router';
import { Layout } from './ui/Layout';
import './ui/tokens.css';
import './ui/base.css';

type CargaPagina = () => Promise<{ default: ComponentType }>;

export interface RutaModulo {
  modulo: string;
  path: string;
  titulo: string;
  cargar: CargaPagina;
}

export const RUTAS_MODULOS: readonly RutaModulo[] = [
  { modulo: 'agenda', path: '/', titulo: 'Agenda', cargar: () => import('./modulos/agenda/vistas/Pagina') },
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
];

interface Manejador {
  titulo?: string;
}

function Raiz() {
  const { pathname } = useLocation();
  const titulo = useMatches()
    .map((m) => (m.handle as Manejador | undefined)?.titulo)
    .filter((t): t is string => t !== undefined)
    .at(-1);
  return (
    <Layout rutaActual={pathname} titulo={titulo}>
      <Outlet />
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
