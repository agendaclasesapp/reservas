// @vitest-environment jsdom
// Configuración de la agenda del profesor (T10.2): WEB-08, AGE-01, AGE-02, AGE-03, AGE-04, AGE-08, AGE-10, CA-11
// (vista previa de huecos), CA-12 (cambiar la duración no mueve clases: el aviso), CA-16 (advertencia de cambio de
// huso), SEC-09 (límites 0 a 8784 h y 1 a 1440 min), F-14. La lógica (`useConfiguracionAgenda`) se simula: acá se
// prueba la presentación, con roles y nombres accesibles.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MENSAJES_CONFIGURACION,
  type ConfiguracionAgenda,
  type ResultadoConfiguracion,
  type ResultadoGrilla,
  type TramoGrilla,
} from '../../../../src/modulos/configuracion/logica';
import {
  VistaConfiguracionAgenda,
  type VistaConfiguracionAgendaProps,
} from '../../../../src/modulos/configuracion/vistas/VistaConfiguracionAgenda';
import { sinViolacionesAxe } from '../../ui/soporte';

vi.mock('../../../../src/modulos/configuracion/logica', async (importarOriginal) => ({
  ...(await importarOriginal<object>()),
  // Con los ~400 husos reales axe tarda segundos por prueba en jsdom: acá basta una lista corta.
  zonasHorarias: (actual: string | null) =>
    [...new Set([actual ?? 'America/Montevideo', 'America/Argentina/Buenos_Aires', 'Europe/Madrid'])].sort(),
}));

afterEach(cleanup);

const CONFIG: ConfiguracionAgenda = {
  zona_horaria: 'America/Montevideo',
  duracion_min: 60,
  anticipacion_horas: 24,
  horizonte_semanas: 26,
};

/** AGE-01: valor inicial, lunes a viernes de 08:00 a 13:00 y de 14:00 a 18:00. */
const GRILLA: TramoGrilla[] = ([1, 2, 3, 4, 5] as const).flatMap((d) => [
  { dia_semana: d, desde: '08:00', hasta: '13:00' },
  { dia_semana: d, desde: '14:00', hasta: '18:00' },
]);

function resultadoConfig(extra: Partial<ConfiguracionAgenda> = {}): ResultadoConfiguracion {
  return { ok: true, ...CONFIG, ...extra };
}

function montar(extra: Partial<VistaConfiguracionAgendaProps> = {}) {
  const onRecargar = vi.fn();
  const onGuardarConfiguracion = vi.fn<VistaConfiguracionAgendaProps['onGuardarConfiguracion']>((entrada) =>
    Promise.resolve(
      resultadoConfig({
        duracion_min: entrada.duracionMin,
        anticipacion_horas: entrada.anticipacionHoras,
        zona_horaria: entrada.zonaHoraria,
      }),
    ),
  );
  const onGuardarGrilla = vi.fn<VistaConfiguracionAgendaProps['onGuardarGrilla']>((tramos) =>
    Promise.resolve<ResultadoGrilla>({ ok: true, grilla: [...tramos] }),
  );
  const props: VistaConfiguracionAgendaProps = {
    lectura: { estado: 'listo', datos: { config: CONFIG, grilla: GRILLA }, error: null },
    onRecargar,
    onGuardarConfiguracion,
    onGuardarGrilla,
    ...extra,
  };
  const r = render(<VistaConfiguracionAgenda {...props} />);
  return { ...r, onRecargar, onGuardarConfiguracion, onGuardarGrilla };
}

const region = (nombre: string) => screen.getByRole('region', { name: nombre });

