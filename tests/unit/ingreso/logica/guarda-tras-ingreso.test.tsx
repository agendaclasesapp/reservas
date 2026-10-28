// H-160 (CA-02, WEB-02, WEB-03): la guarda montada en el layout (como en src/rutas.tsx) debe llevar a la
// ficha aunque la página de ingreso navegue a `/` mientras la redirección a `/ficha` todavía carga. `/`
// (WEB-09) se muestra al visitante y lleva a la persona con un solo vínculo a la agenda de su profesor.
import type { SupabaseClient } from '@supabase/supabase-js';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { GuardaDeRuta, refrescarSesion, type SesionActual } from '../../../../src/estado';
import { configurarSesionActual } from '../../../../src/estado/sesion-actual';
import { inscripcion, persona } from '../../estado/soporte';

function clienteCon(sesion: SesionActual): SupabaseClient {
  const cliente = {
    rpc: async () => ({ data: sesion, error: null }),
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) },
  };
  return cliente as unknown as SupabaseClient;
}

function Raiz() {
  return (
    <main>
      <GuardaDeRuta esperando={<p>esperando</p>}>
        <Outlet />
      </GuardaDeRuta>
    </main>
  );
}

/** Rutas como en src/rutas.tsx: la guarda en el layout y `/ficha` diferida (lazy) hasta `soltarFicha()`. */
function montar(ruta: string) {
  let soltarFicha: () => void = () => undefined;
  const fichaCargada = new Promise<void>((r) => {
    soltarFicha = r;
  });
  const router = createMemoryRouter(
    [
      {
        Component: Raiz,
        children: [
          { path: '/', element: <p>inicio</p> },
          { path: '/p/:slug', element: <p>agenda</p> },
          { path: '/ingreso', element: <p>ingreso</p> },
          { path: '/ficha', lazy: () => fichaCargada.then(() => ({ element: <p>ficha</p> })) },
        ],
      },
    ],
    { initialEntries: [ruta] },
  );
  render(<RouterProvider router={router} />);
  return { router, soltarFicha };
}

describe('guarda de ruta tras ingresar (H-160)', () => {
  afterEach(() => configurarSesionActual());

  it('CA_02_tras_verificar_el_codigo_la_cuenta_nueva_termina_en_la_ficha_aunque_se_navegue_a_la_agenda', async () => {
    let conSesion = false;
    configurarSesionActual({ haySesionGuardada: () => conSesion, obtenerCliente: async () => clienteCon(persona([], 'ficha_incompleta')) });
    const { router, soltarFicha } = montar('/ingreso');
    expect(await screen.findByText('ingreso')).toBeTruthy();

    // verificarCodigo: supabase-js guarda la sesión y `alIngresar` refresca el estado de la app.
    conSesion = true;
    await act(async () => {
      await refrescarSesion();
    });
    // La guarda ya pidió ir a /ficha (todavía cargando); la página de ingreso navega a su destino.
    await act(async () => {
      await router.navigate('/', { replace: true });
    });
    await act(async () => {
      soltarFicha();
      await Promise.resolve();
    });

    await waitFor(() => expect(router.state.location.pathname).toBe('/ficha'));
    expect(await screen.findByText('ficha')).toBeTruthy();
  });

  it('WEB_09_el_inicio_se_muestra_al_visitante', async () => {
    configurarSesionActual({ haySesionGuardada: () => false });
    const { router } = montar('/');
    expect(await screen.findByText('inicio')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/');
  });

  it('WEB_09_la_persona_con_un_solo_vinculo_va_del_inicio_a_la_agenda_de_su_profesor', async () => {
    const sesion = persona([inscripcion('ana-perez', 'aprobado')]);
    configurarSesionActual({ haySesionGuardada: () => true, obtenerCliente: async () => clienteCon(sesion) });
    const { router } = montar('/');
    await act(async () => {
      await refrescarSesion();
    });
    expect(await screen.findByText('agenda')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/p/ana-perez');
  });

  it('WEB_11_la_persona_con_mas_de_un_vinculo_se_queda_en_el_inicio', async () => {
    const sesion = persona([inscripcion('ana-perez', 'aprobado'), inscripcion('beto-gil', 'pendiente')]);
    configurarSesionActual({ haySesionGuardada: () => true, obtenerCliente: async () => clienteCon(sesion) });
    const { router } = montar('/');
    await act(async () => {
      await refrescarSesion();
    });
    expect(await screen.findByText('inicio')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/');
  });
});
