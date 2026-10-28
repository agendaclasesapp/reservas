// Llamadas de la lista de alumnos (contratos.md §3): `aprobar_cuenta`, `rechazar_cuenta`, `sugerencias_union`,
// `unir_alumnos`, `descartar_union`, `alta_alumno`, `editar_alumno`, y la lectura de `v_alumnos` (§2).
// Los errores se traducen con src/lib/errores.ts (SEC-17); de `details` solo se leen `campo` y `alumno_id`.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { traducirError, type CodigoTraducido } from '../../../lib/errores';
import {
  CAMPOS_LISTA,
  COLUMNAS_V_ALUMNOS,
  CUENTA_NO_PENDIENTE,
  esquemaAlumnoLista,
  esquemaMotivo,
  esquemaRespuestaCuenta,
  esquemaSugerencia,
  MENSAJES_LISTA,
  UNION_NO_VALIDA,
  type AlumnoEntrada,
  type AlumnoLista,
  type CampoLista,
  type EstadoAlumno,
  type RespuestaCuenta,
  type Sugerencia,
} from './tipos';

export interface DependenciasLista {
  obtenerCliente: () => Promise<SupabaseClient>;
}

export type CodigoLista = CodigoTraducido | typeof CUENTA_NO_PENDIENTE | typeof UNION_NO_VALIDA;

export type FalloLista = {
  ok: false;
  codigo: CodigoLista;
  mensaje: string;
  /** Campo inválido de un 422 `DATOS_INVALIDOS`, sin el prefijo `p_`. */
  campo: CampoLista | null;
  /** 409 `MAIL_YA_REGISTRADO`: el alumno que ya tiene ese mail (null si es el del profesor). */
  alumnoExistenteId: string | null;
};
export type ResultadoCuenta = ({ ok: true } & RespuestaCuenta) | FalloLista;
export type ResultadoSugerencias = { ok: true; sugerencias: Sugerencia[] } | FalloLista;
export type ResultadoUnion = { ok: true; cuentaId: string } | FalloLista;
/** `asociado`: el mail era de una persona existente y quedó asociada sin tocar su ficha (DEC-29 b). */
export type ResultadoAlta = { ok: true; alumnoId: string; estado: EstadoAlumno; asociado: boolean } | FalloLista;
export type ResultadoEdicion = { ok: true; alumnoId: string } | FalloLista;

function propiedad(objeto: unknown, clave: string): unknown {
  return typeof objeto === 'object' && objeto !== null ? (objeto as Record<string, unknown>)[clave] : undefined;
}

function detallesDe(error: unknown): unknown {
  const details = propiedad(error, 'details');
  if (typeof details !== 'string') return details;
  try {
    return JSON.parse(details) as unknown;
  } catch {
    return null;
  }
}

function campoDe(detalles: unknown): CampoLista | null {
  const campo = propiedad(detalles, 'campo');
  if (typeof campo !== 'string') return null;
  const sinPrefijo = campo.replace(/^p_/, '');
  return (CAMPOS_LISTA as readonly string[]).includes(sinPrefijo) ? (sinPrefijo as CampoLista) : null;
}

/**
 * Traduce el error; los dos 409 propios de B05 con su texto, `PROFESOR_INACTIVO` con el de PRF-08 y el resto
 * con el catálogo (SEC-17). `MAIL_YA_REGISTRADO` con `alumno_id` dice que ya es alumna suya; sin él no dice de
 * quién es el mail (DEC-31).
 */
export function falloLista(error: unknown): FalloLista {
  const message = propiedad(error, 'message');
  if (message === CUENTA_NO_PENDIENTE || message === UNION_NO_VALIDA) {
    return { ok: false, codigo: message, mensaje: MENSAJES_LISTA[message], campo: null, alumnoExistenteId: null };
  }
  const { codigo, mensaje } = traducirError(error);
  const detalles = codigo === 'DATOS_INVALIDOS' || codigo === 'MAIL_YA_REGISTRADO' ? detallesDe(error) : null;
  const existente = propiedad(detalles, 'alumno_id');
  const yaEsAlumno = codigo === 'MAIL_YA_REGISTRADO' && typeof existente === 'string';
  return {
    ok: false,
    codigo,
    mensaje: codigo === 'PROFESOR_INACTIVO'
      ? MENSAJES_LISTA.profesorInactivo
      : yaEsAlumno
        ? MENSAJES_LISTA.mailYaEsTuAlumno
        : mensaje,
    campo: codigo === 'DATOS_INVALIDOS' ? campoDe(detalles) : null,
    alumnoExistenteId: codigo === 'MAIL_YA_REGISTRADO' && typeof existente === 'string' ? existente : null,
  };
}

