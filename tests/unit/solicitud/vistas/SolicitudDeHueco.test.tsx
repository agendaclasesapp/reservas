// @vitest-environment jsdom
// Pruebas de componente del pedido de una clase desde un hueco libre (B06 · T06.2): WEB-01, WEB-04, SOL-01, SOL-10,
// RES-03, RES-05, AGE-11, CA-03, CA-05, CA-19, CA-41, CA-63. Los hooks de `logica/` son los reales; lo único
// simulado es el cliente de la base (rpc y la lectura de personas a cargo).
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SolicitudDeHueco, { type SolicitudDeHuecoProps } from '../../../../src/modulos/solicitud/vistas/SolicitudDeHueco';
import { inscripcion, persona } from '../../estado/soporte';
import { fijarSesion, restaurarSesion } from '../../ui/sesion';
import { sinViolacionesAxe } from '../../ui/soporte';

type RespuestaRpc = { data: unknown; error: { message: string; details?: string | null } | null };

const base = vi.hoisted(() => ({
  cargarSupabase: vi.fn(),
  rpc: vi.fn(),
  personas: vi.fn(),
}));
vi.mock('../../../../src/lib/supabase', () => ({ cargarSupabase: base.cargarSupabase }));

const HUECO = { inicio: '2026-11-02T11:00:00Z', fin: '2026-11-02T12:00:00Z' };
const PERSONAS_BD = [{ id: 'p-luca', nombre: 'Luca Gómez', fecha_nacimiento: '2016-05-01' }];
const SERIE = [
  { inicio: '2026-11-02T11:00:00Z', estado: 'reservable', motivo: null },
  { inicio: '2026-11-09T11:00:00Z', estado: 'salteada', motivo: 'bloqueado' },
  { inicio: '2026-11-16T11:00:00Z', estado: 'reservable', motivo: null },
];

function error(codigo: string, details?: object): RespuestaRpc {
  return { data: null, error: { message: codigo, details: details === undefined ? null : JSON.stringify(details) } };
}

beforeEach(async () => {
  base.rpc.mockReset();
  base.personas.mockReset();
  base.personas.mockResolvedValue({ data: PERSONAS_BD, error: null });
  base.cargarSupabase.mockReset();
  base.cargarSupabase.mockResolvedValue({
    rpc: base.rpc,
    from: (tabla: string) => ({
      select: () => ({ eq: () => ({ order: () => (tabla === 'persona_a_cargo' ? base.personas() : Promise.reject(new Error(tabla))) }) }),
    }),
  });
  await fijarSesion(persona([inscripcion('ana-perez', 'aprobado')]));
});

afterEach(() => {
  cleanup();
  restaurarSesion();
});

function montar(extra: Partial<SolicitudDeHuecoProps> = {}) {
  const onCerrar = vi.fn();
  const onCambioAgenda = vi.fn();
  const vista = render(
    <SolicitudDeHueco
      profesorId="id-ana-perez"
      profesorNombre="Ana Pérez"
      zona="America/Argentina/Buenos_Aires"
      hueco={HUECO}
      onCerrar={onCerrar}
      onCambioAgenda={onCambioAgenda}
      {...extra}
    />,
  );
  return { ...vista, onCerrar, onCambioAgenda };
}

const PEDIR = { name: 'Pedir clase' };

function llamadasA(nombre: string) {
  return base.rpc.mock.calls.filter(([n]) => n === nombre);
}

