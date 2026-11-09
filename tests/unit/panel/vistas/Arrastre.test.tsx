// @vitest-environment jsdom
// Arrastre de una clase con el mouse en escritorio (B21, T21.2): CAL-13, CAL-14; CA-77, CA-78, CA-79, CA-87; ADR-026;
// F-CAL-08; A11Y-40, A11Y-52; NFR-11. Componentes CC-06 `BloqueClase` (arrastrando), CC-07 `HuecoLibre` (destino «Soltar
// acá»), CC-12 `ConfirmarMovimiento`, el hook `useArrastreClase` y el Panel que los compone. Las reglas son las reales de
// `logica/arrastre.ts` (con `mover` simulado): la vista no calcula ninguna. Consultas por rol y nombre accesible.
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calendarioConElementos,
  moverPorArrastre,
  diasCalendario,
  navegacionCalendario,
  sinClases,
  type FalloPanel,
  type FilaAgendaDias,
} from '../../../../src/modulos/panel/logica';
import type { ReglasArrastre } from '../../../../src/modulos/panel/vistas/arrastre';
import { reglasDeArrastre } from '../../../../src/modulos/panel/vistas/conexionArrastre';
import { ConfirmarMovimiento } from '../../../../src/modulos/panel/vistas/ConfirmarMovimiento';
import { UMBRAL_ARRASTRE_PX } from '../../../../src/modulos/panel/vistas/arrastre';
import { VistaPanel, type VistaPanelProps } from '../../../../src/modulos/panel/vistas/VistaPanel';
import { sinViolacionesAxe } from '../../ui/soporte';
import {
  bloqueoEn,
  bloqueDe,
  calendarioDe,
  claseEn,
  DIA,
  EJE,
  fallo,
  fila,
  filasDias,
  GRILLA,
  H10,
  H11,
  H12,
  libreEn,
  LIBRE_11,
  LIBRE_12,
  montar,
  montarSemana,
  ocupada,
  ZONA,
} from './soporte';

// H-B21-A01: `reglasDeArrastre.mover` llama a `moverPorArrastre` de la lógica; acá se la envuelve para ver con qué.
vi.mock('../../../../src/modulos/panel/logica', async (importar) => {
  const real = await importar<typeof import('../../../../src/modulos/panel/logica')>();
  return { ...real, moverPorArrastre: vi.fn(real.moverPorArrastre) };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Antes de todo lo que hay en las pruebas (las filas de 2026-10 y 2026-11): ningún hueco ya empezó. */
const AHORA = new Date('2026-10-01T12:00:00Z');
/** Ancho de cada columna y alto del eje (08:00 a 18:00 a 5,5 rem por hora y 16 px por rem = 880 px) en la pantalla simulada. */
const ANCHO = 100;
const ALTO = 880;
/** px por hora con esos 5,5 rem: 88. */
const PX_HORA = 88;

/** Altura del puntero dentro de la hora `h` (más 10 px para estar adentro del hueco). */
function yDe(h: number): number {
  return (h - 8) * PX_HORA + 10;
}

/** jsdom no tiene layout: las columnas miden `ANCHO` × `ALTO` una al lado de la otra desde (0, 0). */
function simularColumnas(): void {
  const original = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (!this.hasAttribute('data-columna-dia')) return original.call(this);
    const columnas = Array.from(document.querySelectorAll('[data-columna-dia]'));
    const i = columnas.indexOf(this);
    return { x: i * ANCHO, y: 0, left: i * ANCHO, right: (i + 1) * ANCHO, top: 0, bottom: ALTO, width: ANCHO, height: ALTO, toJSON: () => ({}) };
  });
}

type Reglas = ReglasArrastre & { moverSimulado: ReturnType<typeof vi.fn<ReglasArrastre['mover']>> };

/** Las reglas reales de la lógica ligadas a las columnas del calendario; solo `mover` (la red) es simulado. */
function reglasDe(
  calendario: VistaPanelProps['calendario'],
  profesorActivo = true,
  mover: ReglasArrastre['mover'] = () => Promise.resolve({ ok: true, clase_id: 'c2', fechas: [H11], salteadas: [] }),
): Reglas {
  if (calendario.estado !== 'listo') throw new Error('Sin grilla.');
  const moverSimulado = vi.fn<ReglasArrastre['mover']>(mover);
  const reales = reglasDeArrastre({ columnas: calendario.columnas, eje: EJE, profesorActivo, ahora: AHORA });
  return { ...reales, mover: moverSimulado, moverSimulado };
}

function montarDia(filas: ReturnType<typeof ocupada>[], opciones: Partial<VistaPanelProps> & { mover?: ReglasArrastre['mover'] } = {}) {
  const { mover, ...resto } = opciones;
  const profesorActivo = resto.profesorActivo ?? true;
  const reglas = reglasDe(calendarioDe(filas, DIA, profesorActivo), profesorActivo, mover);
  const m = montar(filas, { modo: 'calendario', escritorio: true, reglasArrastre: reglas, ...resto });
  return { ...m, reglas };
}

const BLOQUE = 'Jue 12/11, 10:00 a 11:00, Confirmada, Ana Pérez';

function bloqueDeClase(nombre: string | RegExp = BLOQUE): HTMLElement {
  return screen.getByRole('button', { name: nombre });
}

const PUNTERO = { pointerId: 1, pointerType: 'mouse', button: 0 };

