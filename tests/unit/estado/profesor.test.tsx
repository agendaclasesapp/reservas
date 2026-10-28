// Profesor de la ruta, de origen y elegido (ADR-020, WEB-01, WEB-11, ALU-14, AGE-09, AGE-11).
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  anotarVisitaDeProfesor,
  elegirProfesor,
  inscripcionCon,
  leerProfesorElegido,
  leerProfesorOrigen,
  normalizarSlug,
  olvidarProfesorElegido,
  olvidarProfesorOrigen,
  puedePedirAcceso,
  puedeSolicitarA,
  relacionConProfesor,
  rutaDeProfesor,
  slugDeRuta,
  useAnotarVisitaDeProfesor,
  useProfesorElegido,
  useProfesorOrigen,
  type EstadoSesion,
} from '../../../src/estado';
import {
  CLAVE_PROFESOR_ELEGIDO,
  CLAVE_PROFESOR_ORIGEN,
  configurarAlmacenProfesor,
  suscribirProfesor,
} from '../../../src/estado/profesor';
import { ADMINISTRADOR, almacenEnMemoria, enSesion, inscripcion, persona, profesor } from './soporte';

const VISITANTE: EstadoSesion = { tipo: 'visitante' };
const CARGANDO: EstadoSesion = { tipo: 'cargando' };
const ERROR: EstadoSesion = { tipo: 'error', mensaje: 'sin red' };

let memoria: ReturnType<typeof almacenEnMemoria>;

beforeEach(() => {
  memoria = almacenEnMemoria();
  configurarAlmacenProfesor(() => memoria.almacen);
});

afterEach(() => configurarAlmacenProfesor());

describe('slug del profesor (ADM-02, AGE-09)', () => {
  it('AGE_09_normalizar_slug_acepta_la_forma_valida_en_minusculas', () => {
    expect(normalizarSlug('ana-perez')).toBe('ana-perez');
    expect(normalizarSlug('  Ana-Perez ')).toBe('ana-perez');
    expect(normalizarSlug('abc')).toBe('abc');
    expect(normalizarSlug('a'.repeat(30))).toBe('a'.repeat(30));
  });

  it('AGE_09_normalizar_slug_rechaza_lo_que_no_puede_ser_de_un_profesor', () => {
    for (const malo of [null, undefined, '', 'ab', 'a'.repeat(31), '-ana', 'ana-', 'ana pérez', 'ana_perez', 'admin', 'p', 'Panel']) {
      expect(normalizarSlug(malo)).toBeNull();
    }
  });

  it('WEB_01_slug_de_ruta_y_ruta_de_profesor', () => {
    expect(slugDeRuta('/p/ana-perez')).toBe('ana-perez');
    expect(slugDeRuta('/p/ana-perez/')).toBe('ana-perez');
    expect(slugDeRuta('/p/ana%20perez')).toBe('ana perez');
    expect(slugDeRuta('/p/%E0%A4%A')).toBeNull();
    expect(slugDeRuta('/p/')).toBeNull();
    expect(slugDeRuta('/p/a/b')).toBeNull();
    expect(slugDeRuta('/panel')).toBeNull();
    expect(rutaDeProfesor('ana-perez')).toBe('/p/ana-perez');
    expect(rutaDeProfesor('a b')).toBe('/p/a%20b');
  });

  it('WEB_11_inscripcion_con_busca_el_vinculo_por_slug_normalizado', () => {
    const vinculos = [inscripcion('ana-perez', 'aprobado'), inscripcion('beto-gil', 'pendiente')];
    expect(inscripcionCon(vinculos, 'Beto-Gil')?.estado).toBe('pendiente');
    expect(inscripcionCon(vinculos, 'otro-prof')).toBeUndefined();
    expect(inscripcionCon(vinculos, 'admin')).toBeUndefined();
  });
});

