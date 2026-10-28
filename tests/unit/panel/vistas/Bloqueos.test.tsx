// @vitest-environment jsdom
// Panel del profesor, bloquear y desbloquear (T10.2): WEB-06, AGE-05, AGE-06, AGE-10, SEC-16; CA-14 (el bloqueo que
// cubre una clase se rechaza y lista cuáles; uno sobre huecos libres los muestra bloqueados y se quita), CA-52
// (desbloquear un bloqueo ajeno da 404), F-09.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { MENSAJES_BLOQUEO } from '../../../../src/modulos/panel/logica';
import { sinViolacionesAxe } from '../../ui/soporte';
import {
  acciones,
  DIA,
  falloBloqueo,
  fila,
  H10,
  H11,
  H12,
  LIBRE_11,
  montar,
  ocupada,
  ZONA,
} from './soporte';

afterEach(cleanup);

const BLOQUEADA = fila({ estado: 'bloqueado', bloqueo_id: 'b1', bloqueo_motivo: 'Vacaciones' });

async function abrirBloqueoDeHueco() {
  await userEvent.click(screen.getByRole('button', { name: /^11:00 a 12:00/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Bloquear este horario' }));
  return screen.getByRole('dialog');
}

async function abrirBloqueoGlobal() {
  await userEvent.click(screen.getByRole('button', { name: 'Bloquear horarios' }));
  return screen.getByRole('dialog', { name: 'Bloquear horarios' });
}

function instante(iso: string): number {
  return Date.parse(iso);
}

describe('bloquear un hueco (AGE-05, F-09 paso 1)', () => {
  it('AGE_05_un_hueco_libre_ofrece_bloquear_ademas_de_crear_clase', async () => {
    montar([LIBRE_11]);
    await userEvent.click(screen.getByRole('button', { name: /^11:00 a 12:00/ }));
    const d = screen.getByRole('dialog');
    expect(within(d).getByRole('button', { name: 'Crear clase' })).toBeTruthy();
    expect(within(d).getByRole('button', { name: 'Bloquear este horario' })).toBeTruthy();
  });

  it('AGE_05_bloquear_un_hueco_manda_su_horario_y_el_motivo_y_avisa_el_exito', async () => {
    const { simuladas, onRecargarAgenda } = montar([LIBRE_11]);
    const d = await abrirBloqueoDeHueco();
    expect(within(d).getByRole('heading', { name: 'Bloquear el horario' })).toBeTruthy();
    expect(within(d).getByText(/¿Bloqueamos el horario de 11:00 a 12:00 del/)).toBeTruthy();
    await userEvent.type(within(d).getByRole('textbox', { name: 'Motivo (opcional)' }), 'Vacaciones');
    await userEvent.click(within(d).getByRole('button', { name: 'Bloquear' }));

    expect(simuladas.bloquear).toHaveBeenCalledTimes(1);
    expect(simuladas.bloquear).toHaveBeenCalledWith({ desde: H11, hasta: H12, motivo: 'Vacaciones' }, ZONA);
    expect(onRecargarAgenda).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('status').textContent).toContain(MENSAJES_BLOQUEO.bloqueado);
  });

  it('AGE_05_el_motivo_es_opcional_y_se_manda_vacio_sin_motivo', async () => {
    const { simuladas } = montar([LIBRE_11]);
    const d = await abrirBloqueoDeHueco();
    await userEvent.click(within(d).getByRole('button', { name: 'Bloquear' }));
    expect(simuladas.bloquear).toHaveBeenCalledWith({ desde: H11, hasta: H12, motivo: '' }, ZONA);
  });

  it('AGE_05_si_el_motivo_es_largo_el_error_queda_en_el_campo_y_lleva_el_foco', async () => {
    const simuladas = acciones();
    simuladas.bloquear.mockResolvedValueOnce(
      falloBloqueo('DATOS_INVALIDOS', MENSAJES_BLOQUEO.motivoLargo, { campo: 'p_motivo' }),
    );
    montar([LIBRE_11], { simuladas });
    const d = await abrirBloqueoDeHueco();
    await userEvent.click(within(d).getByRole('button', { name: 'Bloquear' }));
    const campo = await within(d).findByRole('textbox', { name: 'Motivo (opcional)' });
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(within(d).getByRole('alert').textContent).toBe(MENSAJES_BLOQUEO.motivoLargo);
    await waitFor(() => expect(document.activeElement).toBe(campo));
  });

  it('AGE_05_volver_regresa_a_las_acciones_del_hueco_libre', async () => {
    const { simuladas } = montar([LIBRE_11]);
    const d = await abrirBloqueoDeHueco();
    await userEvent.click(within(d).getByRole('button', { name: 'Volver' }));
    expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Crear clase' })).toBeTruthy();
    expect(simuladas.bloquear).not.toHaveBeenCalled();
  });

  it('PRF_08_AGE_05_con_la_agenda_inactiva_igual_se_puede_bloquear', async () => {
    montar([LIBRE_11], { profesorActivo: false });
    expect(screen.getByRole('button', { name: 'Bloquear horarios' }).hasAttribute('disabled')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: /^11:00 a 12:00/ }));
    expect(screen.getByRole('button', { name: 'Bloquear este horario' }).hasAttribute('disabled')).toBe(false);
  });

  it('AGE_05_un_hueco_que_ya_paso_no_ofrece_bloquear', () => {
    montar([fila({ pasada: true })]);
    expect(screen.queryByRole('button', { name: /10:00 a 11:00/ })).toBeNull();
  });
});

