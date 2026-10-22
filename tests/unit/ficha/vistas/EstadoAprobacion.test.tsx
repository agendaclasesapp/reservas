// @vitest-environment jsdom
// Estado de aprobación y motivo de rechazo (WEB-03, ALU-03, SEC-16, CA-45).
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EstadoAprobacion } from '../../../../src/modulos/ficha/vistas/EstadoAprobacion';
import { sinViolacionesAxe } from '../../ui/soporte';

afterEach(cleanup);

describe('EstadoAprobacion (WEB-03)', () => {
  it.each([
    ['pendiente', 'Pendiente de aprobación'],
    ['aprobado', 'Aprobada'],
    ['rechazado', 'Rechazada'],
  ] as const)('ALU_03_el_estado_%s_se_dice_con_texto', async (estado, texto) => {
    const { container } = render(<EstadoAprobacion estado={estado} motivo={null} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Estado de tu cuenta' })).toBeTruthy();
    expect(screen.getByText(texto)).toBeTruthy();
    expect(screen.queryByText('Motivo:')).toBeNull();
    await sinViolacionesAxe(container);
  });

  it('CA_45_una_cuenta_rechazada_con_motivo_lo_muestra', async () => {
    const { container } = render(<EstadoAprobacion estado="rechazado" motivo="No tenemos lugar este trimestre." />);
    expect(screen.getByText('Motivo:')).toBeTruthy();
    expect(screen.getByText('No tenemos lugar este trimestre.')).toBeTruthy();
    await sinViolacionesAxe(container);
  });

  it('CA_45_SEC_16_el_motivo_se_muestra_como_texto_nunca_como_HTML', () => {
    const motivo = '<img src=x onerror="alert(1)"><b>negrita</b>';
    const { container } = render(<EstadoAprobacion estado="rechazado" motivo={motivo} />);
    expect(screen.getByText(motivo)).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });

  it('CA_45_sin_motivo_o_con_motivo_vacio_solo_se_muestra_el_estado', () => {
    const { rerender } = render(<EstadoAprobacion estado="rechazado" motivo="   " />);
    expect(screen.queryByText('Motivo:')).toBeNull();
    expect(screen.getByText('Rechazada')).toBeTruthy();
    rerender(<EstadoAprobacion estado="rechazado" motivo={null} />);
    expect(screen.queryByText('Motivo:')).toBeNull();
  });

  it('ALU_03_el_motivo_solo_aparece_con_la_cuenta_rechazada', () => {
    render(<EstadoAprobacion estado="pendiente" motivo="Un motivo viejo" />);
    expect(screen.queryByText('Un motivo viejo')).toBeNull();
  });
});
