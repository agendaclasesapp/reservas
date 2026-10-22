// @vitest-environment jsdom
// Página `#/ficha` por estado de sesión (WEB-03, ALU-02, ALU-03, ALU-06, ALU-13, CA-02, CA-43, CA-45):
// cargando, error, sin permisos, ficha incompleta, pendiente, aprobada y rechazada con y sin motivo.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoSesion, SesionActual } from '../../../../src/estado';
import { MENSAJE_FICHAS_ALU13 } from '../../../../src/lib/errores';
import { sinViolacionesAxe } from '../../ui/soporte';

const logica = vi.hoisted(() => ({
  completarFicha: vi.fn(),
  guardarPersonaACargo: vi.fn(),
  leerMiFicha: vi.fn(),
  usePersonasACargo: vi.fn(),
}));

vi.mock('../../../../src/modulos/ficha/logica', async (importarOriginal) => ({
  ...(await importarOriginal<object>()),
  ...logica,
}));

import { VistaFicha } from '../../../../src/modulos/ficha/vistas/PaginaFicha';
import Pagina from '../../../../src/modulos/ficha/vistas/Pagina';

const recargar = vi.fn();

function alumno(estado: NonNullable<SesionActual['estado']>, extra: Partial<SesionActual> = {}): EstadoSesion {
  return {
    tipo: 'sesion',
    sesion: {
      rol: 'alumno',
      alumno_id: 'a1',
      estado,
      nombre: 'Ana Pérez',
      mail: 'ana@correo.test',
      motivo_rechazo: null,
      ...extra,
    },
  };
}

const FICHA = {
  nombre: 'Ana Pérez',
  mail: 'ana@correo.test',
  telefono: '+598 99 123-456',
  fecha_nacimiento: '1990-02-03',
  como_llego: 'Por una amiga',
};

function montar(estado: EstadoSesion, onReintentarSesion = vi.fn()) {
  const resultado = render(<VistaFicha estado={estado} onReintentarSesion={onReintentarSesion} />);
  return { ...resultado, onReintentarSesion };
}

beforeEach(() => {
  logica.leerMiFicha.mockResolvedValue(FICHA);
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

  it('WEB_03_el_profesor_ve_Sin_permisos_con_el_acceso_al_panel', () => {
    montar({
      tipo: 'sesion',
      sesion: { rol: 'profesor', alumno_id: null, estado: null, nombre: null, mail: null, motivo_rechazo: null },
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Sin permisos' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir al panel' }).getAttribute('href')).toBe('#/panel');
  });

  it.each(['sin_cuenta', 'borrado'] as const)('WEB_03_un_alumno_%s_ve_Sin_permisos', (estado) => {
    montar(alumno(estado));
    expect(screen.getByRole('heading', { level: 1, name: 'Sin permisos' })).toBeTruthy();
    expect(logica.leerMiFicha).not.toHaveBeenCalled();
  });
});

