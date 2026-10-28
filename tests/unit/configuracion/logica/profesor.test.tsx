// B14 · T14.3 · Enlace propio y huso del profesor de la sesión (WEB-08, AGE-09, AGE-11, PRF-08, ADR-020).
import type { SupabaseClient } from '@supabase/supabase-js';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SesionActual } from '../../../../src/estado';
import { configurarSesionActual } from '../../../../src/estado/sesion-actual';
import { reiniciarConfigPublica, type ConfigPublica } from '../../../../src/modulos/agenda/logica';
import {
  copiarTexto,
  enlaceDeProfesor,
  leerHusoPropio,
  profesorDeSesion,
  useEnlacePropio,
  useHusoDelProfesor,
} from '../../../../src/modulos/configuracion/logica';
import { MENSAJE_GENERICO, MENSAJE_SIN_CONEXION } from '../../../../src/lib/errores';
import { ADMINISTRADOR, enSesion, persona, profesor } from '../../estado/soporte';

const ACTIVA: ConfigPublica = {
  profesor_id: 'id-ana-perez',
  nombre: 'Ana Pérez',
  activo: true,
  zona_horaria: 'America/Montevideo',
  duracion_min: 60,
  anticipacion_horas: 24,
  horizonte_semanas: 8,
};
const INACTIVA: ConfigPublica = { profesor_id: 'id-ana-perez', nombre: 'Ana Pérez', activo: false };

/** La app con la sesión dada ya leída de `sesion_actual()`. */
function conSesion(sesion: SesionActual | null) {
  if (sesion === null) {
    configurarSesionActual({ haySesionGuardada: () => false });
    return;
  }
  const cliente = {
    rpc: async () => ({ data: sesion, error: null }),
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) },
  };
  configurarSesionActual({ haySesionGuardada: () => true, obtenerCliente: async () => cliente as unknown as SupabaseClient });
}

afterEach(() => {
  configurarSesionActual();
  reiniciarConfigPublica();
});

describe('enlace propio del profesor (WEB-08, AGE-09)', () => {
  it('WEB_08_el_enlace_es_origen_base_y_hash_de_su_agenda', () => {
    expect(enlaceDeProfesor('ana-perez', 'https://agendaclasesapp.github.io', '/reservas/')).toBe(
      'https://agendaclasesapp.github.io/reservas/#/p/ana-perez',
    );
    expect(enlaceDeProfesor('ana-perez', 'https://x.example/', 'reservas')).toBe('https://x.example/reservas/#/p/ana-perez');
    expect(enlaceDeProfesor('ana-perez', 'http://localhost:5173', '/')).toBe('http://localhost:5173/#/p/ana-perez');
    // Sin argumentos usa el origen de la página y BASE_URL de Vite (DEC-14).
    expect(enlaceDeProfesor('ana-perez')).toBe(`${window.location.origin}${import.meta.env.BASE_URL}#/p/ana-perez`);
  });

  it('WEB_08_profesor_de_sesion_solo_con_rol_profesor', () => {
    expect(profesorDeSesion(enSesion(profesor('ana-perez')))?.slug).toBe('ana-perez');
    expect(profesorDeSesion(enSesion(persona()))).toBeNull();
    expect(profesorDeSesion(enSesion(ADMINISTRADOR))).toBeNull();
    expect(profesorDeSesion({ tipo: 'visitante' })).toBeNull();
  });

  it('WEB_08_use_enlace_propio_da_el_enlace_y_si_esta_activo', async () => {
    conSesion(profesor('ana-perez', false));
    const { result } = renderHook(() => useEnlacePropio());
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current).toEqual({
      slug: 'ana-perez',
      enlace: enlaceDeProfesor('ana-perez'),
      activo: false,
    });
  });

  it('WEB_08_sin_ser_profesor_no_hay_enlace', async () => {
    conSesion(persona());
    const dePersona = renderHook(() => useEnlacePropio());
    expect(dePersona.result.current).toBeNull();
    dePersona.unmount();
    conSesion(null);
    expect(renderHook(() => useEnlacePropio()).result.current).toBeNull();
  });

  it('WEB_08_copiar_texto_dice_si_el_navegador_dejo', async () => {
    const writeText = vi.fn(async () => undefined);
    await expect(copiarTexto('https://x/#/p/ana-perez', { writeText })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://x/#/p/ana-perez');
    await expect(copiarTexto('x', { writeText: async () => Promise.reject(new Error('sin permiso')) })).resolves.toBe(false);
    await expect(copiarTexto('x', undefined)).resolves.toBe(false);
  });
});

