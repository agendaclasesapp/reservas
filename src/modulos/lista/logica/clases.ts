// Clases de la agenda del profesor en la vista en modo lista (B07): `v_clases` (contratos.md §2) con los
// filtros de PostgREST `inicio=gte/lt` y `alumno_id=eq` (PRF-06, PRF-07, PRF-08, CA-29). Incluye las pasadas.
// Tipos a mano contra supabase/migrations/202611000702_vistas_clases_y_solicitudes.sql.
import { TZDate } from '@date-fns/tz';
import { z } from 'zod';
import { esDia, sumarDias, type Dia } from '../../../lib/fechas';
import type { DependenciasLista } from './lista';
import { ALCANCES, TIPOS_SOLICITUD } from './solicitudes';

export const ESTADOS_CLASE = ['pendiente', 'confirmada', 'rechazada', 'cancelada', 'movida'] as const;
export type EstadoClase = (typeof ESTADOS_CLASE)[number];

/** Fila de `v_clases`. `titular` y `quien_toma` son null si la persona ya no está en su lista (baja). */
export const esquemaClaseProfesor = z.object({
  id: z.string(),
  inicio: z.string(),
  fin: z.string(),
  estado: z.enum(ESTADOS_CLASE),
  alumno_id: z.string(),
  /** Texto (SEC-16). */
  titular: z.string().nullable(),
  quien_toma: z.string().nullable(),
  persona_a_cargo_id: z.string().nullable(),
  observacion: z.string().nullable(),
  reserva_tipo: z.enum(['suelta', 'serie']),
  frecuencia: z.number().int().nullable(),
  solicitud_pendiente: z
    .object({
      id: z.string(),
      tipo: z.enum(TIPOS_SOLICITUD),
      alcance: z.enum(ALCANCES).nullable(),
      vencida: z.boolean(),
    })
    .nullable(),
  /** Ya empezó según `app_ahora()` (ADR-014). */
  pasada: z.boolean(),
  reserva_id: z.string(),
});
export type ClaseProfesor = z.infer<typeof esquemaClaseProfesor>;

export const COLUMNAS_V_CLASES =
  'id, inicio, fin, estado, alumno_id, titular, quien_toma, persona_a_cargo_id, observacion, reserva_tipo, frecuencia, solicitud_pendiente, pasada, reserva_id';

/** Filtro de CA-29: días de calendario en el huso del profesor (ambos inclusive) y alumno; todo opcional. */
export interface FiltroClases {
  desde?: Dia | null;
  hasta?: Dia | null;
  alumnoId?: string | null;
}

export const MENSAJES_CLASES = {
  diaInvalido: 'Elegí una fecha válida.',
  rangoInvertido: 'La fecha «hasta» no puede ser anterior a «desde».',
  estado: {
    pendiente: 'Pendiente de confirmación',
    confirmada: 'Confirmada',
    rechazada: 'Rechazada',
    cancelada: 'Cancelada',
    movida: 'Cambiada de horario',
  } satisfies Record<EstadoClase, string>,
  /** SOL-08: pendiente cuyo horario pasó sin respuesta. */
  pendienteSinRespuesta: 'Pendiente sin respuesta',
} as const;

/** Texto del error del filtro, o null si es válido (un día mal formado o «hasta» antes de «desde»). */
export function validarFiltroClases(filtro: FiltroClases): string | null {
  const { desde, hasta } = filtro;
  if ((desde && !esDia(desde)) || (hasta && !esDia(hasta))) return MENSAJES_CLASES.diaInvalido;
  if (desde && hasta && hasta < desde) return MENSAJES_CLASES.rangoInvertido;
  return null;
}

/** Primer instante del día en el huso del profesor, en UTC (TZDate, ADR-004: sin aritmética de husos a mano). */
function inicioDelDia(dia: Dia, zona: string): string {
  const [anio, mes, d] = dia.split('-').map(Number) as [number, number, number];
  return new Date(new TZDate(anio, mes - 1, d, zona).getTime()).toISOString();
}

/**
 * Rango de instantes del filtro: `inicio >= desde 00:00` y `inicio < (hasta + 1 día) 00:00`, en el huso del
 * profesor. Sin un extremo, ese lado queda abierto.
 */
export function rangoDeFiltro(filtro: FiltroClases, zona: string): { desde: string | null; hasta: string | null } {
  return {
    desde: filtro.desde ? inicioDelDia(filtro.desde, zona) : null,
    hasta: filtro.hasta ? inicioDelDia(sumarDias(filtro.hasta, 1, zona), zona) : null,
  };
}

/**
 * `v_clases` con el filtro (PRF-06, CA-29), por inicio. Lanza el error de postgrest-js, o un `RangeError` si el
 * filtro no es válido (la vista valida antes con `validarFiltroClases`).
 */
export async function leerClases(filtro: FiltroClases, zona: string, deps: DependenciasLista): Promise<ClaseProfesor[]> {
  const invalido = validarFiltroClases(filtro);
  if (invalido) throw new RangeError(invalido);
  const rango = rangoDeFiltro(filtro, zona);
  const cliente = await deps.obtenerCliente();
  let consulta = cliente.from('v_clases').select(COLUMNAS_V_CLASES);
  if (rango.desde) consulta = consulta.gte('inicio', rango.desde);
  if (rango.hasta) consulta = consulta.lt('inicio', rango.hasta);
  if (filtro.alumnoId) consulta = consulta.eq('alumno_id', filtro.alumnoId);
  const { data, error } = await consulta.order('inicio').order('id');
  if (error) throw error;
  return z.array(esquemaClaseProfesor).parse(data ?? []);
}

/** Texto del estado; «Pendiente sin respuesta» si es una pendiente cuyo horario pasó (SOL-08). */
export function textoEstadoClaseProfesor(clase: Pick<ClaseProfesor, 'estado' | 'pasada'>): string {
  if (clase.estado === 'pendiente' && clase.pasada) return MENSAJES_CLASES.pendienteSinRespuesta;
  return MENSAJES_CLASES.estado[clase.estado];
}
