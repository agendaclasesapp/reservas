// @vitest-environment jsdom
// Página `#/` (WEB-09, WEB-11, ADR-020): sin enlace de profesor solo el mensaje fijo y el acceso al ingreso; con un
// vínculo redirige a su agenda; con más de uno remite al selector; profesor y Administrador, a su pantalla.
import type { SupabaseClient } from '@supabase/supabase-js';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { configurarSesionActual } from '../../../../src/estado/sesion-actual';
import Pagina from '../../../../src/modulos/inicio/vistas/Pagina';
import { ADMINISTRADOR, inscripcion, persona, profesor } from '../../estado/soporte';
import { sinViolacionesAxe } from '../../ui/soporte';
import { fijarSesion, restaurarSesion } from '../../ui/sesion';

afterEach(() => {
  cleanup();
  restaurarSesion();
});

function Ubicacion() {
  return <p data-testid="ubicacion">{useLocation().pathname}</p>;
}

function montar() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Pagina />} />
        <Route path="*" element={<Ubicacion />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Inicio sin enlace (WEB-09)', () => {
  it('WEB_09_el_visitante_ve_solo_Pedile_el_enlace_a_tu_profesor_y_el_acceso_al_ingreso', async () => {
    await fijarSesion(null);
    const { container } = montar();
    expect(screen.getByRole('heading', { level: 1, name: 'Pedile el enlace a tu profesor' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ingresar' }).getAttribute('href')).toBe('#/ingreso');
    // No lista profesores ni muestra agenda.
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByText(/huecos|agenda/i)).toBeNull();
    await sinViolacionesAxe(container);
  });

  it('WEB_09_una_persona_sin_vinculos_ve_el_mismo_mensaje_sin_el_acceso_al_ingreso', async () => {
    await fijarSesion(persona([]));
    const { container } = montar();
    expect(screen.getByRole('heading', { level: 1, name: 'Pedile el enlace a tu profesor' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Ingresar' })).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
    await sinViolacionesAxe(container);
  });

  it('WEB_09_mientras_carga_la_sesion_anuncia_cargando_y_no_muestra_el_mensaje', async () => {
    configurarSesionActual({
      haySesionGuardada: () => true,
      obtenerCliente: () => new Promise<SupabaseClient>(() => undefined),
    });
    const { container } = montar();
    expect(screen.getByRole('heading', { level: 1, name: 'Inicio' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Cargando…');
    expect(screen.queryByText('Pedile el enlace a tu profesor')).toBeNull();
    await sinViolacionesAxe(container);
  });

  it('WEB_09_si_la_sesion_no_se_puede_leer_muestra_el_mensaje_sin_invitar_a_ingresar', async () => {
    const cliente = {
      rpc: async () => ({ data: null, error: { code: 'XX000', message: 'falló', details: null, hint: null } }),
      auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) },
    } as unknown as SupabaseClient;
    configurarSesionActual({ haySesionGuardada: () => true, obtenerCliente: async () => cliente });
    montar();
    expect(await screen.findByRole('heading', { level: 1, name: 'Pedile el enlace a tu profesor' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Ingresar' })).toBeNull();
  });
});

describe('Inicio con vínculos (WEB-09, WEB-11, DEC-25)', () => {
  it('WEB_09_con_un_solo_vinculo_abre_la_agenda_de_ese_profesor', async () => {
    await fijarSesion(persona([inscripcion('beto-gomez', 'aprobado')]));
    montar();
    expect((await screen.findByTestId('ubicacion')).textContent).toBe('/p/beto-gomez');
  });

  it('WEB_11_con_mas_de_un_vinculo_no_redirige_y_remite_al_selector_de_arriba', async () => {
    await fijarSesion(persona([inscripcion('ana-perez', 'aprobado'), inscripcion('beto-gomez', 'pendiente')]));
    const { container } = montar();
    expect(screen.getByRole('heading', { level: 1, name: 'Tus profesores' })).toBeTruthy();
    expect(screen.getByText('Elegí arriba con qué profesor querés trabajar.')).toBeTruthy();
    expect(screen.queryByTestId('ubicacion')).toBeNull();
    // La lista de profesores es del selector, no de la página.
    expect(screen.queryByRole('list')).toBeNull();
    await sinViolacionesAxe(container);
  });

  it('WEB_09_el_profesor_va_a_su_panel_y_el_Administrador_que_no_es_profesor_a_admin', async () => {
    await fijarSesion(profesor());
    montar();
    expect((await screen.findByTestId('ubicacion')).textContent).toBe('/panel');
    cleanup();
    await fijarSesion(ADMINISTRADOR);
    montar();
    expect((await screen.findByTestId('ubicacion')).textContent).toBe('/admin');
  });
});
