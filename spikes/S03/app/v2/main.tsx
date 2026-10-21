import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router';
import { cargarSupabase } from './datos';

// ADR-006: la agenda se pide sin esperar la sesión; la sesión se lee en paralelo.
void cargarSupabase().then((s) => s.auth.getSession());

const router = createHashRouter([
  { path: '/', lazy: () => import('./rutas/agenda').then((m) => ({ Component: m.default })) },
  { path: '/ingreso', lazy: () => import('./rutas/ingreso').then((m) => ({ Component: m.default })) },
]);

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
