// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Layout } from '../../../src/ui/Layout';
import { sinViolacionesAxe } from './soporte';

afterEach(cleanup);

describe('Layout (A11Y-11, A11Y-12, A11Y-13)', () => {
  it('tiene landmarks banner, navigation y main, y un enlace "Ir al contenido" primero en el orden de tab', async () => {
    const { container } = render(
      <Layout navegacion={<nav aria-label="Principal"><a href="#/">Agenda</a></nav>} titulo="Agenda">
        <h1>Agenda</h1>
      </Layout>,
    );
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Ir al contenido' }));
    await sinViolacionesAxe(container);
  });

  it('"Ir al contenido" enfoca el main sin tocar la ruta hash', async () => {
    window.location.hash = '#/panel';
    render(
      <Layout>
        <h1>Panel</h1>
      </Layout>,
    );
    await userEvent.click(screen.getByRole('link', { name: 'Ir al contenido' }));
    expect(document.activeElement).toBe(screen.getByRole('main'));
    expect(window.location.hash).toBe('#/panel');
  });

  it('publica el título del documento por ruta', () => {
    const { rerender } = render(
      <Layout titulo="Agenda">
        <h1>Agenda</h1>
      </Layout>,
    );
    expect(document.title).toBe('Agenda · ReservaTuClase');
    rerender(
      <Layout titulo="Mis clases">
        <h1>Mis clases</h1>
      </Layout>,
    );
    expect(document.title).toBe('Mis clases · ReservaTuClase');
    rerender(<Layout>{null}</Layout>);
    expect(document.title).toBe('ReservaTuClase');
  });

  it('al cambiar de ruta mueve el foco al h1; en el primer render no lo roba', () => {
    const { rerender } = render(
      <Layout rutaActual="/">
        <h1>Agenda</h1>
      </Layout>,
    );
    expect(document.activeElement).toBe(document.body);
    rerender(
      <Layout rutaActual="/mis-clases">
        <h1>Mis clases</h1>
      </Layout>,
    );
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Mis clases' }));
  });

  it('si la página no tiene h1, el foco va al main', () => {
    const { rerender } = render(<Layout rutaActual="/">{null}</Layout>);
    rerender(<Layout rutaActual="/otra"><p>Sin título</p></Layout>);
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });
});
