// B07 · T07.1 · Lógica de la lista del profesor: solicitudes pendientes, respuesta y clases filtradas.
// SOL-04, SOL-05, SOL-06, SOL-08, PRF-06, PRF-07, PRF-08, AVI-03, SEC-06, SEC-09, SEC-17.
import type { SupabaseClient } from '@supabase/supabase-js';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  accionesSolicitud,
  dependenciasLista,
  falloRespuesta,
  leerClases,
  leerSolicitudesPendientes,
  MENSAJES_CLASES,
  MENSAJES_LISTA,
  MENSAJES_RESPUESTA,
  rangoDeFiltro,
  responderSolicitud,
  separarVencidas,
  textoEstadoClaseProfesor,
  textoTipoSolicitud,
  useClases as useClasesReal,
  useSolicitudesPendientes as useSolicitudesReal,
  validarFiltroClases,
  type ClaseProfesor,
  type SolicitudPendiente,
} from '../../../../src/modulos/lista/logica';
import { useClases, useLectura, useSolicitudesPendientes } from '../../../../src/modulos/lista/logica/useLectura';
import { MENSAJE_GENERICO, MENSAJES } from '../../../../src/lib/errores';

const real = vi.hoisted(() => ({ cliente: null as unknown }));
vi.mock('../../../../src/lib/supabase', () => ({ cargarSupabase: async () => real.cliente }));

type Resultado = { data: unknown; error: unknown };

/** Cliente falso: `rpc` y una consulta encadenable (`select`, `gte`, `lt`, `eq`, `order`) que se resuelve con `filas`. */
function cliente(opciones: { rpc?: Resultado; filas?: Resultado } = {}) {
  const llamadas: [string, unknown[]][] = [];
  const consulta: Record<string, unknown> = {};
  for (const m of ['select', 'gte', 'lt', 'eq', 'order']) {
    consulta[m] = vi.fn((...args: unknown[]) => {
      llamadas.push([m, args]);
      return consulta;
    });
  }
  consulta.then = (ok: (v: Resultado) => unknown, mal: (e: unknown) => unknown) =>
    Promise.resolve(opciones.filas ?? { data: [], error: null }).then(ok, mal);
  const c = {
    rpc: vi.fn(async () => opciones.rpc ?? { data: null, error: null }),
    from: vi.fn(() => consulta),
  };
  return { c, llamadas, deps: { obtenerCliente: async () => c as unknown as SupabaseClient } };
}

const err = (code: string, message: string, details: string | null = null) => ({ code, message, details, hint: null });

const SOLICITUD: SolicitudPendiente = {
  id: 's1',
  tipo: 'reserva',
  alcance: null,
  fecha_clase: '2026-11-03T15:00:00+00:00',
  vencida: false,
  alumno_id: 'a1',
  titular: 'Ana',
  quien_toma: 'Hija de Ana',
  observacion: '<b>trae libro</b>',
  reserva_tipo: 'serie',
  frecuencia: 2,
  origen_inicio: null,
  origen_fin: null,
  destino_inicio: '2026-11-03T15:00:00+00:00',
  destino_fin: '2026-11-03T16:00:00+00:00',
  reserva_id: 'r1',
  clase_id: null,
  creada_en: '2026-11-02T15:00:00+00:00',
};

const CLASE: ClaseProfesor = {
  id: 'c1',
  inicio: '2026-11-03T15:00:00+00:00',
  fin: '2026-11-03T16:00:00+00:00',
  estado: 'confirmada',
  alumno_id: 'a1',
  titular: 'Ana',
  quien_toma: 'Ana',
  persona_a_cargo_id: null,
  observacion: null,
  reserva_tipo: 'suelta',
  frecuencia: null,
  solicitud_pendiente: null,
  pasada: false,
  reserva_id: 'r1',
};

