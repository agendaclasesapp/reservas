// @vitest-environment jsdom
// Prueba de ruta (B06 · T06.2): en `#/p/<slug>` un alumno con el vínculo aprobado toca un hueco libre y se abre el
// formulario de solicitud que compone src/rutas.tsx (WEB-01, WEB-04, CA-46). El visitante ve la invitación.
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rutas } from '../../../../src/rutas';
import { inscripcion, persona } from '../../estado/soporte';
import { fijarSesion, restaurarSesion } from '../../ui/sesion';
import { sinViolacionesAxe } from '../../ui/soporte';

const base = vi.hoisted(() => ({ cargarSupabase: vi.fn(), rpc: vi.fn() }));
vi.mock('../../../../src/lib/supabase', () => ({ cargarSupabase: base.cargarSupabase }));

const apis = vi.hoisted(() => ({ agenda: vi.fn(), config: vi.fn() }));
vi.mock('../../../../src/modulos/agenda/logica/api', async (original) => ({
  ...(await original<object>()),
  obtenerAgendaPublica: apis.agenda,
  obtenerConfigPublica: apis.config,
}));

beforeEach(() => {
  const inicio = new Date(Date.now() + 5 * 24 * 3600 * 1000);
  inicio.setUTCMinutes(0, 0, 0);
  const fin = new Date(inicio.getTime() + 3600 * 1000);
  apis.agenda.mockResolvedValue([{ inicio: inicio.toISOString(), fin: fin.toISOString(), estado: 'libre' }]);
  apis.config.mockResolvedValue({
    profesor_id: 'id-ana-perez',
    nombre: 'Ana Pérez',
    activo: true,
    zona_horaria: 'America/Argentina/Buenos_Aires',
    duracion_min: 60,
    anticipacion_horas: 24,
    horizonte_semanas: 4,
  });
  base.cargarSupabase.mockResolvedValue({
    rpc: base.rpc,
    from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) }),
  });
});

afterEach(() => {
  cleanup();
  restaurarSesion();
  vi.clearAllMocks();
});

// La primera carga descarga la ruta y sus módulos diferidos: más lenta que una prueba de componente.
const ESPERA_RUTA = { timeout: 15000 };
const TIEMPO_PRUEBA = 25000;

function montar() {
  render(<RouterProvider router={createMemoryRouter(rutas, { initialEntries: ['/p/ana-perez'] })} />);
}

describe('Ruta de la agenda con el formulario de solicitud (WEB-01, WEB-04, CA-46)', () => {
  it('WEB_04_con_el_vinculo_aprobado_tocar_un_hueco_libre_abre_el_formulario_de_solicitud', async () => {
    await fijarSesion(persona([inscripcion('ana-perez', 'aprobado')]));
    montar();
    await userEvent.click(await screen.findByRole('button', { name: /Libre$/ }, ESPERA_RUTA));
    const dialogo = await screen.findByRole('dialog', { name: 'Pedir clase a Ana Pérez' });
    expect(await within(dialogo).findByRole('button', { name: 'Pedir clase' })).toBeTruthy();
    expect(within(dialogo).getByRole('radiogroup', { name: '¿Cómo querés pedirla?' })).toBeTruthy();
    await sinViolacionesAxe(document.body);
  }, TIEMPO_PRUEBA);

  it('CA_46_el_visitante_ve_la_invitacion_y_no_el_formulario', async () => {
    await fijarSesion(null);
    montar();
    await userEvent.click(await screen.findByRole('button', { name: /Libre$/ }, ESPERA_RUTA));
    const dialogo = await screen.findByRole('dialog', { name: 'Ingresá para pedir esta clase' });
    expect(within(dialogo).getByRole('link', { name: 'Ingresar' }).getAttribute('href')).toContain('#/ingreso?volver=');
    expect(screen.queryByRole('dialog', { name: 'Pedir clase a Ana Pérez' })).toBeNull();
    expect(base.rpc).not.toHaveBeenCalled();
  }, TIEMPO_PRUEBA);
});
