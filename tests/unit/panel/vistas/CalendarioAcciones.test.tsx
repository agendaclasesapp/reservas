// @vitest-environment jsdom
// Calendario del Panel, vista Día: huecos, bloqueos, detalle y acciones (B18, T18.2): CAL-03 (H-B17-03 «Elegir día»),
// CAL-05, CAL-06, CAL-11, CAL-17, CAL-18; WEB-14; CA-70, CA-71, CA-75, CA-79, CA-82; SEC-16, SEC-35; A11Y-36, A11Y-38,
// A11Y-48, A11Y-53. Componentes CC-07 `HuecoLibre`, CC-08 `BloqueBloqueo`, CC-10 `LeyendaCalendario`, CC-11
// `AyudaCalendario`, CC-13 `DetalleCalendario`, CC-02 `CalendarioPanel` (vacío y error) y CC-01 `BarraCalendario`.
// Consultas por rol y nombre accesible (sin data-testid).
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ElementoBloqueo, ElementoHueco } from '../../../../src/modulos/panel/logica';
import { AyudaCalendario } from '../../../../src/modulos/panel/vistas/AyudaCalendario';
import { BarraCalendario } from '../../../../src/modulos/panel/vistas/BarraCalendario';
import { BloqueBloqueo } from '../../../../src/modulos/panel/vistas/BloqueBloqueo';
import { CalendarioPanel } from '../../../../src/modulos/panel/vistas/CalendarioPanel';
import { HuecoLibre } from '../../../../src/modulos/panel/vistas/HuecoLibre';
import { LeyendaCalendario } from '../../../../src/modulos/panel/vistas/LeyendaCalendario';
import { VistaPanel } from '../../../../src/modulos/panel/vistas/VistaPanel';
import { sinViolacionesAxe } from '../../ui/soporte';
import {
  acciones,
  calendarioDe,
  columnaDe,
  EJE,
  fila,
  H11,
  H12,
  H13,
  LIBRE_11,
  LIBRE_12,
  LIMITES,
  montar,
  ocupada,
  ZONA,
} from './soporte';

afterEach(cleanup);

const HOSTILES = ['<img src=x onerror=alert(1)>', 'x"><script>alert(1)</script>'];
const TITULO = '12/11/2026';
const AYUDA = 'Toque un horario libre para crear una clase; con el teclado, use las acciones del hueco';

function bloqueo(extra: Partial<Parameters<typeof fila>[0]> = {}) {
  return fila({ estado: 'bloqueado', bloqueo_id: 'b1', bloqueo_motivo: 'Torneo', ...extra });
}

function huecoDe(extra: Partial<Parameters<typeof fila>[0]> = {}): ElementoHueco {
  const e = columnaDe([fila({ inicio: H11, fin: H12, ...extra })]).elementos[0];
  if (e?.tipo !== 'hueco') throw new Error('No es un hueco.');
  return e;
}

function bloqueoDe(extra: Partial<Parameters<typeof fila>[0]> = {}): ElementoBloqueo {
  const e = columnaDe([bloqueo(extra)]).elementos[0];
  if (e?.tipo !== 'bloqueo') throw new Error('No es un bloqueo.');
  return e;
}

