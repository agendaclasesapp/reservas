// @vitest-environment jsdom
// Solicitudes pendientes del profesor en `#/lista` (T07.2): WEB-07, PRF-06, SOL-04, SOL-05, SOL-06, SOL-08, PRF-08,
// AVI-03, SEC-09, SEC-16; CA-21, CA-25, CA-63.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  LARGO_MAX_MOTIVO,
  MENSAJES_LISTA,
  MENSAJES_RESPUESTA,
  type Decision,
  type EstadoLectura,
  type ResultadoRespuesta,
  type SolicitudPendiente,
} from '../../../../src/modulos/lista/logica';
import { SolicitudesPendientes } from '../../../../src/modulos/lista/vistas/SolicitudesPendientes';
import { sinViolacionesAxe } from '../../ui/soporte';
import { solicitud } from './soporte';

afterEach(cleanup);

type Responder = (solicitudId: string, decision: Decision, motivo: string | null) => Promise<ResultadoRespuesta>;
const LISTO = (filas: SolicitudPendiente[]): EstadoLectura<SolicitudPendiente> => ({ estado: 'listo', filas, error: null });
const OK_CONFIRMADA: ResultadoRespuesta = { ok: true, estado: 'confirmada' };
const OK_RECHAZADA: ResultadoRespuesta = { ok: true, estado: 'rechazada' };
const fallo = (codigo: string, mensaje: string, campo: 'motivo' | null = null): ResultadoRespuesta =>
  ({ ok: false, codigo, mensaje, campo }) as ResultadoRespuesta;

const ANA = solicitud();
const BRUNO = solicitud({
  id: 's2',
  titular: 'Bruno Díaz',
  quien_toma: 'Bruno Díaz',
  fecha_clase: '2026-11-03T13:00:00Z',
  destino_inicio: '2026-11-03T13:00:00Z',
  destino_fin: '2026-11-03T14:00:00Z',
});

function montar(
  datos: EstadoLectura<SolicitudPendiente>,
  opciones: { profesorActivo?: boolean; responder?: Mock<Responder> } = {},
) {
  const onResponder = opciones.responder ?? vi.fn<Responder>().mockResolvedValue(OK_CONFIRMADA);
  const onRecargar = vi.fn();
  const r = render(
    <SolicitudesPendientes
      datos={datos}
      zona="America/Montevideo"
      profesorActivo={opciones.profesorActivo}
      onResponder={onResponder}
      onRecargar={onRecargar}
    />,
  );
  return { ...r, onResponder, onRecargar };
}

const confirmarDe = (nombre: string) => screen.getByRole('button', { name: new RegExp(`^Confirmar la solicitud de ${nombre}`) });
const rechazarDe = (nombre: string) => screen.getByRole('button', { name: new RegExp(`^Rechazar la solicitud de ${nombre}`) });

