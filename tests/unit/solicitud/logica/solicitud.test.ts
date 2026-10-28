import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  accionAlTocarHueco,
  dependenciasSolicitud,
  esquemaSolicitud,
  falloDe,
  LARGO_MAX_OBSERVACION,
  leerMisSolicitudes,
  MENSAJES_SOLICITUD,
  previsualizarSerie,
  salteadasDe,
  solicitarReserva,
  type SolicitudEntrada,
} from '../../../../src/modulos/solicitud/logica';
import type { RelacionConProfesor } from '../../../../src/estado/profesor';
import { inscripcion } from '../../estado/soporte';
import { MENSAJE_GENERICO, MENSAJES, mensajePendientesSol10 } from '../../../../src/lib/errores';

const PROFESOR = 'prof-a';
const INICIO = '2026-11-03T13:00:00+00:00';

const ENTRADA: SolicitudEntrada = {
  profesorId: PROFESOR,
  inicio: INICIO,
  tipo: 'suelta',
  frecuencia: null,
  personaACargoId: null,
  observacion: '',
};

const err = (code: string, message: string, details: string | null = null) => ({ code, message, details, hint: null });

/** Cliente falso: `rpc` configurable y `from(...).select().eq().order()` encadenable. */
function cliente(opciones: { rpc?: { data: unknown; error: unknown }; filas?: { data: unknown; error: unknown } }) {
  const consulta = {
    select: vi.fn(() => consulta),
    eq: vi.fn(() => consulta),
    order: vi.fn(async () => opciones.filas ?? { data: [], error: null }),
  };
  const c = {
    rpc: vi.fn(async () => opciones.rpc ?? { data: null, error: null }),
    from: vi.fn(() => consulta),
  };
  return { c, consulta, deps: { obtenerCliente: async () => c as unknown as SupabaseClient } };
}

const CREADA = {
  solicitud_id: 's-1',
  reserva_id: 'r-1',
  fechas: [INICIO, '2026-11-10T13:00:00+00:00'],
  salteadas: ['2026-11-17T13:00:00+00:00'],
};

