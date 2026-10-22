// @vitest-environment jsdom
// Formulario de la ficha (WEB-03, ALU-02, ALU-13, CA-02, CA-43): errores por campo, foco al primero y mensaje del tope.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MENSAJE_FICHAS_ALU13 } from '../../../../src/lib/errores';
import { MENSAJES_FICHA, type ResultadoFicha } from '../../../../src/modulos/ficha/logica';
import { FichaForm, type FichaFormProps } from '../../../../src/modulos/ficha/vistas/FichaForm';
import { sinViolacionesAxe } from '../../ui/soporte';

afterEach(cleanup);

const HOY = '2026-11-02';
const OK: ResultadoFicha = { ok: true };

function montar(extra: Partial<FichaFormProps> = {}) {
  const onGuardar = vi.fn<FichaFormProps['onGuardar']>(() => Promise.resolve(OK));
  const resultado = render(
    <FichaForm precargado={{ nombre: null, mail: null }} hoy={HOY} onGuardar={onGuardar} {...extra} />,
  );
  return { ...resultado, onGuardar };
}

async function completar(valores: { nombre?: string; telefono?: string; fecha?: string; llego?: string }) {
  if (valores.nombre !== undefined) await userEvent.type(screen.getByLabelText(/^Nombre y apellido/), valores.nombre);
  if (valores.telefono !== undefined) {
    await userEvent.type(screen.getByLabelText(/^Teléfono o WhatsApp/), valores.telefono);
  }
  if (valores.fecha !== undefined) {
    fireEvent.change(screen.getByLabelText(/^Fecha de nacimiento/), { target: { value: valores.fecha } });
  }
  if (valores.llego !== undefined) {
    await userEvent.type(screen.getByLabelText(/^Cómo llegaste al profesor/), valores.llego);
  }
}

const GUARDAR = () => screen.getByRole('button', { name: 'Guardar ficha' });

