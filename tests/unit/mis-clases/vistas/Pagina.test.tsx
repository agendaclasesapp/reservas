// @vitest-environment jsdom
// Página `#/mis-clases` conectada a la sesión y a `useMisClases` (T07.2): WEB-05, RES-06, ALU-03.
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EstadoMisClases } from '../../../../src/modulos/mis-clases/logica';
import { fijarSesion } from '../../ui/sesion';
import { sinViolacionesAxe } from '../../ui/soporte';
import { clase, inscripcion, LISTO, sesion } from './soporte';

const logica = vi.hoisted(() => ({
  datos: { estado: 'cargando', clases: [], error: null } as EstadoMisClases,
  recargar: vi.fn(),
}));

vi.mock('../../../../src/modulos/mis-clases/logica', async (importarOriginal) => ({
  ...(await importarOriginal<object>()),
  useMisClases: () => ({ datos: logica.datos, recargar: logica.recargar }),
}));

import Pagina from '../../../../src/modulos/mis-clases/vistas/Pagina';

afterEach(cleanup);

describe('Página #/mis-clases (WEB-05)', () => {
  it('WEB_05_muestra_el_vinculo_con_el_motivo_y_las_clases_de_useMisClases', async () => {
    await fijarSesion(
      sesion({
        inscripciones: [
          inscripcion(),
          inscripcion({ profesor_id: 'pb', slug: 'beto', profesor_nombre: 'Profe Beto', estado: 'rechazado', motivo_rechazo: 'Sin lugar' }),
        ],
      }),
    );
    logica.datos = LISTO([clase()]);
    const { container } = render(<Pagina />);
    expect(screen.getByRole('heading', { level: 1, name: 'Mis clases' })).toBeTruthy();
    expect(within(screen.getByRole('article', { name: 'Profe Beto' })).getByText('Sin lugar')).toBeTruthy();
    expect(screen.getByRole('article', { name: /2 de noviembre, 10:00 a 11:00/ })).toBeTruthy();
    await sinViolacionesAxe(container);
  });

  it('WEB_05_el_error_de_carga_reintenta_con_recargar_de_useMisClases', async () => {
    await fijarSesion(sesion());
    logica.datos = { estado: 'error', clases: [], error: 'No hay conexión.' };
    render(<Pagina />);
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(logica.recargar).toHaveBeenCalledOnce();
  });

  it('WEB_05_sin_sesion_dice_que_hay_que_ingresar', async () => {
    await fijarSesion(null);
    logica.datos = LISTO([]);
    render(<Pagina />);
    expect(await screen.findByRole('link', { name: 'Ingresar' })).toBeTruthy();
  });
});
