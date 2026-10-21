// Arranque (ADR-007): el retorno PKCE se procesa antes de crear el router hash.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { iniciarSesion } from './estado/sesion';
import { crearRouter } from './rutas';

async function arrancar(): Promise<void> {
  try {
    await iniciarSesion();
  } catch {
    // La app sigue como visitante; B04 muestra el error de ingreso.
  }
  const raiz = document.getElementById('raiz');
  if (!raiz) throw new Error('Falta el elemento #raiz en index.html.');
  createRoot(raiz).render(
    <StrictMode>
      <RouterProvider router={crearRouter()} />
    </StrictMode>,
  );
}

void arrancar();
