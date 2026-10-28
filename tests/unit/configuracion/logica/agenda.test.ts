// B10 · T10.1 · Configuración de la agenda del profesor: duración, anticipación, huso y grilla (WEB-08).
// AGE-01, AGE-02, AGE-03, AGE-04, AGE-08, AGE-10, SEC-09, SEC-17. Apoyo de CA-12 y CA-54.
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  advertenciaCambioHuso,
  avisoSinEfectoEnClases,
  dependenciasConfiguracion,
  esZonaValida,
  falloConfiguracion,
  guardarConfiguracion,
  guardarGrilla,
  horaCorta,
  leerConfiguracionAgenda,
  MENSAJES_CONFIGURACION,
  validarConfiguracion,
  validarGrilla,
  zonasHorarias,
  type TramoGrilla,
} from '../../../../src/modulos/configuracion/logica';
import { MENSAJE_GENERICO, MENSAJES } from '../../../../src/lib/errores';

const real = vi.hoisted(() => ({ cliente: null as unknown }));
vi.mock('../../../../src/lib/supabase', () => ({ cargarSupabase: async () => real.cliente }));

type Resultado = { data: unknown; error: unknown };

function cliente(rpc: Resultado = { data: null, error: null }) {
  const c = { rpc: vi.fn(async () => rpc) };
  return { c, deps: { obtenerCliente: async () => c as unknown as SupabaseClient } };
}

function errorPg(message: string, details?: unknown, code = 'PT422') {
  return { code, message, details: details === undefined ? null : JSON.stringify(details) };
}

const CONFIG = { zona_horaria: 'America/Montevideo', duracion_min: 45, anticipacion_horas: 24, horizonte_semanas: 26 };
const ENTRADA = { duracionMin: 45, anticipacionHoras: 24, zonaHoraria: 'America/Montevideo' };

function tramo(dia_semana: TramoGrilla['dia_semana'], desde: string, hasta: string): TramoGrilla {
  return { dia_semana, desde, hasta };
}

describe('validación de la configuración (SEC-09)', () => {
  it('SEC_09_acepta_los_extremos_de_duracion_y_anticipacion', () => {
    expect(validarConfiguracion({ ...ENTRADA, duracionMin: 1, anticipacionHoras: 0 })).toBeNull();
    expect(validarConfiguracion({ ...ENTRADA, duracionMin: 1440, anticipacionHoras: 8784 })).toBeNull();
  });

  it('SEC_09_rechaza_duracion_fuera_de_1_a_1440_o_no_entera', () => {
    for (const duracionMin of [0, 1441, 30.5, Number.NaN]) {
      expect(validarConfiguracion({ ...ENTRADA, duracionMin })).toMatchObject({
        codigo: 'DATOS_INVALIDOS',
        campo: 'p_duracion_min',
        mensaje: MENSAJES_CONFIGURACION.duracionInvalida,
      });
    }
  });

  it('SEC_09_rechaza_anticipacion_fuera_de_0_a_8784', () => {
    for (const anticipacionHoras of [-1, 8785, 1.5]) {
      expect(validarConfiguracion({ ...ENTRADA, anticipacionHoras })?.campo).toBe('p_anticipacion_horas');
    }
  });

  it('AGE_08_rechaza_un_huso_que_no_es_iana', () => {
    expect(validarConfiguracion({ ...ENTRADA, zonaHoraria: 'Mars/Olympus' })).toMatchObject({
      campo: 'p_zona_horaria',
      mensaje: MENSAJES_CONFIGURACION.zonaInvalida,
    });
    expect(esZonaValida('')).toBe(false);
    expect(esZonaValida(' America/Montevideo')).toBe(false);
    expect(esZonaValida('America/Montevideo')).toBe(true);
  });

  it('AGE_08_lista_husos_ordenados_e_incluye_el_actual', () => {
    expect(zonasHorarias('Etc/Prueba', () => ['Europe/Madrid', 'America/Montevideo'])).toEqual([
      'America/Montevideo',
      'Etc/Prueba',
      'Europe/Madrid',
    ]);
    expect(zonasHorarias(null, () => ['UTC'])).toEqual(['UTC']);
    expect(zonasHorarias().length).toBeGreaterThan(0);
  });
});