describe('Pedir una clase suelta (WEB-04, SOL-01, RES-03, RES-04)', () => {
  it('SOL_01_abre_un_dialogo_con_el_nombre_del_profesor_el_horario_y_las_personas_a_cargo', async () => {
    const { baseElement } = montar();
    const dialogo = await screen.findByRole('dialog', { name: 'Pedir clase a Ana Pérez' });
    expect(within(dialogo).getByText('lunes, 2 de noviembre, 08:00 a 09:00')).toBeTruthy();
    const grupo = await within(dialogo).findByRole('radiogroup', { name: '¿Quién toma la clase?' });
    expect(within(grupo).getAllByRole('radio').map((r) => r.parentElement?.textContent)).toEqual(['Yo', 'Luca Gómez']);
    expect(base.cargarSupabase).toHaveBeenCalled();
    await sinViolacionesAxe(baseElement);
  });

  it('CA_05_elige_a_la_persona_a_cargo_y_la_solicitud_se_manda_con_su_id_y_la_observacion', async () => {
    base.rpc.mockResolvedValueOnce({
      data: { solicitud_id: 's1', reserva_id: 'r1', fechas: [HUECO.inicio], salteadas: [] },
      error: null,
    });
    const { onCambioAgenda, onCerrar, baseElement } = montar();
    await userEvent.click(await screen.findByRole('radio', { name: 'Luca Gómez' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Observación/ }), 'Va con su hermana');
    await userEvent.click(screen.getByRole('button', PEDIR));

    const exito = await screen.findByRole('dialog', { name: 'Pedido enviado' });
    expect(base.rpc).toHaveBeenCalledTimes(1);
    expect(base.rpc).toHaveBeenCalledWith('solicitar_reserva', {
      p_profesor_id: 'id-ana-perez',
      p_inicio: HUECO.inicio,
      p_tipo: 'suelta',
      p_frecuencia: null,
      p_persona_a_cargo_id: 'p-luca',
      p_observacion: 'Va con su hermana',
    });
    expect(within(exito).getByRole('status').textContent).toContain(
      'Pediste la clase del lunes, 2 de noviembre, 08:00 a 09:00. Ana Pérez tiene que confirmarla; mientras tanto el horario queda ocupado.',
    );
    expect(within(exito).getByRole('link', { name: 'Ver Mis clases' }).getAttribute('href')).toBe('#/mis-clases');
    expect(onCambioAgenda).toHaveBeenCalledTimes(1);
    expect(onCerrar).not.toHaveBeenCalled();
    // Reemplaza al formulario: el foco pasa a la confirmación y se anuncia.
    await waitFor(() => expect(document.activeElement?.contains(within(exito).getByRole('status'))).toBe(true));
    expect(screen.queryByRole('button', PEDIR)).toBeNull();
    await sinViolacionesAxe(baseElement);
  });

  it('SOL_01_sin_personas_a_cargo_manda_al_titular_y_sin_observacion', async () => {
    base.personas.mockResolvedValue({ data: [], error: null });
    base.rpc.mockResolvedValueOnce({
      data: { solicitud_id: 's1', reserva_id: 'r1', fechas: [HUECO.inicio], salteadas: [] },
      error: null,
    });
    montar();
    await screen.findByText('vos.', { exact: false });
    await userEvent.click(screen.getByRole('button', PEDIR));
    await screen.findByRole('dialog', { name: 'Pedido enviado' });
    expect(base.rpc).toHaveBeenCalledWith(
      'solicitar_reserva',
      expect.objectContaining({ p_persona_a_cargo_id: null, p_observacion: null, p_tipo: 'suelta' }),
    );
  });

  it('SOL_01_un_doble_toque_en_pedir_clase_envia_una_sola_solicitud', async () => {
    let resolver!: (r: RespuestaRpc) => void;
    base.rpc.mockReturnValueOnce(new Promise<RespuestaRpc>((r) => (resolver = r)));
    montar();
    await screen.findByRole('radio', { name: 'Luca Gómez' });
    const boton = screen.getByRole('button', PEDIR);
    await userEvent.dblClick(boton);
    expect(await screen.findByRole('button', { name: 'Enviando…' })).toBeTruthy();
    expect(llamadasA('solicitar_reserva')).toHaveLength(1);
    resolver({ data: { solicitud_id: 's1', reserva_id: 'r1', fechas: [HUECO.inicio], salteadas: [] }, error: null });
    await screen.findByRole('dialog', { name: 'Pedido enviado' });
    expect(llamadasA('solicitar_reserva')).toHaveLength(1);
  });

  it('RES_03_si_no_cargan_las_personas_a_cargo_se_puede_reintentar_desde_el_formulario', async () => {
    base.personas.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } });
    montar();
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('No pudimos cargar tus personas a cargo.');
    expect(screen.getByRole<HTMLButtonElement>('button', PEDIR).disabled).toBe(true);
    await userEvent.click(within(alerta).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('radio', { name: 'Luca Gómez' })).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', PEDIR).disabled).toBe(false);
  });
});

