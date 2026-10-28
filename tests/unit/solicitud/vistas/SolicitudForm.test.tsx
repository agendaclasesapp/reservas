// @vitest-environment jsdom
// Pruebas de componente del formulario de solicitud (B06 · T06.2): WEB-04, SOL-01, SOL-10, RES-02..05, AGE-11,
// CA-05, CA-19, CA-41, CA-63, SEC-09, SEC-16, NFR-05, NFR-06.
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { falloDe, type FalloSolicitud, type FechaSerie } from '../../../../src/modulos/solicitud/logica';
import {
  SolicitudForm,
  type DatosFormulario,
  type SolicitudFormProps,
  type TipoClase,
} from '../../../../src/modulos/solicitud/vistas/SolicitudForm';
import { sinViolacionesAxe } from '../../ui/soporte';

afterEach(cleanup);

const ZONA = 'America/Argentina/Buenos_Aires';
const HUECO = { inicio: '2026-11-02T11:00:00Z', fin: '2026-11-02T12:00:00Z' };
const PERSONAS = [
  { id: 'p-luca', nombre: 'Luca Gómez' },
  { id: 'p-<b>', nombre: '<b>Malvada</b>' },
];

const SERIE_CON_SALTEADAS: FechaSerie[] = [
  { inicio: '2026-11-02T11:00:00Z', estado: 'reservable', motivo: null },
  { inicio: '2026-11-09T11:00:00Z', estado: 'salteada', motivo: 'bloqueado' },
  { inicio: '2026-11-16T11:00:00Z', estado: 'reservable', motivo: null },
  { inicio: '2027-01-04T11:00:00Z', estado: 'salteada', motivo: 'ocupado' },
];

function fallo(codigo: string, details?: object): FalloSolicitud {
  if (codigo === 'SIN_CONEXION') return falloDe(new TypeError('Failed to fetch'));
  return falloDe({ message: codigo, details: details === undefined ? null : JSON.stringify(details) });
}

/** El tipo de clase vive en quien monta el formulario: acá, un estado mínimo. */
function Montado(props: Partial<SolicitudFormProps> & { inicial?: TipoClase }) {
  const [tipo, setTipo] = useState<TipoClase>(props.inicial ?? 'suelta');
  return (
    <SolicitudForm
      profesorNombre="Ana Pérez"
      zona={ZONA}
      hueco={HUECO}
      personas={{ estado: 'listo', personas: [] }}
      fechas={{ estado: 'inactiva' }}
      enviando={false}
      error={null}
      onEnviar={() => undefined}
      onVolver={() => undefined}
      {...props}
      tipo={tipo}
      onCambioTipo={(nuevo) => {
        props.onCambioTipo?.(nuevo);
        setTipo(nuevo);
      }}
    />
  );
}

function montar(props: Partial<SolicitudFormProps> & { inicial?: TipoClase } = {}) {
  return render(<Montado {...props} />);
}

const PEDIR = { name: 'Pedir clase' };