describe('estados (F-10)', () => {
  it('PRF_06_mientras_carga_muestra_el_indicador', () => {
    montar({ estado: 'cargando', filas: [], error: null });
    expect(screen.getByRole('heading', { level: 2, name: 'Solicitudes pendientes' })).toBeTruthy();
    expect(screen.getByText('Cargando las solicitudes pendientes…')).toBeTruthy();
  });

  it('PRF_06_el_error_de_carga_ofrece_reintentar', async () => {
    const { onRecargar } = montar({ estado: 'error', filas: [], error: 'No hay conexión.' });
    expect(screen.getByRole('alert').textContent).toContain('No se pudieron cargar las solicitudes pendientes. No hay conexión.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRecargar).toHaveBeenCalledOnce();
  });

  it('PRF_06_sin_solicitudes_dice_No_hay_solicitudes_pendientes', () => {
    montar(LISTO([]));
    expect(screen.getByRole('heading', { level: 3, name: 'No hay solicitudes pendientes' })).toBeTruthy();
  });
});

describe('tarjetas (PRF-06, SEC-16, CA-21)', () => {
  it('PRF_06_muestra_las_solicitudes_en_el_orden_recibido_con_alumno_tipo_fecha_y_hora_del_profesor', () => {
    montar(LISTO([ANA, BRUNO]));
    expect(screen.getByText('2 solicitudes pendientes de respuesta')).toBeTruthy();
    const nombres = screen.getAllByRole('article').map((a) => within(a).getByRole('heading', { level: 3 }).textContent);
    expect(nombres).toEqual(['Ana Pérez', 'Bruno Díaz']);
    const ana = screen.getByRole('article', { name: 'Ana Pérez' });
    expect(within(ana).getByText('Reserva')).toBeTruthy();
    // 13:00 UTC = 10:00 en Montevideo.
    expect(within(ana).getByText('lunes, 2 de noviembre, de 10:00 a 11:00')).toBeTruthy();
  });

  it('PRF_06_una_serie_dice_su_frecuencia_y_la_observacion_se_muestra', () => {
    montar(LISTO([solicitud({ reserva_tipo: 'serie', frecuencia: 1, observacion: 'Vengo con mi hermana' })]));
    expect(screen.getByText('Serie semanal')).toBeTruthy();
    expect(screen.getByText('Vengo con mi hermana')).toBeTruthy();
  });

  it('SOL_02_un_cambio_de_horario_muestra_la_clase_actual_y_el_nuevo_horario_con_el_alcance', () => {
    montar(
      LISTO([
        solicitud({
          tipo: 'movimiento',
          alcance: 'desde_aca',
          origen_inicio: '2026-11-02T13:00:00Z',
          origen_fin: '2026-11-02T14:00:00Z',
          destino_inicio: '2026-11-04T15:00:00Z',
          destino_fin: '2026-11-04T16:00:00Z',
        }),
      ]),
    );
    expect(screen.getByText('Cambio de horario · De acá en adelante')).toBeTruthy();
    expect(screen.getByText('lunes, 2 de noviembre, de 10:00 a 11:00')).toBeTruthy();
    expect(screen.getByText('miércoles, 4 de noviembre, de 12:00 a 13:00')).toBeTruthy();
  });

  it('SEC_16_el_alumno_quien_toma_y_la_observacion_se_muestran_como_texto', () => {
    const { container } = montar(
      LISTO([solicitud({ titular: '<b>Ana</b>', quien_toma: '<i>Lu</i>', observacion: '<script>alert(1)</script>' })]),
    );
    expect(container.querySelector('b, i, script')).toBeNull();
    expect(screen.getByText('<script>alert(1)</script>')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: '<b>Ana</b>' })).toBeTruthy();
  });

  it('PRF_06_los_botones_de_cada_tarjeta_nombran_al_alumno_y_el_dia_y_contienen_su_texto_visible', () => {
    montar(LISTO([ANA, BRUNO]));
    for (const nombre of ['Ana Pérez', 'Bruno Díaz']) {
      expect(confirmarDe(nombre).textContent).toBe('Confirmar');
      expect(rechazarDe(nombre).textContent).toBe('Rechazar');
    }
  });
});

