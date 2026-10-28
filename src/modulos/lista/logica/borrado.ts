// Borrar un alumno de la lista del profesor (B11, ALU-12, DEC-26 A): `borrar_alumno(p_alumno_id)` →
// `{clases_canceladas, solicitudes_anuladas}` (contratos.md §3; supabase/migrations/202611001103_*).
// Sus clases futuras con el profesor se cancelan (los huecos quedan libres), deja de verlo, y la persona se
// borra solo si no tenía cuenta ni otro profesor. Sin mails (DEC-05 A). Errores con src/lib/errores.ts (SEC-17).
import { z } from 'zod';
import { falloLista, type DependenciasLista, type FalloLista } from './lista';
import type { AlumnoLista } from './tipos';

export const MENSAJES_BORRADO = {
  titulo: 'Borrar alumno',
  confirmar: 'Borrar',
  /** ALU-12: lo que pasa siempre. */
  efecto:
    'Sus clases futuras con vos se cancelan y esos horarios quedan libres. Sus clases pasadas quedan sin sus datos y deja de aparecer en tu lista.',
  /** DEC-05 A: la cancelación por borrado no manda mails. */
  sinAviso: 'No le avisamos por mail.',
  /** ALU-12, DEC-26 A: un profesor nunca borra la cuenta de una persona. */
  conCuenta: 'Tiene cuenta: su cuenta y su ficha siguen, y lo suyo con otros profesores no cambia.',
  /** Sin cuenta y la ficha es solo tuya (`editable`, DEC-32): se borran sus datos como en ALU-10. */
  sinCuentaSoloTuyo: 'No tiene cuenta ni otro profesor: sus datos y sus personas a cargo se borran y no se pueden recuperar.',
  /** Sin cuenta, pero la ficha no es solo tuya: la base decide según tenga otro profesor. */
  sinCuentaCompartido:
    'No tiene cuenta: si no es alumno de otro profesor, sus datos y sus personas a cargo se borran y no se pueden recuperar.',
  /** Texto único de la persona sin datos para vos (ADR-011, componentes.md §4): clases pasadas de alguien que ya
   * no está en tu lista (`titular` null en `v_clases`) o anonimizado (ALU-10, ALU-12). */
  nombreDadoDeBaja: 'Alumno dado de baja',
} as const;

const esquemaRespuestaBorrado = z.object({
  clases_canceladas: z.number().int().nonnegative(),
  solicitudes_anuladas: z.number().int().nonnegative(),
});

export type ResultadoBorrado = { ok: true; clasesCanceladas: number; solicitudesAnuladas: number } | FalloLista;

/**
 * ALU-12: borra al alumno de la lista de quien llama. La base decide todo: 404 `NO_ENCONTRADO` si no es suyo o
 * ya lo borró, 403 `PROHIBIDO` si quien llama no es profesor (SEC-06). Después de `ok`, recargar la lista.
 */
export async function borrarAlumno(alumnoId: string, deps: DependenciasLista): Promise<ResultadoBorrado> {
  try {
    const cliente = await deps.obtenerCliente();
    const { data, error } = await cliente.rpc('borrar_alumno', { p_alumno_id: alumnoId });
    if (error) return falloLista(error);
    const r = esquemaRespuestaBorrado.parse(data);
    return { ok: true, clasesCanceladas: r.clases_canceladas, solicitudesAnuladas: r.solicitudes_anuladas };
  } catch (e) {
    return falloLista(e);
  }
}

/**
 * Párrafos del diálogo de confirmación (T11.2): qué pasa siempre, que no hay mail y qué pasa con la persona
 * según tenga cuenta (`con_usuario`) o la ficha sea solo suya (`editable`).
 */
export function textoConfirmacionBorrado(alumno: Pick<AlumnoLista, 'con_usuario' | 'editable'>): string[] {
  const persona = alumno.con_usuario
    ? MENSAJES_BORRADO.conCuenta
    : alumno.editable
      ? MENSAJES_BORRADO.sinCuentaSoloTuyo
      : MENSAJES_BORRADO.sinCuentaCompartido;
  return [MENSAJES_BORRADO.efecto, persona, MENSAJES_BORRADO.sinAviso];
}

function contar(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** Resumen después de borrar (T11.2): cuántas clases futuras se cancelaron y cuántas solicitudes se anularon. */
export function resumenBorrado(r: { clasesCanceladas: number; solicitudesAnuladas: number }): string {
  if (r.clasesCanceladas === 0 && r.solicitudesAnuladas === 0) {
    return 'Alumno borrado. No tenía clases futuras ni solicitudes pendientes con vos.';
  }
  const partes: string[] = [];
  if (r.clasesCanceladas > 0) {
    partes.push(`se ${r.clasesCanceladas === 1 ? 'canceló' : 'cancelaron'} ${contar(r.clasesCanceladas, 'clase', 'clases')}`);
  }
  if (r.solicitudesAnuladas > 0) {
    partes.push(
      `se ${r.solicitudesAnuladas === 1 ? 'anuló' : 'anularon'} ${contar(r.solicitudesAnuladas, 'solicitud pendiente', 'solicitudes pendientes')}`,
    );
  }
  return `Alumno borrado: ${partes.join(' y ')}.`;
}

/** Nombre para mostrar en clases y listas: «Alumno dado de baja» cuando la persona ya no tiene datos para vos (ALU-12, ADR-011). */
export function nombreVisible(nombre: string | null | undefined): string {
  const recortado = (nombre ?? '').trim();
  return recortado === '' ? MENSAJES_BORRADO.nombreDadoDeBaja : recortado;
}