describe('estados de la pantalla (WEB-08, F-14)', () => {
  it('WEB_08_cargando_avisa_con_un_indicador_y_no_muestra_formularios', async () => {
    const { container } = montar({ lectura: { estado: 'cargando', datos: null, error: null } });
    expect(screen.getByText('Cargando la configuración de tu agenda…')).toBeTruthy();
    expect(screen.queryByRole('region')).toBeNull();
    await sinViolacionesAxe(container);
  });

  it('WEB_08_si_falla_la_lectura_dice_que_paso_y_ofrece_reintentar', async () => {
    const { container, onRecargar } = montar({ lectura: { estado: 'error', datos: null, error: 'Sin conexión.' } });
    expect(screen.getByRole('alert').textContent).toContain('No se pudo cargar la configuración de tu agenda. Sin conexión.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRecargar).toHaveBeenCalledTimes(1);
    await sinViolacionesAxe(container);
  });

  it('WEB_08_si_falla_una_recarga_conserva_lo_que_habia_y_avisa', async () => {
    const { container, onRecargar } = montar({
      lectura: { estado: 'error', datos: { config: CONFIG, grilla: GRILLA }, error: 'Sin conexión.' },
    });
    expect(screen.getAllByRole('status')[0]?.textContent).toContain('No se pudo actualizar la configuración.');
    expect(region('Grilla semanal')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRecargar).toHaveBeenCalledTimes(1);
    await sinViolacionesAxe(container);
  });

  it('WEB_08_listo_muestra_grilla_duracion_anticipacion_y_huso_con_lo_guardado', async () => {
    const { container } = montar();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Grilla semanal',
      'Duración de clase',
      'Anticipación mínima',
      'Huso horario',
    ]);
    expect((screen.getByRole('textbox', { name: /^Duración de la clase \(minutos\)/ }) as HTMLInputElement).value).toBe('60');
    expect((screen.getByRole('textbox', { name: /^Anticipación mínima \(horas\)/ }) as HTMLInputElement).value).toBe('24');
    expect((screen.getByRole('combobox', { name: 'Huso horario' }) as HTMLSelectElement).value).toBe('America/Montevideo');
    expect((screen.getByRole('textbox', { name: 'Inicio del tramo 1 del lunes' }) as HTMLInputElement).value).toBe('08:00');
    expect((screen.getByRole('textbox', { name: 'Fin del tramo 2 del viernes' }) as HTMLInputElement).value).toBe('18:00');
    await sinViolacionesAxe(container);
  });
});

