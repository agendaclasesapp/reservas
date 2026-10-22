// @vitest-environment jsdom
// Montaje mínimo de la sección en la página de Configuración (T03.2): WEB-08, CA-34.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sinViolacionesAxe } from '../../ui/soporte';

const configPublica = vi.hoisted(() => ({
  actual: { estado: 'cargando', config: null, error: null, recargar: () => {} } as Record<string, unknown>,
}));

vi.mock('../../../../src/modulos/agenda/logica', () => ({
  useConfigPublica: () => configPublica.actual,
}));
vi.mock('../../../../src/modulos/configuracion/logica', async (importarOriginal) => ({
  ...(await importarOriginal<object>()),
  useMailsFallidos: () => ({ datos: { estado: 'listo', mails: [], error: null }, recargar: () => {} }),
}));

import Pagina from '../../../../src/modulos/configuracion/vistas/Pagina';

afterEach(cleanup);

describe('Página de Configuración (WEB-08)', () => {
  it('WEB_08_cargando_la_configuracion_muestra_el_titulo_y_un_indicador', async () => {
    configPublica.actual = { estado: 'cargando', config: null, error: null, recargar: () => {} };
    const { container } = render(<Pagina />);
    expect(screen.getByRole('heading', { level: 1, name: 'Configuración' })).toBeTruthy();
    expect(screen.getByRole('status')).toBeTruthy();
    await sinViolacionesAxe(container);
  });

  it('WEB_08_con_la_configuracion_lista_monta_la_seccion_mails_fallidos', async () => {
    configPublica.actual = {
      estado: 'listo',
      config: { zona_horaria: 'America/Argentina/Buenos_Aires' },
      error: null,
      recargar: () => {},
    };
    const { container } = render(<Pagina />);
    expect(screen.getByRole('heading', { level: 2, name: 'Mails fallidos' })).toBeTruthy();
    expect(screen.getByText('No hay mails fallidos')).toBeTruthy();
    await sinViolacionesAxe(container);
  });

  it('WEB_08_si_falla_la_configuracion_ofrece_reintentar', async () => {
    const recargar = vi.fn();
    configPublica.actual = { estado: 'error', config: null, error: { mensaje: 'Sin conexión.' }, recargar };
    const { container } = render(<Pagina />);
    expect(screen.getByRole('alert').textContent).toContain('No se pudo cargar la configuración. Sin conexión.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
    await sinViolacionesAxe(container);
  });
});
