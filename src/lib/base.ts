// `base` de Vite: GitHub Pages publica en /reservas/ (DEC-14); VITE_BASE lo cambia sin tocar código.

export const BASE_POR_DEFECTO = '/reservas/';

const RUTA_VALIDA = /^\/(?:[A-Za-z0-9._~-]+\/)*$/;

/** Normaliza VITE_BASE a `/ruta/`; vacío o ausente da `/reservas/`. Rechaza URLs y `..`. */
export function normalizarBase(valor: string | undefined): string {
  const limpio = (valor ?? '').trim();
  if (limpio === '') return BASE_POR_DEFECTO;
  const conBarras = `/${limpio.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
  if (!RUTA_VALIDA.test(conBarras) || conBarras.split('/').some((s) => s === '..' || s === '.')) {
    throw new Error('VITE_BASE debe ser una ruta como /reservas/ (sin dominio ni "..").');
  }
  return conBarras;
}
