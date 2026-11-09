// @vitest-environment jsdom
// B23 · T23.2 · Precarga del Panel (NFR-10, CA-88, INV-02): `agenda_profesor_dias` del rango supuesto desde la
// dirección sale sin esperar `sesion_actual` ni `config_publica`; el calendario la toma solo si el rango y el usuario
// coinciden, vigente y con el mismo lector. Patrón de la agenda pública (B13 · T13.2).
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mensajeDeError } from '../../../../src/lib/errores';
import {
  ErrorAgendaDias,
  VIGENCIA_PRECARGA_PANEL_MS,
  precargarAgendaDias,
  precargarDesdeDireccion,
  rangoSupuesto,
  reiniciarPrecargaPanel,
  tomarPrecargaPanel,
  useAgendaDiasConLector,
  type FilaAgendaDias,
  type LecturaAgendaDias,
  type LectorAgendaDias,
} from '../../../../src/modulos/panel/logica';

const ZONA = 'America/Montevideo';
/** 06/11/2026 12:00 en Montevideo (UTC−3). */
const AHORA = new Date('2026-11-06T15:00:00Z');
/** Miércoles: su semana va del lunes 23/11 al domingo 29/11. */
const D1 = '2026-11-25';
const LUNES = '2026-11-23';
const DOMINGO = '2026-11-29';
const FILA_SEMANA = { dia: D1, inicio: '2026-11-25T13:00:00+00:00' } as FilaAgendaDias;
const FILA_PROPIA = { dia: D1, inicio: '2026-11-25T14:00:00+00:00' } as FilaAgendaDias;
const OPCIONES_RANGO = { ahora: AHORA, zona: ZONA, ventana: false };

function diferido<T>() {
  let resolver!: (v: T) => void;
  let rechazar!: (e: unknown) => void;
  const promesa = new Promise<T>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
}

/** Deja correr las microtareas y el olvido de la precarga (que espera al final de la tarea). */
const tic = () => new Promise<void>((r) => setTimeout(r, 0));

const usuario = (id: string | null) => vi.fn(async () => id);

/** Todas las lecturas que vio la vista, para comprobar que una respuesta descartada nunca se mostró. */
function historial(lector: LectorAgendaDias, desde: string, hasta: string) {
  const vistas: LecturaAgendaDias[] = [];
  const hook = renderHook(() => {
    const r = useAgendaDiasConLector(lector, desde, hasta);
    vistas.push(r.lectura);
    return r;
  });
  return { ...hook, vistas };
}

afterEach(() => {
  vi.restoreAllMocks();
  reiniciarPrecargaPanel();
});

describe('rangoSupuesto (NFR-10, CAL-02, CAL-03, CAL-16)', () => {
  it('NFR_10_semana_en_escritorio_supone_de_lunes_a_domingo_del_dia_de_la_direccion', () => {
    expect(rangoSupuesto(`v=semana&d=${D1}`, OPCIONES_RANGO)).toEqual({ desde: LUNES, hasta: DOMINGO });
  });

  it('NFR_10_semana_bajo_60_rem_supone_la_ventana_de_3_dias_y_dia_supone_un_dia', () => {
    expect(rangoSupuesto(`v=semana&d=${D1}`, { ...OPCIONES_RANGO, ventana: true })).toEqual({
      desde: D1,
      hasta: '2026-11-27',
    });
    expect(rangoSupuesto(`v=dia&d=${D1}`, OPCIONES_RANGO)).toEqual({ desde: D1, hasta: D1 });
  });

  it('NFR_10_sin_parametros_o_con_uno_invalido_supone_dia_de_hoy_en_el_huso_dado', () => {
    expect(rangoSupuesto('', OPCIONES_RANGO)).toEqual({ desde: '2026-11-06', hasta: '2026-11-06' });
    expect(rangoSupuesto('v=mes&d=basura', OPCIONES_RANGO)).toEqual({ desde: '2026-11-06', hasta: '2026-11-06' });
    // 06/11 23:30 en Montevideo ya es 07/11 en Kiritimati (UTC+14).
    const noche = new Date('2026-11-07T02:30:00Z');
    expect(rangoSupuesto('', { ahora: noche, zona: 'Pacific/Kiritimati', ventana: false }).desde).toBe('2026-11-07');
  });
});

