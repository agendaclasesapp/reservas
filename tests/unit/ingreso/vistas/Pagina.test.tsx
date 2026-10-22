// @vitest-environment jsdom
// Página `#/ingreso` montada en un router: conecta la lógica de ingreso con la pantalla (WEB-02, CA-01, CA-44).
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearTurnstileFalso } from './turnstile-falso';

const logica = vi.hoisted(() => ({
  pedirCodigo: vi.fn(),
  verificarCodigo: vi.fn(),
  ingresarConGoogle: vi.fn(),
  tomarErrorDeIngreso: vi.fn(),
}));

vi.mock('../../../../src/modulos/ingreso/logica', async (importarOriginal) => ({
  ...(await importarOriginal<object>()),
  ...logica,
  msParaReenviar: () => 0,
}));

import Pagina from '../../../../src/modulos/ingreso/vistas/Pagina';

function montar(entrada: string) {
  const router = createMemoryRouter(
    [
      { path: '/ingreso', element: <Pagina /> },
      { path: '/mis-clases', element: <h1>Mis clases</h1> },
      { path: '/', element: <h1>Agenda</h1> },
    ],
    { initialEntries: [entrada] },
  );
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  logica.tomarErrorDeIngreso.mockReturnValue(null);
  logica.pedirCodigo.mockResolvedValue({ ok: true });
  logica.verificarCodigo.mockResolvedValue({ ok: true });
  logica.ingresarConGoogle.mockResolvedValue({ ok: true });
  vi.stubEnv('VITE_TURNSTILE_SITEKEY', '1x00000000000000000000AA');
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  delete window.turnstile;
});

describe('Página de ingreso (WEB-02)', () => {
  it('WEB_02_muestra_una_sola_vez_el_error_de_la_vuelta_de_Google', async () => {
    logica.tomarErrorDeIngreso.mockReturnValue('No pudimos completar el ingreso con Google. Probá de nuevo.');
    montar('/ingreso');
    expect((await screen.findByRole('alert')).textContent).toContain('No pudimos completar el ingreso con Google.');
    expect(logica.tomarErrorDeIngreso).toHaveBeenCalledOnce();
  });

  it('CA_44_Continuar_con_Google_pasa_la_busqueda_para_volver_y_no_carga_Turnstile', async () => {
    const turnstile = crearTurnstileFalso();
    window.turnstile = turnstile.api;
    montar('/ingreso?volver=%2Fmis-clases');
    await userEvent.click(await screen.findByRole('button', { name: 'Continuar con Google' }));
    expect(logica.ingresarConGoogle).toHaveBeenCalledWith({ busqueda: '?volver=%2Fmis-clases' });
    expect(turnstile.render).not.toHaveBeenCalled();
  });

  it('CA_01_CA_44_entra_con_codigo_con_el_desafio_de_prueba_y_vuelve_a_la_ruta_guardada', async () => {
    const turnstile = crearTurnstileFalso();
    window.turnstile = turnstile.api;
    montar('/ingreso?volver=%2Fmis-clases');
    await userEvent.click(await screen.findByRole('button', { name: 'Entrar con un código por mail' }));
    await waitFor(() => expect(turnstile.render).toHaveBeenCalled());
    expect(turnstile.opciones().sitekey).toBe('1x00000000000000000000AA');
    await userEvent.type(screen.getByLabelText(/^Mail/), 'ana@correo.test');
    turnstile.resolver('XXXX.DUMMY.TOKEN.XXXX');
    await userEvent.click(screen.getByRole('button', { name: 'Pedir código' }));
    await userEvent.type(await screen.findByLabelText(/^Código de 6 dígitos/), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('heading', { name: 'Mis clases' })).toBeTruthy();
    expect(logica.pedirCodigo).toHaveBeenCalledWith({ mail: 'ana@correo.test', captchaToken: 'XXXX.DUMMY.TOKEN.XXXX' });
    expect(logica.verificarCodigo).toHaveBeenCalledWith({ mail: 'ana@correo.test', codigo: '123456' });
  });

  it('WEB_02_sin_VITE_TURNSTILE_SITEKEY_el_codigo_no_esta_disponible', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITEKEY', '');
    montar('/ingreso');
    await userEvent.click(await screen.findByRole('button', { name: 'Entrar con un código por mail' }));
    expect((await screen.findByRole('alert')).textContent).toContain('no está disponible');
    expect(logica.pedirCodigo).not.toHaveBeenCalled();
  });
});
