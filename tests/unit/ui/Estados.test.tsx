// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Boton } from '../../../src/ui/Boton';
import { Cargando } from '../../../src/ui/Cargando';
import { ErrorCarga } from '../../../src/ui/ErrorCarga';
import { IconoEstado, TEXTO_ESTADO, type TipoEstado } from '../../../src/ui/IconoEstado';
import { Vacio } from '../../../src/ui/Vacio';
import { sinViolacionesAxe } from './soporte';

afterEach(cleanup);

describe('Cargando (A11Y-24, A11Y-25)', () => {
  it('anuncia "Cargando…" con role=status y aria-busy', () => {
    render(<Cargando />);
    const estado = screen.getByRole('status');
    expect(estado.textContent).toBe('Cargando…');
    expect(estado.getAttribute('aria-busy')).toBe('true');
  });

  it('acepta una etiqueta propia y esqueleto oculto a lectores', async () => {
    const { container } = render(<Cargando etiqueta="Cargando la agenda…" renglones={6} />);
    expect(screen.getByRole('status').textContent).toBe('Cargando la agenda…');
    expect(container.querySelectorAll('li')).toHaveLength(6);
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    await sinViolacionesAxe(container);
  });
});

describe('ErrorCarga (A11Y-24)', () => {
  it('muestra el mensaje con role=alert y reintenta con teclado', async () => {
    const onReintentar = vi.fn();
    const { container } = render(<ErrorCarga mensaje="No se pudo cargar la agenda. Reintentá." onReintentar={onReintentar} />);
    const alerta = screen.getByRole('alert');
    expect(within(alerta).getByText('No se pudo cargar la agenda. Reintentá.')).toBeTruthy();
    const boton = within(alerta).getByRole('button', { name: 'Reintentar' });
    boton.focus();
    await userEvent.keyboard('{Enter}');
    expect(onReintentar).toHaveBeenCalledTimes(1);
    await sinViolacionesAxe(container);
  });
});

describe('Vacio', () => {
  it('muestra encabezado, texto y acción', async () => {
    const { container } = render(
      <Vacio titulo="No hay huecos este día" texto="Probá con otro día." accion={<Boton>Ver otro día</Boton>} />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'No hay huecos este día' })).toBeTruthy();
    expect(screen.getByText('Probá con otro día.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ver otro día' })).toBeTruthy();
    await sinViolacionesAxe(container);
  });

  it('respeta el nivel de encabezado y funciona sin texto ni acción', () => {
    render(<Vacio titulo="Todavía no tenés clases próximas" nivel={3} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Todavía no tenés clases próximas' })).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('IconoEstado (NFR-05, CA-37)', () => {
  const estados = Object.keys(TEXTO_ESTADO) as TipoEstado[];

  it.each(estados)('%s comunica el estado con texto visible y un ícono decorativo', (estado) => {
    const { container } = render(<IconoEstado estado={estado} />);
    expect(screen.getByText(TEXTO_ESTADO[estado])).toBeTruthy();
    const icono = container.querySelector('svg');
    expect(icono?.getAttribute('aria-hidden')).toBe('true');
  });

  it('usa los textos de la spec para los huecos', () => {
    expect(TEXTO_ESTADO.libre).toBe('Libre');
    expect(TEXTO_ESTADO.ocupado).toBe('Ocupado');
    expect(TEXTO_ESTADO.bloqueado).toBe('Bloqueado');
    expect(TEXTO_ESTADO.pendienteSinRespuesta).toBe('Pendiente sin respuesta');
  });

  it('cada estado de hueco tiene un ícono distinto (no solo color)', () => {
    const dibujos = (['libre', 'ocupado', 'bloqueado'] as const).map((estado) => {
      const { container, unmount } = render(<IconoEstado estado={estado} />);
      const html = container.querySelector('svg')?.innerHTML ?? '';
      unmount();
      return html;
    });
    expect(new Set(dibujos).size).toBe(3);
  });

  it('sin violaciones de axe con todos los estados', async () => {
    const { container } = render(
      <ul>
        {estados.map((estado) => (
          <li key={estado}>
            <IconoEstado estado={estado} />
          </li>
        ))}
      </ul>,
    );
    await sinViolacionesAxe(container);
  });
});
