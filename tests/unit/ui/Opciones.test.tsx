// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampoFecha, type CampoFechaProps } from '../../../src/ui/CampoFecha';
import { GrupoOpciones, type GrupoOpcionesProps } from '../../../src/ui/GrupoOpciones';
import { sinViolacionesAxe } from './soporte';

afterEach(cleanup);

const OPCIONES = [
  { valor: 'suelta', etiqueta: 'Clase suelta' },
  { valor: 'semanal', etiqueta: 'Todas las semanas', ayuda: 'Se repite el mismo día y hora' },
  { valor: 'quincenal', etiqueta: 'Cada dos semanas' },
];

function Grupo(props: Partial<GrupoOpcionesProps>) {
  const [valor, setValor] = useState('');
  return <GrupoOpciones legend="Tipo de clase" opciones={OPCIONES} valor={valor} onCambio={setValor} {...props} />;
}

function Fecha(props: Partial<CampoFechaProps>) {
  const [valor, setValor] = useState('');
  return <CampoFecha etiqueta="Fecha de nacimiento" valor={valor} onCambio={setValor} {...props} />;
}

describe('GrupoOpciones (C-04, A11Y-02, A11Y-20)', () => {
  it('es un grupo con la leyenda como nombre y un radio por opción, por su etiqueta', () => {
    render(<Grupo />);
    expect(screen.getByRole('radiogroup', { name: 'Tipo de clase' })).toBeTruthy();
    expect(screen.getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual(['suelta', 'semanal', 'quincenal']);
    expect((screen.getByRole('radio', { name: 'Clase suelta' }) as HTMLInputElement).checked).toBe(false);
  });

  it('elegir una opción llama a onCambio con su valor y la deja marcada', async () => {
    const onCambio = vi.fn();
    render(<GrupoOpciones legend="Tipo de clase" opciones={OPCIONES} valor="" onCambio={onCambio} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Todas las semanas' }));
    expect(onCambio).toHaveBeenCalledWith('semanal');
    cleanup();
    render(<Grupo />);
    await userEvent.click(screen.getByRole('radio', { name: 'Cada dos semanas' }));
    expect((screen.getByRole('radio', { name: 'Cada dos semanas' }) as HTMLInputElement).checked).toBe(true);
  });

  it('las flechas mueven la elección entre opciones (el grupo es una sola parada de tab)', async () => {
    render(<Grupo />);
    await userEvent.click(screen.getByRole('radio', { name: 'Clase suelta' }));
    await userEvent.keyboard('{ArrowDown}');
    expect((screen.getByRole('radio', { name: 'Todas las semanas' }) as HTMLInputElement).checked).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Todas las semanas' }));
    await userEvent.keyboard('{ArrowUp}');
    expect((screen.getByRole('radio', { name: 'Clase suelta' }) as HTMLInputElement).checked).toBe(true);
  });

  it('la ayuda de una opción la describe', () => {
    render(<Grupo />);
    const radio = screen.getByRole('radio', { name: 'Todas las semanas' });
    expect(document.getElementById(radio.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Se repite el mismo día y hora');
    expect(screen.getByRole('radio', { name: 'Clase suelta' }).hasAttribute('aria-describedby')).toBe(false);
  });

  it('con error: aria-invalid, descripción asociada y mensaje con role=alert', () => {
    render(<Grupo error="Elegí un tipo de clase para continuar." requerido />);
    const grupo = screen.getByRole('radiogroup', { name: /Tipo de clase/ });
    expect(grupo.getAttribute('aria-invalid')).toBe('true');
    expect(grupo.getAttribute('aria-required')).toBe('true');
    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toBe('Elegí un tipo de clase para continuar.');
    expect(grupo.getAttribute('aria-describedby')).toBe(alerta.id);
    expect(screen.getByText('(obligatorio)')).toBeTruthy();
  });

  it('sin error no hay alerta ni aria-invalid; deshabilitado bloquea los radios', () => {
    render(<Grupo deshabilitado />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('radiogroup').hasAttribute('aria-invalid')).toBe(false);
    // El `fieldset disabled` deshabilita a sus radios (se comprueba con la pseudo-clase, no con la propiedad).
    expect(screen.getByRole('radio', { name: 'Clase suelta' }).matches(':disabled')).toBe(true);
  });

  it('sin violaciones de axe: normal, con error y deshabilitado', async () => {
    const { container } = render(
      <>
        <Grupo />
        <Grupo legend="Quién toma la clase" error="Elegí una persona." requerido />
        <Grupo legend="Frecuencia" deshabilitado />
      </>,
    );
    await sinViolacionesAxe(container);
  });
});

describe('CampoFecha (C-03, A11Y-20)', () => {
  it('es un campo de fecha nativo con su etiqueta, min y max, y propaga AAAA-MM-DD', () => {
    const onCambio = vi.fn();
    const { container } = render(
      <CampoFecha etiqueta="Desde" valor="" onCambio={onCambio} min="2026-01-01" max="2026-12-31" />,
    );
    const campo = container.querySelector('input');
    expect(campo?.getAttribute('type')).toBe('date');
    expect(campo?.getAttribute('min')).toBe('2026-01-01');
    expect(campo?.getAttribute('max')).toBe('2026-12-31');
    expect(screen.getByLabelText('Desde')).toBe(campo);
    if (campo) fireEvent.change(campo, { target: { value: '2026-03-05' } });
    expect(onCambio).toHaveBeenCalledWith('2026-03-05');
  });

  it('refleja el valor controlado', () => {
    const { container } = render(<Fecha />);
    const campo = container.querySelector('input');
    if (campo) fireEvent.change(campo, { target: { value: '2012-07-30' } });
    expect(campo?.value).toBe('2012-07-30');
  });

  it('con error y ayuda: aria-invalid, descripciones asociadas y role=alert', () => {
    const { container } = render(<Fecha ayuda="Día, mes y año" error="La fecha no es válida. Revisala." requerido />);
    const campo = container.querySelector('input');
    expect(campo?.getAttribute('aria-invalid')).toBe('true');
    expect(campo?.getAttribute('aria-required')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('La fecha no es válida. Revisala.');
    expect((campo?.getAttribute('aria-describedby') ?? '').split(' ')).toHaveLength(2);
  });

  it('sin violaciones de axe: normal, con error y deshabilitado', async () => {
    const { container } = render(
      <>
        <Fecha id="a" />
        <Fecha id="b" etiqueta="Hasta" error="Hasta no puede ser anterior a Desde." />
        <Fecha id="c" etiqueta="Nacimiento" deshabilitado />
      </>,
    );
    await sinViolacionesAxe(container);
  });
});
