// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Boton } from '../../../src/ui/Boton';
import { Dialogo } from '../../../src/ui/Dialogo';
import { sinViolacionesAxe } from './soporte';

afterEach(cleanup);

function Ejemplo({ onCerrar = () => {} }: { onCerrar?: () => void }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Boton onClick={() => setAbierto(true)}>Borrar alumno</Boton>
      <Dialogo
        abierto={abierto}
        titulo="¿Borrar a Ana Pérez?"
        onCerrar={() => {
          setAbierto(false);
          onCerrar();
        }}
        acciones={<Boton variante="peligro">Borrar alumno definitivamente</Boton>}
      >
        <p>Se borran sus datos y sus clases. No se puede deshacer.</p>
      </Dialogo>
    </>
  );
}

describe('Dialogo (A11Y-13, A11Y-22, A11Y-23)', () => {
  it('cerrado no se muestra', () => {
    render(<Ejemplo />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('abierto: rol dialog con nombre por su título y foco dentro', async () => {
    render(<Ejemplo />);
    await userEvent.click(screen.getByRole('button', { name: 'Borrar alumno' }));
    const dialogo = await screen.findByRole('dialog', { name: '¿Borrar a Ana Pérez?' });
    expect(dialogo.contains(document.activeElement)).toBe(true);
    expect(screen.getByRole('heading', { name: '¿Borrar a Ana Pérez?' })).toBeTruthy();
  });

  it('Esc cierra y devuelve el foco al disparador', async () => {
    const onCerrar = vi.fn();
    render(<Ejemplo onCerrar={onCerrar} />);
    const disparador = screen.getByRole('button', { name: 'Borrar alumno' });
    await userEvent.click(disparador);
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onCerrar).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(document.activeElement).toBe(disparador));
  });

  it('el botón Cerrar cierra y Tab no sale del diálogo (trampa de foco)', async () => {
    render(<Ejemplo />);
    await userEvent.click(screen.getByRole('button', { name: 'Borrar alumno' }));
    const dialogo = await screen.findByRole('dialog');
    for (let i = 0; i < 6; i += 1) {
      await userEvent.tab();
      expect(dialogo.contains(document.activeElement)).toBe(true);
    }
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('sin violaciones de axe con el diálogo abierto', async () => {
    render(<Ejemplo />);
    await userEvent.click(screen.getByRole('button', { name: 'Borrar alumno' }));
    await screen.findByRole('dialog');
    await sinViolacionesAxe(document.body);
  });
});
