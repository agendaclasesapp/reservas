// B16 · T16.1 · Lector de varios días de la agenda del profesor: `agenda_profesor_dias(p_desde, p_hasta)`.
// contratos.md §2 (calendario-profesor), ADR-023. CAL-07, CAL-08, CAL-09, INV-02, INV-05, SEC-09, SEC-17, SEC-34,
// SEC-35.
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import {
  ErrorAgendaDias,
  esquemaFilaAgenda,
  esquemaFilaAgendaDias,
  leerAgendaDias,
  MAX_DIAS_AGENDA,
  type FilaAgendaDias,
} from '../../../../src/modulos/panel/logica';
import { leerAgendaDias as leerConDeps } from '../../../../src/modulos/panel/logica/agendaDias';
import { MENSAJE_GENERICO, MENSAJE_SIN_CONEXION, MENSAJES, mensajeDeError } from '../../../../src/lib/errores';

const real = vi.hoisted(() => ({ cliente: null as unknown }));
vi.mock('../../../../src/lib/supabase', () => ({ cargarSupabase: async () => real.cliente }));

type Resultado = { data: unknown; error: unknown };

function cliente(rpc: Resultado = { data: [], error: null }) {
  const c = { rpc: vi.fn(async () => rpc) };
  return { c, deps: { obtenerCliente: async () => c as unknown as SupabaseClient } };
}

const HOSTIL = '<img src=x onerror=alert(1)> Ana';

function fila(cambios: Partial<FilaAgendaDias> = {}): FilaAgendaDias {
  return {
    inicio: '2026-10-30T13:00:00+00:00',
    fin: '2026-10-30T13:30:00+00:00',
    estado: 'ocupado',
    clase_id: 'c1',
    solicitud_id: null,
    quien_toma: 'Ana Pérez',
    titular: 'Ana Pérez',
    observacion: null,
    clase_estado: 'confirmada',
    bloqueo_id: null,
    bloqueo_motivo: null,
    reserva_tipo: 'serie',
    pasada: false,
    dia: '2026-10-30',
    clase_inicio: '2026-10-30T13:00:00+00:00',
    clase_fin: '2026-10-30T14:00:00+00:00',
    solicitud_tipo: null,
    ...cambios,
  };
}

const COLUMNAS_AGENDA_PROFESOR = [
  'inicio',
  'fin',
  'estado',
  'clase_id',
  'solicitud_id',
  'quien_toma',
  'titular',
  'observacion',
  'clase_estado',
  'bloqueo_id',
  'bloqueo_motivo',
  'reserva_tipo',
  'pasada',
];

/** Todo lo que el error deja ver: nada de esto puede traer `details` ni datos de las filas (SEC-17, SEC-35). */
function visible(e: ErrorAgendaDias): string {
  return [e.message, e.mensaje, e.stack ?? '', String(e), JSON.stringify(e), JSON.stringify(Object.entries(e))].join(
    '\n',
  );
}

async function fallo(promesa: Promise<unknown>): Promise<ErrorAgendaDias> {
  const e = await promesa.then(
    () => null,
    (x: unknown) => x,
  );
  expect(e).toBeInstanceOf(ErrorAgendaDias);
  return e as ErrorAgendaDias;
}

let consola: MockInstance[] = [];

beforeEach(() => {
  consola = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => undefined),
  );
});

