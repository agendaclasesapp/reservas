import { describe, expect, it, vi } from 'vitest';
import { iniciarSesion, type DependenciasSesion } from '../../../src/estado/sesion';
import {
  CLAVE_RUTA,
  guardarRuta,
  procesarRetorno,
  RUTA_POR_DEFECTO,
  SIN_RETORNO,
  traeRetorno,
  type CanjeadorDeCodigo,
} from '../../../src/estado/retorno';

const BASE = 'https://agendaclasesapp.github.io/reservas/';

function almacen(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial));
  return {
    datos,
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    removeItem: (k: string) => void datos.delete(k),
  };
}

function deps(href: string, auth: CanjeadorDeCodigo, storage = almacen()) {
  const history = { replaceState: vi.fn() };
  const cargarAuth = vi.fn(async () => auth);
  const d: DependenciasSesion = { href, history, storage, cargarAuth };
  return { d, history, cargarAuth, storage };
}

const canjeOk: CanjeadorDeCodigo = { exchangeCodeForSession: vi.fn(async () => ({ error: null })) };

describe('iniciarSesion (ADR-007, ADR-017)', () => {
  it('WEB_02_sin_code_vuelve_sin_cargar_supabase_js', async () => {
    const { d, cargarAuth, history } = deps(`${BASE}#/panel`, canjeOk);
    await expect(iniciarSesion(d)).resolves.toBe(SIN_RETORNO);
    expect(cargarAuth).not.toHaveBeenCalled();
    expect(history.replaceState).not.toHaveBeenCalled();
  });

  it('WEB_02_en_el_navegador_sin_code_no_toca_la_url', async () => {
    window.history.replaceState(null, '', '/reservas/#/agenda');
    await expect(iniciarSesion()).resolves.toBe(SIN_RETORNO);
    expect(window.location.hash).toBe('#/agenda');
  });

  it('WEB_02_con_code_canjea_limpia_la_query_y_vuelve_a_la_ruta_guardada', async () => {
    const auth: CanjeadorDeCodigo = { exchangeCodeForSession: vi.fn(async () => ({ error: null })) };
    const { d, history, storage } = deps(`${BASE}?code=abc123`, auth, almacen({ [CLAVE_RUTA]: '#/mis-clases' }));
    const r = await iniciarSesion(d);
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('abc123');
    expect(r).toEqual({ procesado: true, canjeado: true, error: null, ruta: '#/mis-clases' });
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/reservas/#/mis-clases');
    expect(storage.datos.has(CLAVE_RUTA)).toBe(false);
  });

  it('WEB_02_canje_fallido_guarda_el_error_y_va_a_la_ruta_por_defecto', async () => {
    const auth: CanjeadorDeCodigo = {
      exchangeCodeForSession: vi.fn(async () => ({ error: { message: 'invalid flow state' } })),
    };
    const { d, history } = deps(`${BASE}?code=viejo`, auth);
    const r = await iniciarSesion(d);
    expect(r).toEqual({ procesado: true, canjeado: false, error: 'invalid flow state', ruta: RUTA_POR_DEFECTO });
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/reservas/#/');
  });

  it('WEB_02_error_del_proveedor_no_intenta_canjear', async () => {
    const auth: CanjeadorDeCodigo = { exchangeCodeForSession: vi.fn() };
    const { d } = deps(`${BASE}?error=access_denied&error_description=El+usuario+cancel%C3%B3`, auth);
    const r = await iniciarSesion(d);
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(r.error).toBe('El usuario canceló');
    expect(r.canjeado).toBe(false);
  });
});

describe('retorno PKCE (S02)', () => {
  it('WEB_02_solo_code_o_error_description_cuentan_como_retorno', () => {
    expect(traeRetorno(`${BASE}?code=x`)).toBe(true);
    expect(traeRetorno(`${BASE}?error_description=x`)).toBe(true);
    expect(traeRetorno(`${BASE}#/?code=x`)).toBe(false);
    expect(traeRetorno(`${BASE}?otra=1`)).toBe(false);
  });

  it('WEB_02_ruta_guardada_que_no_es_hash_se_ignora', async () => {
    const s = almacen();
    guardarRuta(s, 'https://malicioso.example/');
    expect(s.datos.get(CLAVE_RUTA)).toBe(RUTA_POR_DEFECTO);
    guardarRuta(s, '#/ficha');
    expect(s.datos.get(CLAVE_RUTA)).toBe('#/ficha');

    const history = { replaceState: vi.fn() };
    const r = await procesarRetorno({
      auth: canjeOk,
      href: `${BASE}?code=x`,
      history,
      storage: almacen({ [CLAVE_RUTA]: '//malicioso.example' }),
    });
    expect(r.ruta).toBe(RUTA_POR_DEFECTO);
  });
});
