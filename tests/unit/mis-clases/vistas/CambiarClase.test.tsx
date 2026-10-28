// @vitest-environment jsdom
// Mover y avisar que no voy desde Mis clases (T08.2): SOL-02, SOL-03, SOL-10, AGE-11, WEB-05; CA-13, CA-22, CA-23,
// CA-24, CA-41, CA-63; RES-07, SEC-17. Usa el hook real `useCambioDeClase` con un cliente falso: lo que el alumno ve
// es lo que la lógica traduce de la respuesta de la base.
import type { SupabaseClient } from '@supabase/supabase-js';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reiniciarConfigPublica, type ConfigPublica, type Hueco } from '../../../../src/modulos/agenda/logica';
import { MENSAJES_CAMBIOS, type ClaseMia, type EstadoMisClases } from '../../../../src/modulos/mis-clases/logica';
import { useCambioDeClase } from '../../../../src/modulos/mis-clases/logica/useCambioDeClase';
import { MENSAJES_CAMBIAR } from '../../../../src/modulos/mis-clases/vistas/CambiarClase';
import { marcaDeSolicitud, MENSAJES_TARJETA } from '../../../../src/modulos/mis-clases/vistas/TarjetaClase';
import { VistaMisClases } from '../../../../src/modulos/mis-clases/vistas/VistaMisClases';
import { mensajePendientesSol10 } from '../../../../src/lib/errores';
import { sinViolacionesAxe } from '../../ui/soporte';
import { clase, conSesion, LISTO } from './soporte';

const AHORA = new Date('2026-10-30T12:00:00Z');
const CONFIG: ConfigPublica = {
  profesor_id: 'pa',
  nombre: 'Profe Ana',
  activo: true,
  zona_horaria: 'America/Montevideo',
  duracion_min: 60,
  anticipacion_horas: 24,
  horizonte_semanas: 8,
};
const LIBRE: Hueco = { inicio: '2026-11-02T15:00:00Z', fin: '2026-11-02T16:00:00Z', estado: 'libre' };
const HUECOS: Hueco[] = [
  LIBRE,
  { inicio: '2026-11-02T16:00:00Z', fin: '2026-11-02T17:00:00Z', estado: 'ocupado' },
  { inicio: '2026-11-02T17:00:00Z', fin: '2026-11-02T18:00:00Z', estado: 'bloqueado' },
];
const SERIE = clase({ reserva_tipo: 'serie', frecuencia: 1 });

type Respuesta = { data: unknown; error: unknown };
const err = (message: string, details: string | null = null) => ({ message, details, code: 'P0001' });

beforeEach(reiniciarConfigPublica);
afterEach(() => {
  cleanup();
  reiniciarConfigPublica();
});

type Opciones = {
  clases?: ClaseMia[];
  respuesta?: Respuesta;
  config?: ConfigPublica;
  huecos?: Hueco[];
};

function montar({
  clases = [clase()],
  respuesta = { data: { solicitud_id: 's9' }, error: null },
  config = CONFIG,
  huecos = HUECOS,
}: Opciones = {}) {
  const rpc = vi.fn(async () => respuesta);
  const deps = { obtenerCliente: async () => ({ rpc }) as unknown as SupabaseClient };
  const obtenerConfig = vi.fn(async () => config);
  const obtenerAgenda = vi.fn(async () => huecos);
  const onRecargar = vi.fn();
  function Arnes({ datos }: { datos: EstadoMisClases }) {
    const cambio = useCambioDeClase(deps);
    return (
      <VistaMisClases
        estado={conSesion()}
        datos={datos}
        onRecargar={onRecargar}
        onReintentarSesion={vi.fn()}
        cambio={cambio}
        obtenerConfig={obtenerConfig}
        obtenerAgenda={obtenerAgenda}
        ahora={AHORA}
      />
    );
  }
  const r = render(<Arnes datos={LISTO(clases)} />);
  const recargarCon = (nuevas: ClaseMia[]) => r.rerender(<Arnes datos={LISTO(nuevas)} />);
  // El hook real conserva las clases mientras recarga: estado «cargando» con las mismas clases (H-364).
  const recargandoCon = (previas: ClaseMia[]) =>
    r.rerender(<Arnes datos={{ estado: 'cargando', clases: previas, error: null }} />);
  return { ...r, rpc, obtenerConfig, obtenerAgenda, onRecargar, recargarCon, recargandoCon };
}

