// @vitest-environment jsdom
// «Pedir acceso» en la agenda de un profesor (ALU-14, DEC-33, WEB-01, SEC-16): «cómo llegaste» a ese profesor,
// el pedido sale con el slug, errores por campo y generales, y no se muestra si el profesor no está activo.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reiniciarConfigPublica, type ConfigPublica } from '../../../../src/modulos/agenda/logica';
import type { PedirAccesoEntrada, ResultadoPedido } from '../../../../src/modulos/ficha/logica';
import PedirAcceso from '../../../../src/modulos/ficha/vistas/PedirAcceso';
import { sinViolacionesAxe } from '../../ui/soporte';

const ACTIVA: ConfigPublica = {
  profesor_id: 'id-beto-gomez',
  nombre: 'Beto Gómez',
  activo: true,
  zona_horaria: 'America/Argentina/Buenos_Aires',
  duracion_min: 60,
  anticipacion_horas: 24,
  horizonte_semanas: 4,
};
const OK: ResultadoPedido = { ok: true, profesorId: 'id-beto-gomez', estado: 'pendiente' };

beforeEach(() => {
  reiniciarConfigPublica();
});

afterEach(() => {
  cleanup();
  reiniciarConfigPublica();
});

function montar(config: ConfigPublica | Error = ACTIVA, resultado: ResultadoPedido = OK) {
  const obtenerConfig = vi.fn(async () => {
    if (config instanceof Error) throw config;
    return config;
  });
  const pedir = vi.fn<(slug: string, entrada: PedirAccesoEntrada) => Promise<ResultadoPedido>>(async () => resultado);
  const vista = render(<PedirAcceso slug="beto-gomez" pedir={pedir} obtenerConfig={obtenerConfig} />);
  return { ...vista, pedir, obtenerConfig };
}

const CAMPO = () => screen.findByLabelText(/^Cómo llegaste a Beto Gómez/);
const BOTON = () => screen.getByRole('button', { name: 'Pedir acceso' });

describe('PedirAcceso (ALU-14)', () => {
  it('ALU_14_muestra_el_formulario_con_el_nombre_del_profesor_y_pasa_axe', async () => {
    const { container } = montar();
    expect(await screen.findByRole('heading', { level: 2, name: 'Pedir acceso a Beto Gómez' })).toBeTruthy();
    expect((await CAMPO()).getAttribute('aria-required')).toBe('true');
    expect(BOTON()).toBeTruthy();
    await sinViolacionesAxe(container);
  });

  it('ALU_14_mientras_no_se_conoce_al_profesor_o_si_esta_inactivo_o_falla_la_lectura_no_muestra_nada', async () => {
    const inactiva = montar({ profesor_id: 'x', nombre: 'Beto Gómez', activo: false });
    await waitFor(() => expect(inactiva.obtenerConfig).toHaveBeenCalledOnce());
    await new Promise((r) => setTimeout(r, 20));
    expect(inactiva.container.textContent).toBe('');
    cleanup();
    reiniciarConfigPublica();
    const error = montar(new Error('sin red'));
    await waitFor(() => expect(error.obtenerConfig).toHaveBeenCalledOnce());
    await new Promise((r) => setTimeout(r, 20));
    expect(error.container.textContent).toBe('');
  });

  it('ALU_14_sin_contar_como_llegaste_marca_el_campo_lleva_el_foco_y_no_envia', async () => {
    const { pedir } = montar();
    const campo = await CAMPO();
    await userEvent.click(BOTON());
    await waitFor(() => expect(campo.getAttribute('aria-invalid')).toBe('true'));
    expect(screen.getByRole('alert').textContent).toContain('Contanos cómo llegaste al profesor.');
    await waitFor(() => expect(document.activeElement).toBe(campo));
    expect(pedir).not.toHaveBeenCalled();
  });

  it('ALU_14_envia_el_pedido_con_el_slug_y_el_texto_sin_espacios_y_confirma', async () => {
    const { pedir, container } = montar();
    await userEvent.type(await CAMPO(), '  Por una amiga ');
    await userEvent.click(BOTON());
    await waitFor(() => expect(pedir).toHaveBeenCalledOnce());
    expect(pedir.mock.calls[0]).toEqual(['beto-gomez', { como_llego: 'Por una amiga' }]);
    expect(await screen.findByText('Pedido enviado')).toBeTruthy();
    expect(screen.getByText(/Pediste acceso a Beto Gómez\. Cuando lo apruebe/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pedir acceso' })).toBeNull();
    await sinViolacionesAxe(container);
  });

  it('ALU_14_un_error_del_servidor_en_el_campo_se_asocia_y_lleva_el_foco', async () => {
    montar(ACTIVA, { ok: false, codigo: 'DATOS_INVALIDOS', mensaje: 'Es demasiado largo.', campo: 'como_llego' });
    const campo = await CAMPO();
    await userEvent.type(campo, 'Un amigo');
    await userEvent.click(BOTON());
    await waitFor(() => expect(campo.getAttribute('aria-invalid')).toBe('true'));
    expect(screen.getByRole('alert').textContent).toContain('Es demasiado largo.');
    await waitFor(() => expect(document.activeElement).toBe(campo));
  });

  it('ALU_14_un_error_general_se_anuncia_y_conserva_lo_escrito_para_reintentar', async () => {
    const { pedir, container } = montar(ACTIVA, {
      ok: false,
      codigo: 'CUENTA_NO_PENDIENTE',
      mensaje: 'Ya pediste acceso a este profesor.',
      campo: null,
    });
    const campo = (await CAMPO()) as HTMLInputElement;
    await userEvent.type(campo, 'Un amigo');
    await userEvent.click(BOTON());
    expect((await screen.findByRole('alert')).textContent).toContain('Ya pediste acceso a este profesor.');
    expect(campo.value).toBe('Un amigo');
    expect(screen.queryByText('Pedido enviado')).toBeNull();
    await sinViolacionesAxe(container);
    pedir.mockResolvedValueOnce(OK);
    await userEvent.click(BOTON());
    expect(await screen.findByText('Pedido enviado')).toBeTruthy();
  });

  it('SEC_16_el_nombre_del_profesor_se_muestra_como_texto_nunca_como_HTML', async () => {
    const nombre = '<img src=x onerror="alert(1)"><b>Beto</b>';
    const { container } = montar({ ...ACTIVA, nombre });
    expect(await screen.findByRole('heading', { level: 2, name: `Pedir acceso a ${nombre}` })).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });
});
