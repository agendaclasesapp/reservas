// @vitest-environment jsdom
// Panel del profesor, «Mover» y «Cancelar» (T09.2): WEB-06, PRF-02, PRF-03, PRF-04, PRF-08, AVI-04, SEC-16; CA-27, F-08.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { sinViolacionesAxe } from '../../ui/soporte';
import { acciones, fallo, H11, H12, LIBRE_11, LIBRE_12, montar, ocupada, fila } from './soporte';

afterEach(cleanup);

// Texto distinto del real a propósito: si la vista lo reescribiera, la prueba fallaría.
const MENSAJE_LOGICA = 'Mensaje que decide la lógica para SOLICITUD_EN_CURSO.';

const SERIE = ocupada({ reserva_tipo: 'serie' });

async function abrirClase() {
  await userEvent.click(screen.getByRole('button', { name: /^10:00 a 11:00/ }));
  return screen.getByRole('dialog');
}

describe('mover una clase (PRF-02, F-08)', () => {
  it('PRF_02_mueve_una_clase_suelta_a_un_horario_libre_y_lo_anuncia', async () => {
    const simuladas = acciones();
    const { onRecargarAgenda } = montar([ocupada(), LIBRE_11], { simuladas });
    const d = await abrirClase();
    await userEvent.click(within(d).getByRole('button', { name: 'Mover' }));

    // Lista los horarios libres del día de destino (solo los libres: el de origen está ocupado).
    expect(within(d).getByLabelText('Día de destino')).toBeTruthy();
    const grupo = await within(d).findByRole('radiogroup', { name: /Horario de destino/ });
    expect(within(grupo).getAllByRole('radio').map((r) => r.parentElement?.textContent)).toEqual(['11:00 a 12:00', '12:00 a 13:00']);
    expect(simuladas.leerDia).toHaveBeenCalledWith('2026-11-12');
    // Una clase suelta no pregunta el alcance (PRF-02).
    expect(within(d).queryByRole('radiogroup', { name: '¿Qué movemos?' })).toBeNull();

    await userEvent.click(within(grupo).getByRole('radio', { name: '11:00 a 12:00' }));
    await userEvent.click(within(d).getByRole('button', { name: 'Mover clase' }));

    await waitFor(() => expect(simuladas.mover).toHaveBeenCalledWith('c1', H11, 'solo_esta'));
    const estado = await screen.findByText('Clase movida al 12/11 11:00');
    expect(estado.closest('[role="status"]')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onRecargarAgenda).toHaveBeenCalledTimes(1);
  });

  it('PRF_02_en_una_serie_ofrece_solo_esta_o_de_aca_en_adelante', async () => {
    const simuladas = acciones();
    montar([SERIE, LIBRE_11], { simuladas });
    const d = await abrirClase();
    await userEvent.click(within(d).getByRole('button', { name: 'Mover' }));
    await within(d).findByRole('radiogroup', { name: /Horario de destino/ });
    const alcance = within(d).getByRole('radiogroup', { name: '¿Qué movemos?' });
    expect((within(alcance).getByRole('radio', { name: 'Solo esta clase' }) as HTMLInputElement).checked).toBe(true);
    await userEvent.click(within(alcance).getByRole('radio', { name: 'De acá en adelante' }));
    await userEvent.click(within(d).getByRole('radio', { name: '12:00 a 13:00' }));
    await userEvent.click(within(d).getByRole('button', { name: 'Mover clase' }));
    await waitFor(() => expect(simuladas.mover).toHaveBeenCalledWith('c1', H12, 'desde_aca'));
    await screen.findByText('Serie movida: la próxima clase pasa al 12/11 12:00');
  });

  it('PRF_02_las_fechas_salteadas_de_una_serie_movida_se_listan', async () => {
    const simuladas = acciones();
    simuladas.mover.mockResolvedValueOnce({ ok: true, clase_id: 'c2', fechas: [H11], salteadas: ['2026-11-19T14:00:00Z'] });
    montar([SERIE, LIBRE_11], { simuladas });
    const d = await abrirClase();
    await userEvent.click(within(d).getByRole('button', { name: 'Mover' }));
    await userEvent.click(await within(d).findByRole('radio', { name: '11:00 a 12:00' }));
    await userEvent.click(within(d).getByRole('button', { name: 'Mover clase' }));
    expect(await screen.findByText('jueves, 19 de noviembre, 11:00')).toBeTruthy();
  });

  it('PRF_02_otro_dia_de_destino_vuelve_a_leer_los_horarios_de_ese_dia', async () => {
    const simuladas = acciones();
    const manana = [fila({ inicio: '2026-11-13T13:00:00Z', fin: '2026-11-13T14:00:00Z' })];
    simuladas.leerDia.mockResolvedValueOnce([LIBRE_11]).mockResolvedValueOnce(manana);
    montar([ocupada(), LIBRE_11], { simuladas });
    const d = await abrirClase();
    await userEvent.click(within(d).getByRole('button', { name: 'Mover' }));
    await within(d).findByRole('radio', { name: '11:00 a 12:00' });
    fireEvent.change(within(d).getByLabelText('Día de destino'), { target: { value: '2026-11-13' } });
    await userEvent.click(await within(d).findByRole('radio', { name: '10:00 a 11:00' }));
    expect(simuladas.leerDia).toHaveBeenLastCalledWith('2026-11-13');
    await userEvent.click(within(d).getByRole('button', { name: 'Mover clase' }));
    await screen.findByText('Clase movida al 13/11 10:00');
  });

  it('PRF_02_un_dia_fuera_del_alcance_se_rechaza_en_el_campo', async () => {
    const simuladas = acciones();
    montar([ocupada()], { simuladas });
    const d = await abrirClase();
    await userEvent.click(within(d).getByRole('button', { name: 'Mover' }));
    await within(d).findByRole('radiogroup', { name: /Horario de destino/ });
    fireEvent.change(within(d).getByLabelText('Día de destino'), { target: { value: '2030-01-01' } });
    expect(within(d).getByText(/Ese día no está disponible/)).toBeTruthy();
    expect(simuladas.leerDia).toHaveBeenCalledTimes(1);
  });

  it('PRF_02_un_dia_sin_horarios_libres_lo_dice', async () => {
    const simuladas = acciones();
    simuladas.leerDia.mockResolvedValue([ocupada()]);
    montar([ocupada()], { simuladas });
    const d = await abrirClase();
    await userEvent.click(within(d).getByRole('button', { name: 'Mover' }));
    expect(await within(d).findByText('No hay horarios libres ese día. Elegí otro día.')).toBeTruthy();
  });

  it('PRF_02_si_falla_la_lectura_del_destino_ofrece_reintentar', async () => {
    const simuladas = acciones();
    simuladas.leerDia.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    montar([ocupada()], { simuladas });
    const d = await abrirClase();
    await userEvent.click(within(d).getByRole('button', { name: 'Mover' }));
    expect((await within(d).findByRole('alert')).textContent).toContain('No se pudieron cargar los horarios libres.');
    await userEvent.click(within(d).getByRole('button', { name: 'Reintentar' }));
    expect(await within(d).findByRole('radio', { name: '11:00 a 12:00' })).toBeTruthy();
  });

  it('PRF_02_sin_elegir_destino_marca_el_campo', async () => {
    const simuladas = acciones();
    simuladas.mover.mockResolvedValueOnce(fallo('DATOS_INVALIDOS', 'Elegí un horario que todavía no pasó, dentro del próximo año.', 'p_destino'));
    montar([ocupada()], { simuladas });
    const d = await abrirClase();
    await userEvent.click(within(d).getByRole('button', { name: 'Mover' }));
    await within(d).findByRole('radiogroup', { name: /Horario de destino/ });
    await userEvent.click(within(d).getByRole('button', { name: 'Mover clase' }));
    expect(await within(d).findByText(/Elegí un horario que todavía no pasó/)).toBeTruthy();
    expect(within(d).getByRole('radiogroup', { name: /Horario de destino/ }).getAttribute('aria-invalid')).toBe('true');
  });

  it('PRF_02_409_SOLICITUD_EN_CURSO_dice_que_primero_se_responde_en_la_lista', async () => {
    const simuladas = acciones();
    simuladas.mover.mockResolvedValueOnce(fallo('SOLICITUD_EN_CURSO', MENSAJE_LOGICA));
    const { onRecargarAgenda } = montar([ocupada(), LIBRE_11], { simuladas });
    const d = await abrirClase();
    await userEvent.click(within(d).getByRole('button', { name: 'Mover' }));
    await userEvent.click(await within(d).findByRole('radio', { name: '11:00 a 12:00' }));
    await userEvent.click(within(d).getByRole('button', { name: 'Mover clase' }));
    const alerta = await within(d).findByRole('alert');
    expect(alerta.textContent).toContain('No se pudo mover; no se cambió nada');
    // La vista muestra el mensaje del fallo tal cual: la lógica es la única fuente del texto.
    expect(alerta.textContent).toContain(MENSAJE_LOGICA);
    expect(within(alerta).getByRole('link', { name: 'Ir a la lista' }).getAttribute('href')).toBe('#/lista');
    expect(onRecargarAgenda).toHaveBeenCalledTimes(1);
  });

  it('PRF_02_409_HUECO_NO_LIBRE_vuelve_a_leer_el_destino_y_pide_elegir_otro', async () => {
    const simuladas = acciones();
    simuladas.mover.mockResolvedValueOnce(fallo('HUECO_NO_LIBRE', 'Ese horario ya no está libre. Elegí otro.'));
    montar([ocupada(), LIBRE_11], { simuladas });
    const d = await abrirClase();
    await userEvent.click(within(d).getByRole('button', { name: 'Mover' }));
    await userEvent.click(await within(d).findByRole('radio', { name: '11:00 a 12:00' }));
    await userEvent.click(within(d).getByRole('button', { name: 'Mover clase' }));
    expect((await within(d).findByRole('alert')).textContent).toContain('Ese horario ya no está libre. Elegí otro.');
    await waitFor(() => expect(simuladas.leerDia).toHaveBeenCalledTimes(2));
    expect((await within(d).findByRole('radio', { name: '11:00 a 12:00' }) as HTMLInputElement).checked).toBe(false);
  });

  it('PRF_08_409_PROFESOR_INACTIVO_muestra_el_motivo', async () => {
    const simuladas = acciones();
    simuladas.mover.mockResolvedValueOnce(fallo('PROFESOR_INACTIVO', 'Tu agenda está inactiva: no podés crear ni mover clases hasta que el Administrador la reactive. Sí podés cancelarlas.'));
    montar([ocupada(), LIBRE_11], { simuladas });
    const d = await abrirClase();
    await userEvent.click(within(d).getByRole('button', { name: 'Mover' }));
    await userEvent.click(await within(d).findByRole('radio', { name: '11:00 a 12:00' }));
    await userEvent.click(within(d).getByRole('button', { name: 'Mover clase' }));
    expect((await within(d).findByRole('alert')).textContent).toContain('Tu agenda está inactiva');
  });

  it('PRF_02_volver_regresa_a_las_acciones_de_la_clase', async () => {
    montar([ocupada()]);
    const d = await abrirClase();
    await userEvent.click(within(d).getByRole('button', { name: 'Mover' }));
    await userEvent.click(within(d).getByRole('button', { name: 'Volver' }));
    expect(within(d).getByRole('button', { name: 'Cancelar' })).toBeTruthy();
    expect(within(d).getByRole('heading', { level: 3, name: 'Elegí qué hacer con la clase' })).toBeTruthy();
  });

  it('A11Y_el_formulario_de_mover_no_tiene_violaciones_de_axe', async () => {
    montar([SERIE, LIBRE_11]);
    const d = await abrirClase();
    await userEvent.click(within(d).getByRole('button', { name: 'Mover' }));
    await within(d).findByRole('radiogroup', { name: /Horario de destino/ });
    await sinViolacionesAxe(d);
  });
});

