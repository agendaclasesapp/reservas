// @vitest-environment jsdom
// Calendario del Panel, vista Semana y lista agrupada (B20, T20.2): CAL-10, CAL-15, CAL-16, CAL-19; WEB-15, WEB-16; NFR-12;
// CA-74, CA-80, CA-81, CA-83; A11Y-44, A11Y-49, A11Y-50; SEC-16, SEC-35, SEC-37. Componentes CC-02 `CalendarioPanel`,
// CC-04 `EncabezadoDia`, CC-05 `ColumnaDia`, CC-09 `LineaAhora`, CC-16 `ListaPorDia` y el Panel que los compone.
// Consultas por rol y nombre accesible (sin data-testid).
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { navegacionCalendario } from '../../../../src/modulos/panel/logica';
import { EncabezadoDia } from '../../../../src/modulos/panel/vistas/EncabezadoDia';
import { UMBRAL_DESLIZAMIENTO_PX, sentidoDeslizamiento } from '../../../../src/modulos/panel/vistas/useDeslizamiento';
import { VistaPanel } from '../../../../src/modulos/panel/vistas/VistaPanel';
import { sinViolacionesAxe } from '../../ui/soporte';
import { bloqueoEn, calendarioDe, claseEn, LIMITES, libreEn, montar, montarSemana, ocupada, ZONA } from './soporte';

afterEach(cleanup);

const HOSTILES = ['<img src=x onerror=alert(1)>', 'x"><script>alert(1)</script>'];
/** La semana del 26/10/2026 al 01/11/2026 (CA-67); hoy del soporte es el lunes 02/11. */
const ENCABEZADOS = ['Lun 26/10', 'Mar 27/10', 'Mié 28/10', 'Jue 29/10', 'Vie 30/10', 'Sáb 31/10', 'Dom 01/11'];

function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function grupoDelCalendario(): HTMLElement {
  return screen.getByRole('group', { name: /^Calendario, / });
}

function botonesDeEncabezado(): HTMLElement[] {
  return screen
    .getAllByRole('button', { name: /vista Día$|no disponible$/ })
    .filter((b) => /^(Abrir el )?\p{L}{3} \d\d\/\d\d/u.test(b.getAttribute('aria-label') ?? ''));
}

