// Arranque (ADR-007): el retorno PKCE se procesa antes de crear el router hash.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { iniciarSesion } from './estado/sesion';
import { crearRouter } from './rutas';

/**
 * NFR-04 (CA-36): si la dirección inicial es la agenda de un profesor, su código y sus dos lecturas
 * (`config_publica` y `agenda_publica`, en paralelo) se piden ya, sin esperar la sesión ni el router.
 * Son los mismos módulos que carga la ruta: el navegador no los baja dos veces.
 */
function adelantarAgenda(hash: string): void {
  if (!hash.startsWith('#/p/')) return;
  void import('./modulos/agenda/vistas/Pagina').catch(() => undefined);
  void import('./modulos/agenda/logica').then((m) => m.precargarDesdeHash(hash)).catch(() => undefined);
}

async function arrancar(): Promise<void> {
  adelantarAgenda(window.location.hash);
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
