// @vitest-environment jsdom
// Selector de profesor (WEB-11, DEC-25, DEC-28, SEC-16): aparece solo con más de un vínculo, con el estado de
// cada uno; elegir uno abre su agenda y lo recuerda en la pestaña.
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { CLAVE_PROFESOR_ELEGIDO } from '../../../../src/estado/profesor';
import Selector from '../../../../src/modulos/inicio/vistas/Selector';
import { inscripcion, persona, profesor } from '../../estado/soporte';
import { sinViolacionesAxe } from '../../ui/soporte';
import { fijarSesion, restaurarSesion } from '../../ui/sesion';

afterEach(() => {
  cleanup();
  restaurarSesion();
});

function Ubicacion() {
  return <p data-testid="ubicacion">{useLocation().pathname}</p>;
}

function montar(ruta = '/mis-clases') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Selector />
      <Ubicacion />
    </MemoryRouter>,
  );
}

const ANA = inscripcion('ana-perez', 'aprobado', { profesor_nombre: 'Ana Pérez' });
const BETO = inscripcion('beto-gomez', 'pendiente', { profesor_nombre: 'Beto Gómez' });

describe('Selector de profesor (WEB-11)', () => {
  it('WEB_11_con_mas_de_un_vinculo_lista_a_cada_profesor_con_el_estado_de_su_vinculo', async () => {
    const carla = inscripcion('carla-diaz', 'rechazado', { profesor_nombre: 'Carla Díaz', motivo_rechazo: 'Sin lugar' });
    await fijarSesion(persona([ANA, BETO, carla]));
    const { container } = montar();
    const nav = screen.getByRole('navigation', { name: 'Tus profesores' });
    const enlaces = within(nav).getAllByRole('link');
    expect(enlaces.map((a) => a.textContent)).toEqual(['Ana PérezAprobada', 'Beto GómezPendiente', 'Carla DíazRechazada']);
    expect(enlaces.map((a) => a.getAttribute('href'))).toEqual(['#/p/ana-perez', '#/p/beto-gomez', '#/p/carla-diaz']);
    // El estado se dice con texto además del ícono y del color (NFR-05).
    expect(within(nav).getAllByRole('listitem')).toHaveLength(3);
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(3);
    // El motivo del rechazo no va en el selector: es de la ficha.
    expect(container.textContent).not.toContain('Sin lugar');
    await sinViolacionesAxe(container);
  });

  it('WEB_11_con_un_solo_vinculo_no_aparece', async () => {
    await fijarSesion(persona([ANA]));
    const { container } = montar();
    expect(container.querySelector('nav')).toBeNull();
  });

  it.each([
    ['visitante', null],
    ['profesor', profesor()],
    ['persona con la ficha incompleta', persona([], 'ficha_incompleta')],
  ])('WEB_11_%s_no_ve_el_selector', async (_nombre, sesion) => {
    await fijarSesion(sesion);
    const { container } = montar();
    expect(container.querySelector('nav')).toBeNull();
  });

  it('WEB_11_marca_con_aria_current_al_profesor_de_la_agenda_abierta', async () => {
    await fijarSesion(persona([ANA, BETO]));
    montar('/p/beto-gomez');
    expect(screen.getByRole('link', { name: /^Beto Gómez/ }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: /^Ana Pérez/ }).hasAttribute('aria-current')).toBe(false);
  });

  it('WEB_11_fuera_de_una_agenda_marca_al_profesor_elegido_en_la_pestana', async () => {
    const memoria = await fijarSesion(persona([ANA, BETO]));
    memoria.datos.set(CLAVE_PROFESOR_ELEGIDO, 'ana-perez');
    montar('/mis-clases');
    expect(screen.getByRole('link', { name: /^Ana Pérez/ }).getAttribute('aria-current')).toBe('page');
  });

  it('AGE_11_el_profesor_inactivo_dice_que_no_toma_reservas', async () => {
    const inactivo = inscripcion('beto-gomez', 'aprobado', { profesor_nombre: 'Beto Gómez', profesor_activo: false });
    await fijarSesion(persona([ANA, inactivo]));
    montar();
    expect(screen.getByRole('link', { name: /^Beto Gómez/ }).textContent).toContain('No toma reservas');
    expect(screen.getByRole('link', { name: /^Ana Pérez/ }).textContent).not.toContain('No toma reservas');
  });

  it('WEB_11_elegir_un_profesor_abre_su_agenda_y_lo_guarda_como_elegido', async () => {
    const memoria = await fijarSesion(persona([ANA, BETO]));
    montar('/mis-clases');
    await userEvent.click(screen.getByRole('link', { name: /^Beto Gómez/ }));
    expect(screen.getByTestId('ubicacion').textContent).toBe('/p/beto-gomez');
    expect(memoria.datos.get(CLAVE_PROFESOR_ELEGIDO)).toBe('beto-gomez');
  });

  it('WEB_11_se_opera_solo_con_teclado', async () => {
    await fijarSesion(persona([ANA, BETO]));
    montar('/mis-clases');
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('link', { name: /^Ana Pérez/ }));
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('link', { name: /^Beto Gómez/ }));
    await userEvent.keyboard('{Enter}');
    expect(screen.getByTestId('ubicacion').textContent).toBe('/p/beto-gomez');
  });

  it('WEB_11_un_clic_con_Ctrl_queda_para_el_navegador_y_no_cambia_de_profesor', async () => {
    const memoria = await fijarSesion(persona([ANA, BETO]));
    montar('/mis-clases');
    const usuario = userEvent.setup();
    await usuario.keyboard('{Control>}');
    await usuario.click(screen.getByRole('link', { name: /^Beto Gómez/ }));
    await usuario.keyboard('{/Control}');
    expect(screen.getByTestId('ubicacion').textContent).toBe('/mis-clases');
    expect(memoria.datos.has(CLAVE_PROFESOR_ELEGIDO)).toBe(false);
  });

  it('SEC_16_el_nombre_del_profesor_se_muestra_como_texto_nunca_como_HTML', async () => {
    const nombre = '<img src=x onerror="alert(1)"><b>Beto</b>';
    await fijarSesion(persona([ANA, inscripcion('beto-gomez', 'aprobado', { profesor_nombre: nombre })]));
    const { container } = montar();
    expect(screen.getByText(nombre)).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });
});
