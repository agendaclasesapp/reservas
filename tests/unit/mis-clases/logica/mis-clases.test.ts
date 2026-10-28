// B07 · T07.1 · Lógica de Mis clases: lectura de `v_mis_clases`, grupos, textos, huso y vínculos por profesor.
// RES-06, SOL-08, ALU-03, WEB-05; CA-20, CA-25, CA-45, CA-53, CA-63.
import type { SupabaseClient } from '@supabase/supabase-js';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SesionActual } from '../../../../src/estado';
import { MENSAJES } from '../../../../src/lib/errores';
import {
  agruparMisClases,
  dependenciasMisClases,
  esPendienteSinRespuesta,
  hayVariosHusos,
  horarioDeClase,
  leerMisClases,
  MENSAJES_MIS_CLASES,
  profesorDeClase,
  profesoresDeMisClases,
  textoEstadoClase,
  textoSolicitudDeClase,
  useMisClases as useMisClasesReal,
  type ClaseMia,
} from '../../../../src/modulos/mis-clases/logica';
import { useMisClases } from '../../../../src/modulos/mis-clases/logica/useMisClases';

const real = vi.hoisted(() => ({ cliente: null as unknown }));
vi.mock('../../../../src/lib/supabase', () => ({ cargarSupabase: async () => real.cliente }));

type Resultado = { data: unknown; error: unknown };

function cliente(filas: Resultado = { data: [], error: null }) {
  const consulta = {
    select: vi.fn(() => consulta),
    order: vi.fn(async () => filas),
  };
  const c = { from: vi.fn(() => consulta) };
  return { c, consulta, deps: { obtenerCliente: async () => c as unknown as SupabaseClient } };
}

const err = (code: string, message: string) => ({ code, message, details: null, hint: null });

const A = 'pa';
const B = 'pb';

function clase(id: string, cambios: Partial<ClaseMia> = {}): ClaseMia {
  return {
    id,
    inicio: '2026-11-03T15:00:00+00:00',
    fin: '2026-11-03T16:00:00+00:00',
    estado: 'confirmada',
    quien_toma: 'Dani',
    persona_a_cargo_id: null,
    observacion: null,
    reserva_tipo: 'suelta',
    frecuencia: null,
    solicitud_pendiente: null,
    pasada: false,
    reserva_id: `r-${id}`,
    profesor_id: A,
    profesor_nombre: 'Profe A',
    profesor_slug: 'profe-a',
    zona_horaria: 'America/Montevideo',
    ...cambios,
  };
}

function sesion(inscripciones: SesionActual['inscripciones'], rol: SesionActual['rol'] = 'alumno'): SesionActual {
  return {
    rol,
    es_administrador: false,
    profesor: null,
    alumno_id: 'al1',
    estado: 'completa',
    nombre: 'Dani',
    mail: 'dani@example.test',
    inscripciones,
  };
}

const INS_A = {
  profesor_id: A,
  slug: 'profe-a',
  profesor_nombre: 'Profe A',
  profesor_activo: true,
  estado: 'aprobado' as const,
  motivo_rechazo: null,
};
const INS_B = {
  profesor_id: B,
  slug: 'profe-b',
  profesor_nombre: 'Profe B',
  profesor_activo: false,
  estado: 'rechazado' as const,
  motivo_rechazo: '<script>alert(1)</script> no hay cupo',
};

describe('leerMisClases (RES-06)', () => {
  it('RES_06_lee_v_mis_clases_por_inicio_con_las_columnas_del_profesor', async () => {
    const fila = clase('c1');
    const { c, consulta, deps } = cliente({ data: [fila], error: null });
    expect(await leerMisClases(deps)).toEqual([fila]);
    expect(c.from).toHaveBeenCalledWith('v_mis_clases');
    const columnas = (consulta.select.mock.calls[0] as unknown[])[0] as string;
    for (const col of ['profesor_id', 'profesor_nombre', 'profesor_slug', 'zona_horaria', 'quien_toma', 'pasada']) {
      expect(columnas).toContain(col);
    }
    expect(consulta.order).toHaveBeenCalledWith('inicio');
  });

  it('RES_06_un_error_se_lanza_una_fila_invalida_tambien_y_null_es_lista_vacia', async () => {
    await expect(leerMisClases(cliente({ data: null, error: err('PT403', 'PROHIBIDO') }).deps)).rejects.toMatchObject({
      message: 'PROHIBIDO',
    });
    await expect(leerMisClases(cliente({ data: [{ ...clase('c1'), estado: 'otro' }], error: null }).deps)).rejects.toThrow();
    expect(await leerMisClases(cliente({ data: null, error: null }).deps)).toEqual([]);
  });
});

