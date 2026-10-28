// Formato de la lista de profesores del Administrador (WEB-10, ADM-03): todo es texto plano (SEC-16).
import type { ProfesorLista } from '../logica';

/** Nombre para mostrar y para los nombres accesibles de los botones. */
export function nombreProfesor(profesor: Pick<ProfesorLista, 'nombre'>): string {
  return profesor.nombre === null || profesor.nombre.trim() === '' ? 'Sin nombre' : profesor.nombre;
}

/** `1 profesor` / `3 profesores`. */
export function textoCantidad(cantidad: number): string {
  return cantidad === 1 ? '1 profesor' : `${cantidad} profesores`;
}

export const TEXTO_ACTIVO = 'Activo';
export const TEXTO_INACTIVO = 'Inactivo';
