// @vitest-environment jsdom
// B15 · T15.2 · Vista `#/admin` del Administrador: lista con enlace, copiar y estado, inactivar y reactivar con
// confirmación, y alta con el error de cada validación (WEB-10, ADM-02, ADM-03, ADM-05, DEC-34, SEC-16).
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MENSAJES_ADMIN } from '../../../../src/modulos/admin/logica';
import type {
  EstadoProfesores,
  FalloAdmin,
  ProfesorLista,
  ResultadoAltaProfesor,
  ResultadoEstadoProfesor,
} from '../../../../src/modulos/admin/logica';
import { TEXTO_ALTA_HECHA } from '../../../../src/modulos/admin/vistas/AltaProfesorForm';
import {
  TEXTO_INACTIVAR,
  TEXTO_REACTIVAR,
  VistaAdmin,
  type VistaAdminProps,
} from '../../../../src/modulos/admin/vistas/VistaAdmin';
import { sinViolacionesAxe } from '../../ui/soporte';

afterEach(cleanup);

const ANA: ProfesorLista = {
  profesor_id: 'p1',
  nombre: 'Ana Pérez',
  mail: 'ana@example.test',
  slug: 'ana-perez',
  activo: true,
  creado_en: '2026-10-01T10:00:00+00:00',
  enlace: 'https://ejemplo.test/reservas/#/p/ana-perez',
};
const LUIS: ProfesorLista = {
  profesor_id: 'p2',
  nombre: 'Luis Gómez',
  mail: 'luis@example.test',
  slug: 'luis-gomez',
  activo: false,
  creado_en: '2026-10-02T10:00:00+00:00',
  enlace: 'https://ejemplo.test/reservas/#/p/luis-gomez',
};

const listo = (...profesores: ProfesorLista[]): EstadoProfesores => ({ estado: 'listo', profesores, error: null });

function fallo(codigo: FalloAdmin['codigo'], mensaje: string, campo: FalloAdmin['campo']): FalloAdmin {
  return { ok: false, codigo, mensaje, campo };
}

const ALTA_OK: ResultadoAltaProfesor = { ok: true, profesorId: 'p9', slug: 'nuevo', adoptado: false };
const ESTADO_OK = (activo: boolean): ResultadoEstadoProfesor => ({ ok: true, profesorId: 'p1', activo });

function montar(props: Partial<VistaAdminProps> = {}) {
  const onRecargar = vi.fn();
  const enviar = vi.fn<VistaAdminProps['alta']['enviar']>(async () => ALTA_OK);
  const cambiar = vi.fn<VistaAdminProps['estado']['cambiar']>(async (id, activo) => ({ ...ESTADO_OK(activo), profesorId: id }));
  const copiar = vi.fn<(texto: string) => Promise<boolean>>(async () => true);
  const vista = render(
    <VistaAdmin
      datos={listo(ANA, LUIS)}
      onRecargar={onRecargar}
      alta={{ enviar, enviando: false }}
      estado={{ cambiar, cambiando: null }}
      copiar={copiar}
      {...props}
    />,
  );
  return { ...vista, onRecargar, enviar, cambiar, copiar };
}

async function llenarAlta(mail: string, nombre: string, slug: string) {
  if (mail) await userEvent.type(screen.getByLabelText(/Mail del profesor/), mail);
  if (nombre) await userEvent.type(screen.getByLabelText(/Nombre del profesor/), nombre);
  if (slug) await userEvent.type(screen.getByLabelText(/Enlace del profesor/), slug);
}

/** La región de estado de «copiar» (las `Alerta` también son `status`, pero llevan `data-tipo`). */
const regionCopia = () => {
  const region = screen.getAllByRole('status').find((e) => !e.hasAttribute('data-tipo'));
  if (!region) throw new Error('Falta la región de estado de copiar');
  return region;
};

const darDeAlta = () => userEvent.click(screen.getByRole('button', { name: 'Dar de alta' }));

