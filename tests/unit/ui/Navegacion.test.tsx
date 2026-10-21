// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Layout } from '../../../src/ui/Layout';
import { Navegacion, type NavegacionProps } from '../../../src/ui/Navegacion';
import { sinViolacionesAxe } from './soporte';

afterEach(cleanup);

function textos(): string[] {
  return within(screen.getByRole('navigation', { name: 'Principal' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent ?? '');
}

describe('Navegacion (C-13, NFR-05, NFR-06)', () => {
  it('visitante: Agenda e Ingresar, sin Salir', () => {
    render(<Navegacion ruta="/" onSalir={() => undefined} />);
    expect(textos()).toEqual(['Agenda', 'Ingresar']);
    expect(screen.getByRole('link', { name: 'Ingresar' }).getAttribute('href')).toBe('#/ingreso');
  });

  it('alumno aprobado: Agenda, Mis clases, Mi ficha y Salir', () => {
    render(<Navegacion ruta="/" usuario={{ rol: 'alumno', estado: 'aprobada' }} onSalir={() => undefined} />);
    expect(textos()).toEqual(['Agenda', 'Mis clases', 'Mi ficha', 'Salir']);
    expect(screen.getByRole('link', { name: 'Mis clases' }).getAttribute('href')).toBe('#/mis-clases');
  });

  it.each<[NavegacionProps['usuario'], string[]]>([
    [{ rol: 'alumno', estado: 'pendiente' }, ['Agenda', 'Mi ficha']],
    [{ rol: 'alumno', estado: 'rechazada' }, ['Agenda', 'Mi ficha']],
    [{ rol: 'alumno', estado: 'sinCuenta' }, ['Mi ficha']],
    [{ rol: 'profesor' }, ['Panel', 'Lista', 'Configuración']],
  ])('usuario %j ve %j', (usuario, esperado) => {
    render(<Navegacion ruta="/ficha" usuario={usuario} />);
    expect(textos()).toEqual(esperado);
  });

  it('marca la ruta actual con aria-current="page" y solo esa', () => {
    render(<Navegacion ruta="/mis-clases" usuario={{ rol: 'alumno', estado: 'aprobada' }} />);
    expect(screen.getByRole('link', { name: 'Mis clases' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Agenda' }).hasAttribute('aria-current')).toBe(false);
    expect(screen.getByRole('link', { name: 'Mi ficha' }).hasAttribute('aria-current')).toBe(false);
  });

  it('"Salir" llama a onSalir', async () => {
    const onSalir = vi.fn();
    render(<Navegacion ruta="/" usuario={{ rol: 'profesor' }} onSalir={onSalir} />);
    await userEvent.click(screen.getByRole('button', { name: 'Salir' }));
    expect(onSalir).toHaveBeenCalledOnce();
  });

  it('el botón "Menú" alterna aria-expanded y controla la lista', async () => {
    render(<Navegacion ruta="/" />);
    const menu = screen.getByRole('button', { name: 'Menú' });
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById(menu.getAttribute('aria-controls') ?? '')?.tagName).toBe('UL');
    await userEvent.click(menu);
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    await userEvent.click(menu);
    expect(menu.getAttribute('aria-expanded')).toBe('false');
  });

  it('Esc cierra el menú y devuelve el foco al botón', async () => {
    render(<Navegacion ruta="/" />);
    const menu = screen.getByRole('button', { name: 'Menú' });
    await userEvent.click(menu);
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Agenda' }));
    await userEvent.keyboard('{Escape}');
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(menu);
  });

  it('al cambiar de ruta el menú se cierra', async () => {
    const { rerender } = render(<Navegacion ruta="/" />);
    const menu = screen.getByRole('button', { name: 'Menú' });
    await userEvent.click(menu);
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    rerender(<Navegacion ruta="/ingreso" />);
    expect(menu.getAttribute('aria-expanded')).toBe('false');
  });

  it('se monta en Layout por la prop navegacion: un solo landmark nav dentro del banner', async () => {
    const { container } = render(
      <Layout
        rutaActual="/mis-clases"
        titulo="Mis clases"
        navegacion={<Navegacion ruta="/mis-clases" usuario={{ rol: 'alumno', estado: 'aprobada' }} onSalir={() => undefined} />}
      >
        <h1>Mis clases</h1>
      </Layout>,
    );
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(within(screen.getByRole('banner')).getByRole('navigation', { name: 'Principal' })).toBe(nav);
    await sinViolacionesAxe(container);
  });

  it('sin violaciones de axe: visitante, alumno y profesor, con el menú abierto y cerrado', async () => {
    const { container } = render(
      <>
        <Navegacion ruta="/" etiqueta="Visitante" />
        <Navegacion ruta="/ficha" etiqueta="Alumno" usuario={{ rol: 'alumno', estado: 'aprobada' }} onSalir={() => undefined} />
        <Navegacion ruta="/panel" etiqueta="Profesor" usuario={{ rol: 'profesor' }} onSalir={() => undefined} />
      </>,
    );
    await sinViolacionesAxe(container);
    for (const boton of screen.getAllByRole('button', { name: 'Menú' })) await userEvent.click(boton);
    await sinViolacionesAxe(container);
  });
});
