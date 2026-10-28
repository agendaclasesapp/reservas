// @vitest-environment jsdom
// Pruebas de componente de la página de agenda de un profesor (T02.2, B14 · T14.4): WEB-01, AGE-07, AGE-09,
// AGE-11, ALU-14, SEC-16, NFR-05, NFR-06.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MENSAJE_SIN_CONEXION } from '../../../../src/lib/errores';
import { reiniciarConfigPublica, type ConfigPublica, type Hueco } from '../../../../src/modulos/agenda/logica';
import { PaginaAgenda } from '../../../../src/modulos/agenda/vistas/PaginaAgenda';
import { fijarSesion, restaurarSesion } from '../../ui/sesion';
import { sinViolacionesAxe } from '../../ui/soporte';

// 2026-11-02 12:00 en Buenos Aires (UTC-3, sin horario de verano). Rango válido: 2025-11-01 .. 2026-12-31.
const AHORA = new Date('2026-11-02T15:00:00Z');
const CONFIG: ConfigPublica = {
  profesor_id: 'id-ana-perez',
  nombre: 'Ana Pérez',
  activo: true,
  zona_horaria: 'America/Argentina/Buenos_Aires',
  duracion_min: 60,
  anticipacion_horas: 24,
  horizonte_semanas: 4,
};
const LUNES: Hueco[] = [
  { inicio: '2026-11-02T12:00:00+00:00', fin: '2026-11-02T13:00:00+00:00', estado: 'ocupado' },
  { inicio: '2026-11-02T11:00:00+00:00', fin: '2026-11-02T12:00:00+00:00', estado: 'libre' },
  { inicio: '2026-11-02T17:00:00+00:00', fin: '2026-11-02T18:00:00+00:00', estado: 'bloqueado' },
];

beforeEach(async () => {
  await fijarSesion(null);
});

afterEach(() => {
  cleanup();
  reiniciarConfigPublica();
  restaurarSesion();
});

function Ubicacion() {
  const { search } = useLocation();
  return <p data-testid="ubicacion">{search}</p>;
}

function montar(
  opciones: {
    ruta?: string;
    obtenerAgenda?: (slug: string, dia: string) => Promise<Hueco[]>;
    obtenerConfig?: (slug: string) => Promise<ConfigPublica>;
    pedirAcceso?: (slug: string) => ReactNode;
  } = {},
) {
  const obtenerAgenda = opciones.obtenerAgenda ?? vi.fn(async () => LUNES);
  const obtenerConfig = opciones.obtenerConfig ?? vi.fn(async () => CONFIG);
  const vista = render(
    <MemoryRouter initialEntries={[opciones.ruta ?? '/']}>
      <PaginaAgenda
        slug="ana-perez"
        pedirAcceso={opciones.pedirAcceso}
        obtenerConfig={obtenerConfig}
        obtenerAgenda={obtenerAgenda}
        ahora={AHORA}
      />
      <Ubicacion />
    </MemoryRouter>,
  );
  return { ...vista, obtenerAgenda, obtenerConfig };
}

describe('Agenda por día: huecos (WEB-01, AGE-07, NFR-05)', () => {
  it('WEB_01_muestra_hoy_en_el_huso_del_profesor_con_hora_estado_texto_e_icono', async () => {
    const { container, obtenerAgenda } = montar();
    expect(screen.getByRole('heading', { level: 1, name: 'Agenda' })).toBeTruthy();
    expect(await screen.findByRole('heading', { level: 1, name: 'Agenda de Ana Pérez' })).toBeTruthy();
    expect(await screen.findByRole('heading', { level: 2, name: /2 de noviembre/ })).toBeTruthy();
    const lista = await screen.findByRole('list', { name: 'Huecos del día' });
    expect(obtenerAgenda).toHaveBeenCalledWith('ana-perez', '2026-11-02');

    const filas = within(lista).getAllByRole('listitem');
    // Ordenados por hora, en el huso del profesor y no en el del navegador (AGE-08).
    expect(filas.map((f) => f.textContent)).toEqual([
      '08:00 a 09:00 Libre',
      '09:00 a 10:00 Ocupado',
      '14:00 a 15:00 Bloqueado',
    ]);
    // Cada estado lleva ícono (decorativo) además del texto.
    for (const fila of filas) expect(fila.querySelector('svg')).not.toBeNull();
    expect(filas.map((f) => f.getAttribute('data-estado'))).toEqual(['libre', 'ocupado', 'bloqueado']);
    expect(screen.getByText('Horarios en el huso America/Argentina/Buenos_Aires.')).toBeTruthy();
    await sinViolacionesAxe(container);
  });

  it('WEB_01_la_leyenda_nombra_los_tres_estados_y_el_resumen_se_anuncia', async () => {
    montar();
    const leyenda = await screen.findByRole('list', { name: 'Significado de los estados' });
    expect(within(leyenda).getAllByRole('listitem').map((i) => i.textContent)).toEqual(['Libre', 'Ocupado', 'Bloqueado']);
    expect(screen.getByText('1 hueco libre de 3.')).toBeTruthy();
  });

  it('AGE_07_la_vista_publica_no_interactua_ni_muestra_mas_que_hora_y_estado', async () => {
    montar();
    const lista = await screen.findByRole('list', { name: 'Huecos del día' });
    expect(within(lista).queryAllByRole('button')).toHaveLength(0);
    expect(lista.textContent).not.toMatch(/@|motivo|observaci/i);
  });

  it('WEB_01_un_hueco_que_cruza_medianoche_lleva_la_fecha_del_dia_en_que_cae', async () => {
    const cruza: Hueco[] = [
      // 22:00 a 01:00 hora de Buenos Aires: entra al lunes 2 y sale el martes 3.
      { inicio: '2026-11-03T01:00:00+00:00', fin: '2026-11-03T04:00:00+00:00', estado: 'ocupado' },
      // Termina justo a medianoche: no es del día siguiente.
      { inicio: '2026-11-03T02:00:00+00:00', fin: '2026-11-03T03:00:00+00:00', estado: 'libre' },
    ];
    montar({ obtenerAgenda: async () => cruza });
    const lista = await screen.findByRole('list', { name: 'Huecos del día' });
    const textos = within(lista).getAllByRole('listitem').map((f) => f.textContent);
    expect(textos[0]).toBe('22:00 a martes, 3 de noviembre, 01:00 Ocupado');
    expect(textos[1]).toBe('23:00 a 00:00 Libre');
  });

  it('WEB_01_un_dia_sin_huecos_lo_dice_y_deja_el_selector_disponible', async () => {
    const { container } = montar({ obtenerAgenda: async () => [] });
    expect(await screen.findByRole('heading', { level: 3, name: 'No hay huecos este día' })).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Huecos del día' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Día siguiente' })).toBeTruthy();
    expect(screen.getByLabelText('Elegir día')).toBeTruthy();
    await sinViolacionesAxe(container);
  });
});

