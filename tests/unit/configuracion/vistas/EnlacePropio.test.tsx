// @vitest-environment jsdom
// Enlace propio del profesor en Configuración (WEB-08, AGE-09, AGE-11, DEC-14): campo de solo lectura, «Copiar
// enlace» con el resultado anunciado (éxito o fallo) y aviso con el profesor inactivo.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EnlacePropio,
  TEXTO_COPIADO,
  TEXTO_NO_COPIADO,
} from '../../../../src/modulos/configuracion/vistas/EnlacePropio';
import { sinViolacionesAxe } from '../../ui/soporte';

afterEach(cleanup);

const ENLACE = 'https://reservatuclase.example/reservas/#/p/ana-perez';

function montar(props: { activo?: boolean; copiar?: (texto: string) => Promise<boolean> } = {}) {
  const copiar = props.copiar ?? vi.fn(async () => true);
  const vista = render(<EnlacePropio enlace={ENLACE} activo={props.activo ?? true} copiar={copiar} />);
  return { ...vista, copiar };
}

describe('EnlacePropio (WEB-08, AGE-09)', () => {
  it('WEB_08_muestra_el_enlace_en_un_campo_de_solo_lectura_con_su_etiqueta_y_pasa_axe', async () => {
    const { container } = montar();
    expect(screen.getByRole('heading', { level: 2, name: 'Tu enlace' })).toBeTruthy();
    const campo = screen.getByLabelText('Enlace de tu agenda') as HTMLInputElement;
    expect(campo.value).toBe(ENLACE);
    expect(campo.readOnly).toBe(true);
    expect(screen.getByRole('button', { name: 'Copiar enlace' })).toBeTruthy();
    expect(screen.queryByText(/Tu agenda está inactiva/)).toBeNull();
    await sinViolacionesAxe(container);
  });

  it('WEB_08_la_region_de_estado_existe_vacia_desde_el_comienzo_para_que_se_anuncie_el_resultado', () => {
    montar();
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('WEB_08_copiar_con_exito_copia_el_enlace_y_lo_anuncia', async () => {
    const { copiar, container } = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Copiar enlace' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(TEXTO_COPIADO));
    expect(copiar).toHaveBeenCalledExactlyOnceWith(ENLACE);
    expect(screen.queryByText(TEXTO_NO_COPIADO)).toBeNull();
    await sinViolacionesAxe(container);
  });

  it('WEB_08_si_el_navegador_no_deja_copiar_lo_dice_y_deja_el_campo_para_copiarlo_a_mano', async () => {
    const { container } = montar({ copiar: vi.fn(async () => false) });
    await userEvent.click(screen.getByRole('button', { name: 'Copiar enlace' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(TEXTO_NO_COPIADO));
    expect(screen.queryByText(TEXTO_COPIADO)).toBeNull();
    expect((screen.getByLabelText('Enlace de tu agenda') as HTMLInputElement).value).toBe(ENLACE);
    await sinViolacionesAxe(container);
  });

  it('WEB_08_un_segundo_intento_reemplaza_el_resultado_anterior', async () => {
    const copiar = vi.fn<(texto: string) => Promise<boolean>>().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    montar({ copiar });
    await userEvent.click(screen.getByRole('button', { name: 'Copiar enlace' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(TEXTO_NO_COPIADO));
    await userEvent.click(screen.getByRole('button', { name: 'Copiar enlace' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(TEXTO_COPIADO));
  });

  it('WEB_08_al_enfocar_el_campo_selecciona_todo_el_enlace', async () => {
    montar();
    const campo = screen.getByLabelText('Enlace de tu agenda') as HTMLInputElement;
    await userEvent.click(campo);
    expect(campo.selectionStart).toBe(0);
    expect(campo.selectionEnd).toBe(ENLACE.length);
  });

  it('AGE_11_con_el_profesor_inactivo_avisa_que_su_enlace_dice_que_no_toma_reservas', async () => {
    const { container } = montar({ activo: false });
    expect(screen.getByText(/Tu agenda está inactiva: quien abra tu enlace ve que no tomás reservas por ahora\./)).toBeTruthy();
    // El enlace sigue siendo copiable.
    expect(screen.getByRole('button', { name: 'Copiar enlace' })).toBeTruthy();
    await sinViolacionesAxe(container);
  });
});
