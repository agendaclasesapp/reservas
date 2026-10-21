// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Alerta, type TipoAlerta } from '../../../src/ui/Alerta';
import { AnuncioVivo } from '../../../src/ui/AnuncioVivo';
import { Insignia, type TipoInsignia } from '../../../src/ui/Insignia';
import { SinPermisos } from '../../../src/ui/SinPermisos';
import { sinViolacionesAxe } from './soporte';

afterEach(cleanup);

describe('Alerta (C-06, A11Y-01, A11Y-24)', () => {
  it('el error usa role=alert con ícono nombrado, título, texto y acción', () => {
    render(
      <Alerta tipo="error" titulo="No se pudo enviar" accion={<a href="#/ingreso">Ingresar de nuevo</a>}>
        Se cortó la conexión. Probá de nuevo.
      </Alerta>,
    );
    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toContain('No se pudo enviar');
    expect(alerta.textContent).toContain('Se cortó la conexión. Probá de nuevo.');
    expect(screen.getByRole('img', { name: 'Error' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ingresar de nuevo' })).toBeTruthy();
  });

  it.each<[Exclude<TipoAlerta, 'error'>, string]>([
    ['aviso', 'Aviso'],
    ['info', 'Información'],
    ['exito', 'Éxito'],
  ])('%s usa role=status (no interrumpe) y su ícono se llama "%s"', (tipo, nombre) => {
    render(<Alerta tipo={tipo}>Texto</Alerta>);
    expect(screen.getByRole('status').textContent).toContain('Texto');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('img', { name: nombre })).toBeTruthy();
  });

  it('sin título ni acción solo muestra el texto', () => {
    render(<Alerta tipo="info">Solo texto</Alerta>);
    expect(screen.getByRole('status').querySelectorAll('p').length).toBe(0);
  });

  it('sin violaciones de axe en los cuatro tipos', async () => {
    const { container } = render(
      <>
        <Alerta tipo="error" titulo="Error">Algo falló</Alerta>
        <Alerta tipo="aviso">Aviso</Alerta>
        <Alerta tipo="info">Info</Alerta>
        <Alerta tipo="exito" accion={<button type="button">Ver</button>}>Listo</Alerta>
      </>,
    );
    await sinViolacionesAxe(container);
  });
});

describe('Insignia (C-07, NFR-05, CA-37)', () => {
  const TIPOS: ReadonlyArray<[TipoInsignia, string]> = [
    ['pendiente', 'Pendiente'],
    ['confirmada', 'Confirmada'],
    ['rechazada', 'Rechazada'],
    ['cancelada', 'Cancelada'],
    ['pendienteSinRespuesta', 'Pendiente sin respuesta'],
    ['aprobada', 'Aprobada'],
    ['sinCuenta', 'Sin cuenta'],
  ];

  it.each(TIPOS)('%s se muestra con el texto "%s" (no solo color) y un ícono decorativo', (tipo, texto) => {
    const { container } = render(<Insignia tipo={tipo} />);
    expect(screen.getByText(texto)).toBeTruthy();
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('acepta un texto alternativo visible', () => {
    render(<Insignia tipo="pendiente" texto="Esperando al profesor" />);
    expect(screen.getByText('Esperando al profesor')).toBeTruthy();
  });

  it('sin violaciones de axe en todos los tipos', async () => {
    const { container } = render(
      <ul>
        {TIPOS.map(([tipo]) => (
          <li key={tipo}>
            <Insignia tipo={tipo} />
          </li>
        ))}
      </ul>,
    );
    await sinViolacionesAxe(container);
  });
});

describe('AnuncioVivo (C-15, A11Y-24)', () => {
  it('es una región polite siempre presente que anuncia el mensaje', () => {
    const { rerender } = render(<AnuncioVivo mensaje="" />);
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('aria-atomic')).toBe('true');
    expect(region.textContent).toBe('');
    rerender(<AnuncioVivo mensaje="Solicitud enviada" />);
    expect(screen.getByRole('status')).toBe(region);
    expect(region.textContent).toBe('Solicitud enviada');
  });

  it('sin violaciones de axe', async () => {
    const { container } = render(<AnuncioVivo mensaje="3 clases encontradas" />);
    await sinViolacionesAxe(container);
  });
});

describe('SinPermisos (C-11, flujos.md §1)', () => {
  it('muestra el encabezado, el motivo y el enlace de salida', () => {
    render(
      <SinPermisos
        motivo="Tu cuenta está pendiente de aprobación. Cuando el profesor la apruebe vas a poder reservar."
        destino={{ texto: 'Ir a mi ficha', href: '#/ficha' }}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Sin permisos' })).toBeTruthy();
    expect(screen.getByText(/pendiente de aprobación/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir a mi ficha' }).getAttribute('href')).toBe('#/ficha');
  });

  it('sin destino no hay enlace; con nivel 2 el encabezado es h2', () => {
    render(<SinPermisos motivo="Solo para el profesor." nivel={2} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Sin permisos' })).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('sin violaciones de axe', async () => {
    const { container } = render(
      <SinPermisos motivo="Motivo" destino={{ texto: 'Volver a la agenda', href: '#/' }} />,
    );
    await sinViolacionesAxe(container);
  });
});
