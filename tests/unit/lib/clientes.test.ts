import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { crearCliente, OPCIONES_AUTH } from '../../../src/lib/supabase-cliente';
import { cargarSupabase, reiniciarCargaSupabase } from '../../../src/lib/supabase';
import { crearClienteRest, encabezadosAnonimos, rest } from '../../../src/lib/rest';
import { entorno } from '../../../src/lib/env';

const ENV = { supabaseUrl: 'http://127.0.0.1:54321', supabaseAnonKey: 'clave-anon-de-prueba' };

afterEach(() => reiniciarCargaSupabase());

describe('cliente supabase-js con PKCE (ADR-007)', () => {
  it('WEB_02_opciones_pkce_sin_deteccion_en_url_y_con_sesion_persistida', () => {
    expect(OPCIONES_AUTH).toEqual({ flowType: 'pkce', detectSessionInUrl: false, persistSession: true });
    const auth = crearCliente(ENV).auth as unknown as { flowType: string; detectSessionInUrl: boolean };
    expect(auth.flowType).toBe('pkce');
    expect(auth.detectSessionInUrl).toBe(false);
  });

  it('WEB_02_el_cliente_por_defecto_lee_el_entorno_de_la_compilacion', () => {
    expect(entorno()).toEqual(ENV);
    expect(crearCliente()).toBeDefined();
  });

  it('WEB_02_carga_diferida_devuelve_siempre_el_mismo_cliente', async () => {
    const cliente = {} as SupabaseClient;
    const importar = vi.fn(async () => ({ crearCliente: () => cliente }));
    const [a, b] = await Promise.all([cargarSupabase(importar), cargarSupabase(importar)]);
    expect(a).toBe(cliente);
    expect(b).toBe(cliente);
    expect(importar).toHaveBeenCalledTimes(1);
  });

  it('WEB_02_si_la_carga_falla_el_siguiente_pedido_reintenta', async () => {
    const importar = vi
      .fn<() => Promise<{ crearCliente: () => SupabaseClient }>>()
      .mockRejectedValueOnce(new Error('chunk no disponible'))
      .mockResolvedValueOnce({ crearCliente: () => ({}) as SupabaseClient });
    await expect(cargarSupabase(importar)).rejects.toThrow('chunk no disponible');
    await expect(cargarSupabase(importar)).resolves.toBeDefined();
    expect(importar).toHaveBeenCalledTimes(2);
  });

  it('WEB_02_el_importador_por_defecto_carga_el_modulo_real', async () => {
    const cliente = await cargarSupabase();
    expect(typeof cliente.auth.exchangeCodeForSession).toBe('function');
  });
});

describe('cliente REST anónimo de la agenda (ADR-017)', () => {
  it('WEB_01_la_app_usa_un_solo_cliente_rest', () => {
    expect(rest()).toBe(rest());
  });

  it('WEB_01_encabezados_iguales_a_supabase_js_sin_sesion', () => {
    expect(encabezadosAnonimos('k')).toEqual({ apikey: 'k', Authorization: 'Bearer k' });
  });

  it('WEB_01_agenda_publica_va_a_rest_v1_rpc_con_la_clave_anon', async () => {
    const fetchFalso = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify([{ inicio: 'a', fin: 'b', estado: 'libre' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const { data, error } = await crearClienteRest(ENV, fetchFalso).rpc('agenda_publica', { p_dia: '2026-11-02' });
    expect(error).toBeNull();
    expect(data).toEqual([{ inicio: 'a', fin: 'b', estado: 'libre' }]);
    const [url, init] = fetchFalso.mock.calls[0]!;
    expect(String(url)).toBe('http://127.0.0.1:54321/rest/v1/rpc/agenda_publica');
    const h = new Headers(init?.headers);
    expect(h.get('apikey')).toBe('clave-anon-de-prueba');
    expect(h.get('authorization')).toBe('Bearer clave-anon-de-prueba');
  });

  it('WEB_01_error_de_la_rpc_llega_como_objeto_para_errores_ts', async () => {
    const fetchFalso = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ code: 'PT422', message: 'DATOS_INVALIDOS', details: '{"campo":"p_dia"}' }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const { data, error } = await crearClienteRest(ENV, fetchFalso).rpc('agenda_publica', { p_dia: '1900-01-01' });
    expect(data).toBeNull();
    expect(error?.message).toBe('DATOS_INVALIDOS');
  });
});
