// @vitest-environment jsdom
// Vista de Mis clases (T07.2): WEB-05, RES-06, ALU-03, SEC-16; CA-20, CA-25, CA-45, CA-53, CA-63.
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EstadoMisClases } from '../../../../src/modulos/mis-clases/logica';
import { VistaMisClases, MENSAJES_VISTA } from '../../../../src/modulos/mis-clases/vistas/VistaMisClases';
import { insigniaDeClase } from '../../../../src/modulos/mis-clases/vistas/TarjetaClase';
import { sinViolacionesAxe } from '../../ui/soporte';
import { clase, conSesion, inscripcion, LISTO, sesion } from './soporte';

afterEach(cleanup);

function montar(datos: EstadoMisClases, estado = conSesion()) {
  const onRecargar = vi.fn();
  const onReintentarSesion = vi.fn();
  const r = render(
    <VistaMisClases estado={estado} datos={datos} onRecargar={onRecargar} onReintentarSesion={onReintentarSesion} />,
  );
  return { ...r, onRecargar, onReintentarSesion };
}

const tarjeta = (nombre: RegExp | string) => screen.getByRole('article', { name: nombre });

describe('estados de la vista (WEB-05, flujos.md F-06)', () => {
  it('WEB_05_mientras_carga_muestra_el_indicador_y_no_las_pestanas', () => {
    montar({ estado: 'cargando', clases: [], error: null });
    expect(screen.getByRole('heading', { level: 1, name: 'Mis clases' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Cargando tus clases…');
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('WEB_05_con_la_sesion_cargando_muestra_el_indicador', () => {
    montar(LISTO([]), { tipo: 'cargando' });
    expect(screen.getByRole('status').textContent).toContain('Cargando tus clases…');
  });

  it('WEB_05_el_error_de_carga_ofrece_reintentar_y_vuelve_a_leer', async () => {
    const { onRecargar } = montar({ estado: 'error', clases: [], error: 'No hay conexión.' });
    expect(screen.getByRole('alert').textContent).toContain('No se pudieron cargar tus clases. No hay conexión.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRecargar).toHaveBeenCalledOnce();
  });

  it('WEB_05_el_error_de_la_sesion_ofrece_reintentar_la_sesion', async () => {
    const { onReintentarSesion } = montar(LISTO([]), { tipo: 'error', mensaje: 'No pudimos leer tu sesión.' });
    expect(screen.getByRole('alert').textContent).toContain('No pudimos leer tu sesión.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onReintentarSesion).toHaveBeenCalledOnce();
  });

  it('WEB_05_sin_permisos_para_el_visitante_el_profesor_y_la_ficha_incompleta', () => {
    const { unmount } = montar(LISTO([]), { tipo: 'visitante' });
    expect(screen.getByRole('heading', { level: 1, name: 'Sin permisos' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ingresar' }).getAttribute('href')).toBe('#/ingreso');
    unmount();

    const profesor = montar(LISTO([]), conSesion(sesion({ rol: 'profesor', alumno_id: null })));
    expect(screen.getByRole('link', { name: 'Ir al panel' }).getAttribute('href')).toBe('#/panel');
    profesor.unmount();

    montar(LISTO([]), conSesion(sesion({ estado: 'ficha_incompleta' })));
    expect(screen.getByRole('link', { name: 'Ir a la ficha' }).getAttribute('href')).toBe('#/ficha');
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('RES_06_sin_clases_proximas_dice_que_todavia_no_hay_y_enlaza_a_la_agenda_del_profesor', () => {
    montar(LISTO([]));
    expect(screen.getByRole('heading', { level: 3, name: MENSAJES_VISTA.sinProximas })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ver la agenda' }).getAttribute('href')).toBe('#/p/ana');
  });

  it('RES_06_con_varios_profesores_el_enlace_vacio_va_al_inicio_que_los_lista', () => {
    montar(
      LISTO([]),
      conSesion(sesion({ inscripciones: [inscripcion(), inscripcion({ profesor_id: 'pb', slug: 'beto', profesor_nombre: 'Profe Beto' })] })),
    );
    expect(screen.getByRole('link', { name: 'Ver la agenda' }).getAttribute('href')).toBe('#/');
  });

  it('RES_06_sin_clases_pasadas_la_pestana_Pasadas_dice_que_todavia_no_hay', async () => {
    montar(LISTO([]));
    await userEvent.click(screen.getByRole('tab', { name: 'Pasadas' }));
    expect(screen.getByRole('heading', { level: 3, name: MENSAJES_VISTA.sinPasadas })).toBeTruthy();
  });
});

describe('Próximas y Pasadas (WEB-05, RES-06, CA-20, CA-25)', () => {
  const pendiente = clase({
    id: 'p1',
    estado: 'pendiente',
    inicio: '2026-11-09T13:00:00Z',
    fin: '2026-11-09T14:00:00Z',
    solicitud_pendiente: { id: 's1', tipo: 'reserva', alcance: null, vencida: false },
  });
  const confirmada = clase({ id: 'c1' });
  const rechazadaFutura = clase({ id: 'r1', estado: 'rechazada', inicio: '2026-11-16T13:00:00Z', fin: '2026-11-16T14:00:00Z' });
  const pasadaConfirmada = clase({ id: 'x1', pasada: true, inicio: '2026-10-05T13:00:00Z', fin: '2026-10-05T14:00:00Z' });
  const sinRespuesta = clase({
    id: 'x2',
    estado: 'pendiente',
    pasada: true,
    inicio: '2026-10-12T13:00:00Z',
    fin: '2026-10-12T14:00:00Z',
    solicitud_pendiente: { id: 's2', tipo: 'reserva', alcance: null, vencida: true },
  });

  it('WEB_05_las_pendientes_se_destacan_arriba_de_las_proximas_y_cada_clase_dice_su_estado', () => {
    montar(LISTO([confirmada, rechazadaFutura, pendiente, pasadaConfirmada]));
    const titulos = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titulos.indexOf('Solicitudes pendientes')).toBeLessThan(titulos.indexOf('Próximas clases'));

    const tarjetaPendiente = tarjeta('lunes, 9 de noviembre, 10:00 a 11:00');
    expect(within(tarjetaPendiente).getByText('Pendiente de confirmación')).toBeTruthy();
    expect(within(tarjetaPendiente).getByText('Esperando que el profesor confirme')).toBeTruthy();
    expect(within(tarjeta('lunes, 2 de noviembre, 10:00 a 11:00')).getByText('Confirmada')).toBeTruthy();
    expect(within(tarjeta('lunes, 16 de noviembre, 10:00 a 11:00')).getByText('Rechazada')).toBeTruthy();
    // La clase pasada no aparece en Próximas.
    expect(screen.queryByRole('article', { name: /5 de octubre/ })).toBeNull();
  });

  it('RES_06_cada_clase_muestra_su_profesor_quien_la_toma_la_serie_y_la_observacion', () => {
    montar(
      LISTO([
        clase({ reserva_tipo: 'serie', frecuencia: 2, observacion: 'Primera vez, llevo mi raqueta', quien_toma: 'Lucía (hija)' }),
      ]),
    );
    const t = tarjeta(/2 de noviembre/);
    expect(within(t).getByText('Profe Ana')).toBeTruthy();
    expect(within(t).getByText('Lucía (hija)')).toBeTruthy();
    expect(within(t).getByText('Serie quincenal')).toBeTruthy();
    expect(within(t).getByText('Primera vez, llevo mi raqueta')).toBeTruthy();
  });

  it('CA_25_la_pestana_Pasadas_trae_el_historial_con_pendiente_sin_respuesta_y_sin_acciones', async () => {
    const { container } = montar(LISTO([pasadaConfirmada, sinRespuesta, confirmada]));
    await userEvent.click(screen.getByRole('tab', { name: 'Pasadas' }));
    const titulos = screen
      .getAllByRole('article')
      .map((a) => a.getAttribute('aria-labelledby') ?? '')
      .filter((id) => id.startsWith('clase-'));
    // Las más recientes primero: la del 12 antes que la del 5.
    expect(titulos).toEqual([expect.stringContaining('x2'), expect.stringContaining('x1')]);
    const t = tarjeta(/12 de octubre/);
    expect(within(t).getByText('Pendiente sin respuesta')).toBeTruthy();
    expect(within(t).queryByText('Esperando que el profesor confirme')).toBeNull();
    // Mover y Avisar que no voy son de B08: ninguna tarjeta ofrece botones.
    expect(within(container).queryAllByRole('button')).toHaveLength(0);
  });

  it('CA_20_el_estado_de_cada_clase_tiene_su_insignia_y_la_cambiada_de_horario_se_ve_cancelada', () => {
    expect(insigniaDeClase(clase({ estado: 'movida' }))).toBe('cancelada');
    expect(insigniaDeClase(clase({ estado: 'cancelada' }))).toBe('cancelada');
    expect(insigniaDeClase(sinRespuesta)).toBe('pendienteSinRespuesta');
    expect(insigniaDeClase(pendiente)).toBe('pendiente');
    expect(insigniaDeClase(confirmada)).toBe('confirmada');
    expect(insigniaDeClase(rechazadaFutura)).toBe('rechazada');
  });

  it('WEB_05_las_pestanas_se_cambian_con_las_flechas_del_teclado', async () => {
    montar(LISTO([confirmada, pasadaConfirmada]));
    const proximas = screen.getByRole('tab', { name: 'Próximas' });
    expect(proximas.getAttribute('aria-selected')).toBe('true');
    proximas.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Pasadas' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('heading', { level: 3, name: 'Clases pasadas' })).toBeTruthy();
  });
});

describe('profesores y husos (CA-53, ALU-03, CA-45, CA-63)', () => {
  const deAna = clase({ id: 'ca', profesor_id: 'pa', profesor_nombre: 'Profe Ana', zona_horaria: 'America/Montevideo' });
  const deBeto = clase({
    id: 'cb',
    profesor_id: 'pb',
    profesor_nombre: 'Profe Beto',
    profesor_slug: 'beto',
    zona_horaria: 'Europe/Madrid',
    inicio: '2026-11-03T13:00:00Z',
    fin: '2026-11-03T14:00:00Z',
  });
  const dos = sesion({
    inscripciones: [inscripcion(), inscripcion({ profesor_id: 'pb', slug: 'beto', profesor_nombre: 'Profe Beto' })],
  });

  it('CA_53_muestra_las_clases_de_A_y_de_B_cada_una_con_su_profesor_y_en_el_huso_de_su_profesor', () => {
    montar(LISTO([deAna, deBeto]), conSesion(dos));
    // 13:00 UTC: 10:00 en Montevideo y 14:00 en Madrid; con husos distintos se muestra el huso.
    const a = tarjeta('lunes, 2 de noviembre, 10:00 a 11:00 (America/Montevideo)');
    expect(within(a).getByText('Profe Ana')).toBeTruthy();
    const b = tarjeta('martes, 3 de noviembre, 14:00 a 15:00 (Europe/Madrid)');
    expect(within(b).getByText('Profe Beto')).toBeTruthy();
  });

  it('CA_53_con_un_solo_huso_no_repite_el_huso_en_cada_clase', () => {
    montar(LISTO([deAna]));
    expect(tarjeta('lunes, 2 de noviembre, 10:00 a 11:00')).toBeTruthy();
  });

  it('ALU_03_muestra_el_estado_del_vinculo_con_cada_profesor_por_separado', () => {
    const s = sesion({
      inscripciones: [
        inscripcion({ estado: 'aprobado' }),
        inscripcion({ profesor_id: 'pb', slug: 'beto', profesor_nombre: 'Profe Beto', estado: 'pendiente' }),
      ],
    });
    montar(LISTO([]), conSesion(s));
    const seccion = screen.getByRole('region', { name: 'Tus profesores' });
    const ana = within(seccion).getByRole('article', { name: 'Profe Ana' });
    expect(within(ana).getByText('Aprobado')).toBeTruthy();
    const beto = within(seccion).getByRole('article', { name: 'Profe Beto' });
    expect(within(beto).getByText('Pendiente de aprobación')).toBeTruthy();
    expect(within(beto).queryByText(/Motivo/)).toBeNull();
  });

  it('CA_45_el_motivo_del_profesor_que_rechazo_aparece_junto_a_ese_profesor_como_texto', () => {
    const s = sesion({
      inscripciones: [
        inscripcion({ estado: 'aprobado' }),
        inscripcion({
          profesor_id: 'pb',
          slug: 'beto',
          profesor_nombre: 'Profe Beto',
          estado: 'rechazado',
          motivo_rechazo: 'No tengo lugar <b>este mes</b>',
        }),
      ],
    });
    const { container } = montar(LISTO([]), conSesion(s));
    const beto = screen.getByRole('article', { name: 'Profe Beto' });
    expect(within(beto).getByText('Rechazado')).toBeTruthy();
    expect(within(beto).getByText(/Motivo:/)).toBeTruthy();
    // SEC-16: el motivo es texto, nunca HTML.
    expect(within(beto).getByText('No tengo lugar <b>este mes</b>')).toBeTruthy();
    expect(container.querySelector('b')).toBeNull();
    // El otro profesor no hereda ni el estado ni el motivo.
    expect(within(screen.getByRole('article', { name: 'Profe Ana' })).queryByText(/Motivo/)).toBeNull();
  });

  it('CA_45_sin_motivo_el_rechazo_muestra_solo_el_estado', () => {
    montar(LISTO([]), conSesion(sesion({ inscripciones: [inscripcion({ estado: 'rechazado', motivo_rechazo: '  ' })] })));
    const ana = screen.getByRole('article', { name: 'Profe Ana' });
    expect(within(ana).getByText('Rechazado')).toBeTruthy();
    expect(within(ana).queryByText(/Motivo/)).toBeNull();
  });

  it('CA_63_con_el_profesor_inactivo_sus_clases_confirmadas_siguen_y_el_vinculo_dice_que_no_toma_reservas', () => {
    const s = sesion({ inscripciones: [inscripcion({ profesor_activo: false })] });
    montar(LISTO([deAna]), conSesion(s));
    expect(within(screen.getByRole('article', { name: 'Profe Ana' })).getByText('No toma reservas por ahora.')).toBeTruthy();
    expect(within(tarjeta(/2 de noviembre/)).getByText('Confirmada')).toBeTruthy();
  });

  it('SEC_16_el_profesor_la_observacion_y_quien_toma_se_muestran_como_texto', () => {
    const { container } = montar(
      LISTO([
        clase({
          profesor_nombre: 'Profe <i>X</i>',
          observacion: '<script>alert(1)</script>',
          quien_toma: '<img src=x onerror=alert(1)>',
        }),
      ]),
    );
    expect(container.querySelector('script, img, i')).toBeNull();
    expect(screen.getByText('<script>alert(1)</script>')).toBeTruthy();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
  });

  it('ALU_03_un_profesor_que_ya_no_tiene_vinculo_muestra_sus_clases_y_lo_dice', () => {
    montar(LISTO([deBeto]), conSesion(sesion()));
    const beto = screen.getByRole('article', { name: 'Profe Beto' });
    expect(within(beto).getByText('Ya no figurás en su lista')).toBeTruthy();
    expect(within(beto).queryByRole('link')).toBeNull();
  });
});

describe('accesibilidad (A11Y, WEB-05)', () => {
  it('no_tiene_violaciones_de_axe_con_clases_pendientes_pasadas_y_vinculos', async () => {
    const s = sesion({
      inscripciones: [
        inscripcion(),
        inscripcion({ profesor_id: 'pb', slug: 'beto', profesor_nombre: 'Profe Beto', estado: 'rechazado', motivo_rechazo: 'Sin lugar' }),
      ],
    });
    const datos = LISTO([
      clase(),
      clase({ id: 'p1', estado: 'pendiente', inicio: '2026-11-09T13:00:00Z', fin: '2026-11-09T14:00:00Z' }),
      clase({ id: 'x1', pasada: true, inicio: '2026-10-05T13:00:00Z', fin: '2026-10-05T14:00:00Z' }),
    ]);
    const { container } = montar(datos, conSesion(s));
    await sinViolacionesAxe(container);
    await userEvent.click(screen.getByRole('tab', { name: 'Pasadas' }));
    await sinViolacionesAxe(container);
  });

  it('no_tiene_violaciones_de_axe_en_los_estados_vacio_error_y_sin_permisos', async () => {
    const vacio = montar(LISTO([]));
    await sinViolacionesAxe(vacio.container);
    vacio.unmount();
    const error = montar({ estado: 'error', clases: [], error: 'Falló.' });
    await sinViolacionesAxe(error.container);
    error.unmount();
    const sin = montar(LISTO([]), { tipo: 'visitante' });
    await sinViolacionesAxe(sin.container);
  });
});
