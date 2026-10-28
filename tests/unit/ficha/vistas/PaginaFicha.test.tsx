// @vitest-environment jsdom
// Página `#/ficha` por estado de sesión (WEB-03, ALU-02, ALU-03, ALU-06, ALU-13, ALU-14, SEC-16, CA-02, CA-43,
// CA-45): cargando, error, sin permisos, ficha incompleta con y sin profesor de origen, y ficha completa con el
// estado de cada profesor (pendiente, aprobada, rechazada con y sin motivo, inactivo).
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoSesion, SesionActual } from '../../../../src/estado';
import { ADMINISTRADOR, enSesion, inscripcion, persona, profesor } from '../../estado/soporte';
import { MENSAJE_FICHAS_ALU13 } from '../../../../src/lib/errores';
import { sinViolacionesAxe } from '../../ui/soporte';

const logica = vi.hoisted(() => ({
  completarFicha: vi.fn(),
  guardarPersonaACargo: vi.fn(),
  leerMiFicha: vi.fn(),
  useProfesorDeOrigen: vi.fn(),
  usePersonasACargo: vi.fn(),
}));

vi.mock('../../../../src/modulos/ficha/logica', async (importarOriginal) => ({
  ...(await importarOriginal<object>()),
  ...logica,
}));

import { VistaFicha } from '../../../../src/modulos/ficha/vistas/PaginaFicha';
import Pagina from '../../../../src/modulos/ficha/vistas/Pagina';

const recargar = vi.fn();

/** Persona con la ficha en `estado` y sus vínculos (una sesión de B14: el estado de aprobación es por profesor). */
function alumno(estado: NonNullable<SesionActual['estado']>, ...vinculos: ReturnType<typeof inscripcion>[]): EstadoSesion {
  return enSesion(persona(vinculos, estado));
}

const FICHA = {
  nombre: 'Ana Pérez',
  mail: 'ana@correo.test',
  telefono: '+598 99 123-456',
  fecha_nacimiento: '1990-02-03',
};

const BETO = inscripcion('beto-gomez', 'aprobado', { profesor_nombre: 'Beto Gómez' });
const CARLA = inscripcion('carla-diaz', 'pendiente', { profesor_nombre: 'Carla Díaz' });
const recargarOrigen = vi.fn();

function montar(estado: EstadoSesion, onReintentarSesion = vi.fn()) {
  const resultado = render(<VistaFicha estado={estado} onReintentarSesion={onReintentarSesion} />);
  return { ...resultado, onReintentarSesion };
}