describe('solicitarReserva (SOL-01, RES-02..05, RES-07)', () => {
  it('SOL_01_suelta_llama_con_el_profesor_de_la_agenda_y_sin_frecuencia', async () => {
    const { c, deps } = cliente({ rpc: { data: { ...CREADA, fechas: [INICIO], salteadas: [] }, error: null } });
    const r = await solicitarReserva({ ...ENTRADA, frecuencia: 1 }, deps);
    expect(r).toEqual({ ok: true, solicitudId: 's-1', reservaId: 'r-1', fechas: [INICIO], salteadas: [] });
    expect(c.rpc).toHaveBeenCalledWith('solicitar_reserva', {
      p_profesor_id: PROFESOR,
      p_inicio: INICIO,
      p_tipo: 'suelta',
      p_frecuencia: null,
      p_persona_a_cargo_id: null,
      p_observacion: null,
    });
  });

  it('RES_03_RES_04_serie_con_persona_a_cargo_y_observacion_recortada', async () => {
    const { c, deps } = cliente({ rpc: { data: CREADA, error: null } });
    const r = await solicitarReserva(
      { ...ENTRADA, tipo: 'serie', frecuencia: 2, personaACargoId: 'pc-1', observacion: '  Vamos con Ana  ' },
      deps,
    );
    expect(r).toEqual({ ok: true, solicitudId: 's-1', reservaId: 'r-1', fechas: CREADA.fechas, salteadas: CREADA.salteadas });
    expect(c.rpc).toHaveBeenCalledWith('solicitar_reserva', {
      p_profesor_id: PROFESOR,
      p_inicio: INICIO,
      p_tipo: 'serie',
      p_frecuencia: 2,
      p_persona_a_cargo_id: 'pc-1',
      p_observacion: 'Vamos con Ana',
    });
  });

  it('SEC_09_observacion_de_500_pasa_y_de_501_no_llama_a_la_base', async () => {
    expect(esquemaSolicitud.safeParse({ ...ENTRADA, observacion: 'x'.repeat(LARGO_MAX_OBSERVACION) }).success).toBe(true);
    const { c, deps } = cliente({});
    const r = await solicitarReserva({ ...ENTRADA, observacion: 'x'.repeat(LARGO_MAX_OBSERVACION + 1) }, deps);
    expect(r).toEqual({
      ok: false,
      codigo: 'DATOS_INVALIDOS',
      mensaje: MENSAJES_SOLICITUD.observacionLarga,
      campo: 'observacion',
    });
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it('RES_02_serie_sin_frecuencia_no_llama_a_la_base', async () => {
    const { c, deps } = cliente({});
    const r = await solicitarReserva({ ...ENTRADA, tipo: 'serie', frecuencia: null }, deps);
    expect(r).toMatchObject({ ok: false, codigo: 'DATOS_INVALIDOS', campo: 'frecuencia', mensaje: MENSAJES_SOLICITUD.frecuenciaFaltante });
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it('SOL_01_sin_horario_valido_no_llama_a_la_base', async () => {
    const { c, deps } = cliente({});
    const r = await solicitarReserva({ ...ENTRADA, inicio: 'mañana' }, deps);
    expect(r).toMatchObject({ ok: false, campo: 'inicio', mensaje: MENSAJES_SOLICITUD.inicioInvalido });
    const sinProfesor = await solicitarReserva({ ...ENTRADA, profesorId: '' }, deps);
    expect(sinProfesor).toMatchObject({ ok: false, codigo: 'DATOS_INVALIDOS' });
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it('SOL_10_LIMITE_EXCEDIDO_dice_el_limite_de_pendientes', async () => {
    const { deps } = cliente({ rpc: { data: null, error: err('PT429', 'LIMITE_EXCEDIDO', '{"tope": "pendientes", "limite": 10}') } });
    const r = await solicitarReserva(ENTRADA, deps);
    expect(r).toEqual({ ok: false, codigo: 'LIMITE_EXCEDIDO', mensaje: mensajePendientesSol10(10), campo: null });
  });

  it('CA_03_CUENTA_NO_APROBADA_trae_el_estado_del_vinculo_con_ese_profesor', async () => {
    const { deps } = cliente({
      rpc: { data: null, error: err('PT403', 'CUENTA_NO_APROBADA', '{"estado": "rechazado", "profesor_id": "prof-a"}') },
    });
    expect(await solicitarReserva(ENTRADA, deps)).toEqual({
      ok: false,
      codigo: 'CUENTA_NO_APROBADA',
      mensaje: MENSAJES.CUENTA_NO_APROBADA,
      campo: null,
      estadoVinculo: 'rechazado',
    });
  });

  it('CA_52_CUENTA_NO_APROBADA_sin_vinculo_o_con_estado_desconocido_da_null', async () => {
    for (const details of ['{"estado": null, "profesor_id": "prof-b"}', '{"estado": "<b>x</b>"}', 'no es json', null]) {
      const { deps } = cliente({ rpc: { data: null, error: err('PT403', 'CUENTA_NO_APROBADA', details) } });
      expect(await solicitarReserva(ENTRADA, deps)).toMatchObject({ ok: false, estadoVinculo: null });
    }
  });

  it('AGE_11_PROFESOR_INACTIVO_y_RES_01_HUECO_NO_LIBRE_se_traducen', async () => {
    const inactivo = cliente({ rpc: { data: null, error: err('PT409', 'PROFESOR_INACTIVO') } });
    expect(await solicitarReserva(ENTRADA, inactivo.deps)).toMatchObject({ codigo: 'PROFESOR_INACTIVO', mensaje: MENSAJES.PROFESOR_INACTIVO });
    const ocupado = cliente({ rpc: { data: null, error: err('PT409', 'HUECO_NO_LIBRE', '{"inicio": "2026-11-03T13:00:00+00:00"}') } });
    expect(await solicitarReserva(ENTRADA, ocupado.deps)).toEqual({
      ok: false,
      codigo: 'HUECO_NO_LIBRE',
      mensaje: MENSAJES.HUECO_NO_LIBRE,
      campo: null,
    });
  });

  it('AGE_04_ANTICIPACION_INSUFICIENTE_dice_las_horas', async () => {
    const { deps } = cliente({
      rpc: { data: null, error: err('PT422', 'ANTICIPACION_INSUFICIENTE', '{"inicio": "2026-11-03T12:00:00+00:00", "horas_minimas": 24}') },
    });
    const r = await solicitarReserva(ENTRADA, deps);
    expect(r).toMatchObject({ ok: false, codigo: 'ANTICIPACION_INSUFICIENTE', campo: null });
    expect(r.ok === false && r.mensaje).toContain('24 horas');
  });

  it('SEC_09_DATOS_INVALIDOS_de_la_base_marca_el_campo_conocido', async () => {
    const conCampo = cliente({ rpc: { data: null, error: err('PT422', 'DATOS_INVALIDOS', '{"campo":"p_observacion"}') } });
    expect(await solicitarReserva(ENTRADA, conCampo.deps)).toMatchObject({ codigo: 'DATOS_INVALIDOS', campo: 'observacion' });
    const otro = cliente({ rpc: { data: null, error: err('PT422', 'DATOS_INVALIDOS', '{"campo":"p_secreto"}') } });
    expect(await solicitarReserva(ENTRADA, otro.deps)).toMatchObject({ codigo: 'DATOS_INVALIDOS', campo: null });
  });

  it('SEC_17_respuesta_con_otra_forma_o_falla_de_carga_da_el_mensaje_generico', async () => {
    const raro = cliente({ rpc: { data: { solicitud_id: 1 }, error: null } });
    expect(await solicitarReserva(ENTRADA, raro.deps)).toMatchObject({ ok: false, mensaje: MENSAJE_GENERICO });
    const r = await solicitarReserva(ENTRADA, { obtenerCliente: async () => Promise.reject(new Error('boom')) });
    expect(r).toMatchObject({ ok: false, codigo: 'DESCONOCIDO', mensaje: MENSAJE_GENERICO });
  });

  it('SEC_17_falloDe_no_copia_details_crudos', () => {
    const f = falloDe(err('PT403', 'PROHIBIDO', '{"alumno":"Ana Pérez"}'));
    expect(f).toEqual({ ok: false, codigo: 'PROHIBIDO', mensaje: MENSAJES.PROHIBIDO, campo: null });
    expect(JSON.stringify(f)).not.toContain('Ana');
  });
});

describe('previsualizarSerie (RES-05, CA-19)', () => {
  const FECHAS = [
    { inicio: INICIO, estado: 'reservable', motivo: null },
    { inicio: '2026-11-10T13:00:00+00:00', estado: 'salteada', motivo: 'bloqueado' },
    { inicio: '2026-11-17T13:00:00+00:00', estado: 'salteada', motivo: 'ocupado', extra: 'no llega' },
  ];

  it('RES_05_devuelve_las_fechas_con_las_salteadas_y_solo_las_claves_del_contrato', async () => {
    const { c, deps } = cliente({ rpc: { data: FECHAS, error: null } });
    const r = await previsualizarSerie(PROFESOR, INICIO, 1, deps);
    expect(c.rpc).toHaveBeenCalledWith('previsualizar_serie', { p_profesor_id: PROFESOR, p_inicio: INICIO, p_frecuencia: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fechas).toHaveLength(3);
    expect(r.fechas[2]).toEqual({ inicio: '2026-11-17T13:00:00+00:00', estado: 'salteada', motivo: 'ocupado' });
    expect(salteadasDe(r.fechas)).toEqual(['2026-11-10T13:00:00+00:00', '2026-11-17T13:00:00+00:00']);
  });

  it('RES_05_salteadasDe_no_cuenta_la_primera_fecha', () => {
    expect(salteadasDe([{ inicio: 'a', estado: 'salteada' }, { inicio: 'b', estado: 'reservable' }])).toEqual([]);
  });

  it('RES_05_error_de_la_base_o_forma_invalida_da_fallo', async () => {
    const malo = cliente({ rpc: { data: null, error: err('PT422', 'DATOS_INVALIDOS', '{"campo":"p_frecuencia"}') } });
    expect(await previsualizarSerie(PROFESOR, INICIO, 1, malo.deps)).toMatchObject({ ok: false, campo: 'frecuencia' });
    const forma = cliente({ rpc: { data: [{ inicio: INICIO, estado: 'libre', motivo: null }], error: null } });
    expect(await previsualizarSerie(PROFESOR, INICIO, 1, forma.deps)).toMatchObject({ ok: false, mensaje: MENSAJE_GENERICO });
    const vacia = cliente({ rpc: { data: null, error: null } });
    expect(await previsualizarSerie(PROFESOR, INICIO, 2, vacia.deps)).toEqual({ ok: true, fechas: [] });
  });
});

describe('leerMisSolicitudes (SOL-09, SOL-08)', () => {
  const FILA = {
    id: 's-1',
    profesor_id: PROFESOR,
    tipo: 'reserva',
    alcance: null,
    estado: 'pendiente',
    vencida: false,
    fecha_clase: INICIO,
    reserva_id: 'r-1',
    clase_id: null,
    motivo: null,
    creada_en: '2026-11-02T13:00:00+00:00',
    respondida_en: null,
  };

  it('SOL_09_lee_la_vista_propia_ordenada_y_filtra_por_profesor', async () => {
    const { c, consulta, deps } = cliente({ filas: { data: [FILA], error: null } });
    expect(await leerMisSolicitudes(PROFESOR, deps)).toEqual([FILA]);
    expect(c.from).toHaveBeenCalledWith('v_mis_solicitudes');
    expect(consulta.eq).toHaveBeenCalledWith('profesor_id', PROFESOR);
    expect(consulta.order).toHaveBeenCalledWith('fecha_clase', { ascending: false });
  });

  it('SOL_09_sin_profesor_trae_todas_y_un_error_se_lanza', async () => {
    const todas = cliente({ filas: { data: null, error: null } });
    expect(await leerMisSolicitudes(null, todas.deps)).toEqual([]);
    expect(todas.consulta.eq).not.toHaveBeenCalled();
    const falla = cliente({ filas: { data: null, error: err('42501', 'permission denied') } });
    await expect(leerMisSolicitudes(null, falla.deps)).rejects.toMatchObject({ code: '42501' });
  });

  it('SOL_08_fila_con_otra_forma_se_rechaza', async () => {
    const { deps } = cliente({ filas: { data: [{ ...FILA, vencida: 'no' }], error: null } });
    await expect(leerMisSolicitudes(null, deps)).rejects.toThrow();
  });

  it('dependencias_reales_son_una_referencia_estable', () => {
    expect(dependenciasSolicitud()).toBe(dependenciasSolicitud());
  });
});

describe('accionAlTocarHueco (WEB-01, CA-46, AGE-11)', () => {
  const aprobado: RelacionConProfesor = { tipo: 'vinculo', inscripcion: inscripcion('ana-perez', 'aprobado') };

  it('CA_46_visitante_en_hueco_libre_ve_la_invitacion_a_ingresar', () => {
    expect(accionAlTocarHueco({ tipo: 'visitante' }, 'libre', true)).toEqual({ tipo: 'invitar_ingreso' });
  });

  it('WEB_01_vinculo_aprobado_abre_el_formulario', () => {
    expect(accionAlTocarHueco(aprobado, 'libre', true)).toEqual({ tipo: 'formulario' });
  });

  it('CA_03_vinculo_pendiente_o_rechazado_muestra_su_estado', () => {
    for (const estado of ['pendiente', 'rechazado'] as const) {
      const r: RelacionConProfesor = { tipo: 'vinculo', inscripcion: inscripcion('ana-perez', estado) };
      expect(accionAlTocarHueco(r, 'libre', true)).toEqual({ tipo: 'estado_vinculo', estado });
    }
  });

  it('WEB_01_sin_vinculo_pide_acceso_y_ficha_incompleta_la_completa', () => {
    expect(accionAlTocarHueco({ tipo: 'sin_vinculo' }, 'libre', true)).toEqual({ tipo: 'pedir_acceso' });
    expect(accionAlTocarHueco({ tipo: 'ficha_incompleta' }, 'libre', true)).toEqual({ tipo: 'completar_ficha' });
  });

  it('AGE_07_hueco_ocupado_o_bloqueado_y_AGE_11_profesor_inactivo_no_hacen_nada', () => {
    expect(accionAlTocarHueco(aprobado, 'ocupado', true)).toEqual({ tipo: 'ninguna' });
    expect(accionAlTocarHueco({ tipo: 'visitante' }, 'bloqueado', true)).toEqual({ tipo: 'ninguna' });
    expect(accionAlTocarHueco(aprobado, 'libre', false)).toEqual({ tipo: 'ninguna' });
    const inactivo: RelacionConProfesor = {
      tipo: 'vinculo',
      inscripcion: inscripcion('ana-perez', 'aprobado', { profesor_activo: false }),
    };
    expect(accionAlTocarHueco(inactivo, 'libre', true)).toEqual({ tipo: 'ninguna' });
  });

  it('PRF_07_profesor_administrador_y_cargando_no_hacen_nada', () => {
    for (const r of [
      { tipo: 'profesor', propio: true },
      { tipo: 'profesor', propio: false },
      { tipo: 'administrador' },
      { tipo: 'cargando' },
      { tipo: 'error' },
      { tipo: 'sin_acceso' },
    ] as RelacionConProfesor[]) {
      expect(accionAlTocarHueco(r, 'libre', true)).toEqual({ tipo: 'ninguna' });
    }
  });
});