describe('avisos al cambiar la configuración (AGE-03, AGE-10)', () => {
  it('AGE_10_cambiar_el_huso_avisa_que_solo_cambia_su_agenda', () => {
    const aviso = advertenciaCambioHuso('America/Montevideo', 'Europe/Madrid');
    expect(aviso).toBe(MENSAJES_CONFIGURACION.cambioHuso);
    expect(aviso).toContain('no la de otros profesores');
  });

  it('AGE_10_sin_cambio_de_huso_no_hay_aviso', () => {
    expect(advertenciaCambioHuso('America/Montevideo', 'America/Montevideo')).toBeNull();
    expect(advertenciaCambioHuso(null, 'America/Montevideo')).toBeNull();
  });

  it('AGE_03_cambiar_duracion_o_grilla_avisa_que_las_clases_conservan_su_horario', () => {
    expect(avisoSinEfectoEnClases(true)).toBe(MENSAJES_CONFIGURACION.sinEfectoEnClases);
    expect(avisoSinEfectoEnClases(false, true)).toBe(MENSAJES_CONFIGURACION.sinEfectoEnClases);
    expect(avisoSinEfectoEnClases(false)).toBeNull();
  });
});

describe('guardar_configuracion (AGE-02, AGE-04, AGE-08, AGE-10)', () => {
  it('AGE_10_guarda_la_configuracion_propia_y_devuelve_la_de_la_base', async () => {
    const { c, deps } = cliente({ data: CONFIG, error: null });
    await expect(guardarConfiguracion(ENTRADA, deps)).resolves.toEqual({ ok: true, ...CONFIG });
    expect(c.rpc).toHaveBeenCalledWith('guardar_configuracion', {
      p_duracion_min: 45,
      p_anticipacion_horas: 24,
      p_zona_horaria: 'America/Montevideo',
    });
  });

  it('SEC_09_un_invalido_no_sale_a_la_red', async () => {
    const { c, deps } = cliente();
    await expect(guardarConfiguracion({ ...ENTRADA, anticipacionHoras: 9000 }, deps)).resolves.toMatchObject({
      campo: 'p_anticipacion_horas',
    });
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it('SEC_09_el_422_de_la_base_marca_su_campo', async () => {
    const { deps } = cliente({ data: null, error: errorPg('DATOS_INVALIDOS', { campo: 'p_zona_horaria' }) });
    await expect(guardarConfiguracion(ENTRADA, deps)).resolves.toEqual({
      ok: false,
      codigo: 'DATOS_INVALIDOS',
      mensaje: MENSAJES_CONFIGURACION.zonaInvalida,
      campo: 'p_zona_horaria',
    });
  });

  it('SEC_06_un_no_profesor_recibe_403_traducido', async () => {
    const { deps } = cliente({ data: null, error: errorPg('PROHIBIDO', undefined, 'PT403') });
    await expect(guardarConfiguracion(ENTRADA, deps)).resolves.toMatchObject({
      codigo: 'PROHIBIDO',
      mensaje: MENSAJES.PROHIBIDO,
      campo: null,
    });
  });

  it('SEC_17_respuesta_sin_la_forma_del_contrato_o_fallo_de_red_da_texto_generico', async () => {
    const { deps } = cliente({ data: { zona_horaria: 'UTC' }, error: null });
    await expect(guardarConfiguracion(ENTRADA, deps)).resolves.toMatchObject({ ok: false, mensaje: MENSAJE_GENERICO });
    const caido = { obtenerCliente: async () => Promise.reject(new Error('interno')) };
    await expect(guardarConfiguracion(ENTRADA, caido)).resolves.toMatchObject({ ok: false, mensaje: MENSAJE_GENERICO });
  });

  it('SEC_17_un_422_de_campo_desconocido_o_sin_json_no_marca_campo', () => {
    expect(falloConfiguracion(errorPg('DATOS_INVALIDOS', { campo: 'otro' }))).toMatchObject({ campo: null });
    expect(falloConfiguracion({ message: 'DATOS_INVALIDOS', details: '{x' })).toMatchObject({
      campo: null,
      mensaje: MENSAJES.DATOS_INVALIDOS,
    });
  });
});

describe('validación de la grilla (AGE-01, SEC-09, contratos §1 «Validación de listas»)', () => {
  it('AGE_01_la_semilla_de_lunes_a_viernes_es_valida_y_la_lista_vacia_tambien', () => {
    const semilla = [1, 2, 3, 4, 5].flatMap((d) => [
      tramo(d as TramoGrilla['dia_semana'], '08:00', '13:00'),
      tramo(d as TramoGrilla['dia_semana'], '14:00', '18:00'),
    ]);
    expect(validarGrilla(semilla)).toEqual({ valida: true, porTramo: Array(10).fill(null), general: null });
    expect(validarGrilla([]).valida).toBe(true);
  });

  it('AGE_01_tramos_que_se_tocan_en_el_borde_y_fin_24_00_son_validos', () => {
    expect(validarGrilla([tramo(1, '08:00', '13:00'), tramo(1, '13:00', '24:00')]).valida).toBe(true);
  });

  it('SEC_09_marca_cada_tramo_con_su_error', () => {
    const v = validarGrilla([
      tramo(8 as TramoGrilla['dia_semana'], '08:00', '09:00'),
      tramo(1, '8:00', '09:00'),
      tramo(1, '10:00', '10:00'),
      tramo(1, '09:00', '11:00'),
      tramo(1, '10:30', '12:00'),
      tramo(2, '24:00', '24:00'),
    ]);
    expect(v.valida).toBe(false);
    expect(v.porTramo).toEqual([
      MENSAJES_CONFIGURACION.tramo.dia,
      MENSAJES_CONFIGURACION.tramo.hora,
      MENSAJES_CONFIGURACION.tramo.orden,
      null,
      MENSAJES_CONFIGURACION.tramo.solape,
      MENSAJES_CONFIGURACION.tramo.hora,
    ]);
  });

  it('SEC_09_un_solape_en_otro_dia_no_cuenta', () => {
    expect(validarGrilla([tramo(1, '09:00', '11:00'), tramo(2, '10:00', '12:00')]).valida).toBe(true);
  });

  it('SEC_09_mas_de_50_tramos_es_un_error_general', () => {
    const muchos = Array.from({ length: 51 }, (_, i) =>
      tramo(((i % 7) + 1) as TramoGrilla['dia_semana'], `${String(Math.floor(i / 7)).padStart(2, '0')}:00`, `${String(Math.floor(i / 7)).padStart(2, '0')}:30`),
    );
    const v = validarGrilla(muchos);
    expect(v.valida).toBe(false);
    expect(v.general).toBe(MENSAJES_CONFIGURACION.demasiadosTramos);
    expect(v.porTramo.every((t) => t === null)).toBe(true);
    expect(validarGrilla(muchos.slice(0, 50)).valida).toBe(true);
  });
});

describe('guardar_grilla (AGE-01, AGE-03, AGE-10)', () => {
  const tramos = [tramo(3, '14:00', '18:00'), tramo(1, '08:00', '24:00')];

  it('AGE_10_guarda_la_grilla_propia_y_devuelve_la_de_la_base_ordenada', async () => {
    const { c, deps } = cliente({
      data: [
        { dia_semana: 3, desde: '14:00', hasta: '18:00' },
        { dia_semana: 1, desde: '08:00', hasta: '24:00' },
      ],
      error: null,
    });
    await expect(guardarGrilla(tramos, deps)).resolves.toEqual({
      ok: true,
      grilla: [tramo(1, '08:00', '24:00'), tramo(3, '14:00', '18:00')],
    });
    expect(c.rpc).toHaveBeenCalledWith('guardar_grilla', { p_tramos: tramos });
  });

  it('AGE_01_una_grilla_invalida_no_sale_a_la_red_y_dice_que_tramo', async () => {
    const { c, deps } = cliente();
    const r = await guardarGrilla([tramo(1, '09:00', '08:00')], deps);
    expect(r).toMatchObject({ ok: false, campo: 'p_tramos', mensaje: MENSAJES_CONFIGURACION.grillaInvalida });
    expect(r.ok ? null : r.validacion?.porTramo).toEqual([MENSAJES_CONFIGURACION.tramo.orden]);
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it('SEC_09_mas_de_50_tramos_usa_el_texto_general', async () => {
    const { deps } = cliente();
    const muchos = Array.from({ length: 51 }, () => tramo(1, '08:00', '09:00'));
    await expect(guardarGrilla(muchos, deps)).resolves.toMatchObject({ mensaje: MENSAJES_CONFIGURACION.demasiadosTramos });
  });

  it('SEC_09_el_422_de_la_base_es_la_ultima_barrera', async () => {
    const { deps } = cliente({ data: null, error: errorPg('DATOS_INVALIDOS', { campo: 'p_tramos' }) });
    await expect(guardarGrilla(tramos, deps)).resolves.toEqual({
      ok: false,
      codigo: 'DATOS_INVALIDOS',
      mensaje: MENSAJES_CONFIGURACION.grillaInvalida,
      campo: 'p_tramos',
      validacion: null,
    });
  });

  it('SEC_17_un_fallo_de_red_da_texto_generico', async () => {
    const caido = { obtenerCliente: async () => Promise.reject(new Error('interno')) };
    await expect(guardarGrilla(tramos, caido)).resolves.toMatchObject({ ok: false, mensaje: MENSAJE_GENERICO, validacion: null });
  });
});

describe('lectura de la configuración propia (AGE-10, CA-52)', () => {
  function clienteTablas(perfil: Resultado, tramos: Resultado) {
    const llamadas: string[] = [];
    const consulta = (resultado: Resultado) => {
      const q = {
        select: vi.fn(() => q),
        eq: vi.fn((col: string, valor: string) => {
          llamadas.push(`${col}=${valor}`);
          return q;
        }),
        order: vi.fn(() => q),
        single: vi.fn(async () => resultado),
        then: (ok: (r: Resultado) => unknown, mal: (e: unknown) => unknown) => Promise.resolve(resultado).then(ok, mal),
      };
      return q;
    };
    const c = {
      from: vi.fn((tabla: string) => (tabla === 'profesor' ? consulta(perfil) : consulta(tramos))),
    };
    return { c, llamadas, deps: { obtenerCliente: async () => c as unknown as SupabaseClient } };
  }

  it('AGE_10_lee_solo_la_fila_y_la_grilla_del_profesor_de_la_sesion', async () => {
    const { c, llamadas, deps } = clienteTablas(
      { data: CONFIG, error: null },
      {
        data: [
          { dia_semana: 2, desde: '14:00:00', hasta: '24:00:00' },
          { dia_semana: 1, desde: '08:00:00', hasta: '13:00:00' },
        ],
        error: null,
      },
    );
    await expect(leerConfiguracionAgenda('p1', deps)).resolves.toEqual({
      config: CONFIG,
      grilla: [tramo(1, '08:00', '13:00'), tramo(2, '14:00', '24:00')],
    });
    expect(c.from).toHaveBeenCalledWith('profesor');
    expect(c.from).toHaveBeenCalledWith('grilla_tramo');
    expect(llamadas).toEqual(['id=p1', 'profesor_id=p1']);
  });

  it('SEC_17_lanza_el_error_de_lectura_para_que_la_vista_lo_traduzca', async () => {
    const error = errorPg('PROHIBIDO', undefined, 'PT403');
    await expect(leerConfiguracionAgenda('p1', clienteTablas({ data: null, error }, { data: [], error: null }).deps)).rejects.toBe(error);
    await expect(leerConfiguracionAgenda('p1', clienteTablas({ data: CONFIG, error: null }, { data: null, error }).deps)).rejects.toBe(error);
  });

  it('AGE_01_una_grilla_vacia_se_lee_como_lista_vacia', async () => {
    const { deps } = clienteTablas({ data: CONFIG, error: null }, { data: null, error: null });
    await expect(leerConfiguracionAgenda('p1', deps)).resolves.toEqual({ config: CONFIG, grilla: [] });
  });

  it('AGE_01_horaCorta_pasa_time_de_postgres_a_HH_MM', () => {
    expect(horaCorta('08:00:00')).toBe('08:00');
    expect(horaCorta('24:00:00')).toBe('24:00');
  });

  it('AGE_10_las_dependencias_reales_usan_supabase_cargado_con_import', async () => {
    const { c } = cliente({ data: CONFIG, error: null });
    real.cliente = c;
    expect(dependenciasConfiguracion()).toHaveProperty('obtenerCliente');
    await expect(guardarConfiguracion(ENTRADA)).resolves.toEqual({ ok: true, ...CONFIG });
  });
});