describe('Formulario de solicitud: quién toma la clase (RES-03, CA-05)', () => {
  it('WEB_04_muestra_el_horario_en_el_huso_del_profesor', async () => {
    const { container } = montar();
    expect(screen.getByText('lunes, 2 de noviembre, 08:00 a 09:00')).toBeTruthy();
    await sinViolacionesAxe(container);
  });

  it('RES_03_sin_personas_a_cargo_la_toma_el_titular_y_se_manda_sin_persona', async () => {
    const onEnviar = vi.fn<(d: DatosFormulario) => void>();
    montar({ onEnviar });
    expect(screen.getByText(/La toma:/).parentElement?.textContent).toBe('La toma: vos.');
    expect(screen.queryByRole('radiogroup', { name: '¿Quién toma la clase?' })).toBeNull();
    expect(screen.getByRole('link', { name: 'ficha' }).getAttribute('href')).toBe('#/ficha');
    await userEvent.click(screen.getByRole('button', PEDIR));
    expect(onEnviar).toHaveBeenCalledWith({ tipo: 'suelta', frecuencia: null, personaACargoId: null, observacion: '' });
  });

  it('CA_05_con_personas_a_cargo_se_elige_quien_toma_y_el_titular_es_lo_marcado_por_defecto', async () => {
    const onEnviar = vi.fn<(d: DatosFormulario) => void>();
    const { container } = montar({ onEnviar, personas: { estado: 'listo', personas: PERSONAS } });
    const grupo = screen.getByRole('radiogroup', { name: '¿Quién toma la clase?' });
    expect(within(grupo).getAllByRole('radio').map((r) => r.parentElement?.textContent)).toEqual([
      'Yo',
      'Luca Gómez',
      '<b>Malvada</b>',
    ]);
    expect(within(grupo).getByRole<HTMLInputElement>('radio', { name: 'Yo' }).checked).toBe(true);
    await sinViolacionesAxe(container);

    await userEvent.click(within(grupo).getByRole('radio', { name: 'Luca Gómez' }));
    await userEvent.click(screen.getByRole('button', PEDIR));
    expect(onEnviar).toHaveBeenCalledWith(expect.objectContaining({ personaACargoId: 'p-luca' }));
  });

  it('SEC_16_el_nombre_de_una_persona_a_cargo_se_muestra_como_texto', () => {
    const { container } = montar({ personas: { estado: 'listo', personas: PERSONAS } });
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByRole('radio', { name: '<b>Malvada</b>' })).toBeTruthy();
  });

  it('RES_03_se_elige_con_flechas_del_teclado', async () => {
    const onEnviar = vi.fn<(d: DatosFormulario) => void>();
    montar({ onEnviar, personas: { estado: 'listo', personas: PERSONAS } });
    screen.getByRole('radio', { name: 'Yo' }).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Luca Gómez' }).checked).toBe(true);
  });

  it('RES_03_mientras_cargan_las_personas_a_cargo_no_se_puede_enviar_y_se_avisa', async () => {
    const onEnviar = vi.fn<(d: DatosFormulario) => void>();
    const { container } = montar({ onEnviar, personas: { estado: 'cargando' } });
    expect(screen.getByRole('status').textContent).toContain('Cargando tus personas a cargo…');
    expect(screen.getByText('Esperá a que carguen tus personas a cargo.')).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', PEDIR).disabled).toBe(true);
    await sinViolacionesAxe(container);
  });

  it('RES_03_si_fallan_las_personas_a_cargo_ofrece_reintentar_y_no_envia_como_titular', async () => {
    const onReintentar = vi.fn();
    const onEnviar = vi.fn();
    const { container } = montar({ onEnviar, personas: { estado: 'error', mensaje: 'Sin conexión.', onReintentar } });
    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toContain('No pudimos cargar tus personas a cargo. Sin conexión.');
    expect(screen.getByRole<HTMLButtonElement>('button', PEDIR).disabled).toBe(true);
    await userEvent.click(within(alerta).getByRole('button', { name: 'Reintentar' }));
    expect(onReintentar).toHaveBeenCalledTimes(1);
    expect(onEnviar).not.toHaveBeenCalled();
    await sinViolacionesAxe(container);
  });
});

