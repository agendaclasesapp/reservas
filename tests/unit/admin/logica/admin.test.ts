// B15 · T15.1 · Lógica del Administrador: alta, lista y cambio de estado (ADM-02, ADM-03, ADM-05, SEC-06,
// SEC-09, SEC-17, DEC-31, DEC-34).
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  altaProfesor,
  cambiarEstadoProfesor,
  dependenciasAdmin,
  esquemaAltaProfesor,
  falloAdmin,
  leerProfesores,
  MENSAJES_ADMIN,
  normalizarSlug,
  SLUGS_RESERVADOS,
  slugConFormato,
  slugReservado,
  slugValido,
  validarAltaProfesor,
  type ProfesorEntrada,
} from '../../../../src/modulos/admin/logica';
import { MENSAJE_GENERICO, MENSAJE_SIN_CONEXION, MENSAJES } from '../../../../src/lib/errores';

function cliente(rpc: { data: unknown; error: unknown } = { data: null, error: null }) {
  const c = { rpc: vi.fn(async () => rpc) };
  return { c, deps: { obtenerCliente: async () => c as unknown as SupabaseClient } };
}

const err = (code: string, message: string, details: string | null = null) => ({ code, message, details, hint: null });

const ALTA: ProfesorEntrada = { mail: ' profe@example.test ', nombre: ' Profe Nuevo ', slug: ' profe-nuevo ' };

const FILA = {
  profesor_id: 'p1',
  nombre: 'Profe A',
  mail: 'profa@example.test',
  slug: 'profe-a',
  activo: true,
  creado_en: '2026-10-23T15:00:00+00:00',
};

describe('slug (ADM-02)', () => {
  it('ADM_02_acepta_minusculas_digitos_y_guiones_de_3_a_30', () => {
    expect(slugValido('abc')).toBe(true);
    expect(slugValido('profe-ana-2')).toBe(true);
    expect(slugValido('a'.repeat(30))).toBe(true);
  });

  it('ADM_02_rechaza_largo_mayusculas_espacios_y_guion_en_los_bordes', () => {
    for (const s of ['ab', 'a'.repeat(31), 'Profe', 'profe ana', '-abc', 'abc-', 'año', 'a_b', '']) {
      expect(slugValido(s)).toBe(false);
    }
  });

  it('ADM_02_rechaza_las_palabras_reservadas_de_ADR_018', () => {
    expect(SLUGS_RESERVADOS).toHaveLength(13);
    for (const s of SLUGS_RESERVADOS) expect(slugValido(s)).toBe(false);
    expect(slugReservado('admin')).toBe(true);
    expect(slugConFormato('admin')).toBe(true);
    expect(slugReservado('admin2')).toBe(false);
  });

  it('ADM_02_normalizarSlug_recorta_y_pasa_a_minusculas', () => {
    expect(normalizarSlug('  Profe-Ana ')).toBe('profe-ana');
  });

  it('ADM_02_el_esquema_da_un_texto_para_el_formato_y_otro_para_la_reserva', () => {
    const formato = esquemaAltaProfesor.safeParse({ mail: 'a@b.test', nombre: 'X', slug: 'A' });
    const reservado = esquemaAltaProfesor.safeParse({ mail: 'a@b.test', nombre: 'X', slug: 'panel' });
    expect(formato.success).toBe(false);
    expect(formato.error?.issues[0]?.message).toBe(MENSAJES_ADMIN.slugFormato);
    expect(reservado.error?.issues[0]?.message).toBe(MENSAJES_ADMIN.slugReservado);
  });
});

describe('validarAltaProfesor (ADM-02, SEC-09)', () => {
  it('SEC_09_valida_mail_nombre_y_slug_con_su_campo', () => {
    expect(validarAltaProfesor({ ...ALTA, mail: 'no es mail' })).toMatchObject({ campo: 'mail', mensaje: MENSAJES_ADMIN.mailInvalido });
    expect(validarAltaProfesor({ ...ALTA, nombre: '   ' })).toMatchObject({ campo: 'nombre', mensaje: MENSAJES_ADMIN.nombreVacio });
    expect(validarAltaProfesor({ ...ALTA, nombre: 'n'.repeat(101) })).toMatchObject({ campo: 'nombre', mensaje: MENSAJES_ADMIN.nombreLargo });
    expect(validarAltaProfesor({ ...ALTA, slug: 'mis-clases' })).toMatchObject({ campo: 'slug', mensaje: MENSAJES_ADMIN.slugReservado });
    expect(validarAltaProfesor(ALTA)).toBeNull();
  });
});