describe('responderSolicitud (SOL-04, SOL-05, SOL-06, AVI-03)', () => {
  it('SOL_05_confirmar_llama_a_la_rpc_con_motivo_recortado_y_devuelve_confirmada', async () => {
    const { c, deps } = cliente({ rpc: { data: { estado: 'confirmada' }, error: null } });
    const r = await responderSolicitud('s1', 'confirmar', '  Te espero  ', deps);
    expect(c.rpc).toHaveBeenCalledWith('responder_solicitud', {
      p_solicitud_id: 's1',
      p_decision: 'confirmar',
      p_motivo: 'Te espero',
    });
    expect(r).toEqual({ ok: true, estado: 'confirmada' });
  });

  it('SOL_06_rechazar_sin_motivo_manda_null', async () => {
    const { c, deps } = cliente({ rpc: { data: { estado: 'rechazada' }, error: null } });
    const r = await responderSolicitud('s1', 'rechazar', '   ', deps);
    expect(c.rpc).toHaveBeenCalledWith('responder_solicitud', { p_solicitud_id: 's1', p_decision: 'rechazar', p_motivo: null });
    expect(r).toEqual({ ok: true, estado: 'rechazada' });
  });

  it('SEC_09_motivo_de_501_no_llama_y_marca_el_campo_motivo; 500 pasa', async () => {
    const { c, deps } = cliente({ rpc: { data: { estado: 'rechazada' }, error: null } });
    const largo = await responderSolicitud('s1', 'rechazar', 'x'.repeat(501), deps);
    expect(largo).toEqual({ ok: false, codigo: 'DATOS_INVALIDOS', mensaje: MENSAJES_LISTA.motivoLargo, campo: 'motivo' });
    expect(c.rpc).not.toHaveBeenCalled();
    expect(await responderSolicitud('s1', 'rechazar', 'x'.repeat(500), deps)).toEqual({ ok: true, estado: 'rechazada' });
  });

  it('SEC_09_el_422_motivo_del_servidor_marca_el_campo', async () => {
    const { deps } = cliente({ rpc: { data: null, error: err('PT422', 'DATOS_INVALIDOS', '{"campo":"motivo"}') } });
    expect(await responderSolicitud('s1', 'rechazar', 'x', deps)).toEqual({
      ok: false,
      codigo: 'DATOS_INVALIDOS',
      mensaje: MENSAJES_LISTA.motivoLargo,
      campo: 'motivo',
    });
  });

  it('PRF_08_inactivo_al_confirmar_da_el_texto_de_agenda_inactiva', async () => {
    const { deps } = cliente({ rpc: { data: null, error: err('PT409', 'PROFESOR_INACTIVO') } });
    expect(await responderSolicitud('s1', 'confirmar', null, deps)).toEqual({
      ok: false,
      codigo: 'PROFESOR_INACTIVO',
      mensaje: MENSAJES_RESPUESTA.profesorInactivo,
      campo: null,
    });
  });

  it('SOL_08_ya_respondida_vencida_y_ajena_se_traducen_con_el_catalogo_sin_details', async () => {
    for (const [code, message] of [
      ['PT409', 'SOLICITUD_YA_RESPONDIDA'],
      ['PT409', 'SOLICITUD_VENCIDA'],
      ['PT404', 'NO_ENCONTRADO'],
    ] as const) {
      const { deps } = cliente({ rpc: { data: null, error: err(code, message, '{"secreto":"x"}') } });
      const r = await responderSolicitud('s1', 'confirmar', null, deps);
      expect(r).toEqual({ ok: false, codigo: message, mensaje: MENSAJES[message], campo: null });
      expect(JSON.stringify(r)).not.toContain('secreto');
    }
  });

  it('SEC_17_un_error_desconocido_o_una_respuesta_rara_dan_el_mensaje_generico', async () => {
    const { deps } = cliente({ rpc: { data: { estado: 'otra' }, error: null } });
    expect(await responderSolicitud('s1', 'confirmar', null, deps)).toMatchObject({ ok: false, codigo: 'DESCONOCIDO' });
    expect(falloRespuesta(err('XX000', 'TIPO_SIN_RESPUESTA'))).toEqual({
      ok: false,
      codigo: 'DESCONOCIDO',
      mensaje: MENSAJE_GENERICO,
      campo: null,
    });
    expect(falloRespuesta(err('PT422', 'DATOS_INVALIDOS', 'no-json')).campo).toBeNull();
    expect(falloRespuesta(err('PT422', 'DATOS_INVALIDOS', '{"campo":"p_decision"}')).campo).toBeNull();
    expect(falloRespuesta(err('PT422', 'DATOS_INVALIDOS', '{"campo":"p_motivo"}')).campo).toBe('motivo');
  });

  it('dependencias_reales_cargan_supabase_diferido', () => {
    expect(typeof dependenciasLista().obtenerCliente).toBe('function');
  });
});