describe('profesor de origen y elegido en sessionStorage (ADR-020)', () => {
  it('WEB_11_elegir_profesor_guarda_el_slug_valido_y_avisa', () => {
    let avisos = 0;
    const baja = suscribirProfesor(() => (avisos += 1));
    elegirProfesor('Ana-Perez');
    expect(memoria.datos.get(CLAVE_PROFESOR_ELEGIDO)).toBe('ana-perez');
    expect(leerProfesorElegido()).toBe('ana-perez');
    elegirProfesor('ana-perez');
    elegirProfesor('admin');
    expect(avisos).toBe(1);
    olvidarProfesorElegido();
    olvidarProfesorElegido();
    expect(leerProfesorElegido()).toBeNull();
    expect(avisos).toBe(2);
    baja();
  });

  it('ALU_14_el_origen_se_guarda_y_se_olvida_y_un_valor_manipulado_no_se_lee', () => {
    expect(leerProfesorOrigen()).toBeNull();
    memoria.datos.set(CLAVE_PROFESOR_ORIGEN, '../admin');
    expect(leerProfesorOrigen()).toBeNull();
    memoria.datos.set(CLAVE_PROFESOR_ORIGEN, 'beto-gil');
    expect(leerProfesorOrigen()).toBe('beto-gil');
    olvidarProfesorOrigen();
    expect(memoria.datos.has(CLAVE_PROFESOR_ORIGEN)).toBe(false);
  });

  it('WEB_11_sin_sessionStorage_la_app_sigue_sin_recordar', () => {
    const roto = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
      removeItem: () => undefined,
    };
    configurarAlmacenProfesor(() => roto);
    expect(() => elegirProfesor('ana-perez')).not.toThrow();
    expect(leerProfesorElegido()).toBeNull();
    configurarAlmacenProfesor(() => null);
    expect(() => elegirProfesor('ana-perez')).not.toThrow();
    expect(leerProfesorOrigen()).toBeNull();
  });

  it('WEB_11_los_hooks_siguen_al_almacen', () => {
    const elegido = renderHook(() => useProfesorElegido());
    const origen = renderHook(() => useProfesorOrigen());
    expect(elegido.result.current).toBeNull();
    act(() => elegirProfesor('ana-perez'));
    expect(elegido.result.current).toBe('ana-perez');
    act(() => anotarVisitaDeProfesor('beto-gil', VISITANTE));
    expect(origen.result.current).toBe('beto-gil');
  });
});

