// @vitest-environment jsdom
// «Tus profesores» en la ficha (WEB-03, ALU-03, ALU-14, AGE-11, SEC-16, CA-45): un bloque por profesor, vacío sin
// vínculos y sin mostrar los vínculos «sin cuenta», que una persona con sesión no tiene.
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { VinculoFicha } from '../../../../src/modulos/ficha/logica';
import { VinculosFicha } from '../../../../src/modulos/ficha/vistas/VinculosFicha';
import { sinViolacionesAxe } from '../../ui/soporte';

afterEach(cleanup);

function vinculo(slug: string, estado: VinculoFicha['estado'], extra: Partial<VinculoFicha> = {}): VinculoFicha {
  return {
    profesorId: `id-${slug}`,
    slug,
    profesorNombre: `Prof ${slug}`,
    profesorActivo: true,
    estado,
    motivo: null,
    ...extra,
  };
}

describe('VinculosFicha (WEB-03)', () => {
  it('WEB_03_lista_un_bloque_por_profesor_en_el_orden_recibido_con_su_estado_y_su_enlace', async () => {
    const { container } = render(
      <VinculosFicha
        vinculos={[
          vinculo('ana', 'aprobado'),
          vinculo('beto', 'pendiente'),
          vinculo('carla', 'rechazado', { motivo: 'No hay lugar.' }),
        ]}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Tus profesores' })).toBeTruthy();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items.map((i) => within(i).getByRole('heading', { level: 3 }).textContent)).toEqual([
      'Prof ana',
      'Prof beto',
      'Prof carla',
    ]);
    expect(within(items[0] as HTMLElement).getByText('Aprobada')).toBeTruthy();
    expect(within(items[1] as HTMLElement).getByText('Pendiente de aprobación')).toBeTruthy();
    expect(within(items[2] as HTMLElement).getByText('Rechazada')).toBeTruthy();
    expect(within(items[2] as HTMLElement).getByText('No hay lugar.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ver la agenda de Prof beto' }).getAttribute('href')).toBe('#/p/beto');
    await sinViolacionesAxe(container);
  });

  it('ALU_03_sin_vinculos_dice_como_conseguir_uno_sin_listar_profesores', async () => {
    const { container } = render(<VinculosFicha vinculos={[]} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Todavía no pediste acceso a ningún profesor' })).toBeTruthy();
    expect(screen.getByText('Pedile el enlace a tu profesor y entrá desde ahí para pedirle acceso.')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
    await sinViolacionesAxe(container);
  });

  it('ALU_03_un_vinculo_sin_cuenta_no_se_muestra_y_si_es_el_unico_queda_el_vacio', () => {
    const { rerender } = render(<VinculosFicha vinculos={[vinculo('ana', 'sin_cuenta'), vinculo('beto', 'aprobado')]} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByText('Prof ana')).toBeNull();
    rerender(<VinculosFicha vinculos={[vinculo('ana', 'sin_cuenta')]} />);
    expect(screen.getByText('Todavía no pediste acceso a ningún profesor')).toBeTruthy();
  });

  it('AGE_11_SEC_16_el_profesor_inactivo_se_dice_y_los_nombres_son_texto', () => {
    const { container } = render(
      <VinculosFicha vinculos={[vinculo('ana', 'aprobado', { profesorNombre: '<b>Ana</b>', profesorActivo: false })]} />,
    );
    expect(screen.getByText('No toma reservas por ahora.')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: '<b>Ana</b>' })).toBeTruthy();
    expect(container.querySelector('b')).toBeNull();
  });
});
