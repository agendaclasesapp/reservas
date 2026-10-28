// B09 · T09.1 · Lógica del panel del profesor: agenda con nombres, contadores, crear, mover y cancelar.
// PRF-01, PRF-02, PRF-03, PRF-04, PRF-05, PRF-07, PRF-08, AVI-01, AVI-04, SEC-06, SEC-09, SEC-17.
import type { SupabaseClient } from '@supabase/supabase-js';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  accionesFila,
  cancelarClase,
  crearClase,
  dependenciasPanel,
  destinosLibres,
  falloPanel,
  leerAgendaProfesor,
  leerContadores,
  mensajeExito,
  MENSAJES_PANEL,
  moverClase,
  normalizarObservacion,
  permisosPanel,
  textoQuienToma,
  totalPendientes,
  useAgendaProfesor as useAgendaReal,
  useContadores as useContadoresReal,
  validarCrearClase,
  type Alcance,
  type EntradaCrearClase,
  type FilaAgendaProfesor,
} from '../../../../src/modulos/panel/logica';
import { useAgendaProfesor, useContadores, useLecturaPanel } from '../../../../src/modulos/panel/logica/usePanel';
import { MENSAJE_GENERICO, MENSAJES } from '../../../../src/lib/errores';

const real = vi.hoisted(() => ({ cliente: null as unknown }));
vi.mock('../../../../src/lib/supabase', () => ({ cargarSupabase: async () => real.cliente }));

type Resultado = { data: unknown; error: unknown };

function cliente(rpc: Resultado = { data: null, error: null }) {
  const c = { rpc: vi.fn(async () => rpc) };
  return { c, deps: { obtenerCliente: async () => c as unknown as SupabaseClient } };
}

function errorPg(message: string, details?: unknown, code = 'PT409') {
  return { code, message, details: details === undefined ? null : JSON.stringify(details) };
}

function fila(cambios: Partial<FilaAgendaProfesor> = {}): FilaAgendaProfesor {
  return {
    inicio: '2026-11-04T13:00:00+00:00',
    fin: '2026-11-04T14:00:00+00:00',
    estado: 'ocupado',
    clase_id: 'c1',
    solicitud_id: null,
    quien_toma: 'Hija de Ana',
    titular: 'Ana',
    observacion: 'Con la hija',
    clase_estado: 'confirmada',
    bloqueo_id: null,
    bloqueo_motivo: null,
    reserva_tipo: 'serie',
    pasada: false,
    ...cambios,
  };
}

const libre = fila({
  estado: 'libre',
  clase_id: null,
  quien_toma: null,
  titular: null,
  observacion: null,
  clase_estado: null,
  reserva_tipo: null,
});

const entrada: EntradaCrearClase = {
  alumnoId: 'al1',
  inicio: '2026-11-04T13:00:00+00:00',
  tipo: 'suelta',
};