function motivoInvalido(): FalloLista {
  return {
    ok: false,
    codigo: 'DATOS_INVALIDOS',
    mensaje: MENSAJES_LISTA.motivoLargo,
    campo: 'motivo',
    alumnoExistenteId: null,
  };
}

/** Motivo recortado; vacío = null (sin motivo). */
export function normalizarMotivo(motivo: string | null | undefined): string | null {
  const recortado = (motivo ?? '').trim();
  return recortado === '' ? null : recortado;
}

async function llamar<T>(
  deps: DependenciasLista,
  rpc: string,
  args: Record<string, unknown>,
  leer: (data: unknown) => T,
): Promise<({ ok: true } & T) | FalloLista> {
  try {
    const cliente = await deps.obtenerCliente();
    const { data, error } = await cliente.rpc(rpc, args);
    if (error) return falloLista(error);
    return { ok: true, ...leer(data) };
  } catch (e) {
    return falloLista(e);
  }
}

async function responderCuenta(
  rpc: 'aprobar_cuenta' | 'rechazar_cuenta',
  alumnoId: string,
  motivo: string | null | undefined,
  deps: DependenciasLista,
): Promise<ResultadoCuenta> {
  const p_motivo = normalizarMotivo(motivo);
  if (p_motivo !== null && !esquemaMotivo.safeParse(p_motivo).success) return motivoInvalido();
  return llamar(deps, rpc, { p_alumno_id: alumnoId, p_motivo }, (data) => esquemaRespuestaCuenta.parse(data));
}

/**
 * Aprueba una cuenta pendiente o rechazada (ALU-03, AVI-03). El motivo reemplaza al anterior: sin motivo
 * la cuenta aprobada no conserva el de un rechazo (H-037). Devuelve las sugerencias de unión (ALU-04).
 */
export function aprobarCuenta(
  alumnoId: string,
  motivo: string | null | undefined,
  deps: DependenciasLista,
): Promise<ResultadoCuenta> {
  return responderCuenta('aprobar_cuenta', alumnoId, motivo, deps);
}

/** Rechaza una cuenta pendiente con motivo opcional, que la cuenta ve y recibe por mail (ALU-03, AVI-03). */
export function rechazarCuenta(
  alumnoId: string,
  motivo: string | null | undefined,
  deps: DependenciasLista,
): Promise<ResultadoCuenta> {
  return responderCuenta('rechazar_cuenta', alumnoId, motivo, deps);
}

/** Alumnos sin cuenta con el mismo teléfono normalizado, menos los descartados (ALU-04). */
export function sugerenciasUnion(alumnoId: string, deps: DependenciasLista): Promise<ResultadoSugerencias> {
  return llamar(deps, 'sugerencias_union', { p_alumno_id: alumnoId }, (data) => ({
    sugerencias: z.array(esquemaSugerencia).parse(data ?? []),
  }));
}

const esquemaCuentaId = z.object({ cuenta_id: z.string() });

/** Confirma la unión (ALU-05): todo pasa a la cuenta aprobada y el sin cuenta deja de existir. */
export function unirAlumnos(cuentaId: string, sinCuentaId: string, deps: DependenciasLista): Promise<ResultadoUnion> {
  return llamar(deps, 'unir_alumnos', { p_cuenta_id: cuentaId, p_sin_cuenta_id: sinCuentaId }, (data) => ({
    cuentaId: esquemaCuentaId.parse(data).cuenta_id,
  }));
}

/** Descarta la sugerencia (ALU-04): no vuelve a aparecer y nada se une. */
export function descartarUnion(cuentaId: string, sinCuentaId: string, deps: DependenciasLista): Promise<ResultadoUnion> {
  return llamar(deps, 'descartar_union', { p_cuenta_id: cuentaId, p_sin_cuenta_id: sinCuentaId }, (data) => ({
    cuentaId: esquemaCuentaId.parse(data).cuenta_id,
  }));
}

