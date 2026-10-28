// @vitest-environment jsdom
// Panel del profesor, agenda y contadores (T09.2): WEB-06, PRF-05, PRF-08, AVI-01, SEC-16; CA-28 (nombres en cada hueco
// ocupado), F-07 (estados), AGE-07 (mismo selector de día).
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { MENSAJES_PANEL } from '../../../../src/modulos/panel/logica';
import { sinViolacionesAxe } from '../../ui/soporte';
import { fila, H11, LIBRE_11, LIBRE_12, montar, ocupada } from './soporte';

afterEach(cleanup);

describe('agenda con nombres (F-07, PRF-05, CA-28)', () => {
  it('CA_28_PRF_05_cada_hueco_ocupado_muestra_quien_toma_titular_observacion_y_estado', () => {
    montar([
      ocupada({
        quien_toma: 'Lucía (hija)',
        titular: 'Ana Pérez',
        observacion: 'Trae su mat',
        clase_estado: 'confirmada',
      }),
      LIBRE_11,
    ]);
    const lista = screen.getByRole('list', { name: 'Huecos del día' });
    const items = within(lista).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    const ocupado = items[0];
    expect(ocupado.textContent).toContain('10:00 a 11:00');
    expect(ocupado.textContent).toContain('Ocupado');
    expect(ocupado.textContent).toContain('Toma la clase: Lucía (hija)');
    expect(ocupado.textContent).toContain('Titular: Ana Pérez');
    expect(ocupado.textContent).toContain('Observación: Trae su mat');
    expect(ocupado.textContent).toContain('Confirmada');
    expect(items[1].textContent).toContain('11:00 a 12:00');
    expect(items[1].textContent).toContain('Libre');
  });

  it('PRF_05_una_clase_pendiente_de_respuesta_lo_dice_y_manda_a_la_lista', () => {
    montar([ocupada({ clase_estado: 'pendiente', solicitud_id: 's1' })]);
    expect(screen.getByText(MENSAJES_PANEL.estadoClase.pendiente)).toBeTruthy();
    expect(screen.getByText('Tiene un pedido del alumno sin responder.')).toBeTruthy();
    // No se gestiona desde el panel: no es un botón, hay un enlace a la lista.
    expect(screen.queryByRole('button', { name: /10:00 a 11:00/ })).toBeNull();
    expect(screen.getByRole('link', { name: /Responder en la lista/ }).getAttribute('href')).toBe('#/lista');
  });

  it('WEB_06_AGE_06_un_hueco_bloqueado_muestra_el_motivo_y_se_puede_tocar_para_desbloquearlo', () => {
    montar([fila({ estado: 'bloqueado', bloqueo_id: 'b1', bloqueo_motivo: 'Vacaciones' })]);
    expect(screen.getByText('Bloqueado')).toBeTruthy();
    expect(screen.getByText('Motivo: Vacaciones')).toBeTruthy();
    // El bloqueo es suyo (bloqueo_id): el hueco es un botón que abre «Desbloquear» (los detalles en Bloqueos.test).
    expect(screen.getByRole('button', { name: /10:00 a 11:00/ })).toBeTruthy();
  });

  it('WEB_06_un_hueco_bloqueado_sin_bloqueo_propio_no_se_puede_tocar', () => {
    montar([fila({ estado: 'bloqueado', bloqueo_id: null })]);
    expect(screen.getByText('Bloqueado')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /10:00 a 11:00/ })).toBeNull();
  });

  it('PRF_05_los_huecos_que_ya_pasaron_se_ven_y_no_se_pueden_tocar', () => {
    montar([ocupada({ pasada: true }), fila({ inicio: H11, fin: '2026-11-12T15:00:00Z', pasada: true })]);
    expect(screen.getAllByText('Ya pasó')).toHaveLength(2);
    expect(screen.queryAllByRole('button', { name: /a 1[12]:00/ })).toHaveLength(0);
  });

  it('SEC_16_nombres_y_observaciones_se_muestran_como_texto', () => {
    const sucio = '<img src=x onerror="alert(1)">';
    const { container } = montar([ocupada({ quien_toma: sucio, titular: '<b>Ana</b>', observacion: '<script>1</script>' })]);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText(`Toma la clase: ${sucio}`)).toBeTruthy();
    expect(screen.getByText('Observación: <script>1</script>')).toBeTruthy();
  });

  it('WEB_06_el_dia_vive_en_el_selector_de_la_agenda_publica', async () => {
    const { onCambiarDia } = montar([LIBRE_11]);
    expect(screen.getByRole('heading', { level: 2, name: /jueves, 12 de noviembre/i })).toBeTruthy();
    expect(screen.getByText('Horarios en el huso America/Montevideo.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Día siguiente' }));
    expect(onCambiarDia).toHaveBeenCalledWith('2026-11-13');
    await userEvent.click(screen.getByRole('button', { name: 'Día anterior' }));
    expect(onCambiarDia).toHaveBeenLastCalledWith('2026-11-11');
    fireEvent.change(screen.getByLabelText('Elegir día'), { target: { value: '2026-12-01' } });
    expect(onCambiarDia).toHaveBeenLastCalledWith('2026-12-01');
  });

  it('SEC_09_un_dia_fuera_del_alcance_de_la_agenda_no_se_pide', () => {
    const { onCambiarDia } = montar([LIBRE_11]);
    fireEvent.change(screen.getByLabelText('Elegir día'), { target: { value: '2030-01-01' } });
    expect(onCambiarDia).not.toHaveBeenCalled();
    expect(screen.getByText(/Ese día no está disponible/)).toBeTruthy();
  });
});

