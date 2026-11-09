// @vitest-environment jsdom
// B22 · T22.1 (UX web): teclado y lectura de la grilla del calendario. A11Y-35 (orden del DOM = orden de lectura), A11Y-36
// (nombres accesibles, DEC-43 A), A11Y-37 (un solo tope de Tab y flechas), A11Y-39 («Mover» como alternativa al arrastre),
// A11Y-45 (nombre largo completo); NFR-11; CA-89. Componentes CC-02, CC-05, CC-06..08, CC-11, CC-13 y el Panel que los
// compone. Consultas por rol y nombre accesible (sin data-testid).
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CalendarioPanel } from '../../../../src/modulos/panel/vistas/CalendarioPanel';
import {
  destinoDeTecla,
  itemActivo,
  type ItemNavegable,
} from '../../../../src/modulos/panel/vistas/tecladoGrilla';
import { acciones, calendarioDe, claseEn, DIA, EJE, fila, H10, H11, LIBRE_11, LIBRE_12, libreEn, montar, montarSemana, ocupada, ZONA } from './soporte';

afterEach(cleanup);

const GRUPO_DIA = { name: 'Calendario, 12/11/2026' };

function grilla(): HTMLElement {
  return screen.getByRole('group', { name: /^Calendario, / });
}

/** Los botones de la grilla (no los encabezados de día de la Semana), en el orden del DOM. */
function items(): HTMLElement[] {
  return within(grilla())
    .getAllByRole('button')
    .filter((b) => b.hasAttribute('data-nav'));
}

function nombres(): string[] {
  return items().map((b) => b.getAttribute('aria-label') ?? '');
}

/** Tab desde el botón anterior a la grilla hasta que el foco entra en ella (máx. 12 pasos). */
async function entrarEnLaGrilla(): Promise<HTMLElement> {
  screen.getByRole('button', { name: 'Ver como lista' }).focus();
  for (let i = 0; i < 12 && !grilla().contains(document.activeElement); i += 1) await userEvent.tab();
  if (!(document.activeElement instanceof HTMLElement) || !grilla().contains(document.activeElement)) {
    throw new Error('Tab no entró en la grilla.');
  }
  return document.activeElement;
}