describe('CC-07 HuecoLibre (CAL-05, CA-70, A11Y-36)', () => {
  it('CAL_05_CA_70_un_hueco_libre_futuro_dentro_de_la_grilla_es_un_boton_con_nombre_y_avisa_al_tocarlo', async () => {
    const onAbrir = vi.fn();
    const hueco = huecoDe();
    expect(hueco.tocable).toBe(true);
    render(<ul><HuecoLibre hueco={hueco} zona={ZONA} onAbrir={onAbrir} /></ul>);
    const boton = screen.getByRole('button', { name: 'Jue 12/11, 11:00 a 12:00, Libre' });
    expect(boton.textContent).toBe('Libre');
    await userEvent.click(boton);
    expect(onAbrir).toHaveBeenCalledWith(hueco);
  });

  it('CAL_05_CA_70_un_hueco_libre_que_ya_paso_no_es_un_boton_ni_se_anuncia_como_libre', () => {
    const hueco = huecoDe({ pasada: true });
    expect(hueco.tocable).toBe(false);
    const { container } = render(<ul><HuecoLibre hueco={hueco} zona={ZONA} onAbrir={vi.fn()} /></ul>);
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.textContent).not.toContain('Libre');
    expect(container.querySelector('li')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('CAL_05_CA_70_fuera_de_la_grilla_el_fondo_va_sombreado_y_el_hueco_no_se_toca', () => {
    // 13:00 a 14:00 es el corte entre los dos tramos de la grilla inicial.
    const columna = columnaDe([fila({ inicio: H13, fin: '2026-11-12T17:00:00Z' })]);
    expect(columna.zonasFueraDeTramo).toHaveLength(1);
    const { container } = render(
      <CalendarioPanel
        estado={{ estado: 'listo', columnas: [columna], sinClases: true }}
        titulo={TITULO}
        zona={ZONA}
        eje={EJE}
        onReintentar={vi.fn()}
        onAbrirHueco={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Libre/ })).toBeNull();
    // La capa decorativa de zonas va antes de la lista de elementos en la columna.
    const zonas = container.querySelector('ul[aria-label^="Clases del"]')?.previousElementSibling;
    expect(zonas?.getAttribute('aria-hidden')).toBe('true');
    expect(zonas?.children).toHaveLength(1);
  });

  it('CAL_05_sin_onAbrir_un_hueco_libre_es_solo_lectura', () => {
    render(<ul><HuecoLibre hueco={huecoDe()} zona={ZONA} /></ul>);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('CC-08 BloqueBloqueo (CAL-06, CA-71, SEC-16, SEC-35, A11Y-36)', () => {
  it('CAL_06_CA_71_un_bloqueo_propio_con_motivo_dice_BLOQUEADO_y_Torneo_y_es_un_boton', async () => {
    const onAbrir = vi.fn();
    const b = bloqueoDe();
    expect(b.tocable).toBe(true);
    render(<ul><BloqueBloqueo bloqueo={b} zona={ZONA} onAbrir={onAbrir} /></ul>);
    const boton = screen.getByRole('button', { name: 'Jue 12/11, 10:00 a 11:00, Bloqueado, Torneo' });
    expect(within(boton).getByText('Bloqueado')).toBeTruthy();
    expect(within(boton).getByText('Torneo')).toBeTruthy();
    await userEvent.click(boton);
    expect(onAbrir).toHaveBeenCalledWith(b);
  });

  it('CAL_06_un_bloqueo_sin_motivo_dice_solo_Bloqueado', () => {
    render(<ul><BloqueBloqueo bloqueo={bloqueoDe({ bloqueo_motivo: null })} zona={ZONA} onAbrir={vi.fn()} /></ul>);
    expect(screen.getByRole('button', { name: 'Jue 12/11, 10:00 a 11:00, Bloqueado' })).toBeTruthy();
  });

  it('CAL_06_un_bloqueo_que_no_es_suyo_se_ve_pero_no_es_un_boton', () => {
    const b = bloqueoDe({ bloqueo_id: null });
    expect(b.tocable).toBe(false);
    render(<ul><BloqueBloqueo bloqueo={b} zona={ZONA} onAbrir={vi.fn()} /></ul>);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Bloqueado')).toBeTruthy();
    expect(screen.getByText('Torneo')).toBeTruthy();
  });

  it.each(HOSTILES)('SEC_16_SEC_35_un_motivo_hostil_se_ve_literal_sin_crear_img_ni_script_%s', (hostil) => {
    const { container } = render(
      <ul><BloqueBloqueo bloqueo={bloqueoDe({ bloqueo_motivo: hostil })} zona={ZONA} onAbrir={vi.fn()} /></ul>,
    );
    expect(screen.getByText(hostil)).toBeTruthy();
    expect(screen.getByRole('button', { name: new RegExp(`Bloqueado, ${hostil.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) })).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });
});

describe('CC-10 LeyendaCalendario y CC-11 AyudaCalendario (CAL-17, CA-82, WEB-14, A11Y-41)', () => {
  it('CAL_17_CA_82_la_leyenda_lista_Confirmada_Pendiente_Bloqueado_y_Libre_con_su_muestra_decorativa', async () => {
    const { container } = render(<LeyendaCalendario />);
    const lista = screen.getByRole('list', { name: 'Leyenda del calendario' });
    expect(within(lista).getAllByRole('listitem').map((i) => i.textContent)).toEqual([
      'Confirmada',
      'Pendiente',
      'Bloqueado',
      'Libre',
    ]);
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(4);
    await sinViolacionesAxe(container);
  });

  it('WEB_14_la_ayuda_dice_el_literal_de_la_spec', () => {
    render(<AyudaCalendario id="ayuda" />);
    expect(screen.getByText(AYUDA).id).toBe('ayuda');
  });

  it('WEB_14_el_grupo_del_calendario_se_describe_con_la_ayuda_y_la_leyenda_esta_presente', () => {
    render(
      <CalendarioPanel
        estado={calendarioDe([ocupada(), LIBRE_11])}
        titulo={TITULO}
        zona={ZONA}
        eje={EJE}
        onReintentar={vi.fn()}
      />,
    );
    const grupo = screen.getByRole('group', { name: 'Calendario, 12/11/2026' });
    expect(grupo.getAttribute('aria-describedby')).toBeTruthy();
    expect(grupo.getAttribute('tabindex')).toBe('-1');
    expect(document.getElementById(grupo.getAttribute('aria-describedby') ?? '')?.textContent).toBe(AYUDA);
    expect(screen.getByRole('list', { name: 'Leyenda del calendario' })).toBeTruthy();
  });
});

describe('CC-02 CalendarioPanel: vacío, cargando y error (CAL-18, CA-82, A11Y-48)', () => {
  const base = { titulo: TITULO, zona: ZONA, eje: EJE, onReintentar: vi.fn() };

  it('CAL_18_CA_82_un_dia_sin_clases_dice_No_hay_clases_este_dia_encima_de_la_grilla_con_sus_huecos_libres', () => {
    render(<CalendarioPanel {...base} estado={calendarioDe([LIBRE_11, LIBRE_12])} onAbrirHueco={vi.fn()} />);
    const aviso = screen.getByText('No hay clases este día');
    const grupo = screen.getByRole('group', { name: /Calendario/ });
    // El aviso va antes de la grilla en el orden de lectura y la grilla sigue con sus huecos libres.
    expect(aviso.compareDocumentPosition(grupo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(grupo).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Jue 12/11, 11:00 a 12:00, Libre',
      'Jue 12/11, 12:00 a 13:00, Libre',
    ]);
  });

  it('CAL_18_con_clases_no_se_dice_que_no_hay', () => {
    render(<CalendarioPanel {...base} estado={calendarioDe([ocupada(), LIBRE_12])} />);
    expect(screen.queryByText('No hay clases este día')).toBeNull();
  });

  it('CAL_18_CA_82_cargando_muestra_la_leyenda_y_Cargando_la_agenda', () => {
    render(<CalendarioPanel {...base} estado={{ estado: 'cargando' }} />);
    expect(screen.getByRole('status').textContent).toContain('Cargando la agenda…');
    expect(screen.getByRole('list', { name: 'Leyenda del calendario' })).toBeTruthy();
  });

  it('A11Y_48_el_error_llegado_tras_una_accion_lleva_el_foco_a_Reintentar', () => {
    render(
      <CalendarioPanel {...base} enfocarReintentar estado={{ estado: 'error', mensaje: 'Algo salió mal.' }} />,
    );
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reintentar' }));
  });

  it('A11Y_48_el_error_de_la_primera_carga_no_mueve_el_foco', () => {
    render(<CalendarioPanel {...base} estado={{ estado: 'error', mensaje: 'Algo salió mal.' }} />);
    expect(document.activeElement).toBe(document.body);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('A11Y_48_el_calendario_con_huecos_bloqueos_y_clases_no_tiene_violaciones_de_axe', async () => {
    const { container } = render(
      <CalendarioPanel
        {...base}
        estado={calendarioDe([ocupada(), LIBRE_12, fila({ inicio: H13, fin: '2026-11-12T17:00:00Z' }), bloqueo({ inicio: H11, fin: H12 })])}
        onAbrirHueco={vi.fn()}
        onAbrirClase={vi.fn()}
        onAbrirBloqueo={vi.fn()}
      />,
    );
    await sinViolacionesAxe(container);
  });
});

describe('CC-13 DetalleCalendario en el Panel (CAL-05, CAL-06, CAL-11, CA-70, CA-71, CA-75, F-CAL-04, F-CAL-05, F-CAL-07)', () => {
  it('CAL_11_CA_70_tocar_un_hueco_libre_abre_Crear_clase_en_un_dialogo_por_debajo_de_60_rem', async () => {
    montar([ocupada(), LIBRE_11], { modo: 'calendario' });
    await userEvent.click(screen.getByRole('button', { name: 'Jue 12/11, 11:00 a 12:00, Libre' }));
    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByRole('heading', { level: 3, name: 'Crear clase' })).toBeTruthy();
  });

  it('CAL_05_CA_70_un_hueco_libre_pasado_o_fuera_de_la_grilla_no_abre_nada', () => {
    montar([ocupada(), fila({ inicio: H11, fin: H12, pasada: true }), fila({ inicio: H13, fin: '2026-11-12T17:00:00Z' })], {
      modo: 'calendario',
    });
    expect(screen.queryByRole('button', { name: /Libre/ })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('CAL_11_CA_75_tocar_una_clase_confirmada_muestra_quien_toma_titular_observacion_y_Mover_y_Cancelar', async () => {
    montar([ocupada({ titular: 'Papá de Ana', observacion: 'Trae el casco' }), LIBRE_12], { modo: 'calendario' });
    await userEvent.click(screen.getByRole('button', { name: 'Jue 12/11, 10:00 a 11:00, Confirmada, Ana Pérez' }));
    const dialogo = screen.getByRole('dialog', { name: 'Clase del jueves, 12 de noviembre, 10:00 a 11:00' });
    expect(within(dialogo).getByText('Ana Pérez')).toBeTruthy();
    expect(within(dialogo).getByText('Papá de Ana')).toBeTruthy();
    expect(within(dialogo).getByText('Trae el casco')).toBeTruthy();
    expect((within(dialogo).getByRole('button', { name: 'Mover' }) as HTMLButtonElement).disabled).toBe(false);
    expect((within(dialogo).getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it.each(HOSTILES)('SEC_16_SEC_35_nombre_titular_y_observacion_hostiles_se_ven_literales_en_el_detalle_%s', async (hostil) => {
    const { container } = montar([ocupada({ quien_toma: hostil, titular: hostil, observacion: hostil })], {
      modo: 'calendario',
    });
    await userEvent.click(screen.getByRole('button', { name: /10:00 a 11:00, Confirmada/ }));
    const dialogo = screen.getByRole('dialog');
    // Nombre, titular y observación: tres veces el mismo texto, literal.
    expect(within(dialogo).getAllByText(hostil)).toHaveLength(3);
    expect(document.body.querySelector('img')).toBeNull();
    expect(document.body.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('CAL_11_CA_71_tocar_un_bloqueo_propio_ofrece_Desbloquear_y_lo_hace', async () => {
    const simuladas = acciones();
    const { onRecargarAgenda } = montar([bloqueo(), LIBRE_11], { modo: 'calendario', simuladas });
    await userEvent.click(screen.getByRole('button', { name: 'Jue 12/11, 10:00 a 11:00, Bloqueado, Torneo' }));
    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByText('Torneo')).toBeTruthy();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Desbloquear' }));
    await waitFor(() => expect(simuladas.desbloquear).toHaveBeenCalledWith('b1'));
    await waitFor(() => expect(onRecargarAgenda).toHaveBeenCalledTimes(1));
  });

  it('CAL_06_un_motivo_hostil_se_ve_literal_tambien_en_el_detalle_del_bloqueo', async () => {
    montar([bloqueo({ bloqueo_motivo: HOSTILES[0] })], { modo: 'calendario' });
    await userEvent.click(screen.getByRole('button', { name: /Bloqueado/ }));
    expect(within(screen.getByRole('dialog')).getByText(HOSTILES[0] as string)).toBeTruthy();
    expect(document.body.querySelector('img')).toBeNull();
  });

  it('CAL_11_una_clase_con_un_pedido_sin_responder_no_se_gestiona_y_manda_a_la_lista', async () => {
    montar([ocupada({ solicitud_id: 's1' })], { modo: 'calendario' });
    await userEvent.click(screen.getByRole('button', { name: /10:00 a 11:00, Confirmada/ }));
    const dialogo = screen.getByRole('dialog');
    expect((within(dialogo).getByRole('button', { name: 'Mover' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(dialogo).getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(dialogo).getByText(/Tiene un pedido del alumno sin responder\./)).toBeTruthy();
    expect(within(dialogo).getByRole('link', { name: 'Responder en la lista' }).getAttribute('href')).toBe('#/lista');
  });

  it('CAL_11_una_clase_pasada_se_ve_pero_no_se_gestiona', async () => {
    montar([ocupada({ pasada: true })], { modo: 'calendario' });
    await userEvent.click(screen.getByRole('button', { name: /10:00 a 11:00, Confirmada/ }));
    const dialogo = screen.getByRole('dialog');
    expect((within(dialogo).getByRole('button', { name: 'Mover' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(dialogo).getByText('Ya pasó')).toBeTruthy();
  });

  it('CA_79_A11Y_53_con_la_agenda_inactiva_Mover_y_Crear_clase_estan_deshabilitados_con_su_porque_y_Cancelar_sigue', async () => {
    const simuladas = acciones();
    montar([ocupada(), LIBRE_11], { modo: 'calendario', profesorActivo: false, simuladas });
    await userEvent.click(screen.getByRole('button', { name: /10:00 a 11:00, Confirmada/ }));
    let dialogo = screen.getByRole('dialog');
    expect((within(dialogo).getByRole('button', { name: 'Mover' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(dialogo).getByText('Con la agenda inactiva no podés mover clases. Sí podés cancelarlas.')).toBeTruthy();
    expect((within(dialogo).getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar cancelación' }));
    await waitFor(() => expect(simuladas.cancelar).toHaveBeenCalledWith('c1', 'solo_esta'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await userEvent.click(screen.getByRole('button', { name: 'Jue 12/11, 11:00 a 12:00, Libre' }));
    dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByText('Con la agenda inactiva no podés crear clases.')).toBeTruthy();
    expect(simuladas.crear).not.toHaveBeenCalled();
  });

  it('F_CAL_04_tras_una_accion_se_anuncia_el_exito_se_relee_la_agenda_y_el_foco_va_a_la_grilla', async () => {
    const simuladas = acciones();
    const { onRecargarAgenda, onRecargarContadores } = montar([ocupada(), LIBRE_12], { modo: 'calendario', simuladas });
    await userEvent.click(screen.getByRole('button', { name: /10:00 a 11:00, Confirmada/ }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar cancelación' }));
    await waitFor(() => expect(onRecargarAgenda).toHaveBeenCalledTimes(1));
    expect(onRecargarContadores).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toContain('Clase cancelada: Ana Pérez, 12/11 10:00');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('group', { name: /Calendario/ })));
  });

  it('CAL_11_Esc_cierra_el_dialogo_sin_cambiar_nada', async () => {
    const { onRecargarAgenda } = montar([ocupada(), LIBRE_12], { modo: 'calendario' });
    await userEvent.click(screen.getByRole('button', { name: /10:00 a 11:00, Confirmada/ }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onRecargarAgenda).not.toHaveBeenCalled();
  });

  it('A11Y_48_un_error_de_lectura_tras_una_accion_lleva_el_foco_a_Reintentar_y_antes_de_ella_no', async () => {
    const simuladas = acciones();
    const { rerender, props } = montar([ocupada(), LIBRE_12], { modo: 'calendario', simuladas });
    const error = { estado: 'error', mensaje: 'Algo salió mal.' } as const;
    await userEvent.click(screen.getByRole('button', { name: /10:00 a 11:00, Confirmada/ }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar cancelación' }));
    await screen.findByText('Clase cancelada: Ana Pérez, 12/11 10:00');
    rerender(<VistaPanel {...props} calendario={error} />);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reintentar' })));
  });
});

describe('CC-13 DetalleCalendario en columna, escritorio (A11Y-38, CAL-11)', () => {
  it('A11Y_38_en_escritorio_el_detalle_es_una_columna_con_el_foco_en_su_h2', async () => {
    montar([ocupada(), LIBRE_12], { modo: 'calendario', escritorio: true });
    await userEvent.click(screen.getByRole('button', { name: /10:00 a 11:00, Confirmada/ }));
    const columna = screen.getByRole('complementary');
    const titulo = within(columna).getByRole('heading', { level: 2, name: /Clase del jueves, 12 de noviembre/ });
    expect(titulo.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(titulo);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('A11Y_38_Cerrar_devuelve_el_foco_al_bloque_que_abrio_el_detalle', async () => {
    montar([ocupada(), LIBRE_12], { modo: 'calendario', escritorio: true });
    const bloque = screen.getByRole('button', { name: /10:00 a 11:00, Confirmada/ });
    await userEvent.click(bloque);
    await userEvent.click(within(screen.getByRole('complementary')).getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(document.activeElement).toBe(bloque);
  });

  it('A11Y_38_Esc_cierra_la_columna_y_el_foco_vuelve_al_hueco_libre_que_la_abrio', async () => {
    montar([ocupada(), LIBRE_12], { modo: 'calendario', escritorio: true });
    const hueco = screen.getByRole('button', { name: 'Jue 12/11, 12:00 a 13:00, Libre' });
    await userEvent.click(hueco);
    expect(screen.getByRole('complementary')).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(document.activeElement).toBe(hueco);
  });

  it('A11Y_38_si_el_bloque_ya_no_existe_tras_la_accion_el_foco_va_a_la_grilla', async () => {
    montar([ocupada(), LIBRE_12], { modo: 'calendario', escritorio: true });
    await userEvent.click(screen.getByRole('button', { name: /10:00 a 11:00, Confirmada/ }));
    const columna = screen.getByRole('complementary');
    await userEvent.click(within(columna).getByRole('button', { name: 'Cancelar' }));
    await userEvent.click(within(columna).getByRole('button', { name: 'Confirmar cancelación' }));
    await screen.findByText('Clase cancelada: Ana Pérez, 12/11 10:00');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('group', { name: /Calendario/ })));
  });

  it('CA_79_A11Y_53_en_la_columna_con_la_agenda_inactiva_Cancelar_sigue_y_Mover_dice_por_que_no', async () => {
    montar([ocupada()], { modo: 'calendario', escritorio: true, profesorActivo: false });
    await userEvent.click(screen.getByRole('button', { name: /10:00 a 11:00, Confirmada/ }));
    const columna = screen.getByRole('complementary');
    expect((within(columna).getByRole('button', { name: 'Mover' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(columna).getByText(/Con la agenda inactiva no podés mover clases/)).toBeTruthy();
    expect((within(columna).getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('A11Y_el_calendario_con_el_detalle_abierto_en_columna_no_tiene_violaciones_de_axe', async () => {
    const { container } = montar([ocupada(), LIBRE_12, bloqueo({ inicio: H11, fin: H12 })], {
      modo: 'calendario',
      escritorio: true,
    });
    await userEvent.click(screen.getByRole('button', { name: /10:00 a 11:00, Confirmada/ }));
    await sinViolacionesAxe(container);
  });
});

describe('CC-01 «Elegir día» (H-B17-03, CAL-03, A11Y-47)', () => {
  const props = {
    vista: 'dia' as const,
    titulo: TITULO,
    puedeAnterior: true,
    puedeSiguiente: true,
    onAnterior: vi.fn(),
    onSiguiente: vi.fn(),
    onHoy: vi.fn(),
  };

  it('CAL_03_la_barra_ofrece_un_campo_de_fecha_Elegir_dia_con_el_dia_mostrado_y_los_limites', () => {
    render(<BarraCalendario {...props} elegirDia={{ dia: '2026-11-12', limites: LIMITES, onElegir: vi.fn() }} />);
    const campo = screen.getByLabelText('Elegir día') as HTMLInputElement;
    expect(campo.type).toBe('date');
    expect(campo.value).toBe('2026-11-12');
    expect(campo.min).toBe(LIMITES.min);
    expect(campo.max).toBe(LIMITES.max);
    expect(screen.getByRole('navigation', { name: 'Navegación del calendario' }).contains(campo)).toBe(true);
  });

  it('CAL_03_elegir_un_dia_valido_navega_como_las_flechas', () => {
    const onElegir = vi.fn();
    render(<BarraCalendario {...props} elegirDia={{ dia: '2026-11-12', limites: LIMITES, onElegir }} />);
    fireEvent.change(screen.getByLabelText('Elegir día'), { target: { value: '2026-12-01' } });
    expect(onElegir).toHaveBeenCalledWith('2026-12-01');
  });

  it('CAL_03_un_dia_fuera_de_hoy_mas_menos_366_muestra_el_error_y_no_navega', () => {
    const onElegir = vi.fn();
    render(<BarraCalendario {...props} elegirDia={{ dia: '2026-11-12', limites: LIMITES, onElegir }} />);
    const campo = screen.getByLabelText('Elegir día');
    fireEvent.change(campo, { target: { value: '2030-01-01' } });
    expect(onElegir).not.toHaveBeenCalled();
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText(/Ese día no está disponible/)).toBeTruthy();
  });

  it('CAL_03_en_el_panel_elegir_un_dia_pide_ese_dia_y_las_flechas_y_Hoy_siguen_andando', async () => {
    const { onCambiarDia } = montar([LIBRE_11], { modo: 'calendario' });
    fireEvent.change(screen.getByLabelText('Elegir día'), { target: { value: '2026-11-20' } });
    expect(onCambiarDia).toHaveBeenCalledWith('2026-11-20');
    await userEvent.click(screen.getByRole('button', { name: 'Día anterior' }));
    expect(onCambiarDia).toHaveBeenLastCalledWith('2026-11-11');
    await userEvent.click(screen.getByRole('button', { name: 'Hoy' }));
    expect(onCambiarDia).toHaveBeenLastCalledWith(LIMITES.hoy);
  });

  it('CAL_03_el_titulo_sigue_siendo_un_h2_anunciado_con_el_campo_presente', () => {
    montar([LIBRE_11], { modo: 'calendario' });
    const titulo = screen.getByRole('heading', { level: 2, name: TITULO });
    expect(titulo.getAttribute('aria-live')).toBe('polite');
  });

  it('CAL_03_las_flechas_deshabilitadas_por_el_rango_siguen_deshabilitadas_con_el_campo', () => {
    montar([LIBRE_11], { modo: 'calendario', dia: LIMITES.max });
    expect((screen.getByRole('button', { name: 'Día siguiente, no disponible' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