describe('contadores (AVI-01, F-07 paso 2)', () => {
  it('AVI_01_los_contadores_se_dicen_en_texto_y_llevan_a_la_lista', () => {
    montar([LIBRE_11]);
    const solicitudes = screen.getByRole('link', { name: '3 solicitudes pendientes' });
    const cuentas = screen.getByRole('link', { name: '1 cuenta pendiente' });
    expect(solicitudes.getAttribute('href')).toBe('#/lista');
    expect(cuentas.getAttribute('href')).toBe('#/lista');
  });

  it('AVI_01_singular_y_plural', () => {
    montar([LIBRE_11], {
      contadores: { estado: 'listo', datos: { solicitudes_pendientes: 1, cuentas_pendientes: 2 }, error: null },
    });
    expect(screen.getByRole('link', { name: '1 solicitud pendiente' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '2 cuentas pendientes' })).toBeTruthy();
  });

  it('AVI_01_sin_pendientes_lo_dice_sin_enlace', () => {
    montar([LIBRE_11], {
      contadores: { estado: 'listo', datos: { solicitudes_pendientes: 0, cuentas_pendientes: 0 }, error: null },
    });
    expect(screen.getByText('Sin solicitudes pendientes')).toBeTruthy();
    expect(screen.getByText('Sin cuentas pendientes')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('AVI_01_mientras_carga_los_contadores_avisa_y_la_agenda_sigue', () => {
    montar([LIBRE_11], { contadores: { estado: 'cargando', datos: null, error: null } });
    expect(screen.getByText('Cargando los pendientes…')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^11:00 a 12:00/ })).toBeTruthy();
  });

  it('AVI_01_si_fallan_los_contadores_avisa_y_deja_reintentar_sin_tapar_la_agenda', async () => {
    const { onRecargarContadores } = montar([LIBRE_11], {
      contadores: { estado: 'error', datos: null, error: 'No hay conexión.' },
    });
    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toContain('No se pudieron cargar los pendientes. No hay conexión.');
    await userEvent.click(within(alerta).getByRole('button', { name: 'Reintentar' }));
    expect(onRecargarContadores).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /^11:00 a 12:00/ })).toBeTruthy();
  });
});