beforeEach(() => {
  logica.leerMiFicha.mockResolvedValue(FICHA);
  logica.useProfesorDeOrigen.mockReturnValue({ estado: 'sin_origen' });
  logica.usePersonasACargo.mockReturnValue({ estado: { tipo: 'ok', personas: [] }, recargar });
  logica.completarFicha.mockResolvedValue({ ok: true });
  logica.guardarPersonaACargo.mockResolvedValue({ ok: true, id: 'p1' });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Ficha · sesión sin ficha para mostrar (WEB-03)', () => {
  it('WEB_03_cargando_la_sesion_muestra_el_titulo_y_un_indicador', async () => {
    const { container } = montar({ tipo: 'cargando' });
    expect(screen.getByRole('heading', { level: 1, name: 'Ficha' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Cargando tu ficha…');
    await sinViolacionesAxe(container);
  });

  it('WEB_03_con_error_de_sesion_ofrece_reintentar', async () => {
    const { container, onReintentarSesion } = montar({ tipo: 'error', mensaje: 'No hay conexión con el servidor.' });
    expect(screen.getByRole('alert').textContent).toContain('No hay conexión con el servidor.');
    await sinViolacionesAxe(container);
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onReintentarSesion).toHaveBeenCalledOnce();
  });

  it('WEB_03_un_visitante_ve_Sin_permisos_con_el_acceso_al_ingreso', async () => {
    const { container } = montar({ tipo: 'visitante' });
    expect(screen.getByRole('heading', { level: 1, name: 'Sin permisos' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ingresar' }).getAttribute('href')).toBe('#/ingreso');
    await sinViolacionesAxe(container);
  });

  it.each([
    ['profesor', enSesion(profesor())],
    ['Administrador', enSesion(ADMINISTRADOR)],
  ])('WEB_03_el_%s_ve_Sin_permisos_con_el_acceso_al_panel', (_rol, estado) => {
    montar(estado);
    expect(screen.getByRole('heading', { level: 1, name: 'Sin permisos' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir al panel' }).getAttribute('href')).toBe('#/panel');
  });

  it('WEB_03_un_alumno_borrado_ve_Sin_permisos', () => {
    montar(alumno('borrado'));
    expect(screen.getByRole('heading', { level: 1, name: 'Sin permisos' })).toBeTruthy();
    expect(logica.leerMiFicha).not.toHaveBeenCalled();
  });
});

describe('Ficha · primer ingreso sin enlace de profesor (ALU-02, ALU-14, CA-02, CA-43)', () => {
  it('CA_02_muestra_solo_el_formulario_con_nombre_y_mail_cargados_sin_como_llegaste_ni_personas_a_cargo', async () => {
    const { container } = montar(alumno('ficha_incompleta'));
    expect(screen.getByRole('heading', { level: 1, name: 'Ficha' })).toBeTruthy();
    expect((screen.getByLabelText(/^Nombre y apellido/) as HTMLInputElement).value).toBe('Ana');
    expect((screen.getByLabelText(/^Mail/) as HTMLInputElement).value).toBe('ana@example.com');
    // ALU-14: sin enlace de un profesor la ficha no pregunta «cómo llegaste».
    expect(screen.queryByLabelText(/^Cómo llegaste/)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Personas a cargo' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Tus profesores' })).toBeNull();
    // Sin texto de privacidad ni consentimiento (DEC-16 B).
    expect(screen.queryByText(/privacidad|consentimiento/i)).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    await sinViolacionesAxe(container);
  });

  it('ALU_14_al_guardar_sin_origen_se_completa_sin_profesor_y_se_avisa_como_pedir_acceso', async () => {
    const { rerender, onReintentarSesion } = montar(alumno('ficha_incompleta'));
    await userEvent.type(screen.getByLabelText(/^Teléfono o WhatsApp/), '099123456');
    fireEvent.change(screen.getByLabelText(/^Fecha de nacimiento/), { target: { value: '1990-02-03' } });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar ficha' }));
    await waitFor(() => expect(logica.completarFicha).toHaveBeenCalledOnce());
    expect(logica.completarFicha.mock.calls[0]).toEqual([
      { nombre: 'Ana', telefono: '099123456', fecha_nacimiento: '1990-02-03', como_llego: '' },
      null,
    ]);
    // La sesión se refresca (lo hace `completarFicha`): el formulario se va y el foco pasa al título.
    rerender(<VistaFicha estado={alumno('completa')} onReintentarSesion={onReintentarSesion} />);
    const titulo = await screen.findByRole('heading', { level: 1, name: 'Ficha' });
    expect(screen.getByRole('status').textContent).toContain('Ficha guardada');
    expect(screen.getByRole('status').textContent).toContain('entrá desde el enlace de tu profesor');
    await waitFor(() => expect(document.activeElement).toBe(titulo));
  });
});

describe('Ficha · primer ingreso por el enlace de un profesor (ALU-14, DEC-33, SEC-16, CA-43)', () => {
  beforeEach(() => {
    logica.useProfesorDeOrigen.mockReturnValue({ estado: 'listo', slug: 'beto-gomez', nombre: 'Beto Gómez' });
  });

  it('ALU_14_pregunta_Como_llegaste_a_y_el_nombre_del_profesor_y_lo_avisa', async () => {
    const { container } = montar(alumno('ficha_incompleta'));
    expect(screen.getByLabelText(/^Cómo llegaste a Beto Gómez/)).toBeTruthy();
    expect(screen.getByText('Al guardarla le pedimos acceso a Beto Gómez.')).toBeTruthy();
    await sinViolacionesAxe(container);
  });

  it('SEC_16_el_nombre_del_profesor_se_muestra_como_texto_nunca_como_HTML', () => {
    const nombre = '<img src=x onerror="alert(1)"><b>Beto</b>';
    logica.useProfesorDeOrigen.mockReturnValue({ estado: 'listo', slug: 'beto-gomez', nombre });
    const { container } = montar(alumno('ficha_incompleta'));
    expect(screen.getByText(`Al guardarla le pedimos acceso a ${nombre}.`)).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });

  it('CA_43_ALU_13_con_el_tope_superado_sigue_en_el_formulario_con_el_mensaje_de_intentar_mas_tarde', async () => {
    logica.completarFicha.mockResolvedValue({
      ok: false,
      codigo: 'LIMITE_EXCEDIDO',
      mensaje: MENSAJE_FICHAS_ALU13,
      campo: null,
    });
    montar(alumno('ficha_incompleta'));
    await userEvent.type(screen.getByLabelText(/^Teléfono o WhatsApp/), '099123456');
    fireEvent.change(screen.getByLabelText(/^Fecha de nacimiento/), { target: { value: '1990-02-03' } });
    await userEvent.type(screen.getByLabelText(/^Cómo llegaste a Beto Gómez/), 'Por una amiga');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar ficha' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Intentá de nuevo más tarde.');
    expect(screen.getByRole('heading', { level: 1, name: 'Ficha' })).toBeTruthy();
    expect(screen.queryByText('Ficha guardada')).toBeNull();
  });

  it('ALU_14_al_completar_la_ficha_manda_el_slug_de_origen_y_anuncia_a_quien_se_le_pidio_acceso', async () => {
    logica.completarFicha.mockResolvedValue({
      ok: true,
      inscripcion: { profesorId: 'id-beto-gomez', estado: 'pendiente' },
    });
    const { rerender, onReintentarSesion } = montar(alumno('ficha_incompleta'));
    await userEvent.type(screen.getByLabelText(/^Teléfono o WhatsApp/), '099123456');
    fireEvent.change(screen.getByLabelText(/^Fecha de nacimiento/), { target: { value: '1990-02-03' } });
    await userEvent.type(screen.getByLabelText(/^Cómo llegaste a Beto Gómez/), 'Por una amiga');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar ficha' }));
    await waitFor(() => expect(logica.completarFicha).toHaveBeenCalledOnce());
    expect(logica.completarFicha.mock.calls[0]).toEqual([
      { nombre: 'Ana', telefono: '099123456', fecha_nacimiento: '1990-02-03', como_llego: 'Por una amiga' },
      'beto-gomez',
    ]);
    rerender(
      <VistaFicha
        estado={alumno('completa', inscripcion('beto-gomez', 'pendiente', { profesor_nombre: 'Beto Gómez' }))}
        onReintentarSesion={onReintentarSesion}
      />,
    );
    const titulo = await screen.findByRole('heading', { level: 1, name: 'Ficha' });
    expect(screen.getByRole('status').textContent).toContain(
      'Le pediste acceso a Beto Gómez: queda pendiente de aprobación.',
    );
    await waitFor(() => expect(document.activeElement).toBe(titulo));
  });
});

describe('Ficha · lectura del profesor de origen (ALU-14)', () => {
  it('ALU_14_mientras_se_lee_el_profesor_del_enlace_muestra_cargando_y_no_el_formulario', async () => {
    logica.useProfesorDeOrigen.mockReturnValue({ estado: 'cargando', slug: 'beto-gomez' });
    const { container } = montar(alumno('ficha_incompleta'));
    expect(screen.getByRole('status').textContent).toContain('Cargando tu ficha…');
    expect(screen.queryByRole('button', { name: 'Guardar ficha' })).toBeNull();
    await sinViolacionesAxe(container);
  });

  it('ALU_14_si_no_se_puede_leer_el_profesor_ofrece_reintentar', async () => {
    logica.useProfesorDeOrigen.mockReturnValue({
      estado: 'error',
      slug: 'beto-gomez',
      error: { codigo: 'RED', mensaje: 'No hay conexión con el servidor.' },
      recargar: recargarOrigen,
    });
    const { container } = montar(alumno('ficha_incompleta'));
    expect((await screen.findByRole('alert')).textContent).toContain('No se pudo cargar el profesor del enlace.');
    expect(screen.queryByRole('button', { name: 'Guardar ficha' })).toBeNull();
    await sinViolacionesAxe(container);
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(recargarOrigen).toHaveBeenCalledOnce();
  });
});

describe('Ficha · cuenta con la ficha completa (WEB-03, ALU-03, ALU-06, ALU-14, SEC-16, CA-45)', () => {
  it('WEB_03_con_la_ficha_completa_muestra_los_datos_los_profesores_y_las_personas_a_cargo', async () => {
    const { container } = montar(alumno('completa', BETO));
    expect(screen.getByRole('heading', { level: 1, name: 'Ficha' })).toBeTruthy();
    expect(await screen.findByText('+598 99 123-456')).toBeTruthy();
    expect(screen.getByText('3 de febrero de 1990')).toBeTruthy();
    // «Cómo llegaste» no es de la persona: ya no aparece entre sus datos.
    expect(screen.queryByText('Cómo llegaste')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Tus profesores' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Beto Gómez' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Personas a cargo' })).toBeTruthy();
    expect(screen.queryByText('Ficha guardada')).toBeNull();
    expect(logica.leerMiFicha).toHaveBeenCalledWith('a1');
    expect(logica.usePersonasACargo).toHaveBeenCalledWith('a1');
    await sinViolacionesAxe(container);
  });

  it('ALU_03_ALU_14_con_varios_profesores_cada_uno_tiene_su_estado_su_motivo_y_su_enlace', async () => {
    const rechazada = inscripcion('dora-ruiz', 'rechazado', {
      profesor_nombre: 'Dora Ruiz',
      motivo_rechazo: 'No hay lugar.',
    });
    const { container } = montar(alumno('completa', BETO, CARLA, rechazada));
    await screen.findByText('+598 99 123-456');
    const seccion = screen.getByRole('heading', { level: 2, name: 'Tus profesores' }).closest('section') as HTMLElement;
    const tarjetas = within(seccion).getAllByRole('article');
    expect(tarjetas.map((t) => within(t).getByRole('heading', { level: 3 }).textContent)).toEqual([
      'Beto Gómez',
      'Carla Díaz',
      'Dora Ruiz',
    ]);
    expect(within(tarjetas[0] as HTMLElement).getByText('Aprobada')).toBeTruthy();
    expect(within(tarjetas[1] as HTMLElement).getByText('Pendiente de aprobación')).toBeTruthy();
    expect(within(tarjetas[2] as HTMLElement).getByText('Rechazada')).toBeTruthy();
    expect(within(tarjetas[2] as HTMLElement).getByText('No hay lugar.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ver la agenda de Beto Gómez' }).getAttribute('href')).toBe(
      '#/p/beto-gomez',
    );
    await sinViolacionesAxe(container);
  });

  it('ALU_03_sin_vinculos_dice_como_conseguir_uno', async () => {
    montar(alumno('completa'));
    await screen.findByText('+598 99 123-456');
    expect(screen.getByRole('heading', { name: 'Todavía no pediste acceso a ningún profesor' })).toBeTruthy();
    expect(screen.queryByRole('article')).toBeNull();
  });

  it('CA_45_SEC_16_el_nombre_y_el_motivo_del_rechazo_se_muestran_como_texto', async () => {
    const motivo = 'No tenemos lugar <b>este</b> trimestre.';
    const raro = inscripcion('dora-ruiz', 'rechazado', { profesor_nombre: '<i>Dora</i>', motivo_rechazo: motivo });
    const { container } = montar(alumno('completa', raro));
    await screen.findByText('+598 99 123-456');
    expect(screen.getByText(motivo)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: '<i>Dora</i>' })).toBeTruthy();
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('i')).toBeNull();
    await sinViolacionesAxe(container);
  });

  it('CA_45_rechazada_sin_motivo_muestra_solo_el_estado', async () => {
    montar(alumno('completa', inscripcion('dora-ruiz', 'rechazado', { profesor_nombre: 'Dora Ruiz' })));
    await screen.findByText('+598 99 123-456');
    expect(screen.getByText('Rechazada')).toBeTruthy();
    expect(screen.queryByText('Motivo:')).toBeNull();
  });

  it('AGE_11_un_profesor_inactivo_se_dice_en_su_vinculo', async () => {
    montar(
      alumno('completa', inscripcion('ines-sol', 'aprobado', { profesor_nombre: 'Inés Sol', profesor_activo: false })),
    );
    await screen.findByText('+598 99 123-456');
    expect(screen.getByText('No toma reservas por ahora.')).toBeTruthy();
  });

  it('WEB_03_si_no_se_pueden_leer_los_datos_muestra_el_error_y_Reintentar_los_vuelve_a_pedir', async () => {
    logica.leerMiFicha.mockRejectedValueOnce(new Error('falló'));
    const { container } = montar(alumno('completa', BETO));
    expect((await screen.findByRole('alert')).textContent).toContain('No se pudieron cargar tus datos.');
    await sinViolacionesAxe(container);
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('+598 99 123-456')).toBeTruthy();
    expect(logica.leerMiFicha).toHaveBeenCalledTimes(2);
  });

  it('ALU_06_guardar_una_persona_usa_la_logica_y_recarga_la_lista', async () => {
    logica.usePersonasACargo.mockReturnValue({ estado: { tipo: 'ok', personas: [] }, recargar });
    montar(alumno('completa', BETO));
    await userEvent.click(await screen.findByRole('button', { name: 'Agregar persona' }));
    const dialogo = await screen.findByRole('dialog');
    await userEvent.type(dialogo.querySelector('input[name="nombre"]') as HTMLInputElement, 'Lucía');
    fireEvent.change(dialogo.querySelector('input[name="fecha_nacimiento"]') as HTMLInputElement, {
      target: { value: '2015-05-20' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(logica.guardarPersonaACargo).toHaveBeenCalledOnce());
    expect(logica.guardarPersonaACargo.mock.calls[0]?.[0]).toEqual({
      id: null,
      nombre: 'Lucía',
      fecha_nacimiento: '2015-05-20',
    });
    await waitFor(() => expect(recargar).toHaveBeenCalledOnce());
  });
});

describe('Pagina `#/ficha`', () => {
  it('WEB_03_la_pagina_lee_la_sesion_real_y_sin_sesion_guardada_ofrece_ingresar', async () => {
    // `useSesion()` real: sin sesión guardada en el navegador de prueba la app es visitante.
    render(<Pagina />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Sin permisos' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ingresar' }).getAttribute('href')).toBe('#/ingreso');
  });
});