describe('Agenda por día: cargando y error (WEB-01)', () => {
  it('WEB_01_mientras_carga_los_huecos_anuncia_cargando_y_conserva_el_selector', async () => {
    let resolver!: (h: Hueco[]) => void;
    const { container } = montar({ obtenerAgenda: () => new Promise<Hueco[]>((r) => (resolver = r)) });
    const estado = await screen.findByText('Cargando los huecos del día…');
    expect(estado.closest('[role="status"]')?.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('button', { name: 'Día anterior' })).toBeTruthy();
    await sinViolacionesAxe(container);
    await act(async () => resolver(LUNES));
    expect(await screen.findByRole('list', { name: 'Huecos del día' })).toBeTruthy();
    expect(screen.queryByText('Cargando los huecos del día…')).toBeNull();
  });

  it('WEB_01_si_los_huecos_fallan_muestra_el_error_y_reintentar_conserva_el_dia', async () => {
    const obtenerAgenda = vi
      .fn<(slug: string, dia: string) => Promise<Hueco[]>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(LUNES);
    const { container } = montar({ ruta: '/?d=2026-11-05', obtenerAgenda });
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain(`No se pudo cargar la agenda. ${MENSAJE_SIN_CONEXION}`);
    expect(screen.getByRole('heading', { level: 2, name: /5 de noviembre/ })).toBeTruthy();
    await sinViolacionesAxe(container);

    await userEvent.click(within(alerta).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('list', { name: 'Huecos del día' })).toBeTruthy();
    expect(obtenerAgenda).toHaveBeenCalledTimes(2);
    expect(obtenerAgenda).toHaveBeenLastCalledWith('ana-perez', '2026-11-05');
  });

  it('WEB_01_si_falla_la_configuracion_ofrece_reintentar_y_luego_muestra_la_agenda', async () => {
    const obtenerConfig = vi
      .fn<() => Promise<ConfigPublica>>()
      .mockRejectedValueOnce({ message: 'DESCONOCIDO' })
      .mockResolvedValue(CONFIG);
    montar({ obtenerConfig });
    expect(await screen.findByText('Cargando la agenda…')).toBeTruthy();
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('No se pudo cargar la agenda.');
    await userEvent.click(within(alerta).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('list', { name: 'Huecos del día' })).toBeTruthy();
  });
});