describe('Pedir una serie (RES-02, RES-05, CA-19)', () => {
  it('CA_19_elegir_serie_muestra_las_salteadas_antes_de_enviar_y_el_pedido_va_con_la_frecuencia', async () => {
    base.rpc.mockImplementation(async (nombre: string) => {
      if (nombre === 'previsualizar_serie') return { data: SERIE, error: null };
      return {
        data: { solicitud_id: 's1', reserva_id: 'r1', fechas: [SERIE[0]?.inicio, SERIE[2]?.inicio], salteadas: [SERIE[1]?.inicio] },
        error: null,
      };
    });
    const { baseElement } = montar();
    await screen.findByRole('radio', { name: 'Luca Gómez' });
    expect(llamadasA('previsualizar_serie')).toHaveLength(0);

    await userEvent.click(screen.getByRole('radio', { name: 'Serie semanal' }));
    const lista = await screen.findByRole('list', { name: 'Fechas que se saltean' });
    expect(within(lista).getAllByRole('listitem').map((i) => i.textContent)).toEqual([
      'lunes, 9 de noviembre, 08:00 (bloqueada)',
    ]);
    expect(base.rpc).toHaveBeenCalledWith('previsualizar_serie', {
      p_profesor_id: 'id-ana-perez',
      p_inicio: HUECO.inicio,
      p_frecuencia: 1,
    });
    await sinViolacionesAxe(baseElement);

    await userEvent.click(screen.getByRole('radio', { name: 'Serie quincenal' }));
    await waitFor(() =>
      expect(base.rpc).toHaveBeenLastCalledWith('previsualizar_serie', expect.objectContaining({ p_frecuencia: 2 })),
    );
    await screen.findByRole('list', { name: 'Fechas que se saltean' });

    await userEvent.click(screen.getByRole('button', PEDIR));
    const exito = await screen.findByRole('dialog', { name: 'Pedido enviado' });
    expect(base.rpc).toHaveBeenLastCalledWith(
      'solicitar_reserva',
      expect.objectContaining({ p_tipo: 'serie', p_frecuencia: 2 }),
    );
    expect(within(exito).getByText(/Pediste la serie quincenal desde el/)).toBeTruthy();
    expect(within(exito).getByText('Quedaron pedidas 2 fechas; la serie sigue hasta que se cancele.')).toBeTruthy();
    expect(
      within(within(exito).getByRole('list', { name: 'Fechas que se saltearon' })).getAllByRole('listitem').map((i) => i.textContent),
    ).toEqual(['lunes, 9 de noviembre, 08:00']);
    await sinViolacionesAxe(baseElement);
  });

  it('RES_05_volver_a_clase_suelta_deja_de_calcular_las_fechas', async () => {
    base.rpc.mockResolvedValue({ data: SERIE, error: null });
    montar();
    await userEvent.click(await screen.findByRole('radio', { name: 'Serie semanal' }));
    await screen.findByRole('list', { name: 'Fechas que se saltean' });
    await userEvent.click(screen.getByRole('radio', { name: 'Clase suelta' }));
    expect(screen.queryByRole('list', { name: 'Fechas que se saltean' })).toBeNull();
    expect(screen.queryByText('No se saltea ninguna fecha.')).toBeNull();
  });

  it('RES_05_mientras_se_calcula_la_serie_no_se_puede_enviar', async () => {
    base.rpc.mockReturnValue(new Promise(() => undefined));
    montar();
    await userEvent.click(await screen.findByRole('radio', { name: 'Serie semanal' }));
    expect(await screen.findByText('Calculando las fechas que se saltean…')).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', PEDIR).disabled).toBe(true);
  });

  it('AGE_11_si_el_profesor_se_inactivo_al_calcular_la_serie_lo_dice', async () => {
    base.rpc.mockResolvedValue(error('PROFESOR_INACTIVO'));
    montar();
    await userEvent.click(await screen.findByRole('radio', { name: 'Serie semanal' }));
    const alerta = await screen.findByText('No pudimos calcular las fechas');
    expect(alerta.closest('[role="alert"]')?.textContent).toContain('El profesor no toma reservas por ahora');
  });
});