describe('Ficha · primer ingreso (ALU-02, CA-02, CA-43)', () => {
  it('CA_02_muestra_solo_el_formulario_con_nombre_y_mail_cargados_y_sin_personas_a_cargo', async () => {
    const { container } = montar(alumno('ficha_incompleta'));
    expect(screen.getByRole('heading', { level: 1, name: 'Ficha' })).toBeTruthy();
    expect((screen.getByLabelText(/^Nombre y apellido/) as HTMLInputElement).value).toBe('Ana Pérez');
    expect((screen.getByLabelText(/^Mail/) as HTMLInputElement).value).toBe('ana@correo.test');
    expect(screen.queryByRole('heading', { name: 'Personas a cargo' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Estado de tu cuenta' })).toBeNull();
    // Sin texto de privacidad ni consentimiento (DEC-16 B).
    expect(screen.queryByText(/privacidad|consentimiento/i)).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    await sinViolacionesAxe(container);
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
    await userEvent.type(screen.getByLabelText(/^Cómo llegaste al profesor/), 'Por una amiga');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar ficha' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Intentá de nuevo más tarde.');
    expect(screen.getByRole('heading', { level: 1, name: 'Ficha' })).toBeTruthy();
    expect(screen.queryByText('Ficha guardada')).toBeNull();
  });

  it('ALU_02_al_completar_la_ficha_la_cuenta_pasa_a_pendiente_se_anuncia_y_el_foco_va_al_titulo', async () => {
    const { rerender, onReintentarSesion } = montar(alumno('ficha_incompleta'));
    await userEvent.type(screen.getByLabelText(/^Teléfono o WhatsApp/), '099123456');
    fireEvent.change(screen.getByLabelText(/^Fecha de nacimiento/), { target: { value: '1990-02-03' } });
    await userEvent.type(screen.getByLabelText(/^Cómo llegaste al profesor/), 'Por una amiga');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar ficha' }));
    await waitFor(() => expect(logica.completarFicha).toHaveBeenCalledOnce());
    expect(logica.completarFicha.mock.calls[0]?.[0]).toEqual({
      nombre: 'Ana Pérez',
      telefono: '099123456',
      fecha_nacimiento: '1990-02-03',
      como_llego: 'Por una amiga',
    });
    // La sesión se refresca (lo hace `completarFicha`): la guarda suelta la ficha y el estado cambia.
    rerender(<VistaFicha estado={alumno('pendiente')} onReintentarSesion={onReintentarSesion} />);
    const titulo = await screen.findByRole('heading', { level: 1, name: 'Ficha' });
    expect(screen.getByRole('status').textContent).toContain('Ficha guardada');
    await waitFor(() => expect(document.activeElement).toBe(titulo));
  });
});

describe('Ficha · cuenta con la ficha completa (WEB-03, ALU-03, ALU-06, CA-45)', () => {
  it('ALU_03_pendiente_muestra_Pendiente_de_aprobacion_los_datos_y_las_personas_a_cargo', async () => {
    const { container } = montar(alumno('pendiente'));
    expect(screen.getByRole('heading', { level: 1, name: 'Ficha' })).toBeTruthy();
    expect(screen.getByText('Pendiente de aprobación')).toBeTruthy();
    expect(await screen.findByText('+598 99 123-456')).toBeTruthy();
    expect(screen.getByText('3 de febrero de 1990')).toBeTruthy();
    expect(screen.getByText('Por una amiga')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Personas a cargo' })).toBeTruthy();
    expect(screen.queryByText('Ficha guardada')).toBeNull();
    expect(logica.leerMiFicha).toHaveBeenCalledWith('a1');
    expect(logica.usePersonasACargo).toHaveBeenCalledWith('a1');
    await sinViolacionesAxe(container);
  });

  it('ALU_03_aprobada_dice_Aprobada', async () => {
    montar(alumno('aprobado'));
    expect(screen.getByText('Aprobada')).toBeTruthy();
    await screen.findByText('Por una amiga');
  });

  it('CA_45_rechazada_con_motivo_lo_muestra_como_texto', async () => {
    const motivo = 'No tenemos lugar <b>este</b> trimestre.';
    const { container } = montar(alumno('rechazado', { motivo_rechazo: motivo }));
    expect(screen.getByText('Rechazada')).toBeTruthy();
    expect(screen.getByText(motivo)).toBeTruthy();
    expect(container.querySelector('b')).toBeNull();
    await screen.findByText('Por una amiga');
    await sinViolacionesAxe(container);
  });

  it('CA_45_rechazada_sin_motivo_muestra_solo_el_estado', async () => {
    montar(alumno('rechazado'));
    expect(screen.getByText('Rechazada')).toBeTruthy();
    expect(screen.queryByText('Motivo:')).toBeNull();
    await screen.findByText('Por una amiga');
  });

  it('WEB_03_si_no_se_pueden_leer_los_datos_muestra_el_error_y_Reintentar_los_vuelve_a_pedir', async () => {
    logica.leerMiFicha.mockRejectedValueOnce(new Error('falló'));
    const { container } = montar(alumno('pendiente'));
    expect((await screen.findByRole('alert')).textContent).toContain('No se pudieron cargar tus datos.');
    await sinViolacionesAxe(container);
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Por una amiga')).toBeTruthy();
    expect(logica.leerMiFicha).toHaveBeenCalledTimes(2);
  });

  it('ALU_06_guardar_una_persona_usa_la_logica_y_recarga_la_lista', async () => {
    logica.usePersonasACargo.mockReturnValue({ estado: { tipo: 'ok', personas: [] }, recargar });
    montar(alumno('pendiente'));
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
