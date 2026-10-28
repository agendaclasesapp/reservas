// @vitest-environment jsdom
// Agenda `#/p/<slug>` según quién mira y el profesor (B14 · T14.4): nombre del profesor (AGE-09, SEC-16), enlace no
// válido (AGE-09), profesor inactivo (AGE-11), estado del vínculo con ESE profesor (WEB-01, ALU-03, DEC-28) y
// «Pedir acceso» compuesto por la ruta (ALU-14).
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SesionActual } from '../../../../src/estado';
import { reiniciarConfigPublica, type ConfigPublica, type Hueco } from '../../../../src/modulos/agenda/logica';
import { PaginaAgenda } from '../../../../src/modulos/agenda/vistas/PaginaAgenda';
import { ADMINISTRADOR, inscripcion, persona, profesor } from '../../estado/soporte';
import { fijarSesion, restaurarSesion } from '../../ui/sesion';
import { sinViolacionesAxe } from '../../ui/soporte';

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

beforeEach(() => {
  reiniciarConfigPublica();
});

afterEach(() => {
  cleanup();
  reiniciarConfigPublica();
  restaurarSesion();
});

function montar(config: ConfigPublica | Error, pedirAcceso?: (slug: string) => ReactNode) {
  const obtenerConfig = vi.fn(async () => {
    if (config instanceof Error) throw config;
    return config;
  });
  const obtenerAgenda = vi.fn(async () => HUECOS);
  const vista = render(
    <MemoryRouter initialEntries={['/p/ana-perez']}>
      <PaginaAgenda
        slug="ana-perez"
        pedirAcceso={pedirAcceso}
        obtenerConfig={obtenerConfig}
        obtenerAgenda={obtenerAgenda}
        ahora={AHORA}
      />
    </MemoryRouter>,
  );
  return { ...vista, obtenerConfig, obtenerAgenda };
}

const NO_ENCONTRADO = Object.assign(new Error('NO_ENCONTRADO'), { code: 'PT404', details: null, hint: null });

describe('Agenda de un profesor: nombre y enlace (AGE-09, SEC-16)', () => {
  it('AGE_09_el_titulo_lleva_el_nombre_del_profesor_y_la_agenda_se_ve_para_el_visitante', async () => {
    await fijarSesion(null);
    const { container, obtenerAgenda } = montar(ACTIVA);
    expect(await screen.findByRole('heading', { level: 1, name: 'Agenda de Ana Pérez' })).toBeTruthy();
    expect(await screen.findByRole('list', { name: 'Huecos del día' })).toBeTruthy();
    expect(obtenerAgenda).toHaveBeenCalledWith('ana-perez', '2026-11-02');
    await sinViolacionesAxe(container);
  });

  it('SEC_16_el_nombre_del_profesor_se_muestra_como_texto_nunca_como_HTML', async () => {
    await fijarSesion(null);
    const nombre = '<img src=x onerror="alert(1)"><b>Ana</b>';
    const { container } = montar({ ...ACTIVA, nombre } as ConfigPublica);
    expect(await screen.findByRole('heading', { level: 1, name: `Agenda de ${nombre}` })).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });

  it('AGE_09_un_enlace_que_no_es_de_ningun_profesor_dice_Enlace_no_valido_sin_listar_profesores', async () => {
    await fijarSesion(null);
    const { container, obtenerAgenda } = montar(NO_ENCONTRADO);
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Enlace no válido, pedile el enlace a tu profesor' }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Agenda' })).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByLabelText('Elegir día')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    // NFR-04 (CA-36): el día sale en paralelo con la configuración y su respuesta se descarta sin mostrarse.
    expect(obtenerAgenda).toHaveBeenCalledTimes(1);
    await sinViolacionesAxe(container);
  });
});

