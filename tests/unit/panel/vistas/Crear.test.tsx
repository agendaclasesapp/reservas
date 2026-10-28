// @vitest-environment jsdom
// Panel del profesor, «Crear clase» (T09.2): WEB-06, PRF-01, PRF-04, AVI-01, AVI-04, RES-05, SEC-16; CA-27, F-08.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { MENSAJES_PANEL } from '../../../../src/modulos/panel/logica';
import { sinViolacionesAxe } from '../../ui/soporte';
import { acciones, ANA, BRUNO, fallo, H10, H12, LIBRE_11, montar, ocupada } from './soporte';

afterEach(cleanup);

async function abrirCrear() {
  await userEvent.click(screen.getByRole('button', { name: /^11:00 a 12:00/ }));
  return screen.getByRole('dialog');
}

async function elegir(dialogo: HTMLElement, nombre: string | RegExp) {
  await userEvent.click(within(dialogo).getByRole('radio', { name: nombre }));
}

describe('buscador de alumnos (PRF-01, ALU-07)', () => {
  it('PRF_01_ofrece_solo_alumnos_aprobados_o_sin_cuenta_y_marca_los_sin_cuenta', async () => {
    montar([LIBRE_11]);
    const d = await abrirCrear();
    expect(within(d).getByRole('radio', { name: 'Ana Pérez' })).toBeTruthy();
    expect(within(d).getByRole('radio', { name: 'Bruno Díaz (sin cuenta)' })).toBeTruthy();
    // Carla está pendiente de aprobación: no se le crean clases.
    expect(within(d).queryByRole('radio', { name: /Carla/ })).toBeNull();
  });

  it('PRF_01_el_buscador_filtra_sin_distinguir_tildes_ni_mayusculas', async () => {
    montar([LIBRE_11]);
    const d = await abrirCrear();
    await userEvent.type(within(d).getByRole('searchbox', { name: 'Buscar alumno' }), 'PEREZ');
    expect(within(d).getByRole('radio', { name: 'Ana Pérez' })).toBeTruthy();
    expect(within(d).queryByRole('radio', { name: /Bruno/ })).toBeNull();
    await userEvent.clear(within(d).getByRole('searchbox', { name: 'Buscar alumno' }));
    await userEvent.type(within(d).getByRole('searchbox', { name: 'Buscar alumno' }), 'zzz');
    expect(within(d).getByText('Ningún alumno coincide con esa búsqueda.')).toBeTruthy();
  });

  it('PRF_01_el_alumno_elegido_no_desaparece_al_cambiar_la_busqueda', async () => {
    montar([LIBRE_11]);
    const d = await abrirCrear();
    await elegir(d, 'Ana Pérez');
    await userEvent.type(within(d).getByRole('searchbox', { name: 'Buscar alumno' }), 'Bruno');
    expect((within(d).getByRole('radio', { name: 'Ana Pérez' }) as HTMLInputElement).checked).toBe(true);
  });

  it('PRF_01_mientras_cargan_los_alumnos_avisa', async () => {
    montar([LIBRE_11], { alumnos: { estado: 'cargando', alumnos: [], error: null } });
    const d = await abrirCrear();
    expect(within(d).getByText('Cargando tus alumnos…')).toBeTruthy();
  });

  it('PRF_01_si_fallan_los_alumnos_ofrece_reintentar', async () => {
    const { onRecargarAlumnos } = montar([LIBRE_11], { alumnos: { estado: 'error', alumnos: [], error: 'No hay conexión.' } });
    const d = await abrirCrear();
    expect(within(d).getByRole('alert').textContent).toContain('No se pudo cargar tu lista de alumnos. No hay conexión.');
    await userEvent.click(within(d).getByRole('button', { name: 'Reintentar' }));
    expect(onRecargarAlumnos).toHaveBeenCalledTimes(1);
  });

  it('PRF_01_sin_alumnos_aprobados_lo_dice', async () => {
    montar([LIBRE_11], { alumnos: { estado: 'listo', alumnos: [], error: null } });
    const d = await abrirCrear();
    expect(within(d).getByText('Todavía no tenés alumnos aprobados ni sin cuenta')).toBeTruthy();
  });
});