describe('Formulario de solicitud: suelta o serie (RES-02, RES-05, CA-19)', () => {
  it('RES_02_ofrece_clase_suelta_serie_semanal_y_serie_quincenal_y_arranca_en_suelta', () => {
    montar();
    const grupo = screen.getByRole('radiogroup', { name: '¿Cómo querés pedirla?' });
    expect(within(grupo).getAllByRole('radio').map((r) => r.parentElement?.textContent)).toEqual([
      'Clase suelta',
      'Serie semanal',
      'Serie quincenal',
    ]);
    expect(within(grupo).getByRole<HTMLInputElement>('radio', { name: 'Clase suelta' }).checked).toBe(true);
    expect(within(grupo).getByText('Se repite todas las semanas hasta que se cancele.')).toBeTruthy();
    expect(within(grupo).getByText('Se repite cada dos semanas hasta que se cancele.')).toBeTruthy();
  });

  it('RES_02_elegir_el_tipo_avisa_para_calcular_las_fechas_y_se_manda_con_su_frecuencia', async () => {
    const onCambioTipo = vi.fn();
    const onEnviar = vi.fn<(d: DatosFormulario) => void>();
    montar({ onCambioTipo, onEnviar, fechas: { estado: 'listo', fechas: SERIE_CON_SALTEADAS } });
    await userEvent.click(screen.getByRole('radio', { name: 'Serie quincenal' }));
    expect(onCambioTipo).toHaveBeenCalledWith('quincenal');
    await userEvent.click(screen.getByRole('button', PEDIR));
    expect(onEnviar).toHaveBeenCalledWith({ tipo: 'serie', frecuencia: 2, personaACargoId: null, observacion: '' });

    await userEvent.click(screen.getByRole('radio', { name: 'Serie semanal' }));
    await userEvent.click(screen.getByRole('button', PEDIR));
    expect(onEnviar).toHaveBeenLastCalledWith(expect.objectContaining({ tipo: 'serie', frecuencia: 1 }));
  });

  it('CA_19_antes_de_enviar_la_serie_lista_las_fechas_salteadas_con_su_motivo', async () => {
    const { container } = montar({ inicial: 'semanal', fechas: { estado: 'listo', fechas: SERIE_CON_SALTEADAS } });
    expect(screen.getByText('Se saltean estas fechas porque no están libres:')).toBeTruthy();
    const lista = screen.getByRole('list', { name: 'Fechas que se saltean' });
    // La primera fecha es el hueco tocado: no es una salteada. Con otro año, el texto lo dice.
    expect(within(lista).getAllByRole('listitem').map((i) => i.textContent)).toEqual([
      'lunes, 9 de noviembre, 08:00 (bloqueada)',
      'lunes, 4 de enero de 2027, 08:00 (ocupada)',
    ]);
    expect(screen.getByRole<HTMLButtonElement>('button', PEDIR).disabled).toBe(false);
    await sinViolacionesAxe(container);
  });

  it('RES_05_con_una_sola_salteada_el_texto_va_en_singular', () => {
    montar({
      inicial: 'semanal',
      fechas: { estado: 'listo', fechas: SERIE_CON_SALTEADAS.slice(0, 3) },
    });
    expect(screen.getByText('Se saltea esta fecha porque no está libre:')).toBeTruthy();
  });

  it('RES_05_si_no_se_saltea_ninguna_lo_dice', () => {
    montar({
      inicial: 'semanal',
      fechas: {
        estado: 'listo',
        fechas: [
          { inicio: '2026-11-02T11:00:00Z', estado: 'reservable', motivo: null },
          { inicio: '2026-11-09T11:00:00Z', estado: 'reservable', motivo: null },
        ],
      },
    });
    expect(screen.getByText('No se saltea ninguna fecha.')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Fechas que se saltean' })).toBeNull();
  });

  it('RES_05_mientras_se_calculan_anuncia_cargando_y_no_deja_enviar_la_serie', async () => {
    const onEnviar = vi.fn();
    const { container } = montar({ inicial: 'semanal', onEnviar, fechas: { estado: 'cargando' } });
    expect(screen.getByRole('status').textContent).toContain('Calculando las fechas que se saltean…');
    expect(screen.getByText('Esperá a que se calculen las fechas.')).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', PEDIR).disabled).toBe(true);
    await sinViolacionesAxe(container);
  });

  it('RES_05_si_la_vista_previa_falla_lo_dice_con_el_motivo_y_no_deja_enviar_la_serie', async () => {
    const { container } = montar({
      inicial: 'quincenal',
      fechas: { estado: 'error', mensaje: 'No hay conexión con el servidor.' },
    });
    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toContain('No pudimos calcular las fechas');
    expect(alerta.textContent).toContain('No hay conexión con el servidor.');
    expect(screen.getByRole<HTMLButtonElement>('button', PEDIR).disabled).toBe(true);
    await sinViolacionesAxe(container);
  });

  it('RES_01_si_el_hueco_tocado_ya_no_esta_libre_lo_avisa_y_no_deja_enviar', () => {
    montar({
      inicial: 'semanal',
      fechas: {
        estado: 'listo',
        fechas: [{ inicio: '2026-11-02T11:00:00Z', estado: 'salteada', motivo: 'ocupado' }],
      },
    });
    expect(screen.getByText('Ese horario ya no está libre')).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', PEDIR).disabled).toBe(true);
  });
});

describe('Formulario de solicitud: observación (RES-04, SEC-09, SEC-16)', () => {
  it('RES_04_es_opcional_se_cuenta_y_se_manda_recortada', async () => {
    const onEnviar = vi.fn<(d: DatosFormulario) => void>();
    montar({ onEnviar });
    const campo = screen.getByRole('textbox', { name: /Observación/ });
    expect(campo.getAttribute('aria-required')).toBeNull();
    expect(campo.getAttribute('aria-describedby')).not.toBeNull();
    expect(screen.getByText(/Por ejemplo, quiénes más asisten a la clase\. 0 de 500 caracteres\./)).toBeTruthy();
    await userEvent.type(campo, '  Vamos con Luca  ');
    expect(screen.getByText(/14 de 500 caracteres/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', PEDIR));
    expect(onEnviar).toHaveBeenCalledWith(expect.objectContaining({ observacion: 'Vamos con Luca' }));
  });

  it('SEC_09_con_mas_de_500_caracteres_muestra_el_error_en_el_campo_con_foco_y_no_envia', async () => {
    const onEnviar = vi.fn();
    const { container } = montar({ onEnviar });
    const campo = screen.getByRole('textbox', { name: /Observación/ });
    await userEvent.click(campo);
    await userEvent.paste('a'.repeat(501));
    await userEvent.click(screen.getByRole('button', PEDIR));
    const error = await screen.findByText('La observación puede tener hasta 500 caracteres.');
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(campo.getAttribute('aria-describedby')).toContain(error.id);
    expect(document.activeElement).toBe(campo);
    expect(onEnviar).not.toHaveBeenCalled();
    await sinViolacionesAxe(container);
  });

  it('SEC_09_un_422_de_la_base_sobre_la_observacion_la_marca_y_lleva_el_foco', async () => {
    const { container } = montar({ error: fallo('DATOS_INVALIDOS', { campo: 'p_observacion' }) });
    const campo = screen.getByRole('textbox', { name: /Observación/ });
    expect(screen.getByText('La observación puede tener hasta 500 caracteres.')).toBeTruthy();
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(campo);
    await sinViolacionesAxe(container);
  });
});

describe('Formulario de solicitud: envío y errores (SOL-01, SOL-10, AGE-11, CA-41, CA-63)', () => {
  it('SOL_01_enviando_el_boton_dice_enviando_y_ocupado_y_los_campos_se_bloquean', async () => {
    const onEnviar = vi.fn();
    montar({ enviando: true, onEnviar, personas: { estado: 'listo', personas: PERSONAS } });
    const boton = screen.getByRole('button', { name: 'Enviando…' });
    expect(boton.getAttribute('aria-busy')).toBe('true');
    await userEvent.click(boton);
    expect(onEnviar).not.toHaveBeenCalled();
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: /Observación/ }).disabled).toBe(true);
    // Los radios van dentro de un `fieldset disabled`: se deshabilitan por herencia.
    expect(screen.getByRole('radio', { name: 'Serie semanal' }).matches(':disabled')).toBe(true);
  });

  it('SOL_10_con_el_limite_de_pendientes_dice_cuantas_son_y_ofrece_volver_a_la_agenda', async () => {
    const onVolver = vi.fn();
    const onEnviar = vi.fn();
    const { container } = montar({
      onVolver,
      onEnviar,
      error: fallo('LIMITE_EXCEDIDO', { tope: 'pendientes', limite: 10 }),
    });
    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toContain('No se pudo enviar el pedido');
    expect(alerta.textContent).toContain(
      'Ya tenés 10 solicitudes pendientes, que es el máximo. Cuando el profesor responda alguna vas a poder pedir otra.',
    );
    // Reintentar no lo arregla: no hay botón de envío, sí una salida.
    expect(screen.queryByRole('button', PEDIR)).toBeNull();
    await userEvent.click(within(alerta).getByRole('button', { name: 'Volver a la agenda' }));
    expect(onVolver).toHaveBeenCalledTimes(1);
    await sinViolacionesAxe(container);
  });

  it('AGE_11_con_el_profesor_inactivo_dice_que_no_toma_reservas_y_no_deja_reintentar', async () => {
    const { container } = montar({ error: fallo('PROFESOR_INACTIVO') });
    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toContain('Ana Pérez no toma reservas por ahora');
    expect(alerta.textContent).toContain('El profesor no toma reservas por ahora, así que no se puede hacer esto.');
    expect(screen.queryByRole('button', PEDIR)).toBeNull();
    expect(within(alerta).getByRole('button', { name: 'Volver a la agenda' })).toBeTruthy();
    await sinViolacionesAxe(container);
  });

  it('RES_01_hueco_no_libre_anticipacion_y_vinculo_no_aprobado_dicen_el_motivo_y_dan_salida', () => {
    const casos: ReadonlyArray<readonly [string, object | undefined, string]> = [
      ['HUECO_NO_LIBRE', { inicio: '2026-11-02T11:00:00Z' }, 'Ese horario ya no está libre. Elegí otro.'],
      ['ANTICIPACION_INSUFICIENTE', { horas_minimas: 24 }, 'hace falta pedirlo con 24 horas de anticipación'],
      ['CUENTA_NO_APROBADA', { estado: 'pendiente', profesor_id: 'x' }, 'Tu cuenta no está aprobada'],
    ];
    for (const [codigo, detalles, texto] of casos) {
      const { unmount } = montar({ error: fallo(codigo, detalles) });
      expect(screen.getByRole('alert').textContent).toContain(texto);
      expect(screen.getByRole('button', { name: 'Volver a la agenda' })).toBeTruthy();
      expect(screen.queryByRole('button', PEDIR)).toBeNull();
      unmount();
    }
  });

  it('SEC_17_ficha_incompleta_y_sin_sesion_ofrecen_el_enlace_que_corresponde', () => {
    const { unmount } = montar({ error: fallo('FICHA_INCOMPLETA') });
    expect(screen.getByRole('link', { name: 'Completar la ficha' }).getAttribute('href')).toBe('#/ficha');
    unmount();
    montar({ error: fallo('NO_AUTENTICADO') });
    expect(screen.getByRole('link', { name: 'Ingresar' }).getAttribute('href')).toBe('#/ingreso');
  });

  it('SOL_01_un_error_de_red_se_puede_reintentar_con_el_mismo_boton_y_los_datos_intactos', async () => {
    const onEnviar = vi.fn<(d: DatosFormulario) => void>();
    montar({ onEnviar, error: fallo('SIN_CONEXION') });
    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toContain('No hay conexión con el servidor.');
    expect(within(alerta).queryByRole('button')).toBeNull();
    await userEvent.click(screen.getByRole('button', PEDIR));
    expect(onEnviar).toHaveBeenCalledTimes(1);
  });

  it('SEC_09_un_422_sobre_el_tipo_se_marca_en_el_grupo_y_el_foco_va_al_primer_radio', async () => {
    const { container } = montar({ error: fallo('DATOS_INVALIDOS', { campo: 'p_frecuencia' }) });
    const grupo = screen.getByRole('radiogroup', { name: '¿Cómo querés pedirla?' });
    expect(within(grupo).getByText('Elegí si la serie es semanal o quincenal.')).toBeTruthy();
    expect(document.activeElement).toBe(within(grupo).getAllByRole('radio')[0]);
    await sinViolacionesAxe(container);
  });

  it('NFR_06_los_controles_son_nativos_y_se_recorren_con_tab_en_orden', async () => {
    montar({ personas: { estado: 'listo', personas: PERSONAS } });
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Yo' }));
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'ficha' }));
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Clase suelta' }));
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: /Observación/ }));
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', PEDIR));
  });
});
