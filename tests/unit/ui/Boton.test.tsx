// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Boton } from '../../../src/ui/Boton';
import { sinViolacionesAxe } from './soporte';

afterEach(cleanup);

describe('Boton (NFR-06, NFR-05)', () => {
  it('es un botón nativo con nombre accesible y ejecuta onClick con ratón y teclado', async () => {
    const onClick = vi.fn();
    const usuario = userEvent.setup();
    render(<Boton onClick={onClick}>Confirmar</Boton>);
    const boton = screen.getByRole('button', { name: 'Confirmar' });
    expect(boton.getAttribute('type')).toBe('button');
    await usuario.click(boton);
    await usuario.tab();
    boton.focus();
    await usuario.keyboard('{Enter}');
    await usuario.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('deshabilitado no dispara onClick', async () => {
    const onClick = vi.fn();
    render(
      <Boton deshabilitado onClick={onClick}>
        Rechazar
      </Boton>,
    );
    const boton = screen.getByRole('button', { name: 'Rechazar' });
    expect(boton.hasAttribute('disabled')).toBe(true);
    await userEvent.click(boton);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('cargando cambia el texto, marca aria-busy, ignora clics y conserva el foco', async () => {
    const onClick = vi.fn();
    const usuario = userEvent.setup();
    render(
      <Boton cargando textoCargando="Enviando…" onClick={onClick}>
        Enviar solicitud
      </Boton>,
    );
    const boton = screen.getByRole('button', { name: 'Enviando…' });
    expect(boton.getAttribute('aria-busy')).toBe('true');
    boton.focus();
    await usuario.click(boton);
    expect(onClick).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(boton);
  });

  it.each(['primario', 'secundario', 'peligro'] as const)('variante %s sin violaciones de axe', async (variante) => {
    const { container } = render(<Boton variante={variante}>Borrar alumno</Boton>);
    await sinViolacionesAxe(container);
  });

  it('un botón con solo ícono exige aria-label y axe lo acepta', async () => {
    const { container } = render(<Boton aria-label="Día siguiente">›</Boton>);
    expect(screen.getByRole('button', { name: 'Día siguiente' })).toBeTruthy();
    await sinViolacionesAxe(container);
  });
});
