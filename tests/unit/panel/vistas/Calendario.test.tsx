// @vitest-environment jsdom
// Calendario del Panel, vista Día (B17, T17.2): CAL-01, CAL-03, CAL-04, CAL-07, CAL-08, CAL-19; CA-72, CA-83; SEC-16,
// SEC-35. Componentes CC-01 `BarraCalendario`, CC-02 `CalendarioPanel`, CC-03 `EjeHoras`, CC-05 `ColumnaDia`, CC-06
// `BloqueClase`, CC-15 `AccionesVista` y el Panel que los compone. Consultas por rol y nombre accesible (sin data-testid).
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccionesVista } from '../../../../src/modulos/panel/vistas/AccionesVista';
import { BarraCalendario } from '../../../../src/modulos/panel/vistas/BarraCalendario';
import { BloqueClase } from '../../../../src/modulos/panel/vistas/BloqueClase';
import { CalendarioPanel } from '../../../../src/modulos/panel/vistas/CalendarioPanel';
import { diaCorto } from '../../../../src/modulos/panel/vistas/calendario';
import { ColumnaDia } from '../../../../src/modulos/panel/vistas/ColumnaDia';
import { EjeHoras } from '../../../../src/modulos/panel/vistas/EjeHoras';
import { ejeCalendario, type BloqueClase as DatosBloque } from '../../../../src/modulos/panel/logica';
import { sinViolacionesAxe } from '../../ui/soporte';
import { bloqueDe, calendarioDe, columnaDe, DIA, EJE, H11, H12, LIBRE_11, LIMITES, montar, ocupada, ZONA } from './soporte';

afterEach(cleanup);

// Los bloques los arma la lógica (`bloquesDeClase`) desde las filas de `agenda_profesor_dias`.
const CONFIRMADA = bloqueDe();
const PENDIENTE = bloqueDe({ inicio: H11, fin: H12, clase_id: 'c2', clase_estado: 'pendiente', quien_toma: 'Bruno Díaz' });
const TITULO = '12/11/2026';
const HOSTILES = ['<img src=x onerror=alert(1)>', 'x"><script>alert(1)</script>'];

function variable(elemento: HTMLElement, nombre: string): string {
  return elemento.style.getPropertyValue(nombre);
}