const tarjeta = () => screen.getByRole('article', { name: /2 de noviembre/ });
const abrirMover = () => userEvent.click(within(tarjeta()).getByRole('button', { name: 'Mover' }));
const abrirAvisar = () => userEvent.click(within(tarjeta()).getByRole('button', { name: 'Avisar que no voy' }));
const dialogo = (nombre: string) => screen.findByRole('dialog', { name: nombre });

async function elegirHuecoYPedir() {
  await abrirMover();
  const d = await dialogo(MENSAJES_CAMBIAR.tituloMover);
  await userEvent.click(await within(d).findByRole('button', { name: /12:00 a 13:00/ }));
  await userEvent.click(within(d).getByRole('button', { name: MENSAJES_CAMBIAR.pedirCambio }));
  return d;
}

describe('acciones en la tarjeta (SOL-02, SOL-03, F-06 paso 2)', () => {
  it('SOL_02_SOL_03_una_clase_confirmada_futura_ofrece_mover_y_avisar_que_no_voy', () => {
    montar();
    const acciones = within(tarjeta()).getByRole('group', { name: 'Acciones de la clase' });
    expect(within(acciones).getByRole('button', { name: 'Mover' })).toBeTruthy();
    expect(within(acciones).getByRole('button', { name: 'Avisar que no voy' })).toBeTruthy();
  });

  it('SOL_02_pendiente_pasada_cancelada_y_con_solicitud_pendiente_no_ofrecen_acciones', () => {
    const pendiente = { id: 's1', tipo: 'movimiento', alcance: 'solo_esta', vencida: false } as const;
    const vencida = { ...pendiente, vencida: true };
    montar({
      clases: [
        clase({ id: 'a', estado: 'pendiente', inicio: '2026-11-04T13:00:00Z', fin: '2026-11-04T14:00:00Z' }),
        clase({ id: 'b', estado: 'cancelada', inicio: '2026-11-05T13:00:00Z', fin: '2026-11-05T14:00:00Z' }),
        clase({ id: 'c', solicitud_pendiente: pendiente, inicio: '2026-11-06T13:00:00Z', fin: '2026-11-06T14:00:00Z' }),
        clase({ id: 'd', pasada: true, inicio: '2026-11-07T13:00:00Z', fin: '2026-11-07T14:00:00Z' }),
        clase({ id: 'e', solicitud_pendiente: vencida, inicio: '2026-11-08T13:00:00Z', fin: '2026-11-08T14:00:00Z' }),
      ],
    });
    // Solo la clase con la solicitud vencida (e) sigue pudiendo pedirse otra.
    expect(screen.getAllByRole('button', { name: 'Mover' })).toHaveLength(1);
    expect(within(screen.getByRole('article', { name: /8 de noviembre/ })).getByRole('button', { name: 'Mover' })).toBeTruthy();
  });

  it('SOL_02_SOL_03_la_marca_dice_movimiento_o_cancelacion_pendiente_y_la_clase_sigue_confirmada', () => {
    const mov = clase({ id: 'm', solicitud_pendiente: { id: 's1', tipo: 'movimiento', alcance: 'solo_esta', vencida: false } });
    const can = clase({
      id: 'k',
      inicio: '2026-11-04T13:00:00Z',
      fin: '2026-11-04T14:00:00Z',
      solicitud_pendiente: { id: 's2', tipo: 'cancelacion', alcance: 'desde_aca', vencida: false },
    });
    montar({ clases: [mov, can] });
    const a = screen.getByRole('article', { name: /2 de noviembre/ });
    const b = screen.getByRole('article', { name: /4 de noviembre/ });
    expect(a.textContent).toContain('Confirmada');
    expect(a.textContent).toContain('Movimiento pendiente');
    expect(b.textContent).toContain('Confirmada');
    expect(b.textContent).toContain('Cancelación pendiente');
    expect(within(a).queryByRole('button', { name: 'Mover' })).toBeNull();
    expect(marcaDeSolicitud(clase())).toBeNull();
    expect(marcaDeSolicitud(mov)).toBe(MENSAJES_TARJETA.marcaMovimiento);
  });
});

