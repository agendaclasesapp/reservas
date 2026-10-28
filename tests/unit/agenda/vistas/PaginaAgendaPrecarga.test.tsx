// @vitest-environment jsdom
// `#/p/<slug>` pide la configuración y el día a la vez (B13 · T13.2, DEC-41): NFR-04, CA-36; lo que se ve no cambia
// (AGE-07, AGE-09, AGE-11).
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MENSAJE_SIN_CONEXION } from '../../../../src/lib/errores';
import {
  reiniciarConfigPublica,
  reiniciarPrecargaAgenda,
  type ConfigPublica,
  type Hueco,
} from '../../../../src/modulos/agenda/logica';
import { PaginaAgenda } from '../../../../src/modulos/agenda/vistas/PaginaAgenda';
import { fijarSesion, restaurarSesion } from '../../ui/sesion';

// 2026-11-02 12:00 en Buenos Aires (UTC-3): el mismo día en el huso de quien corre las pruebas (UTC-12 a UTC+8).
const AHORA = new Date('2026-11-02T15:00:00Z');
const ACTIVA: ConfigPublica = {
  profesor_id: 'id-ana-perez',
  nombre: 'Ana Pérez',
  activo: true,
  zona_horaria: 'America/Argentina/Buenos_Aires',
  duracion_min: 60,
  anticipacion_horas: 24,
  horizonte_semanas: 4,
};
const INACTIVA: ConfigPublica = { profesor_id: 'id-ana-perez', nombre: 'Ana Pérez', activo: false };
const HUECOS: Hueco[] = [{ inicio: '2026-11-02T11:00:00+00:00', fin: '2026-11-02T12:00:00+00:00', estado: 'libre' }];

function diferido<T>() {
  let resolver!: (v: T) => void;
  let rechazar!: (e: unknown) => void;
  const promesa = new Promise<T>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
}

beforeEach(async () => {
  await fijarSesion(null);
});

afterEach(() => {
  cleanup();
  reiniciarPrecargaAgenda();
  reiniciarConfigPublica();
  restaurarSesion();
});

function montar(
  obtenerConfig: (slug: string) => Promise<ConfigPublica>,
  obtenerAgenda: (slug: string, dia: string) => Promise<Hueco[]>,
  ruta = '/p/ana-perez',
) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <PaginaAgenda slug="ana-perez" obtenerConfig={obtenerConfig} obtenerAgenda={obtenerAgenda} ahora={AHORA} />
    </MemoryRouter>,
  );
}

describe('Agenda pública: configuración y día en paralelo (NFR-04, CA-36)', () => {
  it('NFR_04_CA_36_el_dia_se_pide_antes_de_que_llegue_la_configuracion_y_se_usa_esa_respuesta', async () => {
    const config = diferido<ConfigPublica>();
    const obtenerConfig = vi.fn(() => config.promesa);
    const obtenerAgenda = vi.fn(async () => HUECOS);
    montar(obtenerConfig, obtenerAgenda);
    await waitFor(() => expect(obtenerAgenda).toHaveBeenCalledWith('ana-perez', '2026-11-02'));
    expect(obtenerConfig).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('list')).toBeNull();

    config.resolver(ACTIVA);
    expect(await screen.findByRole('list', { name: 'Huecos del día' })).toBeTruthy();
    expect(obtenerAgenda).toHaveBeenCalledTimes(1);
    expect(obtenerConfig).toHaveBeenCalledTimes(1);
  });

  it('NFR_04_el_dia_de_la_direccion_tambien_sale_en_paralelo', async () => {
    const config = diferido<ConfigPublica>();
    const obtenerAgenda = vi.fn(async () => HUECOS);
    montar(() => config.promesa, obtenerAgenda, '/p/ana-perez?d=2026-11-05');
    await waitFor(() => expect(obtenerAgenda).toHaveBeenCalledWith('ana-perez', '2026-11-05'));
    config.resolver(ACTIVA);
    expect(await screen.findByRole('heading', { level: 2, name: /5 de noviembre/ })).toBeTruthy();
    await screen.findByRole('list', { name: 'Huecos del día' });
    expect(obtenerAgenda).toHaveBeenCalledTimes(1);
  });

  it('AGE_11_con_el_profesor_inactivo_la_respuesta_adelantada_se_descarta_y_no_se_ve_la_agenda', async () => {
    const config = diferido<ConfigPublica>();
    const inactivo = Object.assign(new Error('PROFESOR_INACTIVO'), { code: 'PT409', details: null, hint: null });
    const obtenerAgenda = vi.fn(async (): Promise<Hueco[]> => {
      throw inactivo;
    });
    montar(() => config.promesa, obtenerAgenda);
    await waitFor(() => expect(obtenerAgenda).toHaveBeenCalledTimes(1));
    config.resolver(INACTIVA);
    expect(await screen.findByText('Ana Pérez no toma reservas por ahora')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByLabelText('Elegir día')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(obtenerAgenda).toHaveBeenCalledTimes(1);
  });

  it('CA_36_si_el_dia_adelantado_falla_se_ve_el_mismo_error_de_la_agenda', async () => {
    const config = diferido<ConfigPublica>();
    const obtenerAgenda = vi
      .fn<(slug: string, dia: string) => Promise<Hueco[]>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(HUECOS);
    montar(() => config.promesa, obtenerAgenda);
    await waitFor(() => expect(obtenerAgenda).toHaveBeenCalledTimes(1));
    config.resolver(ACTIVA);
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain(`No se pudo cargar la agenda. ${MENSAJE_SIN_CONEXION}`);
    expect(obtenerAgenda).toHaveBeenCalledTimes(1);
  });

  it('NFR_04_si_la_configuracion_falla_se_ve_su_error_como_antes', async () => {
    const obtenerConfig = vi.fn(async (): Promise<ConfigPublica> => {
      throw new TypeError('Failed to fetch');
    });
    const obtenerAgenda = vi.fn(async () => HUECOS);
    montar(obtenerConfig, obtenerAgenda);
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain(`No se pudo cargar la agenda. ${MENSAJE_SIN_CONEXION}`);
    expect(screen.queryByRole('list')).toBeNull();
  });
});