describe('cancelar una clase (PRF-03, PRF-08, F-08)', () => {
  it('PRF_03_pide_confirmacion_cancela_una_clase_suelta_y_libera_el_hueco', async () => {
    const simuladas = acciones();
    const { onRecargarAgenda } = montar([ocupada()], { simuladas });
    const d = await abrirClase();
    await userEvent.click(within(d).getByRole('button', { name: 'Cancelar' }));
    expect(within(d).getByText('¿Cancelamos la clase de Ana Pérez del 12/11 10:00?')).toBeTruthy();
    expect(simuladas.cancelar).not.toHaveBeenCalled();
    // Suelta: no hay alcance que elegir.
    expect(within(d).queryByRole('radiogroup')).toBeNull();
    await userEvent.click(within(d).getByRole('button', { name: 'Confirmar cancelación' }));

    await waitFor(() => expect(simuladas.cancelar).toHaveBeenCalledWith('c1', 'solo_esta'));
    const estado = await screen.findByText('Clase cancelada: Ana Pérez, 12/11 10:00');
    expect(estado.closest('[role="status"]')).toBeTruthy();
    expect(screen.getByText('El horario quedó libre. Si el titular tiene mail, le avisamos.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onRecargarAgenda).toHaveBeenCalledTimes(1);
  });

  it('PRF_03_en_una_serie_la_confirmacion_pregunta_el_alcance', async () => {
    const simuladas = acciones();
    simuladas.cancelar.mockResolvedValueOnce({ ok: true, canceladas: 5 });
    montar([SERIE], { simuladas });
    const d = await abrirClase();
    await userEvent.click(within(d).getByRole('button', { name: 'Cancelar' }));
    expect(within(d).getByText(/Es parte de una serie\./)).toBeTruthy();
    const alcance = within(d).getByRole('radiogroup', { name: '¿Qué cancelamos?' });
    expect((within(alcance).getByRole('radio', { name: 'Solo esta clase' }) as HTMLInputElement).checked).toBe(true);
    await userEvent.click(within(alcance).getByRole('radio', { name: 'De acá en adelante' }));
    await userEvent.click(within(d).getByRole('button', { name: 'Confirmar cancelación' }));
    await waitFor(() => expect(simuladas.cancelar).toHaveBeenCalledWith('c1', 'desde_aca'));
    await screen.findByText('Se cancelaron 5 clases de Ana Pérez desde el 12/11 10:00');
  });

  it('PRF_03_volver_no_cancela_nada', async () => {
    const simuladas = acciones();
    montar([ocupada()], { simuladas });
    const d = await abrirClase();
    await userEvent.click(within(d).getByRole('button', { name: 'Cancelar' }));
    await userEvent.click(within(d).getByRole('button', { name: 'Volver' }));
    expect(simuladas.cancelar).not.toHaveBeenCalled();
    expect(within(d).getByRole('button', { name: 'Mover' })).toBeTruthy();
  });

  it('PRF_08_con_el_profesor_inactivo_cancelar_funciona', async () => {
    const simuladas = acciones();
    montar([ocupada()], { simuladas, profesorActivo: false });
    const d = await abrirClase();
    await userEvent.click(within(d).getByRole('button', { name: 'Cancelar' }));
    await userEvent.click(within(d).getByRole('button', { name: 'Confirmar cancelación' }));
    await waitFor(() => expect(simuladas.cancelar).toHaveBeenCalledWith('c1', 'solo_esta'));
    await screen.findByText('Clase cancelada: Ana Pérez, 12/11 10:00');
  });

  it('PRF_03_409_SOLICITUD_EN_CURSO_dice_que_primero_se_responde_en_la_lista', async () => {
    const simuladas = acciones();
    simuladas.cancelar.mockResolvedValueOnce(fallo('SOLICITUD_EN_CURSO', MENSAJE_LOGICA));
    montar([ocupada()], { simuladas });
    const d = await abrirClase();
    await userEvent.click(within(d).getByRole('button', { name: 'Cancelar' }));
    await userEvent.click(within(d).getByRole('button', { name: 'Confirmar cancelación' }));
    const alerta = await within(d).findByRole('alert');
    // La vista muestra el mensaje del fallo tal cual: la lógica es la única fuente del texto.
    expect(alerta.textContent).toContain(MENSAJE_LOGICA);
    expect(within(alerta).getByRole('link', { name: 'Ir a la lista' }).getAttribute('href')).toBe('#/lista');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('PRF_03_un_error_general_dice_que_no_se_pudo_y_deja_reintentar', async () => {
    const simuladas = acciones();
    simuladas.cancelar.mockResolvedValueOnce(fallo('SIN_CONEXION', 'No hay conexión. Revisá tu internet y probá de nuevo.'));
    montar([ocupada()], { simuladas });
    const d = await abrirClase();
    await userEvent.click(within(d).getByRole('button', { name: 'Cancelar' }));
    await userEvent.click(within(d).getByRole('button', { name: 'Confirmar cancelación' }));
    const alerta = await within(d).findByRole('alert');
    expect(alerta.textContent).toContain('No se pudo cancelar la clase');
    expect(alerta.textContent).toContain('No hay conexión.');
    expect((within(d).getByRole('button', { name: 'Confirmar cancelación' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('SEC_16_el_nombre_en_la_confirmacion_es_texto', async () => {
    montar([ocupada({ quien_toma: '<b>Ana</b>' })]);
    await userEvent.click(screen.getByRole('button', { name: /^10:00 a 11:00/ }));
    const d = screen.getByRole('dialog');
    await userEvent.click(within(d).getByRole('button', { name: 'Cancelar' }));
    expect(d.querySelector('b')).toBeNull();
    expect(within(d).getByText('¿Cancelamos la clase de <b>Ana</b> del 12/11 10:00?')).toBeTruthy();
  });

  it('A11Y_la_confirmacion_de_cancelar_no_tiene_violaciones_de_axe', async () => {
    montar([SERIE]);
    const d = await abrirClase();
    await userEvent.click(within(d).getByRole('button', { name: 'Cancelar' }));
    await sinViolacionesAxe(d);
  });
});

describe('columna de escritorio (F-07 paso 3)', () => {
  it('WEB_06_mover_y_cancelar_funcionan_igual_en_la_columna', async () => {
    const simuladas = acciones();
    montar([ocupada(), LIBRE_12], { simuladas, escritorio: true });
    await userEvent.click(screen.getByRole('button', { name: /^10:00 a 11:00/ }));
    const columna = screen.getByRole('complementary');
    await userEvent.click(within(columna).getByRole('button', { name: 'Cancelar' }));
    await userEvent.click(within(columna).getByRole('button', { name: 'Confirmar cancelación' }));
    await screen.findByText('Clase cancelada: Ana Pérez, 12/11 10:00');
    expect(screen.queryByRole('complementary')).toBeNull();
  });
});