describe('PRF-05 · agenda_profesor', () => {
  it('PRF_05_lee_los_huecos_del_dia_con_titular_quien_toma_observacion_y_estado', async () => {
    const { c, deps } = cliente({ data: [fila(), libre], error: null });
    const filas = await leerAgendaProfesor('2026-11-04', deps);
    expect(c.rpc).toHaveBeenCalledWith('agenda_profesor', { p_dia: '2026-11-04' });
    expect(filas[0]).toMatchObject({ titular: 'Ana', quien_toma: 'Hija de Ana', observacion: 'Con la hija', clase_estado: 'confirmada' });
    expect(filas[1]?.estado).toBe('libre');
  });

  it('SEC_09_un_dia_mal_formado_no_sale_a_la_red_y_da_el_422_de_p_dia', async () => {
    const { c, deps } = cliente();
    await expect(leerAgendaProfesor('2026-02-30', deps)).rejects.toMatchObject({ message: 'DATOS_INVALIDOS' });
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it('SEC_09_el_422_de_p_dia_del_servidor_se_lanza_para_la_vista', async () => {
    const { deps } = cliente({ data: null, error: errorPg('DATOS_INVALIDOS', { campo: 'p_dia' }, 'PT422') });
    await expect(leerAgendaProfesor('2028-01-01', deps)).rejects.toMatchObject({ code: 'PT422' });
  });

  it('PRF_05_una_respuesta_sin_la_forma_del_contrato_falla_y_no_llega_a_la_vista', async () => {
    const { deps } = cliente({ data: [{ inicio: 'x', estado: 'raro' }], error: null });
    await expect(leerAgendaProfesor('2026-11-04', deps)).rejects.toThrow();
  });

  it('PRF_05_sin_datos_devuelve_lista_vacia', async () => {
    const { deps } = cliente({ data: null, error: null });
    await expect(leerAgendaProfesor('2026-11-04', deps)).resolves.toEqual([]);
  });

  it('PRF_05_texto_de_quien_toma_con_y_sin_persona_a_cargo', () => {
    expect(textoQuienToma(fila())).toBe('Hija de Ana (titular: Ana)');
    expect(textoQuienToma(fila({ quien_toma: 'Ana' }))).toBe('Ana');
    expect(textoQuienToma(libre)).toBeNull();
  });
});

describe('AVI-01 · contadores', () => {
  it('AVI_01_lee_los_contadores_del_profesor_que_mira', async () => {
    const { c, deps } = cliente({ data: { solicitudes_pendientes: 2, cuentas_pendientes: 1 }, error: null });
    const r = await leerContadores(deps);
    expect(c.rpc).toHaveBeenCalledWith('contadores');
    expect(r).toEqual({ solicitudes_pendientes: 2, cuentas_pendientes: 1 });
    expect(totalPendientes(r)).toBe(3);
    expect(totalPendientes(null)).toBe(0);
  });

  it('SEC_06_una_persona_recibe_403_y_el_error_se_lanza', async () => {
    const { deps } = cliente({ data: null, error: errorPg('PROHIBIDO', undefined, 'PT403') });
    await expect(leerContadores(deps)).rejects.toMatchObject({ message: 'PROHIBIDO' });
  });

  it('AVI_01_un_contador_negativo_no_pasa_el_esquema', async () => {
    const { deps } = cliente({ data: { solicitudes_pendientes: -1, cuentas_pendientes: 0 }, error: null });
    await expect(leerContadores(deps)).rejects.toThrow();
  });
});

describe('PRF-01 · PRF-04 · crear_clase', () => {
  it('PRF_01_crea_una_suelta_sin_frecuencia_y_con_la_observacion_recortada', async () => {
    const { c, deps } = cliente({ data: { reserva_id: 'r1', fechas: [entrada.inicio], salteadas: [] }, error: null });
    const r = await crearClase({ ...entrada, frecuencia: 2, observacion: '  hola  ' }, deps);
    expect(r).toEqual({ ok: true, reserva_id: 'r1', fechas: [entrada.inicio], salteadas: [] });
    expect(c.rpc).toHaveBeenCalledWith('crear_clase', {
      p_alumno_id: 'al1',
      p_persona_a_cargo_id: null,
      p_inicio: entrada.inicio,
      p_tipo: 'suelta',
      p_frecuencia: null,
      p_observacion: 'hola',
    });
  });

  it('PRF_01_crea_una_serie_para_una_persona_a_cargo_y_devuelve_las_salteadas', async () => {
    const { c, deps } = cliente({ data: { reserva_id: 'r1', fechas: ['a', 'b'], salteadas: ['s'] }, error: null });
    const r = await crearClase({ ...entrada, tipo: 'serie', frecuencia: 1, personaACargoId: 'pc1', observacion: '   ' }, deps);
    expect(r.ok && r.salteadas).toEqual(['s']);
    expect(c.rpc).toHaveBeenCalledWith('crear_clase', expect.objectContaining({ p_frecuencia: 1, p_persona_a_cargo_id: 'pc1', p_observacion: null }));
  });

  it('PRF_01_una_persona_que_no_es_suya_da_403_con_su_texto', async () => {
    const { deps } = cliente({ data: null, error: errorPg('PROHIBIDO', undefined, 'PT403') });
    expect(await crearClase(entrada, deps)).toEqual({ ok: false, codigo: 'PROHIBIDO', mensaje: MENSAJES_PANEL.alumnoNoValido, campo: null });
  });

  it('PRF_01_una_persona_a_cargo_de_otro_titular_da_404_con_su_texto', async () => {
    const { deps } = cliente({ data: null, error: errorPg('NO_ENCONTRADO', undefined, 'PT404') });
    const r = await crearClase({ ...entrada, personaACargoId: 'otra' }, deps);
    expect(r).toMatchObject({ ok: false, codigo: 'NO_ENCONTRADO', mensaje: MENSAJES_PANEL.personaACargoNoValida });
  });

  it('PRF_04_no_valida_anticipacion_en_la_web_y_un_hueco_ocupado_da_409', async () => {
    const { c, deps } = cliente({ data: null, error: errorPg('HUECO_NO_LIBRE', { inicio: entrada.inicio }) });
    const r = await crearClase(entrada, deps);
    expect(c.rpc).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ ok: false, codigo: 'HUECO_NO_LIBRE', mensaje: MENSAJES.HUECO_NO_LIBRE });
  });

  it('SEC_09_validacion_previa_sin_viaje_alumno_horario_tipo_frecuencia_y_observacion', async () => {
    const { c, deps } = cliente();
    expect(await crearClase({ ...entrada, alumnoId: '' }, deps)).toMatchObject({ mensaje: MENSAJES_PANEL.alumnoRequerido, campo: null });
    expect(await crearClase({ ...entrada, inicio: 'nada' }, deps)).toMatchObject({ campo: 'p_inicio' });
    expect(await crearClase({ ...entrada, tipo: 'otro' as never }, deps)).toMatchObject({ campo: 'p_tipo' });
    expect(await crearClase({ ...entrada, tipo: 'serie' }, deps)).toMatchObject({ campo: 'p_frecuencia' });
    expect(await crearClase({ ...entrada, tipo: 'serie', frecuencia: 3 as never }, deps)).toMatchObject({ campo: 'p_frecuencia' });
    expect(await crearClase({ ...entrada, observacion: 'x'.repeat(501) }, deps)).toMatchObject({
      campo: 'p_observacion',
      mensaje: MENSAJES_PANEL.observacionLarga,
    });
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it('SEC_09_observacion_de_500_caracteres_pasa', () => {
    expect(validarCrearClase({ ...entrada, observacion: 'x'.repeat(500) })).toBeNull();
    expect(validarCrearClase({ ...entrada, tipo: 'serie', frecuencia: 2 })).toBeNull();
  });

  it('SEC_09_el_422_del_servidor_marca_su_campo_y_FUERA_DE_GRILLA_usa_el_catalogo', async () => {
    const a = cliente({ data: null, error: errorPg('DATOS_INVALIDOS', { campo: 'p_inicio' }, 'PT422') });
    expect(await crearClase(entrada, a.deps)).toMatchObject({ campo: 'p_inicio', mensaje: MENSAJES_PANEL.horarioInvalido });
    const b = cliente({ data: null, error: errorPg('FUERA_DE_GRILLA', undefined, 'PT422') });
    expect(await crearClase(entrada, b.deps)).toMatchObject({ codigo: 'FUERA_DE_GRILLA', mensaje: MENSAJES.FUERA_DE_GRILLA, campo: null });
  });

  it('SEC_17_un_422_con_un_campo_desconocido_o_details_rotos_no_muestra_details', () => {
    expect(falloPanel({ message: 'DATOS_INVALIDOS', details: '{"campo":"secreto"}' }, 'crear')).toMatchObject({ campo: null, mensaje: MENSAJES.DATOS_INVALIDOS });
    expect(falloPanel({ message: 'DATOS_INVALIDOS', details: '{rotos' }, 'crear')).toMatchObject({ campo: null });
    expect(falloPanel({ message: 'DATOS_INVALIDOS', details: 'null' }, 'crear')).toMatchObject({ campo: null });
    expect(falloPanel({ message: 'DATOS_INVALIDOS' }, 'crear')).toMatchObject({ campo: null });
    expect(falloPanel(null, 'crear')).toMatchObject({ codigo: 'DESCONOCIDO', mensaje: MENSAJE_GENERICO });
  });

  it('SEC_17_una_respuesta_mal_formada_o_una_excepcion_dan_el_mensaje_generico', async () => {
    const { deps } = cliente({ data: { reserva_id: 1 }, error: null });
    expect(await crearClase(entrada, deps)).toMatchObject({ ok: false, mensaje: MENSAJE_GENERICO });
    const roto = { obtenerCliente: () => Promise.reject(new Error('boom')) };
    expect(await crearClase(entrada, roto)).toMatchObject({ ok: false, codigo: 'DESCONOCIDO' });
  });
});

describe('PRF-02 · mover_clase', () => {
  it.each<Alcance>(['solo_esta', 'desde_aca'])('PRF_02_mueve_con_alcance_%s', async (alcance) => {
    const { c, deps } = cliente({ data: { clase_id: 'c2', fechas: ['d'], salteadas: [] }, error: null });
    const r = await moverClase('c1', '2026-11-05T13:00:00+00:00', alcance, deps);
    expect(r).toEqual({ ok: true, clase_id: 'c2', fechas: ['d'], salteadas: [] });
    expect(c.rpc).toHaveBeenCalledWith('mover_clase', { p_clase_id: 'c1', p_destino: '2026-11-05T13:00:00+00:00', p_alcance: alcance });
  });

  it('PRF_02_alcance_o_destino_invalidos_no_salen_a_la_red', async () => {
    const { c, deps } = cliente();
    expect(await moverClase('c1', '2026-11-05T13:00:00Z', 'todas' as never, deps)).toMatchObject({ campo: 'p_alcance' });
    expect(await moverClase('c1', '', 'solo_esta', deps)).toMatchObject({ campo: 'p_destino' });
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it('PRF_07_una_clase_de_otro_profesor_da_404_con_texto_de_clase', async () => {
    const { deps } = cliente({ data: null, error: errorPg('NO_ENCONTRADO', undefined, 'PT404') });
    expect(await moverClase('ajena', '2026-11-05T13:00:00Z', 'solo_esta', deps)).toMatchObject({
      codigo: 'NO_ENCONTRADO',
      mensaje: MENSAJES_PANEL.claseNoEncontrada,
    });
  });

  it('PRF_08_profesor_inactivo_da_409_con_el_texto_de_PRF_08', async () => {
    const { deps } = cliente({ data: null, error: errorPg('PROFESOR_INACTIVO') });
    expect(await moverClase('c1', '2026-11-05T13:00:00Z', 'solo_esta', deps)).toEqual({
      ok: false,
      codigo: 'PROFESOR_INACTIVO',
      mensaje: MENSAJES_PANEL.profesorInactivo,
      campo: null,
    });
  });

  it('PRF_02_solicitud_en_curso_y_clase_no_modificable', async () => {
    const a = cliente({ data: null, error: errorPg('SOLICITUD_EN_CURSO', { solicitud_id: 's1' }) });
    expect(await moverClase('c1', '2026-11-05T13:00:00Z', 'desde_aca', a.deps)).toMatchObject({ mensaje: MENSAJES_PANEL.solicitudEnCurso });
    const b = cliente({ data: null, error: errorPg('CLASE_NO_MODIFICABLE') });
    expect(await moverClase('c1', '2026-11-05T13:00:00Z', 'solo_esta', b.deps)).toMatchObject({ mensaje: MENSAJES.CLASE_NO_MODIFICABLE });
  });

  it('PRF_03_solicitud_en_curso_usa_el_texto_de_la_vista_al_mover_y_cancelar', async () => {
    const texto = 'La clase tiene un pedido del alumno sin responder: respondelo primero en la lista.';
    expect(MENSAJES_PANEL.solicitudEnCurso).toBe(texto);
    const a = cliente({ data: null, error: errorPg('SOLICITUD_EN_CURSO', { solicitud_id: 's1' }) });
    expect(await cancelarClase('c1', 'solo_esta', a.deps)).toEqual({ ok: false, codigo: 'SOLICITUD_EN_CURSO', mensaje: texto, campo: null });
    const b = cliente({ data: null, error: errorPg('SOLICITUD_EN_CURSO', { solicitud_id: 's1' }) });
    expect(await moverClase('c1', '2026-11-05T13:00:00Z', 'solo_esta', b.deps)).toEqual({ ok: false, codigo: 'SOLICITUD_EN_CURSO', mensaje: texto, campo: null });
  });

  it('SEC_09_el_422_de_p_destino_marca_el_campo', async () => {
    const { deps } = cliente({ data: null, error: errorPg('DATOS_INVALIDOS', { campo: 'p_destino' }, 'PT422') });
    expect(await moverClase('c1', '2020-01-01T13:00:00Z', 'solo_esta', deps)).toMatchObject({ campo: 'p_destino' });
  });
});

describe('PRF-03 · cancelar_clase', () => {
  it('PRF_03_cancela_una_serie_desde_una_fecha_y_devuelve_cuantas', async () => {
    const { c, deps } = cliente({ data: { canceladas: 7 }, error: null });
    expect(await cancelarClase('c1', 'desde_aca', deps)).toEqual({ ok: true, canceladas: 7 });
    expect(c.rpc).toHaveBeenCalledWith('cancelar_clase', { p_clase_id: 'c1', p_alcance: 'desde_aca' });
  });

  it('PRF_03_alcance_invalido_no_sale_y_404_usa_el_texto_de_clase', async () => {
    const a = cliente();
    expect(await cancelarClase('c1', '' as never, a.deps)).toMatchObject({ campo: 'p_alcance' });
    expect(a.c.rpc).not.toHaveBeenCalled();
    const b = cliente({ data: null, error: errorPg('NO_ENCONTRADO', undefined, 'PT404') });
    expect(await cancelarClase('c1', 'solo_esta', b.deps)).toMatchObject({ mensaje: MENSAJES_PANEL.claseNoEncontrada });
  });

  it('SEC_06_un_403_al_cancelar_usa_el_texto_del_catalogo', async () => {
    const { deps } = cliente({ data: null, error: errorPg('PROHIBIDO', undefined, 'PT403') });
    expect(await cancelarClase('c1', 'solo_esta', deps)).toMatchObject({ codigo: 'PROHIBIDO', mensaje: MENSAJES.PROHIBIDO });
  });
});

describe('PRF-08 · permisos y acciones por fila', () => {
  it('PRF_08_inactivo_no_crea_ni_mueve_pero_cancela', () => {
    expect(permisosPanel(false)).toEqual({ crear: false, mover: false, cancelar: true });
    expect(permisosPanel(true)).toEqual({ crear: true, mover: true, cancelar: true });
    expect(accionesFila(fila(), false)).toEqual({ crear: false, mover: false, cancelar: true, elegirAlcance: true });
    expect(accionesFila(libre, false).crear).toBe(false);
  });

  it('PRF_04_crear_en_un_hueco_libre_futuro_sin_mirar_anticipacion', () => {
    expect(accionesFila(libre, true)).toEqual({ crear: true, mover: false, cancelar: false, elegirAlcance: false });
    expect(accionesFila({ ...libre, pasada: true }, true).crear).toBe(false);
    expect(accionesFila({ ...libre, estado: 'bloqueado', bloqueo_id: 'b1' }, true).crear).toBe(false);
  });

  it('PRF_02_PRF_03_mover_y_cancelar_solo_confirmadas_futuras_sin_solicitud_y_alcance_solo_en_serie', () => {
    expect(accionesFila(fila(), true)).toEqual({ crear: false, mover: true, cancelar: true, elegirAlcance: true });
    expect(accionesFila(fila({ reserva_tipo: 'suelta' }), true).elegirAlcance).toBe(false);
    expect(accionesFila(fila({ pasada: true }), true)).toMatchObject({ mover: false, cancelar: false });
    expect(accionesFila(fila({ clase_estado: 'pendiente', solicitud_id: 's1' }), true)).toMatchObject({ mover: false, cancelar: false });
    expect(accionesFila(fila({ solicitud_id: 's2' }), true)).toMatchObject({ mover: false, cancelar: false, elegirAlcance: false });
  });

  it('PRF_02_destinos_libres_son_los_huecos_libres_que_no_pasaron', () => {
    const pasado = { ...libre, pasada: true, inicio: 'p' };
    expect(destinosLibres([fila(), libre, pasado])).toEqual([libre]);
  });
});

describe('AVI-04 · mensajes de éxito', () => {
  it('AVI_04_cada_operacion_avisa_que_el_mail_sale_si_tiene_mail', () => {
    expect(mensajeExito('crear')).toBe(MENSAJES_PANEL.creada);
    expect(mensajeExito('crear', 'serie')).toBe(MENSAJES_PANEL.serieCreada);
    expect(mensajeExito('mover')).toBe(MENSAJES_PANEL.movida);
    expect(mensajeExito('cancelar')).toBe(MENSAJES_PANEL.cancelada);
    for (const m of [MENSAJES_PANEL.creada, MENSAJES_PANEL.movida, MENSAJES_PANEL.cancelada]) expect(m).toMatch(/si la persona tiene mail/i);
  });

  it('SEC_09_normaliza_la_observacion', () => {
    expect(normalizarObservacion('  a ')).toBe('a');
    expect(normalizarObservacion('   ')).toBeNull();
    expect(normalizarObservacion(undefined)).toBeNull();
  });
});

describe('hooks del panel', () => {
  it('PRF_05_useAgendaProfesor_lee_al_montar_y_vuelve_a_leer_al_cambiar_el_dia_y_al_recargar', async () => {
    const lector = vi.fn(async (dia: string) => [fila({ inicio: dia })]);
    const { result, rerender } = renderHook(({ dia }) => useAgendaProfesor(lector, dia), { initialProps: { dia: '2026-11-04' } });
    expect(result.current.lectura.estado).toBe('cargando');
    await waitFor(() => expect(result.current.lectura.estado).toBe('listo'));
    expect(result.current.lectura.datos?.[0]?.inicio).toBe('2026-11-04');
    rerender({ dia: '2026-11-05' });
    await waitFor(() => expect(result.current.lectura.datos?.[0]?.inicio).toBe('2026-11-05'));
    act(() => result.current.recargar());
    await waitFor(() => expect(lector).toHaveBeenCalledTimes(3));
  });

  it('SEC_17_un_error_de_lectura_queda_traducido_y_conserva_lo_anterior', async () => {
    let fallar = false;
    const lector = vi.fn(async () => {
      if (fallar) throw { message: 'PROHIBIDO' };
      return { solicitudes_pendientes: 1, cuentas_pendientes: 0 };
    });
    const { result } = renderHook(() => useContadores(lector));
    await waitFor(() => expect(result.current.lectura.estado).toBe('listo'));
    fallar = true;
    act(() => result.current.recargar());
    await waitFor(() => expect(result.current.lectura.estado).toBe('error'));
    expect(result.current.lectura.error).toBe(MENSAJES.PROHIBIDO);
    expect(result.current.lectura.datos).toEqual({ solicitudes_pendientes: 1, cuentas_pendientes: 0 });
  });

  it('SEC_17_un_error_en_la_primera_lectura_deja_datos_nulos', async () => {
    const lector = () => Promise.reject(new Error('x'));
    const { result } = renderHook(() => useLecturaPanel(lector));
    await waitFor(() => expect(result.current.lectura.estado).toBe('error'));
    expect(result.current.lectura).toEqual({ estado: 'error', datos: null, error: MENSAJE_GENERICO });
  });

  it('PRF_05_una_respuesta_vieja_no_pisa_a_la_nueva', async () => {
    let soltar: (v: FilaAgendaProfesor[]) => void = () => undefined;
    const lector = vi.fn((dia: string) =>
      dia === '2026-11-04' ? new Promise<FilaAgendaProfesor[]>((ok) => (soltar = ok)) : Promise.resolve([fila({ inicio: dia })]),
    );
    const { result, rerender } = renderHook(({ dia }) => useAgendaProfesor(lector, dia), { initialProps: { dia: '2026-11-04' } });
    rerender({ dia: '2026-11-05' });
    await waitFor(() => expect(result.current.lectura.estado).toBe('listo'));
    act(() => soltar([fila({ inicio: 'viejo' })]));
    expect(result.current.lectura.datos?.[0]?.inicio).toBe('2026-11-05');
  });
});

describe('index · dependencias reales', () => {
  it('SEC_06_las_funciones_del_index_usan_el_cliente_cargado_con_import', async () => {
    const { c } = cliente({ data: { solicitudes_pendientes: 0, cuentas_pendientes: 0 }, error: null });
    real.cliente = c;
    await expect(dependenciasPanel().obtenerCliente()).resolves.toBe(c);
    await expect(leerContadores()).resolves.toEqual({ solicitudes_pendientes: 0, cuentas_pendientes: 0 });
    c.rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(leerAgendaProfesor('2026-11-04')).resolves.toEqual([]);
    c.rpc.mockResolvedValueOnce({ data: { reserva_id: 'r', fechas: [], salteadas: [] }, error: null });
    await expect(crearClase(entrada)).resolves.toMatchObject({ ok: true });
    c.rpc.mockResolvedValueOnce({ data: { clase_id: 'c', fechas: [], salteadas: [] }, error: null });
    await expect(moverClase('c1', '2026-11-05T13:00:00Z', 'solo_esta')).resolves.toMatchObject({ ok: true });
    c.rpc.mockResolvedValueOnce({ data: { canceladas: 1 }, error: null });
    await expect(cancelarClase('c1', 'solo_esta')).resolves.toEqual({ ok: true, canceladas: 1 });
  });

  it('PRF_05_AVI_01_los_hooks_del_index_leen_con_el_cliente_real', async () => {
    const c = {
      rpc: vi.fn(async (nombre: string) =>
        nombre === 'contadores'
          ? { data: { solicitudes_pendientes: 3, cuentas_pendientes: 2 }, error: null }
          : { data: [libre], error: null },
      ),
    };
    real.cliente = c;
    const agenda = renderHook(() => useAgendaReal('2026-11-04'));
    const contadores = renderHook(() => useContadoresReal());
    await waitFor(() => expect(agenda.result.current.lectura.datos).toEqual([libre]));
    await waitFor(() => expect(totalPendientes(contadores.result.current.lectura.datos)).toBe(5));
  });
});