describe('relación con el profesor de la agenda (ADR-020, DEC-28)', () => {
  it('WEB_01_visitante_cargando_error_profesor_y_administrador', () => {
    expect(relacionConProfesor(VISITANTE, 'ana-perez')).toEqual({ tipo: 'visitante' });
    expect(relacionConProfesor(CARGANDO, 'ana-perez')).toEqual({ tipo: 'cargando' });
    expect(relacionConProfesor(ERROR, 'ana-perez')).toEqual({ tipo: 'error' });
    expect(relacionConProfesor(enSesion(profesor('ana-perez')), 'Ana-Perez')).toEqual({ tipo: 'profesor', propio: true });
    expect(relacionConProfesor(enSesion(profesor('ana-perez')), 'beto-gil')).toEqual({ tipo: 'profesor', propio: false });
    expect(relacionConProfesor(enSesion(ADMINISTRADOR), 'ana-perez')).toEqual({ tipo: 'administrador' });
  });

  it('ALU_14_persona_por_ficha_y_por_vinculo_con_ese_profesor', () => {
    const vinculo = inscripcion('ana-perez', 'pendiente');
    expect(relacionConProfesor(enSesion(persona([], 'ficha_incompleta')), 'ana-perez')).toEqual({ tipo: 'ficha_incompleta' });
    expect(relacionConProfesor(enSesion(persona([], 'borrado')), 'ana-perez')).toEqual({ tipo: 'sin_acceso' });
    expect(relacionConProfesor(enSesion(persona([vinculo])), 'beto-gil')).toEqual({ tipo: 'sin_vinculo' });
    expect(relacionConProfesor(enSesion(persona([vinculo])), 'ana-perez')).toEqual({ tipo: 'vinculo', inscripcion: vinculo });
  });

  it('WEB_01_solo_pide_clase_con_vinculo_aprobado_y_profesor_activo', () => {
    const aprobado = { tipo: 'vinculo', inscripcion: inscripcion('ana-perez', 'aprobado') } as const;
    expect(puedeSolicitarA(aprobado)).toBe(true);
    expect(
      puedeSolicitarA({ tipo: 'vinculo', inscripcion: inscripcion('ana-perez', 'aprobado', { profesor_activo: false }) }),
    ).toBe(false);
    for (const estado of ['pendiente', 'rechazado', 'sin_cuenta'] as const) {
      expect(puedeSolicitarA({ tipo: 'vinculo', inscripcion: inscripcion('ana-perez', estado) })).toBe(false);
    }
    expect(puedeSolicitarA({ tipo: 'sin_vinculo' })).toBe(false);
    expect(puedeSolicitarA({ tipo: 'profesor', propio: true })).toBe(false);
  });

  it('AGE_11_pedir_acceso_solo_sin_vinculo_y_con_el_profesor_activo', () => {
    expect(puedePedirAcceso({ tipo: 'sin_vinculo' }, true)).toBe(true);
    expect(puedePedirAcceso({ tipo: 'sin_vinculo' }, false)).toBe(false);
    expect(puedePedirAcceso({ tipo: 'visitante' }, true)).toBe(false);
    expect(puedePedirAcceso({ tipo: 'vinculo', inscripcion: inscripcion('ana-perez', 'rechazado') }, true)).toBe(false);
  });
});

describe('visita a #/p/<slug> (ADR-020, ALU-14, WEB-11)', () => {
  it('ALU_14_sin_vinculo_queda_como_profesor_de_origen', () => {
    for (const sesion of [VISITANTE, enSesion(persona([], 'ficha_incompleta')), enSesion(persona([]))]) {
      olvidarProfesorOrigen();
      anotarVisitaDeProfesor('Beto-Gil', sesion);
      expect(leerProfesorOrigen()).toBe('beto-gil');
      expect(leerProfesorElegido()).toBeNull();
    }
  });

  it('WEB_11_con_vinculo_pasa_a_ser_el_elegido_y_deja_de_ser_el_origen', () => {
    anotarVisitaDeProfesor('ana-perez', VISITANTE);
    const sesion = enSesion(persona([inscripcion('ana-perez', 'pendiente')]));
    anotarVisitaDeProfesor('ana-perez', sesion);
    expect(leerProfesorElegido()).toBe('ana-perez');
    expect(leerProfesorOrigen()).toBeNull();
    anotarVisitaDeProfesor('beto-gil', VISITANTE);
    anotarVisitaDeProfesor('ana-perez', sesion);
    expect(leerProfesorOrigen()).toBe('beto-gil');
  });

  it('WEB_11_profesor_administrador_cargando_y_slug_invalido_no_anotan', () => {
    for (const sesion of [CARGANDO, ERROR, enSesion(profesor()), enSesion(ADMINISTRADOR), enSesion(persona([], 'borrado'))]) {
      anotarVisitaDeProfesor('beto-gil', sesion);
    }
    anotarVisitaDeProfesor('admin', VISITANTE);
    expect(memoria.datos.size).toBe(0);
  });

  it('WEB_11_el_hook_anota_solo_en_rutas_de_profesor', () => {
    const { rerender } = renderHook(({ ruta }: { ruta: string }) => useAnotarVisitaDeProfesor(ruta, VISITANTE), {
      initialProps: { ruta: '/panel' },
    });
    expect(leerProfesorOrigen()).toBeNull();
    rerender({ ruta: '/p/beto-gil' });
    expect(leerProfesorOrigen()).toBe('beto-gil');
  });
});