describe('precargarDesdeDireccion (NFR-10, CA-88, ADR-017)', () => {
  const sesion = () => true;

  it('CA_88_con_sesion_guardada_pide_la_semana_de_la_direccion_sin_esperar_la_configuracion', async () => {
    const lector = vi.fn<LectorAgendaDias>(async () => [FILA_SEMANA]);
    precargarDesdeDireccion(`#/panel?v=semana&d=${D1}`, {
      ...OPCIONES_RANGO,
      lector,
      usuarioActual: usuario('u-1'),
      haySesionGuardada: sesion,
    });
    await tic();
    expect(lector).toHaveBeenCalledTimes(1);
    expect(lector.mock.calls[0]).toEqual([LUNES, DOMINGO]);
  });

  it('NFR_10_otra_direccion_o_sin_sesion_guardada_no_pide_nada', async () => {
    const lector = vi.fn<LectorAgendaDias>(async () => []);
    const usuarioActual = usuario('u-1');
    const deps = { ...OPCIONES_RANGO, lector, usuarioActual };
    precargarDesdeDireccion(`#/p/ana-perez?d=${D1}`, { ...deps, haySesionGuardada: sesion });
    precargarDesdeDireccion(`#/panelx?v=semana&d=${D1}`, { ...deps, haySesionGuardada: sesion });
    precargarDesdeDireccion(`#/lista`, { ...deps, haySesionGuardada: sesion });
    precargarDesdeDireccion(`#/panel?v=semana&d=${D1}`, { ...deps, haySesionGuardada: () => false });
    await tic();
    expect(lector).not.toHaveBeenCalled();
    expect(usuarioActual).not.toHaveBeenCalled();
  });

  it('INV_02_sin_usuario_en_la_sesion_no_pide_y_la_vista_lee_por_su_cuenta', async () => {
    const lector = vi.fn<LectorAgendaDias>(async () => [FILA_PROPIA]);
    precargarAgendaDias(LUNES, DOMINGO, { lector, usuarioActual: usuario(null) });
    await tic();
    expect(lector).not.toHaveBeenCalled();
    const { result } = renderHook(() => useAgendaDiasConLector(lector, LUNES, DOMINGO));
    await waitFor(() => expect(result.current.lectura.estado).toBe('listo'));
    expect(lector).toHaveBeenCalledTimes(1);
  });

  it('NFR_10_repetirla_con_el_mismo_rango_no_repite_el_pedido', async () => {
    const lector = vi.fn<LectorAgendaDias>(async () => [FILA_SEMANA]);
    const deps = { lector, usuarioActual: usuario('u-1') };
    precargarAgendaDias(LUNES, DOMINGO, deps);
    precargarAgendaDias(LUNES, DOMINGO, deps);
    await tic();
    expect(lector).toHaveBeenCalledTimes(1);
  });
});

