// @vitest-environment jsdom
// Responder solicitudes y copiar el enlace del día desde el Panel (B19, T19.2): CAL-12, CAL-20, CA-76, CA-84, SEC-16,
// SEC-35; A11Y-47, A11Y-54; DEC-42 A, DEC-43 A; ADR-025. Componentes CC-14 `ResponderSolicitud` (con su diálogo del
// motivo), CC-15 `AccionesVista` (copiar), CC-06 `BloqueClase` con «Cancelación pendiente» y el Panel que los compone
// (F-CAL-06, F-CAL-10). Consultas por rol y nombre accesible (sin data-testid).
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bloquesDeClase, type ResultadoRespuestaCalendario } from '../../../../src/modulos/panel/logica';
import { AccionesVista } from '../../../../src/modulos/panel/vistas/AccionesVista';
import { BloqueClase, nombreDelBloque } from '../../../../src/modulos/panel/vistas/BloqueClase';
import type { ResponderSolicitudAccion } from '../../../../src/modulos/panel/vistas/contrato';
import { ResponderSolicitud } from '../../../../src/modulos/panel/vistas/ResponderSolicitud';
import { sinViolacionesAxe } from '../../ui/soporte';
import {
  acciones,
  calendarioDe,
  DIA,
  EJE,
  filasDias,
  H11,
  H12,
  LIBRE_12,
  montar,
  ocupada,
  ZONA,
  type TiposDeSolicitud,
} from './soporte';

afterEach(cleanup);

const HOSTILES = ['<img src=x onerror=alert(1)>', 'x"><script>alert(1)</script>'];
const MOTIVO_LARGO = 'a'.repeat(501);
const TEXTO_MOTIVO_LARGO = 'El motivo puede tener hasta 500 caracteres.';
const ENLACE = 'https://agenda.test/reservas/#/p/ana?d=2026-11-12';

const OK_CONFIRMADA: ResultadoRespuestaCalendario = { ok: true, estado: 'confirmada', mensaje: 'Solicitud confirmada. Le avisamos por mail.' };
const OK_RECHAZADA: ResultadoRespuestaCalendario = { ok: true, estado: 'rechazada', mensaje: 'Solicitud rechazada. Le avisamos por mail.' };

function fallo(mensaje: string, extra: { codigo?: 'SOLICITUD_VENCIDA' | 'DATOS_INVALIDOS'; desactualizada?: boolean } = {}): ResultadoRespuestaCalendario {
  const { codigo = 'DATOS_INVALIDOS', desactualizada = false } = extra;
  return { ok: false, codigo, mensaje, campo: codigo === 'DATOS_INVALIDOS' ? 'motivo' : null, desactualizada };
}

function respuestas(confirmar = OK_CONFIRMADA, rechazar = OK_RECHAZADA) {
  return {
    onConfirmar: vi.fn(() => Promise.resolve(confirmar)),
    onRechazar: vi.fn<(motivo: string | null) => Promise<ResultadoRespuestaCalendario>>(() => Promise.resolve(rechazar)),
  };
}

function montarResponder(nombre = 'Bruno Díaz', extra: Partial<Parameters<typeof ResponderSolicitud>[0]> = {}) {
  const r = respuestas();
  const vista = render(
    <ResponderSolicitud solicitud={{ nombre, cuando: '12/11 11:00, 11:00 a 12:00' }} puedeConfirmar {...r} {...extra} />,
  );
  return { ...vista, ...r };
}