describe('Agenda de un profesor inactivo (AGE-11)', () => {
  it('AGE_11_dice_que_no_toma_reservas_por_ahora_y_no_muestra_la_agenda', async () => {
    await fijarSesion(null);
    const pedirAcceso = vi.fn(() => <p>Pedir acceso</p>);
    const { container, obtenerAgenda } = montar(INACTIVA, pedirAcceso);
    const aviso = (await screen.findByText('Ana Pérez no toma reservas por ahora')).closest('[role="status"]');
    expect(aviso).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Agenda de Ana Pérez' })).toBeTruthy();
    expect(screen.queryByLabelText('Elegir día')).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Ir a Mis clases' })).toBeNull();
    // NFR-04 (CA-36): el día sale en paralelo con la configuración y su respuesta se descarta sin mostrarse.
    expect(obtenerAgenda).toHaveBeenCalledTimes(1);
    expect(pedirAcceso).not.toHaveBeenCalled();
    await sinViolacionesAxe(container);
  });

  it('AGE_11_nadie_puede_pedirle_acceso_aunque_tenga_la_ficha_completa_y_no_tenga_vinculo', async () => {
    await fijarSesion(persona([inscripcion('beto-gomez', 'aprobado')]));
    const pedirAcceso = vi.fn(() => <p>Pedir acceso</p>);
    montar(INACTIVA, pedirAcceso);
    await screen.findByText(/no toma reservas por ahora/);
    expect(pedirAcceso).not.toHaveBeenCalled();
  });

  it('AGE_11_quien_tiene_el_vinculo_aprobado_ve_que_sus_clases_confirmadas_siguen_en_Mis_clases', async () => {
    await fijarSesion(persona([inscripcion('ana-perez', 'aprobado', { profesor_activo: false })]));
    const { container } = montar(INACTIVA);
    expect(await screen.findByText(/Tus clases ya confirmadas siguen en Mis clases/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir a Mis clases' }).getAttribute('href')).toBe('#/mis-clases');
    await sinViolacionesAxe(container);
  });
});

describe('Agenda de un profesor: el vínculo de quien mira con ESE profesor (WEB-01, ALU-03, DEC-28)', () => {
  it('WEB_01_vinculo_pendiente_muestra_su_estado_y_deja_ver_la_agenda_sin_pedir_acceso', async () => {
    await fijarSesion(persona([inscripcion('ana-perez', 'pendiente')]));
    const pedirAcceso = vi.fn(() => <p>Pedir acceso</p>);
    const { container } = montar(ACTIVA, pedirAcceso);
    const aviso = await screen.findByText(/Pediste acceso a Ana Pérez/);
    expect(aviso.closest('[role="status"]')?.textContent).toContain('Acceso pendiente');
    expect(await screen.findByRole('list', { name: 'Huecos del día' })).toBeTruthy();
    expect(pedirAcceso).not.toHaveBeenCalled();
    await sinViolacionesAxe(container);
  });

  it('WEB_01_vinculo_rechazado_muestra_el_estado_y_el_motivo_como_texto_y_no_deja_pedir', async () => {
    const motivo = 'No tengo lugar <b>este</b> trimestre.';
    await fijarSesion(persona([inscripcion('ana-perez', 'rechazado', { motivo_rechazo: motivo })]));
    const pedirAcceso = vi.fn(() => <p>Pedir acceso</p>);
    const { container } = montar(ACTIVA, pedirAcceso);
    expect(await screen.findByText(/Ana Pérez no aprobó tu acceso/)).toBeTruthy();
    expect(screen.getByText('Motivo:')).toBeTruthy();
    expect(screen.getByText(motivo)).toBeTruthy();
    expect(container.querySelector('b')).toBeNull();
    expect(pedirAcceso).not.toHaveBeenCalled();
    await sinViolacionesAxe(container);
  });

  it('WEB_01_vinculo_rechazado_sin_motivo_muestra_solo_el_estado', async () => {
    await fijarSesion(persona([inscripcion('ana-perez', 'rechazado', { motivo_rechazo: '  ' })]));
    montar(ACTIVA);
    await screen.findByText(/Ana Pérez no aprobó tu acceso/);
    expect(screen.queryByText('Motivo:')).toBeNull();
  });

  it('WEB_01_vinculo_aprobado_no_muestra_avisos_de_estado', async () => {
    await fijarSesion(persona([inscripcion('ana-perez', 'aprobado')]));
    montar(ACTIVA);
    await screen.findByRole('list', { name: 'Huecos del día' });
    expect(screen.queryByText('Acceso pendiente')).toBeNull();
    expect(screen.queryByText('Acceso no aprobado')).toBeNull();
  });

  it('DEC_28_aprobada_con_otro_profesor_no_alcanza_con_este_y_puede_pedirle_acceso', async () => {
    await fijarSesion(persona([inscripcion('beto-gomez', 'aprobado')]));
    const pedirAcceso = vi.fn((slug: string) => <p>Pedir acceso a {slug}</p>);
    montar(ACTIVA, pedirAcceso);
    expect(await screen.findByText('Pedir acceso a ana-perez')).toBeTruthy();
  });

  it('WEB_01_con_la_ficha_incompleta_invita_a_completarla_con_un_enlace_a_la_ficha', async () => {
    await fijarSesion(persona([], 'ficha_incompleta'));
    const pedirAcceso = vi.fn(() => <p>Pedir acceso</p>);
    const { container } = montar(ACTIVA, pedirAcceso);
    expect((await screen.findByText(/primero completá tu ficha/)).closest('[role="status"]')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Completar la ficha' }).getAttribute('href')).toBe('#/ficha');
    expect(pedirAcceso).not.toHaveBeenCalled();
    await sinViolacionesAxe(container);
  });

  it.each([
    ['el visitante', null],
    ['el profesor', profesor('ana-perez')],
    ['otro profesor', profesor('beto-gomez')],
    ['el Administrador', ADMINISTRADOR],
  ] satisfies [string, SesionActual | null][])('WEB_01_%s_no_ve_avisos_ni_Pedir_acceso', async (_quien, sesion) => {
    await fijarSesion(sesion);
    const pedirAcceso = vi.fn(() => <p>Pedir acceso</p>);
    montar(ACTIVA, pedirAcceso);
    await screen.findByRole('list', { name: 'Huecos del día' });
    expect(pedirAcceso).not.toHaveBeenCalled();
    expect(screen.queryByText('Acceso pendiente')).toBeNull();
    expect(screen.queryByText('Completá tu ficha')).toBeNull();
  });
});

describe('Agenda de un profesor: «Pedir acceso» compuesto por la ruta (ALU-14)', () => {
  it('ALU_14_la_persona_con_la_ficha_completa_y_sin_vinculo_ve_Pedir_acceso_arriba_de_la_agenda', async () => {
    await fijarSesion(persona([]));
    const pedirAcceso = vi.fn((slug: string) => <p>Pedir acceso a {slug}</p>);
    montar(ACTIVA, pedirAcceso);
    const pedir = await screen.findByText('Pedir acceso a ana-perez');
    const lista = await screen.findByRole('list', { name: 'Huecos del día' });
    expect(pedir.compareDocumentPosition(lista) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('ALU_14_sin_la_composicion_de_la_ruta_la_agenda_no_muestra_Pedir_acceso', async () => {
    await fijarSesion(persona([]));
    montar(ACTIVA);
    await screen.findByRole('list', { name: 'Huecos del día' });
    expect(screen.queryByText(/Pedir acceso/)).toBeNull();
  });

  it('ALU_14_al_pedir_acceso_el_formulario_desaparece_y_el_foco_pasa_al_estado_pendiente', async () => {
    const sesion = await fijarSesion(persona([]));
    montar(ACTIVA, () => <button type="button">Pedir acceso</button>);
    const boton = await screen.findByRole('button', { name: 'Pedir acceso' });
    boton.focus();
    await sesion.cambiar(persona([inscripcion('ana-perez', 'pendiente')]));
    const aviso = (await screen.findByText(/Pediste acceso a Ana Pérez/)).closest<HTMLElement>('[tabindex="-1"]');
    expect(screen.queryByRole('button', { name: 'Pedir acceso' })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(aviso));
  });
});