describe('acciones y textos de solicitudes (PRF-06, PRF-08, SOL-08)', () => {
  it('PRF_08_inactivo_rechaza_pero_no_confirma; activo ambas', () => {
    expect(accionesSolicitud(SOLICITUD, true)).toEqual({ confirmar: true, rechazar: true });
    expect(accionesSolicitud(SOLICITUD, false)).toEqual({ confirmar: false, rechazar: true });
  });

  it('SOL_08_una_vencida_no_se_responde', () => {
    expect(accionesSolicitud({ vencida: true }, true)).toEqual({ confirmar: false, rechazar: false });
  });

  it('SOL_08_separar_vencidas_conserva_el_orden_por_fecha_clase', () => {
    const v = { ...SOLICITUD, id: 's0', vencida: true };
    const s2 = { ...SOLICITUD, id: 's2' };
    expect(separarVencidas([v, SOLICITUD, s2])).toEqual({ vigentes: [SOLICITUD, s2], vencidas: [v] });
    expect(separarVencidas([])).toEqual({ vigentes: [], vencidas: [] });
  });

  it('PRF_06_texto_del_tipo_con_alcance', () => {
    expect(textoTipoSolicitud(SOLICITUD)).toBe('Reserva');
    expect(textoTipoSolicitud({ tipo: 'movimiento', alcance: 'desde_aca' })).toBe('Cambio de horario · De acá en adelante');
    expect(textoTipoSolicitud({ tipo: 'cancelacion', alcance: 'solo_esta' })).toBe('Cancelación · Solo esta clase');
  });
});

describe('leerSolicitudesPendientes (PRF-06, SOL-04)', () => {
  it('PRF_06_lee_la_vista_ordenada_por_fecha_clase', async () => {
    const { c, llamadas, deps } = cliente({ filas: { data: [SOLICITUD], error: null } });
    expect(await leerSolicitudesPendientes(deps)).toEqual([SOLICITUD]);
    expect(c.from).toHaveBeenCalledWith('v_solicitudes_pendientes');
    expect(llamadas.filter(([m]) => m === 'order').map(([, a]) => a[0])).toEqual(['fecha_clase', 'id']);
  });

  it('SOL_04_un_error_de_lectura_se_lanza_y_una_fila_invalida_tambien', async () => {
    const fallo = cliente({ filas: { data: null, error: err('PT403', 'PROHIBIDO') } });
    await expect(leerSolicitudesPendientes(fallo.deps)).rejects.toMatchObject({ message: 'PROHIBIDO' });
    const rara = cliente({ filas: { data: [{ ...SOLICITUD, tipo: 'otra' }], error: null } });
    await expect(leerSolicitudesPendientes(rara.deps)).rejects.toThrow();
    const vacia = cliente({ filas: { data: null, error: null } });
    expect(await leerSolicitudesPendientes(vacia.deps)).toEqual([]);
  });
});

