// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Campo, type CampoProps } from '../../../src/ui/Campo';
import { sinViolacionesAxe } from './soporte';

afterEach(cleanup);

function Controlado(props: Partial<CampoProps>) {
  const [valor, setValor] = useState('');
  return <Campo etiqueta="Nombre y apellido" valor={valor} onCambio={setValor} {...props} />;
}

describe('Campo (A11Y-20, A11Y-21, NFR-06)', () => {
  it('se encuentra por su etiqueta visible y propaga el valor tipeado', async () => {
    const onCambio = vi.fn();
    render(<Campo etiqueta="Teléfono" valor="" onCambio={onCambio} tipo="tel" autoComplete="tel" inputMode="tel" />);
    const campo = screen.getByRole('textbox', { name: 'Teléfono' });
    expect(campo.getAttribute('autocomplete')).toBe('tel');
    expect(campo.getAttribute('type')).toBe('tel');
    await userEvent.type(campo, '11');
    expect(onCambio).toHaveBeenCalledWith('1');
  });

  it('refleja lo tipeado cuando el padre controla el valor', async () => {
    render(<Controlado />);
    const campo = screen.getByRole('textbox', { name: 'Nombre y apellido' });
    await userEvent.type(campo, 'Ana');
    expect((campo as HTMLInputElement).value).toBe('Ana');
  });

  it('la ayuda describe al campo', () => {
    render(<Controlado ayuda="Código de 6 dígitos" />);
    const campo = screen.getByRole('textbox', { name: 'Nombre y apellido' });
    expect(campo.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(campo.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Código de 6 dígitos');
  });

  it('con error: aria-invalid, descripción asociada y mensaje anunciado con role=alert', () => {
    render(<Controlado ayuda="Como figura en tu documento" error="Falta el nombre. Escribilo para continuar." />);
    const campo = screen.getByRole('textbox', { name: 'Nombre y apellido' });
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toBe('Falta el nombre. Escribilo para continuar.');
    const ids = (campo.getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids).toContain(alerta.id);
    expect(ids).toHaveLength(2);
  });

  it('sin error no hay aria-invalid ni alerta', () => {
    render(<Controlado />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('textbox').hasAttribute('aria-invalid')).toBe(false);
  });

  it('requerido se anuncia por texto y por aria-required; deshabilitado bloquea la entrada', () => {
    render(<Controlado requerido deshabilitado />);
    const campo = screen.getByRole('textbox', { name: /Nombre y apellido/ });
    expect(campo.getAttribute('aria-required')).toBe('true');
    expect(screen.getByText('(obligatorio)')).toBeTruthy();
    expect((campo as HTMLInputElement).disabled).toBe(true);
  });

  it('sin violaciones de axe: normal, con error y con ayuda', async () => {
    const { container } = render(
      <>
        <Controlado id="a" />
        <Controlado id="b" error="Mail inválido. Revisalo." etiqueta="Mail" tipo="email" />
        <Controlado id="c" ayuda="Ayuda" etiqueta="Fecha de nacimiento" tipo="date" />
      </>,
    );
    await sinViolacionesAxe(container);
  });
});