function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('CC-01 BarraCalendario (CAL-01, CAL-03, A11Y-47, A11Y-49)', () => {
  const props = {
    vista: 'dia' as const,
    titulo: '30/10/2026',
    puedeAnterior: true,
    puedeSiguiente: true,
    onAnterior: vi.fn(),
    onSiguiente: vi.fn(),
    onHoy: vi.fn(),
  };

  it('CAL_03_el_titulo_es_un_h2_anunciado_sin_mover_el_foco_y_la_barra_es_una_navegacion_con_nombre', () => {
    render(<BarraCalendario {...props} />);
    const titulo = screen.getByRole('heading', { level: 2, name: '30/10/2026' });
    expect(titulo.getAttribute('aria-live')).toBe('polite');
    expect(screen.getByRole('navigation', { name: 'Navegación del calendario' })).toBeTruthy();
  });

  it('CAL_03_anterior_hoy_y_siguiente_avisan_cada_uno', async () => {
    const onAnterior = vi.fn();
    const onSiguiente = vi.fn();
    const onHoy = vi.fn();
    render(<BarraCalendario {...props} onAnterior={onAnterior} onSiguiente={onSiguiente} onHoy={onHoy} />);
    await userEvent.click(screen.getByRole('button', { name: 'Día anterior' }));
    await userEvent.click(screen.getByRole('button', { name: 'Hoy' }));
    await userEvent.click(screen.getByRole('button', { name: 'Día siguiente' }));
    expect(onAnterior).toHaveBeenCalledTimes(1);
    expect(onHoy).toHaveBeenCalledTimes(1);
    expect(onSiguiente).toHaveBeenCalledTimes(1);
  });

  it('CAL_03_una_flecha_que_saldria_del_rango_queda_deshabilitada_y_dice_por_que_en_su_nombre', async () => {
    const onSiguiente = vi.fn();
    render(<BarraCalendario {...props} puedeSiguiente={false} onSiguiente={onSiguiente} />);
    const flecha = screen.getByRole('button', { name: 'Día siguiente, no disponible' });
    expect((flecha as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(flecha);
    expect(onSiguiente).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Día anterior' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('CAL_01_Dia_y_Semana_marcan_la_vista_elegida_con_aria_pressed_cuando_se_ofrecen', async () => {
    const onVista = vi.fn();
    render(<BarraCalendario {...props} onVista={onVista} />);
    expect(screen.getByRole('button', { name: 'Día', pressed: true })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Semana', pressed: false }));
    expect(onVista).toHaveBeenCalledWith('semana');
  });

  it('CAL_01_sin_onVista_no_hay_botones_de_vista_que_no_hagan_nada', () => {
    render(<BarraCalendario {...props} />);
    expect(screen.queryByRole('button', { name: 'Semana' })).toBeNull();
  });

  it('A11Y_la_barra_no_tiene_violaciones_de_axe', async () => {
    const { container } = render(<BarraCalendario {...props} puedeSiguiente={false} onVista={vi.fn()} />);
    await sinViolacionesAxe(container);
  });
});

describe('CC-03 EjeHoras (CAL-04, DEC-44 A)', () => {
  it('CAL_04_una_etiqueta_por_hora_en_punto_y_decorativo_para_el_lector', () => {
    const { container } = render(<EjeHoras eje={EJE} />);
    const eje = container.firstElementChild as HTMLElement;
    expect(eje.getAttribute('aria-hidden')).toBe('true');
    const horas = Array.from(eje.querySelectorAll('time')).map((t) => t.textContent);
    expect(horas).toHaveLength(11);
    expect(horas[0]).toBe('08:00');
    expect(horas[10]).toBe('18:00');
  });

  it('CAL_04_DEC_44_A_las_horas_son_las_del_eje_que_ya_extendio_la_logica', () => {
    // 06:30 a 07:30 y 18:30 a 19:30 en Montevideo (UTC-3): la lógica pasa el eje a 06:00 a 20:00.
    const temprano = bloqueDe({ inicio: '2026-11-12T09:30:00Z', fin: '2026-11-12T10:30:00Z', clase_id: 'c8' });
    const tarde = bloqueDe({ inicio: '2026-11-12T21:30:00Z', fin: '2026-11-12T22:30:00Z', clase_id: 'c9' });
    const { container } = render(<EjeHoras eje={ejeCalendario([], 60, [temprano, tarde])} />);
    const horas = Array.from(container.querySelectorAll('time')).map((t) => t.textContent);
    expect(horas[0]).toBe('06:00');
    expect(horas[horas.length - 1]).toBe('20:00');
  });
});

describe('CC-06 BloqueClase (CAL-07, CAL-08, CA-72, DEC-42 A, DEC-50 A, SEC-16, SEC-35)', () => {
  function bloque(clase: DatosBloque, extra: { onAbrir?: (c: DatosBloque) => void } = {}) {
    return render(
      <ul>
        <BloqueClase clase={clase} dia={DIA} zona={ZONA} eje={EJE} onAbrir={extra.onAbrir} />
      </ul>,
    );
  }

  it('CAL_07_una_clase_confirmada_dice_CONFIRMADA_antes_del_nombre_de_quien_la_toma', () => {
    const { container } = bloque(CONFIRMADA);
    const item = screen.getByRole('listitem');
    expect(within(item).getByText('Confirmada')).toBeTruthy();
    expect(within(item).getByText('Ana Pérez')).toBeTruthy();
    const texto = item.textContent ?? '';
    expect(texto.indexOf('Confirmada')).toBeLessThan(texto.indexOf('Ana Pérez'));
    // El estado va en el texto y el ícono es decorativo (A11Y-41).
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('CAL_08_DEC_42_A_una_solicitud_pendiente_dice_PENDIENTE_y_se_distingue_de_la_confirmada_sin_color', () => {
    bloque(PENDIENTE);
    const item = screen.getByRole('listitem');
    expect(within(item).getByText('Pendiente')).toBeTruthy();
    expect(within(item).queryByText('Confirmada')).toBeNull();
    expect(within(item).getByText('Bruno Díaz')).toBeTruthy();
  });

  it('CA_72_el_alto_es_proporcional_a_la_duracion_una_clase_de_60_minutos_mide_el_doble_que_una_de_30', () => {
    const { unmount } = bloque(bloqueDe({ fin: '2026-11-12T13:30:00Z' }));
    const altoTreinta = Number(variable(screen.getByRole('listitem'), '--cal-alto'));
    unmount();
    bloque(CONFIRMADA);
    const item = screen.getByRole('listitem');
    // `posicionEnEje` de la lógica: el alto va en horas y la vista lo multiplica por `--cal-alto-hora`.
    expect(altoTreinta).toBe(0.5);
    expect(Number(variable(item, '--cal-alto'))).toBe(2 * altoTreinta);
    // 10:00 con el eje desde las 08:00: 2 horas desde el comienzo del eje.
    expect(Number(variable(item, '--cal-arriba'))).toBe(2);
  });

  it('DEC_50_A_el_alto_de_la_hora_sale_de_la_logica_y_llega_a_la_grilla', () => {
    render(
      <CalendarioPanel
        estado={calendarioDe([ocupada()])}
        titulo={TITULO}
        zona={ZONA}
        eje={ejeCalendario([], 20)}
        onReintentar={vi.fn()}
      />,
    );
    const grupo = screen.getByRole('group', { name: 'Calendario, 12/11/2026' });
    // Duración del profesor de 20 min: la lógica sube la hora a 2,75 rem × 60 / 20 (DEC-50 A).
    expect(variable(grupo, '--cal-alto-hora')).toBe('8.25rem');
    expect(variable(grupo, '--cal-horas')).toBe('10');
  });

  it('A11Y_36_un_bloque_que_se_abre_es_un_boton_con_el_nombre_dia_hora_estado_y_quien', async () => {
    const onAbrir = vi.fn();
    bloque(CONFIRMADA, { onAbrir });
    const boton = screen.getByRole('button', { name: 'Jue 12/11, 10:00 a 11:00, Confirmada, Ana Pérez' });
    await userEvent.click(boton);
    expect(onAbrir).toHaveBeenCalledWith(CONFIRMADA);
  });

  it('A11Y_36_sin_onAbrir_el_bloque_es_solo_lectura_pero_dice_cuando_para_el_lector', () => {
    bloque(PENDIENTE);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('listitem').textContent).toContain('Jue 12/11, 11:00 a 12:00, ');
  });

  it.each(HOSTILES)('SEC_16_SEC_35_un_nombre_hostil_%s_se_ve_literal_sin_crear_img_ni_script', (hostil) => {
    const solo = bloque({ ...CONFIRMADA, quien: hostil });
    expect(screen.getByText(hostil)).toBeTruthy();
    expect(solo.container.querySelector('img')).toBeNull();
    expect(solo.container.querySelector('script')).toBeNull();
    solo.unmount();
    // También en el nombre accesible del botón.
    const boton = bloque({ ...CONFIRMADA, quien: hostil }, { onAbrir: vi.fn() });
    expect(screen.getByRole('button', { name: new RegExp(`Confirmada, ${escapar(hostil)}$`) })).toBeTruthy();
    expect(boton.container.querySelector('img')).toBeNull();
    expect(boton.container.querySelector('script')).toBeNull();
  });

  it('SEC_16_un_quien_toma_vacio_no_deja_un_bloque_sin_nombre', () => {
    bloque({ ...CONFIRMADA, quien: null });
    expect(screen.getByText('Alumno dado de baja')).toBeTruthy();
  });
});

describe('CC-05 ColumnaDia (CAL-07, CAL-08, A11Y-35)', () => {
  it('CAL_07_los_bloques_van_en_una_lista_con_nombre_del_dia_y_en_orden_horario', () => {
    render(<ColumnaDia columna={columnaDe([ocupada(), ocupada({ inicio: H11, fin: H12, clase_id: 'c2', clase_estado: 'pendiente', quien_toma: 'Bruno Díaz' })])} zona={ZONA} eje={EJE} />);
    const lista = screen.getByRole('list', { name: 'Clases del jueves, 12 de noviembre' });
    const items = within(lista).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain('Ana Pérez');
    expect(items[1]?.textContent).toContain('Bruno Díaz');
  });

  it('CAL_07_un_dia_sin_clases_es_una_lista_vacia_con_nombre', () => {
    render(<ColumnaDia columna={columnaDe([])} zona={ZONA} eje={EJE} />);
    expect(within(screen.getByRole('list', { name: /Clases del jueves/ })).queryAllByRole('listitem')).toHaveLength(0);
  });
});

describe('CC-02 CalendarioPanel (CAL-01, F-CAL-01, F-CAL-11, A11Y-48)', () => {
  const base = { titulo: TITULO, zona: ZONA, eje: EJE, onReintentar: vi.fn() };
  const PENDIENTE_12 = ocupada({ inicio: H11, fin: H12, clase_id: 'c2', clase_estado: 'pendiente' });

  it('CAL_01_cargando_dice_Cargando_la_agenda_en_un_status', () => {
    render(<CalendarioPanel {...base} estado={{ estado: 'cargando' }} />);
    expect(screen.getByRole('status').textContent).toContain('Cargando la agenda…');
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('CAL_01_error_muestra_el_mensaje_generico_que_recibe_y_Reintentar_relee', async () => {
    const onReintentar = vi.fn();
    render(
      <CalendarioPanel
        {...base}
        onReintentar={onReintentar}
        estado={{ estado: 'error', mensaje: 'Algo salió mal. Probá de nuevo.' }}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('No se pudo cargar la agenda. Algo salió mal. Probá de nuevo.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onReintentar).toHaveBeenCalledTimes(1);
  });

  it('CAL_01_listo_es_un_grupo_Calendario_con_el_titulo_y_las_clases_del_dia', () => {
    render(<CalendarioPanel {...base} estado={calendarioDe([ocupada(), PENDIENTE_12])} />);
    const grupo = screen.getByRole('group', { name: 'Calendario, 12/11/2026' });
    expect(grupo.getAttribute('aria-busy')).toBeNull();
    expect(within(grupo).getByText('Confirmada')).toBeTruthy();
    expect(within(grupo).getByText('Pendiente')).toBeTruthy();
  });

  it('CAL_01_releyendo_deja_la_grilla_anterior_con_aria_busy', () => {
    render(<CalendarioPanel {...base} releyendo estado={calendarioDe([ocupada()])} />);
    expect(screen.getByRole('group', { name: /Calendario/ }).getAttribute('aria-busy')).toBe('true');
    expect(screen.getByText('Ana Pérez')).toBeTruthy();
  });

  it('CAL_04_DEC_44_A_una_clase_fuera_de_la_grilla_se_dibuja_y_el_eje_llega_hasta_ella', () => {
    const tarde = bloqueDe({ inicio: '2026-11-12T22:00:00Z', fin: '2026-11-12T23:00:00Z', clase_id: 'c7' });
    const { container } = render(
      <CalendarioPanel
        {...base}
        eje={ejeCalendario([], 60, [tarde])}
        estado={calendarioDe([ocupada({ inicio: tarde.inicio, fin: tarde.fin, clase_id: 'c7' })])}
      />,
    );
    expect(screen.getByText('Ana Pérez')).toBeTruthy();
    const horas = Array.from(container.querySelectorAll('time')).map((t) => t.textContent);
    expect(horas[horas.length - 1]).toBe('20:00');
  });

  it('A11Y_el_calendario_listo_no_tiene_violaciones_de_axe', async () => {
    const { container } = render(<CalendarioPanel {...base} estado={calendarioDe([ocupada(), PENDIENTE_12])} />);
    await sinViolacionesAxe(container);
  });
});

describe('CC-15 AccionesVista (CAL-19, A11Y-49)', () => {
  it('CAL_19_el_boton_cambia_su_texto_entre_Ver_como_lista_y_Ver_como_calendario', async () => {
    const onModo = vi.fn();
    const { rerender } = render(<AccionesVista modoLista={false} onModo={onModo} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ver como lista' }));
    expect(onModo).toHaveBeenCalledTimes(1);
    rerender(<AccionesVista modoLista onModo={onModo} />);
    expect(screen.getByRole('button', { name: 'Ver como calendario' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ver como lista' })).toBeNull();
  });
});

describe('Panel en calendario y «Ver como lista» (CAL-01, CAL-19, CA-83, WEB-14, WEB-16)', () => {
  it('CAL_01_el_panel_abre_en_el_calendario_del_dia_y_no_en_la_lista', () => {
    montar([ocupada(), LIBRE_11], { modo: 'calendario' });
    expect(screen.getByRole('group', { name: 'Calendario, 12/11/2026' })).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Huecos del día' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Ver como lista' })).toBeTruthy();
  });

  it('CA_83_Ver_como_lista_muestra_la_lista_de_huecos_del_dia_y_Ver_como_calendario_vuelve_a_la_grilla', async () => {
    montar([ocupada(), LIBRE_11], { modo: 'calendario' });
    const boton = screen.getByRole('button', { name: 'Ver como lista' });
    await userEvent.click(boton);
    expect(screen.getByRole('list', { name: 'Huecos del día' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: /Calendario/ })).toBeNull();
    // Navegación, título y el mismo botón siguen: el foco no se pierde.
    expect(screen.getByRole('heading', { level: 2, name: '12/11/2026' })).toBeTruthy();
    expect(document.activeElement).toBe(boton);
    expect(boton.textContent).toBe('Ver como calendario');
    await userEvent.click(boton);
    expect(screen.getByRole('group', { name: 'Calendario, 12/11/2026' })).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Huecos del día' })).toBeNull();
    expect(document.activeElement).toBe(boton);
  });

  it('CA_83_la_lista_tiene_las_mismas_acciones_de_hoy_tocar_un_hueco_libre_abre_Crear_clase', async () => {
    montar([ocupada(), LIBRE_11], { modo: 'calendario' });
    await userEvent.click(screen.getByRole('button', { name: 'Ver como lista' }));
    await userEvent.click(screen.getByRole('button', { name: /^11:00 a 12:00/ }));
    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByRole('heading', { level: 3, name: 'Crear clase' })).toBeTruthy();
  });

  it('CAL_03_Hoy_en_hoy_no_vuelve_a_pedir_y_siguiente_pide_el_dia_que_sigue', async () => {
    const { onCambiarDia } = montar([LIBRE_11], { dia: LIMITES.hoy });
    await userEvent.click(screen.getByRole('button', { name: 'Hoy' }));
    expect(onCambiarDia).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Día siguiente' }));
    expect(onCambiarDia).toHaveBeenCalledWith('2026-11-03');
  });

  it('CAL_01_con_el_calendario_en_error_la_barra_sigue_y_Reintentar_relee', async () => {
    const { onRecargarAgenda } = montar([], {
      modo: 'calendario',
      calendario: { estado: 'error', mensaje: 'Algo salió mal.' },
    });
    expect(screen.getByRole('button', { name: 'Día siguiente' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRecargarAgenda).toHaveBeenCalledTimes(1);
  });

  it('SEC_35_un_nombre_hostil_se_ve_literal_en_el_calendario_y_en_la_lista_del_panel', async () => {
    const hostil = '<img src=x onerror=alert(1)>';
    const { container } = montar([ocupada({ quien_toma: hostil, titular: 'x"><script>' })], { modo: 'calendario' });
    expect(screen.getByText(hostil)).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Ver como lista' }));
    expect(screen.getByText(`Toma la clase: ${hostil}`)).toBeTruthy();
    expect(screen.getByText('Titular: x"><script>')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });

  it('A11Y_el_panel_en_calendario_y_en_lista_no_tiene_violaciones_de_axe', async () => {
    const filas = [
      ocupada(),
      ocupada({ inicio: H11, fin: H12, clase_id: 'c2', clase_estado: 'pendiente', solicitud_id: 's1' }),
      LIBRE_11,
    ];
    const { container } = montar(filas, { modo: 'calendario' });
    await sinViolacionesAxe(container);
    await userEvent.click(screen.getByRole('button', { name: 'Ver como lista' }));
    await sinViolacionesAxe(container);
  });
});

describe('formato del calendario (A11Y-36, CAL-03)', () => {
  it('A11Y_36_el_dia_corto_lleva_dia_y_mes', () => {
    expect(diaCorto('2026-10-26')).toBe('Lun 26/10');
  });
});
