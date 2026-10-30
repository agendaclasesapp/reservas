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
  it('visitante: Inicio e Ingresar, sin Salir (WEB-09: el inicio no es una agenda)', () => {
    render(<Navegacion ruta="/" onSalir={() => undefined} />);
    expect(textos()).toEqual(['Inicio', 'Ingresar']);
    expect(screen.getByRole('link', { name: 'Ingresar' }).getAttribute('href')).toBe('#/ingreso');
  });

  it('alumno aprobado: Agenda, Mis clases, Mi ficha y Salir', () => {
    render(<Navegacion ruta="/" usuario={{ rol: 'alumno', estado: 'aprobado' }} onSalir={() => undefined} />);
    expect(textos()).toEqual(['Agenda', 'Mis clases', 'Mi ficha', 'Salir']);
    expect(screen.getByRole('link', { name: 'Mis clases' }).getAttribute('href')).toBe('#/mis-clases');
  });

  it.each<[NavegacionProps['usuario'], string[]]>([
    [{ rol: 'alumno', estado: 'pendiente' }, ['Agenda', 'Mi ficha']],
    [{ rol: 'alumno', estado: 'rechazado' }, ['Agenda', 'Mi ficha']],
    [{ rol: 'alumno', estado: 'ficha_incompleta' }, ['Mi ficha']],
    [{ rol: 'alumno', estado: 'sin_cuenta' }, ['Agenda']],
    [{ rol: 'alumno', estado: 'borrado' }, ['Agenda']],
    [{ rol: 'profesor' }, ['Panel', 'Lista', 'Configuración']],
    [{ rol: 'profesor', esAdministrador: true }, ['Panel', 'Lista', 'Configuración', 'Administración']],
    [{ rol: 'administrador' }, ['Administración']],
  ])('usuario %j ve %j', (usuario, esperado) => {
    render(<Navegacion ruta="/ficha" usuario={usuario} />);
    expect(textos()).toEqual(esperado);
  });

  it('marca la ruta actual con aria-current="page" y solo esa', () => {
    render(<Navegacion ruta="/mis-clases" usuario={{ rol: 'alumno', estado: 'aprobado' }} />);
    expect(screen.getByRole('link', { name: 'Mis clases' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Agenda' }).hasAttribute('aria-current')).toBe(false);
    expect(screen.getByRole('link', { name: 'Mi ficha' }).hasAttribute('aria-current')).toBe(false);
  });

  it('WEB_10_el_Administrador_ve_Administracion_que_lleva_a_admin_y_Salir', () => {
    render(<Navegacion ruta="/admin" usuario={{ rol: 'administrador' }} onSalir={() => undefined} />);
    expect(textos()).toEqual(['Administración', 'Salir']);
    const enlace = screen.getByRole('link', { name: 'Administración' });
    expect(enlace.getAttribute('href')).toBe('#/admin');
    expect(enlace.getAttribute('aria-current')).toBe('page');
  });

  it('WEB_11_Agenda_de_la_persona_apunta_a_la_ruta_de_su_profesor_y_se_marca_en_ella', () => {
    const { rerender } = render(
      <Navegacion ruta="/mis-clases" usuario={{ rol: 'alumno', estado: 'aprobado' }} rutaAgenda="/p/beto-gomez" />,
    );
    expect(screen.getByRole('link', { name: 'Agenda' }).getAttribute('href')).toBe('#/p/beto-gomez');
    expect(screen.getByRole('link', { name: 'Agenda' }).hasAttribute('aria-current')).toBe(false);
    rerender(<Navegacion ruta="/p/beto-gomez" usuario={{ rol: 'alumno', estado: 'aprobado' }} rutaAgenda="/p/beto-gomez" />);
    expect(screen.getByRole('link', { name: 'Agenda' }).getAttribute('aria-current')).toBe('page');
  });

  it('WEB_11_sin_rutaAgenda_la_Agenda_de_la_persona_lleva_al_inicio_que_decide', () => {
    render(<Navegacion ruta="/ficha" usuario={{ rol: 'alumno', estado: 'pendiente' }} />);
    expect(screen.getByRole('link', { name: 'Agenda' }).getAttribute('href')).toBe('#/');
  });

  describe('WEB-13, CA-66: quién está conectado', () => {
    it('WEB_13_muestra_el_nombre_junto_a_Salir_y_el_lector_anuncia_Conectado_como', () => {
      render(
        <Navegacion ruta="/panel" usuario={{ rol: 'profesor', nombre: 'Prof Ana Pérez' }} onSalir={() => undefined} />,
      );
      expect(textos()).toEqual(['Panel', 'Lista', 'Configuración', 'Conectado como Prof Ana Pérez', 'Salir']);
      expect(screen.getByText('Prof Ana Pérez').getAttribute('title')).toBe('Prof Ana Pérez');
      expect(screen.queryByText(/Administrador/)).toBeNull();
    });

    it('WEB_13_el_rol_aparece_solo_si_la_cuenta_tiene_mas_de_uno', () => {
      render(
        <>
          <Navegacion ruta="/panel" usuario={{ rol: 'profesor', esAdministrador: true, nombre: 'Prof Ana' }} />
          <Navegacion ruta="/admin" etiqueta="Admin" usuario={{ rol: 'administrador', nombre: 'admin@example.com' }} />
          <Navegacion ruta="/ficha" etiqueta="Alumno" usuario={{ rol: 'alumno', estado: 'aprobado', nombre: 'Beto' }} />
        </>,
      );
      expect(textos()).toContain('Conectado como Prof Ana, Profesor y Administrador');
      expect(screen.getAllByText('Profesor y Administrador')).toHaveLength(1);
      expect(screen.getByText('admin@example.com')).toBeTruthy();
      expect(screen.getByText('Beto')).toBeTruthy();
    });

    it('WEB_13_sin_sesion_o_sin_nombre_no_aparece', () => {
      render(
        <>
          <Navegacion ruta="/" />
          <Navegacion ruta="/panel" etiqueta="Profesor" usuario={{ rol: 'profesor' }} />
        </>,
      );
      expect(screen.queryByText(/Conectado como/)).toBeNull();
    });

    it('WEB_13_sin_violaciones_de_axe_con_el_menu_abierto_y_cerrado', async () => {
      const { container } = render(
        <Navegacion
          ruta="/panel"
          usuario={{ rol: 'profesor', esAdministrador: true, nombre: 'Prof Ana Pérez' }}
          onSalir={() => undefined}
        />,
      );
      await sinViolacionesAxe(container);
      await userEvent.click(screen.getByRole('button', { name: 'Menú' }));
      await sinViolacionesAxe(container);
    });
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
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Inicio' }));
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
        navegacion={<Navegacion ruta="/mis-clases" usuario={{ rol: 'alumno', estado: 'aprobado' }} onSalir={() => undefined} />}
      >
        <h1>Mis clases</h1>
      </Layout>,
    );
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(within(screen.getByRole('banner')).getByRole('navigation', { name: 'Principal' })).toBe(nav);
    await sinViolacionesAxe(container);
  });

  it('sin violaciones de axe: visitante, alumno, profesor y Administrador, con el menú abierto y cerrado', async () => {
    const { container } = render(
      <>
        <Navegacion ruta="/" etiqueta="Visitante" />
        <Navegacion ruta="/ficha" etiqueta="Alumno" usuario={{ rol: 'alumno', estado: 'aprobado' }} onSalir={() => undefined} />
        <Navegacion ruta="/panel" etiqueta="Profesor" usuario={{ rol: 'profesor' }} onSalir={() => undefined} />
        <Navegacion ruta="/admin" etiqueta="Administrador" usuario={{ rol: 'administrador' }} onSalir={() => undefined} />
      </>,
    );
    await sinViolacionesAxe(container);
    for (const boton of screen.getAllByRole('button', { name: 'Menú' })) await userEvent.click(boton);
    await sinViolacionesAxe(container);
  });
});
