// @vitest-environment jsdom
// Pruebas de componente de «Mails fallidos» (T03.2): WEB-08, NFR-07, AVI-08, CA-34.
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MENSAJE_SIN_CONEXION } from '../../../../src/lib/errores';
import {
  MOTIVO_DESTINATARIO_INVALIDO,
  MOTIVO_SIN_CONFIRMACION,
  MOTIVO_TOPE,
  type MailFallido,
} from '../../../../src/modulos/configuracion/logica';
import { SeccionMailsFallidos } from '../../../../src/modulos/configuracion/vistas/SeccionMailsFallidos';
import {
  TablaMailsFallidos,
  TEXTO_FECHA_INVALIDA,
  TEXTO_MOTIVO_CREDENCIALES,
  TEXTO_MOTIVO_DESCONOCIDO,
  TEXTO_MOTIVO_DESTINATARIO_INVALIDO,
  TEXTO_MOTIVO_SIN_CONFIRMACION,
  TEXTO_MOTIVO_TOPE,
  TEXTO_SIN_DESTINATARIO,
  TEXTO_VACIO,
} from '../../../../src/modulos/configuracion/vistas/TablaMailsFallidos';
import { sinViolacionesAxe } from '../../ui/soporte';

const ZONA = 'America/Argentina/Buenos_Aires';
const ID_1 = '11111111-1111-4111-8111-111111111111';
const ID_2 = '22222222-2222-4222-8222-222222222222';
const ID_3 = '33333333-3333-4333-8333-333333333333';
const ID_4 = '44444444-4444-4444-8444-444444444444';

// 2026-11-02 15:30 UTC = 12:30 en Buenos Aires (UTC-3).
const POR_TOPE: MailFallido = {
  id: ID_1,
  fecha: '2026-11-02T15:30:00+00:00',
  destinatario: 'ana@ejemplo.test',
  tipo: 'solicitud_respondida',
  motivo: MOTIVO_TOPE,
};
const POR_CREDENCIALES: MailFallido = {
  id: ID_2,
  fecha: '2026-11-01T10:00:00+00:00',
  destinatario: 'beto@ejemplo.test',
  tipo: 'clase_creada',
  motivo: 'Invalid login: 535-5.7.8 Username and Password not accepted',
};
const SIN_CONFIRMAR: MailFallido = {
  id: ID_3,
  fecha: '2026-10-31T10:00:00+00:00',
  destinatario: 'cora@ejemplo.test',
  tipo: 'recordatorio',
  motivo: MOTIVO_SIN_CONFIRMACION,
};
const ALUMNO_BORRADO: MailFallido = {
  id: ID_4,
  fecha: '2026-10-30T10:00:00+00:00',
  destinatario: null,
  tipo: 'clase_cancelada',
  motivo: null,
};

afterEach(cleanup);

function montar(lector: () => Promise<MailFallido[]>) {
  return render(<SeccionMailsFallidos zona={ZONA} lector={lector} />);
}