function tomar(bloque: HTMLElement, x = 50, y = yDe(10)): void {
  fireEvent.pointerDown(bloque, { ...PUNTERO, clientX: x, clientY: y });
}
function llevar(bloque: HTMLElement, x: number, y: number): void {
  fireEvent.pointerMove(bloque, { ...PUNTERO, clientX: x, clientY: y });
}
function soltar(bloque: HTMLElement, x: number, y: number): void {
  fireEvent.pointerUp(bloque, { ...PUNTERO, clientX: x, clientY: y });
}
/** Toma el bloque en (50, 10:00) y lo lleva a (`x`, `y`) sin soltarlo. */
function arrastrarA(bloque: HTMLElement, x: number, y: number): void {
  tomar(bloque);
  llevar(bloque, x, y);
}

beforeEach(simularColumnas);

describe('F-CAL-08 · arrastrar y soltar en Día (CAL-13, CA-77, A11Y-40)', () => {
  it('CAL_13_arrastrar_una_clase_confirmada_futura_la_marca_arrastrando_y_resalta_los_huecos_destino_con_Soltar_aca', () => {
    montarDia([ocupada(), LIBRE_11, LIBRE_12]);
    const bloque = bloqueDeClase();
    expect(bloque.className).toMatch(/arrastrable/);
    arrastrarA(bloque, 50, yDe(11));
    expect(bloque.dataset['arrastrando']).toBe('true');
    // Los dos huecos libres futuros son destinos y dicen «Soltar acá» (texto, no solo color).
    const destinos = screen.getAllByRole('button', { name: /, Libre, Soltar acá$/ });
    expect(destinos).toHaveLength(2);
    for (const d of destinos) {
      expect(within(d).getByText('Soltar acá')).toBeInTheDocument();
      expect(within(d).queryByText('Libre')).toBeNull();
    }
    // El que está bajo el puntero (11:00) se marca activo; el otro no.
    expect(screen.getByRole('button', { name: /^Jue 12\/11, 11:00 a 12:00, Libre, Soltar acá$/ }).className).toMatch(/destinoActivo/);
    expect(screen.getByRole('button', { name: /^Jue 12\/11, 12:00 a 13:00, Libre, Soltar acá$/ }).className).not.toMatch(/destinoActivo/);
  });

  it('CAL_13_el_bloque_sigue_al_puntero_con_variables_y_no_con_valores_fijos', () => {
    montarDia([ocupada(), LIBRE_11]);
    const bloque = bloqueDeClase();
    arrastrarA(bloque, 80, yDe(11));
    const item = bloque.closest('li') as HTMLElement;
    expect(item.style.getPropertyValue('--cal-dx')).toBe('30px');
    expect(item.style.getPropertyValue('--cal-dy')).toBe(`${PX_HORA}px`);
  });

  it('CAL_13_soltar_sobre_un_hueco_libre_futuro_abre_Mover_clase_con_el_texto_del_movimiento_y_no_mueve_todavia', () => {
    const { reglas } = montarDia([ocupada(), LIBRE_11, LIBRE_12]);
    const bloque = bloqueDeClase();
    arrastrarA(bloque, 50, yDe(11));
    soltar(bloque, 50, yDe(11));
    const dialogo = screen.getByRole('dialog', { name: 'Mover clase' });
    expect(within(dialogo).getByText('Mover la clase de Ana Pérez del Jue 12/11 10:00 al Jue 12/11 11:00')).toBeInTheDocument();
    expect(within(dialogo).getByRole('button', { name: 'Mover' })).toBeInTheDocument();
    expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    // Una clase suelta no pregunta el alcance.
    expect(within(dialogo).queryByRole('radiogroup')).toBeNull();
    expect(reglas.moverSimulado).not.toHaveBeenCalled();
    // El bloque ya no se está arrastrando.
    expect(bloque.dataset['arrastrando']).toBeUndefined();
  });

  it('CAL_13_Mover_confirma_con_solo_esta_clase_usa_el_mismo_anuncio_que_Mover_y_relee_la_agenda', async () => {
    const { reglas, onRecargarAgenda, onRecargarContadores } = montarDia([ocupada(), LIBRE_11, LIBRE_12]);
    const bloque = bloqueDeClase();
    arrastrarA(bloque, 50, yDe(12));
    soltar(bloque, 50, yDe(12));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Mover clase' })).getByRole('button', { name: 'Mover' }));
    expect(reglas.moverSimulado).toHaveBeenCalledTimes(1);
    const [origen, destino, alcance] = reglas.moverSimulado.mock.calls[0] ?? [];
    expect(origen?.claseId).toBe('c1');
    expect(destino?.inicio).toBe(H12);
    expect(alcance).toBe('solo_esta');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('status')).toHaveTextContent('Clase movida al 12/11 12:00');
    expect(screen.getByRole('status')).toHaveTextContent('Si el titular tiene mail, le avisamos.');
    expect(onRecargarAgenda).toHaveBeenCalled();
    expect(onRecargarContadores).toHaveBeenCalled();
  });

  it('CA_77_en_una_serie_ofrece_solo_esta_clase_o_de_aca_en_adelante_y_confirma_con_desde_aca', async () => {
    const { reglas } = montarDia([ocupada({ reserva_tipo: 'serie' }), LIBRE_11]);
    const bloque = bloqueDeClase();
    arrastrarA(bloque, 50, yDe(11));
    soltar(bloque, 50, yDe(11));
    const dialogo = screen.getByRole('dialog', { name: 'Mover clase' });
    const grupo = within(dialogo).getByRole('radiogroup', { name: '¿Qué movemos?' });
    expect(within(grupo).getByRole('radio', { name: 'Solo esta clase' })).toBeChecked();
    await userEvent.click(within(grupo).getByRole('radio', { name: 'De acá en adelante' }));
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Mover' }));
    expect(reglas.moverSimulado.mock.calls[0]?.[2]).toBe('desde_aca');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Serie movida: la próxima clase pasa al 12/11 11:00'));
  });

  it('A11Y_52_tras_mover_el_foco_vuelve_al_bloque_movido_cuando_llega_la_lectura_nueva', async () => {
    const { reglas, rerender, props } = montarDia([ocupada(), LIBRE_11]);
    const bloque = bloqueDeClase();
    arrastrarA(bloque, 50, yDe(11));
    soltar(bloque, 50, yDe(11));
    await userEvent.click(screen.getByRole('button', { name: 'Mover' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(reglas.moverSimulado).toHaveBeenCalled();
    // La relectura trae la clase en el hueco nuevo: el foco va a su bloque.
    const nuevas = [fila({ inicio: H10, fin: H11 }), ocupada({ inicio: H11, fin: H12 })];
    rerender(
      <VistaPanel
        {...props}
        agenda={{ estado: 'listo', datos: filasDias(nuevas), error: null }}
        calendario={calendarioDe(nuevas)}
      />,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Jue 12/11, 11:00 a 12:00, Confirmada, Ana Pérez' })).toHaveFocus());
  });

  it('CC_12_la_lectura_nueva_sin_el_bloque_no_roba_el_foco_a_un_hueco_libre_del_mismo_horario', async () => {
    montarDia([ocupada(), LIBRE_11]);
    const bloque = bloqueDeClase();
    arrastrarA(bloque, 50, yDe(11));
    soltar(bloque, 50, yDe(11));
    await userEvent.click(screen.getByRole('button', { name: 'Mover' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Todavía sin relectura: el hueco libre de las 11:00 sigue ahí y no es el bloque movido.
    expect(screen.getByRole('button', { name: 'Jue 12/11, 11:00 a 12:00, Libre' })).not.toHaveFocus();
  });
});

describe('F-CAL-08 · cancelar y destinos inválidos (CAL-14, CA-78, A11Y-40)', () => {
  it('CA_78_Escape_cancela_el_arrastre_sin_diálogo_ni_llamada_y_soltar_despues_no_abre_el_detalle', () => {
    const { reglas } = montarDia([ocupada(), LIBRE_11]);
    const bloque = bloqueDeClase();
    arrastrarA(bloque, 50, yDe(11));
    expect(bloque.dataset['arrastrando']).toBe('true');
    fireEvent.keyDown(bloque, { key: 'Escape' });
    expect(bloque.dataset['arrastrando']).toBeUndefined();
    expect(screen.queryByText('Soltar acá')).toBeNull();
    soltar(bloque, 50, yDe(11));
    // El clic que manda el navegador al soltar no abre el detalle.
    fireEvent.click(bloque);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('heading', { name: /^Clase del / })).toBeNull();
    expect(reglas.moverSimulado).not.toHaveBeenCalled();
  });

  it('CA_78_soltar_sobre_una_clase_ocupada_no_pide_confirmacion_ni_llama_y_el_bloque_vuelve_a_su_lugar', () => {
    const { reglas } = montarDia([ocupada(), ocupada({ inicio: H11, fin: H12, clase_id: 'c9', quien_toma: 'Bruno Díaz', titular: 'Bruno Díaz' })]);
    const bloque = bloqueDeClase();
    arrastrarA(bloque, 50, yDe(11));
    expect(screen.queryByText('Soltar acá')).toBeNull();
    soltar(bloque, 50, yDe(11));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(reglas.moverSimulado).not.toHaveBeenCalled();
    expect(bloque.dataset['arrastrando']).toBeUndefined();
    expect((bloque.closest('li') as HTMLElement).style.getPropertyValue('--cal-dx')).toBe('');
  });

  it('CA_78_soltar_sobre_un_horario_bloqueado_no_mueve_nada', () => {
    const { reglas } = montarDia([ocupada(), fila({ inicio: H11, fin: H12, estado: 'bloqueado', bloqueo_id: 'b1', bloqueo_motivo: 'Torneo' })]);
    const bloque = bloqueDeClase();
    arrastrarA(bloque, 50, yDe(11));
    soltar(bloque, 50, yDe(11));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(reglas.moverSimulado).not.toHaveBeenCalled();
  });

  it('CA_78_soltar_sobre_un_hueco_pasado_no_es_destino', () => {
    const { reglas } = montarDia([ocupada(), fila({ inicio: H11, fin: H12, pasada: true })]);
    const bloque = bloqueDeClase();
    arrastrarA(bloque, 50, yDe(11));
    expect(screen.queryByText('Soltar acá')).toBeNull();
    soltar(bloque, 50, yDe(11));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(reglas.moverSimulado).not.toHaveBeenCalled();
  });

  it('CA_78_soltar_fuera_de_la_grilla_o_de_las_columnas_no_mueve_nada', () => {
    const { reglas } = montarDia([ocupada(), LIBRE_11]);
    const bloque = bloqueDeClase();
    // Abajo del eje, arriba del eje y a la derecha de la única columna.
    for (const [x, y] of [[50, ALTO + 40], [50, -20], [ANCHO + 60, yDe(11)]] as const) {
      arrastrarA(bloque, x, y);
      expect(screen.getByRole('button', { name: /Soltar acá$/ }).className).not.toMatch(/destinoActivo/);
      soltar(bloque, x, y);
    }
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(reglas.moverSimulado).not.toHaveBeenCalled();
  });

  it('CAL_13_Cancelar_cierra_el_dialogo_sin_llamar_a_nada_y_el_foco_vuelve_al_bloque', async () => {
    const { reglas } = montarDia([ocupada(), LIBRE_11]);
    const bloque = bloqueDeClase();
    arrastrarA(bloque, 50, yDe(11));
    soltar(bloque, 50, yDe(11));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(reglas.moverSimulado).not.toHaveBeenCalled();
    await waitFor(() => expect(bloqueDeClase()).toHaveFocus());
    // La clase sigue en su lugar.
    expect(bloqueDeClase()).toBeInTheDocument();
  });

  it('CAL_13_Esc_en_el_dialogo_equivale_a_Cancelar', async () => {
    const { reglas } = montarDia([ocupada(), LIBRE_11]);
    const bloque = bloqueDeClase();
    arrastrarA(bloque, 50, yDe(11));
    soltar(bloque, 50, yDe(11));
    expect(screen.getByRole('dialog', { name: 'Mover clase' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(reglas.moverSimulado).not.toHaveBeenCalled();
    await waitFor(() => expect(bloqueDeClase()).toHaveFocus());
  });

  it('CA_78_un_gesto_cancelado_por_el_navegador_vuelve_el_bloque_a_su_lugar', () => {
    const { reglas } = montarDia([ocupada(), LIBRE_11]);
    const bloque = bloqueDeClase();
    arrastrarA(bloque, 50, yDe(11));
    fireEvent.pointerCancel(bloque, PUNTERO);
    expect(bloque.dataset['arrastrando']).toBeUndefined();
    soltar(bloque, 50, yDe(11));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(reglas.moverSimulado).not.toHaveBeenCalled();
  });

  it('CA_87_si_el_destino_se_ocupo_el_dialogo_muestra_el_mismo_mensaje_de_Mover_no_cambia_nada_y_se_relee', async () => {
    const mensaje = 'Ese horario ya no está libre. Elegí otro.';
    const { reglas, onRecargarAgenda } = montarDia([ocupada(), LIBRE_11], {
      mover: () => Promise.resolve(fallo('HUECO_NO_LIBRE', mensaje, 'p_destino') satisfies FalloPanel),
    });
    const bloque = bloqueDeClase();
    arrastrarA(bloque, 50, yDe(11));
    soltar(bloque, 50, yDe(11));
    await userEvent.click(screen.getByRole('button', { name: 'Mover' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('No se pudo mover; no se cambió nada');
    expect(alerta).toHaveTextContent(mensaje);
    expect(reglas.moverSimulado).toHaveBeenCalledTimes(1);
    expect(onRecargarAgenda).toHaveBeenCalled();
    // El diálogo sigue abierto para cancelar; cancelar deja todo en su lugar.
    expect(screen.getByRole('dialog', { name: 'Mover clase' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('status')?.textContent ?? '').not.toMatch(/movida/);
  });
});

describe('CAL-14 · lo que no se arrastra (CA-78, CA-79, NFR-11)', () => {
  it('CA_78_una_solicitud_pendiente_no_se_arrastra_y_no_lleva_cursor_de_arrastre', () => {
    const { reglas } = montarDia([ocupada({ clase_estado: 'pendiente', solicitud_id: 's1' }), LIBRE_11]);
    const bloque = bloqueDeClase('Jue 12/11, 10:00 a 11:00, Pendiente, Ana Pérez');
    expect(bloque.className).not.toMatch(/arrastrable/);
    arrastrarA(bloque, 50, yDe(11));
    expect(bloque.dataset['arrastrando']).toBeUndefined();
    expect(screen.queryByText('Soltar acá')).toBeNull();
    soltar(bloque, 50, yDe(11));
    expect(reglas.moverSimulado).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('CA_78_una_clase_pasada_no_se_arrastra', () => {
    const { reglas } = montarDia([ocupada({ pasada: true }), LIBRE_11]);
    const bloque = bloqueDeClase();
    expect(bloque.className).not.toMatch(/arrastrable/);
    arrastrarA(bloque, 50, yDe(11));
    expect(bloque.dataset['arrastrando']).toBeUndefined();
    soltar(bloque, 50, yDe(11));
    expect(reglas.moverSimulado).not.toHaveBeenCalled();
  });

  it('CA_79_con_el_profesor_inactivo_ninguna_clase_se_arrastra', () => {
    const { reglas } = montarDia([ocupada(), LIBRE_11], { profesorActivo: false });
    const bloque = bloqueDeClase();
    expect(bloque.className).not.toMatch(/arrastrable/);
    arrastrarA(bloque, 50, yDe(11));
    expect(bloque.dataset['arrastrando']).toBeUndefined();
    expect(screen.queryByText('Soltar acá')).toBeNull();
    soltar(bloque, 50, yDe(11));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(reglas.moverSimulado).not.toHaveBeenCalled();
  });

  it('NFR_11_el_dedo_y_el_lapiz_no_arrastran_solo_el_mouse', () => {
    const { reglas } = montarDia([ocupada(), LIBRE_11]);
    const bloque = bloqueDeClase();
    for (const tipo of ['touch', 'pen']) {
      fireEvent.pointerDown(bloque, { pointerId: 2, pointerType: tipo, button: 0, clientX: 50, clientY: yDe(10) });
      fireEvent.pointerMove(bloque, { pointerId: 2, pointerType: tipo, clientX: 50, clientY: yDe(11) });
      expect(bloque.dataset['arrastrando']).toBeUndefined();
      fireEvent.pointerUp(bloque, { pointerId: 2, pointerType: tipo, clientX: 50, clientY: yDe(11) });
    }
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(reglas.moverSimulado).not.toHaveBeenCalled();
  });

  it('NFR_11_solo_el_boton_principal_arrastra', () => {
    montarDia([ocupada(), LIBRE_11]);
    const bloque = bloqueDeClase();
    fireEvent.pointerDown(bloque, { ...PUNTERO, button: 2, clientX: 50, clientY: yDe(10) });
    llevar(bloque, 50, yDe(11));
    expect(bloque.dataset['arrastrando']).toBeUndefined();
  });

  it('ADR_026_bajo_60_rem_no_hay_arrastre_aunque_las_reglas_esten_conectadas', () => {
    const filas = [ocupada(), LIBRE_11];
    const reglas = reglasDe(calendarioDe(filas));
    montar(filas, { modo: 'calendario', escritorio: false, reglasArrastre: reglas });
    const bloque = bloqueDeClase();
    expect(bloque.className).not.toMatch(/arrastrable/);
    arrastrarA(bloque, 50, yDe(11));
    expect(bloque.dataset['arrastrando']).toBeUndefined();
    expect(screen.queryByText('Soltar acá')).toBeNull();
  });

  it('ADR_026_sin_las_reglas_conectadas_la_grilla_no_arrastra_nada', () => {
    montar([ocupada(), LIBRE_11], { modo: 'calendario', escritorio: true });
    const bloque = bloqueDeClase();
    expect(bloque.className).not.toMatch(/arrastrable/);
    arrastrarA(bloque, 50, yDe(11));
    expect(bloque.dataset['arrastrando']).toBeUndefined();
  });

  it('ADR_026_por_debajo_de_4_px_es_un_clic_que_abre_el_detalle_y_no_un_arrastre', async () => {
    const { reglas } = montarDia([ocupada(), LIBRE_11]);
    const bloque = bloqueDeClase();
    tomar(bloque, 50, 100);
    llevar(bloque, 50 + UMBRAL_ARRASTRE_PX - 1, 100);
    expect(bloque.dataset['arrastrando']).toBeUndefined();
    soltar(bloque, 50 + UMBRAL_ARRASTRE_PX - 1, 100);
    await userEvent.click(bloque);
    expect(screen.getByRole('heading', { name: /^Clase del / })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Mover clase' })).toBeNull();
    expect(reglas.moverSimulado).not.toHaveBeenCalled();
  });

  it('ADR_026_desde_4_px_empieza_el_arrastre', () => {
    montarDia([ocupada(), LIBRE_11]);
    const bloque = bloqueDeClase();
    tomar(bloque, 50, 100);
    llevar(bloque, 50 + UMBRAL_ARRASTRE_PX, 100);
    expect(bloque.dataset['arrastrando']).toBe('true');
  });

  it('ADR_026_sin_package_json_nuevo_el_arrastre_no_suma_dependencias', () => {
    const paquete = JSON.parse(readFileSync('package.json', 'utf-8')) as { dependencies?: object; devDependencies?: object };
    const nombres = Object.keys({ ...paquete.dependencies, ...paquete.devDependencies });
    expect(nombres.filter((n) => /dnd|drag|sortable|interact|gesture/i.test(n))).toEqual([]);
  });
});

describe('F-CAL-08 · Semana (CAL-13, CAL-14; ADR-026)', () => {
  const SEMANA = '2026-10-27';
  const OTRO = '2026-10-29';

  function montarSemanaConReglas(filas: FilaAgendaDias[], extra: Partial<VistaPanelProps> = {}) {
    const profesorActivo = extra.profesorActivo ?? true;
    const navegacion = navegacionCalendario({ vista: 'semana', dia: '2026-10-30' }, { hoy: '2026-10-01', min: '2025-10-01', max: '2027-10-01' });
    const dias = diasCalendario(navegacion.dias.map((d) => d.dia), filas, ZONA);
    const { columnas } = calendarioConElementos(dias, { grilla: GRILLA, duracionMin: 60 }, ZONA, profesorActivo);
    expect(sinClases(dias)).toBe(false);
    const reglas = reglasDeArrastre({ columnas, eje: EJE, profesorActivo, ahora: AHORA });
    const moverSimulado = vi.fn<ReglasArrastre['mover']>(() =>
      Promise.resolve({ ok: true, clase_id: 'c2', fechas: [], salteadas: [] }),
    );
    const m = montarSemana(filas, { reglasArrastre: { ...reglas, mover: moverSimulado }, ...extra });
    return { ...m, moverSimulado };
  }

  it('CAL_13_arrastrar_a_otro_dia_de_la_semana_abre_el_dialogo_con_el_dia_de_destino_y_mueve_a_ese_hueco', async () => {
    const { moverSimulado } = montarSemanaConReglas([claseEn(SEMANA, 10), libreEn(OTRO, 11), libreEn(OTRO, 15)]);
    const bloque = screen.getByRole('button', { name: 'Mar 27/10, 10:00 a 11:00, Confirmada, Ana Pérez' });
    // Siete columnas de 100 px: martes es la segunda (1), jueves la cuarta (3).
    tomar(bloque, 150, yDe(10));
    llevar(bloque, 350, yDe(11));
    expect(screen.getAllByRole('button', { name: /Soltar acá$/ })).toHaveLength(2);
    soltar(bloque, 350, yDe(11));
    const dialogo = screen.getByRole('dialog', { name: 'Mover clase' });
    expect(within(dialogo).getByText('Mover la clase de Ana Pérez del Mar 27/10 10:00 al Jue 29/10 11:00')).toBeInTheDocument();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Mover' }));
    expect(moverSimulado).toHaveBeenCalledTimes(1);
    expect(moverSimulado.mock.calls[0]?.[1].inicio).toBe(`${OTRO}T14:00:00Z`);
  });

  it('CA_78_en_Semana_soltar_sobre_un_dia_sin_hueco_en_ese_horario_o_sobre_un_bloqueo_no_mueve_nada', () => {
    const { moverSimulado } = montarSemanaConReglas([claseEn(SEMANA, 10), bloqueoEn(OTRO, 11, 'Torneo'), claseEn('2026-10-28', 11)]);
    const bloque = screen.getByRole('button', { name: 'Mar 27/10, 10:00 a 11:00, Confirmada, Ana Pérez' });
    tomar(bloque, 150, yDe(10));
    // Bloqueo del jueves y clase del miércoles.
    for (const x of [350, 250]) {
      llevar(bloque, x, yDe(11));
      soltar(bloque, x, yDe(11));
      tomar(bloque, 150, yDe(10));
    }
    fireEvent.keyDown(bloque, { key: 'Escape' });
    soltar(bloque, 150, yDe(10));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(moverSimulado).not.toHaveBeenCalled();
  });

  it('CA_79_en_Semana_con_el_profesor_inactivo_nada_se_arrastra', () => {
    const { moverSimulado } = montarSemanaConReglas([claseEn(SEMANA, 10), libreEn(OTRO, 11)], { profesorActivo: false });
    const bloque = screen.getByRole('button', { name: 'Mar 27/10, 10:00 a 11:00, Confirmada, Ana Pérez' });
    tomar(bloque, 150, yDe(10));
    llevar(bloque, 350, yDe(11));
    expect(bloque.dataset['arrastrando']).toBeUndefined();
    soltar(bloque, 350, yDe(11));
    expect(moverSimulado).not.toHaveBeenCalled();
  });

  it('ADR_026_la_ventana_de_3_dias_no_arrastra_y_sigue_deslizando_con_el_dedo', () => {
    const filas = [claseEn('2026-10-30', 10), libreEn('2026-10-30', 11)];
    const { onNavegar, moverSimulado } = montarSemanaConReglas(filas, { ventana: true, escritorio: false });
    const bloque = screen.getByRole('button', { name: 'Vie 30/10, 10:00 a 11:00, Confirmada, Ana Pérez' });
    tomar(bloque, 50, yDe(10));
    llevar(bloque, 50, yDe(11));
    expect(bloque.dataset['arrastrando']).toBeUndefined();
    soltar(bloque, 50, yDe(11));
    expect(moverSimulado).not.toHaveBeenCalled();
    const grupo = screen.getByRole('group', { name: /^Calendario, / });
    fireEvent.pointerDown(grupo, { pointerId: 7, pointerType: 'touch', clientX: 300, clientY: 100 });
    fireEvent.pointerUp(grupo, { pointerId: 7, pointerType: 'touch', clientX: 100, clientY: 100 });
    expect(onNavegar).toHaveBeenCalled();
  });
});

describe('CC-12 ConfirmarMovimiento (CAL-13, CAL-14, CA-87; A11Y-40)', () => {
  const clase = bloqueDe();
  const DESTINO = { dia: DIA, inicio: H11 };

  function montarDialogo(extra: Partial<Parameters<typeof ConfirmarMovimiento>[0]> = {}) {
    const onConfirmar = vi.fn<Parameters<typeof ConfirmarMovimiento>[0]['onConfirmar']>(() =>
      Promise.resolve({ ok: true, clase_id: 'c2', fechas: [H11], salteadas: [] }),
    );
    const onCancelar = vi.fn();
    const r = render(
      <ConfirmarMovimiento
        clase={clase}
        dia={DIA}
        destino={DESTINO}
        zona={ZONA}
        esSerie={false}
        onConfirmar={onConfirmar}
        onCancelar={onCancelar}
        {...extra}
      />,
    );
    return { ...r, onConfirmar, onCancelar };
  }

  it('CC_12_una_clase_suelta_confirma_con_solo_esta_clase_sin_preguntar_el_alcance', async () => {
    const { onConfirmar } = montarDialogo();
    expect(screen.getByRole('dialog', { name: 'Mover clase' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: '¿Qué movemos?' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Mover' }));
    expect(onConfirmar).toHaveBeenCalledWith('solo_esta');
  });

  it('CC_12_una_serie_pregunta_el_alcance_y_lo_manda', async () => {
    const { onConfirmar } = montarDialogo({ esSerie: true });
    await userEvent.click(screen.getByRole('radio', { name: 'De acá en adelante' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mover' }));
    expect(onConfirmar).toHaveBeenCalledWith('desde_aca');
  });

  it('CC_12_enviando_muestra_Moviendo_con_aria_busy_ignora_Esc_y_no_se_manda_dos_veces', async () => {
    let terminar: (() => void) | undefined;
    const pendiente = vi.fn<Parameters<typeof ConfirmarMovimiento>[0]['onConfirmar']>(
      () =>
        new Promise<Awaited<ReturnType<Parameters<typeof ConfirmarMovimiento>[0]['onConfirmar']>>>((resolver) => {
          terminar = () => resolver({ ok: true, clase_id: 'c2', fechas: [H11], salteadas: [] });
        }),
    );
    const { onCancelar } = montarDialogo({ onConfirmar: pendiente });
    await userEvent.click(screen.getByRole('button', { name: 'Mover' }));
    const enviando = await screen.findByRole('button', { name: 'Moviendo…' });
    expect(enviando).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(enviando);
    await userEvent.keyboard('{Escape}');
    expect(onCancelar).not.toHaveBeenCalled();
    expect(pendiente).toHaveBeenCalledTimes(1);
    await act(async () => {
      terminar?.();
    });
  });

  it('CC_12_un_error_queda_en_un_alert_con_el_titulo_de_Mover_y_vuelve_a_poder_confirmarse', async () => {
    const onConfirmar = vi
      .fn<Parameters<typeof ConfirmarMovimiento>[0]['onConfirmar']>()
      .mockResolvedValueOnce(fallo('SOLICITUD_EN_CURSO', 'La clase tiene un pedido sin responder.'))
      .mockResolvedValueOnce({ ok: true, clase_id: 'c2', fechas: [H11], salteadas: [] });
    montarDialogo({ onConfirmar });
    await userEvent.click(screen.getByRole('button', { name: 'Mover' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('No se pudo mover; no se cambió nada');
    expect(alerta).toHaveTextContent('La clase tiene un pedido sin responder.');
    expect(within(alerta).getByRole('link', { name: 'Ir a la lista' })).toHaveAttribute('href', '#/lista');
    await userEvent.click(screen.getByRole('button', { name: 'Mover' }));
    await waitFor(() => expect(onConfirmar).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('CC_12_Cancelar_y_Esc_llaman_a_onCancelar_sin_confirmar', async () => {
    const { onConfirmar, onCancelar } = montarDialogo();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await userEvent.keyboard('{Escape}');
    expect(onCancelar).toHaveBeenCalledTimes(2);
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it('A11Y_40_el_dialogo_de_una_serie_y_el_de_un_error_no_tienen_violaciones_de_axe', async () => {
    montarDialogo({
      esSerie: true,
      onConfirmar: () => Promise.resolve(fallo('HUECO_NO_LIBRE', 'Ese horario ya no está libre.', 'p_destino')),
    });
    await sinViolacionesAxe(screen.getByRole('dialog', { name: 'Mover clase' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mover' }));
    await screen.findByRole('alert');
    await sinViolacionesAxe(screen.getByRole('dialog', { name: 'Mover clase' }));
  });
});

describe('A11Y-40 · axe durante el arrastre', () => {
  it('A11Y_40_la_grilla_con_una_clase_arrastrandose_y_sus_destinos_no_tiene_violaciones_de_axe', async () => {
    const { container } = montarDia([ocupada(), LIBRE_11, LIBRE_12]);
    const bloque = bloqueDeClase();
    arrastrarA(bloque, 50, yDe(11));
    await sinViolacionesAxe(container);
  });

  it('A11Y_40_el_arrastre_no_cambia_el_nombre_accesible_del_bloque_ni_lo_vuelve_otro_rol', () => {
    montarDia([ocupada(), LIBRE_11]);
    const bloque = bloqueDeClase();
    expect(bloque.tagName).toBe('BUTTON');
    expect(bloque).not.toHaveAttribute('aria-grabbed');
    expect(bloque).toHaveAccessibleName(BLOQUE);
  });
});

describe('H-B21-A03 · la clase se identifica por clase_id, no por su hora (CAL-13, ADR-024 A-4)', () => {
  const ANA = 'Jue 12/11, 10:00 a 11:00, Confirmada, Ana Pérez';
  const BETO = 'Jue 12/11, 10:00 a 11:00, Confirmada, Beto Gómez';
  /** Dos clases a la misma hora, en carriles: Ana es suelta y Beto es de una serie. */
  const MISMA_HORA = () => [
    ocupada({ clase_id: 'c1', quien_toma: 'Ana Pérez', titular: 'Ana Pérez' }),
    ocupada({ clase_id: 'c2', quien_toma: 'Beto Gómez', titular: 'Beto Gómez', reserva_tipo: 'serie' }),
    LIBRE_11,
  ];

  it('CAL_13_solo_la_clase_tomada_se_marca_arrastrando_aunque_otra_empiece_a_la_misma_hora', () => {
    montarDia(MISMA_HORA());
    const beto = bloqueDeClase(BETO);
    arrastrarA(beto, 50, yDe(11));
    expect(beto.dataset['arrastrando']).toBe('true');
    expect(bloqueDeClase(ANA).dataset['arrastrando']).toBeUndefined();
  });

  it('CAL_13_al_cancelar_el_foco_vuelve_al_bloque_de_la_clase_soltada_y_no_al_de_la_misma_hora', async () => {
    montarDia(MISMA_HORA());
    const beto = bloqueDeClase(BETO);
    arrastrarA(beto, 50, yDe(11));
    soltar(beto, 50, yDe(11));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(bloqueDeClase(BETO)).toHaveFocus());
    expect(bloqueDeClase(ANA)).not.toHaveFocus();
  });

  it('CA_77_el_alcance_sale_de_la_clase_tomada_una_serie_pregunta_y_la_suelta_de_a_lado_no', async () => {
    const { reglas } = montarDia(MISMA_HORA());
    const beto = bloqueDeClase(BETO);
    arrastrarA(beto, 50, yDe(11));
    soltar(beto, 50, yDe(11));
    expect(screen.getByRole('radiogroup', { name: '¿Qué movemos?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const ana = bloqueDeClase(ANA);
    arrastrarA(ana, 50, yDe(11));
    soltar(ana, 50, yDe(11));
    expect(screen.queryByRole('radiogroup', { name: '¿Qué movemos?' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Mover' }));
    expect(reglas.moverSimulado.mock.calls[0]?.[0].claseId).toBe('c1');
    expect(reglas.moverSimulado.mock.calls[0]?.[2]).toBe('solo_esta');
  });

  it('CAL_13_el_anuncio_dice_Clase_movida_y_no_Serie_movida_en_una_clase_suelta', async () => {
    montarDia(MISMA_HORA());
    const ana = bloqueDeClase(ANA);
    arrastrarA(ana, 50, yDe(11));
    soltar(ana, 50, yDe(11));
    await userEvent.click(screen.getByRole('button', { name: 'Mover' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Clase movida al 12/11 11:00'));
    expect(screen.getByRole('status').textContent ?? '').not.toMatch(/Serie movida/);
  });

  it('CAL_13_el_anuncio_dice_Serie_movida_en_una_serie_con_de_aca_en_adelante', async () => {
    montarDia(MISMA_HORA());
    const beto = bloqueDeClase(BETO);
    arrastrarA(beto, 50, yDe(11));
    soltar(beto, 50, yDe(11));
    await userEvent.click(screen.getByRole('radio', { name: 'De acá en adelante' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mover' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Serie movida: la próxima clase pasa al 12/11 11:00'));
  });
});

describe('H-B21-A01 · si la clase dejó de poder moverse, contesta la base (INV-01, CA-87)', () => {
  it('INV_01_mover_siempre_llama_a_moverPorArrastre_y_devuelve_su_fallo_sin_fabricar_un_error_en_la_vista', async () => {
    const calendario = calendarioDe([ocupada(), LIBRE_11]);
    if (calendario.estado !== 'listo') throw new Error('Sin grilla.');
    const origen = reglasDeArrastre({ columnas: calendario.columnas, eje: EJE, profesorActivo: true, ahora: AHORA }).origenDe(bloqueDe().fila);
    expect(origen).not.toBeNull();
    // El profesor quedó inactivo después de empezar el gesto: la vista ya no lo decide, lo dice la base.
    const inactivas = reglasDeArrastre({ columnas: calendario.columnas, eje: EJE, profesorActivo: false, ahora: AHORA });
    expect(inactivas.origenDe(bloqueDe().fila)).toBeNull();
    const respuesta = fallo('PROFESOR_INACTIVO', 'Tu agenda está inactiva: no podés mover clases.');
    vi.mocked(moverPorArrastre).mockResolvedValueOnce(respuesta);
    if (origen === null) return;
    const r = await inactivas.mover(origen, { inicio: H11 }, 'solo_esta');
    expect(moverPorArrastre).toHaveBeenCalledWith(origen, { inicio: H11 }, 'solo_esta');
    expect(r).toBe(respuesta);
  });
});

describe('H-B21-S01 · el nombre se muestra como texto (SEC-35, SEC-16)', () => {
  const HOSTIL = '<img src=x onerror=alert(1)>';
  const BIDI = '‮evil‬ 🎾 Ana "<b>Pérez</b>"';

  function conNombre(nombre: string) {
    const alerta = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    const clase = bloqueDe({ quien_toma: nombre, titular: nombre });
    render(
      <ConfirmarMovimiento
        clase={clase}
        dia={DIA}
        destino={{ dia: DIA, inicio: H11 }}
        zona={ZONA}
        esSerie={false}
        onConfirmar={() => Promise.resolve({ ok: true, clase_id: 'c2', fechas: [H11], salteadas: [] })}
        onCancelar={() => undefined}
      />,
    );
    return { alerta, dialogo: screen.getByRole('dialog', { name: 'Mover clase' }) };
  }

  it('SEC_35_un_nombre_con_HTML_se_muestra_literal_sin_crear_elementos_ni_ejecutar_nada', async () => {
    const { alerta, dialogo } = conNombre(HOSTIL);
    expect(within(dialogo).getByText(`Mover la clase de ${HOSTIL} del Jue 12/11 10:00 al Jue 12/11 11:00`)).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(dialogo.querySelector('[onerror]')).toBeNull();
    expect(alerta).not.toHaveBeenCalled();
    await sinViolacionesAxe(dialogo);
  });

  it('SEC_16_un_nombre_con_RTL_emoji_y_comillas_se_muestra_literal', () => {
    const { dialogo } = conNombre(BIDI);
    expect(within(dialogo).getByText(`Mover la clase de ${BIDI} del Jue 12/11 10:00 al Jue 12/11 11:00`)).toBeInTheDocument();
    expect(dialogo.querySelector('b')).toBeNull();
  });
});