/** WCAG 2.5.3 como la comprueba axe: el texto visible completo, sin mayúsculas ni signos, está dentro del nombre accesible. */
function normalizado(texto: string): string {
  return texto.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function expectVisibleEnElNombre(botones: HTMLElement[]): void {
  expect(botones.length).toBeGreaterThan(0);
  for (const boton of botones) {
    const nombre = normalizado(boton.getAttribute('aria-label') ?? '');
    const visible = normalizado(boton.textContent ?? '');
    expect(visible, boton.getAttribute('aria-label') ?? '').not.toBe('');
    expect(nombre, `visible «${visible}»`).toContain(visible);
  }
}

const PENDIENTE_11 = ocupada({ inicio: H11, fin: '2026-11-12T15:00:00Z', clase_id: 'c2', clase_estado: 'pendiente', solicitud_id: 's1', quien_toma: 'Bruno Díaz' });
const BLOQUEO_13 = fila({ inicio: '2026-11-12T16:00:00Z', fin: '2026-11-12T17:00:00Z', estado: 'bloqueado', bloqueo_id: 'b1', bloqueo_motivo: 'Torneo' });

const DIA_CON_TODO = () => [
  ocupada(),
  LIBRE_11,
  LIBRE_12,
  fila({ inicio: '2026-11-12T16:00:00Z', fin: '2026-11-12T17:00:00Z', estado: 'bloqueado', bloqueo_id: 'b1', bloqueo_motivo: 'Torneo' }),
];

describe('A11Y-37 · destinoDeTecla (puro)', () => {
  const ITEMS: ItemNavegable[] = [
    { id: 'lun|a', columna: 0, inicioMin: 600 },
    { id: 'lun|b', columna: 0, inicioMin: 660 },
    { id: 'mar|a', columna: 1, inicioMin: 540 },
    { id: 'mar|b', columna: 1, inicioMin: 630 },
    { id: 'mar|c', columna: 1, inicioMin: 720 },
    { id: 'jue|a', columna: 3, inicioMin: 660 },
  ];

  it('A11Y_37_arriba_y_abajo_van_entre_los_items_del_dia_y_no_dan_la_vuelta', () => {
    expect(destinoDeTecla(ITEMS, 'mar|a', 'ArrowDown')).toBe('mar|b');
    expect(destinoDeTecla(ITEMS, 'mar|b', 'ArrowUp')).toBe('mar|a');
    expect(destinoDeTecla(ITEMS, 'mar|a', 'ArrowUp')).toBeNull();
    expect(destinoDeTecla(ITEMS, 'mar|c', 'ArrowDown')).toBeNull();
  });

  it('A11Y_37_Inicio_y_Fin_van_al_primero_y_al_ultimo_del_dia', () => {
    expect(destinoDeTecla(ITEMS, 'mar|b', 'Home')).toBe('mar|a');
    expect(destinoDeTecla(ITEMS, 'mar|b', 'End')).toBe('mar|c');
  });

  it('A11Y_37_izquierda_y_derecha_van_al_item_del_mismo_horario_o_al_mas_cercano_del_dia_contiguo', () => {
    expect(destinoDeTecla(ITEMS, 'lun|a', 'ArrowRight')).toBe('mar|b'); // 10:00 -> 10:30 (el más cercano; 09:00 está a 60)
    expect(destinoDeTecla(ITEMS, 'lun|b', 'ArrowRight')).toBe('mar|b'); // 11:00 -> 10:30 (a 30) frente a 12:00 (a 60)
    expect(destinoDeTecla(ITEMS, 'mar|b', 'ArrowLeft')).toBe('lun|a'); // 10:30 equidistante: el más temprano
  });

  it('A11Y_37_las_columnas_sin_items_se_saltan_y_los_extremos_no_dan_la_vuelta', () => {
    expect(destinoDeTecla(ITEMS, 'mar|c', 'ArrowRight')).toBe('jue|a');
    expect(destinoDeTecla(ITEMS, 'jue|a', 'ArrowLeft')).toBe('mar|b');
    expect(destinoDeTecla(ITEMS, 'jue|a', 'ArrowRight')).toBeNull();
    expect(destinoDeTecla(ITEMS, 'lun|a', 'ArrowLeft')).toBeNull();
  });

  it('A11Y_37_el_item_activo_es_el_elegido_si_sigue_en_la_grilla_y_si_no_el_primero', () => {
    expect(itemActivo(ITEMS, 'mar|b')).toBe('mar|b');
    expect(itemActivo(ITEMS, 'ya-no-esta')).toBe('lun|a');
    expect(itemActivo(ITEMS, null)).toBe('lun|a');
    expect(itemActivo([], null)).toBeNull();
  });
});

describe('A11Y-37 · un solo tope de Tab y flechas en la vista Día (CC-02, CC-05)', () => {
  it('A11Y_37_solo_un_item_de_la_grilla_tiene_tabindex_0_y_es_el_primero', () => {
    montar(DIA_CON_TODO(), { modo: 'calendario' });
    const lista = items();
    expect(lista).toHaveLength(4);
    expect(lista.map((b) => b.tabIndex)).toEqual([0, -1, -1, -1]);
  });

  it('A11Y_37_Tab_entra_en_el_item_activo_y_el_siguiente_Tab_sale_de_la_grilla_sin_trampas', async () => {
    montar(DIA_CON_TODO(), { modo: 'calendario' });
    const primero = await entrarEnLaGrilla();
    expect(primero).toBe(items()[0]);
    await userEvent.tab();
    expect(grilla().contains(document.activeElement)).toBe(false);
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(primero);
  });

  it('A11Y_37_las_flechas_mueven_el_foco_y_el_tope_de_Tab_lo_sigue', async () => {
    montar(DIA_CON_TODO(), { modo: 'calendario' });
    await entrarEnLaGrilla();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(items()[1]);
    expect(items().map((b) => b.tabIndex)).toEqual([-1, 0, -1, -1]);
    await userEvent.keyboard('{End}');
    expect(document.activeElement).toBe(items()[3]);
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(items()[3]);
    await userEvent.keyboard('{Home}');
    expect(document.activeElement).toBe(items()[0]);
    await userEvent.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(items()[0]);
    // En el día solo hay una columna: izquierda y derecha no hacen nada.
    await userEvent.keyboard('{ArrowRight}{ArrowLeft}');
    expect(document.activeElement).toBe(items()[0]);
  });

  it('A11Y_37_si_el_foco_vuelve_por_programa_o_con_el_mouse_a_un_bloque_ese_es_el_tope_de_Tab', async () => {
    montar(DIA_CON_TODO(), { modo: 'calendario' });
    act(() => items()[2]?.focus());
    expect(items().map((b) => b.tabIndex)).toEqual([-1, -1, 0, -1]);
  });

  it('A11Y_37_Enter_y_Espacio_abren_el_detalle_del_item_con_el_foco_y_Esc_devuelve_el_foco_a_ese_bloque', async () => {
    montar(DIA_CON_TODO(), { modo: 'calendario' });
    await entrarEnLaGrilla();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByRole('heading', { level: 2 })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(items()[1]));
    await userEvent.keyboard(' ');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('A11Y_37_con_otras_teclas_con_modificador_no_se_mueve_nada_ni_se_bloquea_Tab', async () => {
    montar(DIA_CON_TODO(), { modo: 'calendario' });
    await entrarEnLaGrilla();
    await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}');
    expect(document.activeElement).toBe(items()[0]);
    await userEvent.keyboard('a');
    expect(document.activeElement).toBe(items()[0]);
  });

  it('A11Y_37_lo_decorativo_no_entra_en_el_orden_un_hueco_pasado_y_un_bloqueo_ajeno_no_son_items', () => {
    montar(
      [
        fila({ pasada: true }),
        LIBRE_11,
        fila({ inicio: H10.replace('13', '16'), fin: H10.replace('13', '17'), estado: 'bloqueado', bloqueo_id: null }),
      ],
      { modo: 'calendario' },
    );
    expect(nombres()).toEqual(['Jue 12/11, 11:00 a 12:00, Libre']);
  });

  it('A11Y_37_sin_acciones_conectadas_la_grilla_es_solo_lectura_y_no_tiene_topes_de_Tab', () => {
    render(
      <CalendarioPanel
        estado={calendarioDe(DIA_CON_TODO())}
        titulo="12/11/2026"
        zona={ZONA}
        eje={EJE}
        onReintentar={vi.fn()}
      />,
    );
    expect(within(grilla()).queryAllByRole('button')).toHaveLength(0);
  });
});

describe('A11Y-37 · flechas en la Semana (CC-02, CC-05; CAL-15)', () => {
  const LUN = '2026-10-26';
  const MAR = '2026-10-27';
  const MIE = '2026-10-28';

  function semana() {
    return montarSemana([libreEn(LUN, 9), claseEn(LUN, 10), libreEn(MAR, 10), libreEn(MAR, 14), libreEn(MIE, 9), libreEn(MIE, 11)]);
  }

  it('A11Y_35_la_grilla_se_recorre_de_lunes_a_domingo_y_dentro_de_cada_dia_por_hora', () => {
    semana();
    expect(nombres()).toEqual([
      'Lun 26/10, 09:00 a 10:00, Libre',
      'Lun 26/10, 10:00 a 11:00, Confirmada, Ana Pérez',
      'Mar 27/10, 10:00 a 11:00, Libre',
      'Mar 27/10, 14:00 a 15:00, Libre',
      'Mié 28/10, 09:00 a 10:00, Libre',
      'Mié 28/10, 11:00 a 12:00, Libre',
    ]);
  });

  it('A11Y_37_derecha_pasa_al_dia_contiguo_en_el_mismo_horario_y_izquierda_vuelve', async () => {
    semana();
    act(() => items()[1]?.focus()); // Lun 10:00
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(items()[2]); // Mar 10:00
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(items()[4]); // Mié 09:00 (a 60) y 11:00 (a 60): el más temprano
    await userEvent.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(items()[2]); // Mar 10:00 (el más cercano a 09:00; 14:00 está a 300)
  });

  it('A11Y_37_los_encabezados_de_dia_siguen_siendo_botones_aparte_y_no_forman_parte_de_las_flechas', async () => {
    semana();
    const encabezado = screen.getByRole('button', { name: 'Abrir el Lun 26/10, vista Día' });
    expect(encabezado.hasAttribute('data-nav')).toBe(false);
    expect(encabezado.tabIndex).toBe(0);
  });

  it('A11Y_37_un_solo_item_de_la_Semana_es_tope_de_Tab', () => {
    semana();
    expect(items().filter((b) => b.tabIndex === 0)).toHaveLength(1);
  });

  it('A11Y_37_en_la_ventana_de_3_dias_las_flechas_tambien_cambian_de_horario_y_de_dia', async () => {
    montarSemana([libreEn(LUN, 9), libreEn(MAR, 9), libreEn(MIE, 9)], { dia: LUN, ventana: true });
    act(() => items()[0]?.focus());
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(document.activeElement).toBe(items()[2]);
  });
});

describe('A11Y-35 · orden del DOM = orden de lectura (CC-01, CC-02, CC-10, CC-11, CC-13)', () => {
  function antes(a: Element, b: Element): boolean {
    return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  }

  it('A11Y_35_barra_ver_como_leyenda_ayuda_aviso_de_vacio_y_grilla_van_en_ese_orden', () => {
    montar([LIBRE_11], { modo: 'calendario' });
    const barra = screen.getByRole('navigation', { name: /calendario/i });
    const ver = screen.getByRole('button', { name: 'Ver como lista' });
    const leyenda = screen.getByRole('list', { name: 'Leyenda del calendario' });
    const ayuda = screen.getByText(/^Toque un horario libre/);
    const vacio = screen.getByText('No hay clases este día');
    const grupo = screen.getByRole('group', GRUPO_DIA);
    const orden = [barra, ver, leyenda, ayuda, vacio, grupo];
    orden.slice(1).forEach((e, i) => expect(antes(orden[i] as Element, e)).toBe(true));
  });

  it('A11Y_35_la_grilla_es_un_grupo_Calendario_con_su_titulo_descrito_por_la_ayuda_y_el_teclado', () => {
    montar([ocupada(), LIBRE_11], { modo: 'calendario' });
    expect(screen.getByRole('group', GRUPO_DIA)).toHaveAccessibleDescription(/Toque un horario libre.*Tab entra en la grilla y las flechas cambian de horario/);
  });

  it('A11Y_35_con_el_detalle_en_columna_la_columna_de_acciones_va_despues_de_la_grilla', async () => {
    montar([ocupada(), LIBRE_11], { modo: 'calendario', escritorio: true });
    await userEvent.click(items()[0] as HTMLElement);
    const detalle = await screen.findByRole('heading', { level: 2, name: /10:00/ });
    expect(antes(screen.getByRole('group', GRUPO_DIA), detalle)).toBe(true);
  });
});

describe('A11Y-36 · nombres accesibles de huecos, clases, solicitudes y bloqueos (CC-06, CC-07, CC-08; DEC-43 A)', () => {
  it('A11Y_36_cada_item_es_un_boton_con_dia_hora_estado_y_nombre_y_el_texto_visible_esta_contenido', () => {
    montar(
      [
        ocupada(),
        ocupada({ inicio: H11, fin: '2026-11-12T15:00:00Z', clase_id: 'c2', clase_estado: 'pendiente', solicitud_id: 's1', quien_toma: 'Bruno Díaz' }),
        LIBRE_12,
        fila({ inicio: '2026-11-12T16:00:00Z', fin: '2026-11-12T17:00:00Z', estado: 'bloqueado', bloqueo_id: 'b1', bloqueo_motivo: 'Torneo' }),
      ],
      { modo: 'calendario' },
    );
    expect(nombres()).toEqual([
      'Jue 12/11, 10:00 a 11:00, Confirmada, Ana Pérez',
      'Jue 12/11, 11:00 a 12:00, Pendiente, Bruno Díaz',
      'Jue 12/11, 12:00 a 13:00, Libre',
      'Jue 12/11, 13:00 a 14:00, Bloqueado, Torneo',
    ]);
    expectVisibleEnElNombre(items());
  });

  it('A11Y_36_H_T22_01_2_5_3_el_texto_visible_completo_normalizado_esta_contenido_en_el_nombre_en_todos_los_bloques', () => {
    const cancelada = ocupada({ clase_id: 'c3', inicio: '2026-11-12T17:00:00Z', fin: '2026-11-12T18:00:00Z', solicitud_id: 's9' });
    const sinMotivo = fila({ inicio: '2026-11-12T19:00:00Z', fin: '2026-11-12T20:00:00Z', estado: 'bloqueado', bloqueo_id: 'b2', bloqueo_motivo: null });
    const filas = [ocupada(), PENDIENTE_11, LIBRE_12, BLOQUEO_13, cancelada, sinMotivo];
    montar(filas, { modo: 'calendario', calendario: calendarioDe(filas, DIA, true, { s9: 'cancelacion' }) });
    expect(items()).toHaveLength(6);
    expectVisibleEnElNombre(items());
    // Lo que axe lee es el texto del botón: sin espacio entre los trozos quedaría «ConfirmadaAna Pérez».
    expect(items()[0]?.textContent).toBe('Confirmada Ana Pérez');
    expect(items()[4]?.textContent).toBe('Confirmada Cancelación pendiente Ana Pérez');
    expect(items()[3]?.textContent).toBe('Bloqueado Torneo');
  });

  it('A11Y_36_H_T22_01_el_encabezado_de_hoy_en_la_Semana_tambien_tiene_su_texto_visible_en_el_nombre', () => {
    montarSemana([], { dia: '2026-11-04', lineaAhora: () => null });
    const encabezados = screen.getAllByRole('button', { name: /^Abrir el / });
    expectVisibleEnElNombre(encabezados);
    expect(screen.getByRole('button', { name: /hoy, vista Día$/ }).textContent).toBe('Lun 02/11 Hoy');
  });

  it('A11Y_36_DEC_43_A_la_confirmada_con_cancelacion_pendiente_lo_dice_en_el_nombre', () => {
    const f = ocupada({ solicitud_id: 's9' });
    montar([f], { modo: 'calendario', calendario: calendarioDe([f], DIA, true, { s9: 'cancelacion' }) });
    expect(nombres()).toEqual(['Jue 12/11, 10:00 a 11:00, Confirmada, Cancelación pendiente, Ana Pérez']);
  });

  it('A11Y_36_un_nombre_hostil_sigue_siendo_texto_y_no_rompe_el_nombre_accesible', () => {
    montar([ocupada({ quien_toma: '<b>Ana</b><img src=x onerror=alert(1)>' })], { modo: 'calendario' });
    expect(nombres()).toEqual(['Jue 12/11, 10:00 a 11:00, Confirmada, <b>Ana</b><img src=x onerror=alert(1)>']);
    expect(grilla().querySelector('b, img')).toBeNull();
  });
});

describe('A11Y-45 · un nombre largo se trunca solo a la vista (CC-06)', () => {
  const LARGO = 'María de los Ángeles Fernández de la Vega y Castellanos Pérez';

  it('A11Y_45_el_nombre_accesible_y_el_detalle_lo_dan_completo', async () => {
    montar([ocupada({ quien_toma: LARGO, titular: LARGO })], { modo: 'calendario' });
    const boton = items()[0] as HTMLElement;
    expect(boton).toHaveAccessibleName(`Jue 12/11, 10:00 a 11:00, Confirmada, ${LARGO}`);
    await userEvent.click(boton);
    expect(within(await screen.findByRole('dialog')).getAllByText(new RegExp(LARGO)).length).toBeGreaterThan(0);
  });
});

describe('A11Y-39 · «Mover» es la alternativa al arrastre y se hace solo con teclado (CC-13, CAL-13; CA-77, CA-89)', () => {
  it('A11Y_39_con_solo_el_teclado_se_llega_a_la_clase_se_abre_Mover_se_elige_el_hueco_y_se_confirma', async () => {
    const simuladas = acciones();
    montar([ocupada(), LIBRE_11, LIBRE_12], { modo: 'calendario', simuladas });
    await entrarEnLaGrilla();
    expect(document.activeElement).toHaveAccessibleName('Jue 12/11, 10:00 a 11:00, Confirmada, Ana Pérez');
    await userEvent.keyboard('{Enter}');
    const dialogo = await screen.findByRole('dialog');
    // «Mover» se alcanza con Tab dentro del diálogo.
    for (let i = 0; i < 12 && document.activeElement !== within(dialogo).getByRole('button', { name: 'Mover' }); i += 1) {
      await userEvent.tab();
    }
    expect(document.activeElement).toBe(within(dialogo).getByRole('button', { name: 'Mover' }));
    await userEvent.keyboard('{Enter}');
    const horarios = await within(dialogo).findByRole('radiogroup', { name: /Horario de destino/ });
    within(horarios).getByRole('radio', { name: '12:00 a 13:00' }).focus();
    await userEvent.keyboard(' ');
    const confirmar = within(dialogo).getByRole('button', { name: 'Mover clase' });
    confirmar.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(simuladas.mover).toHaveBeenCalledTimes(1));
    expect(simuladas.mover).toHaveBeenCalledWith('c1', '2026-11-12T15:00:00Z', 'solo_esta');
    expect(await screen.findByText('Clase movida al 12/11 12:00')).toBeInTheDocument();
  });

  it('A11Y_39_Mover_no_se_anuncia_como_arrastre_ni_el_bloque_es_la_unica_via', () => {
    montar([ocupada(), LIBRE_11], { modo: 'calendario' });
    const clase = items()[0] as HTMLElement;
    expect(clase.tagName).toBe('BUTTON');
    expect(clase).not.toHaveAttribute('aria-grabbed');
    expect(clase.getAttribute('aria-label')).not.toMatch(/arrastr/i);
    expect(screen.queryByText(/arrastr/i)).toBeNull();
  });
});
