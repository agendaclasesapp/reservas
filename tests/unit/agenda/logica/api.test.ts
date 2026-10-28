import { describe, expect, it, vi } from 'vitest';
import type { PostgrestClient } from '@supabase/postgrest-js';
import { crearClienteRest } from '../../../../src/lib/rest';
import { traducirError } from '../../../../src/lib/errores';
import {
  ErrorRespuestaInvalida,
  diaEnLimites,
  leerConfigPublica,
  leerHuecos,
  limitesAgenda,
  MENSAJE_ENLACE_NO_VALIDO,
  obtenerAgendaPublica,
  obtenerConfigPublica,
  type ConfigPublicaActiva,
} from '../../../../src/modulos/agenda/logica';

const SLUG = 'ana-perez';
const CONFIG: ConfigPublicaActiva = {
  profesor_id: 'p-ana',
  nombre: 'Ana Pérez',
  activo: true,
  zona_horaria: 'America/Montevideo',
  duracion_min: 60,
  anticipacion_horas: 24,
  horizonte_semanas: 26,
};

const HUECOS = [
  { inicio: '2026-11-02T11:00:00+00:00', fin: '2026-11-02T12:00:00+00:00', estado: 'libre' },
  { inicio: '2026-11-02T12:00:00+00:00', fin: '2026-11-02T13:00:00+00:00', estado: 'ocupado' },
  { inicio: '2026-11-02T17:00:00+00:00', fin: '2026-11-02T18:00:00+00:00', estado: 'bloqueado' },
];

function clienteFalso(respuesta: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => respuesta);
  return { cliente: { rpc } as unknown as PostgrestClient, rpc };
}

describe('leerHuecos (AGE-07, SEC-07)', () => {
  it('AGE_07_devuelve_los_tres_estados_con_inicio_y_fin', () => {
    expect(leerHuecos(HUECOS)).toEqual(HUECOS);
    expect(leerHuecos([])).toEqual([]);
  });

  it('SEC_07_descarta_toda_clave_fuera_de_inicio_fin_y_estado', () => {
    const conDatos = HUECOS.map((h) => ({ ...h, nombre: 'CENTINELA-NOMBRE', motivo: 'CENTINELA-MOTIVO' }));
    const huecos = leerHuecos(conDatos);
    for (const h of huecos) expect(Object.keys(h).sort()).toEqual(['estado', 'fin', 'inicio']);
    expect(JSON.stringify(huecos)).not.toContain('CENTINELA');
  });

  it('AGE_07_rechaza_un_estado_fuera_de_libre_ocupado_bloqueado', () => {
    expect(() => leerHuecos([{ ...HUECOS[0], estado: 'pendiente' }])).toThrow(ErrorRespuestaInvalida);
  });

  it('AGE_07_rechaza_respuestas_sin_forma_de_lista_o_con_instantes_invalidos', () => {
    expect(() => leerHuecos(null)).toThrow(ErrorRespuestaInvalida);
    expect(() => leerHuecos({ inicio: 'x' })).toThrow(ErrorRespuestaInvalida);
    expect(() => leerHuecos([null])).toThrow(ErrorRespuestaInvalida);
    expect(() => leerHuecos([{ ...HUECOS[0], inicio: 'no-es-fecha' }])).toThrow(ErrorRespuestaInvalida);
    expect(() => leerHuecos([{ ...HUECOS[0], fin: 3 }])).toThrow(ErrorRespuestaInvalida);
  });

  it('SEC_17_una_respuesta_invalida_se_muestra_con_el_mensaje_generico', () => {
    expect(traducirError(new ErrorRespuestaInvalida()).codigo).toBe('DESCONOCIDO');
  });
});