describe('confirmar (SOL-05, CA-18)', () => {
  it('SOL_05_confirmar_responde_sin_motivo_la_tarjeta_sale_y_se_anuncia_el_resultado', async () => {
    const { onResponder, onRecargar } = montar(LISTO([ANA, BRUNO]));
    await userEvent.click(confirmarDe('Ana Pérez'));
    await waitFor(() => expect(onResponder).toHaveBeenCalledWith('s1', 'confirmar', null));
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Ana Pérez' })).toBeNull());
    expect(screen.getByRole('article', { name: 'Bruno Díaz' })).toBeTruthy();
    expect(onRecargar).toHaveBeenCalledOnce();
    // El resultado se anuncia en una región `aria-live` y recibe el foco (la tarjeta ya no está).
    const region = screen.getByRole('status');
    expect(region.textContent).toContain(MENSAJES_RESPUESTA.confirmada);
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(document.activeElement).toBe(region);
    expect(screen.getByText('1 solicitud pendiente de respuesta')).toBeTruthy();
  });

  it('SOL_05_mientras_responde_el_boton_queda_ocupado_y_no_responde_dos_veces', async () => {
    let resolver: (r: ResultadoRespuesta) => void = () => undefined;
    const responder = vi.fn<Responder>().mockReturnValue(new Promise<ResultadoRespuesta>((ok) => (resolver = ok)));
    montar(LISTO([ANA]), { responder });
    await userEvent.click(confirmarDe('Ana Pérez'));
    const boton = screen.getByRole('button', { name: /^Confirmar la solicitud de Ana Pérez/ });
    expect(boton.getAttribute('aria-busy')).toBe('true');
    expect(boton.textContent).toBe('Confirmando…');
    await userEvent.click(boton);
    expect(responder).toHaveBeenCalledOnce();
    expect(rechazarDe('Ana Pérez').hasAttribute('disabled')).toBe(true);
    resolver(OK_CONFIRMADA);
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Ana Pérez' })).toBeNull());
  });

  it('SOL_08_si_ya_estaba_respondida_o_vencio_muestra_el_motivo_en_la_tarjeta_y_vuelve_a_leer', async () => {
    const responder = vi.fn<Responder>().mockResolvedValue(fallo('SOLICITUD_YA_RESPONDIDA', 'Esa solicitud ya fue respondida.'));
    const { onRecargar } = montar(LISTO([ANA]), { responder });
    await userEvent.click(confirmarDe('Ana Pérez'));
    const tarjeta = await screen.findByRole('article', { name: 'Ana Pérez' });
    expect(within(tarjeta).getByRole('alert').textContent).toContain('Esa solicitud ya fue respondida.');
    expect(onRecargar).toHaveBeenCalledOnce();
    expect(screen.queryByText(MENSAJES_RESPUESTA.confirmada)).toBeNull();
  });

  it('PRF_08_un_error_inesperado_se_muestra_en_la_tarjeta_y_no_la_saca_de_la_lista', async () => {
    const responder = vi.fn<Responder>().mockResolvedValue(fallo('ERROR_INTERNO', 'Algo salió mal. Probá de nuevo.'));
    const { onRecargar } = montar(LISTO([ANA]), { responder });
    await userEvent.click(confirmarDe('Ana Pérez'));
    expect((await screen.findByRole('alert')).textContent).toContain('Algo salió mal. Probá de nuevo.');
    expect(onRecargar).not.toHaveBeenCalled();
    expect(screen.getByRole('article', { name: 'Ana Pérez' })).toBeTruthy();
  });
});