describe('grilla semanal (AGE-01, CA-11, F-14)', () => {
  it('AGE_01_cada_dia_es_un_grupo_con_sus_tramos_y_los_dias_sin_tramo_lo_dicen', () => {
    montar();
    const sabado = screen.getByRole('group', { name: 'Sábado' });
    expect(within(sabado).getByText('Sin tramos: este día no ofrecés horarios.')).toBeTruthy();
    expect(within(sabado).getByRole('button', { name: 'Agregar tramo del sábado' })).toBeTruthy();
    const lunes = screen.getByRole('group', { name: 'Lunes' });
    expect(within(lunes).getAllByRole('listitem')).toHaveLength(2);
    expect(within(lunes).getByRole('button', { name: 'Quitar tramo 08:00-13:00 del lunes' })).toBeTruthy();
  });

  it('CA_11_la_vista_previa_cuenta_los_huecos_de_cada_dia_con_la_duracion_guardada', () => {
    montar();
    const previa = screen.getByRole('list', { name: 'Huecos por día' });
    expect(within(previa).getByText('Lunes: 9 huecos')).toBeTruthy();
    expect(within(previa).getByText('Viernes: 9 huecos')).toBeTruthy();
    expect(within(previa).getByText('Sábado: sin huecos')).toBeTruthy();
    expect(within(previa).getByText('Domingo: sin huecos')).toBeTruthy();
    // Se anuncia al editar: región de cortesía.
    expect(previa.parentElement?.getAttribute('aria-live')).toBe('polite');
  });

  it('CA_11_AGE_02_la_vista_previa_se_actualiza_al_editar_la_duracion_y_un_resto_no_genera_hueco', async () => {
    montar();
    const duracion = screen.getByRole('textbox', { name: /^Duración de la clase/ });
    await userEvent.clear(duracion);
    await userEvent.type(duracion, '30');
    expect(screen.getByText('Lunes: 18 huecos')).toBeTruthy();
    await userEvent.clear(duracion);
    await userEvent.type(duracion, '90');
    // 08:00-13:00 = 300 min -> 3 huecos; 14:00-18:00 = 240 min -> 2 huecos (el resto de 60 min no genera hueco).
    expect(screen.getByText('Lunes: 5 huecos')).toBeTruthy();
    // Con un texto que no es duración, la vista previa sigue con la guardada.
    await userEvent.clear(duracion);
    await userEvent.type(duracion, 'abc');
    expect(screen.getByText('Lunes: 9 huecos')).toBeTruthy();
  });

  it('CA_11_la_vista_previa_se_actualiza_al_agregar_un_tramo_y_dice_hueco_en_singular', async () => {
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Agregar tramo del sábado' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Inicio del tramo 1 del sábado' }), '10:00');
    await userEvent.type(screen.getByRole('textbox', { name: 'Fin del tramo 1 del sábado' }), '11:00');
    expect(screen.getByText('Sábado: 1 hueco')).toBeTruthy();
  });

  it('AGE_03_CA_12_la_grilla_avisa_que_cambiarla_no_mueve_clases_ni_pedidos', () => {
    montar();
    expect(within(region('Grilla semanal')).getByText(MENSAJES_CONFIGURACION.sinEfectoEnClases)).toBeTruthy();
  });

  it('AGE_01_guardar_manda_todos_los_tramos_y_anuncia_el_exito', async () => {
    const { onGuardarGrilla } = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar grilla' }));
    expect(onGuardarGrilla).toHaveBeenCalledTimes(1);
    expect(onGuardarGrilla.mock.calls[0]?.[0]).toEqual(GRILLA);
    expect(await within(region('Grilla semanal')).findByText(MENSAJES_CONFIGURACION.grillaGuardada)).toBeTruthy();
    expect(within(region('Grilla semanal')).getByRole('status').textContent).toBe(MENSAJES_CONFIGURACION.grillaGuardada);
  });

  it('AGE_01_se_puede_quitar_un_tramo_y_agregar_otro_en_un_dia_con_o_sin_tramos', async () => {
    const { onGuardarGrilla } = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Quitar tramo 14:00-18:00 del lunes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Agregar tramo del domingo' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Inicio del tramo 1 del domingo' }), '09:00');
    await userEvent.type(screen.getByRole('textbox', { name: 'Fin del tramo 1 del domingo' }), '24:00');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar grilla' }));
    const mandados = onGuardarGrilla.mock.calls[0]?.[0] ?? [];
    expect(mandados).toHaveLength(10);
    expect(mandados).not.toContainEqual({ dia_semana: 1, desde: '14:00', hasta: '18:00' });
    expect(mandados).toContainEqual({ dia_semana: 7, desde: '09:00', hasta: '24:00' });
  });

  it('AGE_01_se_puede_vaciar_un_dia_entero', async () => {
    const { onGuardarGrilla } = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Quitar tramo 14:00-18:00 del viernes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Quitar tramo 08:00-13:00 del viernes' }));
    expect(within(screen.getByRole('group', { name: 'Viernes' })).getByText('Sin tramos: este día no ofrecés horarios.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar grilla' }));
    expect(onGuardarGrilla.mock.calls[0]?.[0]).toHaveLength(8);
  });

  it('AGE_01_un_tramo_vacio_marca_sus_campos_lleva_el_foco_y_no_llama_a_guardar', async () => {
    const { onGuardarGrilla } = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Agregar tramo del sábado' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar grilla' }));
    const inicio = screen.getByRole('textbox', { name: 'Inicio del tramo 1 del sábado' });
    expect(inicio.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('textbox', { name: 'Fin del tramo 1 del sábado' }).getAttribute('aria-invalid')).toBe('true');
    expect(inicio.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(inicio.getAttribute('aria-describedby') ?? '')?.textContent).toBe(MENSAJES_CONFIGURACION.tramo.hora);
    expect(screen.getByRole('alert').textContent).toContain(MENSAJES_CONFIGURACION.grillaInvalida);
    await waitFor(() => expect(document.activeElement).toBe(inicio));
    expect(onGuardarGrilla).not.toHaveBeenCalled();
  });

  it('AGE_01_dos_tramos_que_se_superponen_marcan_el_segundo_y_el_fin_antes_del_inicio_tambien', async () => {
    const { onGuardarGrilla } = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Agregar tramo del lunes' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Inicio del tramo 3 del lunes' }), '12:00');
    await userEvent.type(screen.getByRole('textbox', { name: 'Fin del tramo 3 del lunes' }), '15:00');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar tramo del martes' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Inicio del tramo 3 del martes' }), '20:00');
    await userEvent.type(screen.getByRole('textbox', { name: 'Fin del tramo 3 del martes' }), '19:00');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar grilla' }));
    const solapado = screen.getByRole('textbox', { name: 'Inicio del tramo 3 del lunes' });
    expect(document.getElementById(solapado.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      MENSAJES_CONFIGURACION.tramo.solape,
    );
    const invertido = screen.getByRole('textbox', { name: 'Inicio del tramo 3 del martes' });
    expect(document.getElementById(invertido.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      MENSAJES_CONFIGURACION.tramo.orden,
    );
    expect(screen.getByRole('textbox', { name: 'Inicio del tramo 1 del lunes' }).getAttribute('aria-invalid')).toBeNull();
    expect(onGuardarGrilla).not.toHaveBeenCalled();
  });

  it('AGE_01_corregir_el_tramo_permite_guardar_y_borra_el_error', async () => {
    const { onGuardarGrilla } = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Agregar tramo del sábado' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar grilla' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Inicio del tramo 1 del sábado' }), '10:00');
    await userEvent.type(screen.getByRole('textbox', { name: 'Fin del tramo 1 del sábado' }), '12:00');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar grilla' }));
    expect(onGuardarGrilla).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('AGE_01_el_boton_agregar_se_deshabilita_con_50_tramos', () => {
    const muchos: TramoGrilla[] = Array.from({ length: 50 }, (_, i) => ({
      dia_semana: ((i % 7) + 1) as TramoGrilla['dia_semana'],
      desde: `${String(Math.floor(i / 7) * 2).padStart(2, '0')}:00`,
      hasta: `${String(Math.floor(i / 7) * 2 + 1).padStart(2, '0')}:00`,
    }));
    montar({ lectura: { estado: 'listo', datos: { config: CONFIG, grilla: muchos }, error: null } });
    expect(screen.getByRole('button', { name: 'Agregar tramo del lunes' }).hasAttribute('disabled')).toBe(true);
  });

  it('AGE_01_si_la_base_rechaza_la_grilla_muestra_su_mensaje_y_no_dice_que_se_guardo', async () => {
    const { onGuardarGrilla } = montar();
    onGuardarGrilla.mockResolvedValueOnce({
      ok: false,
      codigo: 'SIN_CONEXION',
      mensaje: 'No hay conexión con el servidor. Revisá tu conexión y probá de nuevo.',
      campo: null,
      validacion: null,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar grilla' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('No se pudo guardar la grilla');
    expect(alerta.textContent).toContain('No hay conexión con el servidor.');
    expect(within(region('Grilla semanal')).getByRole('status').textContent).toBe('');
  });

  it('AGE_01_mientras_guarda_el_boton_dice_Guardando_y_no_envia_dos_veces', async () => {
    let terminar: (r: ResultadoGrilla) => void = () => undefined;
    const { onGuardarGrilla } = montar();
    onGuardarGrilla.mockReturnValueOnce(new Promise<ResultadoGrilla>((resolver) => (terminar = resolver)));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar grilla' }));
    const boton = await screen.findByRole('button', { name: 'Guardando…' });
    expect(boton.getAttribute('aria-busy')).toBe('true');
    await userEvent.click(boton);
    expect(onGuardarGrilla).toHaveBeenCalledTimes(1);
    terminar({ ok: true, grilla: GRILLA });
    expect(await screen.findByRole('button', { name: 'Guardar grilla' })).toBeTruthy();
  });

  it('A11Y_la_grilla_con_errores_no_tiene_violaciones_de_axe', async () => {
    const { container } = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Agregar tramo del sábado' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar grilla' }));
    await sinViolacionesAxe(container);
  });
});