describe('obtenerAgendaPublica (ADR-017, ADR-020)', () => {
  it('AGE_09_pide_agenda_publica_con_p_slug_y_p_dia_y_devuelve_los_huecos', async () => {
    const { cliente, rpc } = clienteFalso({ data: HUECOS, error: null });
    await expect(obtenerAgendaPublica(SLUG, '2026-11-02', cliente)).resolves.toEqual(HUECOS);
    expect(rpc).toHaveBeenCalledWith('agenda_publica', { p_slug: SLUG, p_dia: '2026-11-02' });
  });

  it('AGE_09_el_slug_va_recortado_y_en_minusculas_como_lo_compara_la_base', async () => {
    const { cliente, rpc } = clienteFalso({ data: [], error: null });
    await obtenerAgendaPublica(' Ana-Perez ', '2026-11-02', cliente);
    expect(rpc).toHaveBeenCalledWith('agenda_publica', { p_slug: SLUG, p_dia: '2026-11-02' });
  });

  it.each(['ab', 'admin', 'con espacio', '-ana', 'ana-', 'a'.repeat(31), 'ana_perez', ''])(
    'AGE_09_un_slug_que_no_puede_ser_de_un_profesor_%s_da_404_sin_llamar_a_la_base',
    async (slug) => {
      const { cliente, rpc } = clienteFalso({ data: HUECOS, error: null });
      const error: unknown = await obtenerAgendaPublica(slug, '2026-11-02', cliente).catch((e: unknown) => e);
      expect(traducirError(error).codigo).toBe('NO_ENCONTRADO');
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it('AGE_11_relanza_el_409_de_profesor_inactivo', async () => {
    const error409 = { code: 'PT409', message: 'PROFESOR_INACTIVO', details: null };
    const { cliente } = clienteFalso({ data: null, error: error409 });
    const error: unknown = await obtenerAgendaPublica(SLUG, '2026-11-02', cliente).catch((e: unknown) => e);
    expect(error).toBe(error409);
    expect(traducirError(error).codigo).toBe('PROFESOR_INACTIVO');
  });

  it('SEC_09_un_dia_mal_formado_da_DATOS_INVALIDOS_sin_llamar_a_la_base', async () => {
    const { cliente, rpc } = clienteFalso({ data: [], error: null });
    const error: unknown = await obtenerAgendaPublica(SLUG, '2026-02-30', cliente).catch((e: unknown) => e);
    expect(traducirError(error).codigo).toBe('DATOS_INVALIDOS');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('SEC_09_relanza_el_422_de_p_dia_fuera_de_rango', async () => {
    const error422 = { code: 'PT422', message: 'DATOS_INVALIDOS', details: '{"campo":"p_dia"}' };
    const { cliente } = clienteFalso({ data: null, error: error422 });
    await expect(obtenerAgendaPublica(SLUG, '2030-01-01', cliente)).rejects.toBe(error422);
  });

  it('ADR_017_usa_el_cliente_rest_anonimo_contra_rpc_agenda_publica', async () => {
    const fetchFalso = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify(HUECOS), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const cliente = crearClienteRest(
      { supabaseUrl: 'http://127.0.0.1:54321', supabaseAnonKey: 'clave-anon-de-prueba' },
      fetchFalso,
    );
    await expect(obtenerAgendaPublica(SLUG, '2026-11-02', cliente)).resolves.toEqual(HUECOS);
    const [url, init] = fetchFalso.mock.calls[0]!;
    expect(String(url)).toBe('http://127.0.0.1:54321/rest/v1/rpc/agenda_publica');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ p_slug: SLUG, p_dia: '2026-11-02' });
    expect(new Headers(init?.headers).get('apikey')).toBe('clave-anon-de-prueba');
  });
});

describe('config pública (AGE-02, AGE-08, AGE-09, AGE-11)', () => {
  it('AGE_09_lee_nombre_huso_y_duracion_del_profesor_del_slug_y_descarta_lo_demas', async () => {
    const { cliente, rpc } = clienteFalso({ data: { ...CONFIG, extra: 'x', mail: 'ana@example.com' }, error: null });
    await expect(obtenerConfigPublica(SLUG, cliente)).resolves.toEqual(CONFIG);
    expect(rpc).toHaveBeenCalledWith('config_publica', { p_slug: SLUG });
  });

  it('AGE_11_inactivo_solo_id_nombre_y_activo_false_sin_agenda', () => {
    const inactivo = { profesor_id: 'p-ana', nombre: 'Ana Pérez', activo: false, zona_horaria: 'UTC', duracion_min: 60 };
    expect(leerConfigPublica(inactivo)).toEqual({ profesor_id: 'p-ana', nombre: 'Ana Pérez', activo: false });
  });

  it('SEC_16_el_nombre_del_profesor_llega_como_texto_sin_tocar', () => {
    const nombre = '<b>Ana</b> & "co"';
    expect(leerConfigPublica({ ...CONFIG, nombre }).nombre).toBe(nombre);
  });

  it('AGE_09_rechaza_una_config_sin_profesor_nombre_o_activo', () => {
    expect(() => leerConfigPublica({ ...CONFIG, profesor_id: '' })).toThrow(ErrorRespuestaInvalida);
    expect(() => leerConfigPublica({ ...CONFIG, nombre: 3 })).toThrow(ErrorRespuestaInvalida);
    expect(() => leerConfigPublica({ ...CONFIG, activo: 'si' })).toThrow(ErrorRespuestaInvalida);
    expect(() => leerConfigPublica({ profesor_id: 'p', nombre: 'A', activo: false, extra: 1 })).not.toThrow();
  });

  it('AGE_09_un_slug_invalido_da_404_sin_llamar_y_el_texto_es_el_de_la_spec', async () => {
    const { cliente, rpc } = clienteFalso({ data: CONFIG, error: null });
    const error: unknown = await obtenerConfigPublica('reservas', cliente).catch((e: unknown) => e);
    expect(traducirError(error).codigo).toBe('NO_ENCONTRADO');
    expect(rpc).not.toHaveBeenCalled();
    expect(MENSAJE_ENLACE_NO_VALIDO).toBe('Enlace no válido, pedile el enlace a tu profesor');
  });

  it('AGE_08_rechaza_una_config_sin_huso_o_con_duracion_cero', () => {
    expect(() => leerConfigPublica({ ...CONFIG, zona_horaria: '' })).toThrow(ErrorRespuestaInvalida);
    expect(() => leerConfigPublica({ ...CONFIG, duracion_min: 0 })).toThrow(ErrorRespuestaInvalida);
    expect(() => leerConfigPublica({ ...CONFIG, horizonte_semanas: 1.5 })).toThrow(ErrorRespuestaInvalida);
    expect(() => leerConfigPublica({ ...CONFIG, anticipacion_horas: -1 })).toThrow(ErrorRespuestaInvalida);
    expect(() => leerConfigPublica([CONFIG])).toThrow(ErrorRespuestaInvalida);
  });

  it('AGE_08_propaga_el_error_de_la_base', async () => {
    const fallo = { message: 'Failed to fetch' };
    const { cliente } = clienteFalso({ data: null, error: fallo });
    await expect(obtenerConfigPublica(SLUG, cliente)).rejects.toBe(fallo);
  });
});

describe('limitesAgenda (SEC-09)', () => {
  it('SEC_09_va_de_hoy_menos_366_a_hoy_mas_horizonte_mas_31_en_el_huso_del_profesor', () => {
    // 2026-11-02 01:00 UTC = 1 de noviembre 22:00 en Montevideo: hoy es el 1.
    const limites = limitesAgenda(CONFIG, new Date('2026-11-02T01:00:00Z'));
    expect(limites).toEqual({ hoy: '2026-11-01', min: '2025-10-31', max: '2027-06-02' });
  });

  it('SEC_09_los_extremos_entran_y_un_dia_mas_alla_no', () => {
    const limites = limitesAgenda(CONFIG, new Date('2026-11-02T15:00:00Z'));
    expect(limites).toEqual({ hoy: '2026-11-02', min: '2025-11-01', max: '2027-06-03' });
    expect(diaEnLimites(limites.min, limites)).toBe(true);
    expect(diaEnLimites(limites.max, limites)).toBe(true);
    expect(diaEnLimites('2025-10-31', limites)).toBe(false);
    expect(diaEnLimites('2027-06-04', limites)).toBe(false);
    expect(diaEnLimites('no-es-dia', limites)).toBe(false);
  });
});