describe('grupos y textos (WEB-05, CA-20, CA-25)', () => {
  const proxima2 = clase('p2', { inicio: '2026-11-10T15:00:00+00:00' });
  const proxima1 = clase('p1', { inicio: '2026-11-04T15:00:00+00:00' });
  const pendiente = clase('q1', {
    estado: 'pendiente',
    solicitud_pendiente: { id: 's1', tipo: 'reserva', alcance: null, vencida: false },
  });
  const vieja = clase('v1', { inicio: '2026-10-01T15:00:00+00:00', pasada: true });
  const sinRespuesta = clase('v2', {
    inicio: '2026-10-20T15:00:00+00:00',
    estado: 'pendiente',
    pasada: true,
    solicitud_pendiente: { id: 's2', tipo: 'reserva', alcance: null, vencida: true },
  });
  const rechazada = clase('x1', { estado: 'rechazada', inicio: '2026-11-20T15:00:00+00:00' });

  it('RES_06_separa_pendientes_proximas_pasadas_y_canceladas_con_su_orden', () => {
    const g = agruparMisClases([proxima2, vieja, rechazada, pendiente, sinRespuesta, proxima1]);
    expect(g.pendientes.map((c) => c.id)).toEqual(['q1']);
    expect(g.proximas.map((c) => c.id)).toEqual(['p1', 'p2']);
    expect(g.pasadas.map((c) => c.id)).toEqual(['v2', 'v1']);
    expect(g.canceladas.map((c) => c.id)).toEqual(['x1']);
    expect(agruparMisClases([])).toEqual({ pendientes: [], proximas: [], pasadas: [], canceladas: [] });
  });

  it('SOL_08_una_pendiente_pasada_figura_como_pendiente_sin_respuesta', () => {
    expect(esPendienteSinRespuesta(sinRespuesta)).toBe(true);
    expect(textoEstadoClase(sinRespuesta)).toBe(MENSAJES_MIS_CLASES.pendienteSinRespuesta);
    expect(esPendienteSinRespuesta(pendiente)).toBe(false);
    expect(textoEstadoClase(pendiente)).toBe('Pendiente de confirmación');
    expect(esPendienteSinRespuesta({ ...pendiente, solicitud_pendiente: { id: 's', tipo: 'reserva', alcance: null, vencida: true } })).toBe(true);
    expect(esPendienteSinRespuesta(vieja)).toBe(false);
    expect(textoEstadoClase(vieja)).toBe('Confirmada');
    expect(textoEstadoClase(rechazada)).toBe('Rechazada');
  });

  it('CA_20_aviso_de_la_solicitud_en_curso_solo_si_no_vencio', () => {
    expect(textoSolicitudDeClase(pendiente)).toBe(MENSAJES_MIS_CLASES.solicitud.reserva);
    expect(textoSolicitudDeClase(sinRespuesta)).toBeNull();
    expect(textoSolicitudDeClase(proxima1)).toBeNull();
    const cancelando = clase('k', { solicitud_pendiente: { id: 's', tipo: 'cancelacion', alcance: 'solo_esta', vencida: false } });
    expect(textoSolicitudDeClase(cancelando)).toBe(MENSAJES_MIS_CLASES.solicitud.cancelacion);
    expect(textoSolicitudDeClase({ ...cancelando, pasada: true })).toBeNull();
  });
});

describe('huso y profesor de cada clase (CA-53, ADR-004)', () => {
  it('CA_53_la_hora_sale_en_el_huso_del_profesor_de_esa_clase', () => {
    const deA = clase('a', { inicio: '2026-11-03T15:00:00+00:00', fin: '2026-11-03T16:00:00+00:00' });
    const deB = clase('b', {
      profesor_id: B,
      zona_horaria: 'Europe/Madrid',
      inicio: '2026-11-04T11:00:00+00:00',
      fin: '2026-11-04T12:00:00+00:00',
    });
    expect(horarioDeClase(deA)).toEqual({ fecha: 'martes, 3 de noviembre', desde: '12:00', hasta: '13:00', zona: 'America/Montevideo' });
    expect(horarioDeClase(deB)).toMatchObject({ desde: '12:00', hasta: '13:00', zona: 'Europe/Madrid' });
    expect(hayVariosHusos([deA, deB])).toBe(true);
    expect(hayVariosHusos([deA, clase('a2')])).toBe(false);
  });

  it('CA_53_sin_huso_usa_el_por_defecto_del_profesor_y_no_el_del_navegador', () => {
    expect(horarioDeClase(clase('z', { zona_horaria: null })).zona).toBe('America/Montevideo');
  });

  it('CA_53_nombre_del_profesor_como_texto_con_respaldo', () => {
    expect(profesorDeClase(clase('a'))).toBe('Profe A');
    expect(profesorDeClase(clase('a', { profesor_nombre: '  ' }))).toBe(MENSAJES_MIS_CLASES.profesorSinNombre);
    expect(profesorDeClase(clase('a', { profesor_nombre: null }))).toBe(MENSAJES_MIS_CLASES.profesorSinNombre);
  });
});

