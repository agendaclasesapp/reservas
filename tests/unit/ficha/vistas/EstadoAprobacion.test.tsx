// @vitest-environment jsdom
// Estado del vínculo con un profesor y motivo de rechazo (WEB-03, ALU-03, ALU-14, AGE-11, SEC-16, CA-45).
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
  ] as const)('ALU_03_el_estado_%s_se_dice_con_texto_bajo_el_nombre_del_profesor', async (estado, texto) => {
    const { container } = render(<EstadoAprobacion estado={estado} motivo={null} profesorNombre="Beto Gómez" />);
    expect(screen.getByRole('heading', { level: 3, name: 'Beto Gómez' })).toBeTruthy();
    expect(screen.getByText(texto)).toBeTruthy();
    expect(screen.queryByText('Motivo:')).toBeNull();
    await sinViolacionesAxe(container);
  });

  it('ALU_14_el_nivel_del_encabezado_se_puede_subir_a_h2', () => {
    render(<EstadoAprobacion estado="aprobado" motivo={null} profesorNombre="Beto Gómez" nivel={2} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Beto Gómez' })).toBeTruthy();
  });

  it('CA_45_una_cuenta_rechazada_con_motivo_lo_muestra', async () => {
    const { container } = render(
      <EstadoAprobacion estado="rechazado" motivo="No tenemos lugar este trimestre." profesorNombre="Beto Gómez" />,
    );
    expect(screen.getByText('Motivo:')).toBeTruthy();
    expect(screen.getByText('No tenemos lugar este trimestre.')).toBeTruthy();
    await sinViolacionesAxe(container);
  });

  it('CA_45_SEC_16_el_motivo_y_el_nombre_se_muestran_como_texto_nunca_como_HTML', () => {
    const motivo = '<img src=x onerror="alert(1)"><b>negrita</b>';
    const { container } = render(<EstadoAprobacion estado="rechazado" motivo={motivo} profesorNombre="<i>Beto</i>" />);
    expect(screen.getByText(motivo)).toBeTruthy();
    expect(screen.getByRole('heading', { name: '<i>Beto</i>' })).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('i')).toBeNull();
  });

  it('CA_45_sin_motivo_o_con_motivo_vacio_solo_se_muestra_el_estado', () => {
    const { rerender } = render(<EstadoAprobacion estado="rechazado" motivo="   " profesorNombre="Beto Gómez" />);
    expect(screen.queryByText('Motivo:')).toBeNull();
    expect(screen.getByText('Rechazada')).toBeTruthy();
    rerender(<EstadoAprobacion estado="rechazado" motivo={null} profesorNombre="Beto Gómez" />);
    expect(screen.queryByText('Motivo:')).toBeNull();
  });

  it('ALU_03_el_motivo_solo_aparece_con_la_cuenta_rechazada', () => {
    render(<EstadoAprobacion estado="pendiente" motivo="Un motivo viejo" profesorNombre="Beto Gómez" />);
    expect(screen.queryByText('Un motivo viejo')).toBeNull();
  });

  it('AGE_11_un_profesor_inactivo_dice_que_no_toma_reservas_por_ahora', async () => {
    const { container, rerender } = render(
      <EstadoAprobacion estado="aprobado" motivo={null} profesorNombre="Beto Gómez" profesorActivo={false} />,
    );
    expect(screen.getByText('No toma reservas por ahora.')).toBeTruthy();
    await sinViolacionesAxe(container);
    rerender(<EstadoAprobacion estado="aprobado" motivo={null} profesorNombre="Beto Gómez" />);
    expect(screen.queryByText('No toma reservas por ahora.')).toBeNull();
  });

  it('ALU_14_con_slug_ofrece_el_enlace_a_la_agenda_del_profesor_y_sin_slug_no', () => {
    const { rerender } = render(
      <EstadoAprobacion estado="aprobado" motivo={null} profesorNombre="Beto Gómez" slug="beto-gomez" />,
    );
    expect(screen.getByRole('link', { name: 'Ver la agenda de Beto Gómez' }).getAttribute('href')).toBe(
      '#/p/beto-gomez',
    );
    rerender(<EstadoAprobacion estado="aprobado" motivo={null} profesorNombre="Beto Gómez" />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
