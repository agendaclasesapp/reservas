import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { crearRouter, rutas, RUTAS_MODULOS } from '../../../src/rutas';

function montar(ruta: string) {
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] });
  render(<RouterProvider router={router} />);
  return router;
}

describe('rutas hash de los 8 módulos (ADR-007, §4)', () => {
  it('NFR_09_las_rutas_son_las_de_adr_007', () => {
    expect(RUTAS_MODULOS.map((r) => r.path)).toEqual([
      '/',
      '/ingreso',
      '/ficha',
      '/solicitud',
      '/mis-clases',
      '/panel',
      '/lista',
      '/configuracion',
    ]);
  });

  it.each(RUTAS_MODULOS.map((r) => [r.path, r.titulo] as const))(
    'WEB_01_08_la_ruta_%s_carga_su_pagina_con_titulo',
    async (path, titulo) => {
      montar(path);
      expect(await screen.findByRole('heading', { level: 1, name: titulo })).toBeDefined();
      // El título lo fija un useEffect de Layout después de pintar el h1 lazy: hay que esperarlo.
      await waitFor(() => expect(document.title).toBe(`${titulo} · ReservaTuClase`));
    },
  );

  it('NFR_09_una_ruta_desconocida_vuelve_a_la_agenda', async () => {
    const router = montar('/no-existe');
    expect(await screen.findByRole('heading', { level: 1, name: 'Agenda' })).toBeDefined();
    expect(router.state.location.pathname).toBe('/');
  });

  it('NFR_09_el_router_de_la_app_lee_la_ruta_del_hash_para_pages_estatico', () => {
    window.history.replaceState(null, '', '/reservas/#/panel');
    const router = crearRouter();
    expect(router.state.location.pathname).toBe('/panel');
    router.dispose();
  });
});