describe('aviso de mail al titular (AVI-04)', () => {
  it('AVI_04_el_aviso_sale_solo_si_el_titular_tiene_mail_y_cuenta', async () => {
    montar([LIBRE_11]);
    const d = await abrirCrear();
    expect(within(d).queryByText('Se enviará un mail al titular')).toBeNull();
    await elegir(d, 'Ana Pérez');
    expect(within(d).getByText('Se enviará un mail al titular')).toBeTruthy();
    // Un alumno sin cuenta no recibe mails (AVI-04): sin mail, sin aviso.
    await elegir(d, 'Bruno Díaz (sin cuenta)');
    expect(within(d).queryByText('Se enviará un mail al titular')).toBeNull();
  });

  it('AVI_04_un_alumno_sin_cuenta_aunque_tenga_mail_cargado_no_recibe_el_aviso', async () => {
    montar([LIBRE_11], {
      alumnos: { estado: 'listo', alumnos: [{ ...BRUNO, mail: 'bruno@correo.test' }], error: null },
    });
    const d = await abrirCrear();
    await elegir(d, 'Bruno Díaz (sin cuenta)');
    expect(within(d).queryByText('Se enviará un mail al titular')).toBeNull();
  });
});

describe('crear una clase suelta o una serie (PRF-01, PRF-04, CA-27)', () => {
  it('PRF_01_crea_una_clase_suelta_para_un_alumno_con_cuenta_y_lo_anuncia', async () => {
    const simuladas = acciones();
    const { onRecargarAgenda } = montar([LIBRE_11], { simuladas });
    const d = await abrirCrear();
    await elegir(d, 'Ana Pérez');
    await userEvent.type(within(d).getByRole('textbox', { name: /Observación/ }), '  Trae su mat  ');
    await userEvent.click(within(d).getByRole('button', { name: 'Crear clase' }));

    await waitFor(() => expect(simuladas.crear).toHaveBeenCalledTimes(1));
    const entrada = simuladas.crear.mock.calls[0]?.[0];
    expect(entrada).toMatchObject({ alumnoId: 'a1', inicio: '2026-11-12T14:00:00Z', tipo: 'suelta', personaACargoId: null });
    expect(entrada?.observacion).toBe('  Trae su mat  ');
    // Anuncio de éxito sobre la agenda, el diálogo se cierra y la agenda se vuelve a leer.
    const estado = await screen.findByText('Clase creada para Ana Pérez el 12/11 11:00');
    expect(estado.closest('[role="status"]')).toBeTruthy();
    expect(screen.getByText('Le avisamos por mail al titular.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onRecargarAgenda).toHaveBeenCalledTimes(1);
  });

  it('PRF_01_CA_27_crea_una_clase_para_un_alumno_sin_cuenta_sin_avisar_por_mail', async () => {
    const simuladas = acciones();
    montar([LIBRE_11], { simuladas });
    const d = await abrirCrear();
    await elegir(d, 'Bruno Díaz (sin cuenta)');
    await userEvent.click(within(d).getByRole('button', { name: 'Crear clase' }));
    await screen.findByText('Clase creada para Bruno Díaz el 12/11 11:00');
    expect(simuladas.crear.mock.calls[0]?.[0]).toMatchObject({ alumnoId: 'a2', tipo: 'suelta' });
    expect(screen.queryByText('Le avisamos por mail al titular.')).toBeNull();
  });

  it('PRF_01_una_serie_pide_la_frecuencia_y_lista_las_fechas_salteadas', async () => {
    const simuladas = acciones();
    simuladas.crear.mockResolvedValueOnce({
      ok: true,
      reserva_id: 'r1',
      fechas: [H10],
      salteadas: ['2026-11-26T14:00:00Z', '2026-12-10T14:00:00Z'],
    });
    montar([LIBRE_11], { simuladas });
    const d = await abrirCrear();
    await elegir(d, 'Ana Pérez');
    expect(within(d).queryByRole('radiogroup', { name: /Frecuencia/ })).toBeNull();
    await elegir(d, 'Serie');
    await elegir(d, 'Quincenal');
    await userEvent.click(within(d).getByRole('button', { name: 'Crear clase' }));
    await screen.findByText('Serie creada para Ana Pérez desde el 12/11 11:00');
    expect(simuladas.crear.mock.calls[0]?.[0]).toMatchObject({ tipo: 'serie', frecuencia: 2 });
    expect(screen.getByText(MENSAJES_PANEL.salteadas)).toBeTruthy();
    expect(screen.getByText('jueves, 26 de noviembre, 11:00')).toBeTruthy();
    expect(screen.getByText('jueves, 10 de diciembre, 11:00')).toBeTruthy();
  });

  it('PRF_01_una_serie_sin_frecuencia_marca_el_campo_y_no_cierra', async () => {
    const simuladas = acciones();
    simuladas.crear.mockResolvedValueOnce(fallo('DATOS_INVALIDOS', MENSAJES_PANEL.frecuenciaRequerida, 'p_frecuencia'));
    montar([LIBRE_11], { simuladas });
    const d = await abrirCrear();
    await elegir(d, 'Ana Pérez');
    await elegir(d, 'Serie');
    await userEvent.click(within(d).getByRole('button', { name: 'Crear clase' }));
    const grupo = await within(d).findByRole('radiogroup', { name: /Frecuencia/ });
    expect(grupo.getAttribute('aria-invalid')).toBe('true');
    expect(within(d).getByText(MENSAJES_PANEL.frecuenciaRequerida)).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('PRF_01_sin_alumno_elegido_marca_el_campo_alumno', async () => {
    const simuladas = acciones();
    simuladas.crear.mockResolvedValueOnce(fallo('DATOS_INVALIDOS', MENSAJES_PANEL.alumnoRequerido));
    montar([LIBRE_11], { simuladas });
    const d = await abrirCrear();
    await userEvent.click(within(d).getByRole('button', { name: 'Crear clase' }));
    expect(await within(d).findByText(MENSAJES_PANEL.alumnoRequerido)).toBeTruthy();
    expect(within(d).getByRole('radiogroup', { name: /Alumno/ }).getAttribute('aria-invalid')).toBe('true');
  });

  it('PRF_01_la_observacion_demasiado_larga_marca_ese_campo', async () => {
    const simuladas = acciones();
    simuladas.crear.mockResolvedValueOnce(fallo('DATOS_INVALIDOS', MENSAJES_PANEL.observacionLarga, 'p_observacion'));
    montar([LIBRE_11], { simuladas });
    const d = await abrirCrear();
    await elegir(d, 'Ana Pérez');
    await userEvent.click(within(d).getByRole('button', { name: 'Crear clase' }));
    const campo = await within(d).findByRole('textbox', { name: /Observación/ });
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(campo.getAttribute('aria-describedby')).toContain('-error');
  });

  it('PRF_01_un_hueco_que_ya_no_esta_libre_dice_el_motivo_y_recarga_la_agenda', async () => {
    const simuladas = acciones();
    simuladas.crear.mockResolvedValueOnce(fallo('HUECO_NO_LIBRE', 'Ese horario ya no está libre. Elegí otro.'));
    const { onRecargarAgenda } = montar([LIBRE_11], { simuladas });
    const d = await abrirCrear();
    await elegir(d, 'Ana Pérez');
    await userEvent.click(within(d).getByRole('button', { name: 'Crear clase' }));
    const alerta = await within(d).findByRole('alert');
    expect(alerta.textContent).toContain('No se pudo crear la clase');
    expect(alerta.textContent).toContain('Ese horario ya no está libre. Elegí otro.');
    expect(onRecargarAgenda).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('PRF_08_si_la_agenda_se_inactivo_mientras_tanto_muestra_el_motivo', async () => {
    const simuladas = acciones();
    simuladas.crear.mockResolvedValueOnce(fallo('PROFESOR_INACTIVO', MENSAJES_PANEL.profesorInactivo));
    montar([LIBRE_11], { simuladas });
    const d = await abrirCrear();
    await elegir(d, 'Ana Pérez');
    await userEvent.click(within(d).getByRole('button', { name: 'Crear clase' }));
    expect((await within(d).findByRole('alert')).textContent).toContain('Tu agenda está inactiva');
  });

  it('PRF_04_no_muestra_ningun_plazo_minimo_de_anticipacion', async () => {
    montar([LIBRE_11]);
    const d = await abrirCrear();
    expect(d.textContent).not.toMatch(/anticipaci/i);
  });
});

describe('quién toma la clase (PRF-01, ALU-06)', () => {
  it('PRF_01_si_el_alumno_tiene_personas_a_cargo_pregunta_quien_toma_la_clase', async () => {
    const simuladas = acciones();
    simuladas.leerPersonasACargo.mockResolvedValue([{ id: 'p1', nombre: 'Lucía Pérez', fecha_nacimiento: null }]);
    montar([LIBRE_11], { simuladas });
    const d = await abrirCrear();
    expect(within(d).queryByRole('radiogroup', { name: '¿Quién toma la clase?' })).toBeNull();
    await elegir(d, 'Ana Pérez');
    const grupo = await within(d).findByRole('radiogroup', { name: '¿Quién toma la clase?' });
    expect((within(grupo).getByRole('radio', { name: 'El titular (Ana Pérez)' }) as HTMLInputElement).checked).toBe(true);
    await userEvent.click(within(grupo).getByRole('radio', { name: 'Lucía Pérez' }));
    await userEvent.click(within(d).getByRole('button', { name: 'Crear clase' }));
    await screen.findByText('Clase creada para Ana Pérez el 12/11 11:00');
    expect(simuladas.crear.mock.calls[0]?.[0]).toMatchObject({ alumnoId: 'a1', personaACargoId: 'p1' });
  });

  it('PRF_01_si_no_se_pueden_leer_las_personas_a_cargo_avisa_y_deja_seguir_con_el_titular', async () => {
    const simuladas = acciones();
    simuladas.leerPersonasACargo.mockRejectedValue(new Error('x'));
    montar([LIBRE_11], { simuladas });
    const d = await abrirCrear();
    await elegir(d, 'Ana Pérez');
    expect(await within(d).findByText(/No pudimos ver si tiene personas a cargo/)).toBeTruthy();
    await userEvent.click(within(d).getByRole('button', { name: 'Crear clase' }));
    await screen.findByText('Clase creada para Ana Pérez el 12/11 11:00');
    expect(simuladas.crear.mock.calls[0]?.[0]?.personaACargoId).toBeNull();
  });
});

describe('accesibilidad del formulario (A11Y)', () => {
  it('A11Y_el_formulario_de_crear_clase_no_tiene_violaciones_de_axe', async () => {
    montar([LIBRE_11, ocupada({ inicio: H12, fin: '2026-11-12T16:00:00Z', clase_id: 'c2' })]);
    const d = await abrirCrear();
    await elegir(d, 'Ana Pérez');
    await elegir(d, 'Serie');
    await sinViolacionesAxe(d);
  });

  it('A11Y_los_nombres_de_los_alumnos_se_muestran_como_texto', async () => {
    montar([LIBRE_11], {
      alumnos: { estado: 'listo', alumnos: [{ ...ANA, nombre: '<img src=x onerror=alert(1)>' }], error: null },
    });
    const d = await abrirCrear();
    expect(d.querySelector('img')).toBeNull();
    expect(within(d).getByRole('radio', { name: '<img src=x onerror=alert(1)>' })).toBeTruthy();
  });
});
