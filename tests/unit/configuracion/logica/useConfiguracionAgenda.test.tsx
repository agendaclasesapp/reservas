// B10 · T10.1 · Hook de configuración de la agenda del profesor de la sesión (WEB-08, AGE-03, AGE-10, SEC-17).
import type { SupabaseClient } from '@supabase/supabase-js';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SesionActual } from '../../../../src/estado';
import { configurarSesionActual } from '../../../../src/estado/sesion-actual';
import { reiniciarConfigPublica, type ConfigPublica } from '../../../../src/modulos/agenda/logica';
import {
  useConfiguracionAgenda,
  type AgendaConfigurada,
  type EscritoresConfiguracion,
  type LectorConfiguracion,
} from '../../../../src/modulos/configuracion/logica';
import { MENSAJE_GENERICO } from '../../../../src/lib/errores';
import { persona, profesor } from '../../estado/soporte';

function conSesion(sesion: SesionActual) {
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

const CONFIG = { zona_horaria: 'America/Montevideo', duracion_min: 60, anticipacion_horas: 24, horizonte_semanas: 26 };
const AGENDA: AgendaConfigurada = { config: CONFIG, grilla: [{ dia_semana: 1, desde: '08:00', hasta: '13:00' }] };
const PUBLICA: ConfigPublica = { profesor_id: 'id-ana-perez', nombre: 'Ana', activo: true, ...CONFIG };

function escritores(cambios: Partial<EscritoresConfiguracion> = {}): EscritoresConfiguracion {
  return {
    guardarConfiguracion: vi.fn(async () => ({ ok: true as const, ...CONFIG, duracion_min: 45 })),
    guardarGrilla: vi.fn(async () => ({ ok: true as const, grilla: [{ dia_semana: 2 as const, desde: '09:00', hasta: '12:00' }] })),
    ...cambios,
  };
}

describe('useConfiguracionAgenda (WEB-08, AGE-10)', () => {
  it('AGE_10_lee_la_configuracion_del_profesor_de_la_sesion', async () => {
    conSesion(profesor('ana-perez'));
    const lector = vi.fn<LectorConfiguracion>(async () => AGENDA);
    const obtener = vi.fn(async () => PUBLICA);
    const esc = escritores();
    const { result } = renderHook(() => useConfiguracionAgenda(lector, esc, obtener));
    expect(result.current.lectura.estado).toBe('cargando');
    await waitFor(() => expect(result.current.lectura.estado).toBe('listo'));
    expect(result.current.lectura.datos).toEqual(AGENDA);
    expect(lector).toHaveBeenCalledWith('id-ana-perez');
  });

  it('AGE_10_quien_no_es_profesor_no_lee_nada', async () => {
    conSesion(persona());
    const lector = vi.fn<LectorConfiguracion>(async () => AGENDA);
    const esc = escritores();
    const obtener = vi.fn(async () => PUBLICA);
    const { result } = renderHook(() => useConfiguracionAgenda(lector, esc, obtener));
    await act(async () => undefined);
    expect(result.current.lectura).toEqual({ estado: 'cargando', datos: null, error: null });
    expect(lector).not.toHaveBeenCalled();
  });

  it('SEC_17_un_error_de_lectura_da_texto_traducido_y_recargar_vuelve_a_leer', async () => {
    conSesion(profesor('ana-perez'));
    const lector = vi
      .fn<LectorConfiguracion>()
      .mockRejectedValueOnce(new Error('detalle interno'))
      .mockResolvedValueOnce(AGENDA);
    const esc = escritores();
    const obtener = vi.fn(async () => PUBLICA);
    const { result } = renderHook(() => useConfiguracionAgenda(lector, esc, obtener));
    await waitFor(() => expect(result.current.lectura.estado).toBe('error'));
    expect(result.current.lectura.error).toBe(MENSAJE_GENERICO);
    act(() => result.current.recargar());
    await waitFor(() => expect(result.current.lectura.estado).toBe('listo'));
    expect(lector).toHaveBeenCalledTimes(2);
  });

  it('AGE_03_guardar_la_configuracion_actualiza_lo_leido_y_vuelve_a_pedir_config_publica', async () => {
    conSesion(profesor('ana-perez'));
    const esc = escritores();
    const obtener = vi.fn(async () => PUBLICA);
    const lector = vi.fn<LectorConfiguracion>(async () => AGENDA);
    const { result } = renderHook(() => useConfiguracionAgenda(lector, esc, obtener));
    await waitFor(() => expect(result.current.lectura.estado).toBe('listo'));
    await waitFor(() => expect(obtener).toHaveBeenCalledTimes(1));
    const entrada = { duracionMin: 45, anticipacionHoras: 24, zonaHoraria: 'America/Montevideo' };
    let r: Awaited<ReturnType<EscritoresConfiguracion['guardarConfiguracion']>> | undefined;
    await act(async () => {
      r = await result.current.guardarConfiguracion(entrada);
    });
    expect(r).toMatchObject({ ok: true, duracion_min: 45 });
    expect(esc.guardarConfiguracion).toHaveBeenCalledWith(entrada);
    expect(result.current.lectura.datos?.config.duracion_min).toBe(45);
    expect(result.current.lectura.datos?.grilla).toEqual(AGENDA.grilla);
    await waitFor(() => expect(obtener).toHaveBeenCalledTimes(2));
  });

  it('SEC_09_un_fallo_al_guardar_no_cambia_lo_leido', async () => {
    conSesion(profesor('ana-perez'));
    const fallo = { ok: false as const, codigo: 'DATOS_INVALIDOS' as const, mensaje: 'x', campo: 'p_duracion_min' as const };
    const esc = escritores({
      guardarConfiguracion: vi.fn(async () => fallo),
      guardarGrilla: vi.fn(async () => ({ ...fallo, campo: 'p_tramos' as const, validacion: null })),
    });
    const lector = vi.fn<LectorConfiguracion>(async () => AGENDA);
    const obtener = vi.fn(async () => PUBLICA);
    const { result } = renderHook(() => useConfiguracionAgenda(lector, esc, obtener));
    await waitFor(() => expect(result.current.lectura.estado).toBe('listo'));
    await act(async () => {
      await expect(result.current.guardarConfiguracion({ duracionMin: 0, anticipacionHoras: 0, zonaHoraria: 'UTC' })).resolves.toBe(fallo);
      await expect(result.current.guardarGrilla([])).resolves.toMatchObject({ ok: false });
    });
    expect(result.current.lectura.datos).toEqual(AGENDA);
  });

  it('AGE_01_guardar_la_grilla_actualiza_lo_leido_con_lo_que_guardo_la_base', async () => {
    conSesion(profesor('ana-perez'));
    const esc = escritores();
    const lector = vi.fn<LectorConfiguracion>(async () => AGENDA);
    const obtener = vi.fn(async () => PUBLICA);
    const { result } = renderHook(() => useConfiguracionAgenda(lector, esc, obtener));
    await waitFor(() => expect(result.current.lectura.estado).toBe('listo'));
    await act(async () => {
      await result.current.guardarGrilla([{ dia_semana: 2, desde: '09:00', hasta: '12:00' }]);
    });
    expect(result.current.lectura.datos?.grilla).toEqual([{ dia_semana: 2, desde: '09:00', hasta: '12:00' }]);
    expect(result.current.lectura.datos?.config).toEqual(CONFIG);
  });

  it('AGE_10_guardar_antes_de_leer_no_inventa_datos', async () => {
    conSesion(profesor('ana-perez'));
    const lector = vi.fn<LectorConfiguracion>(() => new Promise<AgendaConfigurada>(() => undefined));
    const esc = escritores();
    const obtener = vi.fn(async () => PUBLICA);
    const { result } = renderHook(() => useConfiguracionAgenda(lector, esc, obtener));
    await act(async () => {
      await result.current.guardarGrilla([]);
      await result.current.guardarConfiguracion({ duracionMin: 45, anticipacionHoras: 24, zonaHoraria: 'UTC' });
    });
    expect(result.current.lectura.datos).toBeNull();
  });
});