function argumentosFicha(datos: AlumnoEntrada) {
  const mail = datos.mail.trim();
  return {
    p_nombre: datos.nombre.trim(),
    p_telefono: datos.telefono.trim(),
    p_fecha_nacimiento: datos.fecha_nacimiento.trim(),
    p_mail: mail === '' ? null : mail,
  };
}

const esquemaAlta = z.object({
  alumno_id: z.string(),
  estado: z.enum(['aprobado', 'sin_cuenta']),
  asociado: z.boolean(),
});

/**
 * Alta (ALU-07, ALU-08, DEC-29 b, DEC-31): con mail nuevo, persona aprobada; con el mail de una persona que ya
 * existe, la asocia aprobada sin tocar su ficha (`asociado: true`); sin mail, alumno sin cuenta. Con el
 * profesor inactivo, 409 `PROFESOR_INACTIVO` (PRF-08).
 */
export function altaAlumno(datos: AlumnoEntrada, deps: DependenciasLista): Promise<ResultadoAlta> {
  return llamar(deps, 'alta_alumno', argumentosFicha(datos), (data) => {
    const r = esquemaAlta.parse(data);
    return { alumnoId: r.alumno_id, estado: r.estado, asociado: r.asociado };
  });
}

/**
 * PRF-08: qué puede hacer el profesor en la lista según esté activo. Inactivo, no aprueba accesos ni da de
 * alta; sigue rechazando, uniendo y editando lo que ya tiene (la base decide igual).
 */
export function permisosLista(profesorActivo: boolean): {
  aprobar: boolean;
  rechazar: boolean;
  alta: boolean;
  editar: boolean;
  unir: boolean;
} {
  return { aprobar: profesorActivo, rechazar: true, alta: profesorActivo, editar: true, unir: true };
}

/** DEC-32: la ficha se edita solo si `v_alumnos.editable` (la cargó él, sin usuario y sin otro profesor). */
export function puedeEditar(alumno: AlumnoLista): boolean {
  return alumno.editable;
}

/**
 * Edición de la ficha. El mail va siempre (vacío = sin mail): en un alumno sin usuario agregarlo lo vuelve
 * cuenta aprobada y quitarlo lo deja sin cuenta; en una cuenta con usuario tiene que ser el mismo (si no, 422).
 */
export function editarAlumno(alumnoId: string, datos: AlumnoEntrada, deps: DependenciasLista): Promise<ResultadoEdicion> {
  return llamar(deps, 'editar_alumno', { p_alumno_id: alumnoId, ...argumentosFicha(datos) }, (data) => ({
    alumnoId: z.object({ alumno_id: z.string() }).parse(data).alumno_id,
  }));
}

/** `v_alumnos` (ALU-09), por nombre. Lanza el error de postgrest-js. */
export async function leerAlumnos(deps: DependenciasLista): Promise<AlumnoLista[]> {
  const cliente = await deps.obtenerCliente();
  const { data, error } = await cliente.from('v_alumnos').select(COLUMNAS_V_ALUMNOS).order('nombre');
  if (error) throw error;
  return z.array(esquemaAlumnoLista).parse(data ?? []);
}

/** Cuentas pendientes de aprobación primero (por fecha de ficha), y el resto en el orden recibido. */
export function separarPendientes(alumnos: readonly AlumnoLista[]): { pendientes: AlumnoLista[]; resto: AlumnoLista[] } {
  const pendientes = alumnos
    .filter((a) => a.estado === 'pendiente')
    .sort((a, b) => (a.ficha_completada_en ?? a.creado_en).localeCompare(b.ficha_completada_en ?? b.creado_en));
  return { pendientes, resto: alumnos.filter((a) => a.estado !== 'pendiente') };
}

/** Valores iniciales del formulario: vacío para un alta, la ficha del alumno para editar. */
export function valoresInicialesAlumno(alumno: AlumnoLista | null): AlumnoEntrada {
  return {
    nombre: alumno?.nombre ?? '',
    telefono: alumno?.telefono ?? '',
    fecha_nacimiento: alumno?.fecha_nacimiento ?? '',
    mail: alumno?.mail ?? '',
  };
}
