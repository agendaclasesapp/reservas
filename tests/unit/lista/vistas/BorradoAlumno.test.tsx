// @vitest-environment jsdom
// Borrar alumno (B11, T11.2; ALU-12, CA-10, SEC-16; flujos-profesor.md F-13 punto 3): diálogo destructivo con el
// efecto enumerado, botón «Borrar alumno», resumen de clases canceladas anunciado y foco.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EstadoAlumnos } from '../../../../src/modulos/lista/logica';
import { BorradoDialogo } from '../../../../src/modulos/lista/vistas/BorradoDialogo';
import { ListaAlumnos } from '../../../../src/modulos/lista/vistas/ListaAlumnos';
import { VistaLista } from '../../../../src/modulos/lista/vistas/VistaLista';
import { sinViolacionesAxe } from '../../ui/soporte';
import { acciones, alumno, fallo, type AccionesSimuladas } from './soporte';

afterEach(cleanup);

const EFECTO =
  'Sus clases futuras con vos se cancelan y esos horarios quedan libres. Sus clases pasadas quedan sin sus datos y deja de aparecer en tu lista.';
const CON_CUENTA = 'Tiene cuenta: su cuenta y su ficha siguen, y lo suyo con otros profesores no cambia.';
const SIN_CUENTA_SOLO =
  'No tiene cuenta ni otro profesor: sus datos y sus personas a cargo se borran y no se pueden recuperar.';
const SIN_MAIL = 'No le avisamos por mail.';

const ANA = alumno();
const SIN_CUENTA = alumno({ id: 's1', estado: 'sin_cuenta', nombre: 'Bruno D.', mail: null, con_usuario: false });
const LISTO = (alumnos: ReturnType<typeof alumno>[]): EstadoAlumnos => ({ estado: 'listo', alumnos, error: null });

function montar(datos: EstadoAlumnos, acc: AccionesSimuladas = acciones(), profesorActivo = true) {
  const onRecargar = vi.fn();
  const resultado = render(
    <VistaLista datos={datos} hoy="2026-11-02" onRecargar={onRecargar} acciones={acc} profesorActivo={profesorActivo} />,
  );
  return { ...resultado, acc, onRecargar };
}

async function abrir(nombre: string) {
  await userEvent.click(screen.getByRole('button', { name: `Borrar a ${nombre}` }));
  return screen.findByRole('dialog', { name: `Borrar a ${nombre}` });
}

