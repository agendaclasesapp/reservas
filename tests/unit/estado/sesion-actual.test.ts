// `sesion_actual()` con la forma de B14 (ADR-020): rol, profesor, ficha y vínculos con cada profesor.
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { leerSesionActual, SesionInvalida } from '../../../src/estado/tipos';
import { cerrarSesion, configurarSesionActual, estadoSesion, refrescarSesion } from '../../../src/estado/sesion-actual';
import {
  configurarAlmacenProfesor,
  elegirProfesor,
  guardarProfesorOrigen,
  leerProfesorElegido,
  leerProfesorOrigen,
} from '../../../src/estado/profesor';
import { ADMINISTRADOR, almacenEnMemoria, inscripcion, persona, profesor } from './soporte';

const VINCULO = {
  profesor_id: 'p1',
  slug: 'ana-perez',
  profesor_nombre: 'Ana Pérez',
  profesor_activo: false,
  estado: 'rechazado',
  motivo_rechazo: 'Sin cupo',
};

describe('leerSesionActual (contrato de sesion_actual, ADR-020)', () => {
  it('ALU_03_la_persona_trae_sus_vinculos_con_estado_y_motivo_por_profesor', () => {
    const s = leerSesionActual({ ...persona(), inscripciones: [VINCULO] });
    expect(s.inscripciones).toEqual([VINCULO]);
    expect(s).toMatchObject({ rol: 'alumno', es_administrador: false, profesor: null, alumno_id: 'a1', estado: 'completa' });
  });

  it('ALU_03_campos_opcionales_del_vinculo_se_completan', () => {
    const sinOpcionales: Record<string, unknown> = { ...VINCULO, estado: 'pendiente' };
    delete sinOpcionales.profesor_nombre;
    delete sinOpcionales.motivo_rechazo;
    const [i] = leerSesionActual({ ...persona(), inscripciones: [sinOpcionales] }).inscripciones;
    expect(i).toMatchObject({ profesor_nombre: '', motivo_rechazo: null, estado: 'pendiente' });
    // Sin `inscripciones` (persona con ficha incompleta recién creada): lista vacía.
    const sinLista: Record<string, unknown> = { ...persona([], 'ficha_incompleta') };
    delete sinLista.inscripciones;
    expect(leerSesionActual(sinLista).inscripciones).toEqual([]);
  });

  it('PRF_08_el_profesor_trae_su_slug_y_si_esta_activo_y_ningun_vinculo', () => {
    const s = leerSesionActual({ ...profesor('ana-perez', false), inscripciones: [VINCULO] });
    expect(s.profesor).toEqual({ id: 'id-ana-perez', slug: 'ana-perez', nombre: 'Prof ana-perez', activo: false });
    expect(s.inscripciones).toEqual([]);
    const sinNombre = leerSesionActual({ ...profesor(), profesor: { id: 'p1', slug: 'ana-perez', activo: true } });
    expect(sinNombre.profesor?.nombre).toBe('');
  });

  it('WEB_10_el_rol_administrador_es_administrador_aunque_la_bandera_llegue_falsa', () => {
    expect(leerSesionActual({ ...ADMINISTRADOR, es_administrador: false }).es_administrador).toBe(true);
    expect(leerSesionActual(profesor('ana-perez', true, true)).es_administrador).toBe(true);
    // Solo el rol profesor conserva datos de profesor.
    expect(leerSesionActual({ ...ADMINISTRADOR, profesor: { id: 'p', slug: 'x-y-z', nombre: 'X', activo: true } }).profesor).toBeNull();
  });

  it('WEB_03_respuesta_fuera_de_contrato_lanza', () => {
    const malos: unknown[] = [
      { ...profesor(), profesor: null },
      { ...profesor(), profesor: 'ana' },
      { ...profesor(), profesor: { id: 'p1', slug: '', activo: true } },
      { ...profesor(), profesor: { id: 'p1', slug: 'ana-perez', activo: 'si' } },
      { ...persona(), alumno_id: null },
      { ...persona(), estado: 'aprobado' },
      { ...persona(), inscripciones: {} },
      { ...persona(), inscripciones: ['x'] },
      { ...persona(), inscripciones: [{ ...VINCULO, estado: 'baja' }] },
      { ...persona(), inscripciones: [{ ...VINCULO, profesor_id: null }] },
      { ...persona(), mail: 5 },
    ];
    for (const malo of malos) expect(() => leerSesionActual(malo)).toThrow(SesionInvalida);
  });
});

describe('estado de la sesión con la forma nueva', () => {
  let memoria: ReturnType<typeof almacenEnMemoria>;

  function cliente(data: unknown) {
    const signOut = vi.fn(async () => ({ error: null }));
    const falso = {
      rpc: vi.fn(async () => ({ data, error: null })),
      auth: { signOut, onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) },
    };
    return { signOut, comoSupabase: falso as unknown as SupabaseClient };
  }

  beforeEach(() => {
    memoria = almacenEnMemoria();
    configurarAlmacenProfesor(() => memoria.almacen);
  });

  afterEach(() => {
    configurarSesionActual();
    configurarAlmacenProfesor();
  });

  it('WEB_11_refrescar_deja_la_sesion_con_los_vinculos', async () => {
    const sesion = persona([inscripcion('ana-perez', 'aprobado'), inscripcion('beto-gil', 'pendiente')]);
    const { comoSupabase } = cliente(sesion);
    configurarSesionActual({ haySesionGuardada: () => true, obtenerCliente: async () => comoSupabase });
    await refrescarSesion();
    expect(estadoSesion()).toEqual({ tipo: 'sesion', sesion });
  });

  it('WEB_11_cerrar_sesion_olvida_el_profesor_elegido_y_el_de_origen', async () => {
    const { comoSupabase, signOut } = cliente(persona([inscripcion('ana-perez', 'aprobado')]));
    configurarSesionActual({ haySesionGuardada: () => true, obtenerCliente: async () => comoSupabase });
    await refrescarSesion();
    elegirProfesor('ana-perez');
    guardarProfesorOrigen('beto-gil');
    await cerrarSesion();
    expect(signOut).toHaveBeenCalled();
    expect(leerProfesorElegido()).toBeNull();
    expect(leerProfesorOrigen()).toBeNull();
    expect(memoria.datos.size).toBe(0);
    expect(estadoSesion()).toEqual({ tipo: 'visitante' });
  });
});