describe('Mails fallidos: lista (WEB-08, NFR-07, CA-34)', () => {
  it('CA_34_muestra_fecha_destinatario_tipo_y_motivo_de_cada_mail_fallido', async () => {
    const { container } = montar(async () => [POR_CREDENCIALES]);
    const tabla = await screen.findByRole('table');
    expect(within(tabla).getAllByRole('columnheader').map((c) => c.textContent)).toEqual([
      'Fecha',
      'Destinatario',
      'Tipo',
      'Motivo',
    ]);
    const fila = within(tabla).getByRole('row', { name: /beto@ejemplo\.test/ });
    expect(within(fila).getByText(/1 de noviembre, 07:00/)).toHaveProperty('tagName', 'TIME');
    expect(within(fila).getByText('Clase creada')).toBeTruthy();
    expect(within(fila).getByText(TEXTO_MOTIVO_CREDENCIALES)).toBeTruthy();
    expect(within(fila).getByText(/535-5\.7\.8/)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Mails fallidos' })).toBeTruthy();
    await sinViolacionesAxe(container);
  });

  it('AVI_08_el_motivo_TOPE_se_dice_en_palabras_y_no_como_codigo', async () => {
    montar(async () => [POR_TOPE]);
    const fila = await screen.findByRole('row', { name: /ana@ejemplo\.test/ });
    expect(within(fila).getByText(TEXTO_MOTIVO_TOPE)).toBeTruthy();
    expect(within(fila).getByText('Solicitud respondida')).toBeTruthy();
    expect(within(fila).getByText(/2 de noviembre, 12:30/)).toBeTruthy();
    expect(fila.textContent).not.toContain(MOTIVO_TOPE);
    expect(TEXTO_MOTIVO_TOPE.toLowerCase()).toContain('se superó el tope de envío');
  });

  it('NFR_07_SIN_CONFIRMACION_se_dice_en_palabras', async () => {
    montar(async () => [SIN_CONFIRMAR]);
    const fila = await screen.findByRole('row', { name: /cora@ejemplo\.test/ });
    expect(within(fila).getByText(TEXTO_MOTIVO_SIN_CONFIRMACION)).toBeTruthy();
    expect(fila.textContent).not.toContain(MOTIVO_SIN_CONFIRMACION);
  });

  it('H_141_destinatario_invalido_se_dice_en_palabras_y_la_operacion_se_completo', async () => {
    const { container } = montar(async () => [
      { ...POR_CREDENCIALES, destinatario: 'a@b.c, d@e.f', motivo: MOTIVO_DESTINATARIO_INVALIDO },
    ]);
    const fila = await screen.findByRole('row', { name: /a@b\.c, d@e\.f/ });
    expect(within(fila).getByText(TEXTO_MOTIVO_DESTINATARIO_INVALIDO)).toBeTruthy();
    expect(fila.textContent).not.toContain(MOTIVO_DESTINATARIO_INVALIDO);
    await sinViolacionesAxe(container);
  });

  it('NFR_07_un_error_del_servidor_de_correo_sin_pistas_de_credenciales_conserva_su_texto', async () => {
    montar(async () => [{ ...POR_CREDENCIALES, motivo: 'Connection timeout' }]);
    const fila = await screen.findByRole('row', { name: /beto@ejemplo\.test/ });
    expect(within(fila).getByText('No se pudo enviar el mail.')).toBeTruthy();
    expect(within(fila).getByText('Connection timeout')).toBeTruthy();
    expect(within(fila).queryByText(TEXTO_MOTIVO_CREDENCIALES)).toBeNull();
  });

  it('NFR_07_tolera_destinatario_y_motivo_nulos_de_un_alumno_borrado', async () => {
    const { container } = montar(async () => [ALUMNO_BORRADO]);
    const tabla = await screen.findByRole('table');
    expect(within(tabla).getByText(TEXTO_SIN_DESTINATARIO)).toBeTruthy();
    expect(within(tabla).getByText(TEXTO_MOTIVO_DESCONOCIDO)).toBeTruthy();
    expect(within(tabla).getByText('Clase cancelada')).toBeTruthy();
    await sinViolacionesAxe(container);
  });

  it('NFR_07_conserva_el_orden_recibido_y_muestra_las_fechas_en_el_huso_del_profesor', async () => {
    montar(async () => [POR_TOPE, POR_CREDENCIALES, SIN_CONFIRMAR]);
    const filas = (await screen.findAllByRole('row')).slice(1);
    expect(filas.map((f) => within(f).getAllByRole('cell')[0]?.textContent)).toEqual([
      'ana@ejemplo.test',
      'beto@ejemplo.test',
      'cora@ejemplo.test',
    ]);
  });

  it('NFR_07_una_fecha_ilegible_no_rompe_la_tabla', () => {
    render(
      <TablaMailsFallidos vista={{ estado: 'listo', mails: [{ ...POR_TOPE, fecha: 'no es fecha' }] }} zona={ZONA} />,
    );
    expect(screen.getByText(TEXTO_FECHA_INVALIDA)).toBeTruthy();
    expect(screen.getByText(TEXTO_MOTIVO_TOPE)).toBeTruthy();
  });
});

describe('Mails fallidos: estados (WEB-08)', () => {
  it('muestra_cargando_mientras_lee_y_sin_violaciones_de_axe', async () => {
    let resolver: (mails: MailFallido[]) => void = () => {};
    const lector = () => new Promise<MailFallido[]>((r) => (resolver = r));
    const { container } = montar(lector);
    expect(screen.getByRole('status').textContent).toContain('Cargando los mails fallidos…');
    expect(screen.queryByRole('table')).toBeNull();
    await sinViolacionesAxe(container);
    resolver([]);
    expect(await screen.findByRole('heading', { name: TEXTO_VACIO })).toBeTruthy();
  });

  it('CA_34_lista_vacia_dice_que_no_hay_mails_fallidos', async () => {
    const { container } = montar(async () => []);
    expect(await screen.findByRole('heading', { level: 3, name: 'No hay mails fallidos' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    await sinViolacionesAxe(container);
  });

  it('error_se_anuncia_traducido_y_reintentar_vuelve_a_leer', async () => {
    const lector = vi
      .fn<() => Promise<MailFallido[]>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce([POR_TOPE]);
    const { container } = montar(lector);
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('No se pudieron cargar los mails fallidos.');
    expect(alerta.textContent).toContain(MENSAJE_SIN_CONEXION);
    expect(alerta.textContent).not.toContain('Failed to fetch');
    await sinViolacionesAxe(container);

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('row', { name: /ana@ejemplo\.test/ })).toBeTruthy();
    expect(lector).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Mails fallidos: presentación pura (C-75)', () => {
  it('cada_vista_se_renderiza_sin_violaciones_de_axe', async () => {
    const onReintentar = vi.fn();
    const vistas = [
      { estado: 'cargando' },
      { estado: 'error', mensaje: 'No se pudo.', onReintentar },
      { estado: 'listo', mails: [] },
      { estado: 'listo', mails: [POR_TOPE, POR_CREDENCIALES, SIN_CONFIRMAR, ALUMNO_BORRADO] },
    ] as const;
    for (const vista of vistas) {
      const { container, unmount } = render(<TablaMailsFallidos vista={vista} zona={ZONA} />);
      await sinViolacionesAxe(container);
      unmount();
    }
  });
});