describe('estados de la agenda (F-07)', () => {
  it('WEB_06_mientras_carga_muestra_el_indicador', () => {
    montar([], { agenda: { estado: 'cargando', datos: null, error: null } });
    expect(screen.getByText('Cargando los huecos del día…')).toBeTruthy();
  });

  it('WEB_06_el_error_de_carga_ofrece_reintentar', async () => {
    const { onRecargarAgenda } = montar([], { agenda: { estado: 'error', datos: null, error: 'No hay conexión.' } });
    expect(screen.getByRole('alert').textContent).toContain('No se pudo cargar la agenda. No hay conexión.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRecargarAgenda).toHaveBeenCalledTimes(1);
  });

  it('WEB_06_un_dia_sin_huecos_lo_dice', () => {
    montar([]);
    expect(screen.getByText('No hay huecos este día')).toBeTruthy();
  });
});

describe('profesor inactivo (PRF-08)', () => {
  it('PRF_08_avisa_y_deja_crear_y_mover_deshabilitados_pero_cancelar_sigue', async () => {
    montar([ocupada(), LIBRE_11], { profesorActivo: false });
    expect(screen.getByText(MENSAJES_PANEL.profesorInactivo)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: /^11:00 a 12:00/ }));
    const dialogo = screen.getByRole('dialog');
    expect((within(dialogo).getByRole('button', { name: 'Crear clase' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(dialogo).getByText('Con la agenda inactiva no podés crear clases.')).toBeTruthy();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cerrar' }));

    await userEvent.click(screen.getByRole('button', { name: /^10:00 a 11:00/ }));
    const otro = screen.getByRole('dialog');
    expect((within(otro).getByRole('button', { name: 'Mover' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(otro).getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement).disabled).toBe(false);
    expect(within(otro).getByText(/Sí podés cancelarlas/)).toBeTruthy();
  });

  it('PRF_08_con_la_agenda_activa_no_hay_aviso', () => {
    montar([ocupada()]);
    expect(screen.queryByText(MENSAJES_PANEL.profesorInactivo)).toBeNull();
  });
});

describe('contenedor de las acciones (F-07 paso 3)', () => {
  it('WEB_06_en_movil_tocar_un_hueco_abre_un_dialogo', async () => {
    montar([LIBRE_11], { escritorio: false });
    await userEvent.click(screen.getByRole('button', { name: /^11:00 a 12:00/ }));
    const dialogo = screen.getByRole('dialog', { name: /Hueco libre del jueves, 12 de noviembre, 11:00 a 12:00/ });
    expect(within(dialogo).getByRole('heading', { level: 3, name: 'Crear clase' })).toBeTruthy();
    expect(screen.queryByRole('complementary')).toBeNull();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('WEB_06_en_escritorio_las_acciones_van_en_una_columna_al_lado', async () => {
    montar([LIBRE_11, LIBRE_12], { escritorio: true });
    await userEvent.click(screen.getByRole('button', { name: /^11:00 a 12:00/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const columna = screen.getByRole('complementary', { name: /Hueco libre del jueves, 12 de noviembre, 11:00 a 12:00/ });
    expect(within(columna).getByRole('heading', { level: 3, name: 'Crear clase' })).toBeTruthy();
    // La agenda sigue a la vista y el hueco elegido queda marcado.
    expect(screen.getByRole('button', { name: /^11:00 a 12:00/ }).getAttribute('aria-current')).toBe('true');
    await userEvent.click(within(columna).getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('WEB_06_una_clase_ocupada_ofrece_mover_y_cancelar_y_no_bloquear', async () => {
    montar([ocupada({ observacion: 'Trae su mat' })]);
    await userEvent.click(screen.getByRole('button', { name: /^10:00 a 11:00/ }));
    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByRole('button', { name: 'Mover' })).toBeTruthy();
    expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toBeTruthy();
    expect(within(dialogo).queryByRole('button', { name: /Bloquear|Desbloquear/ })).toBeNull();
    expect(within(dialogo).getByText('Trae su mat')).toBeTruthy();
  });
});

describe('accesibilidad (NFR-05, A11Y)', () => {
  it('A11Y_la_agenda_del_panel_no_tiene_violaciones_de_axe', async () => {
    const { container } = montar([
      ocupada({ observacion: 'Trae su mat' }),
      ocupada({ inicio: H11, fin: '2026-11-12T15:00:00Z', clase_id: 'c2', clase_estado: 'pendiente', solicitud_id: 's1' }),
      fila({ inicio: '2026-11-12T15:00:00Z', fin: '2026-11-12T16:00:00Z', estado: 'bloqueado', bloqueo_motivo: 'Vacaciones' }),
      fila({ inicio: '2026-11-12T16:00:00Z', fin: '2026-11-12T17:00:00Z' }),
    ]);
    await sinViolacionesAxe(container);
  });

  it('A11Y_el_dialogo_de_acciones_no_tiene_violaciones_de_axe', async () => {
    montar([ocupada(), LIBRE_11]);
    await userEvent.click(screen.getByRole('button', { name: /^11:00 a 12:00/ }));
    await sinViolacionesAxe(screen.getByRole('dialog'));
  });

  it('A11Y_la_columna_de_escritorio_no_tiene_violaciones_de_axe', async () => {
    const { container } = montar([ocupada(), LIBRE_11], { escritorio: true });
    await userEvent.click(screen.getByRole('button', { name: /^10:00 a 11:00/ }));
    await sinViolacionesAxe(container);
  });
});