describe('clases filtradas (PRF-06, CA-29)', () => {
  it('CA_29_el_rango_de_dias_se_convierte_a_instantes_en_el_huso_del_profesor', () => {
    expect(rangoDeFiltro({ desde: '2026-11-02', hasta: '2026-11-08' }, 'America/Montevideo')).toEqual({
      desde: '2026-11-02T03:00:00.000Z',
      hasta: '2026-11-09T03:00:00.000Z',
    });
    expect(rangoDeFiltro({ desde: '2026-11-02' }, 'Europe/Madrid')).toEqual({ desde: '2026-11-01T23:00:00.000Z', hasta: null });
    expect(rangoDeFiltro({}, 'UTC')).toEqual({ desde: null, hasta: null });
  });

  it('CA_29_valida_dias_y_rango_invertido', () => {
    expect(validarFiltroClases({})).toBeNull();
    expect(validarFiltroClases({ desde: '2026-11-02', hasta: '2026-11-02' })).toBeNull();
    expect(validarFiltroClases({ desde: '2026-11-03', hasta: '2026-11-02' })).toBe(MENSAJES_CLASES.rangoInvertido);
    expect(validarFiltroClases({ desde: '2026-02-30' })).toBe(MENSAJES_CLASES.diaInvalido);
    expect(validarFiltroClases({ hasta: 'ayer' })).toBe(MENSAJES_CLASES.diaInvalido);
  });

  it('CA_29_leer_clases_aplica_gte_lt_y_eq_y_ordena_por_inicio', async () => {
    const { c, llamadas, deps } = cliente({ filas: { data: [CLASE], error: null } });
    const filas = await leerClases({ desde: '2026-11-02', hasta: '2026-11-02', alumnoId: 'a1' }, 'America/Montevideo', deps);
    expect(filas).toEqual([CLASE]);
    expect(c.from).toHaveBeenCalledWith('v_clases');
    expect(llamadas.filter(([m]) => m !== 'select')).toEqual([
      ['gte', ['inicio', '2026-11-02T03:00:00.000Z']],
      ['lt', ['inicio', '2026-11-03T03:00:00.000Z']],
      ['eq', ['alumno_id', 'a1']],
      ['order', ['inicio']],
      ['order', ['id']],
    ]);
  });

  it('PRF_06_sin_filtro_trae_todas_incluidas_las_pasadas', async () => {
    const pasada = { ...CLASE, id: 'c0', pasada: true };
    const { llamadas, deps } = cliente({ filas: { data: [pasada, CLASE], error: null } });
    expect(await leerClases({}, 'America/Montevideo', deps)).toEqual([pasada, CLASE]);
    expect(llamadas.map(([m]) => m)).toEqual(['select', 'order', 'order']);
  });

  it('CA_29_un_filtro_invalido_no_consulta_y_un_error_se_lanza', async () => {
    const { c, deps } = cliente();
    await expect(leerClases({ desde: '2026-11-03', hasta: '2026-11-01' }, 'UTC', deps)).rejects.toThrow(
      MENSAJES_CLASES.rangoInvertido,
    );
    expect(c.from).not.toHaveBeenCalled();
    const fallo = cliente({ filas: { data: null, error: err('PT403', 'PROHIBIDO') } });
    await expect(leerClases({}, 'UTC', fallo.deps)).rejects.toMatchObject({ message: 'PROHIBIDO' });
  });

  it('SOL_08_texto_del_estado_de_una_pendiente_pasada', () => {
    expect(textoEstadoClaseProfesor({ estado: 'pendiente', pasada: true })).toBe(MENSAJES_CLASES.pendienteSinRespuesta);
    expect(textoEstadoClaseProfesor({ estado: 'pendiente', pasada: false })).toBe('Pendiente de confirmación');
    expect(textoEstadoClaseProfesor({ estado: 'confirmada', pasada: true })).toBe('Confirmada');
  });
});

