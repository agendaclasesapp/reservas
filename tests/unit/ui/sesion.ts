// Sesión fija para las pruebas de vistas que leen `useSesion()` (B14 · T14.4): se carga por la misma vía que la
// app (`sesion_actual` con un cliente falso), así las vistas se prueban sin simular los hooks de src/estado.
import type { SupabaseClient } from '@supabase/supabase-js';
import { act } from '@testing-library/react';
import { configurarAlmacenProfesor } from '../../../src/estado/profesor';
import { configurarSesionActual, refrescarSesion } from '../../../src/estado/sesion-actual';
import type { SesionActual } from '../../../src/estado';
import { almacenEnMemoria } from '../estado/soporte';

/** Cliente de Supabase mínimo: `rpc('sesion_actual')` y el oyente de Auth. */
function clienteConSesion(leer: () => SesionActual | null): SupabaseClient {
  return {
    rpc: async () => ({ data: leer(), error: null }),
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) },
  } as unknown as SupabaseClient;
}

/**
 * La app queda con esa sesión (o de visitante, con `null`) y `sessionStorage` en memoria y vacío. El resultado
 * trae `cambiar(nueva)`: vuelve a leer `sesion_actual` con otra sesión sin soltar a los oyentes (p. ej. tras
 * «Pedir acceso» o completar la ficha).
 */
export async function fijarSesion(sesion: SesionActual | null) {
  const memoria = almacenEnMemoria();
  let actual = sesion;
  configurarAlmacenProfesor(() => memoria.almacen);
  configurarSesionActual({
    haySesionGuardada: () => actual !== null,
    obtenerCliente: async () => clienteConSesion(() => actual),
  });
  if (sesion !== null) await act(async () => void (await refrescarSesion()));
  return {
    ...memoria,
    cambiar: async (nueva: SesionActual) => {
      actual = nueva;
      await act(async () => void (await refrescarSesion()));
    },
  };
}

/** Deja la sesión y el almacén de profesores como los usa la app. */
export function restaurarSesion(): void {
  configurarSesionActual();
  configurarAlmacenProfesor();
}