describe('profesoresDeMisClases (ALU-03, CA-45, CA-53, CA-63)', () => {
  it('ALU_03_vinculos_de_la_sesion_con_estado_motivo_como_texto_y_sus_clases', () => {
    const a2 = clase('a2', { inicio: '2026-11-05T15:00:00+00:00' });
    const a1 = clase('a1');
    const b1 = clase('b1', { profesor_id: B, profesor_nombre: 'Profe B', zona_horaria: 'Europe/Madrid' });
    const r = profesoresDeMisClases(sesion([INS_A, INS_B]), [a2, b1, a1]);
    expect(r.map((p) => [p.profesorId, p.estado, p.textoEstado, p.clases.map((c) => c.id)])).toEqual([
      [A, 'aprobado', 'Aprobado', ['a1', 'a2']],
      [B, 'rechazado', 'Rechazado', ['b1']],
    ]);
    expect(r[1]?.motivoRechazo).toBe('<script>alert(1)</script> no hay cupo');
    expect(r[1]?.profesorActivo).toBe(false);
    expect(r[0]?.motivoRechazo).toBeNull();
  });

  it('CA_45_rechazo_sin_motivo_solo_muestra_el_estado', () => {
    const r = profesoresDeMisClases(sesion([{ ...INS_B, motivo_rechazo: '   ' }]), []);
    expect(r).toEqual([
      {
        profesorId: B,
        slug: 'profe-b',
        profesorNombre: 'Profe B',
        profesorActivo: false,
        estado: 'rechazado',
        textoEstado: 'Rechazado',
        motivoRechazo: null,
        clases: [],
      },
    ]);
  });

  it('CA_63_un_profesor_sin_vinculo_vigente_sigue_con_sus_clases_y_sin_estado', () => {
    const c1 = clase('c1', { profesor_id: 'pz', profesor_nombre: 'Zoe', profesor_slug: 'zoe' });
    const c2 = clase('c2', { profesor_id: 'py', profesor_nombre: 'Yago', profesor_slug: null });
    const r = profesoresDeMisClases(sesion([INS_A]), [c1, c2]);
    expect(r.map((p) => [p.profesorId, p.profesorNombre, p.estado, p.textoEstado, p.slug])).toEqual([
      [A, 'Profe A', 'aprobado', 'Aprobado', 'profe-a'],
      ['py', 'Yago', null, MENSAJES_MIS_CLASES.sinVinculo, null],
      ['pz', 'Zoe', null, MENSAJES_MIS_CLASES.sinVinculo, 'zoe'],
    ]);
  });

  it('ALU_03_sin_sesion_de_persona_no_hay_vinculos', () => {
    expect(profesoresDeMisClases(null, [])).toEqual([]);
    expect(profesoresDeMisClases(sesion([INS_A], 'profesor'), [])).toEqual([]);
  });
});

describe('useMisClases (RES-06)', () => {
  it('RES_06_carga_y_recarga_conservando_las_clases', async () => {
    const fila = clase('c1');
    const lector = vi.fn().mockResolvedValueOnce([fila]).mockRejectedValueOnce(err('PT403', 'PROHIBIDO'));
    const { result } = renderHook(() => useMisClases(lector));
    expect(result.current.datos.estado).toBe('cargando');
    await waitFor(() => expect(result.current.datos).toEqual({ estado: 'listo', clases: [fila], error: null }));
    act(() => result.current.recargar());
    expect(result.current.datos).toEqual({ estado: 'cargando', clases: [fila], error: null });
    await waitFor(() => expect(result.current.datos.estado).toBe('error'));
    expect(result.current.datos).toEqual({ estado: 'error', clases: [fila], error: MENSAJES.PROHIBIDO });
  });

  it('RES_06_el_hook_publico_lee_con_el_cliente_real', async () => {
    const { c, deps } = cliente({ data: [clase('c1')], error: null });
    real.cliente = await deps.obtenerCliente();
    const { result } = renderHook(() => useMisClasesReal());
    await waitFor(() => expect(result.current.datos.estado).toBe('listo'));
    expect(result.current.datos.clases).toHaveLength(1);
    expect(c.from).toHaveBeenCalledWith('v_mis_clases');
    expect(typeof dependenciasMisClases().obtenerCliente).toBe('function');
  });
});