describe('hooks de la lista (PRF-06, WEB-07)', () => {
  it('PRF_06_useSolicitudesPendientes_carga_y_recarga_conservando_las_filas', async () => {
    const lector = vi.fn().mockResolvedValueOnce([SOLICITUD]).mockRejectedValueOnce(err('PT403', 'PROHIBIDO'));
    const { result } = renderHook(() => useSolicitudesPendientes(lector));
    expect(result.current.datos.estado).toBe('cargando');
    await waitFor(() => expect(result.current.datos).toEqual({ estado: 'listo', filas: [SOLICITUD], error: null }));
    act(() => result.current.recargar());
    expect(result.current.datos).toEqual({ estado: 'cargando', filas: [SOLICITUD], error: null });
    await waitFor(() => expect(result.current.datos.estado).toBe('error'));
    expect(result.current.datos).toEqual({ estado: 'error', filas: [SOLICITUD], error: MENSAJES.PROHIBIDO });
    expect(lector).toHaveBeenCalledTimes(2);
  });

  it('CA_29_useClases_vuelve_a_leer_al_cambiar_el_filtro_y_no_consulta_con_uno_invalido', async () => {
    const lector = vi.fn(async () => [CLASE]);
    const { result, rerender } = renderHook(({ desde, hasta }) => useClases(lector, { desde, hasta }, 'UTC'), {
      initialProps: { desde: '2026-11-01', hasta: '2026-11-30' },
    });
    await waitFor(() => expect(result.current.datos.estado).toBe('listo'));
    expect(lector).toHaveBeenLastCalledWith({ desde: '2026-11-01', hasta: '2026-11-30', alumnoId: null }, 'UTC');
    rerender({ desde: '2026-11-01', hasta: '2026-11-30' });
    expect(lector).toHaveBeenCalledTimes(1);
    rerender({ desde: '2026-12-01', hasta: '2026-11-30' });
    expect(result.current.datos).toEqual({ estado: 'error', filas: [], error: MENSAJES_CLASES.rangoInvertido });
    expect(lector).toHaveBeenCalledTimes(1);
    rerender({ desde: '2026-11-02', hasta: '2026-11-30' });
    await waitFor(() => expect(lector).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.datos.estado).toBe('listo'));
  });

  it('useLectura_ignora_la_respuesta_de_una_lectura_reemplazada', async () => {
    let resolverVieja: (v: string[]) => void = () => undefined;
    const vieja = vi.fn(() => new Promise<string[]>((r) => (resolverVieja = r)));
    const nueva = vi.fn(async () => ['nueva']);
    const { result, rerender } = renderHook(({ l }) => useLectura(l), { initialProps: { l: vieja } });
    rerender({ l: nueva });
    await waitFor(() => expect(result.current.datos).toEqual({ estado: 'listo', filas: ['nueva'], error: null }));
    await act(async () => resolverVieja(['vieja']));
    expect(result.current.datos.filas).toEqual(['nueva']);
  });

  it('PRF_06_los_hooks_publicos_leen_con_el_cliente_real', async () => {
    const { c, deps } = cliente({ filas: { data: [], error: null } });
    real.cliente = await deps.obtenerCliente();
    const s = renderHook(() => useSolicitudesReal());
    await waitFor(() => expect(s.result.current.datos.estado).toBe('listo'));
    const k = renderHook(() => useClasesReal({ alumnoId: 'a1' }, 'UTC'));
    await waitFor(() => expect(k.result.current.datos.estado).toBe('listo'));
    expect(c.from.mock.calls.map((a: unknown[]) => a[0])).toEqual(['v_solicitudes_pendientes', 'v_clases']);
    expect(await responderSolicitud('s1', 'rechazar')).toMatchObject({ ok: false, codigo: 'DESCONOCIDO' });
    expect(await leerSolicitudesPendientes()).toEqual([]);
    expect(await leerClases({}, 'UTC')).toEqual([]);
  });
});