describe('useAgendaDiasConLector con precarga (NFR-10, CA-88, INV-02)', () => {
  it('CA_88_toma_la_precarga_del_mismo_rango_sin_volver_a_pedir', async () => {
    const respuesta = diferido<FilaAgendaDias[]>();
    const lector = vi.fn<LectorAgendaDias>(() => respuesta.promesa);
    precargarAgendaDias(LUNES, DOMINGO, { lector, usuarioActual: usuario('u-1') });
    const { result } = renderHook(() => useAgendaDiasConLector(lector, LUNES, DOMINGO));
    expect(result.current.lectura).toEqual({ estado: 'cargando', previo: null });
    await act(async () => {
      respuesta.resolver([FILA_SEMANA]);
      await tic();
    });
    expect(result.current.lectura).toEqual({
      estado: 'listo',
      datos: { desde: LUNES, hasta: DOMINGO, filas: [FILA_SEMANA] },
    });
    expect(lector).toHaveBeenCalledTimes(1);
  });

  it('NFR_10_el_doble_montaje_de_strict_mode_toma_la_misma_precarga', async () => {
    const lector = vi.fn<LectorAgendaDias>(async () => [FILA_SEMANA]);
    precargarAgendaDias(LUNES, DOMINGO, { lector, usuarioActual: usuario('u-1') });
    const { result } = renderHook(() => useAgendaDiasConLector(lector, LUNES, DOMINGO), { reactStrictMode: true });
    await waitFor(() => expect(result.current.lectura.estado).toBe('listo'));
    expect(lector).toHaveBeenCalledTimes(1);
  });

  it('NFR_10_con_un_rango_distinto_la_descarta_sin_mostrarla_y_lee_el_rango_correcto', async () => {
    const lector = vi.fn<LectorAgendaDias>(async (desde) => (desde === LUNES ? [FILA_SEMANA] : [FILA_PROPIA]));
    // Supuesta la semana; con el huso del profesor (o la ventana de 3 días) el rango resultó otro.
    precargarAgendaDias(LUNES, DOMINGO, { lector, usuarioActual: usuario('u-1') });
    const { result, vistas } = historial(lector, D1, '2026-11-27');
    await waitFor(() => expect(result.current.lectura.estado).toBe('listo'));
    expect(result.current.lectura).toEqual({
      estado: 'listo',
      datos: { desde: D1, hasta: '2026-11-27', filas: [FILA_PROPIA] },
    });
    expect(lector).toHaveBeenCalledTimes(2);
    expect(lector).toHaveBeenCalledWith(LUNES, DOMINGO);
    expect(lector).toHaveBeenCalledWith(D1, '2026-11-27');
    // Sin parpadeo: antes de lo propio solo hubo «cargando» sin datos; la semana supuesta nunca se mostró.
    const antes = vistas.slice(0, vistas.findIndex((v) => v.estado === 'listo'));
    expect(antes.every((v) => v.estado === 'cargando' && v.previo === null)).toBe(true);
    expect(JSON.stringify(vistas)).not.toContain(FILA_SEMANA.inicio);
  });

  it('NFR_10_vencida_no_se_toma_y_la_vista_vuelve_a_pedir', async () => {
    const lector = vi.fn<LectorAgendaDias>(async () => [FILA_SEMANA]);
    const inicio = Date.now();
    precargarAgendaDias(LUNES, DOMINGO, { lector, usuarioActual: usuario('u-1') });
    await tic();
    vi.spyOn(Date, 'now').mockReturnValue(inicio + VIGENCIA_PRECARGA_PANEL_MS + 1_000);
    const { result } = renderHook(() => useAgendaDiasConLector(lector, LUNES, DOMINGO));
    await waitFor(() => expect(result.current.lectura.estado).toBe('listo'));
    expect(lector).toHaveBeenCalledTimes(2);
  });

  it('SEC_17_el_error_de_la_precarga_se_muestra_como_el_de_una_lectura_propia_y_reintentar_vuelve_a_leer', async () => {
    const consola = [vi.spyOn(console, 'error'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'log')];
    const error = new ErrorAgendaDias(new TypeError('Failed to fetch'));
    const lector = vi
      .fn<LectorAgendaDias>()
      .mockRejectedValueOnce(error)
      .mockResolvedValue([FILA_SEMANA]);
    precargarAgendaDias(LUNES, DOMINGO, { lector, usuarioActual: usuario('u-1') });
    const { result } = renderHook(() => useAgendaDiasConLector(lector, LUNES, DOMINGO));
    await waitFor(() => expect(result.current.lectura.estado).toBe('error'));
    expect(result.current.lectura).toEqual({ estado: 'error', mensaje: mensajeDeError(error) });
    expect(lector).toHaveBeenCalledTimes(1);
    for (const espia of consola) expect(espia).not.toHaveBeenCalled();
    // «Reintentar»: la precarga ya se olvidó y se lee de nuevo.
    await act(async () => {
      await tic();
      result.current.recargar();
    });
    await waitFor(() => expect(result.current.lectura.estado).toBe('listo'));
    expect(lector).toHaveBeenCalledTimes(2);
  });

  it('INV_02_pedida_con_otra_sesion_se_descarta_y_se_lee_con_la_actual', async () => {
    const lector = vi.fn<LectorAgendaDias>().mockResolvedValueOnce([FILA_SEMANA]).mockResolvedValue([FILA_PROPIA]);
    const usuarioActual = vi.fn(async () => 'u-1').mockResolvedValueOnce('u-1').mockResolvedValue('u-2');
    precargarAgendaDias(LUNES, DOMINGO, { lector, usuarioActual });
    await tic();
    const { result, vistas } = historial(lector, LUNES, DOMINGO);
    await waitFor(() => expect(result.current.lectura.estado).toBe('listo'));
    expect(result.current.lectura).toEqual({
      estado: 'listo',
      datos: { desde: LUNES, hasta: DOMINGO, filas: [FILA_PROPIA] },
    });
    expect(lector).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(vistas)).not.toContain(FILA_SEMANA.inicio);
  });

  it('NFR_10_una_precarga_de_otro_lector_no_se_toma_y_la_primera_busqueda_la_olvida', async () => {
    const precargado = vi.fn<LectorAgendaDias>(async () => [FILA_SEMANA]);
    const otro = vi.fn<LectorAgendaDias>(async () => [FILA_PROPIA]);
    precargarAgendaDias(LUNES, DOMINGO, { lector: precargado, usuarioActual: usuario('u-1') });
    expect(tomarPrecargaPanel(otro, LUNES, DOMINGO)).toBeNull();
    await tic();
    expect(tomarPrecargaPanel(precargado, LUNES, DOMINGO)).toBeNull();
  });
});
