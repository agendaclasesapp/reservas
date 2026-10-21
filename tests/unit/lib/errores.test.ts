import { describe, expect, it } from 'vitest';
import {
  CODIGOS_ERROR,
  LIMITE_PENDIENTES_SOL10,
  MENSAJE_FICHAS_ALU13,
  MENSAJE_GENERICO,
  MENSAJE_LIMITE_OTRO,
  MENSAJE_SIN_CONEXION,
  MENSAJES,
  mensajeDeError,
  traducirError,
} from '../../../src/lib/errores';

// Forma de PostgREST: { code: "PTxxx", message: "<CODIGO>", details: "<json>" } (contratos.md §1).
const errorRpc = (message: string, details: unknown = null, code = 'PT400') => ({
  code,
  message,
  details: details === null ? null : JSON.stringify(details),
  hint: null,
});

describe('errores.ts: catálogo de contratos.md §1', () => {
  it('SEC_17_cada_codigo_del_catalogo_tiene_texto_propio', () => {
    expect(CODIGOS_ERROR).toHaveLength(16);
    for (const codigo of CODIGOS_ERROR) {
      const t = traducirError(errorRpc(codigo));
      expect(t.codigo).toBe(codigo);
      expect(t.mensaje).not.toBe(MENSAJE_GENERICO);
      expect(t.mensaje).not.toContain(codigo);
    }
  });

  it('SEC_17_codigo_desconocido_da_mensaje_generico', () => {
    expect(traducirError(errorRpc('CODIGO_QUE_NO_EXISTE'))).toEqual({
      codigo: 'DESCONOCIDO',
      mensaje: MENSAJE_GENERICO,
    });
  });

  it('SEC_17_mensaje_crudo_de_postgres_con_datos_no_se_muestra', () => {
    const crudo = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "alumno_mail_key"',
      details: 'Key (mail)=(ana.perez@example.com) already exists.',
    };
    const t = traducirError(crudo);
    expect(t).toEqual({ codigo: 'DESCONOCIDO', mensaje: MENSAJE_GENERICO });
    expect(t.mensaje).not.toMatch(/ana\.perez|alumno_mail_key|duplicate/);
  });

  it('SEC_17_details_con_datos_personales_no_aparecen_en_el_texto', () => {
    const details = [{ clase_id: 'c1', inicio: '2026-11-02T13:00:00+00:00', estado: 'confirmada', alumno: 'Ana Pérez' }];
    const t = traducirError(errorRpc('BLOQUEO_CON_RESERVAS', details, 'PT409'));
    expect(t.mensaje).toBe(MENSAJES.BLOQUEO_CON_RESERVAS);
    expect(t.mensaje).not.toContain('Ana');
    const m = traducirError(errorRpc('MAIL_YA_REGISTRADO', { alumno_id: 'a-123', mail: 'ana@example.com' }, 'PT409'));
    expect(m.mensaje).not.toMatch(/a-123|ana@example/);
  });

  it('SEC_17_details_malformado_o_no_json_no_rompe_ni_se_muestra', () => {
    const t = traducirError({ code: 'PT409', message: 'HUECO_NO_LIBRE', details: '{no es json <script>' });
    expect(t).toEqual({ codigo: 'HUECO_NO_LIBRE', mensaje: MENSAJES.HUECO_NO_LIBRE });
  });

  it('SEC_17_entradas_que_no_son_error_dan_generico', () => {
    for (const e of [null, undefined, 42, 'texto suelto', {}, { message: 123 }]) {
      expect(mensajeDeError(e)).toBe(MENSAJE_GENERICO);
    }
  });

  it('RES_01_violacion_de_exclusion_23P01_se_muestra_como_hueco_no_libre', () => {
    const t = traducirError({ code: '23P01', message: 'conflicting key value violates exclusion constraint', details: 'x' });
    expect(t).toEqual({ codigo: 'HUECO_NO_LIBRE', mensaje: MENSAJES.HUECO_NO_LIBRE });
  });

  it('SEC_17_falla_de_red_da_mensaje_sin_conexion', () => {
    expect(traducirError({ message: 'TypeError: Failed to fetch', details: 'stack…', code: '' })).toEqual({
      codigo: 'SIN_CONEXION',
      mensaje: MENSAJE_SIN_CONEXION,
    });
    expect(traducirError(new TypeError('NetworkError when attempting to fetch resource.')).codigo).toBe('SIN_CONEXION');
  });

  it('AGE_04_anticipacion_usa_solo_horas_minimas_numericas', () => {
    expect(mensajeDeError(errorRpc('ANTICIPACION_INSUFICIENTE', { horas_minimas: 24, inicio: 'x' }, 'PT422'))).toContain(
      '24 horas',
    );
    const raro = mensajeDeError(errorRpc('ANTICIPACION_INSUFICIENTE', { horas_minimas: '<b>24</b>' }, 'PT422'));
    expect(raro).not.toContain('<b>');
    expect(raro).toBe(MENSAJES.ANTICIPACION_INSUFICIENTE);
  });
});

describe('errores.ts: LIMITE_EXCEDIDO según details.tope (ADR-016)', () => {
  it('SOL_10_pendientes_dice_el_limite', () => {
    const t = traducirError(errorRpc('LIMITE_EXCEDIDO', { tope: 'pendientes', limite: 5 }, 'PT429'));
    expect(t.codigo).toBe('LIMITE_EXCEDIDO');
    expect(t.mensaje).toContain('5 solicitudes pendientes');
  });

  it('SOL_10_pendientes_con_otro_limite_dice_ese_limite', () => {
    expect(mensajeDeError(errorRpc('LIMITE_EXCEDIDO', { tope: 'pendientes', limite: 3 }, 'PT429'))).toContain(
      '3 solicitudes pendientes',
    );
  });

  it('SOL_10_limite_ausente_o_invalido_usa_el_de_la_spec_y_no_lo_copia', () => {
    for (const limite of [undefined, -1, 2.5, '9; DROP', null]) {
      const m = mensajeDeError(errorRpc('LIMITE_EXCEDIDO', { tope: 'pendientes', limite }, 'PT429'));
      expect(m).toContain(`${LIMITE_PENDIENTES_SOL10} solicitudes pendientes`);
      expect(m).not.toContain('DROP');
    }
  });

  it('ALU_13_fichas_pide_intentar_mas_tarde', () => {
    const t = traducirError(errorRpc('LIMITE_EXCEDIDO', { tope: 'fichas', limite: 10 }, 'PT429'));
    expect(t.mensaje).toBe(MENSAJE_FICHAS_ALU13);
    expect(t.mensaje).toMatch(/más tarde/);
    expect(t.mensaje).not.toContain('10');
  });

  it('ALU_13_tope_desconocido_o_sin_details_no_inventa_limite', () => {
    expect(mensajeDeError(errorRpc('LIMITE_EXCEDIDO', { tope: 'otro', limite: 7 }, 'PT429'))).toBe(MENSAJE_LIMITE_OTRO);
    expect(mensajeDeError(errorRpc('LIMITE_EXCEDIDO', null, 'PT429'))).toBe(MENSAJE_LIMITE_OTRO);
  });

  it('SOL_10_details_ya_parseado_tambien_se_lee', () => {
    const e = { code: 'PT429', message: 'LIMITE_EXCEDIDO', details: { tope: 'pendientes', limite: 5 } };
    expect(mensajeDeError(e)).toContain('5 solicitudes pendientes');
  });
});
