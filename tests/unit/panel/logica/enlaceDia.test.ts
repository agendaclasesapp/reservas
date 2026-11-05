// B19 · T19.1 · Enlace público del día del calendario (CAL-20, CA-84; INV-03, SEC-16, SEC-36).
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EstadoSesion } from '../../../../src/estado/tipos';
import {
  copiarEnlaceDia,
  enlaceDia,
  slugValidoParaEnlace,
  useEnlaceDia,
} from '../../../../src/modulos/panel/logica';
import { enlaceDeProfesor } from '../../../../src/modulos/configuracion/logica';

const estado = vi.hoisted(() => ({ sesion: { tipo: 'visitante' } as unknown }));
vi.mock('../../../../src/estado/useSesion', async (original) => ({
  ...(await original<typeof import('../../../../src/estado/useSesion')>()),
  useSesion: () => estado.sesion,
}));

const ORIGEN = 'https://app.ejemplo.test';
const BASE = '/reservas/';

function sesionDeProfesor(slug: string): EstadoSesion {
  return {
    tipo: 'sesion',
    sesion: { profesor: { id: 'p1', slug, nombre: 'Profe', activo: true } },
  } as unknown as EstadoSesion;
}

describe('enlaceDia', () => {
  it('CAL_20_CA_84_el_viernes_30_10_2026_da_el_enlace_publico_con_d_2026_10_30', () => {
    expect(enlaceDia('ana-piano', '2026-10-30', ORIGEN, BASE)).toBe(
      'https://app.ejemplo.test/reservas/#/p/ana-piano?d=2026-10-30',
    );
  });

  it('INV_03_es_el_mismo_enlace_publico_que_copia_Configuracion_con_el_dia_agregado', () => {
    const propio = enlaceDeProfesor('ana-piano', ORIGEN, BASE);
    expect(enlaceDia('ana-piano', '2026-10-30', ORIGEN, BASE)).toBe(`${propio}?d=2026-10-30`);
    expect(enlaceDia('ana-piano', '2026-10-30', `${ORIGEN}/`, 'reservas')).toBe(`${propio}?d=2026-10-30`);
  });

  it('SEC_16_SEC_36_un_slug_hostil_no_produce_enlace', () => {
    for (const hostil of ['a/../b', 'x?d=1#', '<script>', '<script>alert(1)</script>', 'ana piano', 'ana%2Fb', 'ana&d=1']) {
      expect(slugValidoParaEnlace(hostil)).toBe(false);
      expect(enlaceDia(hostil, '2026-10-30', ORIGEN, BASE)).toBeNull();
    }
  });

  it('SEC_36_fuera_de_la_forma_de_ADM_02_no_hay_enlace_tampoco_normalizando', () => {
    // Mayúsculas o espacios no se corrigen: el slug de la sesión se usa tal cual o no se usa.
    for (const fuera of ['Ana-Piano', ' ana-piano', 'ab', 'a'.repeat(31), '-ana', 'ana-', 'panel', 'p', '', null, undefined]) {
      expect(enlaceDia(fuera, '2026-10-30', ORIGEN, BASE)).toBeNull();
    }
  });

  it('SEC_36_un_dia_que_no_es_AAAA_MM_DD_no_produce_enlace', () => {
    for (const dia of ['2026-10-30#x', '30/10/2026', '2026-02-30', '']) {
      expect(enlaceDia('ana-piano', dia, ORIGEN, BASE)).toBeNull();
    }
  });

  it('SEC_16_SEC_36_slug_y_dia_van_codificados_con_encodeURIComponent_y_se_leen_igual_de_vuelta', () => {
    for (const slug of ['ana-piano', 'prof-2026', 'abc', 'a1-b2-c3']) {
      const enlace = enlaceDia(slug, '2026-10-30', ORIGEN, BASE) as string;
      expect(enlace).toBe(
        `${ORIGEN}${BASE}#/p/${encodeURIComponent(slug)}?d=${encodeURIComponent('2026-10-30')}`,
      );
      const hash = new URL(enlace).hash;
      const [ruta, consulta] = hash.slice(1).split('?') as [string, string];
      expect(decodeURIComponent(ruta.replace(/^\/p\//, ''))).toBe(slug);
      expect(new URLSearchParams(consulta).get('d')).toBe('2026-10-30');
      expect([...new URLSearchParams(consulta).keys()]).toEqual(['d']);
    }
  });
});

describe('useEnlaceDia', () => {
  it('INV_03_CAL_20_usa_el_slug_del_profesor_de_la_sesion', () => {
    estado.sesion = sesionDeProfesor('ana-piano');
    const { result } = renderHook(() => useEnlaceDia('2026-10-30'));
    expect(result.current).toBe(`${enlaceDeProfesor('ana-piano')}?d=2026-10-30`);
  });

  it('SEC_36_sin_profesor_en_la_sesion_o_con_slug_hostil_no_hay_enlace', () => {
    estado.sesion = { tipo: 'visitante' };
    expect(renderHook(() => useEnlaceDia('2026-10-30')).result.current).toBeNull();
    estado.sesion = sesionDeProfesor('x?d=1#');
    expect(renderHook(() => useEnlaceDia('2026-10-30')).result.current).toBeNull();
  });
});

describe('copiarEnlaceDia', () => {
  const enlace = 'https://app.ejemplo.test/reservas/#/p/ana-piano?d=2026-10-30';

  it('CAL_20_copia_el_enlace_y_da_ok_para_Enlace_copiado', async () => {
    const copiar = vi.fn(async () => true);
    expect(await copiarEnlaceDia(enlace, copiar)).toBe('ok');
    expect(copiar).toHaveBeenCalledWith(enlace);
  });

  it('CAL_20_si_el_navegador_no_deja_copiar_da_fallo_sin_lanzar', async () => {
    expect(await copiarEnlaceDia(enlace, async () => false)).toBe('fallo');
    expect(
      await copiarEnlaceDia(enlace, async () => {
        throw new Error('NotAllowedError');
      }),
    ).toBe('fallo');
  });

  it('SEC_36_sin_enlace_no_copia_nada_y_da_fallo', async () => {
    const copiar = vi.fn(async () => true);
    expect(await copiarEnlaceDia(null, copiar)).toBe('fallo');
    expect(copiar).not.toHaveBeenCalled();
  });

  it('CAL_20_por_defecto_usa_el_portapapeles_del_navegador', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    try {
      expect(await copiarEnlaceDia(enlace)).toBe('ok');
      expect(writeText).toHaveBeenCalledWith(enlace);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