describe('bloquear un rango de horas o días completos (AGE-05, F-09 paso 1)', () => {
  it('AGE_05_un_rango_de_horas_arma_el_periodo_en_el_huso_del_profesor', async () => {
    const { simuladas } = montar([LIBRE_11]);
    const d = await abrirBloqueoGlobal();
    expect((within(d).getByRole('radio', { name: 'Un rango de horas de un día' }) as HTMLInputElement).checked).toBe(true);
    expect((within(d).getByLabelText('Día (obligatorio)') as HTMLInputElement).value).toBe(DIA);
    await userEvent.type(within(d).getByLabelText(/^Desde/), '09:00');
    await userEvent.type(within(d).getByLabelText(/^Hasta/), '12:00');
    await userEvent.type(within(d).getByRole('textbox', { name: 'Motivo (opcional)' }), 'Congreso');
    await userEvent.click(within(d).getByRole('button', { name: 'Bloquear' }));

    expect(simuladas.bloquear).toHaveBeenCalledTimes(1);
    const [entrada, zona] = simuladas.bloquear.mock.calls[0] ?? [];
    expect(zona).toBe(ZONA);
    // 09:00 y 12:00 de Montevideo (UTC-3) del 12/11.
    expect(instante(entrada?.desde ?? '')).toBe(instante('2026-11-12T12:00:00Z'));
    expect(instante(entrada?.hasta ?? '')).toBe(instante('2026-11-12T15:00:00Z'));
    expect(entrada?.motivo).toBe('Congreso');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('status').textContent).toContain(MENSAJES_BLOQUEO.bloqueado);
  });

  it('AGE_05_el_fin_puede_ser_24_00_y_llega_al_inicio_del_dia_siguiente', async () => {
    const { simuladas } = montar([LIBRE_11]);
    const g = await abrirBloqueoGlobal();
    await userEvent.type(within(g).getByLabelText(/^Desde/), '18:00');
    await userEvent.type(within(g).getByLabelText(/^Hasta/), '24:00');
    await userEvent.click(within(g).getByRole('button', { name: 'Bloquear' }));
    const [entrada] = simuladas.bloquear.mock.calls[0] ?? [];
    expect(instante(entrada?.hasta ?? '')).toBe(instante('2026-11-13T03:00:00Z'));
  });

  it('AGE_05_sin_horas_validas_marca_los_campos_y_no_llama_a_bloquear', async () => {
    const { simuladas } = montar([LIBRE_11]);
    const d = await abrirBloqueoGlobal();
    await userEvent.type(within(d).getByLabelText(/^Desde/), '9');
    await userEvent.click(within(d).getByRole('button', { name: 'Bloquear' }));
    const desde = within(d).getByLabelText(/^Desde/);
    expect(desde.getAttribute('aria-invalid')).toBe('true');
    expect(within(d).getByLabelText(/^Hasta/).getAttribute('aria-invalid')).toBe('true');
    expect(within(d).getByText('Escribí la hora de inicio como HH:MM, por ejemplo 09:00.')).toBeTruthy();
    expect(within(d).getByText('Escribí la hora de fin como HH:MM, por ejemplo 12:00. Puede ser 24:00.')).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(desde));
    expect(simuladas.bloquear).not.toHaveBeenCalled();
  });

  it('AGE_05_si_el_fin_no_es_posterior_al_inicio_el_error_de_la_base_queda_en_Hasta', async () => {
    const simuladas = acciones();
    simuladas.bloquear.mockResolvedValueOnce(
      falloBloqueo('DATOS_INVALIDOS', MENSAJES_BLOQUEO.hastaAntesDeDesde, { campo: 'p_hasta' }),
    );
    montar([LIBRE_11], { simuladas });
    const d = await abrirBloqueoGlobal();
    await userEvent.type(within(d).getByLabelText(/^Desde/), '12:00');
    await userEvent.type(within(d).getByLabelText(/^Hasta/), '09:00');
    await userEvent.click(within(d).getByRole('button', { name: 'Bloquear' }));
    expect((await within(d).findByLabelText(/^Hasta/)).getAttribute('aria-invalid')).toBe('true');
    expect(within(d).getByRole('alert').textContent).toBe(MENSAJES_BLOQUEO.hastaAntesDeDesde);
  });

  it('AGE_05_dias_completos_va_de_las_00_00_del_primero_a_las_00_00_del_siguiente_al_ultimo', async () => {
    const { simuladas } = montar([LIBRE_11]);
    const d = await abrirBloqueoGlobal();
    await userEvent.click(within(d).getByRole('radio', { name: 'Días completos' }));
    expect(within(d).queryByLabelText(/^Desde/)).toBeNull();
    fireEvent.change(within(d).getByLabelText(/^Primer día/), { target: { value: '2026-11-16' } });
    fireEvent.change(within(d).getByLabelText(/^Último día/), { target: { value: '2026-11-20' } });
    await userEvent.click(within(d).getByRole('button', { name: 'Bloquear' }));

    const [entrada, zona] = simuladas.bloquear.mock.calls[0] ?? [];
    expect(zona).toBe(ZONA);
    expect(instante(entrada?.desde ?? '')).toBe(instante('2026-11-16T03:00:00Z'));
    expect(instante(entrada?.hasta ?? '')).toBe(instante('2026-11-21T03:00:00Z'));
  });

  it('AGE_05_al_cambiar_el_primer_dia_el_ultimo_lo_acompana_si_quedaba_antes', async () => {
    montar([LIBRE_11]);
    const d = await abrirBloqueoGlobal();
    await userEvent.click(within(d).getByRole('radio', { name: 'Días completos' }));
    fireEvent.change(within(d).getByLabelText(/^Primer día/), { target: { value: '2026-11-20' } });
    expect((within(d).getByLabelText(/^Último día/) as HTMLInputElement).value).toBe('2026-11-20');
  });

  it('AGE_05_un_ultimo_dia_anterior_al_primero_se_marca_y_no_se_manda', async () => {
    const { simuladas } = montar([LIBRE_11]);
    const d = await abrirBloqueoGlobal();
    await userEvent.click(within(d).getByRole('radio', { name: 'Días completos' }));
    fireEvent.change(within(d).getByLabelText(/^Último día/), { target: { value: '2026-11-10' } });
    await userEvent.click(within(d).getByRole('button', { name: 'Bloquear' }));
    expect(within(d).getByText('El último día tiene que ser el mismo o uno posterior al primero.')).toBeTruthy();
    expect(within(d).getByLabelText(/^Último día/).getAttribute('aria-invalid')).toBe('true');
    expect(simuladas.bloquear).not.toHaveBeenCalled();
  });

  it('AGE_05_un_dia_fuera_del_alcance_de_la_agenda_se_marca_y_no_se_manda', async () => {
    const { simuladas } = montar([LIBRE_11]);
    const d = await abrirBloqueoGlobal();
    await userEvent.click(within(d).getByRole('radio', { name: 'Días completos' }));
    fireEvent.change(within(d).getByLabelText(/^Último día/), { target: { value: '2030-01-01' } });
    await userEvent.click(within(d).getByRole('button', { name: 'Bloquear' }));
    expect(within(d).getByText('Elegí un día.')).toBeTruthy();
    expect(simuladas.bloquear).not.toHaveBeenCalled();
  });

  it('AGE_05_el_tope_de_un_ano_de_la_base_queda_en_el_ultimo_dia_de_dias_completos', async () => {
    const simuladas = acciones();
    simuladas.bloquear.mockResolvedValueOnce(
      falloBloqueo('DATOS_INVALIDOS', MENSAJES_BLOQUEO.hastaInvalido, { campo: 'p_hasta' }),
    );
    montar([LIBRE_11], { simuladas });
    const d = await abrirBloqueoGlobal();
    await userEvent.click(within(d).getByRole('radio', { name: 'Días completos' }));
    await userEvent.click(within(d).getByRole('button', { name: 'Bloquear' }));
    expect((await within(d).findByLabelText(/^Último día/)).getAttribute('aria-invalid')).toBe('true');
    expect(within(d).getByRole('alert').textContent).toBe(MENSAJES_BLOQUEO.hastaInvalido);
  });
});