describe('ListaAlumnos · botón «Borrar» (ALU-12)', () => {
  it('ALU_12_cada_fila_ofrece_Borrar_con_el_nombre_en_su_nombre_accesible_y_llama_a_onBorrar', async () => {
    const onBorrar = vi.fn();
    const props = { onAgregar: vi.fn(), onEditar: vi.fn(), onAprobar: vi.fn(), onRevisarUnion: vi.fn(), onBorrar };
    const { container } = render(<ListaAlumnos alumnos={[ANA, SIN_CUENTA]} {...props} />);
    const boton = screen.getByRole('button', { name: 'Borrar a Ana Pérez' });
    expect(boton.textContent).toBe('Borrar');
    await userEvent.click(boton);
    expect(onBorrar).toHaveBeenCalledWith(ANA);
    expect(screen.getByRole('button', { name: 'Borrar a Bruno D.' })).toBeTruthy();
    await sinViolacionesAxe(container);
  });

  it('ALU_12_un_alumno_anonimizado_aparece_como_Alumno_dado_de_baja_sin_nombre_propio', () => {
    const props = { onAgregar: vi.fn(), onEditar: vi.fn(), onAprobar: vi.fn(), onRevisarUnion: vi.fn(), onBorrar: vi.fn() };
    render(<ListaAlumnos alumnos={[alumno({ id: 'x', nombre: null, estado: 'sin_cuenta', con_usuario: false })]} {...props} />);
    expect(screen.getByRole('rowheader', { name: 'Alumno dado de baja' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Borrar a Alumno dado de baja' })).toBeTruthy();
  });
});

describe('BorradoDialogo (ALU-12, CA-10)', () => {
  it('ALU_12_enumera_el_efecto_con_cuenta_dice_que_la_cuenta_sigue_y_pasa_axe', async () => {
    render(<VistaLista datos={LISTO([ANA])} hoy="2026-11-02" onRecargar={vi.fn()} acciones={acciones()} />);
    const dialogo = await abrir('Ana Pérez');
    const items = within(dialogo)
      .getAllByRole('listitem')
      .map((i) => i.textContent);
    expect(items).toEqual([EFECTO, CON_CUENTA, SIN_MAIL]);
    expect(dialogo.contains(document.activeElement)).toBe(true);
    expect(within(dialogo).getByRole('button', { name: 'Borrar alumno' })).toBeTruthy();
    expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toBeTruthy();
    expect(within(dialogo).queryByRole('button', { name: /aceptar/i })).toBeNull();
    await sinViolacionesAxe(document.body);
  });

  it('ALU_12_sin_cuenta_y_ficha_propia_dice_que_sus_datos_se_borran', async () => {
    montar(LISTO([SIN_CUENTA]));
    const dialogo = await abrir('Bruno D.');
    expect(within(dialogo).getByText(SIN_CUENTA_SOLO)).toBeTruthy();
  });

  it('ALU_12_sin_cuenta_y_ficha_compartida_dice_que_se_borra_si_no_tiene_otro_profesor', async () => {
    montar(LISTO([alumno({ ...SIN_CUENTA, editable: false })]));
    const dialogo = await abrir('Bruno D.');
    expect(within(dialogo).getByText(/si no es alumno de otro profesor, sus datos y sus personas a cargo se borran/)).toBeTruthy();
  });

  it('ALU_12_Cancelar_cierra_sin_llamar_a_borrar_y_devuelve_el_foco_a_la_pagina', async () => {
    const { acc } = montar(LISTO([ANA]));
    await abrir('Ana Pérez');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(acc.borrar).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Borrar a Ana Pérez' })));
  });

  it('ALU_12_Esc_cierra_el_dialogo_sin_borrar', async () => {
    const { acc } = montar(LISTO([ANA]));
    await abrir('Ana Pérez');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(acc.borrar).not.toHaveBeenCalled();
  });

  it('CA_10_confirmar_llama_a_borrar_recarga_cierra_y_anuncia_las_clases_canceladas_con_el_foco_en_el_aviso', async () => {
    const acc = acciones();
    acc.borrar.mockResolvedValueOnce({ ok: true, clasesCanceladas: 3, solicitudesAnuladas: 1 });
    const { onRecargar } = montar(LISTO([ANA]), acc);
    await abrir('Ana Pérez');
    await userEvent.click(screen.getByRole('button', { name: 'Borrar alumno' }));
    await waitFor(() => expect(acc.borrar).toHaveBeenCalledWith('a1'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onRecargar).toHaveBeenCalledOnce();
    const aviso = await screen.findByRole('status');
    expect(aviso.textContent).toContain('Alumno borrado: se cancelaron 3 clases y se anuló 1 solicitud pendiente.');
    await waitFor(() => expect(aviso.parentElement?.contains(document.activeElement) ?? false).toBe(true));
    expect(document.activeElement).toBe(aviso.parentElement);
  });

  it('ALU_12_sin_clases_futuras_el_resumen_lo_dice', async () => {
    montar(LISTO([ANA]));
    await abrir('Ana Pérez');
    await userEvent.click(screen.getByRole('button', { name: 'Borrar alumno' }));
    expect((await screen.findByRole('status')).textContent).toContain(
      'Alumno borrado. No tenía clases futuras ni solicitudes pendientes con vos.',
    );
  });

  it('ALU_12_con_un_error_el_dialogo_sigue_abierto_y_lo_anuncia_en_un_alert', async () => {
    const acc = acciones();
    acc.borrar.mockResolvedValueOnce(fallo('DESCONOCIDO', 'No pudimos borrar al alumno. Probá de nuevo.'));
    const { onRecargar } = montar(LISTO([ANA]), acc);
    const dialogo = await abrir('Ana Pérez');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Borrar alumno' }));
    expect((await within(dialogo).findByRole('alert')).textContent).toContain('No pudimos borrar al alumno. Probá de nuevo.');
    expect(screen.getByRole('dialog', { name: 'Borrar a Ana Pérez' })).toBeTruthy();
    expect(onRecargar).not.toHaveBeenCalled();
    const boton = within(dialogo).getByRole('button', { name: 'Borrar alumno' }) as HTMLButtonElement;
    expect(boton.disabled).toBe(false);
  });

  it('ALU_12_si_el_alumno_ya_no_existe_NO_ENCONTRADO_recarga_la_lista_y_muestra_el_error', async () => {
    const acc = acciones();
    acc.borrar.mockResolvedValueOnce(fallo('NO_ENCONTRADO', 'No encontramos lo que buscás. Puede que ya no exista.'));
    const { onRecargar } = montar(LISTO([ANA]), acc);
    const dialogo = await abrir('Ana Pérez');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Borrar alumno' }));
    expect((await within(dialogo).findByRole('alert')).textContent).toContain('Puede que ya no exista');
    expect(onRecargar).toHaveBeenCalledOnce();
  });

  it('ALU_12_mientras_borra_el_boton_queda_ocupado_y_no_se_envia_dos_veces', async () => {
    const acc = acciones();
    let resolver: (r: Awaited<ReturnType<AccionesSimuladas['borrar']>>) => void = () => undefined;
    acc.borrar.mockReturnValueOnce(new Promise((res) => (resolver = res)));
    montar(LISTO([ANA]), acc);
    const dialogo = await abrir('Ana Pérez');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Borrar alumno' }));
    const ocupado = await within(dialogo).findByRole('button', { name: 'Borrando…' });
    expect(ocupado.getAttribute('aria-busy')).toBe('true');
    await userEvent.click(ocupado);
    expect(acc.borrar).toHaveBeenCalledTimes(1);
    resolver({ ok: true, clasesCanceladas: 0, solicitudesAnuladas: 0 });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('PRF_08_con_el_profesor_inactivo_Borrar_sigue_disponible', async () => {
    const { acc } = montar(LISTO([ANA]), acciones(), false);
    const boton = screen.getByRole('button', { name: 'Borrar a Ana Pérez' }) as HTMLButtonElement;
    expect(boton.disabled).toBe(false);
    await abrir('Ana Pérez');
    await userEvent.click(screen.getByRole('button', { name: 'Borrar alumno' }));
    await waitFor(() => expect(acc.borrar).toHaveBeenCalledWith('a1'));
  });

  it('SEC_16_el_nombre_con_marcado_se_muestra_como_texto_en_el_titulo_del_dialogo', async () => {
    const malo = '<img src=x onerror=alert(1)>';
    montar(LISTO([alumno({ nombre: malo })]));
    const dialogo = await abrir(malo);
    expect(dialogo.querySelector('img')).toBeNull();
    expect(within(dialogo).getByRole('heading', { name: `Borrar a ${malo}` })).toBeTruthy();
  });

  it('ALU_12_el_dialogo_suelto_ofrece_las_tres_variantes_de_persona', () => {
    const props = { nombre: 'X', onConfirmar: vi.fn(), onCerrar: vi.fn() };
    const { rerender } = render(<BorradoDialogo {...props} alumno={{ con_usuario: true, editable: false }} />);
    expect(screen.getByText(CON_CUENTA)).toBeTruthy();
    rerender(<BorradoDialogo {...props} alumno={{ con_usuario: false, editable: true }} />);
    expect(screen.getByText(SIN_CUENTA_SOLO)).toBeTruthy();
  });
});
