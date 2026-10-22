import { describe, expect, it, vi } from 'vitest';
import {
  dependenciasCodigo,
  dependenciasGoogle,
  destinoTrasIngreso,
  hashTrasIngreso,
  ingresarConGoogle,
  MENSAJES_GOOGLE,
  type AuthGoogle,
} from '../../../../src/modulos/ingreso/logica';
import { CLAVE_RUTA } from '../../../../src/estado/retorno';

function almacen() {
  const datos = new Map<string, string>();
  return { datos, setItem: (k: string, v: string) => void datos.set(k, v) };
}

describe('ingresarConGoogle (ALU-01, ADR-007)', () => {
  it('ALU_01_google_guarda_la_ruta_de_volver_y_vuelve_a_origen_mas_base_sin_captcha', async () => {
    const auth = { signInWithOAuth: vi.fn<AuthGoogle['signInWithOAuth']>(async () => ({ error: null })) };
    const storage = almacen();
    const r = await ingresarConGoogle(
      { busqueda: '?volver=%2Fmis-clases' },
      { obtenerAuth: async () => auth, storage, redirectTo: 'https://agendaclasesapp.github.io/reservas/' },
    );
    expect(r).toEqual({ ok: true });
    expect(storage.datos.get(CLAVE_RUTA)).toBe('#/mis-clases');
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'https://agendaclasesapp.github.io/reservas/' },
    });
  });

  it('ALU_01_volver_ajeno_o_al_ingreso_se_cambia_por_la_agenda', () => {
    expect(hashTrasIngreso('?volver=https%3A%2F%2Fmalicioso.example')).toBe('#/');
    expect(hashTrasIngreso('?volver=%2F%2Fmalicioso.example')).toBe('#/');
    expect(hashTrasIngreso('?volver=%2Fingreso')).toBe('#/');
    expect(hashTrasIngreso('')).toBe('#/');
    expect(destinoTrasIngreso('?volver=%2Fsolicitud%3Fhueco%3D7%26d%3D2026-11-03')).toBe('/solicitud?hueco=7&d=2026-11-03');
  });

  it('ALU_01_error_de_auth_o_de_red_da_mensaje_del_catalogo', async () => {
    const storage = almacen();
    const conError = { signInWithOAuth: vi.fn(async () => ({ error: { status: 400, message: 'provider disabled' } })) };
    await expect(
      ingresarConGoogle({ busqueda: '' }, { obtenerAuth: async () => conError, storage, redirectTo: 'x' }),
    ).resolves.toEqual({ ok: false, error: 'otro', mensaje: MENSAJES_GOOGLE.otro });
    const sinRed = async (): Promise<AuthGoogle> => {
      throw new TypeError('Failed to fetch');
    };
    await expect(ingresarConGoogle({ busqueda: '' }, { obtenerAuth: sinRed, storage, redirectTo: 'x' })).resolves.toEqual(
      { ok: false, error: 'sin_conexion', mensaje: MENSAJES_GOOGLE.sin_conexion },
    );
  });

  it('ALU_01_dependencias_del_navegador_usan_origen_base_y_session_storage', () => {
    const g = dependenciasGoogle();
    expect(g.redirectTo).toBe(window.location.origin + import.meta.env.BASE_URL);
    expect(g.redirectTo).not.toContain('#');
    expect(g.storage).toBe(window.sessionStorage);
    const c = dependenciasCodigo();
    expect(c.storage).toBe(window.sessionStorage);
    expect(typeof c.ahora()).toBe('number');
  });
});
