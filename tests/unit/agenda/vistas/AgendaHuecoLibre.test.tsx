// @vitest-environment jsdom
// Tocar un hueco libre en la agenda de un profesor (B06 · T06.2): WEB-01, CA-46, CA-03, DEC-28, AGE-11, NFR-05.
// Visitante: invitación a ingresar sin RPC ni datos. Vínculo aprobado: el formulario que compone la ruta.
// Otro estado del vínculo: el aviso de estado de WEB-01.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SesionActual } from '../../../../src/estado';
import { reiniciarConfigPublica, type ConfigPublica, type Hueco } from '../../../../src/modulos/agenda/logica';
import { accionDeHueco } from '../../../../src/modulos/agenda/vistas/accionHueco';
import { PaginaAgenda, type ContextoSolicitud } from '../../../../src/modulos/agenda/vistas/PaginaAgenda';
import { Dialogo } from '../../../../src/ui';
import { ADMINISTRADOR, inscripcion, persona, profesor } from '../../estado/soporte';
import { fijarSesion, restaurarSesion } from '../../ui/sesion';
import { sinViolacionesAxe } from '../../ui/soporte';

// CA-46: tocar un hueco sin sesión no puede pedir el cliente de supabase (ninguna RPC, ni de lectura ni de escritura).
const cargarSupabase = vi.hoisted(() => vi.fn());
vi.mock('../../../../src/lib/supabase', () => ({ cargarSupabase }));

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
const LIBRE: Hueco = { inicio: '2026-11-02T11:00:00+00:00', fin: '2026-11-02T12:00:00+00:00', estado: 'libre' };
const HUECOS: Hueco[] = [
  LIBRE,
  { inicio: '2026-11-02T12:00:00+00:00', fin: '2026-11-02T13:00:00+00:00', estado: 'ocupado' },
  { inicio: '2026-11-02T17:00:00+00:00', fin: '2026-11-02T18:00:00+00:00', estado: 'bloqueado' },
];

beforeEach(() => {
  reiniciarConfigPublica();
  cargarSupabase.mockReset();
});

afterEach(() => {
  cleanup();
  reiniciarConfigPublica();
  restaurarSesion();
});

/** El formulario que compone la ruta, reemplazado por uno mínimo que usa el contexto de la agenda. */
function formularioFalso(contexto: ContextoSolicitud): ReactNode {
  return (
    <Dialogo abierto titulo={`Pedir clase a ${contexto.profesorNombre}`} onCerrar={contexto.onCerrar}>
      <p>Hueco {contexto.hueco.inicio}</p>
      <button type="button" onClick={contexto.onCambioAgenda}>
        Simular pedido enviado
      </button>
    </Dialogo>
  );
}

function montar(opciones: { ruta?: string; solicitud?: (c: ContextoSolicitud) => ReactNode; pedirAcceso?: (slug: string) => ReactNode } = {}) {
  const obtenerAgenda = vi.fn(async () => HUECOS);
  const obtenerConfig = vi.fn(async () => CONFIG);
  const vista = render(
    <MemoryRouter initialEntries={[opciones.ruta ?? '/p/ana-perez']}>
      <PaginaAgenda
        slug="ana-perez"
        solicitud={opciones.solicitud}
        pedirAcceso={opciones.pedirAcceso}
        obtenerConfig={obtenerConfig}
        obtenerAgenda={obtenerAgenda}
        ahora={AHORA}
      />
    </MemoryRouter>,
  );
  return { ...vista, obtenerAgenda, obtenerConfig };
}

const HUECO_LIBRE = { name: '08:00 a 09:00 Libre' };

