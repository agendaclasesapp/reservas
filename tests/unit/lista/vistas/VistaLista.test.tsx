// @vitest-environment jsdom
// Vista de la lista del profesor (T05.2): WEB-07, ALU-03, ALU-04, ALU-05, ALU-07, ALU-08, ALU-09, SEC-16, CA-04, CA-06, CA-07.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CUENTA_NO_PENDIENTE,
  LARGO_MAX_MOTIVO,
  MENSAJES_LISTA,
  UNION_NO_VALIDA,
  type EstadoAlumnos,
} from '../../../../src/modulos/lista/logica';
import { MENSAJE_GENERICO } from '../../../../src/lib/errores';
import { VistaLista } from '../../../../src/modulos/lista/vistas/VistaLista';
import { sinViolacionesAxe } from '../../ui/soporte';
import { acciones, alumno, fallo, type AccionesSimuladas } from './soporte';

afterEach(cleanup);

const HOY = '2026-11-02';
const LISTO = (alumnos: ReturnType<typeof alumno>[]): EstadoAlumnos => ({ estado: 'listo', alumnos, error: null });

const PENDIENTE = alumno({
  id: 'p1',
  estado: 'pendiente',
  nombre: 'Bruno Díaz',
  mail: 'bruno@correo.test',
  telefono: '+598 99 123-456',
  fecha_nacimiento: '2000-05-10',
  como_llego: 'Te vi en Instagram',
  edad: 26,
});
const APROBADA = alumno();
const SIN_CUENTA = alumno({
  id: 's1',
  estado: 'sin_cuenta',
  nombre: 'Bruno D.',
  mail: null,
  telefono: '099123456',
  con_usuario: false,
  edad: 26,
});

function montar(datos: EstadoAlumnos, acc: AccionesSimuladas = acciones()) {
  const onRecargar = vi.fn();
  const resultado = render(<VistaLista datos={datos} hoy={HOY} onRecargar={onRecargar} acciones={acc} />);
  return { ...resultado, acc, onRecargar };
}

