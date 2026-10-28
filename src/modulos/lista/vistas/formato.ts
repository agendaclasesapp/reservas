// Formato de la ficha del alumno en la lista del profesor (WEB-07, ALU-09): todo es texto plano (SEC-16).
import type { Dia } from '../../../lib/fechas';
import type { TipoInsignia } from '../../../ui';
import type { EstadoAlumno } from '../logica';

const FORMATO = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** `1990-02-03` → «3 de febrero de 1990». Sin dato o inválido: «Sin dato» o el texto recibido. */
export function formatearNacimiento(dia: Dia | null): string {
  if (dia === null || dia === '') return 'Sin dato';
  const fecha = new Date(`${dia}T12:00:00Z`);
  return Number.isNaN(fecha.getTime()) ? dia : FORMATO.format(fecha);
}

/** Edad calculada por la base (CA-07): «26 años», «1 año». */
export function textoEdad(edad: number | null): string {
  if (edad === null) return 'Sin dato';
  return edad === 1 ? '1 año' : `${edad} años`;
}

export function textoOpcional(valor: string | null): string {
  return valor === null || valor === '' ? 'Sin dato' : valor;
}

/** Estado de la lista (ALU-09) → insignia y su texto: pendiente, aprobado, rechazado o sin cuenta. */
export const INSIGNIA_ESTADO: Readonly<Record<EstadoAlumno, { tipo: TipoInsignia; texto: string }>> = {
  pendiente: { tipo: 'pendiente', texto: 'Pendiente' },
  aprobado: { tipo: 'aprobada', texto: 'Aprobado' },
  rechazado: { tipo: 'rechazada', texto: 'Rechazado' },
  sin_cuenta: { tipo: 'sinCuenta', texto: 'Sin cuenta' },
};

/** Lo que la vista necesita mostrar de un alumno al comparar o resolver una cuenta. */
export type ResultadoGuardado =
  | { ok: true }
  | { ok: false; mensaje: string; campo: 'nombre' | 'telefono' | 'fecha_nacimiento' | 'mail' | 'motivo' | null; codigo: string };
