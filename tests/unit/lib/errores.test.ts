import { describe, expect, it } from 'vitest';
import {
  CODIGOS_ERROR,
  MENSAJE_FICHAS_ALU13,
  MENSAJE_GENERICO,
  MENSAJE_LIMITE_OTRO,
  MENSAJE_SIN_CONEXION,
  MENSAJES,
  mensajeDeError,
  MOTIVO_MAIL_TOPE,
  MOTIVO_MAIL_TOPE_GLOBAL,
  MOTIVOS_TOPE_MAIL,
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
    expect(CODIGOS_ERROR).toHaveLength(21);
    for (const codigo of CODIGOS_ERROR) {
      const t = traducirError(errorRpc(codigo));
      expect(t.codigo).toBe(codigo);
      expect(t.mensaje).not.toBe(MENSAJE_GENERICO);
      expect(t.mensaje).not.toContain(codigo);
    }
  });

  it('ALU_02_ficha_ya_completa_409_tiene_su_texto', () => {
    expect(traducirError(errorRpc('FICHA_YA_COMPLETA', null, 'PT409'))).toEqual({
      codigo: 'FICHA_YA_COMPLETA',
      mensaje: 'Tu ficha ya está completa.',
    });
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
      expect(m).toContain('10 solicitudes pendientes'); // SOL-10: literal, no la constante [H-292]
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

describe('errores.ts: códigos de B14 (CR-002, ADR-018, ADR-020)', () => {
  it.each([
    ['SLUG_YA_USADO', 'Ese enlace ya lo usa otro profesor. Elegí otro.'],
    ['PROFESOR_INACTIVO', 'El profesor no toma reservas por ahora, así que no se puede hacer esto.'],
    ['CUENTA_NO_PENDIENTE', 'Esa cuenta ya no está pendiente de aprobación. Actualizá la lista.'],
    ['UNION_NO_VALIDA', 'Esa unión ya no es posible. Actualizá la lista.'],
  ] as const)('AGE_11_PRF_08_el_409_%s_tiene_su_texto', (codigo, mensaje) => {
    expect(traducirError(errorRpc(codigo, null, 'PT409'))).toEqual({ codigo, mensaje });
  });

  it('SEC_17_mail_ya_registrado_no_dice_de_quien_es_el_mail', () => {
    // DEC-29 b, DEC-31: también es el mail de un profesor o del Administrador; `details` trae a lo sumo un id.
    const t = traducirError(errorRpc('MAIL_YA_REGISTRADO', { alumno_id: '7f1c0000-0000-4000-8000-000000000001' }, 'PT409'));
    expect(t).toEqual({ codigo: 'MAIL_YA_REGISTRADO', mensaje: 'Ese mail ya está registrado y no se puede usar acá.' });
    expect(t.mensaje).not.toMatch(/profesor|administrador|alumno|7f1c/i);
  });

  it('AVI_08_tope_global_es_motivo_de_mail_y_no_codigo_de_error', () => {
    expect(MOTIVOS_TOPE_MAIL).toEqual([MOTIVO_MAIL_TOPE, MOTIVO_MAIL_TOPE_GLOBAL]);
    expect(CODIGOS_ERROR).not.toContain(MOTIVO_MAIL_TOPE_GLOBAL);
    expect(traducirError(errorRpc('TOPE_GLOBAL'))).toEqual({ codigo: 'DESCONOCIDO', mensaje: MENSAJE_GENERICO });
  });
});