describe('Visitante sin sesión toca un hueco libre (WEB-01, CA-46)', () => {
  beforeEach(async () => {
    await fijarSesion(null);
  });

  it('CA_46_abre_la_invitacion_con_acceso_a_ingreso_y_vuelta_a_esta_agenda_sin_llamar_a_nada', async () => {
    const solicitud = vi.fn(formularioFalso);
    const { obtenerAgenda, obtenerConfig } = montar({ ruta: '/p/ana-perez?d=2026-11-02', solicitud });
    await userEvent.click(await screen.findByRole('button', HUECO_LIBRE));

    const dialogo = await screen.findByRole('dialog', { name: 'Ingresá para pedir esta clase' });
    expect(within(dialogo).getByText(/Para pedirle una clase a Ana Pérez tenés que ingresar/)).toBeTruthy();
    const enlace = within(dialogo).getByRole('link', { name: 'Ingresar' });
    expect(enlace.getAttribute('href')).toBe('#/ingreso?volver=%2Fp%2Fana-perez%3Fd%3D2026-11-02');

    // Ni formulario, ni datos pedidos, ni cliente de la base: solo las dos lecturas públicas de antes.
    expect(solicitud).not.toHaveBeenCalled();
    expect(cargarSupabase).not.toHaveBeenCalled();
    expect(obtenerAgenda).toHaveBeenCalledTimes(1);
    expect(obtenerConfig).toHaveBeenCalledTimes(1);
    expect(within(dialogo).queryByRole('textbox')).toBeNull();
    expect(within(dialogo).queryByRole('radio')).toBeNull();
  });

  it('CA_46_la_invitacion_funciona_sin_el_formulario_compuesto_y_pasa_axe', async () => {
    const { baseElement } = montar();
    await userEvent.click(await screen.findByRole('button', HUECO_LIBRE));
    await screen.findByRole('dialog', { name: 'Ingresá para pedir esta clase' });
    await sinViolacionesAxe(baseElement);
  });

  it('CA_46_se_cierra_con_escape_o_con_cerrar_y_el_foco_vuelve_al_hueco', async () => {
    montar();
    const hueco = await screen.findByRole('button', HUECO_LIBRE);
    await userEvent.click(hueco);
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(hueco));

    await userEvent.click(hueco);
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(hueco));
  });

  it('WEB_01_se_abre_con_teclado_y_el_ocupado_y_el_bloqueado_no_son_botones', async () => {
    montar();
    const lista = await screen.findByRole('list', { name: 'Huecos del día' });
    expect(within(lista).getAllByRole('button')).toHaveLength(1);
    screen.getByRole('button', HUECO_LIBRE).focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: 'Ingresá para pedir esta clase' })).toBeTruthy();
  });
});