describe('altaProfesor (ADM-02)', () => {
  it('ADM_02_llama_alta_profesor_con_los_campos_recortados_y_lee_la_respuesta', async () => {
    const { c, deps } = cliente({ data: { profesor_id: 'p9', slug: 'profe-nuevo', adoptado: false }, error: null });
    const r = await altaProfesor(ALTA, deps);
    expect(c.rpc).toHaveBeenCalledWith('alta_profesor', {
      p_mail: 'profe@example.test',
      p_nombre: 'Profe Nuevo',
      p_slug: 'profe-nuevo',
    });
    expect(r).toEqual({ ok: true, profesorId: 'p9', slug: 'profe-nuevo', adoptado: false });
  });

  it('ADM_02_adopta_el_profesor_de_enlace_provisional_y_lo_dice', async () => {
    const { deps } = cliente({ data: { profesor_id: 'p1', slug: 'profe-a', adoptado: true }, error: null });
    expect(await altaProfesor(ALTA, deps)).toMatchObject({ ok: true, adoptado: true });
  });

  it('ADM_02_con_un_dato_invalido_no_llama_a_la_base', async () => {
    const { c, deps } = cliente();
    const r = await altaProfesor({ ...ALTA, slug: 'ab' }, deps);
    expect(r).toMatchObject({ ok: false, codigo: 'DATOS_INVALIDOS', campo: 'slug' });
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it('ADM_02_slug_repetido_409_marca_el_enlace', async () => {
    const { deps } = cliente({ data: null, error: err('PT409', 'SLUG_YA_USADO') });
    expect(await altaProfesor(ALTA, deps)).toEqual({
      ok: false,
      codigo: 'SLUG_YA_USADO',
      mensaje: MENSAJES.SLUG_YA_USADO,
      campo: 'slug',
    });
  });

  it('DEC_31_mail_ya_registrado_marca_el_mail_sin_decir_de_quien_es', async () => {
    const { deps } = cliente({ data: null, error: err('PT409', 'MAIL_YA_REGISTRADO') });
    expect(await altaProfesor(ALTA, deps)).toEqual({
      ok: false,
      codigo: 'MAIL_YA_REGISTRADO',
      mensaje: MENSAJES_ADMIN.mailYaRegistrado,
      campo: 'mail',
    });
  });

  it('ADM_02_el_422_del_servidor_marca_el_campo_sin_p_y_con_su_texto', async () => {
    const { deps } = cliente({ data: null, error: err('PT422', 'DATOS_INVALIDOS', '{"campo":"p_slug"}') });
    expect(await altaProfesor(ALTA, deps)).toMatchObject({ campo: 'slug', mensaje: MENSAJES_ADMIN.slugNoValido });
    const otro = cliente({ data: null, error: err('PT422', 'DATOS_INVALIDOS', '{"campo":"p_otro"}') });
    expect(await altaProfesor(ALTA, otro.deps)).toMatchObject({ campo: null, mensaje: MENSAJES.DATOS_INVALIDOS });
  });

  it('SEC_06_un_profesor_o_un_alumno_reciben_403', async () => {
    const { deps } = cliente({ data: null, error: err('PT403', 'PROHIBIDO') });
    expect(await altaProfesor(ALTA, deps)).toEqual({ ok: false, codigo: 'PROHIBIDO', mensaje: MENSAJES.PROHIBIDO, campo: null });
  });

  it('SEC_17_un_error_desconocido_o_una_respuesta_rara_dan_el_mensaje_generico', async () => {
    const raro = cliente({ data: null, error: err('XX000', 'boom', 'profe@example.test') });
    const r = await altaProfesor(ALTA, raro.deps);
    expect(r).toMatchObject({ ok: false, codigo: 'DESCONOCIDO', mensaje: MENSAJE_GENERICO });
    expect(JSON.stringify(r)).not.toContain('profe@example.test');
    const mal = cliente({ data: { profesor_id: 1 }, error: null });
    expect(await altaProfesor(ALTA, mal.deps)).toMatchObject({ ok: false, mensaje: MENSAJE_GENERICO });
  });

  it('SEC_17_sin_conexion_lo_dice', async () => {
    const deps = { obtenerCliente: () => Promise.reject(new TypeError('Failed to fetch')) };
    expect(await altaProfesor(ALTA, deps)).toMatchObject({ ok: false, codigo: 'SIN_CONEXION', mensaje: MENSAJE_SIN_CONEXION });
  });
});

describe('cambiarEstadoProfesor (ADM-05)', () => {
  it('ADM_05_inactiva_y_devuelve_el_estado', async () => {
    const { c, deps } = cliente({ data: { profesor_id: 'p1', activo: false }, error: null });
    expect(await cambiarEstadoProfesor('p1', false, deps)).toEqual({ ok: true, profesorId: 'p1', activo: false });
    expect(c.rpc).toHaveBeenCalledWith('cambiar_estado_profesor', { p_profesor_id: 'p1', p_activo: false });
  });

  it('ADM_05_un_profesor_que_no_existe_da_404', async () => {
    const { deps } = cliente({ data: null, error: err('PT404', 'NO_ENCONTRADO') });
    expect(await cambiarEstadoProfesor('px', true, deps)).toMatchObject({ ok: false, codigo: 'NO_ENCONTRADO', campo: null });
  });

  it('SEC_06_solo_el_Administrador_403_para_los_demas', async () => {
    const { deps } = cliente({ data: null, error: err('PT403', 'PROHIBIDO') });
    expect(await cambiarEstadoProfesor('p1', false, deps)).toMatchObject({ ok: false, codigo: 'PROHIBIDO' });
  });
});

describe('leerProfesores (ADM-03)', () => {
  it('ADM_03_lee_la_lista_y_suma_el_enlace_de_cada_uno', async () => {
    const { c, deps } = cliente({ data: [FILA], error: null });
    const lista = await leerProfesores(deps, (slug) => `https://ejemplo.test/reservas/#/p/${slug}`);
    expect(c.rpc).toHaveBeenCalledWith('listar_profesores');
    expect(lista).toEqual([{ ...FILA, enlace: 'https://ejemplo.test/reservas/#/p/profe-a' }]);
  });

  it('ADM_03_el_enlace_por_defecto_usa_el_origen_y_la_base_de_la_web', async () => {
    const { deps } = cliente({ data: [FILA], error: null });
    const [p] = await leerProfesores(deps);
    expect(p?.enlace).toBe(`${window.location.origin}/#/p/profe-a`);
  });

  it('ADM_03_sin_datos_es_una_lista_vacia', async () => {
    const { deps } = cliente({ data: null, error: null });
    expect(await leerProfesores(deps)).toEqual([]);
  });

  it('ADM_04_una_fila_con_columnas_de_alumnos_o_sin_las_suyas_no_pasa', async () => {
    const { deps } = cliente({ data: [{ ...FILA, activo: 'si' }], error: null });
    await expect(leerProfesores(deps)).rejects.toThrow();
  });

  it('SEC_06_el_403_se_propaga_para_que_el_hook_lo_traduzca', async () => {
    const e = err('PT403', 'PROHIBIDO');
    const { deps } = cliente({ data: null, error: e });
    await expect(leerProfesores(deps)).rejects.toBe(e);
  });
});

describe('falloAdmin y dependencias', () => {
  it('SEC_17_details_ilegible_no_rompe_y_no_se_muestra', () => {
    expect(falloAdmin(err('PT422', 'DATOS_INVALIDOS', '{no json'))).toMatchObject({ campo: null, mensaje: MENSAJES.DATOS_INVALIDOS });
    expect(falloAdmin({ message: 'DATOS_INVALIDOS', details: { campo: 'p_mail' } })).toMatchObject({ campo: 'mail' });
    expect(falloAdmin(err('PT422', 'DATOS_INVALIDOS', '{"campo":"p_activo"}'))).toMatchObject({ campo: 'activo', mensaje: MENSAJES.DATOS_INVALIDOS });
  });

  it('ADR_017_las_dependencias_reales_cargan_supabase_diferido', () => {
    expect(typeof dependenciasAdmin().obtenerCliente).toBe('function');
  });
});
