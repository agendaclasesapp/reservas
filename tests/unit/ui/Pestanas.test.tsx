// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Pestanas } from '../../../src/ui/Pestanas';
import { sinViolacionesAxe } from './soporte';

afterEach(cleanup);

const PESTANAS = [
  { id: 'proximas', etiqueta: 'Próximas' },
  { id: 'pasadas', etiqueta: 'Pasadas' },
  { id: 'canceladas', etiqueta: 'Canceladas' },
];

function Controlada({ inicial = 'proximas' }: { inicial?: string }) {
  const [activa, setActiva] = useState(inicial);
  return (
    <Pestanas pestanas={PESTANAS} activa={activa} onCambio={setActiva} etiqueta="Mis clases">
      <p>Contenido de {activa}</p>
    </Pestanas>
  );
}

describe('Pestanas (C-12, A11Y-02, A11Y-18)', () => {
  it('expone tablist con nombre, una pestaña seleccionada y su panel enlazado', () => {
    render(<Controlada />);
    expect(screen.getByRole('tablist', { name: 'Mis clases' })).toBeTruthy();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Próximas', 'Pasadas', 'Canceladas']);
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    const panel = screen.getByRole('tabpanel', { name: 'Próximas' });
    expect(panel.textContent).toBe('Contenido de proximas');
    expect(tabs[0]?.getAttribute('aria-controls')).toBe(panel.id);
  });

  it('el clic cambia la activa y el panel', async () => {
    render(<Controlada />);
    await userEvent.click(screen.getByRole('tab', { name: 'Pasadas' }));
    expect(screen.getByRole('tab', { name: 'Pasadas' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel', { name: 'Pasadas' }).textContent).toBe('Contenido de pasadas');
  });

  it('Tab entra a la pestaña activa y las flechas, Inicio y Fin cambian de pestaña', async () => {
    render(<Controlada />);
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Próximas' }));
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Pasadas' }));
    expect(screen.getByRole('tab', { name: 'Pasadas' }).getAttribute('aria-selected')).toBe('true');
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Canceladas' }).getAttribute('aria-selected')).toBe('true');
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Próximas' }).getAttribute('aria-selected')).toBe('true');
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Canceladas' }).getAttribute('aria-selected')).toBe('true');
    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Próximas' }).getAttribute('aria-selected')).toBe('true');
  });

  it('solo la pestaña activa está en el orden de tab', () => {
    render(<Controlada inicial="pasadas" />);
    const indices = screen.getAllByRole('tab').map((t) => t.getAttribute('tabindex'));
    expect(indices).toEqual(['-1', '0', '-1']);
  });

  it('sin violaciones de axe', async () => {
    const { container } = render(<Controlada />);
    await sinViolacionesAxe(container);
  });
});