describe('Rechazos de la base (SOL-10, CA-41, AGE-11, CA-63, RES-01)', () => {
  it('CA_41_la_undecima_pendiente_dice_el_limite_y_no_cambia_la_agenda', async () => {
    base.rpc.mockResolvedValueOnce(error('LIMITE_EXCEDIDO', { tope: 'pendientes', limite: 10 }));
    const { onCambioAgenda, onCerrar, baseElement } = montar();
    await userEvent.click(await screen.findByRole('button', PEDIR));
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain(
      'Ya tenés 10 solicitudes pendientes, que es el máximo. Cuando el profesor responda alguna vas a poder pedir otra.',
    );
    expect(onCambioAgenda).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', PEDIR)).toBeNull();
    await sinViolacionesAxe(baseElement);
    await userEvent.click(within(alerta).getByRole('button', { name: 'Volver a la agenda' }));
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it('CA_63_con_el_profesor_inactivo_dice_que_no_toma_reservas_y_no_crea_nada', async () => {
    base.rpc.mockResolvedValueOnce(error('PROFESOR_INACTIVO'));
    const { onCambioAgenda, baseElement } = montar();
    await userEvent.click(await screen.findByRole('button', PEDIR));
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('Ana Pérez no toma reservas por ahora');
    expect(alerta.textContent).toContain('El profesor no toma reservas por ahora, así que no se puede hacer esto.');
    expect(onCambioAgenda).not.toHaveBeenCalled();
    await sinViolacionesAxe(baseElement);
  });

  it('RES_01_si_otro_alumno_se_llevo_el_hueco_lo_dice_y_la_agenda_se_relee', async () => {
    base.rpc.mockResolvedValueOnce(error('HUECO_NO_LIBRE', { inicio: HUECO.inicio }));
    const { onCambioAgenda } = montar();
    await userEvent.click(await screen.findByRole('button', PEDIR));
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('Ese horario ya no está libre. Elegí otro.');
    expect(onCambioAgenda).toHaveBeenCalledTimes(1);
  });

  it('CA_03_con_el_vinculo_no_aprobado_la_base_rechaza_y_se_dice_sin_crear_nada', async () => {
    base.rpc.mockResolvedValueOnce(error('CUENTA_NO_APROBADA', { estado: 'pendiente', profesor_id: 'id-ana-perez' }));
    const { onCambioAgenda } = montar();
    await userEvent.click(await screen.findByRole('button', PEDIR));
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('Tu cuenta no está aprobada, así que todavía no podés hacer solicitudes.');
    expect(onCambioAgenda).not.toHaveBeenCalled();
  });

  it('SOL_01_un_corte_de_red_deja_reintentar_y_el_segundo_intento_funciona', async () => {
    base.rpc
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ data: { solicitud_id: 's1', reserva_id: 'r1', fechas: [HUECO.inicio], salteadas: [] }, error: null });
    montar();
    await userEvent.click(await screen.findByRole('button', PEDIR));
    expect((await screen.findByRole('alert')).textContent).toContain('No hay conexión con el servidor.');
    await userEvent.click(screen.getByRole('button', PEDIR));
    expect(await screen.findByRole('dialog', { name: 'Pedido enviado' })).toBeTruthy();
    expect(llamadasA('solicitar_reserva')).toHaveLength(2);
  });
});

describe('Cerrar el diálogo (NFR-05)', () => {
  it('WEB_04_escape_y_cerrar_avisan_a_quien_lo_monta', async () => {
    const { onCerrar } = montar();
    await screen.findByRole('dialog', { name: 'Pedir clase a Ana Pérez' });
    await userEvent.keyboard('{Escape}');
    expect(onCerrar).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onCerrar).toHaveBeenCalledTimes(2);
  });

  it('SEC_16_el_nombre_del_profesor_se_muestra_como_texto', async () => {
    const { baseElement } = montar({ profesorNombre: '<img src=x onerror=alert(1)>' });
    expect(await screen.findByRole('dialog', { name: 'Pedir clase a <img src=x onerror=alert(1)>' })).toBeTruthy();
    expect(baseElement.querySelector('img')).toBeNull();
  });
});