describe('Lista de profesores (WEB-10, ADM-03)', () => {
  it('ADM_03_muestra_nombre_mail_enlace_y_estado_de_cada_profesor_y_pasa_axe', async () => {
    const { container } = montar();
    expect(screen.getByRole('heading', { level: 1, name: 'Administración' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Profesores' })).toBeTruthy();
    expect(screen.getByText('2 profesores')).toBeTruthy();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    const ana = within(items[0]!);
    expect(ana.getByRole('heading', { level: 3, name: 'Ana Pérez' })).toBeTruthy();
    expect(ana.getByText('ana@example.test')).toBeTruthy();
    expect((ana.getByLabelText('Enlace de Ana Pérez') as HTMLInputElement).value).toBe(ANA.enlace);
    expect(ana.getByText('Activo')).toBeTruthy();
    const luis = within(items[1]!);
    expect(luis.getByText('Inactivo')).toBeTruthy();
    expect(luis.getByLabelText('Enlace de Luis Gómez')).toBeTruthy();
    await sinViolacionesAxe(container);
  });

  it('ADM_03_un_solo_profesor_se_cuenta_en_singular', () => {
    montar({ datos: listo(ANA) });
    expect(screen.getByText('1 profesor')).toBeTruthy();
  });

  it('WEB_10_cargando_sin_lista_muestra_el_indicador_y_no_la_cuenta', async () => {
    const { container } = montar({ datos: { estado: 'cargando', profesores: [], error: null } });
    expect(screen.getByText('Cargando los profesores…')).toBeTruthy();
    expect(screen.queryByText(/\d+ profesor/)).toBeNull();
    await sinViolacionesAxe(container);
  });

  it('WEB_10_recargando_conserva_la_lista_visible_y_la_marca_ocupada', () => {
    montar({ datos: { estado: 'cargando', profesores: [ANA], error: null } });
    expect(screen.getByRole('heading', { level: 3, name: 'Ana Pérez' })).toBeTruthy();
    expect(screen.getByRole('list').getAttribute('aria-busy')).toBe('true');
  });

  it('WEB_10_sin_profesores_dice_que_no_hay_y_apunta_al_formulario', async () => {
    const { container } = montar({ datos: listo() });
    expect(screen.getByRole('heading', { level: 3, name: 'Todavía no hay profesores' })).toBeTruthy();
    expect(screen.getByText('0 profesores')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
    await sinViolacionesAxe(container);
  });

  it('WEB_10_error_de_lectura_muestra_el_mensaje_y_reintentar_recarga', async () => {
    const { onRecargar, container } = montar({
      datos: { estado: 'error', profesores: [], error: 'Sin conexión.' },
    });
    expect(screen.getByRole('alert').textContent).toContain('No se pudo cargar la lista de profesores. Sin conexión.');
    await sinViolacionesAxe(container);
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRecargar).toHaveBeenCalledOnce();
  });

  it('SEC_16_el_nombre_con_marcas_html_se_muestra_como_texto_y_no_crea_elementos', () => {
    const hostil: ProfesorLista = { ...ANA, nombre: '<img src=x onerror=alert(1)><b>Ana</b>' };
    const { container } = montar({ datos: listo(hostil) });
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('<img src=x onerror=alert(1)><b>Ana</b>');
  });

  it('WEB_10_un_nombre_vacio_se_muestra_como_sin_nombre', () => {
    montar({ datos: listo({ ...ANA, nombre: null }) });
    expect(screen.getByRole('heading', { level: 3, name: 'Sin nombre' })).toBeTruthy();
  });
});

describe('Copiar el enlace (ADM-03)', () => {
  it('ADM_03_copiar_copia_el_enlace_de_ese_profesor_y_lo_anuncia', async () => {
    const { copiar, container } = montar();
    expect(regionCopia().textContent).toBe('');
    await userEvent.click(screen.getByRole('button', { name: 'Copiar enlace de Luis Gómez' }));
    expect(copiar).toHaveBeenCalledExactlyOnceWith(LUIS.enlace);
    await waitFor(() => expect(regionCopia().textContent).toBe('Enlace de Luis Gómez copiado.'));
    await sinViolacionesAxe(container);
  });

  it('ADM_03_si_el_navegador_no_deja_copiar_lo_dice_y_el_enlace_queda_para_copiarlo_a_mano', async () => {
    montar({ copiar: vi.fn(async () => false) });
    await userEvent.click(screen.getByRole('button', { name: 'Copiar enlace de Ana Pérez' }));
    await waitFor(() =>
      expect(regionCopia().textContent).toBe(
        'No se pudo copiar el enlace de Ana Pérez. Seleccionalo y copialo a mano.',
      ),
    );
    expect((screen.getByLabelText('Enlace de Ana Pérez') as HTMLInputElement).readOnly).toBe(true);
  });
});

describe('Inactivar y reactivar con confirmación (ADM-05)', () => {
  it('ADM_05_inactivar_pide_confirmacion_explica_la_pausa_y_no_cambia_nada_hasta_confirmar', async () => {
    const { cambiar, container } = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Inactivar a Ana Pérez' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Inactivar a Ana Pérez' });
    expect(within(dialogo).getByText(TEXTO_INACTIVAR)).toBeTruthy();
    expect(cambiar).not.toHaveBeenCalled();
    await sinViolacionesAxe(container);
    await sinViolacionesAxe(dialogo);
  });

  it('ADM_05_cancelar_cierra_el_dialogo_sin_cambiar_el_estado_y_devuelve_el_foco_al_boton', async () => {
    const { cambiar } = montar();
    const boton = screen.getByRole('button', { name: 'Inactivar a Ana Pérez' });
    await userEvent.click(boton);
    const dialogo = await screen.findByRole('dialog');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(cambiar).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(boton));
  });

  it('ADM_05_Esc_cierra_el_dialogo_sin_cambiar_el_estado', async () => {
    const { cambiar } = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Inactivar a Ana Pérez' }));
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(cambiar).not.toHaveBeenCalled();
  });

  it('ADM_05_confirmar_inactiva_recarga_la_lista_y_lo_anuncia', async () => {
    const { cambiar, onRecargar } = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Inactivar a Ana Pérez' }));
    const dialogo = await screen.findByRole('dialog');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Inactivar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(cambiar).toHaveBeenCalledExactlyOnceWith('p1', false);
    expect(onRecargar).toHaveBeenCalledOnce();
    expect(screen.getByText('Ana Pérez quedó inactivo.')).toBeTruthy();
  });

  it('ADM_05_reactivar_explica_que_las_solicitudes_canceladas_no_vuelven_y_reactiva', async () => {
    const { cambiar, onRecargar } = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Reactivar a Luis Gómez' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Reactivar a Luis Gómez' });
    expect(within(dialogo).getByText(TEXTO_REACTIVAR)).toBeTruthy();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Reactivar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(cambiar).toHaveBeenCalledExactlyOnceWith('p2', true);
    expect(onRecargar).toHaveBeenCalledOnce();
    expect(screen.getByText('Luis Gómez quedó activo.')).toBeTruthy();
  });

  it('ADM_05_si_falla_el_cambio_el_dialogo_sigue_abierto_con_el_error_y_no_recarga', async () => {
    const cambiar = vi.fn(async () => fallo('PROHIBIDO', 'No tenés permiso para hacer esto.', null));
    const { onRecargar } = montar({ estado: { cambiar, cambiando: null } });
    await userEvent.click(screen.getByRole('button', { name: 'Inactivar a Ana Pérez' }));
    const dialogo = await screen.findByRole('dialog');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Inactivar' }));
    expect((await within(dialogo).findByRole('alert')).textContent).toContain('No tenés permiso para hacer esto.');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(onRecargar).not.toHaveBeenCalled();
    await sinViolacionesAxe(dialogo);
  });

  it('ADM_05_mientras_un_cambio_esta_en_curso_los_botones_de_la_lista_quedan_deshabilitados', () => {
    montar({ estado: { cambiar: vi.fn(), cambiando: 'p1' } });
    expect((screen.getByRole('button', { name: 'Inactivar a Ana Pérez' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Reactivar a Luis Gómez' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Alta de un profesor (ADM-02, DEC-31, DEC-34)', () => {
  it('ADM_02_el_formulario_tiene_mail_nombre_y_enlace_con_etiqueta_y_el_aviso_de_datos_publicos', async () => {
    const { container } = montar();
    expect(screen.getByRole('heading', { level: 2, name: 'Dar de alta a un profesor' })).toBeTruthy();
    expect(screen.getByLabelText(/Mail del profesor/)).toBeTruthy();
    expect(screen.getByLabelText(/Nombre del profesor/)).toBeTruthy();
    expect(screen.getByLabelText(/Enlace del profesor/)).toBeTruthy();
    expect(screen.getByText(MENSAJES_ADMIN.avisoDatosPublicos)).toBeTruthy();
    expect(screen.getByText(MENSAJES_ADMIN.avisoDatosPublicos).textContent).toBe(
      'El nombre del profesor es público: lo ve cualquiera que abra su enlace. Su mail lo ven sus alumnos como dirección de respuesta.',
    );
    await sinViolacionesAxe(container);
  });

  it('ADM_02_da_de_alta_con_los_datos_recortados_y_el_enlace_en_minusculas_limpia_el_formulario_y_recarga', async () => {
    const { enviar, onRecargar } = montar();
    await llenarAlta('  nuevo@example.test ', ' Nuevo Profe ', ' Nuevo-Profe ');
    await darDeAlta();
    await waitFor(() => expect(enviar).toHaveBeenCalledOnce());
    expect(enviar).toHaveBeenCalledWith({ mail: 'nuevo@example.test', nombre: 'Nuevo Profe', slug: 'nuevo-profe' });
    expect(await screen.findByText(TEXTO_ALTA_HECHA)).toBeTruthy();
    expect(onRecargar).toHaveBeenCalledOnce();
    expect((screen.getByLabelText(/Mail del profesor/) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/Nombre del profesor/) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/Enlace del profesor/) as HTMLInputElement).value).toBe('');
  });

  it('ADM_02_Enter_en_un_campo_envia_el_formulario', async () => {
    const { enviar } = montar();
    await llenarAlta('nuevo@example.test', 'Nuevo', 'nuevo');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(enviar).toHaveBeenCalledOnce());
  });

  it('ADM_02_adopcion_muestra_que_el_profesor_ya_existia_y_conserva_sus_datos', async () => {
    const enviar = vi.fn(async (): Promise<ResultadoAltaProfesor> => ({ ...ALTA_OK, adoptado: true }));
    const { onRecargar, container } = montar({ alta: { enviar, enviando: false } });
    await llenarAlta('ana@example.test', 'Ana Pérez', 'ana-perez');
    await darDeAlta();
    expect(await screen.findByText(MENSAJES_ADMIN.adoptado)).toBeTruthy();
    expect(screen.queryByText(TEXTO_ALTA_HECHA)).toBeNull();
    expect(onRecargar).toHaveBeenCalledOnce();
    await sinViolacionesAxe(container);
  });

  it.each([
    ['mail_invalido', ['no-es-un-mail', 'Ana', 'ana-perez'], /Mail del profesor/, MENSAJES_ADMIN.mailInvalido],
    ['nombre_vacio', ['ana@example.test', '', 'ana-perez'], /Nombre del profesor/, MENSAJES_ADMIN.nombreVacio],
    ['enlace_muy_corto', ['ana@example.test', 'Ana', 'ab'], /Enlace del profesor/, MENSAJES_ADMIN.slugFormato],
    ['enlace_con_caracteres_invalidos', ['ana@example.test', 'Ana', 'ana_perez'], /Enlace del profesor/, MENSAJES_ADMIN.slugFormato],
    ['enlace_con_guion_en_el_borde', ['ana@example.test', 'Ana', '-ana'], /Enlace del profesor/, MENSAJES_ADMIN.slugFormato],
    ['enlace_reservado', ['ana@example.test', 'Ana', 'admin'], /Enlace del profesor/, MENSAJES_ADMIN.slugReservado],
  ] as const)(
    'ADM_02_%s_se_rechaza_en_su_campo_con_el_foco_y_sin_llamar_a_la_base',
    async (_caso, [mail, nombre, slug], campo, mensaje) => {
      const { enviar, container } = montar();
      await llenarAlta(mail, nombre, slug);
      await darDeAlta();
      const entrada = screen.getByLabelText(campo);
      expect(entrada.getAttribute('aria-invalid')).toBe('true');
      expect(screen.getByRole('alert').textContent).toBe(mensaje);
      expect(entrada.getAttribute('aria-describedby')).toContain(screen.getByRole('alert').id);
      expect(document.activeElement).toBe(entrada);
      expect(enviar).not.toHaveBeenCalled();
      await sinViolacionesAxe(container);
    },
  );

  it.each([
    ['slug_ya_usado_409', fallo('SLUG_YA_USADO', 'Ese enlace ya lo usa otro profesor. Elegí otro.', 'slug'), /Enlace del profesor/],
    [
      'mail_ya_registrado_409',
      fallo('MAIL_YA_REGISTRADO', MENSAJES_ADMIN.mailYaRegistrado, 'mail'),
      /Mail del profesor/,
    ],
    ['slug_no_valido_422_del_servidor', fallo('DATOS_INVALIDOS', MENSAJES_ADMIN.slugNoValido, 'slug'), /Enlace del profesor/],
    ['mail_no_valido_422_del_servidor', fallo('DATOS_INVALIDOS', MENSAJES_ADMIN.mailInvalido, 'mail'), /Mail del profesor/],
  ] as const)(
    'ADM_02_%s_muestra_el_error_en_su_campo_con_el_foco_y_conserva_lo_escrito',
    async (_caso, resultado, campo) => {
      const enviar = vi.fn(async (): Promise<ResultadoAltaProfesor> => resultado);
      const { onRecargar, container } = montar({ alta: { enviar, enviando: false } });
      await llenarAlta('ana@example.test', 'Ana', 'ana-perez');
      await darDeAlta();
      const entrada = await screen.findByLabelText(campo);
      await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(resultado.ok ? '' : resultado.mensaje));
      expect(entrada.getAttribute('aria-invalid')).toBe('true');
      await waitFor(() => expect(document.activeElement).toBe(entrada));
      expect((screen.getByLabelText(/Mail del profesor/) as HTMLInputElement).value).toBe('ana@example.test');
      expect((screen.getByLabelText(/Enlace del profesor/) as HTMLInputElement).value).toBe('ana-perez');
      expect(onRecargar).not.toHaveBeenCalled();
      await sinViolacionesAxe(container);
    },
  );

  it('ADM_02_un_error_sin_campo_como_el_403_se_muestra_como_aviso_del_formulario', async () => {
    const enviar = vi.fn(async (): Promise<ResultadoAltaProfesor> => fallo('PROHIBIDO', 'No tenés permiso para hacer esto.', null));
    const { onRecargar, container } = montar({ alta: { enviar, enviando: false } });
    await llenarAlta('ana@example.test', 'Ana', 'ana-perez');
    await darDeAlta();
    expect((await screen.findByRole('alert')).textContent).toContain('No tenés permiso para hacer esto.');
    expect(onRecargar).not.toHaveBeenCalled();
    await sinViolacionesAxe(container);
  });

  it('ADM_02_corregir_y_reenviar_quita_el_error_anterior', async () => {
    const { enviar } = montar();
    await llenarAlta('mal', 'Ana', 'ana-perez');
    await darDeAlta();
    expect(screen.getByRole('alert').textContent).toBe(MENSAJES_ADMIN.mailInvalido);
    const mail = screen.getByLabelText(/Mail del profesor/);
    await userEvent.clear(mail);
    await userEvent.type(mail, 'ana@example.test');
    await darDeAlta();
    await waitFor(() => expect(enviar).toHaveBeenCalledOnce());
    expect(screen.queryByText(MENSAJES_ADMIN.mailInvalido)).toBeNull();
  });

  it('ADM_02_mientras_envia_el_boton_avisa_que_esta_ocupado_y_no_envia_dos_veces', async () => {
    const enviar = vi.fn(async () => ALTA_OK);
    montar({ alta: { enviar, enviando: true } });
    const boton = screen.getByRole('button', { name: 'Dando de alta…' });
    expect(boton.getAttribute('aria-busy')).toBe('true');
    await userEvent.click(boton);
    expect(enviar).not.toHaveBeenCalled();
  });
});