describe('duración de clase (AGE-02, AGE-03, CA-12, SEC-09)', () => {
  const duracion = () => screen.getByRole('textbox', { name: /^Duración de la clase/ });

  it('CA_12_AGE_03_la_duracion_avisa_que_las_clases_y_pedidos_conservan_su_horario', () => {
    montar();
    expect(within(region('Duración de clase')).getByText(MENSAJES_CONFIGURACION.sinEfectoEnClases)).toBeTruthy();
  });

  it('AGE_02_guardar_manda_la_duracion_editada_y_lo_guardado_de_lo_demas', async () => {
    const { onGuardarConfiguracion } = montar();
    await userEvent.clear(duracion());
    await userEvent.type(duracion(), '45');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar duración' }));
    expect(onGuardarConfiguracion).toHaveBeenCalledWith({
      duracionMin: 45,
      anticipacionHoras: 24,
      zonaHoraria: 'America/Montevideo',
    });
    expect(await within(region('Duración de clase')).findByText(MENSAJES_CONFIGURACION.guardada)).toBeTruthy();
  });

  it('AGE_02_Enter_en_el_campo_guarda', async () => {
    const { onGuardarConfiguracion } = montar();
    await userEvent.clear(duracion());
    await userEvent.type(duracion(), '30{Enter}');
    expect(onGuardarConfiguracion).toHaveBeenCalledWith(expect.objectContaining({ duracionMin: 30 }));
  });

  it.each([['0'], ['1441'], ['abc'], ['1.5'], ['']])(
    'SEC_09_la_duracion_%j_se_marca_en_el_campo_y_no_se_manda',
    async (valor) => {
      const { onGuardarConfiguracion } = montar();
      await userEvent.clear(duracion());
      if (valor) await userEvent.type(duracion(), valor);
      await userEvent.click(screen.getByRole('button', { name: 'Guardar duración' }));
      expect(duracion().getAttribute('aria-invalid')).toBe('true');
      expect(within(region('Duración de clase')).getByRole('alert').textContent).toBe(MENSAJES_CONFIGURACION.duracionInvalida);
      expect(onGuardarConfiguracion).not.toHaveBeenCalled();
    },
  );

  it('SEC_09_los_extremos_1_y_1440_pasan', async () => {
    const { onGuardarConfiguracion } = montar();
    for (const valor of ['1', '1440']) {
      await userEvent.clear(duracion());
      await userEvent.type(duracion(), valor);
      await userEvent.click(screen.getByRole('button', { name: 'Guardar duración' }));
    }
    expect(onGuardarConfiguracion.mock.calls.map(([e]) => e.duracionMin)).toEqual([1, 1440]);
  });

  it('AGE_02_si_la_base_marca_la_duracion_el_error_queda_en_el_campo', async () => {
    const { onGuardarConfiguracion } = montar();
    onGuardarConfiguracion.mockResolvedValueOnce({
      ok: false,
      codigo: 'DATOS_INVALIDOS',
      mensaje: MENSAJES_CONFIGURACION.duracionInvalida,
      campo: 'p_duracion_min',
    });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar duración' }));
    await waitFor(() => expect(duracion().getAttribute('aria-invalid')).toBe('true'));
  });

  it('AGE_02_un_error_general_de_la_base_se_muestra_como_aviso_de_la_seccion', async () => {
    const { onGuardarConfiguracion } = montar();
    onGuardarConfiguracion.mockResolvedValueOnce({
      ok: false,
      codigo: 'PROHIBIDO',
      mensaje: 'No tenés permiso para hacer esto.',
      campo: null,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar duración' }));
    const alerta = await within(region('Duración de clase')).findByRole('alert');
    expect(alerta.textContent).toContain('No tenés permiso para hacer esto.');
    expect(duracion().getAttribute('aria-invalid')).toBeNull();
  });

  it('A11Y_la_duracion_con_error_no_tiene_violaciones_de_axe', async () => {
    const { container } = montar();
    await userEvent.clear(duracion());
    await userEvent.click(screen.getByRole('button', { name: 'Guardar duración' }));
    await sinViolacionesAxe(container);
  });
});

describe('anticipación mínima (AGE-04, PRF-04, CA-13, SEC-09)', () => {
  const anticipacion = () => screen.getByRole('textbox', { name: /^Anticipación mínima \(horas\)/ });

  it('AGE_04_PRF_04_explica_que_el_alumno_no_puede_pedir_antes_del_plazo_y_el_profesor_si_crear', () => {
    montar();
    expect(
      within(region('Anticipación mínima')).getByText(
        'Un alumno no puede pedir una clase que empieza antes de este plazo. Vos sí podés crearla.',
      ),
    ).toBeTruthy();
  });

  it('AGE_04_guardar_manda_la_anticipacion_editada', async () => {
    const { onGuardarConfiguracion } = montar();
    await userEvent.clear(anticipacion());
    await userEvent.type(anticipacion(), '48');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar anticipación' }));
    expect(onGuardarConfiguracion).toHaveBeenCalledWith({
      duracionMin: 60,
      anticipacionHoras: 48,
      zonaHoraria: 'America/Montevideo',
    });
    expect(await within(region('Anticipación mínima')).findByText(MENSAJES_CONFIGURACION.guardada)).toBeTruthy();
  });

  it('SEC_09_los_extremos_0_y_8784_pasan', async () => {
    const { onGuardarConfiguracion } = montar();
    for (const valor of ['0', '8784']) {
      await userEvent.clear(anticipacion());
      await userEvent.type(anticipacion(), valor);
      await userEvent.click(screen.getByRole('button', { name: 'Guardar anticipación' }));
    }
    expect(onGuardarConfiguracion.mock.calls.map(([e]) => e.anticipacionHoras)).toEqual([0, 8784]);
  });

  it.each([['8785'], ['-1'], ['abc'], ['2.5'], ['']])(
    'SEC_09_la_anticipacion_%j_se_marca_en_el_campo_y_no_se_manda',
    async (valor) => {
      const { onGuardarConfiguracion } = montar();
      await userEvent.clear(anticipacion());
      if (valor) await userEvent.type(anticipacion(), valor);
      await userEvent.click(screen.getByRole('button', { name: 'Guardar anticipación' }));
      expect(anticipacion().getAttribute('aria-invalid')).toBe('true');
      expect(within(region('Anticipación mínima')).getByRole('alert').textContent).toBe(
        MENSAJES_CONFIGURACION.anticipacionInvalida,
      );
      expect(onGuardarConfiguracion).not.toHaveBeenCalled();
    },
  );

  it('A11Y_la_anticipacion_con_error_no_tiene_violaciones_de_axe', async () => {
    const { container } = montar();
    await userEvent.clear(anticipacion());
    await userEvent.type(anticipacion(), '9000');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar anticipación' }));
    await sinViolacionesAxe(container);
  });
});

describe('huso horario (AGE-08, AGE-10, CA-16, DEC-08)', () => {
  const selector = () => screen.getByRole('combobox', { name: 'Huso horario' });

  it('AGE_10_explica_que_cambiar_el_huso_solo_cambia_su_agenda', () => {
    montar();
    expect(within(region('Huso horario')).getByText(/Cambiarlo solo cambia tu agenda, no la de otros profesores/)).toBeTruthy();
  });

  it('AGE_08_el_selector_lista_husos_y_deja_el_actual_elegido', () => {
    montar();
    const opciones = within(selector()).getAllByRole('option').map((o) => o.textContent);
    expect(opciones).toContain('Europe/Madrid');
    expect(opciones).toContain('America/Montevideo');
  });

  it('CA_16_cambiar_el_huso_pide_confirmar_con_la_advertencia_antes_de_guardar', async () => {
    const { onGuardarConfiguracion } = montar();
    await userEvent.selectOptions(selector(), 'Europe/Madrid');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar huso horario' }));
    const d = screen.getByRole('dialog', { name: 'Cambiar el huso horario' });
    expect(within(d).getByText(MENSAJES_CONFIGURACION.cambioHuso)).toBeTruthy();
    expect(within(d).getByText('De America/Montevideo a Europe/Madrid.')).toBeTruthy();
    expect(onGuardarConfiguracion).not.toHaveBeenCalled();
  });

  it('CA_16_confirmar_guarda_el_huso_nuevo_con_lo_guardado_de_lo_demas_y_anuncia_el_exito', async () => {
    const { onGuardarConfiguracion } = montar();
    await userEvent.selectOptions(selector(), 'Europe/Madrid');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar huso horario' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cambiar huso' }));
    expect(onGuardarConfiguracion).toHaveBeenCalledWith({
      duracionMin: 60,
      anticipacionHoras: 24,
      zonaHoraria: 'Europe/Madrid',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(within(region('Huso horario')).getByRole('status').textContent).toBe(MENSAJES_CONFIGURACION.guardada);
  });

  it('CA_16_cancelar_no_guarda_y_cierra_el_dialogo', async () => {
    const { onGuardarConfiguracion } = montar();
    await userEvent.selectOptions(selector(), 'Europe/Madrid');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar huso horario' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onGuardarConfiguracion).not.toHaveBeenCalled();
  });

  it('CA_16_Esc_cierra_el_dialogo_sin_guardar', async () => {
    const { onGuardarConfiguracion } = montar();
    await userEvent.selectOptions(selector(), 'Europe/Madrid');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar huso horario' }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onGuardarConfiguracion).not.toHaveBeenCalled();
  });

  it('CA_16_si_la_base_rechaza_el_cambio_el_error_queda_dentro_del_dialogo', async () => {
    const { onGuardarConfiguracion } = montar();
    onGuardarConfiguracion.mockResolvedValueOnce({
      ok: false,
      codigo: 'DATOS_INVALIDOS',
      mensaje: MENSAJES_CONFIGURACION.zonaInvalida,
      campo: 'p_zona_horaria',
    });
    await userEvent.selectOptions(selector(), 'Europe/Madrid');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar huso horario' }));
    const d = screen.getByRole('dialog');
    await userEvent.click(within(d).getByRole('button', { name: 'Cambiar huso' }));
    expect((await within(d).findByRole('alert')).textContent).toContain(MENSAJES_CONFIGURACION.zonaInvalida);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('AGE_08_guardar_sin_cambiar_el_huso_no_pide_confirmacion', async () => {
    const { onGuardarConfiguracion } = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar huso horario' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onGuardarConfiguracion).toHaveBeenCalledTimes(1);
  });

  it('A11Y_el_dialogo_de_cambio_de_huso_no_tiene_violaciones_de_axe', async () => {
    montar();
    await userEvent.selectOptions(selector(), 'Europe/Madrid');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar huso horario' }));
    await sinViolacionesAxe(screen.getByRole('dialog'));
  });
});

describe('teclado (A11Y-02, A11Y-03)', () => {
  it('A11Y_Tab_recorre_los_campos_en_orden_visual_y_cada_boton_de_guardar_se_alcanza', async () => {
    montar({
      lectura: {
        estado: 'listo',
        datos: { config: CONFIG, grilla: [{ dia_semana: 1, desde: '08:00', hasta: '13:00' }] },
        error: null,
      },
    });
    await userEvent.click(screen.getByRole('heading', { level: 2, name: 'Grilla semanal' }));
    const orden: string[] = [];
    for (let i = 0; i < 40 && !orden.includes('Guardar huso horario'); i += 1) {
      await userEvent.tab();
      const activo = document.activeElement;
      const nombre = activo instanceof HTMLElement ? (activo.getAttribute('aria-label') ?? activo.textContent ?? '') : '';
      if (activo instanceof HTMLButtonElement) orden.push(nombre.trim());
    }
    expect(orden).toEqual(
      expect.arrayContaining(['Guardar grilla', 'Guardar duración', 'Guardar anticipación', 'Guardar huso horario']),
    );
    expect(orden.indexOf('Guardar grilla')).toBeLessThan(orden.indexOf('Guardar duración'));
    expect(orden.indexOf('Guardar duración')).toBeLessThan(orden.indexOf('Guardar anticipación'));
    expect(orden.indexOf('Guardar anticipación')).toBeLessThan(orden.indexOf('Guardar huso horario'));
  });
});