afterEach(() => {
  // SEC-17, SEC-35: el lector no escribe en la consola, tampoco al fallar.
  for (const espia of consola) expect(espia).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe('leerAgendaDias · caso feliz', () => {
  it('CAL_07_CAL_08_INV_02_lee_el_rango_con_solo_p_desde_y_p_hasta_y_devuelve_las_filas_validadas', async () => {
    const pendiente = fila({
      inicio: '2026-11-01T15:00:00+00:00',
      fin: '2026-11-01T15:30:00+00:00',
      clase_id: 'c2',
      solicitud_id: 's1',
      clase_estado: 'pendiente',
      reserva_tipo: 'suelta',
      dia: '2026-11-01',
      clase_inicio: '2026-11-01T15:00:00+00:00',
      clase_fin: '2026-11-01T15:30:00+00:00',
      solicitud_tipo: 'reserva',
    });
    const filas = [fila(), fila({ inicio: '2026-10-30T13:30:00+00:00', fin: '2026-10-30T14:00:00+00:00' }), pendiente];
    const { c, deps } = cliente({ data: filas, error: null });

    const r = await leerConDeps('2026-10-26', '2026-11-01', deps);

    // INV-02, SEC-32: el profesor sale de la sesión en la base; el lector no manda ningún id.
    expect(c.rpc).toHaveBeenCalledTimes(1);
    expect(c.rpc).toHaveBeenCalledWith('agenda_profesor_dias', { p_desde: '2026-10-26', p_hasta: '2026-11-01' });
    expect(r).toEqual(filas);
    // CAL-07: una clase de 60 min sobre huecos de 30 trae en cada fila sus horas reales.
    expect(r.filter((f) => f.clase_id === 'c1').map((f) => [f.clase_inicio, f.clase_fin])).toEqual([
      ['2026-10-30T13:00:00+00:00', '2026-10-30T14:00:00+00:00'],
      ['2026-10-30T13:00:00+00:00', '2026-10-30T14:00:00+00:00'],
    ]);
    // CAL-08: el tipo de la solicitud pendiente llega para distinguir PENDIENTE.
    expect(r[2]?.solicitud_tipo).toBe('reserva');
  });

  it('CAL_08_acepta_los_tres_tipos_de_solicitud_y_las_filas_sin_clase_ni_solicitud', async () => {
    const filas = [
      fila({ solicitud_id: 's1', solicitud_tipo: 'movimiento' }),
      fila({ solicitud_id: 's2', solicitud_tipo: 'cancelacion' }),
      fila({
        estado: 'libre',
        clase_id: null,
        quien_toma: null,
        titular: null,
        clase_estado: null,
        reserva_tipo: null,
        clase_inicio: null,
        clase_fin: null,
      }),
      fila({
        estado: 'bloqueado',
        clase_id: null,
        quien_toma: null,
        titular: null,
        clase_estado: null,
        reserva_tipo: null,
        bloqueo_id: 'b1',
        bloqueo_motivo: HOSTIL,
        clase_inicio: null,
        clase_fin: null,
      }),
    ];
    const { deps } = cliente({ data: filas, error: null });
    await expect(leerConDeps('2026-10-30', '2026-10-30', deps)).resolves.toEqual(filas);
  });

  it('SEC_09_un_dia_y_siete_dias_salen_a_la_red_y_sin_datos_devuelve_lista_vacia', async () => {
    const { c, deps } = cliente({ data: null, error: null });
    await expect(leerConDeps('2026-10-30', '2026-10-30', deps)).resolves.toEqual([]);
    await expect(leerConDeps('2026-10-26', '2026-11-01', deps)).resolves.toEqual([]);
    // Cruza fin de año y el cambio de horario de otros husos: la cuenta es de días de calendario.
    await expect(leerConDeps('2026-12-29', '2027-01-04', deps)).resolves.toEqual([]);
    expect(c.rpc).toHaveBeenCalledTimes(3);
    expect(MAX_DIAS_AGENDA).toBe(7);
  });

  it('INV_05_la_api_publica_usa_el_cliente_real_por_defecto', async () => {
    const { c } = cliente({ data: [fila()], error: null });
    real.cliente = c;
    await expect(leerAgendaDias('2026-10-30', '2026-10-30')).resolves.toEqual([fila()]);
    expect(c.rpc).toHaveBeenCalledWith('agenda_profesor_dias', { p_desde: '2026-10-30', p_hasta: '2026-10-30' });
  });
});

describe('esquemaFilaAgendaDias · columnas (SEC-34)', () => {
  it('SEC_34_tiene_exactamente_las_13_columnas_de_agenda_profesor_mas_dia_clase_inicio_clase_fin_y_solicitud_tipo', () => {
    expect(Object.keys(esquemaFilaAgenda.shape)).toEqual(COLUMNAS_AGENDA_PROFESOR);
    expect(Object.keys(esquemaFilaAgendaDias.shape)).toEqual([
      ...COLUMNAS_AGENDA_PROFESOR,
      'dia',
      'clase_inicio',
      'clase_fin',
      'solicitud_tipo',
    ]);
  });

  it('SEC_34_una_columna_extra_que_llegara_se_descarta_y_no_entra_a_la_web', async () => {
    const conExtra = { ...fila(), mail: 'ana@ejemplo.test', telefono: '099 000 000' };
    const { deps } = cliente({ data: [conExtra], error: null });
    const [r] = await leerConDeps('2026-10-30', '2026-10-30', deps);
    expect(Object.keys(r ?? {})).toEqual(Object.keys(esquemaFilaAgendaDias.shape));
    expect(r).not.toHaveProperty('mail');
    expect(r).not.toHaveProperty('telefono');
  });
});

describe('leerAgendaDias · errores (SEC-17, SEC-35)', () => {
  it.each([
    ['CAL_09_clase_estado_cancelada', [fila({ clase_estado: 'cancelada' as never, quien_toma: HOSTIL })]],
    ['solicitud_tipo_desconocido', [fila({ solicitud_tipo: 'otro' as never, quien_toma: HOSTIL })]],
    ['dia_mal_formado', [fila({ dia: '30/10/2026', quien_toma: HOSTIL })]],
    ['sin_solicitud_tipo', [Object.fromEntries(Object.entries(fila({ quien_toma: HOSTIL })).filter(([k]) => k !== 'solicitud_tipo'))]],
    ['no_es_una_lista', { quien_toma: HOSTIL }],
  ])(
    'SEC_35_respuesta_de_forma_invalida_%s_da_el_mensaje_generico_sin_details_ni_filas_ni_console',
    async (_caso, data) => {
      const { deps } = cliente({ data, error: null });
      const e = await fallo(leerConDeps('2026-10-30', '2026-10-30', deps));
      expect(e.codigo).toBe('DESCONOCIDO');
      expect(e.mensaje).toBe(MENSAJE_GENERICO);
      expect(mensajeDeError(e)).toBe(MENSAJE_GENERICO);
      expect(e).not.toHaveProperty('details');
      expect(e).not.toHaveProperty('issues');
      expect(e.cause).toBeUndefined();
      expect(visible(e)).not.toContain('Ana');
      expect(visible(e)).not.toContain('onerror');
    },
  );

  it('SEC_17_error_desconocido_de_la_rpc_da_el_mensaje_generico_sin_details_ni_mensaje_de_postgres', async () => {
    const error = {
      code: 'XX000',
      message: 'relation "public.clase" does not exist',
      details: JSON.stringify({ quien_toma: HOSTIL }),
      hint: 'Ana Pérez',
    };
    const { deps } = cliente({ data: [fila({ quien_toma: HOSTIL })], error });
    const e = await fallo(leerConDeps('2026-10-26', '2026-11-01', deps));
    expect(e.codigo).toBe('DESCONOCIDO');
    expect(e.mensaje).toBe(MENSAJE_GENERICO);
    expect(mensajeDeError(e)).toBe(MENSAJE_GENERICO);
    expect(e).not.toHaveProperty('details');
    expect(e).not.toHaveProperty('hint');
    expect(e).not.toHaveProperty('code');
    expect(visible(e)).not.toContain('relation');
    expect(visible(e)).not.toContain('Ana');
  });

  it('SEC_17_una_excepcion_inesperada_del_cliente_da_el_mensaje_generico', async () => {
    const deps = {
      obtenerCliente: async () => {
        throw new Error(`fallo interno con ${HOSTIL}`);
      },
    };
    const e = await fallo(leerConDeps('2026-10-30', '2026-10-30', deps));
    expect(e.codigo).toBe('DESCONOCIDO');
    expect(mensajeDeError(e)).toBe(MENSAJE_GENERICO);
    expect(visible(e)).not.toContain('Ana');
  });

  it.each([
    ['NO_AUTENTICADO', 'PT401', null],
    ['PROHIBIDO', 'PT403', null],
    ['DATOS_INVALIDOS', 'PT422', JSON.stringify({ campo: 'p_hasta' })],
  ] as const)('SEC_17_INV_02_error_%s_de_la_rpc_da_el_texto_del_catalogo_sin_details', async (codigo, code, details) => {
    const { deps } = cliente({ data: null, error: { code, message: codigo, details } });
    const e = await fallo(leerConDeps('2026-10-26', '2026-11-01', deps));
    expect(e.codigo).toBe(codigo);
    expect(e.mensaje).toBe(MENSAJES[codigo]);
    expect(mensajeDeError(e)).toBe(MENSAJES[codigo]);
    expect(e).not.toHaveProperty('details');
    expect(visible(e)).not.toContain('p_hasta');
  });

  it('SEC_17_falla_de_red_da_el_texto_sin_conexion', async () => {
    const deps = {
      obtenerCliente: async () => ({
        rpc: async () => {
          throw new TypeError('Failed to fetch https://ejemplo.test/rest/v1/rpc/agenda_profesor_dias');
        },
      }) as unknown as SupabaseClient,
    };
    const e = await fallo(leerConDeps('2026-10-30', '2026-10-30', deps));
    expect(e.codigo).toBe('SIN_CONEXION');
    expect(e.mensaje).toBe(MENSAJE_SIN_CONEXION);
    expect(mensajeDeError(e)).toBe(MENSAJE_SIN_CONEXION);
    expect(visible(e)).not.toContain('ejemplo.test');
  });

  it.each([
    ['hasta_antes_que_desde', '2026-10-30', '2026-10-29'],
    ['ocho_dias', '2026-10-26', '2026-11-02'],
    ['desde_mal_formado', '2026-13-01', '2026-10-30'],
    ['hasta_mal_formado', '2026-10-30', ''],
  ])('SEC_09_rango_invalido_%s_no_sale_a_la_red_y_da_datos_invalidos', async (_caso, desde, hasta) => {
    const { c, deps } = cliente();
    const e = await fallo(leerConDeps(desde, hasta, deps));
    expect(c.rpc).not.toHaveBeenCalled();
    expect(e.codigo).toBe('DATOS_INVALIDOS');
    expect(mensajeDeError(e)).toBe(MENSAJES.DATOS_INVALIDOS);
  });
});
