// @vitest-environment jsdom
// Personas a cargo (WEB-03, ALU-06, CA-05): estados cargando, error, vacío y lista; alta y edición en un diálogo.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PersonaACargo, ResultadoPersona } from '../../../../src/modulos/ficha/logica';
import { PersonasACargo, type PersonasACargoProps } from '../../../../src/modulos/ficha/vistas/PersonasACargo';
import { sinViolacionesAxe } from '../../ui/soporte';

afterEach(cleanup);

const HOY = '2026-11-02';
const LUCIA: PersonaACargo = { id: 'p1', nombre: 'Lucía Pérez', fecha_nacimiento: '2015-05-20' };
const TOMAS: PersonaACargo = { id: 'p2', nombre: 'Tomás Pérez', fecha_nacimiento: '2012-01-03' };

function montar(extra: Partial<PersonasACargoProps> = {}) {
  const props = {
    estado: { tipo: 'ok', personas: [] } as PersonasACargoProps['estado'],
    hoy: HOY,
    onGuardar: vi.fn<PersonasACargoProps['onGuardar']>(() => Promise.resolve({ ok: true, id: 'p9' })),
    onGuardada: vi.fn(),
    onReintentar: vi.fn(),
    ...extra,
  };
  return { ...render(<PersonasACargo {...props} />), props };
}

describe('PersonasACargo · estados (WEB-03, F-04)', () => {
  it('WEB_03_cargando_muestra_un_indicador_anunciado', async () => {
    const { container } = montar({ estado: { tipo: 'cargando' } });
    expect(screen.getByRole('heading', { level: 2, name: 'Personas a cargo' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Cargando las personas a cargo…');
    await sinViolacionesAxe(container);
  });

  it('WEB_03_con_error_ofrece_Reintentar', async () => {
    const { container, props } = montar({ estado: { tipo: 'error', mensaje: 'No hay conexión.' } });
    expect(screen.getByRole('alert').textContent).toContain('No se pudieron cargar las personas a cargo. No hay conexión.');
    await sinViolacionesAxe(container);
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(props.onReintentar).toHaveBeenCalledOnce();
  });

  it('ALU_06_vacio_dice_Todavia_no_cargaste_personas_a_cargo_y_ofrece_agregar', async () => {
    const { container } = montar();
    expect(screen.getByRole('heading', { level: 3, name: 'Todavía no cargaste personas a cargo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Agregar persona' })).toBeTruthy();
    await sinViolacionesAxe(container);
  });

  it('ALU_06_la_lista_muestra_nombre_y_fecha_de_nacimiento_y_un_Editar_por_persona', async () => {
    const { container } = montar({ estado: { tipo: 'ok', personas: [LUCIA, TOMAS] } });
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText('Lucía Pérez')).toBeTruthy();
    expect(within(items[0]!).getByText('Nació el 20 de mayo de 2015')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Editar a Tomás Pérez' }).textContent).toBe('Editar');
    expect(screen.getByRole('button', { name: 'Agregar persona' })).toBeTruthy();
    await sinViolacionesAxe(container);
  });
});

describe('PersonasACargo · alta y edición (ALU-06, CA-05)', () => {
  it('ALU_06_agregar_abre_un_dialogo_con_foco_y_guarda_con_id_nulo', async () => {
    const { props } = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Agregar persona' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Agregar persona a cargo' });
    await sinViolacionesAxe(dialogo);
    await userEvent.type(within(dialogo).getByLabelText(/^Nombre y apellido/), ' Lucía Pérez ');
    fireEvent.change(within(dialogo).getByLabelText(/^Fecha de nacimiento/), { target: { value: '2015-05-20' } });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(props.onGuardar).toHaveBeenCalledOnce());
    expect(props.onGuardar).toHaveBeenCalledWith({ id: null, nombre: 'Lucía Pérez', fecha_nacimiento: '2015-05-20' });
    await waitFor(() => expect(props.onGuardada).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('status').textContent).toContain('Persona guardada.');
  });

  it('ALU_06_editar_prellena_los_datos_y_guarda_con_el_id_de_la_persona', async () => {
    const { props } = montar({ estado: { tipo: 'ok', personas: [LUCIA] } });
    await userEvent.click(screen.getByRole('button', { name: 'Editar a Lucía Pérez' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Editar persona a cargo' });
    const nombre = within(dialogo).getByLabelText(/^Nombre y apellido/) as HTMLInputElement;
    expect(nombre.value).toBe('Lucía Pérez');
    expect((within(dialogo).getByLabelText(/^Fecha de nacimiento/) as HTMLInputElement).value).toBe('2015-05-20');
    await userEvent.clear(nombre);
    await userEvent.type(nombre, 'Lucía P.');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(props.onGuardar).toHaveBeenCalledWith({ id: 'p1', nombre: 'Lucía P.', fecha_nacimiento: '2015-05-20' }),
    );
  });

  it('ALU_06_con_datos_invalidos_marca_los_campos_y_no_guarda', async () => {
    const { props } = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Agregar persona' }));
    const dialogo = await screen.findByRole('dialog');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));
    const nombre = within(dialogo).getByLabelText(/^Nombre y apellido/);
    await waitFor(() => expect(nombre.getAttribute('aria-invalid')).toBe('true'));
    expect(within(dialogo).getByLabelText(/^Fecha de nacimiento/).getAttribute('aria-invalid')).toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(nombre));
    expect(props.onGuardar).not.toHaveBeenCalled();
    await sinViolacionesAxe(dialogo);
  });

  it('ALU_06_si_el_servidor_rechaza_muestra_el_error_en_el_dialogo_y_no_lo_cierra', async () => {
    const onGuardar = vi.fn<PersonasACargoProps['onGuardar']>(() =>
      Promise.resolve({
        ok: false,
        codigo: 'FICHA_INCOMPLETA',
        mensaje: 'Completá tu ficha antes de cargar personas.',
        campo: null,
      } satisfies ResultadoPersona),
    );
    const { props } = montar({ onGuardar });
    await userEvent.click(screen.getByRole('button', { name: 'Agregar persona' }));
    const dialogo = await screen.findByRole('dialog');
    await userEvent.type(within(dialogo).getByLabelText(/^Nombre y apellido/), 'Lucía');
    fireEvent.change(within(dialogo).getByLabelText(/^Fecha de nacimiento/), { target: { value: '2015-05-20' } });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));
    expect((await within(dialogo).findByRole('alert')).textContent).toBe('Completá tu ficha antes de cargar personas.');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(props.onGuardada).not.toHaveBeenCalled();
  });

  it('ALU_06_Cancelar_cierra_el_dialogo_sin_guardar_y_devuelve_el_foco_al_boton', async () => {
    const { props } = montar({ estado: { tipo: 'ok', personas: [LUCIA] } });
    const editar = screen.getByRole('button', { name: 'Editar a Lucía Pérez' });
    await userEvent.click(editar);
    const dialogo = await screen.findByRole('dialog');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(props.onGuardar).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(editar));
  });
});