describe('avisar que no voy (SOL-03, CA-23)', () => {
  it('SOL_03_en_una_clase_suelta_no_pide_alcance_y_envia_solo_esta', async () => {
    const { rpc, onRecargar } = montar();
    await abrirAvisar();
    const d = await dialogo(MENSAJES_CAMBIAR.tituloAvisar);
    expect(within(d).queryByRole('radiogroup')).toBeNull();
    await userEvent.click(within(d).getByRole('button', { name: MENSAJES_CAMBIAR.enviarAviso }));
    await waitFor(() => expect(onRecargar).toHaveBeenCalledOnce());
    expect(rpc).toHaveBeenCalledWith('solicitar_cancelacion', { p_clase_id: 'c1', p_alcance: 'solo_esta' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(tarjeta().textContent).toContain(MENSAJES_CAMBIOS.cancelacionPedida);
  });

  it('SOL_03_CA_24_en_una_serie_pide_el_alcance_con_solo_esta_clase_por_defecto', async () => {
    const { rpc } = montar({ clases: [SERIE] });
    await abrirAvisar();
    const d = await dialogo(MENSAJES_CAMBIAR.tituloAvisar);
    const grupo = within(d).getByRole('radiogroup', { name: MENSAJES_CAMBIAR.alcance });
    const solo = within(grupo).getByRole('radio', { name: 'Solo esta clase' });
    const desde = within(grupo).getByRole('radio', { name: 'De acá en adelante' });
    expect((solo as HTMLInputElement).checked).toBe(true);
    await userEvent.click(desde);
    expect((desde as HTMLInputElement).checked).toBe(true);
    await userEvent.click(within(d).getByRole('button', { name: MENSAJES_CAMBIAR.enviarAviso }));
    await waitFor(() => expect(rpc).toHaveBeenCalledOnce());
    expect(rpc).toHaveBeenCalledWith('solicitar_cancelacion', { p_clase_id: 'c1', p_alcance: 'desde_aca' });
  });

  it('SOL_03_volver_cierra_sin_enviar_y_el_foco_regresa_al_boton', async () => {
    const { rpc } = montar();
    await abrirAvisar();
    const d = await dialogo(MENSAJES_CAMBIAR.tituloAvisar);
    await userEvent.click(within(d).getByRole('button', { name: MENSAJES_CAMBIAR.volver }));
    expect(rpc).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(document.activeElement).toBe(within(tarjeta()).getByRole('button', { name: 'Avisar que no voy' })),
    );
  });

  it('SOL_03_tras_recargar_la_clase_muestra_la_marca_y_el_foco_pasa_al_aviso_del_pedido', async () => {
    const { recargarCon } = montar();
    await abrirAvisar();
    const d = await dialogo(MENSAJES_CAMBIAR.tituloAvisar);
    await userEvent.click(within(d).getByRole('button', { name: MENSAJES_CAMBIAR.enviarAviso }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    recargarCon([clase({ solicitud_pendiente: { id: 's9', tipo: 'cancelacion', alcance: 'solo_esta', vencida: false } })]);
    expect(tarjeta().textContent).toContain('Cancelación pendiente');
    expect(tarjeta().textContent).toContain('Confirmada');
    await waitFor(() => expect(document.activeElement?.textContent).toContain(MENSAJES_TARJETA.tituloPedido));
  });

  it('SOL_02_SOL_03_WEB_05_H_364_el_aviso_Pedido_enviado_sobrevive_a_la_recarga_que_pasa_por_cargando', async () => {
    const { recargandoCon, recargarCon } = montar({ clases: [SERIE] });
    await abrirAvisar();
    const d = await dialogo(MENSAJES_CAMBIAR.tituloAvisar);
    await userEvent.click(within(d).getByRole('button', { name: MENSAJES_CAMBIAR.enviarAviso }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // La vista llama a recargar(): los datos pasan a «cargando» con las clases anteriores y después a «listo».
    recargandoCon([SERIE]);
    expect(within(tarjeta()).getByRole('status').textContent).toContain(MENSAJES_TARJETA.tituloPedido);
    recargarCon([
      { ...SERIE, solicitud_pendiente: { id: 's9', tipo: 'cancelacion', alcance: 'solo_esta', vencida: false } },
    ]);
    const aviso = within(tarjeta()).getByRole('status');
    expect(aviso.textContent).toContain(MENSAJES_TARJETA.tituloPedido);
    expect(aviso.textContent).toContain(MENSAJES_CAMBIOS.cancelacionPedida);
    await waitFor(() => expect(aviso.parentElement).toBe(document.activeElement));
  });
});

describe('mover (SOL-02, CA-22, RES-07)', () => {
  it('SOL_02_elige_el_hueco_en_la_agenda_del_mismo_profesor_y_envia_el_destino', async () => {
    const { rpc, obtenerAgenda, obtenerConfig } = montar();
    await abrirMover();
    const d = await dialogo(MENSAJES_CAMBIAR.tituloMover);
    await within(d).findByRole('button', { name: /12:00 a 13:00/ });
    expect(obtenerConfig).toHaveBeenCalledWith('ana');
    expect(obtenerAgenda).toHaveBeenCalledWith('ana', '2026-11-02');
    expect(d.textContent).toContain('Horarios en el huso America/Montevideo.');
    // Solo el hueco libre es un botón; el ocupado y el bloqueado no se pueden elegir.
    expect(within(d).getAllByRole('button', { name: /\d\d:\d\d a \d\d:\d\d/ })).toHaveLength(1);
    expect(within(d).queryByRole('radiogroup')).toBeNull();
    await userEvent.click(within(d).getByRole('button', { name: /12:00 a 13:00/ }));
    expect(within(d).getByText(/Horario elegido: .*12:00 a 13:00/)).toBeTruthy();
    await userEvent.click(within(d).getByRole('button', { name: MENSAJES_CAMBIAR.pedirCambio }));
    await waitFor(() => expect(rpc).toHaveBeenCalledOnce());
    expect(rpc).toHaveBeenCalledWith('solicitar_movimiento', {
      p_clase_id: 'c1',
      p_destino: LIBRE.inicio,
      p_alcance: 'solo_esta',
    });
  });

  it('SOL_02_CA_24_en_una_serie_pide_alcance_y_muestra_las_fechas_salteadas_que_devuelve_la_logica', async () => {
    const { rpc, onRecargar } = montar({
      clases: [SERIE],
      respuesta: {
        data: { solicitud_id: 's9', fechas: [LIBRE.inicio], salteadas: ['2026-11-17T13:00:00Z', '2026-12-01T13:00:00Z'] },
        error: null,
      },
    });
    await abrirMover();
    const d = await dialogo(MENSAJES_CAMBIAR.tituloMover);
    const solo = within(d).getByRole('radio', { name: 'Solo esta clase' });
    expect((solo as HTMLInputElement).checked).toBe(true);
    await userEvent.click(within(d).getByRole('radio', { name: 'De acá en adelante' }));
    await userEvent.click(await within(d).findByRole('button', { name: /12:00 a 13:00/ }));
    await userEvent.click(within(d).getByRole('button', { name: MENSAJES_CAMBIAR.pedirCambio }));
    await waitFor(() => expect(onRecargar).toHaveBeenCalledOnce());
    expect(rpc).toHaveBeenCalledWith('solicitar_movimiento', {
      p_clase_id: 'c1',
      p_destino: LIBRE.inicio,
      p_alcance: 'desde_aca',
    });
    const aviso = within(tarjeta()).getByText(MENSAJES_TARJETA.tituloPedido).closest('[role="status"]');
    if (!(aviso instanceof HTMLElement)) throw new Error('falta el aviso del pedido');
    expect(aviso.textContent).toContain(MENSAJES_CAMBIOS.movimientoPedido);
    expect(aviso.textContent).toContain(MENSAJES_TARJETA.salteadas);
    const fechas = within(aviso)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(fechas).toHaveLength(2);
    expect(fechas[0]).toMatch(/17 de noviembre.*10:00/);
    expect(fechas[1]).toMatch(/1 de diciembre.*10:00/);
  });

  it('SOL_02_sin_elegir_hueco_no_envia_y_dice_que_hay_que_elegir_el_horario_nuevo', async () => {
    const { rpc } = montar();
    await abrirMover();
    const d = await dialogo(MENSAJES_CAMBIAR.tituloMover);
    await within(d).findByRole('button', { name: /12:00 a 13:00/ });
    await userEvent.click(within(d).getByRole('button', { name: MENSAJES_CAMBIAR.pedirCambio }));
    const alerta = await within(d).findByRole('alert');
    expect(alerta.textContent).toContain(MENSAJES_CAMBIOS.sinDestino);
    expect(rpc).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(alerta.parentElement));
  });

  it('AGE_11_CA_63_con_el_profesor_inactivo_dice_que_no_toma_reservas_y_no_ofrece_huecos', async () => {
    const { rpc, obtenerAgenda } = montar({ config: { profesor_id: 'pa', nombre: 'Profe Ana', activo: false } });
    await abrirMover();
    const d = await dialogo(MENSAJES_CAMBIAR.tituloMover);
    expect(await within(d).findByText(MENSAJES_CAMBIOS.profesorInactivo)).toBeTruthy();
    expect(obtenerAgenda).not.toHaveBeenCalled();
    const pedir = within(d).getByRole('button', { name: MENSAJES_CAMBIAR.pedirCambio });
    expect(pedir.hasAttribute('disabled')).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('RES_07_la_clase_sin_agenda_de_profesor_no_deja_elegir_destino', async () => {
    montar({ clases: [clase({ profesor_slug: null })] });
    await abrirMover();
    const d = await dialogo(MENSAJES_CAMBIAR.tituloMover);
    expect(d.textContent).toContain(MENSAJES_CAMBIAR.sinAgenda);
    expect(within(d).getByRole('button', { name: MENSAJES_CAMBIAR.pedirCambio }).hasAttribute('disabled')).toBe(true);
  });

  it('WEB_05_si_fallan_los_huecos_ofrece_reintentar', async () => {
    const { obtenerAgenda } = montar();
    obtenerAgenda.mockRejectedValueOnce(new Error('Failed to fetch'));
    await abrirMover();
    const d = await dialogo(MENSAJES_CAMBIAR.tituloMover);
    expect(await within(d).findByText(/No se pudo cargar la agenda/)).toBeTruthy();
    await userEvent.click(within(d).getByRole('button', { name: 'Reintentar' }));
    expect(await within(d).findByRole('button', { name: /12:00 a 13:00/ })).toBeTruthy();
  });

  it('WEB_05_un_dia_sin_huecos_dice_que_no_hay_huecos', async () => {
    montar({ huecos: [] });
    await abrirMover();
    const d = await dialogo(MENSAJES_CAMBIAR.tituloMover);
    expect(await within(d).findByRole('heading', { name: MENSAJES_CAMBIAR.sinHuecos })).toBeTruthy();
  });
});

describe('errores enfocados y anunciados (SOL-10, AGE-11, CA-13, CA-41, RES-07, SEC-17)', () => {
  const casos: Array<{ nombre: string; modo: 'mover' | 'avisar'; error: ReturnType<typeof err>; texto: string | RegExp }> = [
    {
      nombre: 'SOL_10_CA_41_limite_excedido_en_mover_dice_el_limite_de_10',
      modo: 'mover',
      error: err('LIMITE_EXCEDIDO', '{"tope":"pendientes","limite":10}'),
      texto: mensajePendientesSol10(10),
    },
    {
      nombre: 'SOL_10_CA_41_limite_excedido_en_avisar_dice_el_limite_de_10',
      modo: 'avisar',
      error: err('LIMITE_EXCEDIDO', '{"tope":"pendientes","limite":10}'),
      texto: /Ya tenés 10 solicitudes pendientes/,
    },
    {
      nombre: 'AGE_11_CA_63_profesor_inactivo_en_avisar',
      modo: 'avisar',
      error: err('PROFESOR_INACTIVO'),
      texto: MENSAJES_CAMBIOS.profesorInactivo,
    },
    {
      nombre: 'AGE_11_CA_63_profesor_inactivo_en_mover',
      modo: 'mover',
      error: err('PROFESOR_INACTIVO'),
      texto: MENSAJES_CAMBIOS.profesorInactivo,
    },
    {
      nombre: 'CA_13_anticipacion_insuficiente_dice_las_horas_en_avisar',
      modo: 'avisar',
      error: err('ANTICIPACION_INSUFICIENTE', '{"horas_minimas":24,"inicio":"2026-11-02T13:00:00+00:00"}'),
      texto: /24 horas de anticipación/,
    },
    {
      nombre: 'CA_13_anticipacion_insuficiente_dice_las_horas_en_mover',
      modo: 'mover',
      error: err('ANTICIPACION_INSUFICIENTE', '{"horas_minimas":24,"inicio":"2026-11-02T15:00:00+00:00"}'),
      texto: /24 horas de anticipación/,
    },
  ];

  it.each(casos)('$nombre', async ({ modo, error, texto }) => {
    const { rpc, onRecargar } = montar({ respuesta: { data: null, error } });
    let d: HTMLElement;
    if (modo === 'mover') {
      d = await elegirHuecoYPedir();
    } else {
      await abrirAvisar();
      d = await dialogo(MENSAJES_CAMBIAR.tituloAvisar);
      await userEvent.click(within(d).getByRole('button', { name: MENSAJES_CAMBIAR.enviarAviso }));
    }
    const alerta = await within(d).findByRole('alert');
    expect(alerta.textContent).toContain(MENSAJES_CAMBIAR.tituloError);
    expect(alerta.textContent).toMatch(texto);
    await waitFor(() => expect(document.activeElement).toBe(alerta.parentElement));
    if (modo === 'mover') {
      // Sigue abierto con el mismo hueco elegido: se puede corregir o volver (F-06 paso 3).
      expect(within(d).getByText(/Horario elegido/)).toBeTruthy();
    }
    expect(rpc).toHaveBeenCalledOnce();
    expect(onRecargar).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
    // El botón sigue activo: el error explica el motivo (F-06 paso 3).
    const enviar = within(d).getByRole('button', {
      name: modo === 'mover' ? MENSAJES_CAMBIAR.pedirCambio : MENSAJES_CAMBIAR.enviarAviso,
    });
    expect(enviar.hasAttribute('disabled')).toBe(false);
  });

  it.each([
    ['RES_07_fuera_de_grilla', err('FUERA_DE_GRILLA'), 'Ese horario no está en la grilla de clases.'],
    [
      'SOL_02_hueco_no_libre',
      err('HUECO_NO_LIBRE', '{"inicio":"2026-11-02T15:00:00+00:00"}'),
      'Ese horario ya no está libre. Elegí otro.',
    ],
  ])('%s_enfoca_el_error_borra_el_hueco_y_vuelve_a_leer_el_dia', async (_nombre, error, texto) => {
    const { obtenerAgenda } = montar({ respuesta: { data: null, error } });
    const d = await elegirHuecoYPedir();
    const alerta = await within(d).findByRole('alert');
    expect(alerta.textContent).toContain(texto);
    await waitFor(() => expect(document.activeElement).toBe(alerta.parentElement));
    await waitFor(() => expect(obtenerAgenda).toHaveBeenCalledTimes(2));
    expect(within(d).queryByText(/Horario elegido/)).toBeNull();
    expect(await within(d).findByRole('button', { name: /12:00 a 13:00/ })).toBeTruthy();
  });

  it('SEC_17_un_error_desconocido_no_muestra_el_texto_de_la_base', async () => {
    montar({
      respuesta: { data: null, error: { message: 'relation "clase" does not exist', details: 'tabla secreta', code: '42P01' } },
    });
    await abrirAvisar();
    const d = await dialogo(MENSAJES_CAMBIAR.tituloAvisar);
    await userEvent.click(within(d).getByRole('button', { name: MENSAJES_CAMBIAR.enviarAviso }));
    const alerta = await within(d).findByRole('alert');
    expect(alerta.textContent).not.toContain('relation');
    expect(alerta.textContent).not.toContain('secreta');
  });
});

describe('accesibilidad (axe)', () => {
  it('A11Y_la_lista_con_acciones_no_tiene_violaciones', async () => {
    const { container } = montar({ clases: [SERIE] });
    await sinViolacionesAxe(container);
  });

  it('A11Y_el_dialogo_de_mover_con_alcance_y_agenda_no_tiene_violaciones', async () => {
    montar({ clases: [SERIE] });
    await abrirMover();
    const d = await dialogo(MENSAJES_CAMBIAR.tituloMover);
    await within(d).findByRole('button', { name: /12:00 a 13:00/ });
    await sinViolacionesAxe(d);
  });

  it('A11Y_el_dialogo_de_avisar_con_un_error_no_tiene_violaciones', async () => {
    montar({
      clases: [SERIE],
      respuesta: { data: null, error: err('LIMITE_EXCEDIDO', '{"tope":"pendientes","limite":10}') },
    });
    await abrirAvisar();
    const d = await dialogo(MENSAJES_CAMBIAR.tituloAvisar);
    await userEvent.click(within(d).getByRole('button', { name: MENSAJES_CAMBIAR.enviarAviso }));
    await within(d).findByRole('alert');
    await sinViolacionesAxe(d);
  });
});