describe('huso del profesor (ADR-004, AGE-11, PRF-08)', () => {
  it('WEB_08_activo_toma_el_huso_de_config_publica_de_su_slug', async () => {
    conSesion(profesor('ana-perez'));
    const obtener = vi.fn(async () => ACTIVA);
    const leerPropio = vi.fn(async () => 'Europe/Madrid');
    const { result } = renderHook(() => useHusoDelProfesor(obtener, leerPropio));
    expect(result.current).toEqual({ estado: 'cargando' });
    await waitFor(() => expect(result.current).toEqual({ estado: 'listo', zona: 'America/Montevideo' }));
    expect(obtener).toHaveBeenCalledWith('ana-perez');
    expect(leerPropio).not.toHaveBeenCalled();
  });

  it('PRF_08_inactivo_lee_el_huso_de_su_fila', async () => {
    conSesion(profesor('ana-perez', false));
    const obtener = vi.fn(async () => INACTIVA);
    const leerPropio = vi.fn(async () => 'Europe/Madrid');
    const { result } = renderHook(() => useHusoDelProfesor(obtener, leerPropio));
    await waitFor(() => expect(result.current).toEqual({ estado: 'listo', zona: 'Europe/Madrid' }));
    expect(leerPropio).toHaveBeenCalledWith('id-ana-perez');
  });

  it('PRF_08_inactivo_con_error_al_leer_su_fila_muestra_error_y_reintenta', async () => {
    conSesion(profesor('ana-perez', false));
    const obtener = vi.fn(async () => INACTIVA);
    const leerPropio = vi
      .fn<(id: string) => Promise<string>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue('Europe/Madrid');
    const { result } = renderHook(() => useHusoDelProfesor(obtener, leerPropio));
    await waitFor(() => expect(result.current.estado).toBe('error'));
    expect(result.current).toMatchObject({ mensaje: MENSAJE_SIN_CONEXION });
    act(() => {
      if (result.current.estado === 'error') result.current.recargar();
    });
    await waitFor(() => expect(result.current).toEqual({ estado: 'listo', zona: 'Europe/Madrid' }));
  });

  it('WEB_08_error_de_config_publica_se_muestra_traducido', async () => {
    conSesion(profesor('ana-perez'));
    const obtener = vi.fn(async (): Promise<ConfigPublica> => {
      throw { code: 'XX000', message: 'detalle crudo de postgres' };
    });
    const { result } = renderHook(() => useHusoDelProfesor(obtener, vi.fn()));
    await waitFor(() => expect(result.current.estado).toBe('error'));
    expect(result.current).toMatchObject({ mensaje: MENSAJE_GENERICO });
  });

  it('WEB_08_sin_sesion_de_profesor_queda_cargando_sin_pedir', () => {
    conSesion(null);
    const obtener = vi.fn(async () => ACTIVA);
    const { result } = renderHook(() => useHusoDelProfesor(obtener, vi.fn()));
    expect(result.current).toEqual({ estado: 'cargando' });
    expect(obtener).not.toHaveBeenCalled();
  });

  it('PRF_08_leer_huso_propio_consulta_su_fila_y_valida', async () => {
    const consulta = {
      select: vi.fn(() => consulta),
      eq: vi.fn(() => consulta),
      single: vi.fn(async (): Promise<{ data: unknown; error: unknown }> => ({
        data: { zona_horaria: 'America/Montevideo' },
        error: null,
      })),
    };
    const cliente = { from: vi.fn(() => consulta) } as unknown as SupabaseClient;
    await expect(leerHusoPropio('p1', async () => cliente)).resolves.toBe('America/Montevideo');
    expect(consulta.select).toHaveBeenCalledWith('zona_horaria');
    expect(consulta.eq).toHaveBeenCalledWith('id', 'p1');
    const e = { code: 'PGRST116', message: 'no rows' };
    consulta.single.mockResolvedValueOnce({ data: null, error: e });
    await expect(leerHusoPropio('p1', async () => cliente)).rejects.toBe(e);
    consulta.single.mockResolvedValueOnce({ data: { zona_horaria: '' }, error: null });
    await expect(leerHusoPropio('p1', async () => cliente)).rejects.toThrow();
  });
});