describe('Vínculo aprobado con ese profesor (WEB-01, WEB-04, SOL-01)', () => {
  it('WEB_04_tocar_el_hueco_libre_abre_el_formulario_con_el_profesor_el_huso_y_el_hueco', async () => {
    await fijarSesion(persona([inscripcion('ana-perez', 'aprobado')]));
    const solicitud = vi.fn(formularioFalso);
    montar({ solicitud });
    await userEvent.click(await screen.findByRole('button', HUECO_LIBRE));

    expect(await screen.findByRole('dialog', { name: 'Pedir clase a Ana Pérez' })).toBeTruthy();
    expect(solicitud).toHaveBeenCalledWith(
      expect.objectContaining({
        profesorId: 'id-ana-perez',
        profesorNombre: 'Ana Pérez',
        zona: 'America/Argentina/Buenos_Aires',
        hueco: LIBRE,
      }),
    );
    expect(screen.queryByRole('dialog', { name: 'Ingresá para pedir esta clase' })).toBeNull();
  });

  it('WEB_04_cerrar_sin_pedir_devuelve_el_foco_al_hueco_y_no_relee_la_agenda', async () => {
    await fijarSesion(persona([inscripcion('ana-perez', 'aprobado')]));
    const { obtenerAgenda } = montar({ solicitud: formularioFalso });
    const hueco = await screen.findByRole('button', HUECO_LIBRE);
    await userEvent.click(hueco);
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(document.activeElement).toBe(hueco));
    expect(obtenerAgenda).toHaveBeenCalledTimes(1);
  });

  it('SOL_01_tras_el_pedido_la_agenda_se_relee_y_al_cerrar_el_foco_pasa_al_titulo', async () => {
    await fijarSesion(persona([inscripcion('ana-perez', 'aprobado')]));
    const { obtenerAgenda } = montar({ solicitud: formularioFalso });
    await userEvent.click(await screen.findByRole('button', HUECO_LIBRE));
    const dialogo = await screen.findByRole('dialog');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Simular pedido enviado' }));
    await waitFor(() => expect(obtenerAgenda).toHaveBeenCalledTimes(2));
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const titulo = await screen.findByRole('heading', { level: 1, name: 'Agenda de Ana Pérez' });
    await waitFor(() => expect(document.activeElement).toBe(titulo));
  });

  it('WEB_01_sin_el_formulario_compuesto_el_hueco_no_es_interactivo', async () => {
    await fijarSesion(persona([inscripcion('ana-perez', 'aprobado')]));
    montar();
    await screen.findByRole('list', { name: 'Huecos del día' });
    expect(screen.queryAllByRole('button', HUECO_LIBRE)).toHaveLength(0);
  });

  it('WEB_01_aprobado_por_otro_profesor_no_abre_el_formulario_de_esta_agenda_DEC_28', async () => {
    await fijarSesion(persona([inscripcion('beto-gomez', 'aprobado')]));
    const solicitud = vi.fn(formularioFalso);
    montar({ solicitud, pedirAcceso: (slug) => <p>Pedir acceso a {slug}</p> });
    await userEvent.click(await screen.findByRole('button', HUECO_LIBRE));
    expect(solicitud).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Otro estado del vínculo: el aviso de estado de WEB-01 (CA-03, ALU-14)', () => {
  it('CA_03_vinculo_pendiente_lleva_el_foco_al_aviso_de_acceso_pendiente_y_no_abre_formulario', async () => {
    await fijarSesion(persona([inscripcion('ana-perez', 'pendiente')]));
    const solicitud = vi.fn(formularioFalso);
    montar({ solicitud });
    await userEvent.click(await screen.findByRole('button', HUECO_LIBRE));
    const aviso = screen.getByText('Acceso pendiente').closest('[tabindex="-1"]');
    expect(document.activeElement).toBe(aviso);
    expect(solicitud).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('CA_03_vinculo_rechazado_lleva_el_foco_al_aviso_con_el_motivo', async () => {
    await fijarSesion(persona([inscripcion('ana-perez', 'rechazado', { motivo_rechazo: 'No tengo lugar' })]));
    montar({ solicitud: formularioFalso });
    await userEvent.click(await screen.findByRole('button', HUECO_LIBRE));
    const aviso = screen.getByText('Acceso no aprobado').closest('[tabindex="-1"]');
    expect(document.activeElement).toBe(aviso);
    expect(within(aviso as HTMLElement).getByText('No tengo lugar')).toBeTruthy();
  });

  it('WEB_01_ficha_incompleta_lleva_el_foco_al_aviso_de_completar_la_ficha', async () => {
    await fijarSesion(persona([], 'ficha_incompleta'));
    montar({ solicitud: formularioFalso });
    await userEvent.click(await screen.findByRole('button', HUECO_LIBRE));
    const aviso = screen.getByText('Completá tu ficha').closest('[tabindex="-1"]');
    expect(document.activeElement).toBe(aviso);
  });

  it('ALU_14_sin_vinculo_lleva_el_foco_a_pedir_acceso', async () => {
    await fijarSesion(persona([]));
    montar({ solicitud: formularioFalso, pedirAcceso: () => <p>Pedir acceso a Ana</p> });
    await userEvent.click(await screen.findByRole('button', HUECO_LIBRE));
    expect(document.activeElement).toBe(screen.getByText('Pedir acceso a Ana').parentElement);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ALU_14_sin_vinculo_y_sin_pedir_acceso_compuesto_el_hueco_no_es_interactivo', async () => {
    await fijarSesion(persona([]));
    montar({ solicitud: formularioFalso });
    await screen.findByRole('list', { name: 'Huecos del día' });
    expect(screen.queryAllByRole('button', HUECO_LIBRE)).toHaveLength(0);
  });

  it('WEB_01_el_aviso_y_la_agenda_pasan_axe', async () => {
    await fijarSesion(persona([inscripcion('ana-perez', 'pendiente')]));
    const { container } = montar({ solicitud: formularioFalso });
    await screen.findByRole('button', HUECO_LIBRE);
    await sinViolacionesAxe(container);
  });
});

describe('Quien no pide clases no ve huecos interactivos (PRF-07, AGE-11)', () => {
  const sesiones: ReadonlyArray<readonly [string, SesionActual]> = [
    ['profesor', profesor('ana-perez')],
    ['administrador', ADMINISTRADOR],
  ];
  it.each(sesiones)('SOL_09_%s_ve_la_agenda_sin_botones_en_los_huecos', async (_rol, sesion) => {
    await fijarSesion(sesion);
    montar({ solicitud: formularioFalso });
    await screen.findByRole('list', { name: 'Huecos del día' });
    expect(screen.queryAllByRole('button', HUECO_LIBRE)).toHaveLength(0);
  });

  it('AGE_11_con_el_profesor_inactivo_no_hay_agenda_ni_huecos_que_tocar', async () => {
    await fijarSesion(null);
    const obtenerConfig = vi.fn(async (): Promise<ConfigPublica> => ({ profesor_id: 'id-ana-perez', nombre: 'Ana Pérez', activo: false }));
    const obtenerAgenda = vi.fn(async () => HUECOS);
    render(
      <MemoryRouter>
        <PaginaAgenda slug="ana-perez" obtenerConfig={obtenerConfig} obtenerAgenda={obtenerAgenda} ahora={AHORA} />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Ana Pérez no toma reservas por ahora')).toBeTruthy();
    expect(screen.queryByRole('button', HUECO_LIBRE)).toBeNull();
    expect(obtenerAgenda).not.toHaveBeenCalled();
  });
});

describe('accionDeHueco: la misma tabla que accionAlTocarHueco de solicitud (WEB-01)', () => {
  const opciones = { hayFormulario: true, hayPedirAcceso: true };
  it('cubre cada relacion', () => {
    expect(accionDeHueco({ tipo: 'visitante' }, opciones)).toBe('invitar_ingreso');
    expect(accionDeHueco({ tipo: 'cargando' }, opciones)).toBe('ninguna');
    expect(accionDeHueco({ tipo: 'error' }, opciones)).toBe('ninguna');
    expect(accionDeHueco({ tipo: 'sin_acceso' }, opciones)).toBe('ninguna');
    expect(accionDeHueco({ tipo: 'profesor', propio: true }, opciones)).toBe('ninguna');
    expect(accionDeHueco({ tipo: 'administrador' }, opciones)).toBe('ninguna');
    expect(accionDeHueco({ tipo: 'ficha_incompleta' }, opciones)).toBe('ver_aviso');
    expect(accionDeHueco({ tipo: 'sin_vinculo' }, opciones)).toBe('ver_aviso');
    expect(accionDeHueco({ tipo: 'vinculo', inscripcion: inscripcion('a', 'aprobado') }, opciones)).toBe('formulario');
    expect(accionDeHueco({ tipo: 'vinculo', inscripcion: inscripcion('a', 'pendiente') }, opciones)).toBe('ver_aviso');
    expect(accionDeHueco({ tipo: 'vinculo', inscripcion: inscripcion('a', 'rechazado') }, opciones)).toBe('ver_aviso');
    expect(accionDeHueco({ tipo: 'vinculo', inscripcion: inscripcion('a', 'sin_cuenta') }, opciones)).toBe('ninguna');
    expect(accionDeHueco({ tipo: 'vinculo', inscripcion: inscripcion('a', 'aprobado', { profesor_activo: false }) }, opciones)).toBe('ninguna');
  });
});