describe('rechazar con motivo opcional (SOL-04, SOL-06, AVI-03, SEC-09, CA-20)', () => {
  it('SOL_06_rechazar_abre_el_motivo_con_el_aviso_de_que_le_llega_por_mail_y_el_foco_va_al_dialogo', async () => {
    montar(LISTO([ANA]));
    await userEvent.click(rechazarDe('Ana Pérez'));
    const dialogo = await screen.findByRole('dialog', { name: 'Rechazar la solicitud de Ana Pérez' });
    const campo = within(dialogo).getByLabelText('Motivo (opcional)');
    expect(dialogo.contains(document.activeElement)).toBe(true);
    expect(campo.getAttribute('aria-describedby')).toBeTruthy();
    expect(dialogo.textContent).toContain(MENSAJES_RESPUESTA.avisoMotivo);
    expect(dialogo.textContent).toContain(`Hasta ${LARGO_MAX_MOTIVO} caracteres.`);
  });

  it('SOL_06_rechazar_sin_motivo_manda_null_y_con_motivo_lo_manda_recortado', async () => {
    const { onResponder } = montar(LISTO([ANA, BRUNO]));
    await userEvent.click(rechazarDe('Ana Pérez'));
    await userEvent.click(await screen.findByRole('button', { name: 'Rechazar solicitud' }));
    await waitFor(() => expect(onResponder).toHaveBeenCalledWith('s1', 'rechazar', null));

    await userEvent.click(rechazarDe('Bruno Díaz'));
    await userEvent.type(await screen.findByLabelText('Motivo (opcional)'), '  No tengo lugar ese día  ');
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar solicitud' }));
    await waitFor(() => expect(onResponder).toHaveBeenCalledWith('s2', 'rechazar', 'No tengo lugar ese día'));
  });

  it('SOL_06_al_rechazar_cierra_el_dialogo_la_tarjeta_sale_y_se_anuncia', async () => {
    montar(LISTO([ANA]), { responder: vi.fn<Responder>().mockResolvedValue(OK_RECHAZADA) });
    await userEvent.click(rechazarDe('Ana Pérez'));
    await userEvent.click(await screen.findByRole('button', { name: 'Rechazar solicitud' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('article', { name: 'Ana Pérez' })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain(MENSAJES_RESPUESTA.rechazada);
    expect(screen.getByRole('heading', { level: 3, name: 'No hay solicitudes pendientes' })).toBeTruthy();
  });

  it('SEC_09_un_motivo_de_mas_de_500_caracteres_da_error_asociado_al_campo_y_no_se_envia', async () => {
    const { onResponder } = montar(LISTO([ANA]));
    await userEvent.click(rechazarDe('Ana Pérez'));
    const campo = await screen.findByLabelText('Motivo (opcional)');
    fireEvent.change(campo, { target: { value: 'x'.repeat(LARGO_MAX_MOTIVO + 1) } });
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar solicitud' }));
    expect((await screen.findByRole('alert')).textContent).toBe(MENSAJES_LISTA.motivoLargo);
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(campo);
    expect(onResponder).not.toHaveBeenCalled();
  });

  it('SEC_09_un_motivo_de_exactamente_500_caracteres_se_envia', async () => {
    const { onResponder } = montar(LISTO([ANA]));
    await userEvent.click(rechazarDe('Ana Pérez'));
    fireEvent.change(await screen.findByLabelText('Motivo (opcional)'), { target: { value: 'y'.repeat(LARGO_MAX_MOTIVO) } });
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar solicitud' }));
    await waitFor(() => expect(onResponder).toHaveBeenCalledWith('s1', 'rechazar', 'y'.repeat(LARGO_MAX_MOTIVO)));
  });

  it('SEC_09_el_422_del_motivo_que_devuelve_la_base_queda_en_el_dialogo_con_el_foco_en_el_campo', async () => {
    const responder = vi.fn<Responder>().mockResolvedValue(fallo('DATOS_INVALIDOS', MENSAJES_LISTA.motivoLargo, 'motivo'));
    montar(LISTO([ANA]), { responder });
    await userEvent.click(rechazarDe('Ana Pérez'));
    await userEvent.click(await screen.findByRole('button', { name: 'Rechazar solicitud' }));
    const dialogo = await screen.findByRole('dialog');
    expect((await within(dialogo).findByRole('alert')).textContent).toBe(MENSAJES_LISTA.motivoLargo);
    expect(document.activeElement).toBe(within(dialogo).getByLabelText('Motivo (opcional)'));
    // La solicitud sigue en la lista (detrás del diálogo modal, que la oculta a los lectores).
    expect(screen.getByRole('article', { name: 'Ana Pérez', hidden: true })).toBeTruthy();
  });

  it('SOL_08_si_al_rechazar_ya_estaba_respondida_cierra_el_dialogo_y_deja_el_motivo_en_la_tarjeta', async () => {
    const responder = vi.fn<Responder>().mockResolvedValue(fallo('SOLICITUD_VENCIDA', 'Esa solicitud venció: su horario ya pasó.'));
    const { onRecargar } = montar(LISTO([ANA]), { responder });
    await userEvent.click(rechazarDe('Ana Pérez'));
    await userEvent.click(await screen.findByRole('button', { name: 'Rechazar solicitud' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(within(screen.getByRole('article', { name: 'Ana Pérez' })).getByRole('alert').textContent).toContain('venció');
    expect(onRecargar).toHaveBeenCalledOnce();
  });

  it('A11Y_Cancelar_cierra_el_dialogo_sin_responder', async () => {
    const { onResponder } = montar(LISTO([ANA]));
    await userEvent.click(rechazarDe('Ana Pérez'));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onResponder).not.toHaveBeenCalled();
  });
});

describe('profesor inactivo y pendientes sin respuesta (PRF-08, SOL-08, CA-25, CA-63)', () => {
  it('PRF_08_con_el_profesor_inactivo_Confirmar_queda_deshabilitado_con_el_aviso_y_Rechazar_sigue', async () => {
    const { onResponder } = montar(LISTO([ANA]), { profesorActivo: false });
    expect(screen.getByText(MENSAJES_RESPUESTA.profesorInactivo)).toBeTruthy();
    const confirmar = screen.getByRole('button', { name: /^Confirmar la solicitud de Ana Pérez.*agenda inactiva/ });
    expect(confirmar.hasAttribute('disabled')).toBe(true);
    expect(confirmar.textContent).toBe('Confirmar');
    expect(rechazarDe('Ana Pérez').hasAttribute('disabled')).toBe(false);
    await userEvent.click(confirmar);
    expect(onResponder).not.toHaveBeenCalled();
  });

  it('PRF_08_con_el_profesor_activo_no_aparece_el_aviso_de_agenda_inactiva', () => {
    montar(LISTO([ANA]));
    expect(screen.queryByText(MENSAJES_RESPUESTA.profesorInactivo)).toBeNull();
  });

  it('SOL_08_una_vencida_dice_pendiente_sin_respuesta_va_aparte_y_no_tiene_acciones', () => {
    montar(LISTO([solicitud({ id: 'v1', titular: 'Vera Sosa', vencida: true }), ANA]));
    expect(screen.getByText('1 solicitud pendiente de respuesta')).toBeTruthy();
    const vencida = screen.getByRole('article', { name: 'Vera Sosa' });
    expect(within(vencida).getByText('Pendiente sin respuesta')).toBeTruthy();
    expect(vencida.textContent).toContain(MENSAJES_RESPUESTA.vencida);
    expect(within(vencida).queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByRole('heading', { level: 3, name: 'Pendientes sin respuesta' })).toBeTruthy();
    expect(confirmarDe('Ana Pérez')).toBeTruthy();
  });

  it('SOL_08_con_solo_vencidas_no_dice_que_no_hay_solicitudes', () => {
    montar(LISTO([solicitud({ vencida: true })]));
    expect(screen.queryByText('No hay solicitudes pendientes')).toBeNull();
    expect(screen.getByText('Pendiente sin respuesta')).toBeTruthy();
  });
});

describe('accesibilidad (A11Y, WEB-07)', () => {
  it('no_tiene_violaciones_de_axe_con_vigentes_vencidas_inactivo_y_dialogo_abierto', async () => {
    const { container } = montar(LISTO([ANA, BRUNO, solicitud({ id: 'v1', titular: 'Vera Sosa', vencida: true })]), {
      profesorActivo: false,
    });
    await sinViolacionesAxe(container);
    await userEvent.click(rechazarDe('Ana Pérez'));
    await screen.findByRole('dialog');
    await sinViolacionesAxe(document.body);
  });

  it('no_tiene_violaciones_de_axe_en_cargando_error_y_vacio', async () => {
    for (const datos of [
      { estado: 'cargando', filas: [], error: null } as EstadoLectura<SolicitudPendiente>,
      { estado: 'error', filas: [], error: 'Falló.' } as EstadoLectura<SolicitudPendiente>,
      LISTO([]),
    ]) {
      const { container, unmount } = montar(datos);
      await sinViolacionesAxe(container);
      unmount();
    }
  });
});