describe('el bloqueo cubre una clase (409, CA-14, AGE-05, F-09 paso 2)', () => {
  const CONFLICTOS = [
    { clase_id: 'c1', inicio: H10, estado: 'confirmada' as const, alumno: 'Ana Pérez' },
    { clase_id: 'c2', inicio: H12, estado: 'pendiente' as const, alumno: null },
  ];

  async function conConflictos() {
    const simuladas = acciones();
    simuladas.bloquear.mockResolvedValueOnce(
      falloBloqueo('BLOQUEO_CON_RESERVAS', MENSAJES_BLOQUEO.conReservas, { conflictos: CONFLICTOS }),
    );
    const r = montar([ocupada(), LIBRE_11], { simuladas });
    const d = await abrirBloqueoGlobal();
    await userEvent.type(within(d).getByLabelText(/^Desde/), '09:00');
    await userEvent.type(within(d).getByLabelText(/^Hasta/), '13:00');
    await userEvent.click(within(d).getByRole('button', { name: 'Bloquear' }));
    return { ...r, d, alerta: await within(d).findByRole('alert') };
  }

  it('CA_14_AGE_05_el_rechazo_dice_por_que_y_lista_fecha_hora_alumno_y_estado_de_cada_clase', async () => {
    const { d, alerta } = await conConflictos();
    expect(alerta.textContent).toContain(MENSAJES_BLOQUEO.conReservas);
    const lista = within(d).getByRole('list', { name: 'Clases que impiden el bloqueo' });
    const items = within(lista).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain('10:00');
    expect(items[0]?.textContent).toContain('Ana Pérez');
    expect(items[0]?.textContent).toContain('Confirmada');
    expect(items[1]?.textContent).toContain('12:00');
    expect(items[1]?.textContent).toContain(MENSAJES_BLOQUEO.alumnoDadoDeBaja);
    expect(items[1]?.textContent).toContain('Pendiente de respuesta');
  });

  it('CA_14_cada_clase_en_conflicto_es_un_enlace_al_dia_en_el_panel_y_seguirlo_cierra_el_dialogo', async () => {
    const { d } = await conConflictos();
    const enlace = within(d).getByRole('link', { name: /10:00 · Ana Pérez · Confirmada/ });
    expect(enlace.getAttribute('href')).toBe('#/panel?d=2026-11-12');
    expect(enlace.textContent).toContain('(ver ese día en el panel)');
    await userEvent.click(enlace);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('CA_14_el_rechazo_lleva_el_foco_al_aviso_y_no_recarga_la_agenda', async () => {
    const { d, onRecargarAgenda } = await conConflictos();
    const lista = within(d).getByRole('list', { name: 'Clases que impiden el bloqueo' });
    await waitFor(() => expect(document.activeElement?.contains(lista)).toBe(true));
    expect(onRecargarAgenda).not.toHaveBeenCalled();
    // El formulario sigue abierto para corregir el período.
    expect(within(d).getByRole('button', { name: 'Bloquear' })).toBeTruthy();
  });

  it('SEC_16_el_nombre_del_alumno_en_conflicto_se_muestra_como_texto', async () => {
    const simuladas = acciones();
    simuladas.bloquear.mockResolvedValueOnce(
      falloBloqueo('BLOQUEO_CON_RESERVAS', MENSAJES_BLOQUEO.conReservas, {
        conflictos: [{ clase_id: 'c1', inicio: H10, estado: 'confirmada', alumno: '<img src=x onerror=alert(1)>' }],
      }),
    );
    montar([LIBRE_11], { simuladas });
    const d = await abrirBloqueoGlobal();
    await userEvent.type(within(d).getByLabelText(/^Desde/), '09:00');
    await userEvent.type(within(d).getByLabelText(/^Hasta/), '13:00');
    await userEvent.click(within(d).getByRole('button', { name: 'Bloquear' }));
    const alerta = await within(d).findByRole('alert');
    expect(alerta.querySelector('img')).toBeNull();
    expect(alerta.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('CA_14_otro_error_de_la_base_se_muestra_con_su_mensaje', async () => {
    const simuladas = acciones();
    simuladas.bloquear.mockResolvedValueOnce(falloBloqueo('SIN_CONEXION', 'No hay conexión. Probá de nuevo.'));
    montar([LIBRE_11], { simuladas });
    const d = await abrirBloqueoGlobal();
    await userEvent.type(within(d).getByLabelText(/^Desde/), '09:00');
    await userEvent.type(within(d).getByLabelText(/^Hasta/), '10:00');
    await userEvent.click(within(d).getByRole('button', { name: 'Bloquear' }));
    expect((await within(d).findByRole('alert')).textContent).toContain('No hay conexión. Probá de nuevo.');
    expect(within(d).queryByRole('list', { name: 'Clases que impiden el bloqueo' })).toBeNull();
  });
});

describe('desbloquear (AGE-06, CA-14, CA-52, F-09 paso 3)', () => {
  async function abrirDesbloqueo() {
    await userEvent.click(screen.getByRole('button', { name: /^10:00 a 11:00/ }));
    return screen.getByRole('dialog');
  }

  it('AGE_06_el_hueco_bloqueado_muestra_su_horario_el_motivo_y_avisa_que_el_bloqueo_puede_cubrir_mas', async () => {
    montar([BLOQUEADA]);
    const d = await abrirDesbloqueo();
    expect(within(d).getByRole('heading', { name: 'Desbloquear el horario' })).toBeTruthy();
    expect(within(d).getByText('10:00 a 11:00')).toBeTruthy();
    expect(within(d).getByText('Vacaciones')).toBeTruthy();
    expect(within(d).getByText(/Al desbloquear, este horario y todos los que cubre el mismo bloqueo/)).toBeTruthy();
    expect(within(d).queryByRole('button', { name: 'Crear clase' })).toBeNull();
  });

  it('AGE_06_desbloquear_manda_el_id_del_bloqueo_recarga_la_agenda_y_avisa', async () => {
    const { simuladas, onRecargarAgenda } = montar([BLOQUEADA]);
    const d = await abrirDesbloqueo();
    await userEvent.click(within(d).getByRole('button', { name: 'Desbloquear' }));
    expect(simuladas.desbloquear).toHaveBeenCalledWith('b1');
    expect(onRecargarAgenda).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('status').textContent).toContain(MENSAJES_BLOQUEO.desbloqueado);
  });

  it('CA_52_un_bloqueo_que_ya_no_es_suyo_o_no_existe_da_404_se_explica_y_se_recarga', async () => {
    const simuladas = acciones();
    simuladas.desbloquear.mockResolvedValueOnce(
      falloBloqueo('NO_ENCONTRADO', MENSAJES_BLOQUEO.bloqueoNoEncontrado),
    );
    const { onRecargarAgenda } = montar([BLOQUEADA], { simuladas });
    const d = await abrirDesbloqueo();
    await userEvent.click(within(d).getByRole('button', { name: 'Desbloquear' }));
    expect((await within(d).findByRole('alert')).textContent).toContain(MENSAJES_BLOQUEO.bloqueoNoEncontrado);
    expect(onRecargarAgenda).toHaveBeenCalled();
  });

  it('AGE_06_en_escritorio_el_desbloqueo_va_en_la_columna_con_su_titulo', async () => {
    montar([BLOQUEADA], { escritorio: true });
    await userEvent.click(screen.getByRole('button', { name: /^10:00 a 11:00/ }));
    const columna = screen.getByRole('complementary');
    expect(within(columna).getByRole('heading', { level: 2, name: /^Horario bloqueado del/ })).toBeTruthy();
    expect(within(columna).getByRole('button', { name: 'Desbloquear' })).toBeTruthy();
  });

  it('SEC_16_el_motivo_del_bloqueo_se_muestra_como_texto', async () => {
    montar([fila({ estado: 'bloqueado', bloqueo_id: 'b1', bloqueo_motivo: '<b>x</b>' })]);
    const d = await abrirDesbloqueo();
    expect(d.querySelector('b')).toBeNull();
    expect(within(d).getByText('<b>x</b>')).toBeTruthy();
  });
});

describe('accesibilidad de los bloqueos (A11Y-20, A11Y-21, A11Y-24)', () => {
  it('A11Y_el_dialogo_de_bloquear_horarios_no_tiene_violaciones_de_axe', async () => {
    montar([LIBRE_11]);
    const d = await abrirBloqueoGlobal();
    await sinViolacionesAxe(d);
    await userEvent.click(within(d).getByRole('radio', { name: 'Días completos' }));
    await sinViolacionesAxe(d);
  });

  it('A11Y_el_formulario_de_bloquear_un_hueco_no_tiene_violaciones_de_axe', async () => {
    montar([LIBRE_11]);
    const d = await abrirBloqueoDeHueco();
    await sinViolacionesAxe(d);
  });

  it('A11Y_el_formulario_con_errores_de_campo_y_con_conflictos_no_tiene_violaciones_de_axe', async () => {
    const simuladas = acciones();
    simuladas.bloquear.mockResolvedValueOnce(
      falloBloqueo('BLOQUEO_CON_RESERVAS', MENSAJES_BLOQUEO.conReservas, {
        conflictos: [{ clase_id: 'c1', inicio: H10, estado: 'confirmada', alumno: 'Ana Pérez' }],
      }),
    );
    montar([LIBRE_11], { simuladas });
    const d = await abrirBloqueoGlobal();
    await userEvent.click(within(d).getByRole('button', { name: 'Bloquear' }));
    await sinViolacionesAxe(d);
    await userEvent.type(within(d).getByLabelText(/^Desde/), '09:00');
    await userEvent.type(within(d).getByLabelText(/^Hasta/), '13:00');
    await userEvent.click(within(d).getByRole('button', { name: 'Bloquear' }));
    await within(d).findByRole('list', { name: 'Clases que impiden el bloqueo' });
    await sinViolacionesAxe(d);
  });

  it('A11Y_el_dialogo_de_desbloquear_y_la_agenda_con_un_bloqueo_no_tienen_violaciones_de_axe', async () => {
    const { container } = montar([BLOQUEADA, LIBRE_11]);
    await sinViolacionesAxe(container);
    await userEvent.click(screen.getByRole('button', { name: /^10:00 a 11:00/ }));
    await sinViolacionesAxe(screen.getByRole('dialog'));
  });
});
