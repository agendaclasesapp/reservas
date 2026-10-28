// @vitest-environment jsdom
// Montaje mínimo de la página de Configuración (T03.2, T14.4): WEB-08, CA-34, AGE-09, PRF-08. El profesor sale de la
// sesión (`fijarSesion(profesor())`), no de un mock de los hooks.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { profesor } from '../../estado/soporte';
import { fijarSesion, restaurarSesion } from '../../ui/sesion';
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

afterEach(() => {
  cleanup();
  restaurarSesion();
});

describe('Página de Configuración (WEB-08)', () => {
  it('WEB_08_cargando_la_configuracion_muestra_el_titulo_y_un_indicador', async () => {
    configPublica.actual = { estado: 'cargando', config: null, error: null, recargar: () => {} };
    await fijarSesion(profesor());
    const { container } = render(<Pagina />);
    expect(screen.getByRole('heading', { level: 1, name: 'Configuración' })).toBeTruthy();
    expect(screen.getByText('Cargando la configuración…')).toBeTruthy();
    await sinViolacionesAxe(container);
  });

  it('WEB_08_con_la_configuracion_lista_monta_la_seccion_mails_fallidos', async () => {
    configPublica.actual = {
      estado: 'listo',
      config: { zona_horaria: 'America/Argentina/Buenos_Aires', activo: true },
      error: null,
      recargar: () => {},
    };
    await fijarSesion(profesor());
    const { container } = render(<Pagina />);
    expect(screen.getByRole('heading', { level: 2, name: 'Mails fallidos' })).toBeTruthy();
    expect(screen.getByText('No hay mails fallidos')).toBeTruthy();
    await sinViolacionesAxe(container);
  });

  it('WEB_08_si_falla_la_configuracion_ofrece_reintentar', async () => {
    await fijarSesion(profesor());
    const recargar = vi.fn();
    configPublica.actual = { estado: 'error', config: null, error: { mensaje: 'Sin conexión.' }, recargar };
    await fijarSesion(profesor());
    const { container } = render(<Pagina />);
    expect(screen.getByRole('alert').textContent).toContain('No se pudo cargar la configuración. Sin conexión.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
    await sinViolacionesAxe(container);
  });

  it('WEB_08_AGE_09_muestra_el_enlace_propio_del_profesor_de_la_sesion_con_Copiar_enlace', async () => {
    await fijarSesion(profesor('ana-perez'));
    configPublica.actual = {
      estado: 'listo',
      config: { zona_horaria: 'America/Argentina/Buenos_Aires', activo: true },
      error: null,
      recargar: () => {},
    };
    const { container } = render(<Pagina />);
    expect(screen.getByRole('heading', { level: 2, name: 'Tu enlace' })).toBeTruthy();
    const campo = screen.getByLabelText('Enlace de tu agenda') as HTMLInputElement;
    expect(campo.value).toMatch(/#\/p\/ana-perez$/);
    expect(campo.readOnly).toBe(true);
    expect(screen.getByRole('button', { name: 'Copiar enlace' })).toBeTruthy();
    await sinViolacionesAxe(container);
  });

  it('PRF_08_con_la_agenda_inactiva_la_pagina_sigue_con_el_enlace_y_su_aviso', async () => {
    await fijarSesion(profesor('ana-perez', false));
    configPublica.actual = {
      estado: 'listo',
      config: { zona_horaria: 'America/Argentina/Buenos_Aires', activo: true },
      error: null,
      recargar: () => {},
    };
    render(<Pagina />);
    expect(screen.getByText(/Tu agenda está inactiva/)).toBeTruthy();
  });
});
