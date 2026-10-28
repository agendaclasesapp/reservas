// B03 · T03.1 · Lectura de «Mails fallidos» (WEB-08, NFR-07, AVI-08).
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MOTIVO_DESTINATARIO_INVALIDO,
  MOTIVO_SIN_CONFIRMACION,
  MOTIVO_TOPE,
  MOTIVO_TOPE_GLOBAL,
  esTopeGlobal,
  TIPOS_MAIL,
  VISTA_MAILS_FALLIDOS,
  clasificarMotivo,
  esquemaMailFallido,
  leerMailsFallidos,
} from '../../../../src/modulos/configuracion/logica';

const FILA = {
  id: '11111111-1111-4111-8111-111111111111',
  fecha: '2026-11-02T13:00:00+00:00',
  destinatario: 'alumno@example.test',
  tipo: 'clase_creada',
  motivo: MOTIVO_TOPE,
};

function clienteFalso(respuesta: { data: unknown; error: unknown }) {
  const order = vi.fn().mockResolvedValue(respuesta);
  const select = vi.fn(() => ({ order }));
  const from = vi.fn(() => ({ select }));
  const cliente = { from } as unknown as SupabaseClient;
  return { cliente, from, select, order };
}

describe('leerMailsFallidos', () => {
  it('NFR_07_lee_la_vista_con_fecha_destinatario_tipo_y_motivo_del_mas_reciente_al_mas_viejo', async () => {
    const { cliente, from, select, order } = clienteFalso({ data: [FILA], error: null });
    const mails = await leerMailsFallidos(() => Promise.resolve(cliente));
    expect(from).toHaveBeenCalledWith(VISTA_MAILS_FALLIDOS);
    expect(select).toHaveBeenCalledWith('id, fecha, destinatario, tipo, motivo');
    expect(order).toHaveBeenCalledWith('fecha', { ascending: false });
    expect(mails).toEqual([FILA]);
  });

  it('NFR_07_tolera_destinatario_y_motivo_nulos_de_un_alumno_borrado', async () => {
    const anonimizada = { ...FILA, destinatario: null, motivo: null };
    const { cliente } = clienteFalso({ data: [anonimizada], error: null });
    await expect(leerMailsFallidos(() => Promise.resolve(cliente))).resolves.toEqual([anonimizada]);
  });

  it('NFR_07_sin_filas_devuelve_lista_vacia', async () => {
    const { cliente } = clienteFalso({ data: null, error: null });
    await expect(leerMailsFallidos(() => Promise.resolve(cliente))).resolves.toEqual([]);
  });

  it('NFR_07_propaga_el_error_de_postgrest_sin_tocarlo', async () => {
    const error = { code: '42501', message: 'permission denied', details: null };
    const { cliente } = clienteFalso({ data: null, error });
    await expect(leerMailsFallidos(() => Promise.resolve(cliente))).rejects.toBe(error);
  });

  it('NFR_07_rechaza_una_fila_fuera_de_contrato', async () => {
    const { cliente } = clienteFalso({ data: [{ ...FILA, tipo: 'spam' }], error: null });
    await expect(leerMailsFallidos(() => Promise.resolve(cliente))).rejects.toThrow();
  });
});

describe('clasificarMotivo', () => {
  it('AVI_08_TOPE_es_tope', () => {
    expect(clasificarMotivo(MOTIVO_TOPE)).toBe('tope');
    expect(esTopeGlobal(MOTIVO_TOPE)).toBe(false);
  });

  it('AVI_08_TOPE_GLOBAL_es_tope_y_se_distingue_del_del_profesor', () => {
    expect(MOTIVO_TOPE_GLOBAL).toBe('TOPE_GLOBAL');
    expect(clasificarMotivo(MOTIVO_TOPE_GLOBAL)).toBe('tope');
    expect(esTopeGlobal(MOTIVO_TOPE_GLOBAL)).toBe(true);
    expect(esTopeGlobal(null)).toBe(false);
    expect(clasificarMotivo('TOPE_GLOBAL ')).toBe('envio');
  });

  it('NFR_07_SIN_CONFIRMACION_y_errores_smtp_se_distinguen', () => {
    expect(clasificarMotivo(MOTIVO_SIN_CONFIRMACION)).toBe('sin_confirmacion');
    expect(clasificarMotivo('Invalid login: 535-5.7.8 Username and Password not accepted')).toBe('envio');
    expect(clasificarMotivo('tope')).toBe('envio');
  });

  it('H_141_DESTINATARIO_INVALIDO_es_destinatario_invalido_y_solo_con_el_texto_exacto', () => {
    expect(MOTIVO_DESTINATARIO_INVALIDO).toBe('DESTINATARIO_INVALIDO');
    expect(clasificarMotivo(MOTIVO_DESTINATARIO_INVALIDO)).toBe('destinatario_invalido');
    expect(clasificarMotivo('destinatario_invalido')).toBe('envio');
  });

  it('NFR_07_motivo_nulo_o_vacio_es_desconocido', () => {
    expect(clasificarMotivo(null)).toBe('desconocido');
    expect(clasificarMotivo('  ')).toBe('desconocido');
  });
});

describe('esquemaMailFallido', () => {
  it('NFR_07_acepta_los_once_tipos_del_contrato_y_exige_uuid', () => {
    // B14 (ADR-019, contratos.md §4): suma `alumno_sumado` (AVI-04) y `profesor_alta`.
    expect(TIPOS_MAIL).toHaveLength(11);
    expect(TIPOS_MAIL).toEqual(expect.arrayContaining(['alumno_sumado', 'profesor_alta']));
    for (const tipo of TIPOS_MAIL) expect(esquemaMailFallido.safeParse({ ...FILA, tipo }).success).toBe(true);
    expect(esquemaMailFallido.safeParse({ ...FILA, id: 'x' }).success).toBe(false);
  });
});