describe('CC-14 ResponderSolicitud (CAL-12, CA-76, A11Y-54)', () => {
  it('CAL_12_CA_76_Confirmar_y_Rechazar_se_ofrecen_y_Confirmar_avisa_sin_motivo', async () => {
    const { onConfirmar } = montarResponder();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(onConfirmar).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeEnabled();
  });

  it('CAL_12_Rechazar_abre_el_dialogo_con_Motivo_opcional_y_el_aviso_de_que_la_persona_ve_el_motivo', async () => {
    montarResponder();
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Rechazar la solicitud de Bruno Díaz' });
    expect(within(dialogo).getByRole('textbox', { name: 'Motivo (opcional)' })).toBeInTheDocument();
    expect(within(dialogo).getByText(/La persona recibe este motivo en el mail de respuesta\. Hasta 500 caracteres\./)).toBeInTheDocument();
    expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('CA_76_rechazar_con_motivo_lo_envia_recortado_y_sin_motivo_envia_null', async () => {
    const { onRechazar } = montarResponder();
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    await userEvent.type(await screen.findByRole('textbox', { name: 'Motivo (opcional)' }), '  Ese día no puedo  ');
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar solicitud' }));
    await waitFor(() => expect(onRechazar).toHaveBeenCalledWith('Ese día no puedo'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await userEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Rechazar solicitud' }));
    await waitFor(() => expect(onRechazar).toHaveBeenLastCalledWith(null));
  });

  it('A11Y_54_CA_76_un_motivo_de_mas_de_500_caracteres_da_el_error_asociado_al_campo_y_no_se_envia', async () => {
    const { onRechazar } = montarResponder();
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    const campo = await screen.findByRole('textbox', { name: 'Motivo (opcional)' });
    await userEvent.click(campo);
    await userEvent.paste(MOTIVO_LARGO);
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar solicitud' }));
    expect(onRechazar).not.toHaveBeenCalled();
    expect(campo).toBeInvalid();
    expect(campo).toHaveAccessibleDescription(new RegExp(TEXTO_MOTIVO_LARGO));
    expect(campo).toHaveFocus();
  });

  it('A11Y_54_el_error_que_devuelve_la_respuesta_queda_en_la_descripcion_del_campo_y_el_dialogo_sigue_abierto', async () => {
    const r = respuestas();
    r.onRechazar.mockResolvedValueOnce(fallo(TEXTO_MOTIVO_LARGO));
    render(<ResponderSolicitud solicitud={{ nombre: 'Bruno Díaz', cuando: '12/11 11:00' }} puedeConfirmar {...r} />);
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    const campo = await screen.findByRole('textbox', { name: 'Motivo (opcional)' });
    await userEvent.type(campo, 'motivo');
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar solicitud' }));
    await waitFor(() => expect(campo).toBeInvalid());
    expect(campo).toHaveAccessibleDescription(new RegExp(TEXTO_MOTIVO_LARGO));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('CAL_12_Cancelar_cierra_el_dialogo_sin_responder', async () => {
    const { onRechazar } = montarResponder();
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onRechazar).not.toHaveBeenCalled();
  });

  it('CAL_12_enviando_Confirmar_queda_aria_busy_con_Confirmando_y_no_se_envia_dos_veces', async () => {
    let resolver: (r: ResultadoRespuestaCalendario) => void = () => undefined;
    const onConfirmar = vi.fn(() => new Promise<ResultadoRespuestaCalendario>((res) => (resolver = res)));
    render(
      <ResponderSolicitud
        solicitud={{ nombre: 'Bruno Díaz', cuando: '12/11 11:00' }}
        puedeConfirmar
        onConfirmar={onConfirmar}
        onRechazar={() => Promise.resolve(OK_RECHAZADA)}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    const boton = screen.getByRole('button', { name: 'Confirmar' });
    expect(boton).toHaveAttribute('aria-busy', 'true');
    expect(boton).toHaveTextContent('Confirmando…');
    await userEvent.click(boton);
    expect(onConfirmar).toHaveBeenCalledTimes(1);
    resolver(OK_CONFIRMADA);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar' })).toBeEnabled());
  });

  it('CAL_12_si_confirmar_falla_el_mensaje_se_anuncia_como_error_y_los_botones_siguen', async () => {
    const r = respuestas();
    r.onConfirmar.mockResolvedValueOnce(fallo('Tu agenda está inactiva.', { codigo: 'SOLICITUD_VENCIDA' }));
    render(<ResponderSolicitud solicitud={{ nombre: 'Bruno Díaz', cuando: '12/11 11:00' }} puedeConfirmar {...r} />);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tu agenda está inactiva.');
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeEnabled();
  });

  it('CAL_12_PRF_08_con_la_agenda_inactiva_Confirmar_esta_deshabilitado_con_su_porque_y_Rechazar_sigue', () => {
    montarResponder('Bruno Díaz', { puedeConfirmar: false });
    expect(screen.getByRole('button', { name: 'Confirmar, no disponible con la agenda inactiva' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeEnabled();
    expect(screen.getByText(/Tu agenda está inactiva: no podés confirmar solicitudes/)).toBeInTheDocument();
  });

  it('CAL_12_en_la_lista_los_botones_nombran_la_solicitud_para_distinguirlas', () => {
    montarResponder('Bruno Díaz', { variante: 'lista' });
    expect(screen.getByRole('button', { name: 'Confirmar la solicitud de Bruno Díaz para 12/11 11:00, 11:00 a 12:00' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rechazar la solicitud de Bruno Díaz para 12/11 11:00, 11:00 a 12:00' })).toBeInTheDocument();
  });

  it.each(HOSTILES)('SEC_16_SEC_35_el_nombre_hostil_%s_se_ve_literal_en_el_titulo_del_dialogo_sin_img_ni_script', async (hostil) => {
    montarResponder(hostil);
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    const dialogo = await screen.findByRole('dialog', { name: `Rechazar la solicitud de ${hostil}` });
    expect(within(dialogo).getByRole('heading', { name: `Rechazar la solicitud de ${hostil}` })).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
  });

  it.each(HOSTILES)('SEC_16_SEC_35_el_motivo_hostil_%s_se_envia_tal_cual_y_se_ve_literal_en_el_campo_y_en_el_error', async (hostil) => {
    const r = respuestas();
    r.onRechazar.mockResolvedValueOnce(fallo(hostil));
    render(<ResponderSolicitud solicitud={{ nombre: 'Bruno Díaz', cuando: '12/11 11:00' }} puedeConfirmar {...r} />);
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    const campo = await screen.findByRole('textbox', { name: 'Motivo (opcional)' });
    await userEvent.click(campo);
    await userEvent.paste(hostil);
    expect(campo).toHaveValue(hostil);
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar solicitud' }));
    await waitFor(() => expect(r.onRechazar).toHaveBeenCalledWith(hostil));
    expect(await screen.findByText(hostil, { selector: 'p' })).toBeInTheDocument();
    expect(campo).toHaveAccessibleDescription(new RegExp(hostil.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
  });

  it('A11Y_CC_14_con_el_dialogo_abierto_no_tiene_violaciones_de_axe', async () => {
    montarResponder();
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    await screen.findByRole('dialog');
    await sinViolacionesAxe(document.body);
  });
});

describe('CC-15 AccionesVista · copiar el enlace del día (CAL-20, CA-84, A11Y-47)', () => {
  const base = { modoLista: false, onModo: vi.fn() };

  it('CAL_20_solo_en_la_vista_Dia_se_ofrece_Copiar_enlace_de_este_dia', () => {
    const { rerender } = render(<AccionesVista {...base} />);
    expect(screen.queryByRole('button', { name: /Copiar enlace/ })).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    rerender(<AccionesVista {...base} copiable hayEnlace onCopiar={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Copiar enlace de este día' })).toBeEnabled();
  });

  it('CA_84_tocar_el_boton_pide_copiar_y_no_mueve_el_foco', async () => {
    const onCopiar = vi.fn();
    render(<AccionesVista {...base} copiable hayEnlace onCopiar={onCopiar} />);
    const boton = screen.getByRole('button', { name: 'Copiar enlace de este día' });
    await userEvent.click(boton);
    expect(onCopiar).toHaveBeenCalledTimes(1);
    expect(boton).toHaveFocus();
  });

  it('A11Y_47_el_role_status_esta_desde_el_primer_render_y_dice_Enlace_copiado_al_copiar', () => {
    const { rerender } = render(<AccionesVista {...base} copiable hayEnlace onCopiar={vi.fn()} />);
    const estado = screen.getByRole('status');
    expect(estado).toHaveTextContent('');
    rerender(<AccionesVista {...base} copiable hayEnlace onCopiar={vi.fn()} copia="copiado" />);
    expect(screen.getByRole('status')).toBe(estado);
    expect(estado).toHaveTextContent('Enlace copiado');
  });

  it('CAL_20_si_el_navegador_no_deja_copiar_el_status_dice_el_fallo_y_da_el_enlace_como_texto', () => {
    render(<AccionesVista {...base} copiable hayEnlace onCopiar={vi.fn()} copia="fallo" enlace={ENLACE} />);
    expect(screen.getByRole('status')).toHaveTextContent(`No se pudo copiar el enlace. Copialo a mano: ${ENLACE}`);
  });

  it('CAL_20_SEC_16_sin_enlace_valido_el_boton_esta_deshabilitado_y_dice_por_que', () => {
    render(<AccionesVista {...base} copiable hayEnlace={false} onCopiar={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Copiar enlace de este día, no disponible' })).toBeDisabled();
  });

  it('A11Y_CC_15_con_copiar_y_resultado_no_tiene_violaciones_de_axe', async () => {
    const { container } = render(<AccionesVista {...base} copiable hayEnlace onCopiar={vi.fn()} copia="copiado" />);
    await sinViolacionesAxe(container);
  });
});

describe('CC-06 BloqueClase con «Cancelación pendiente» (DEC-43 A, NFR-11)', () => {
  const TIPOS: TiposDeSolicitud = { s2: 'cancelacion', s3: 'movimiento' };

  function bloqueCon(solicitudId: string | null) {
    const filas = filasDias([ocupada({ solicitud_id: solicitudId })], DIA, TIPOS);
    const bloque = bloquesDeClase(filas, ZONA)[0];
    if (!bloque) throw new Error('Sin bloque.');
    return bloque;
  }

  it('DEC_43_A_una_clase_con_cancelacion_pendiente_se_ve_CONFIRMADA_y_dice_Cancelacion_pendiente_en_texto', () => {
    const bloque = bloqueCon('s2');
    expect(bloque.cancelacionPendiente).toBe(true);
    render(
      <ul>
        <BloqueClase clase={bloque} dia={DIA} zona={ZONA} eje={EJE} onAbrir={vi.fn()} />
      </ul>,
    );
    const boton = screen.getByRole('button', { name: 'Jue 12/11, 10:00 a 11:00, Confirmada, Cancelación pendiente, Ana Pérez' });
    expect(within(boton).getByText('Confirmada')).toBeInTheDocument();
    expect(within(boton).getByText('Cancelación pendiente')).toBeInTheDocument();
    expect(boton.className).toMatch(/confirmada/);
    expect(boton.className).not.toMatch(/pendiente/);
  });

  it('DEC_43_A_una_clase_confirmada_comun_o_origen_de_un_movimiento_no_dice_Cancelacion_pendiente', () => {
    expect(nombreDelBloque(bloqueCon(null), DIA, ZONA)).toBe('Jue 12/11, 10:00 a 11:00, Confirmada, Ana Pérez');
    expect(nombreDelBloque(bloqueCon('s3'), DIA, ZONA)).toBe('Jue 12/11, 10:00 a 11:00, Confirmada, Ana Pérez');
  });

  it('A11Y_CC_06_con_cancelacion_pendiente_no_tiene_violaciones_de_axe', async () => {
    const { container } = render(
      <ul>
        <BloqueClase clase={bloqueCon('s2')} dia={DIA} zona={ZONA} eje={EJE} onAbrir={vi.fn()} />
      </ul>,
    );
    await sinViolacionesAxe(container);
  });
});

describe('Panel · responder solicitudes desde el calendario y la lista (CAL-12, CA-76, F-CAL-06, A11Y-47)', () => {
  const TIPOS: TiposDeSolicitud = { s1: 'reserva', s2: 'cancelacion', s3: 'movimiento', s4: 'movimiento' };
  const PENDIENTE = ocupada({
    inicio: H11,
    fin: H12,
    clase_id: 'c2',
    clase_estado: 'pendiente',
    solicitud_id: 's1',
    quien_toma: 'Bruno Díaz',
    titular: 'Bruno Díaz',
  });

  function montarConRespuesta(
    filas = [ocupada(), PENDIENTE, LIBRE_12],
    respuesta: ResultadoRespuestaCalendario = OK_CONFIRMADA,
    extra: Parameters<typeof montar>[1] = {},
  ) {
    const responder = vi.fn<ResponderSolicitudAccion>(() => Promise.resolve(respuesta));
    const vista = montar(filas, {
      modo: 'calendario',
      escritorio: true,
      // En la página real la lista y el detalle leen las mismas filas de `agenda_profesor_dias` (con `solicitud_tipo`).
      agenda: { estado: 'listo', datos: filasDias(filas, DIA, TIPOS), error: null },
      calendario: calendarioDe(filas, DIA, extra.profesorActivo ?? true, TIPOS),
      acciones: { ...acciones(), responder },
      ...extra,
    });
    return { ...vista, responder };
  }

  const bloquePendiente = () => screen.getByRole('button', { name: /11:00 a 12:00, Pendiente, Bruno Díaz/ });

  it('CA_76_F_CAL_06_Confirmar_desde_el_bloque_PENDIENTE_anuncia_Clase_confirmada_y_el_foco_va_a_la_grilla', async () => {
    const { responder } = montarConRespuesta();
    await userEvent.click(bloquePendiente());
    const columna = screen.getByRole('complementary');
    await userEvent.click(within(columna).getByRole('button', { name: 'Confirmar' }));
    expect(responder).toHaveBeenCalledWith({ id: 's1', tipo: 'reserva', claseId: 'c2' }, 'confirmar', null);
    expect(await screen.findByText('Clase confirmada')).toBeInTheDocument();
    expect(screen.queryByRole('complementary')).toBeNull();
    await waitFor(() => expect(screen.getByRole('group', { name: /Calendario/ })).toHaveFocus());
  });

  it('CA_76_F_CAL_06_Rechazar_con_motivo_anuncia_Clase_rechazada_y_el_foco_vuelve_a_la_grilla', async () => {
    const { responder } = montarConRespuesta([ocupada(), PENDIENTE, LIBRE_12], OK_RECHAZADA);
    await userEvent.click(bloquePendiente());
    await userEvent.click(within(screen.getByRole('complementary')).getByRole('button', { name: 'Rechazar' }));
    await userEvent.type(await screen.findByRole('textbox', { name: 'Motivo (opcional)' }), 'No tengo lugar');
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar solicitud' }));
    await waitFor(() => expect(responder).toHaveBeenCalledWith({ id: 's1', tipo: 'reserva', claseId: 'c2' }, 'rechazar', 'No tengo lugar'));
    expect(await screen.findByText('Clase rechazada')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('complementary')).toBeNull();
    await waitFor(() => expect(screen.getByRole('group', { name: /Calendario/ })).toHaveFocus());
  });

  it('DEC_42_A_el_bloque_PENDIENTE_del_destino_de_un_movimiento_se_responde_igual', async () => {
    const destino = { ...PENDIENTE, solicitud_id: 's4' };
    const { responder } = montarConRespuesta([ocupada(), destino, LIBRE_12]);
    await userEvent.click(bloquePendiente());
    await userEvent.click(within(screen.getByRole('complementary')).getByRole('button', { name: 'Confirmar' }));
    expect(responder).toHaveBeenCalledWith({ id: 's4', tipo: 'movimiento', claseId: 'c2' }, 'confirmar', null);
  });

  it('DEC_42_A_el_origen_confirmado_de_un_movimiento_no_se_responde_y_manda_a_la_Lista', async () => {
    const origen = ocupada({ inicio: H11, fin: H12, clase_id: 'c3', solicitud_id: 's3', quien_toma: 'Carla Gómez', titular: 'Carla Gómez' });
    montarConRespuesta([origen, LIBRE_12]);
    await userEvent.click(screen.getByRole('button', { name: /11:00 a 12:00, Confirmada, Carla Gómez/ }));
    const columna = screen.getByRole('complementary');
    expect(within(columna).queryByRole('button', { name: 'Confirmar' })).toBeNull();
    expect(within(columna).getByRole('link', { name: 'Responder en la lista' })).toHaveAttribute('href', '#/lista');
  });

  it('DEC_43_A_la_clase_con_cancelacion_pendiente_se_responde_desde_su_detalle_ademas_de_las_acciones_de_clase', async () => {
    const conCancelacion = ocupada({ solicitud_id: 's2' });
    const { responder } = montarConRespuesta([conCancelacion, LIBRE_12]);
    await userEvent.click(screen.getByRole('button', { name: /10:00 a 11:00, Confirmada, Cancelación pendiente, Ana Pérez/ }));
    const columna = screen.getByRole('complementary');
    expect(within(columna).getByRole('button', { name: 'Mover' })).toBeInTheDocument();
    expect(within(columna).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    await userEvent.click(within(columna).getByRole('button', { name: 'Confirmar' }));
    expect(responder).toHaveBeenCalledWith({ id: 's2', tipo: 'cancelacion', claseId: 'c1' }, 'confirmar', null);
  });

  it('CAL_12_PRF_08_con_la_agenda_inactiva_el_detalle_deja_Confirmar_deshabilitado_y_Rechazar_sigue', async () => {
    montarConRespuesta([ocupada(), PENDIENTE, LIBRE_12], OK_CONFIRMADA, { profesorActivo: false });
    await userEvent.click(bloquePendiente());
    const columna = screen.getByRole('complementary');
    expect(within(columna).getByRole('button', { name: /^Confirmar, no disponible con la agenda inactiva/ })).toBeDisabled();
    expect(within(columna).getByRole('button', { name: 'Rechazar' })).toBeEnabled();
  });

  it('CAL_12_si_la_solicitud_ya_no_se_puede_responder_el_detalle_se_cierra_y_el_motivo_queda_sobre_la_agenda', async () => {
    const vencida = fallo('Esa solicitud ya venció.', { codigo: 'SOLICITUD_VENCIDA', desactualizada: true });
    const { responder, onRecargarAgenda } = montarConRespuesta([ocupada(), PENDIENTE, LIBRE_12], vencida);
    await userEvent.click(bloquePendiente());
    await userEvent.click(within(screen.getByRole('complementary')).getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Esa solicitud ya venció.');
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(responder).toHaveBeenCalledTimes(1);
    // La relectura la pide la lógica (`releer`): la vista no la repite.
    expect(onRecargarAgenda).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('group', { name: /Calendario/ })).toHaveFocus());
  });

  it('CAL_12_en_un_diálogo_en_pantalla_angosta_tambien_se_responde', async () => {
    const { responder } = montarConRespuesta([ocupada(), PENDIENTE, LIBRE_12], OK_CONFIRMADA, { escritorio: false });
    await userEvent.click(bloquePendiente());
    const dialogo = await screen.findByRole('dialog', { name: /Clase del/ });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar' }));
    expect(responder).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Clase confirmada')).toBeInTheDocument();
  });

  it('CAL_12_sin_responder_conectado_la_pendiente_sigue_de_solo_lectura_con_el_enlace_a_la_Lista', async () => {
    montar([ocupada(), PENDIENTE, LIBRE_12], { modo: 'calendario', escritorio: true });
    await userEvent.click(bloquePendiente());
    const columna = screen.getByRole('complementary');
    expect(within(columna).queryByRole('button', { name: 'Confirmar' })).toBeNull();
    expect(within(columna).getByRole('link', { name: 'Responder en la lista' })).toBeInTheDocument();
  });

  it('CAL_12_CAL_19_en_Ver_como_lista_la_fila_pendiente_se_responde_en_la_fila_y_el_resultado_se_anuncia', async () => {
    const filas = [ocupada(), PENDIENTE, LIBRE_12];
    const responder = vi.fn<ResponderSolicitudAccion>(() => Promise.resolve(OK_CONFIRMADA));
    montar(filas, {
      modo: 'lista',
      agenda: { estado: 'listo', datos: filasDias(filas, DIA, TIPOS), error: null },
      acciones: { ...acciones(), responder },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar la solicitud de Bruno Díaz para 12/11 11:00, 11:00 a 12:00' }));
    expect(responder).toHaveBeenCalledWith({ id: 's1', tipo: 'reserva', claseId: 'c2' }, 'confirmar', null);
    expect(await screen.findByText('Clase confirmada')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Responder en la lista/ })).toBeNull();
  });

  it('CAL_12_DEC_43_A_en_Ver_como_lista_la_clase_con_cancelacion_pendiente_lo_dice_y_se_responde_en_su_fila', async () => {
    const filas = [ocupada({ solicitud_id: 's2' }), LIBRE_12];
    const responder = vi.fn<ResponderSolicitudAccion>(() => Promise.resolve(OK_RECHAZADA));
    montar(filas, {
      modo: 'lista',
      agenda: { estado: 'listo', datos: filasDias(filas, DIA, TIPOS), error: null },
      acciones: { ...acciones(), responder },
    });
    expect(screen.getByText('Cancelación pendiente')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar la solicitud de Ana Pérez para 12/11 10:00, 10:00 a 11:00' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Rechazar solicitud' }));
    await waitFor(() => expect(responder).toHaveBeenCalledWith({ id: 's2', tipo: 'cancelacion', claseId: 'c1' }, 'rechazar', null));
    expect(await screen.findByText('Clase rechazada')).toBeInTheDocument();
  });

  it.each(HOSTILES)('SEC_16_SEC_35_el_titular_hostil_%s_se_ve_literal_en_el_detalle_y_en_el_dialogo_del_rechazo', async (hostil) => {
    const pendiente = { ...PENDIENTE, titular: hostil, quien_toma: hostil };
    montarConRespuesta([ocupada(), pendiente, LIBRE_12]);
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`11:00 a 12:00, Pendiente, ${hostil.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }));
    const columna = screen.getByRole('complementary');
    await userEvent.click(within(columna).getByRole('button', { name: 'Rechazar' }));
    expect(await screen.findByRole('dialog', { name: `Rechazar la solicitud de ${hostil}` })).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
  });

  it('A11Y_el_detalle_de_una_solicitud_con_sus_botones_no_tiene_violaciones_de_axe', async () => {
    const { container } = montarConRespuesta();
    await userEvent.click(bloquePendiente());
    await sinViolacionesAxe(container);
  });
});

describe('Panel · «Copiar enlace de este día» (CAL-20, CA-84, F-CAL-10, A11Y-47)', () => {
  const filas = [ocupada(), LIBRE_12];

  it('CA_84_copia_el_enlace_del_dia_y_anuncia_Enlace_copiado_sin_mover_el_foco', async () => {
    const copiar = vi.fn(() => Promise.resolve(true));
    montar(filas, { modo: 'calendario', copiarEnlace: { enlace: ENLACE, copiar } });
    const boton = screen.getByRole('button', { name: 'Copiar enlace de este día' });
    await userEvent.click(boton);
    expect(copiar).toHaveBeenCalledWith(ENLACE);
    await waitFor(() => expect(screen.getByText('Enlace copiado')).toBeInTheDocument());
    expect(screen.getByText('Enlace copiado').closest('[role="status"]')).not.toBeNull();
    expect(boton).toHaveFocus();
  });

  it('CAL_20_si_el_navegador_no_deja_copiar_se_anuncia_el_fallo_con_el_enlace_para_copiarlo_a_mano', async () => {
    montar(filas, { modo: 'calendario', copiarEnlace: { enlace: ENLACE, copiar: () => Promise.resolve(false) } });
    await userEvent.click(screen.getByRole('button', { name: 'Copiar enlace de este día' }));
    expect(await screen.findByText(/No se pudo copiar el enlace\. Copialo a mano:/)).toHaveTextContent(ENLACE);
    expect(screen.queryByText('Enlace copiado')).toBeNull();
  });

  it('CAL_20_sin_enlace_el_boton_esta_deshabilitado_y_sin_copiarEnlace_no_se_ofrece', () => {
    const { unmount } = montar(filas, { modo: 'calendario', copiarEnlace: { enlace: null, copiar: vi.fn() } });
    expect(screen.getByRole('button', { name: 'Copiar enlace de este día, no disponible' })).toBeDisabled();
    unmount();
    montar(filas, { modo: 'calendario' });
    expect(screen.queryByRole('button', { name: /Copiar enlace de este día/ })).toBeNull();
  });

  it('CAL_20_al_cambiar_de_dia_el_aviso_de_copiado_se_borra', async () => {
    const copiar = vi.fn(() => Promise.resolve(true));
    montar(filas, { modo: 'calendario', copiarEnlace: { enlace: ENLACE, copiar } });
    await userEvent.click(screen.getByRole('button', { name: 'Copiar enlace de este día' }));
    await screen.findByText('Enlace copiado');
    await userEvent.click(screen.getByRole('button', { name: /Día siguiente/ }));
    expect(screen.queryByText('Enlace copiado')).toBeNull();
  });

  it('A11Y_el_panel_con_el_boton_de_copiar_y_su_resultado_no_tiene_violaciones_de_axe', async () => {
    const { container } = montar(filas, {
      modo: 'calendario',
      copiarEnlace: { enlace: ENLACE, copiar: () => Promise.resolve(true) },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Copiar enlace de este día' }));
    await screen.findByText('Enlace copiado');
    await sinViolacionesAxe(container);
  });
});
