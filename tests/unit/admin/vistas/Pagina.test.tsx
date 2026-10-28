// @vitest-environment jsdom
// B15 · T15.2 · Página `#/admin`: conecta los hooks de `logica/` con la vista (WEB-10, ADM-02, ADM-03, ADM-05).
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoProfesores, ProfesorLista } from '../../../../src/modulos/admin/logica';
import { sinViolacionesAxe } from '../../ui/soporte';

const ANA: ProfesorLista = {
  profesor_id: 'p1',
  nombre: 'Ana Pérez',
  mail: 'ana@example.test',
  slug: 'ana-perez',
  activo: true,
  creado_en: '2026-10-01T10:00:00+00:00',
  enlace: 'https://ejemplo.test/reservas/#/p/ana-perez',
};

const logica = vi.hoisted(() => ({
  datos: { estado: 'cargando', profesores: [], error: null } as EstadoProfesores,
  recargar: vi.fn(),
  enviar: vi.fn(),
  cambiar: vi.fn(),
  cambiando: null as string | null,
}));

vi.mock('../../../../src/modulos/admin/logica', async (importarOriginal) => ({
  ...(await importarOriginal<object>()),
  useProfesores: () => ({ datos: logica.datos, recargar: logica.recargar }),
  useAltaProfesor: () => ({ enviando: false, resultado: null, enviar: logica.enviar, limpiar: () => undefined }),
  useCambiarEstadoProfesor: () => ({ cambiando: logica.cambiando, resultado: null, cambiar: logica.cambiar }),
}));

import Pagina from '../../../../src/modulos/admin/vistas/Pagina';

beforeEach(() => {
  logica.datos = { estado: 'listo', profesores: [ANA], error: null };
  logica.cambiando = null;
  logica.recargar.mockReset();
  logica.enviar.mockReset().mockResolvedValue({ ok: true, profesorId: 'p9', slug: 'nuevo', adoptado: false });
  logica.cambiar.mockReset().mockResolvedValue({ ok: true, profesorId: 'p1', activo: false });
});
afterEach(cleanup);

describe('Página de Administración (WEB-10)', () => {
  it('WEB_10_muestra_la_lista_de_los_hooks_y_pasa_axe', async () => {
    const { container } = render(<Pagina />);
    expect(screen.getByRole('heading', { level: 1, name: 'Administración' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Ana Pérez' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dar de alta' })).toBeTruthy();
    await sinViolacionesAxe(container);
  });

  it('WEB_10_cargando_muestra_el_indicador', async () => {
    logica.datos = { estado: 'cargando', profesores: [], error: null };
    const { container } = render(<Pagina />);
    expect(screen.getByText('Cargando los profesores…')).toBeTruthy();
    await sinViolacionesAxe(container);
  });

  it('ADM_02_el_alta_llama_a_enviar_del_hook_y_recarga_la_lista', async () => {
    render(<Pagina />);
    await userEvent.type(screen.getByLabelText(/Mail del profesor/), 'nuevo@example.test');
    await userEvent.type(screen.getByLabelText(/Nombre del profesor/), 'Nuevo');
    await userEvent.type(screen.getByLabelText(/Enlace del profesor/), 'nuevo');
    await userEvent.click(screen.getByRole('button', { name: 'Dar de alta' }));
    await waitFor(() => expect(logica.recargar).toHaveBeenCalledOnce());
    expect(logica.enviar).toHaveBeenCalledExactlyOnceWith({ mail: 'nuevo@example.test', nombre: 'Nuevo', slug: 'nuevo' });
  });

  it('ADM_05_inactivar_llama_a_cambiar_del_hook_y_recarga_la_lista', async () => {
    render(<Pagina />);
    await userEvent.click(screen.getByRole('button', { name: 'Inactivar a Ana Pérez' }));
    const dialogo = await screen.findByRole('dialog');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Inactivar' }));
    await waitFor(() => expect(logica.recargar).toHaveBeenCalledOnce());
    expect(logica.cambiar).toHaveBeenCalledExactlyOnceWith('p1', false);
  });
});