describe('CC-02 CalendarioPanel · Semana (CAL-15, WEB-15, CA-80, A11Y-49)', () => {
  it('CAL_15_siete_columnas_de_lunes_a_domingo_con_encabezados_tipo_Lun_26_10_y_el_titulo_con_el_rango', () => {
    montarSemana([libreEn('2026-10-27', 10)]);
    expect(screen.getByRole('heading', { level: 2, name: '26/10/2026 - 01/11/2026' })).toBeTruthy();
    expect(screen.getAllByRole('list', { name: /^Clases del / })).toHaveLength(7);
    const nombres = botonesDeEncabezado().map((b) => b.getAttribute('aria-label'));
    expect(nombres).toEqual(ENCABEZADOS.map((e) => `Abrir el ${e}, vista Día`));
    for (const e of ENCABEZADOS) expect(screen.getByText(e)).toBeTruthy();
  });

  it('CAL_01_Semana_queda_marcada_con_aria_pressed_y_Dia_no', () => {
    montarSemana([]);
    expect(screen.getByRole('button', { name: 'Semana', pressed: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Día', pressed: false })).toBeTruthy();
  });

  it('CA_80_tocar_Vie_30_10_abre_la_vista_Dia_de_ese_dia', async () => {
    const { onNavegar, onCambiarDia } = montarSemana([libreEn('2026-10-27', 10)]);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir el Vie 30/10, vista Día' }));
    expect(onNavegar).toHaveBeenCalledWith({ vista: 'dia', dia: '2026-10-30' });
    expect(onCambiarDia).not.toHaveBeenCalled();
  });

  it('F_CAL_03_al_abrir_la_vista_Dia_desde_un_encabezado_el_foco_pasa_al_titulo_y_no_antes', async () => {
    const { onNavegar, rerender, props } = montarSemana([libreEn('2026-10-27', 10)]);
    const boton = screen.getByRole('button', { name: 'Abrir el Vie 30/10, vista Día' });
    await userEvent.click(boton);
    // `PaginaPanel` cambia la dirección y la vista llega con la navegación del día.
    expect(document.activeElement).toBe(boton);
    const destino = onNavegar.mock.calls[0]?.[0] as { vista: 'dia'; dia: string };
    rerender(
      <VistaPanel
        {...props}
        dia={destino.dia}
        navegacion={navegacionCalendario(destino, LIMITES)}
        calendario={calendarioDe([libreEn(destino.dia, 10)], destino.dia)}
      />,
    );
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: '30/10/2026' }));
  });

  it('F_CAL_01_cambiar_de_vista_conserva_el_dia_y_no_mueve_el_foco_a_ningun_lado', async () => {
    const { onNavegar } = montarSemana([], { dia: '2026-10-29' });
    const dia = screen.getByRole('button', { name: 'Día', pressed: false });
    await userEvent.click(dia);
    expect(onNavegar).toHaveBeenCalledWith({ vista: 'dia', dia: '2026-10-29' });
    expect(document.activeElement).toBe(dia);
  });

  it('CAL_03_las_flechas_corren_de_a_una_semana_y_Hoy_vuelve_a_la_semana_actual', async () => {
    const { onNavegar } = montarSemana([]);
    await userEvent.click(screen.getByRole('button', { name: 'Semana siguiente' }));
    expect(onNavegar).toHaveBeenLastCalledWith({ vista: 'semana', dia: '2026-11-02' });
    await userEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
    expect(onNavegar).toHaveBeenLastCalledWith({ vista: 'semana', dia: '2026-10-19' });
    await userEvent.click(screen.getByRole('button', { name: 'Hoy' }));
    expect(onNavegar).toHaveBeenLastCalledWith({ vista: 'semana', dia: LIMITES.hoy });
  });

  it('CAL_03_Elegir_dia_en_Semana_cambia_el_dia_y_conserva_la_vista', async () => {
    const { onNavegar, onCambiarDia } = montarSemana([]);
    fireEvent.change(screen.getByLabelText('Elegir día'), { target: { value: '2026-12-02' } });
    expect(onNavegar).toHaveBeenCalledWith({ vista: 'semana', dia: '2026-12-02' });
    expect(onCambiarDia).not.toHaveBeenCalled();
  });

  it('CAL_10_el_encabezado_de_hoy_dice_Hoy_con_aria_current_y_solo_su_columna_va_resaltada', () => {
    const { container } = montarSemana([libreEn('2026-11-03', 10)], { dia: '2026-11-04' });
    const hoy = screen.getByRole('button', { name: 'Abrir el Lun 02/11, hoy, vista Día' });
    expect(hoy.getAttribute('aria-current')).toBe('date');
    expect(within(hoy).getByText('Hoy')).toBeTruthy();
    expect(container.querySelectorAll('[aria-current="date"]')).toHaveLength(1);
    // CA-74: la columna de hoy está resaltada y las demás no.
    const resaltadas = container.querySelectorAll('[data-hoy]');
    expect(resaltadas).toHaveLength(1);
    expect(within(resaltadas[0] as HTMLElement).getByRole('list', { name: /^Clases del lunes, 2 de noviembre/ })).toBeTruthy();
  });

  it('CAL_10_una_semana_sin_hoy_no_resalta_ninguna_columna_ni_marca_Hoy', () => {
    const { container } = montarSemana([]);
    expect(container.querySelectorAll('[data-hoy]')).toHaveLength(0);
    expect(screen.queryByText('Hoy', { selector: 'span' })).toBeNull();
  });

  it('CAL_10_CA_74_la_linea_de_la_hora_actual_va_solo_en_la_columna_de_hoy_y_es_decorativa', () => {
    const lineaAhora = vi.fn((dia: string) => (dia === LIMITES.hoy ? { arribaHoras: 2.7, hora: '10:42' } : null));
    const { container } = montarSemana([], { dia: '2026-11-04', lineaAhora });
    const marcas = Array.from(container.querySelectorAll<HTMLElement>('[aria-hidden="true"]')).filter(
      (el) => el.style.getPropertyValue('--cal-arriba') === '2.7',
    );
    // La línea (en la columna de hoy) y «Ahora 10:42» junto al eje; las dos fuera del árbol de accesibilidad.
    expect(marcas).toHaveLength(2);
    const enColumna = marcas.filter((el) => el.closest('[data-hoy]') !== null);
    expect(enColumna).toHaveLength(1);
    const etiqueta = marcas.find((el) => el.textContent?.includes('Ahora'));
    expect(etiqueta?.textContent).toBe('Ahora10:42');
  });

  it('CAL_10_en_la_vista_Dia_hay_linea_de_la_hora_actual_pero_la_columna_no_se_resalta', () => {
    const lineaAhora = () => ({ arribaHoras: 1.5, hora: '09:30' });
    const { container } = montar([libreEn(LIMITES.hoy, 10)], { modo: 'calendario', dia: LIMITES.hoy, lineaAhora });
    expect(container.querySelectorAll('[data-hoy]')).toHaveLength(0);
    const marcas = Array.from(container.querySelectorAll<HTMLElement>('[aria-hidden="true"]')).filter(
      (el) => el.style.getPropertyValue('--cal-arriba') === '1.5',
    );
    expect(marcas).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /vista Día$/ })).toBeNull();
  });

  it('CAL_10_sin_linea_de_ahora_no_se_dibuja_nada_en_el_eje', () => {
    const { container } = montarSemana([], { dia: '2026-11-04', lineaAhora: () => null });
    const marcas = Array.from(container.querySelectorAll<HTMLElement>('[aria-hidden="true"]')).filter(
      (el) => el.style.getPropertyValue('--cal-arriba') !== '',
    );
    expect(marcas.filter((el) => el.textContent === 'Ahora10:42')).toHaveLength(0);
    expect(container.textContent).not.toContain('Ahora');
  });

  it('DEC_45_A_los_dias_fuera_de_hoy_mas_menos_366_son_columnas_vacias_y_su_encabezado_no_abre_Dia', async () => {
    // Semana del 27/10/2025 al 02/11/2025: el límite inferior es el sábado 01/11/2025.
    const { onNavegar, container } = montarSemana([libreEn('2025-11-01', 10)], { dia: '2025-11-01' });
    const fuera = screen.getAllByRole('button', { name: /^\p{L}{3} \d\d\/\d\d, no disponible$/u });
    expect(fuera.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Lun 27/10, no disponible',
      'Mar 28/10, no disponible',
      'Mié 29/10, no disponible',
      'Jue 30/10, no disponible',
      'Vie 31/10, no disponible',
    ]);
    for (const boton of fuera) expect((boton as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(fuera[0] as HTMLElement);
    expect(onNavegar).not.toHaveBeenCalled();
    // Solo los dos días dentro del rango son columnas; los demás son decorativos y no tienen huecos tocables.
    expect(screen.getAllByRole('list', { name: /^Clases del / })).toHaveLength(2);
    expect(container.querySelectorAll('[aria-hidden="true"]:empty').length).toBeGreaterThanOrEqual(5);
    expect(screen.getByRole('button', { name: 'Abrir el Sáb 01/11, vista Día' })).toBeTruthy();
  });

  it('CAL_03_CA_68_la_flecha_que_saldria_del_rango_queda_deshabilitada_y_dice_por_que', () => {
    montarSemana([], { dia: '2025-11-01' });
    const anterior = screen.getByRole('button', { name: 'Semana anterior, no disponible' });
    expect((anterior as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Semana siguiente' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('CAL_18_sin_clases_dice_No_hay_clases_esta_semana_encima_de_la_grilla_que_sigue_con_sus_huecos_libres', () => {
    montarSemana([libreEn('2026-10-27', 10)]);
    const aviso = screen.getByText('No hay clases esta semana');
    expect(aviso.compareDocumentPosition(grupoDelCalendario()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mar 27/10, 10:00 a 11:00, Libre' })).toBeTruthy();
    expect(screen.queryByText('No hay clases este día')).toBeNull();
  });

  it('CAL_18_con_una_clase_en_la_semana_no_aparece_el_aviso', () => {
    montarSemana([claseEn('2026-10-28', 10)]);
    expect(screen.queryByText('No hay clases esta semana')).toBeNull();
  });

  it('CAL_07_la_clase_de_un_dia_de_la_semana_lleva_su_dia_en_el_nombre_y_abre_el_detalle_de_ese_dia', async () => {
    const { onNavegar } = montarSemana([claseEn('2026-10-30', 10)]);
    await userEvent.click(screen.getByRole('button', { name: 'Vie 30/10, 10:00 a 11:00, Confirmada, Ana Pérez' }));
    // El detalle es el del día de la clase (en escritorio, la columna de acciones), no el `d` de la dirección.
    expect(screen.getByRole('heading', { level: 2, name: 'Clase del viernes, 30 de octubre, 10:00 a 11:00' })).toBeTruthy();
    expect(onNavegar).not.toHaveBeenCalled();
  });

  it('F_CAL_11_cargando_en_Semana_muestra_el_estado_de_carga_con_la_barra_y_la_leyenda_reales', () => {
    montarSemana([], { calendario: { estado: 'cargando' } });
    expect(screen.getAllByRole('status').some((s) => s.textContent?.includes('Cargando la agenda…'))).toBe(true);
    expect(screen.getByRole('heading', { level: 2, name: '26/10/2026 - 01/11/2026' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Leyenda del calendario' })).toBeTruthy();
  });

  it('F_CAL_11_el_error_de_lectura_en_Semana_muestra_el_mensaje_y_Reintentar_relee', async () => {
    const { onRecargarAgenda } = montarSemana([], { calendario: { estado: 'error', mensaje: 'Probá de nuevo.' } });
    expect(screen.getByRole('alert').textContent).toContain('No se pudo cargar la agenda.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRecargarAgenda).toHaveBeenCalledTimes(1);
  });

  it('F_CAL_11_releyendo_deja_la_grilla_de_la_Semana_con_aria_busy', () => {
    montarSemana([claseEn('2026-10-28', 10)], { calendarioReleyendo: true });
    expect(grupoDelCalendario().getAttribute('aria-busy')).toBe('true');
  });

  it('SEC_16_SEC_35_un_nombre_y_un_motivo_de_bloqueo_hostiles_se_ven_literales_en_la_Semana', () => {
    for (const hostil of HOSTILES) {
      const { container, unmount } = montarSemana([
        claseEn('2026-10-26', 10, { quien_toma: hostil, titular: hostil }),
        bloqueoEn('2026-10-27', 10, hostil),
      ]);
      expect(screen.getAllByText(hostil).length).toBeGreaterThanOrEqual(2);
      expect(screen.getByRole('button', { name: new RegExp(`Confirmada, ${escapar(hostil)}$`) })).toBeTruthy();
      expect(screen.getByRole('button', { name: new RegExp(`Bloqueado, ${escapar(hostil)}$`) })).toBeTruthy();
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('script')).toBeNull();
      expect(document.querySelector('script')).toBeNull();
      unmount();
    }
  });

  it('A11Y_la_Semana_de_escritorio_no_tiene_violaciones_de_axe', async () => {
    const { container } = montarSemana(
      [claseEn('2026-11-02', 10), libreEn('2026-11-03', 11), bloqueoEn('2026-11-04', 9, 'Torneo')],
      { dia: '2026-11-04', lineaAhora: (d) => (d === LIMITES.hoy ? { arribaHoras: 2.5, hora: '10:30' } : null) },
    );
    await sinViolacionesAxe(container);
  });

  it('A11Y_la_Semana_con_dias_fuera_del_rango_no_tiene_violaciones_de_axe', async () => {
    const { container } = montarSemana([libreEn('2025-11-01', 10)], { dia: '2025-11-01' });
    await sinViolacionesAxe(container);
  });
});

describe('CC-02 · ventana de 3 días bajo 60 rem (CAL-16, CA-81, NFR-12, A11Y-44, A11Y-49)', () => {
  it('CAL_16_la_ventana_muestra_3_columnas_desde_el_dia_elegido_con_el_rango_de_los_3_dias_en_el_titulo', () => {
    montarSemana([libreEn('2026-10-30', 10)], { ventana: true });
    expect(screen.getByRole('heading', { level: 2, name: '30/10/2026 - 01/11/2026' })).toBeTruthy();
    expect(screen.getAllByRole('list', { name: /^Clases del / })).toHaveLength(3);
    expect(botonesDeEncabezado().map((b) => b.getAttribute('aria-label'))).toEqual([
      'Abrir el Vie 30/10, vista Día',
      'Abrir el Sáb 31/10, vista Día',
      'Abrir el Dom 01/11, vista Día',
    ]);
  });

  it('A11Y_49_las_flechas_de_la_ventana_se_llaman_3_dias_anteriores_y_3_dias_siguientes_y_corren_de_a_3', async () => {
    const { onNavegar } = montarSemana([], { ventana: true });
    await userEvent.click(screen.getByRole('button', { name: '3 días siguientes' }));
    expect(onNavegar).toHaveBeenLastCalledWith({ vista: 'semana', dia: '2026-11-02' });
    await userEvent.click(screen.getByRole('button', { name: '3 días anteriores' }));
    expect(onNavegar).toHaveBeenLastCalledWith({ vista: 'semana', dia: '2026-10-27' });
    expect(screen.queryByRole('button', { name: 'Semana siguiente' })).toBeNull();
  });

  it('H_475_la_flecha_de_la_ventana_se_deshabilita_solo_si_ningun_dia_del_bloque_nuevo_queda_dentro', () => {
    // Último día permitido 03/11/2027: la ventana 04/11 a 06/11 queda fuera; la 01/11 a 03/11 todavía es alcanzable.
    montarSemana([], { ventana: true, dia: '2027-11-01' });
    expect(screen.getByRole('button', { name: '3 días siguientes, no disponible' })).toBeTruthy();
    cleanup();
    montarSemana([], { ventana: true, dia: '2027-10-29' });
    expect((screen.getByRole('button', { name: '3 días siguientes' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('CAL_16_tocar_un_encabezado_de_la_ventana_abre_la_vista_Dia', async () => {
    const { onNavegar } = montarSemana([], { ventana: true });
    await userEvent.click(screen.getByRole('button', { name: 'Abrir el Sáb 31/10, vista Día' }));
    expect(onNavegar).toHaveBeenCalledWith({ vista: 'dia', dia: '2026-10-31' });
  });

  function deslizar(origen: { x: number; y: number }, destino: { x: number; y: number }, tipo = 'touch'): void {
    const grupo = grupoDelCalendario();
    fireEvent.pointerDown(grupo, { pointerId: 7, pointerType: tipo, clientX: origen.x, clientY: origen.y });
    fireEvent.pointerUp(grupo, { pointerId: 7, pointerType: tipo, clientX: destino.x, clientY: destino.y });
  }

  it('CA_81_un_deslizamiento_hacia_la_izquierda_corre_la_ventana_a_los_3_dias_siguientes', () => {
    const { onNavegar } = montarSemana([], { ventana: true });
    deslizar({ x: 300, y: 100 }, { x: 200, y: 110 });
    expect(onNavegar).toHaveBeenCalledTimes(1);
    expect(onNavegar).toHaveBeenCalledWith({ vista: 'semana', dia: '2026-11-02' });
  });

  it('CA_81_un_deslizamiento_hacia_la_derecha_corre_la_ventana_a_los_3_dias_anteriores', () => {
    const { onNavegar } = montarSemana([], { ventana: true });
    deslizar({ x: 100, y: 100 }, { x: 220, y: 90 });
    expect(onNavegar).toHaveBeenCalledWith({ vista: 'semana', dia: '2026-10-27' });
  });

  it('ADR_026_no_es_un_deslizamiento_si_es_corto_mas_vertical_que_horizontal_o_no_es_un_dedo', () => {
    const { onNavegar } = montarSemana([], { ventana: true });
    deslizar({ x: 300, y: 100 }, { x: 300 - (UMBRAL_DESLIZAMIENTO_PX - 1), y: 100 });
    deslizar({ x: 300, y: 100 }, { x: 200, y: 260 });
    deslizar({ x: 300, y: 100 }, { x: 200, y: 100 }, 'mouse');
    deslizar({ x: 300, y: 100 }, { x: 200, y: 100 }, 'pen');
    expect(onNavegar).not.toHaveBeenCalled();
  });

  it('ADR_026_un_gesto_cancelado_no_corre_la_ventana', () => {
    const { onNavegar } = montarSemana([], { ventana: true });
    const grupo = grupoDelCalendario();
    fireEvent.pointerDown(grupo, { pointerId: 7, pointerType: 'touch', clientX: 300, clientY: 100 });
    fireEvent.pointerCancel(grupo, { pointerId: 7, pointerType: 'touch' });
    fireEvent.pointerUp(grupo, { pointerId: 7, pointerType: 'touch', clientX: 100, clientY: 100 });
    expect(onNavegar).not.toHaveBeenCalled();
  });

  it('CAL_16_el_deslizamiento_respeta_el_limite_del_rango_igual_que_la_flecha', () => {
    const { onNavegar } = montarSemana([], { ventana: true, dia: '2027-11-01' });
    deslizar({ x: 300, y: 100 }, { x: 100, y: 100 });
    expect(onNavegar).not.toHaveBeenCalled();
  });

  it('CAL_15_en_escritorio_con_siete_dias_el_deslizamiento_no_corre_nada', () => {
    const { onNavegar } = montarSemana([]);
    deslizar({ x: 300, y: 100 }, { x: 100, y: 100 });
    expect(onNavegar).not.toHaveBeenCalled();
  });

  it('ADR_026_sentidoDeslizamiento_pide_48_px_y_el_doble_en_horizontal_que_en_vertical', () => {
    expect(sentidoDeslizamiento(-48, 0)).toBe(1);
    expect(sentidoDeslizamiento(48, 0)).toBe(-1);
    expect(sentidoDeslizamiento(-47, 0)).toBe(0);
    expect(sentidoDeslizamiento(-100, 50)).toBe(1);
    expect(sentidoDeslizamiento(-100, 51)).toBe(0);
    expect(sentidoDeslizamiento(0, 200)).toBe(0);
  });

  it('A11Y_44_la_ventana_no_suma_ningun_ancho_fijo_a_la_pagina_y_no_tiene_violaciones_de_axe', async () => {
    const { container } = montarSemana([claseEn('2026-10-30', 10), libreEn('2026-10-31', 10)], { ventana: true });
    // Las 3 columnas se reparten el ancho con `minmax(0, 1fr)`: ningún estilo en línea fija un ancho en píxeles.
    expect(container.querySelector('[style*="width"]')).toBeNull();
    await sinViolacionesAxe(container);
  });
});

describe('CC-16 ListaPorDia · «Ver como lista» en Semana (CAL-19, WEB-16, CA-83, A11Y-50)', () => {
  const FILAS = [libreEn('2026-10-26', 10), claseEn('2026-10-30', 10), bloqueoEn('2026-10-31', 10, 'Torneo')];

  it('CAL_19_agrupa_por_dia_con_un_h3_por_dia_en_orden_y_el_boton_pasa_a_Ver_como_calendario', () => {
    montarSemana(FILAS, { modo: 'lista' });
    expect(screen.getByRole('button', { name: 'Ver como calendario' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: /^Calendario, / })).toBeNull();
    const titulos = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titulos).toEqual(ENCABEZADOS);
    expect(screen.getByRole('heading', { level: 2, name: '26/10/2026 - 01/11/2026' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Huecos del Lun 26/10' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Huecos del Vie 30/10' })).toBeTruthy();
    expect(screen.getAllByText('No hay huecos este día')).toHaveLength(4);
  });

  it('CAL_19_el_dia_de_hoy_dice_Hoy_en_su_titulo_y_los_dias_fuera_del_rango_dicen_que_no_estan', () => {
    montarSemana([libreEn('2025-11-01', 10)], { modo: 'lista', dia: '2025-11-01' });
    expect(screen.getAllByText('Fuera del rango')).toHaveLength(5);
    expect(screen.getByRole('list', { name: 'Huecos del Sáb 01/11' })).toBeTruthy();
    cleanup();
    montarSemana([], { modo: 'lista', dia: '2026-11-04' });
    expect(screen.getByRole('heading', { level: 3, name: /^Lun 02\/11 · Hoy$/ })).toBeTruthy();
  });

  it('CAL_19_las_mismas_acciones_que_la_lista_del_dia_tocar_un_hueco_abre_Crear_clase', async () => {
    montarSemana(FILAS, { modo: 'lista' });
    const lista = screen.getByRole('list', { name: 'Huecos del Lun 26/10' });
    await userEvent.click(within(lista).getByRole('button', { name: /10:00 a 11:00/ }));
    expect(screen.getByRole('heading', { level: 2, name: /^Hueco libre del lunes, 26 de octubre/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Crear clase' })).toBeTruthy();
  });

  it('CAL_19_en_la_Semana_no_se_ofrece_Copiar_enlace_de_este_dia', () => {
    const copiar = { enlace: 'https://x.test/#/p/ana?d=2026-10-30', copiar: vi.fn() };
    montarSemana(FILAS, { copiarEnlace: copiar });
    expect(screen.queryByRole('button', { name: /Copiar enlace de este día/ })).toBeNull();
    cleanup();
    montar([libreEn('2026-11-12', 10)], { modo: 'calendario', copiarEnlace: copiar });
    expect(screen.getByRole('button', { name: 'Copiar enlace de este día' })).toBeTruthy();
  });

  it('F_CAL_09_Ver_como_calendario_vuelve_a_la_grilla_con_las_siete_columnas', async () => {
    montarSemana(FILAS, { modo: 'lista' });
    await userEvent.click(screen.getByRole('button', { name: 'Ver como calendario' }));
    expect(screen.getByRole('button', { name: 'Ver como lista' })).toBeTruthy();
    expect(screen.getAllByRole('list', { name: /^Clases del / })).toHaveLength(7);
  });

  it('F_CAL_09_la_lista_de_la_ventana_agrupa_solo_los_3_dias_visibles', () => {
    montarSemana(FILAS, { modo: 'lista', ventana: true });
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Vie 30/10',
      'Sáb 31/10',
      'Dom 01/11',
    ]);
  });

  it('F_CAL_11_cargando_y_error_en_la_lista_de_la_Semana', async () => {
    const cargando = montarSemana([], { modo: 'lista', agenda: { estado: 'cargando', datos: null, error: null } });
    expect(screen.getByText('Cargando los huecos de la semana…')).toBeTruthy();
    cargando.unmount();
    const error = montarSemana([], { modo: 'lista', agenda: { estado: 'error', datos: null, error: 'Probá de nuevo.' } });
    expect(screen.getByRole('alert').textContent).toContain('No se pudo cargar la agenda.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(error.onRecargarAgenda).toHaveBeenCalledTimes(1);
  });

  it.each(HOSTILES)('SEC_16_SEC_35_nombre_observacion_y_motivo_de_bloqueo_hostiles_%s_se_ven_literales_en_la_lista', (hostil) => {
    const filas = [
      claseEn('2026-10-26', 10, { quien_toma: hostil, titular: hostil, observacion: hostil }),
      bloqueoEn('2026-10-27', 10, hostil),
    ];
    const { container } = montarSemana(filas, { modo: 'lista' });
    // «Toma la clase», «Titular», «Observación» y «Motivo» llevan el texto tal cual, escapado por React.
    expect(screen.getAllByText(new RegExp(escapar(hostil))).length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText(`Motivo: ${hostil}`)).toBeTruthy();
    expect(screen.getByText(`Observación: ${hostil}`)).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
  });

  it('A11Y_50_la_lista_de_la_Semana_tiene_un_h2_y_h3_por_dia_sin_saltos_y_sin_violaciones_de_axe', async () => {
    const { container } = montarSemana(FILAS, { modo: 'lista' });
    const titulos = screen.getAllByRole('heading').map((h) => ({ nivel: Number(h.tagName.slice(1)), nombre: h.textContent }));
    // «Pendientes» (solo lectores) y el título del calendario son h2; luego un h3 por día, sin saltos de nivel.
    expect(titulos.filter((t) => t.nivel === 2).map((t) => t.nombre)).toEqual(['Pendientes', '26/10/2026 - 01/11/2026']);
    expect(titulos.filter((t) => t.nivel === 3)).toHaveLength(7);
    expect(titulos.every((t) => t.nivel <= 3)).toBe(true);
    expect(titulos.findIndex((t) => t.nivel === 3)).toBeGreaterThan(titulos.findIndex((t) => t.nivel === 2));
    await sinViolacionesAxe(container);
  });
});

describe('CC-04 EncabezadoDia (CAL-15, DEC-45 A, A11Y-49)', () => {
  it('CAL_15_en_rango_es_un_boton_con_el_nombre_Abrir_el_Lun_26_10_vista_Dia_y_avisa_el_dia', async () => {
    const onAbrir = vi.fn();
    render(<EncabezadoDia dia="2026-10-26" esHoy={false} enRango onAbrir={onAbrir} />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir el Lun 26/10, vista Día' }));
    expect(onAbrir).toHaveBeenCalledWith('2026-10-26');
    expect(screen.getByText('Lun 26/10')).toBeTruthy();
    expect(screen.queryByText('Hoy')).toBeNull();
  });

  it('CAL_10_hoy_suma_el_texto_Hoy_y_aria_current_date', () => {
    render(<EncabezadoDia dia="2026-10-26" esHoy enRango onAbrir={vi.fn()} />);
    const boton = screen.getByRole('button', { name: 'Abrir el Lun 26/10, hoy, vista Día' });
    expect(boton.getAttribute('aria-current')).toBe('date');
    expect(within(boton).getByText('Hoy')).toBeTruthy();
  });

  it('DEC_45_A_fuera_de_rango_esta_deshabilitado_y_lo_dice_en_su_nombre', async () => {
    const onAbrir = vi.fn();
    render(<EncabezadoDia dia="2026-10-26" esHoy={false} enRango={false} onAbrir={onAbrir} />);
    const boton = screen.getByRole('button', { name: 'Lun 26/10, no disponible' });
    expect((boton as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(boton);
    expect(onAbrir).not.toHaveBeenCalled();
  });

  it('CAL_15_sin_onAbrir_es_solo_texto', () => {
    render(<EncabezadoDia dia="2026-10-26" esHoy enRango />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Lun 26/10')).toBeTruthy();
  });

  it('A11Y_el_encabezado_no_tiene_violaciones_de_axe', async () => {
    const { container } = render(
      <div>
        <EncabezadoDia dia="2026-10-26" esHoy enRango onAbrir={vi.fn()} />
        <EncabezadoDia dia="2026-10-27" esHoy={false} enRango={false} onAbrir={vi.fn()} />
      </div>,
    );
    await sinViolacionesAxe(container);
  });
});

describe('SEC-37 · sin estado de agenda en el navegador (M-12)', () => {
  it('SEC_37_recorrer_la_Semana_no_escribe_en_localStorage_ni_en_sessionStorage', async () => {
    const guardar = vi.spyOn(Storage.prototype, 'setItem');
    localStorage.clear();
    sessionStorage.clear();
    const { onNavegar } = montarSemana([claseEn('2026-10-30', 10), libreEn('2026-10-27', 10)], { ventana: true });
    await userEvent.click(screen.getByRole('button', { name: '3 días siguientes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ver como lista' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ver como calendario' }));
    fireEvent.pointerDown(grupoDelCalendario(), { pointerId: 1, pointerType: 'touch', clientX: 300, clientY: 0 });
    fireEvent.pointerUp(grupoDelCalendario(), { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 0 });
    expect(onNavegar).toHaveBeenCalled();
    expect(guardar).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    guardar.mockRestore();
  });
});

// La zona del soporte es la del profesor: las horas de los bloques salen en ella (AGE-08).
describe('Semana · horas en el huso del profesor (AGE-08)', () => {
  it('AGE_08_las_horas_de_la_Semana_son_las_del_huso_del_profesor_y_no_las_del_navegador', () => {
    expect(ZONA).toBe('America/Montevideo');
    montarSemana([ocupada({ inicio: '2026-10-28T13:00:00Z', fin: '2026-10-28T14:00:00Z', clase_id: 'cz' })].flatMap((f) => [claseEn('2026-10-28', 10, { clase_id: f.clase_id })]));
    expect(screen.getByRole('button', { name: 'Mié 28/10, 10:00 a 11:00, Confirmada, Ana Pérez' })).toBeTruthy();
  });
});