describe('FichaForm (ALU-02, CA-02)', () => {
  it('CA_02_muestra_los_cuatro_campos_obligatorios_con_sus_atributos_y_pasa_axe', async () => {
    const { container } = montar();
    for (const etiqueta of [
      /^Nombre y apellido/,
      /^Teléfono o WhatsApp/,
      /^Fecha de nacimiento/,
      /^Cómo llegaste al profesor/,
    ]) {
      expect(screen.getByLabelText(etiqueta).getAttribute('aria-required')).toBe('true');
    }
    expect(screen.getByLabelText(/^Nombre y apellido/).getAttribute('autocomplete')).toBe('name');
    expect(screen.getByLabelText(/^Teléfono o WhatsApp/).getAttribute('autocomplete')).toBe('tel');
    expect(screen.getByLabelText(/^Teléfono o WhatsApp/).getAttribute('type')).toBe('tel');
    expect(screen.getByLabelText(/^Fecha de nacimiento/).getAttribute('autocomplete')).toBe('bday');
    expect(screen.getByLabelText(/^Fecha de nacimiento/).getAttribute('max')).toBe(HOY);
    expect(screen.queryByLabelText(/^Mail/)).toBeNull();
    await sinViolacionesAxe(container);
  });

  it('CA_02_con_Google_el_nombre_y_el_mail_aparecen_cargados_y_el_mail_no_se_edita', async () => {
    const { container } = montar({ precargado: { nombre: 'Ana Pérez', mail: 'ana@correo.test' } });
    expect((screen.getByLabelText(/^Nombre y apellido/) as HTMLInputElement).value).toBe('Ana Pérez');
    const mail = screen.getByLabelText(/^Mail/) as HTMLInputElement;
    expect(mail.value).toBe('ana@correo.test');
    expect(mail.disabled).toBe(true);
    await sinViolacionesAxe(container);
  });

  it('CA_02_con_todo_vacio_marca_cada_campo_y_lleva_el_foco_al_primero', async () => {
    const { container, onGuardar } = montar();
    await userEvent.click(GUARDAR());
    const nombre = screen.getByLabelText(/^Nombre y apellido/);
    await waitFor(() => expect(nombre.getAttribute('aria-invalid')).toBe('true'));
    for (const etiqueta of [/^Teléfono o WhatsApp/, /^Fecha de nacimiento/, /^Cómo llegaste al profesor/]) {
      expect(screen.getByLabelText(etiqueta).getAttribute('aria-invalid')).toBe('true');
      expect(screen.getByLabelText(etiqueta).getAttribute('aria-describedby')).toBeTruthy();
    }
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toEqual(
      expect.arrayContaining([
        MENSAJES_FICHA.nombreVacio,
        MENSAJES_FICHA.telefonoInvalido,
        MENSAJES_FICHA.comoLlegoVacio,
      ]),
    );
    await waitFor(() => expect(document.activeElement).toBe(nombre));
    expect(onGuardar).not.toHaveBeenCalled();
    await sinViolacionesAxe(container);
  });

  it('CA_02_el_foco_va_al_primer_campo_con_error_aunque_no_sea_el_primero', async () => {
    montar({ precargado: { nombre: 'Ana', mail: 'ana@correo.test' } });
    await userEvent.click(GUARDAR());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/^Teléfono o WhatsApp/)));
  });

  it('SEC_09_un_telefono_con_letras_y_una_fecha_futura_se_rechazan_en_el_campo', async () => {
    const { onGuardar } = montar();
    await completar({ nombre: 'Ana', telefono: 'abc123', fecha: '2026-11-03', llego: 'Por una amiga' });
    await userEvent.click(GUARDAR());
    await waitFor(() =>
      expect(screen.getByLabelText(/^Teléfono o WhatsApp/).getAttribute('aria-invalid')).toBe('true'),
    );
    expect(screen.getByLabelText(/^Fecha de nacimiento/).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toEqual([
      MENSAJES_FICHA.telefonoInvalido,
      MENSAJES_FICHA.fechaInvalida,
    ]);
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it('ALU_02_con_los_datos_validos_envia_la_ficha_sin_espacios_sobrantes', async () => {
    const { onGuardar } = montar();
    await completar({
      nombre: '  Ana Pérez ',
      telefono: '+598 99 123-456',
      fecha: '1990-02-03',
      llego: ' Por una amiga ',
    });
    await userEvent.click(GUARDAR());
    await waitFor(() => expect(onGuardar).toHaveBeenCalledOnce());
    expect(onGuardar.mock.calls[0]?.[0]).toEqual({
      nombre: 'Ana Pérez',
      telefono: '+598 99 123-456',
      fecha_nacimiento: '1990-02-03',
      como_llego: 'Por una amiga',
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('CA_43_ALU_13_con_el_tope_superado_muestra_el_mensaje_de_intentar_mas_tarde_y_conserva_los_datos', async () => {
    const onGuardar = vi.fn<FichaFormProps['onGuardar']>(() =>
      Promise.resolve({ ok: false, codigo: 'LIMITE_EXCEDIDO', mensaje: MENSAJE_FICHAS_ALU13, campo: null }),
    );
    const { container } = montar({ onGuardar });
    await completar({ nombre: 'Ana Pérez', telefono: '099123456', fecha: '1990-02-03', llego: 'Por una amiga' });
    await userEvent.click(GUARDAR());
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('En este momento no podemos registrar tu ficha. Intentá de nuevo más tarde.');
    expect((screen.getByLabelText(/^Nombre y apellido/) as HTMLInputElement).value).toBe('Ana Pérez');
    expect(screen.queryByText(/Ficha guardada/)).toBeNull();
    await sinViolacionesAxe(container);
    // Se puede reintentar más tarde con los mismos datos.
    onGuardar.mockResolvedValueOnce(OK);
    await userEvent.click(GUARDAR());
    await waitFor(() => expect(onGuardar).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('WEB_03_un_error_del_servidor_en_un_campo_se_asocia_al_campo_y_lleva_el_foco', async () => {
    const onGuardar = vi.fn<FichaFormProps['onGuardar']>(() =>
      Promise.resolve({ ok: false, codigo: 'DATOS_INVALIDOS', mensaje: 'Revisá el teléfono.', campo: 'telefono' }),
    );
    montar({ onGuardar });
    await completar({ nombre: 'Ana', telefono: '099123456', fecha: '1990-02-03', llego: 'Un amigo' });
    await userEvent.click(GUARDAR());
    const telefono = screen.getByLabelText(/^Teléfono o WhatsApp/);
    await waitFor(() => expect(telefono.getAttribute('aria-invalid')).toBe('true'));
    expect(screen.getByRole('alert').textContent).toBe('Revisá el teléfono.');
    await waitFor(() => expect(document.activeElement).toBe(telefono));
  });

  it('WEB_03_mientras_guarda_el_boton_dice_Guardando_y_no_envia_dos_veces', async () => {
    let terminar: (r: ResultadoFicha) => void = () => undefined;
    const onGuardar = vi.fn<FichaFormProps['onGuardar']>(() => new Promise((resolver) => (terminar = resolver)));
    montar({ onGuardar });
    await completar({ nombre: 'Ana', telefono: '099123456', fecha: '1990-02-03', llego: 'Un amigo' });
    await userEvent.click(GUARDAR());
    const boton = await screen.findByRole('button', { name: 'Guardando…' });
    expect(boton.getAttribute('aria-busy')).toBe('true');
    await userEvent.click(boton);
    expect(onGuardar).toHaveBeenCalledOnce();
    terminar(OK);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar ficha' })).toBeTruthy());
  });
});