describe('VistaLista · estados (WEB-07)', () => {
  it('WEB_07_cargando_muestra_el_titulo_y_un_indicador_sin_listas', async () => {
    const { container } = montar({ estado: 'cargando', alumnos: [], error: null });
    expect(screen.getByRole('heading', { level: 1, name: 'Lista' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Cargando la lista de alumnos…');
    expect(screen.queryByRole('table')).toBeNull();
    await sinViolacionesAxe(container);
  });

  it('WEB_07_si_falla_la_lectura_muestra_el_error_y_reintentar_vuelve_a_leer', async () => {
    const { container, onRecargar } = montar({ estado: 'error', alumnos: [], error: 'Sin conexión.' });
    expect(screen.getByRole('alert').textContent).toContain('No se pudo cargar la lista de alumnos. Sin conexión.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRecargar).toHaveBeenCalledOnce();
    await sinViolacionesAxe(container);
  });

  it('WEB_07_sin_cuentas_ni_alumnos_muestra_los_dos_vacios_y_deja_agregar', async () => {
    const { container } = montar(LISTO([]));
    expect(screen.getByRole('heading', { name: 'No hay cuentas pendientes' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Todavía no hay alumnos' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Agregar alumno' })).toBeTruthy();
    await sinViolacionesAxe(container);
  });

  it('ALU_09_CA_07_muestra_cada_alumno_con_estado_en_texto_ficha_completa_y_edad', async () => {
    const { container } = montar(
      LISTO([
        PENDIENTE,
        APROBADA,
        alumno({ id: 'r1', estado: 'rechazado', nombre: 'Rita', motivo_estado: 'Sin cupo', edad: 1 }),
        SIN_CUENTA,
      ]),
    );
    const tabla = screen.getByRole('table', { name: /Alumnos con su estado, ficha y edad/ });
    const filas = within(tabla).getAllByRole('row');
    expect(filas).toHaveLength(5);
    const ana = within(tabla).getByRole('row', { name: /Ana Pérez/ });
    expect(ana.textContent).toContain('Aprobado');
    expect(ana.textContent).toContain('36 años');
    expect(ana.textContent).toContain('3 de febrero de 1990');
    expect(ana.textContent).toContain('099 123 456');
    expect(ana.textContent).toContain('Me recomendó una amiga');
    expect(within(tabla).getByRole('row', { name: /Bruno Díaz/ }).textContent).toContain('Pendiente');
    const rita = within(tabla).getByRole('row', { name: /Rita/ });
    expect(rita.textContent).toContain('Rechazado');
    expect(rita.textContent).toContain('1 año');
    expect(rita.textContent).toContain('Motivo del rechazo: Sin cupo');
    expect(within(tabla).getByRole('row', { name: /Bruno D\./ }).textContent).toContain('Sin cuenta');
    await sinViolacionesAxe(container);
  });

  it('WEB_07_recargando_con_datos_previos_conserva_la_lista_sin_indicador_de_pagina', () => {
    montar({ estado: 'cargando', alumnos: [APROBADA], error: null });
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.queryByText('Cargando la lista de alumnos…')).toBeNull();
  });
});

describe('VistaLista · cuentas pendientes (ALU-03)', () => {
  it('ALU_03_cada_cuenta_pendiente_es_un_article_con_su_ficha_completa_y_edad', async () => {
    const { container } = montar(LISTO([PENDIENTE, APROBADA]));
    expect(screen.getByText('1 cuenta pendiente de aprobación')).toBeTruthy();
    const tarjeta = screen.getByRole('article', { name: 'Bruno Díaz' });
    expect(tarjeta.textContent).toContain('+598 99 123-456');
    expect(tarjeta.textContent).toContain('bruno@correo.test');
    expect(tarjeta.textContent).toContain('10 de mayo de 2000 (26 años)');
    expect(tarjeta.textContent).toContain('Te vi en Instagram');
    expect(screen.getAllByRole('article')).toHaveLength(1);
    await sinViolacionesAxe(container);
  });

  it('ALU_03_aprobar_sin_sugerencias_aprueba_sin_motivo_recarga_y_anuncia_el_resultado', async () => {
    const { acc, onRecargar } = montar(LISTO([PENDIENTE]));
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar cuenta de Bruno Díaz' }));
    await waitFor(() => expect(acc.aprobar).toHaveBeenCalledWith('p1', null));
    await waitFor(() => expect(onRecargar).toHaveBeenCalledOnce());
    const estado = await screen.findByRole('status');
    expect(estado.textContent).toContain('Aprobaste la cuenta de Bruno Díaz. Se le enviará un mail.');
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(estado.parentElement).toBe(document.activeElement));
  });

  it('ALU_03_mientras_aprueba_el_boton_dice_Aprobando_y_no_envia_dos_veces', async () => {
    const acc = acciones();
    let terminar: () => void = () => undefined;
    acc.aprobar.mockImplementationOnce(
      () =>
        new Promise((resolver) => {
          terminar = () => resolver({ ok: true, estado: 'aprobado', sugerencias: [] });
        }),
    );
    montar(LISTO([PENDIENTE]), acc);
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar cuenta de Bruno Díaz' }));
    const boton = await screen.findByRole('button', { name: 'Aprobar cuenta de Bruno Díaz' });
    expect(boton.textContent).toBe('Aprobando…');
    expect(boton.getAttribute('aria-busy')).toBe('true');
    expect((screen.getByRole('button', { name: 'Rechazar cuenta de Bruno Díaz' }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(boton);
    expect(acc.aprobar).toHaveBeenCalledOnce();
    terminar();
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Aprobaste'));
  });

  it('ALU_03_un_409_de_aprobar_se_muestra_con_el_mensaje_del_modulo_y_no_con_el_generico', async () => {
    const acc = acciones();
    acc.aprobar.mockResolvedValueOnce(fallo(CUENTA_NO_PENDIENTE, MENSAJES_LISTA[CUENTA_NO_PENDIENTE]));
    const { container, onRecargar } = montar(LISTO([PENDIENTE]), acc);
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar cuenta de Bruno Díaz' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain(MENSAJES_LISTA[CUENTA_NO_PENDIENTE]);
    expect(alerta.textContent).not.toContain(MENSAJE_GENERICO);
    expect(onRecargar).toHaveBeenCalledOnce();
    await sinViolacionesAxe(container);
  });

  it('ALU_03_una_cuenta_rechazada_se_puede_aprobar_desde_la_lista', async () => {
    const acc = acciones();
    const rechazada = alumno({ id: 'r1', estado: 'rechazado', nombre: 'Rita', motivo_estado: 'Sin cupo' });
    const { onRecargar } = montar(LISTO([rechazada]), acc);
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar cuenta de Rita' }));
    await waitFor(() => expect(acc.aprobar).toHaveBeenCalledWith('r1', null));
    await waitFor(() => expect(onRecargar).toHaveBeenCalledOnce());
  });

  it('ALU_03_si_aprobar_una_rechazada_falla_el_error_va_en_un_aviso_de_la_pagina', async () => {
    const acc = acciones();
    acc.aprobar.mockResolvedValueOnce(fallo('PROHIBIDO', 'No tenés permiso para hacer esto.'));
    montar(LISTO([alumno({ id: 'r1', estado: 'rechazado', nombre: 'Rita' })]), acc);
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar cuenta de Rita' }));
    expect((await screen.findByRole('alert')).textContent).toContain('No tenés permiso para hacer esto.');
  });
});

describe('VistaLista · rechazo con motivo (ALU-03, AVI-03)', () => {
  async function abrirRechazo(acc: AccionesSimuladas = acciones()) {
    const montado = montar(LISTO([PENDIENTE]), acc);
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar cuenta de Bruno Díaz' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Rechazar la cuenta de Bruno Díaz' });
    return { ...montado, dialogo };
  }

  it('ALU_03_el_dialogo_avisa_que_la_cuenta_va_a_ver_el_motivo_y_pasa_axe', async () => {
    const { dialogo } = await abrirRechazo();
    const campo = within(dialogo).getByLabelText('Motivo (opcional)');
    expect(campo.getAttribute('aria-required')).toBeNull();
    expect(dialogo.textContent).toContain('La persona va a ver este motivo en su ficha y en Mis clases, y le llega por mail.');
    expect(campo.getAttribute('aria-describedby')).toBeTruthy();
    expect(dialogo.contains(document.activeElement)).toBe(true);
    await sinViolacionesAxe(document.body);
  });

  it('ALU_03_rechazar_con_motivo_lo_envia_recorta_y_anuncia_que_se_envia_un_mail', async () => {
    const { acc, onRecargar } = await abrirRechazo();
    await userEvent.type(screen.getByLabelText('Motivo (opcional)'), '  No hay cupo este mes  ');
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar cuenta' }));
    await waitFor(() => expect(acc.rechazar).toHaveBeenCalledWith('p1', 'No hay cupo este mes'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onRecargar).toHaveBeenCalledOnce();
    expect((await screen.findByRole('status')).textContent).toContain(
      'Rechazaste la cuenta de Bruno Díaz. Se le enviará un mail.',
    );
  });

  it('ALU_03_rechazar_sin_motivo_manda_motivo_vacio_y_con_Enter_tambien_envia', async () => {
    const { acc } = await abrirRechazo();
    await userEvent.type(screen.getByLabelText('Motivo (opcional)'), '{Enter}');
    await waitFor(() => expect(acc.rechazar).toHaveBeenCalledWith('p1', ''));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('SEC_09_un_motivo_de_mas_de_500_caracteres_se_marca_en_el_campo_y_no_se_envia', async () => {
    const { acc, dialogo } = await abrirRechazo();
    fireEvent.change(within(dialogo).getByLabelText('Motivo (opcional)'), {
      target: { value: 'x'.repeat(LARGO_MAX_MOTIVO + 1) },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar cuenta' }));
    const campo = within(dialogo).getByLabelText('Motivo (opcional)');
    await waitFor(() => expect(campo.getAttribute('aria-invalid')).toBe('true'));
    expect(within(dialogo).getByRole('alert').textContent).toBe(MENSAJES_LISTA.motivoLargo);
    expect(acc.rechazar).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(campo);
    await sinViolacionesAxe(document.body);
  });

  it('ALU_03_un_error_del_servidor_se_ve_en_el_dialogo_con_el_mensaje_del_modulo_y_se_puede_reintentar', async () => {
    const acc = acciones();
    acc.rechazar.mockResolvedValueOnce(fallo(CUENTA_NO_PENDIENTE, MENSAJES_LISTA[CUENTA_NO_PENDIENTE]));
    const { dialogo } = await abrirRechazo(acc);
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar cuenta' }));
    await waitFor(() =>
      expect(within(dialogo).getByRole('alert').textContent).toBe(MENSAJES_LISTA[CUENTA_NO_PENDIENTE]),
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar cuenta' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(acc.rechazar).toHaveBeenCalledTimes(2);
  });

  it('ALU_03_Cancelar_cierra_sin_rechazar_y_Esc_tambien', async () => {
    const { acc } = await abrirRechazo();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(acc.rechazar).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar cuenta de Bruno Díaz' }));
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(acc.rechazar).not.toHaveBeenCalled();
  });
});

describe('VistaLista · sugerencia de unión (ALU-04, ALU-05, CA-04)', () => {
  const SUGERENCIA = { sin_cuenta_id: 's1', nombre: 'Bruno D.', telefono: '099123456' };

  async function aprobarConSugerencia(acc: AccionesSimuladas = acciones()) {
    acc.aprobar.mockResolvedValueOnce({ ok: true, estado: 'aprobado', sugerencias: [SUGERENCIA] });
    const montado = montar(LISTO([PENDIENTE, SIN_CUENTA]), acc);
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar cuenta de Bruno Díaz' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Posible alumno repetido' });
    return { ...montado, dialogo };
  }

  it('CA_04_al_aprobar_con_coincidencia_muestra_ambas_fichas_lado_a_lado_y_pasa_axe', async () => {
    const { dialogo } = await aprobarConSugerencia();
    const fichas = within(dialogo).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(fichas).toEqual(['Cuenta aprobada', 'Alumno sin cuenta']);
    expect(dialogo.textContent).toContain('Bruno Díaz');
    expect(dialogo.textContent).toContain('Bruno D.');
    expect(dialogo.textContent).toContain('No se une nada sin tu confirmación.');
    expect(within(dialogo).getByRole('button', { name: 'Unir cuentas: Bruno D.' })).toBeTruthy();
    expect(within(dialogo).getByRole('button', { name: 'No unir: Bruno D.' })).toBeTruthy();
    await sinViolacionesAxe(document.body);
  });

  it('ALU_05_confirmar_une_la_cuenta_con_el_alumno_sin_cuenta_recarga_y_cierra', async () => {
    const { acc, dialogo, onRecargar } = await aprobarConSugerencia();
    onRecargar.mockClear();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Unir cuentas: Bruno D.' }));
    await waitFor(() => expect(acc.unir).toHaveBeenCalledWith('p1', 's1'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onRecargar).toHaveBeenCalledOnce();
    expect(acc.descartar).not.toHaveBeenCalled();
    expect((await screen.findByRole('status')).textContent).toContain('Uniste a Bruno D. con la cuenta de Bruno Díaz.');
  });

  it('ALU_04_No_unir_descarta_la_sugerencia_sin_unir_nada_y_cierra', async () => {
    const { acc, dialogo } = await aprobarConSugerencia();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'No unir: Bruno D.' }));
    await waitFor(() => expect(acc.descartar).toHaveBeenCalledWith('p1', 's1'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(acc.unir).not.toHaveBeenCalled();
  });

  it('ALU_04_Decidir_despues_cierra_sin_unir_ni_descartar', async () => {
    const { acc, dialogo } = await aprobarConSugerencia();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Decidir después' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(acc.unir).not.toHaveBeenCalled();
    expect(acc.descartar).not.toHaveBeenCalled();
  });

  it('ALU_05_un_409_de_unir_se_muestra_en_el_dialogo_con_el_mensaje_del_modulo', async () => {
    const acc = acciones();
    acc.unir.mockResolvedValueOnce(fallo(UNION_NO_VALIDA, MENSAJES_LISTA[UNION_NO_VALIDA]));
    const { dialogo, onRecargar } = await aprobarConSugerencia(acc);
    onRecargar.mockClear();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Unir cuentas: Bruno D.' }));
    await waitFor(() => expect(within(dialogo).getByRole('alert').textContent).toBe(MENSAJES_LISTA[UNION_NO_VALIDA]));
    expect(within(dialogo).getByRole('alert').textContent).not.toContain(MENSAJE_GENERICO);
    expect(onRecargar).toHaveBeenCalledOnce();
    await sinViolacionesAxe(document.body);
  });

  it('ALU_04_con_varios_candidatos_cada_uno_tiene_sus_botones_y_descartar_uno_deja_al_otro', async () => {
    const acc = acciones();
    const otra = alumno({ id: 's2', estado: 'sin_cuenta', nombre: 'Bruno Dí', con_usuario: false, mail: null });
    acc.aprobar.mockResolvedValueOnce({
      ok: true,
      estado: 'aprobado',
      sugerencias: [SUGERENCIA, { sin_cuenta_id: 's2', nombre: 'Bruno Dí', telefono: '099123456' }],
    });
    montar(LISTO([PENDIENTE, SIN_CUENTA, otra]), acc);
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar cuenta de Bruno Díaz' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Posible alumno repetido' });
    expect(dialogo.textContent).toContain('Hay 2 alumnos sin cuenta con el mismo teléfono que Bruno Díaz.');
    expect(within(dialogo).getAllByRole('button', { name: /^Unir cuentas: / })).toHaveLength(2);
    await userEvent.click(within(dialogo).getByRole('button', { name: 'No unir: Bruno D.' }));
    await waitFor(() => expect(acc.descartar).toHaveBeenCalledWith('p1', 's1'));
    await waitFor(() => expect(within(dialogo).queryByRole('button', { name: 'No unir: Bruno D.' })).toBeNull());
    expect(within(dialogo).getByRole('button', { name: 'Unir cuentas: Bruno Dí' })).toBeTruthy();
  });

  it('ALU_04_Revisar_union_sin_coincidencias_avisa_y_con_coincidencias_abre_el_dialogo', async () => {
    const acc = acciones();
    montar(LISTO([APROBADA, SIN_CUENTA]), acc);
    await userEvent.click(screen.getByRole('button', { name: 'Revisar unión de Ana Pérez' }));
    await waitFor(() => expect(acc.sugerencias).toHaveBeenCalledWith('a1'));
    expect((await screen.findByRole('status')).textContent).toContain(
      'No hay alumnos sin cuenta con el mismo teléfono que Ana Pérez.',
    );
    acc.sugerencias.mockResolvedValueOnce({ ok: true, sugerencias: [SUGERENCIA] });
    await userEvent.click(screen.getByRole('button', { name: 'Revisar unión de Ana Pérez' }));
    await screen.findByRole('dialog', { name: 'Posible alumno repetido' });
  });

  it('ALU_04_Revisar_union_no_aparece_en_alumnos_sin_cuenta_ni_en_cuentas_que_no_ingresaron', () => {
    montar(LISTO([SIN_CUENTA, alumno({ id: 'a2', nombre: 'Carla', con_usuario: false })]));
    expect(screen.queryByRole('button', { name: /Revisar unión/ })).toBeNull();
  });
});

describe('VistaLista · alta y edición (ALU-07, ALU-08, ALU-09, CA-06)', () => {
  async function abrirAlta(acc: AccionesSimuladas = acciones()) {
    const montado = montar(LISTO([APROBADA]), acc);
    await userEvent.click(screen.getByRole('button', { name: 'Agregar alumno' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Agregar alumno' });
    return { ...montado, dialogo };
  }

  async function completar(dialogo: HTMLElement, mail: string) {
    await userEvent.type(within(dialogo).getByLabelText(/^Nombre y apellido/), '  Carla Gómez ');
    await userEvent.type(within(dialogo).getByLabelText(/^Teléfono o WhatsApp/), '099 765 432');
    fireEvent.change(within(dialogo).getByLabelText(/^Fecha de nacimiento/), { target: { value: '1995-07-20' } });
    if (mail !== '') await userEvent.type(within(dialogo).getByLabelText(/^Mail/), mail);
  }

  it('ALU_08_sin_mail_el_formulario_avisa_que_no_podra_ingresar_ni_recibira_mails_y_pasa_axe', async () => {
    const { dialogo } = await abrirAlta();
    expect(within(dialogo).getByRole('status').textContent).toContain('No podrá ingresar ni recibirá mails.');
    expect(within(dialogo).getByLabelText(/^Mail/).getAttribute('type')).toBe('email');
    expect(within(dialogo).getByLabelText(/^Fecha de nacimiento/).getAttribute('max')).toBe(HOY);
    await sinViolacionesAxe(document.body);
  });

  it('ALU_07_con_mail_el_aviso_cambia_y_el_alta_envia_los_datos_sin_espacios_y_confirma', async () => {
    const { acc, dialogo, onRecargar } = await abrirAlta();
    await completar(dialogo, 'carla@correo.test');
    expect(within(dialogo).getByRole('status').textContent).toContain('Se crea una cuenta aprobada');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Agregar alumno' }));
    await waitFor(() => expect(acc.alta).toHaveBeenCalledOnce());
    expect(acc.alta.mock.calls[0]?.[0]).toEqual({
      nombre: 'Carla Gómez',
      telefono: '099 765 432',
      fecha_nacimiento: '1995-07-20',
      mail: 'carla@correo.test',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onRecargar).toHaveBeenCalledOnce();
    expect((await screen.findByRole('status')).textContent).toContain('Agregaste a Carla Gómez: cuenta aprobada.');
  });

  it('ALU_08_el_alta_sin_mail_queda_sin_cuenta_y_el_aviso_de_exito_lo_dice', async () => {
    const acc = acciones();
    acc.alta.mockResolvedValueOnce({ ok: true, alumnoId: 'n2', estado: 'sin_cuenta' });
    const { dialogo } = await abrirAlta(acc);
    await completar(dialogo, '');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Agregar alumno' }));
    await waitFor(() => expect(acc.alta.mock.calls[0]?.[0].mail).toBe(''));
    expect((await screen.findByRole('status')).textContent).toContain(
      'Agregaste a Carla Gómez como alumno sin cuenta: no podrá ingresar ni recibirá mails.',
    );
  });

  it('SEC_09_con_datos_invalidos_marca_cada_campo_lleva_el_foco_al_primero_y_no_envia', async () => {
    const { acc, dialogo } = await abrirAlta();
    await userEvent.type(within(dialogo).getByLabelText(/^Mail/), 'ana@@correo');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Agregar alumno' }));
    const nombre = within(dialogo).getByLabelText(/^Nombre y apellido/);
    await waitFor(() => expect(nombre.getAttribute('aria-invalid')).toBe('true'));
    expect(within(dialogo).getByLabelText(/^Mail/).getAttribute('aria-invalid')).toBe('true');
    expect(within(dialogo).getAllByRole('alert').map((a) => a.textContent)).toContain(MENSAJES_LISTA.mailInvalido);
    await waitFor(() => expect(document.activeElement).toBe(nombre));
    expect(acc.alta).not.toHaveBeenCalled();
    await sinViolacionesAxe(document.body);
  });

  it('ALU_07_un_mail_ya_registrado_se_asocia_al_campo_mail_con_el_mensaje_del_catalogo', async () => {
    const acc = acciones();
    acc.alta.mockResolvedValueOnce(fallo('MAIL_YA_REGISTRADO', 'Ese mail ya está registrado.'));
    const { dialogo } = await abrirAlta(acc);
    await completar(dialogo, 'ana@correo.test');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Agregar alumno' }));
    const mail = within(dialogo).getByLabelText(/^Mail/);
    await waitFor(() => expect(mail.getAttribute('aria-invalid')).toBe('true'));
    expect(within(dialogo).getByRole('alert').textContent).toBe('Ese mail ya está registrado.');
    await waitFor(() => expect(document.activeElement).toBe(mail));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('ALU_07_un_error_sin_campo_se_muestra_arriba_del_formulario_con_su_mensaje', async () => {
    const acc = acciones();
    acc.alta.mockResolvedValueOnce(fallo('SIN_CONEXION', 'No hay conexión con el servidor. Revisá tu conexión y probá de nuevo.'));
    const { dialogo } = await abrirAlta(acc);
    await completar(dialogo, '');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Agregar alumno' }));
    await waitFor(() => expect(within(dialogo).getByRole('alert').textContent).toContain('No hay conexión'));
    expect((within(dialogo).getByLabelText(/^Nombre y apellido/) as HTMLInputElement).value).toContain('Carla Gómez');
  });

  it('ALU_09_editar_carga_la_ficha_y_guarda_los_cambios_del_alumno', async () => {
    const acc = acciones();
    montar(LISTO([APROBADA]), acc);
    await userEvent.click(screen.getByRole('button', { name: 'Editar a Ana Pérez' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Editar alumno' });
    expect((within(dialogo).getByLabelText(/^Nombre y apellido/) as HTMLInputElement).value).toBe('Ana Pérez');
    expect((within(dialogo).getByLabelText(/^Fecha de nacimiento/) as HTMLInputElement).value).toBe('1990-02-03');
    const mail = within(dialogo).getByLabelText(/^Mail/) as HTMLInputElement;
    expect(mail.disabled).toBe(true);
    expect(dialogo.textContent).toContain('Es el mail con el que ingresa; no se puede cambiar.');
    await sinViolacionesAxe(document.body);
    const telefono = within(dialogo).getByLabelText(/^Teléfono o WhatsApp/);
    await userEvent.clear(telefono);
    await userEvent.type(telefono, '098 000 111');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(acc.editar).toHaveBeenCalledOnce());
    expect(acc.editar.mock.calls[0]).toEqual([
      'a1',
      { nombre: 'Ana Pérez', telefono: '098 000 111', fecha_nacimiento: '1990-02-03', mail: 'ana@correo.test' },
    ]);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await screen.findByRole('status')).textContent).toContain('Guardaste los cambios de Ana Pérez.');
  });

  it('ALU_09_en_un_alumno_sin_cuenta_el_mail_se_puede_agregar', async () => {
    montar(LISTO([SIN_CUENTA]));
    await userEvent.click(screen.getByRole('button', { name: 'Editar a Bruno D.' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Editar alumno' });
    expect((within(dialogo).getByLabelText(/^Mail/) as HTMLInputElement).disabled).toBe(false);
    expect(within(dialogo).getByRole('status').textContent).toContain('No podrá ingresar ni recibirá mails.');
  });

  it('ALU_09_Cancelar_cierra_el_formulario_sin_guardar', async () => {
    const { acc } = await abrirAlta();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(acc.alta).not.toHaveBeenCalled();
  });
});

describe('VistaLista · texto plano (SEC-16)', () => {
  const HTML_NOMBRE = '<img src=x onerror="window.__xss=1"> Mala';
  const HTML_MOTIVO = '<script>window.__xss=1</script><b>no</b>';

  it('SEC_16_un_nombre_con_HTML_en_la_tarjeta_la_lista_y_los_botones_se_ve_como_texto', async () => {
    const maliciosa = alumno({ id: 'p9', estado: 'pendiente', nombre: HTML_NOMBRE, como_llego: HTML_MOTIVO });
    const { container } = montar(LISTO([maliciosa]));
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByRole('article', { name: HTML_NOMBRE })).toBeTruthy();
    expect(screen.getAllByText(HTML_NOMBRE).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(HTML_MOTIVO).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: `Aprobar cuenta de ${HTML_NOMBRE}` })).toBeTruthy();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
    await sinViolacionesAxe(container);
  });

  it('SEC_16_el_motivo_de_un_rechazo_con_HTML_se_ve_como_texto_en_la_lista', async () => {
    const rechazada = alumno({ id: 'r9', estado: 'rechazado', nombre: 'Rita', motivo_estado: HTML_MOTIVO });
    const { container } = montar(LISTO([rechazada]));
    expect(screen.getByText(`Motivo del rechazo: ${HTML_MOTIVO}`)).toBeTruthy();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });

  it('SEC_16_un_nombre_con_HTML_en_la_sugerencia_de_union_y_en_el_dialogo_de_rechazo_es_texto', async () => {
    const acc = acciones();
    const cuenta = alumno({ id: 'p9', estado: 'pendiente', nombre: HTML_NOMBRE });
    const sin = alumno({ id: 's9', estado: 'sin_cuenta', nombre: HTML_MOTIVO, con_usuario: false });
    acc.aprobar.mockResolvedValueOnce({
      ok: true,
      estado: 'aprobado',
      sugerencias: [{ sin_cuenta_id: 's9', nombre: HTML_MOTIVO, telefono: null }],
    });
    montar(LISTO([cuenta, sin]), acc);
    await userEvent.click(screen.getByRole('button', { name: `Rechazar cuenta de ${HTML_NOMBRE}` }));
    const rechazo = await screen.findByRole('dialog', { name: `Rechazar la cuenta de ${HTML_NOMBRE}` });
    expect(rechazo.querySelector('img')).toBeNull();
    await userEvent.click(within(rechazo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: `Aprobar cuenta de ${HTML_NOMBRE}` }));
    const union = await screen.findByRole('dialog', { name: 'Posible alumno repetido' });
    expect(union.querySelector('img')).toBeNull();
    expect(union.querySelector('script')).toBeNull();
    expect(within(union).getAllByText(HTML_MOTIVO).length).toBeGreaterThanOrEqual(1);
  });
});
