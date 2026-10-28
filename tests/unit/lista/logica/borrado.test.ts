// B11 · T11.1 · Lógica de borrar un alumno de la lista del profesor (`borrar_alumno`).
// ALU-12, DEC-26 A, DEC-05 A, SEC-06, SEC-17, CA-10, CA-57.
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  borrarAlumno,
  MENSAJES_BORRADO,
  nombreVisible,
  resumenBorrado,
  textoConfirmacionBorrado,
} from '../../../../src/modulos/lista/logica';
import { MENSAJE_SIN_CONEXION, MENSAJES } from '../../../../src/lib/errores';

const real = vi.hoisted(() => ({ cliente: null as unknown }));
vi.mock('../../../../src/lib/supabase', () => ({ cargarSupabase: async () => real.cliente }));

type Resultado = { data: unknown; error: unknown };

function cliente(rpc: Resultado | (() => Promise<Resultado>)) {
  const c = { rpc: vi.fn(typeof rpc === 'function' ? rpc : async () => rpc) };
  return { c, deps: { obtenerCliente: async () => c as unknown as SupabaseClient } };
}

const err = (code: string, message: string, details: string | null = null) => ({ code, message, details, hint: null });

describe('borrarAlumno', () => {
  it('ALU_12_llama_borrar_alumno_con_el_id_y_devuelve_las_cantidades', async () => {
    const { c, deps } = cliente({ data: { clases_canceladas: 2, solicitudes_anuladas: 1 }, error: null });
    const r = await borrarAlumno('al-1', deps);
    expect(c.rpc).toHaveBeenCalledWith('borrar_alumno', { p_alumno_id: 'al-1' });
    expect(r).toEqual({ ok: true, clasesCanceladas: 2, solicitudesAnuladas: 1 });
  });

  it('ALU_12_usa_el_cliente_real_por_defecto', async () => {
    const { c } = cliente({ data: { clases_canceladas: 0, solicitudes_anuladas: 0 }, error: null });
    real.cliente = c;
    const r = await borrarAlumno('al-2');
    expect(c.rpc).toHaveBeenCalledWith('borrar_alumno', { p_alumno_id: 'al-2' });
    expect(r).toEqual({ ok: true, clasesCanceladas: 0, solicitudesAnuladas: 0 });
  });

  it('SEC_06_alumno_de_otro_profesor_o_ya_borrado_da_404_con_el_texto_del_catalogo', async () => {
    const { deps } = cliente({ data: null, error: err('PT404', 'NO_ENCONTRADO') });
    const r = await borrarAlumno('ajeno', deps);
    expect(r).toMatchObject({ ok: false, codigo: 'NO_ENCONTRADO', mensaje: MENSAJES.NO_ENCONTRADO, campo: null });
  });

  it('SEC_06_quien_no_es_profesor_recibe_403_PROHIBIDO', async () => {
    const { deps } = cliente({ data: null, error: err('PT403', 'PROHIBIDO') });
    const r = await borrarAlumno('al-1', deps);
    expect(r).toMatchObject({ ok: false, codigo: 'PROHIBIDO', mensaje: MENSAJES.PROHIBIDO });
  });

  it('SEC_17_no_muestra_details_crudos', async () => {
    const { deps } = cliente({ data: null, error: err('PT404', 'NO_ENCONTRADO', '{"secreto":"x@example.test"}') });
    const r = await borrarAlumno('al-1', deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensaje).not.toContain('example.test');
  });

  it('ALU_12_sin_conexion_devuelve_el_fallo_traducido', async () => {
    const deps = { obtenerCliente: async () => Promise.reject(new TypeError('Failed to fetch')) };
    const r = await borrarAlumno('al-1', deps);
    expect(r).toMatchObject({ ok: false, codigo: 'SIN_CONEXION', mensaje: MENSAJE_SIN_CONEXION });
  });

  it('ALU_12_una_respuesta_con_forma_inesperada_es_un_fallo_generico', async () => {
    const { deps } = cliente({ data: { clases_canceladas: -1 }, error: null });
    const r = await borrarAlumno('al-1', deps);
    expect(r).toMatchObject({ ok: false, codigo: 'DESCONOCIDO' });
  });
});

describe('textoConfirmacionBorrado', () => {
  it('ALU_12_con_cuenta_dice_que_la_cuenta_y_la_ficha_siguen', () => {
    const t = textoConfirmacionBorrado({ con_usuario: true, editable: false });
    expect(t).toEqual([MENSAJES_BORRADO.efecto, MENSAJES_BORRADO.conCuenta, MENSAJES_BORRADO.sinAviso]);
  });

  it('ALU_12_sin_cuenta_y_solo_suyo_dice_que_sus_datos_se_borran', () => {
    const t = textoConfirmacionBorrado({ con_usuario: false, editable: true });
    expect(t[1]).toBe(MENSAJES_BORRADO.sinCuentaSoloTuyo);
    expect(t).not.toContain(MENSAJES_BORRADO.conCuenta);
  });

  it('ALU_12_sin_cuenta_compartido_condiciona_el_borrado_a_que_no_tenga_otro_profesor', () => {
    const t = textoConfirmacionBorrado({ con_usuario: false, editable: false });
    expect(t[1]).toBe(MENSAJES_BORRADO.sinCuentaCompartido);
  });

  it('ALU_12_siempre_dice_que_las_clases_futuras_se_cancelan_y_que_no_hay_mail', () => {
    for (const a of [
      { con_usuario: true, editable: true },
      { con_usuario: false, editable: false },
    ]) {
      const t = textoConfirmacionBorrado(a);
      expect(t[0]).toBe(MENSAJES_BORRADO.efecto);
      expect(t.at(-1)).toBe(MENSAJES_BORRADO.sinAviso);
    }
  });
});

describe('resumenBorrado', () => {
  it('ALU_12_sin_nada_por_delante', () => {
    expect(resumenBorrado({ clasesCanceladas: 0, solicitudesAnuladas: 0 })).toBe(
      'Alumno borrado. No tenía clases futuras ni solicitudes pendientes con vos.',
    );
  });

  it('ALU_12_singular_y_plural', () => {
    expect(resumenBorrado({ clasesCanceladas: 1, solicitudesAnuladas: 0 })).toBe('Alumno borrado: se canceló 1 clase.');
    expect(resumenBorrado({ clasesCanceladas: 3, solicitudesAnuladas: 2 })).toBe(
      'Alumno borrado: se cancelaron 3 clases y se anularon 2 solicitudes pendientes.',
    );
    expect(resumenBorrado({ clasesCanceladas: 0, solicitudesAnuladas: 1 })).toBe(
      'Alumno borrado: se anuló 1 solicitud pendiente.',
    );
  });
});

describe('nombreVisible', () => {
  it('ALU_12_H_356_sin_datos_muestra_alumno_dado_de_baja', () => {
    expect(nombreVisible(null)).toBe(MENSAJES_BORRADO.nombreDadoDeBaja);
    expect(nombreVisible(undefined)).toBe('Alumno dado de baja');
    expect(nombreVisible('   ')).toBe('Alumno dado de baja');
  });

  it('ALU_12_con_nombre_lo_muestra_recortado', () => {
    expect(nombreVisible(' Ana ')).toBe('Ana');
  });
});
