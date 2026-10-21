import { describe, expect, it, vi } from 'vitest';
import { CLAVE_RUTA, guardarRuta, procesarRetorno } from '../../src/retorno';

function almacen(inicial: Record<string, string> = {}) {
  const m = new Map(Object.entries(inicial));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
    removeItem: (k: string) => {
      m.delete(k);
    },
    m,
  };
}

describe('S02 retorno PKCE con rutas hash (ADR-007, WEB-02)', () => {
  it('S02_canjea_code_limpia_query_y_restaura_ruta_guardada', async () => {
    const auth = { exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }) };
    const history = { replaceState: vi.fn() };
    const storage = almacen({ [CLAVE_RUTA]: '#/mis-clases' });
    const r = await procesarRetorno({
      auth,
      href: 'https://agendaclasesapp.github.io/reservas/?code=abc-123',
      history,
      storage,
    });
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('abc-123');
    expect(r).toEqual({ procesado: true, canjeado: true, error: null, ruta: '#/mis-clases' });
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/reservas/#/mis-clases');
    expect(storage.m.has(CLAVE_RUTA)).toBe(false);
  });

  it('S02_code_invalido_devuelve_error_y_va_a_la_ruta_guardada_sin_query', async () => {
    const auth = { exchangeCodeForSession: vi.fn().mockResolvedValue({ error: { message: 'invalid flow state' } }) };
    const history = { replaceState: vi.fn() };
    const r = await procesarRetorno({
      auth,
      href: 'http://127.0.0.1:5173/reservas/?code=falso',
      history,
      storage: almacen({ [CLAVE_RUTA]: '#/ficha' }),
    });
    expect(r).toMatchObject({ canjeado: false, error: 'invalid flow state', ruta: '#/ficha' });
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/reservas/#/ficha');
  });

  it('S02_error_description_del_proveedor_no_intenta_canje', async () => {
    const auth = { exchangeCodeForSession: vi.fn() };
    const history = { replaceState: vi.fn() };
    const r = await procesarRetorno({
      auth,
      href: 'http://127.0.0.1:5173/reservas/?error=access_denied&error_description=Acceso%20denegado',
      history,
      storage: almacen(),
    });
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(r).toMatchObject({ error: 'Acceso denegado', ruta: '#/' });
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/reservas/#/');
  });

  it('S02_sin_code_no_toca_la_url', async () => {
    const auth = { exchangeCodeForSession: vi.fn() };
    const history = { replaceState: vi.fn() };
    const r = await procesarRetorno({
      auth,
      href: 'http://127.0.0.1:5173/reservas/#/mis-clases',
      history,
      storage: almacen(),
    });
    expect(r.procesado).toBe(false);
    expect(history.replaceState).not.toHaveBeenCalled();
  });

  it('S02_ruta_guardada_ajena_al_hash_cae_en_la_ruta_por_defecto', async () => {
    const s = almacen();
    guardarRuta(s, 'https://otro.sitio/');
    expect(s.m.get(CLAVE_RUTA)).toBe('#/');
    const r = await procesarRetorno({
      auth: { exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }) },
      href: 'http://127.0.0.1:5173/reservas/?code=x',
      history: { replaceState: vi.fn() },
      storage: almacen({ [CLAVE_RUTA]: '//evil' }),
    });
    expect(r.ruta).toBe('#/');
  });
});