describe('Agenda por día: selector de día (WEB-01, SEC-09, NFR-06)', () => {
  it('WEB_01_siguiente_y_anterior_cambian_el_dia_la_direccion_y_los_huecos', async () => {
    const { obtenerAgenda } = montar();
    await screen.findByRole('list', { name: 'Huecos del día' });
    await userEvent.click(screen.getByRole('button', { name: 'Día siguiente' }));
    expect(await screen.findByRole('heading', { level: 2, name: /3 de noviembre/ })).toBeTruthy();
    expect(screen.getByTestId('ubicacion').textContent).toBe('?d=2026-11-03');
    await waitFor(() => expect(obtenerAgenda).toHaveBeenLastCalledWith('ana-perez', '2026-11-03'));
    await userEvent.click(screen.getByRole('button', { name: 'Día anterior' }));
    await userEvent.click(screen.getByRole('button', { name: 'Día anterior' }));
    expect(await screen.findByRole('heading', { level: 2, name: /1 de noviembre/ })).toBeTruthy();
    await waitFor(() => expect(obtenerAgenda).toHaveBeenLastCalledWith('ana-perez', '2026-11-01'));
  });

  it('WEB_01_el_selector_se_opera_solo_con_teclado', async () => {
    const { obtenerAgenda } = montar();
    await screen.findByRole('list', { name: 'Huecos del día' });
    screen.getByRole('button', { name: 'Día anterior' }).focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Día siguiente' }));
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(obtenerAgenda).toHaveBeenLastCalledWith('ana-perez', '2026-11-03'));
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByLabelText('Elegir día'));
  });

  it('WEB_01_el_dia_actual_va_en_un_encabezado_con_aria_live_polite', async () => {
    montar();
    const titulo = await screen.findByRole('heading', { level: 2, name: /2 de noviembre/ });
    expect(titulo.getAttribute('aria-live')).toBe('polite');
  });

  it('WEB_01_el_calendario_elige_un_dia_valido_y_pide_sus_huecos', async () => {
    const { obtenerAgenda } = montar();
    await screen.findByRole('list', { name: 'Huecos del día' });
    const campo = screen.getByLabelText<HTMLInputElement>('Elegir día');
    expect(campo.value).toBe('2026-11-02');
    expect(campo.min).toBe('2025-11-01');
    expect(campo.max).toBe('2026-12-31');
    fireEvent.change(campo, { target: { value: '2026-11-10' } });
    expect(await screen.findByRole('heading', { level: 2, name: /10 de noviembre/ })).toBeTruthy();
    await waitFor(() => expect(obtenerAgenda).toHaveBeenLastCalledWith('ana-perez', '2026-11-10'));
    expect(screen.getByTestId('ubicacion').textContent).toBe('?d=2026-11-10');
  });

  it('SEC_09_un_dia_fuera_de_limites_escrito_en_el_campo_da_error_y_no_pide_nada', async () => {
    const { obtenerAgenda } = montar();
    await screen.findByRole('list', { name: 'Huecos del día' });
    const campo = screen.getByLabelText<HTMLInputElement>('Elegir día');
    fireEvent.change(campo, { target: { value: '2027-06-01' } });
    const error = await screen.findByRole('alert');
    expect(error.textContent).toMatch(/^Ese día no está disponible\. Elegí uno entre el .*1 de noviembre.* y el .*31 de diciembre.*\.$/);
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(campo.getAttribute('aria-describedby')).toBe(error.id);
    expect(screen.getByRole('heading', { level: 2, name: /2 de noviembre/ })).toBeTruthy();
    expect(obtenerAgenda).toHaveBeenCalledTimes(1);
    // Un día válido después limpia el error.
    fireEvent.change(campo, { target: { value: '2026-11-04' } });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(obtenerAgenda).toHaveBeenLastCalledWith('ana-perez', '2026-11-04');
  });

  it('SEC_09_vaciar_el_campo_no_pide_ningun_dia_ni_muestra_error', async () => {
    const { obtenerAgenda } = montar();
    await screen.findByRole('list', { name: 'Huecos del día' });
    fireEvent.change(screen.getByLabelText('Elegir día'), { target: { value: '' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(obtenerAgenda).toHaveBeenCalledTimes(1);
  });

  it('SEC_09_en_el_primer_dia_valido_anterior_esta_deshabilitado', async () => {
    montar({ ruta: '/?d=2025-11-01' });
    await screen.findByRole('list', { name: 'Huecos del día' });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Día anterior' }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Día siguiente' }).disabled).toBe(false);
  });

  it('SEC_09_en_el_ultimo_dia_valido_siguiente_esta_deshabilitado', async () => {
    montar({ ruta: '/?d=2026-12-31' });
    await screen.findByRole('list', { name: 'Huecos del día' });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Día siguiente' }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Día anterior' }).disabled).toBe(false);
  });

  it('SEC_09_un_dia_de_la_direccion_invalido_o_fuera_de_limites_vuelve_a_hoy', async () => {
    for (const ruta of ['/?d=basura', '/?d=2031-01-01', '/?d=2026-02-30']) {
      const { obtenerAgenda, unmount } = montar({ ruta });
      await screen.findByRole('list', { name: 'Huecos del día' });
      expect(obtenerAgenda).toHaveBeenCalledTimes(1);
      expect(obtenerAgenda).toHaveBeenCalledWith('ana-perez', '2026-11-02');
      unmount();
      reiniciarConfigPublica();
    }
  });

  it('NFR_06_los_botones_del_selector_son_botones_nativos_con_nombre_visible', async () => {
    montar();
    await screen.findByRole('list', { name: 'Huecos del día' });
    for (const nombre of ['Día anterior', 'Día siguiente']) {
      const boton = screen.getByRole('button', { name: nombre });
      expect(boton.tagName).toBe('BUTTON');
      expect(boton.textContent).toBe(nombre);
    }
  });
});
