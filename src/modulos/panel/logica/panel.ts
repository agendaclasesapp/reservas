// Lógica del panel del profesor (B09): agenda del día con nombres, contadores y gestión directa de clases.
// RPC de contratos.md §3: `agenda_profesor(p_dia)`, `contadores()`, `crear_clase(...)`, `mover_clase(...)`,
// `cancelar_clase(...)`. PRF-01..05, PRF-07, PRF-08, AVI-01, AVI-04, SEC-06, SEC-09, SEC-17.
// La base decide siempre (ADR-001); lo de acá evita viajes inútiles y elige el texto del error.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { traducirError, type CodigoTraducido } from '../../../lib/errores';
import { esDia, type Dia } from '../../../lib/fechas';
import {
  ALCANCES,
  CAMPOS_PANEL,
  esquemaClaseCreada,
  esquemaClaseMovida,
  esquemaClasesCanceladas,
  esquemaContadores,
  esquemaFilaAgenda,
  FRECUENCIAS,
  LARGO_MAX_OBSERVACION,
  MENSAJES_PANEL,
  TIPOS_CLASE,
  type Alcance,
  type CampoPanel,
  type ClaseCreada,
  type ClaseMovida,
  type ClasesCanceladas,
  type Contadores,
  type EntradaCrearClase,
  type FilaAgendaProfesor,
  type TipoClase,
} from './tipos';

export interface DependenciasPanel {
  obtenerCliente: () => Promise<SupabaseClient>;
}

/** Operación que falló: elige el texto de `PROHIBIDO` y `NO_ENCONTRADO`, que dicen cosas distintas en cada una. */
export type OperacionPanel = 'crear' | 'mover' | 'cancelar';

export type FalloPanel = {
  ok: false;
  codigo: CodigoTraducido;
  /** Texto ya traducido (SEC-17): nunca `details` crudos. */
  mensaje: string;
  /** Campo del 422 que la vista marca; null en los demás errores. */
  campo: CampoPanel | null;
};

export type ResultadoCrear = ({ ok: true } & ClaseCreada) | FalloPanel;
export type ResultadoMover = ({ ok: true } & ClaseMovida) | FalloPanel;
export type ResultadoCancelar = ({ ok: true } & ClasesCanceladas) | FalloPanel;

const CAMPOS = new Set<string>(CAMPOS_PANEL);

function campoDelError(error: unknown): CampoPanel | null {
  const details = typeof error === 'object' && error !== null ? (error as { details?: unknown }).details : undefined;
  if (typeof details !== 'string') return null;
  try {
    const campo = (JSON.parse(details) as { campo?: unknown } | null)?.campo;
    return typeof campo === 'string' && CAMPOS.has(campo) ? (campo as CampoPanel) : null;
  } catch {
    return null;
  }
}

const MENSAJE_CAMPO: Record<CampoPanel, string> = {
  p_inicio: MENSAJES_PANEL.horarioInvalido,
  p_destino: MENSAJES_PANEL.horarioInvalido,
  p_tipo: MENSAJES_PANEL.tipoInvalido,
  p_frecuencia: MENSAJES_PANEL.frecuenciaRequerida,
  p_observacion: MENSAJES_PANEL.observacionLarga,
  p_alcance: MENSAJES_PANEL.alcanceInvalido,
  p_dia: MENSAJES_PANEL.diaInvalido,
};

/**
 * Traduce el error de `crear_clase`, `mover_clase` o `cancelar_clase` (SEC-17). `PROFESOR_INACTIVO` con el texto de
 * PRF-08; `PROHIBIDO` en crear es una persona que no es suya (CA-52); `NO_ENCONTRADO` es la persona a cargo al crear
 * y la clase al mover o cancelar; `SOLICITUD_EN_CURSO` pide responderla primero; un 422 marca su campo.
 */
export function falloPanel(error: unknown, operacion: OperacionPanel): FalloPanel {
  const { codigo, mensaje } = traducirError(error);
  if (codigo === 'PROFESOR_INACTIVO') {
    return { ok: false, codigo, mensaje: MENSAJES_PANEL.profesorInactivo, campo: null };
  }
  if (codigo === 'DATOS_INVALIDOS') {
    const campo = campoDelError(error);
    if (campo) return { ok: false, codigo, mensaje: MENSAJE_CAMPO[campo], campo };
  }
  if (codigo === 'PROHIBIDO' && operacion === 'crear') {
    return { ok: false, codigo, mensaje: MENSAJES_PANEL.alumnoNoValido, campo: null };
  }
  if (codigo === 'NO_ENCONTRADO') {
    const texto = operacion === 'crear' ? MENSAJES_PANEL.personaACargoNoValida : MENSAJES_PANEL.claseNoEncontrada;
    return { ok: false, codigo, mensaje: texto, campo: null };
  }
  if (codigo === 'SOLICITUD_EN_CURSO') {
    return { ok: false, codigo, mensaje: MENSAJES_PANEL.solicitudEnCurso, campo: null };
  }
  return { ok: false, codigo, mensaje, campo: null };
}

function falloLocal(campo: CampoPanel, mensaje: string): FalloPanel {
  return { ok: false, codigo: 'DATOS_INVALIDOS', mensaje, campo };
}

/** Observación recortada; vacía = null (como la base). */
export function normalizarObservacion(texto: string | null | undefined): string | null {
  const recortado = (texto ?? '').trim();
  return recortado === '' ? null : recortado;
}

const ALCANCES_VALIDOS = new Set<string>(ALCANCES);
const TIPOS_VALIDOS = new Set<string>(TIPOS_CLASE);
const FRECUENCIAS_VALIDAS = new Set<number>(FRECUENCIAS);

/**
 * Validación previa de `crear_clase` con las reglas de la base (SEC-09): alumno elegido, horario, tipo, frecuencia en
 * una serie y observación hasta 500. Devuelve el fallo del primer campo o null. El rango del horario lo decide la base.
 */
export function validarCrearClase(entrada: EntradaCrearClase): FalloPanel | null {
  if (!entrada.alumnoId) return { ok: false, codigo: 'DATOS_INVALIDOS', mensaje: MENSAJES_PANEL.alumnoRequerido, campo: null };
  if (!entrada.inicio || Number.isNaN(Date.parse(entrada.inicio))) {
    return falloLocal('p_inicio', MENSAJES_PANEL.horarioInvalido);
  }
  if (!TIPOS_VALIDOS.has(entrada.tipo)) return falloLocal('p_tipo', MENSAJES_PANEL.tipoInvalido);
  if (entrada.tipo === 'serie' && !FRECUENCIAS_VALIDAS.has(entrada.frecuencia ?? 0)) {
    return falloLocal('p_frecuencia', MENSAJES_PANEL.frecuenciaRequerida);
  }
  const observacion = normalizarObservacion(entrada.observacion);
  if (observacion !== null && [...observacion].length > LARGO_MAX_OBSERVACION) {
    return falloLocal('p_observacion', MENSAJES_PANEL.observacionLarga);
  }
  return null;
}

async function llamar<T>(
  deps: DependenciasPanel,
  rpc: string,
  args: Record<string, unknown>,
  esquema: z.ZodType<T>,
  operacion: OperacionPanel,
): Promise<({ ok: true } & T) | FalloPanel> {
  try {
    const cliente = await deps.obtenerCliente();
    const { data, error } = await cliente.rpc(rpc, args);
    if (error) return falloPanel(error, operacion);
    return { ok: true, ...esquema.parse(data) };
  } catch (e) {
    return falloPanel(e, operacion);
  }
}

/**
 * PRF-01, PRF-04, AVI-04: crea una clase suelta o una serie confirmada para una persona suya, sin anticipación
 * mínima. En una suelta no manda frecuencia. La base responde 403 si la persona no es suya, 409 si el hueco no
 * está libre o el profesor está inactivo (PRF-08) y 422 por campo o `FUERA_DE_GRILLA`.
 */
export async function crearClase(entrada: EntradaCrearClase, deps: DependenciasPanel): Promise<ResultadoCrear> {
  const invalido = validarCrearClase(entrada);
  if (invalido) return invalido;
  return llamar(
    deps,
    'crear_clase',
    {
      p_alumno_id: entrada.alumnoId,
      p_persona_a_cargo_id: entrada.personaACargoId ?? null,
      p_inicio: entrada.inicio,
      p_tipo: entrada.tipo,
      p_frecuencia: entrada.tipo === 'serie' ? (entrada.frecuencia ?? null) : null,
      p_observacion: normalizarObservacion(entrada.observacion),
    },
    esquemaClaseCreada,
    'crear',
  );
}

/**
 * PRF-02, AVI-04: mueve una clase confirmada a otro hueco, solo esa o de acá en adelante si es de una serie; queda
 * confirmada al instante. Errores: 404 (no es suya), 409 `PROFESOR_INACTIVO`, `CLASE_NO_MODIFICABLE`,
 * `SOLICITUD_EN_CURSO`, `HUECO_NO_LIBRE`; 422 `p_destino`, `p_alcance`, `FUERA_DE_GRILLA`.
 */
export async function moverClase(
  claseId: string,
  destino: string,
  alcance: Alcance,
  deps: DependenciasPanel,
): Promise<ResultadoMover> {
  if (!ALCANCES_VALIDOS.has(alcance)) return falloLocal('p_alcance', MENSAJES_PANEL.alcanceInvalido);
  if (!destino || Number.isNaN(Date.parse(destino))) return falloLocal('p_destino', MENSAJES_PANEL.horarioInvalido);
  return llamar(deps, 'mover_clase', { p_clase_id: claseId, p_destino: destino, p_alcance: alcance }, esquemaClaseMovida, 'mover');
}

/**
 * PRF-03, PRF-08, AVI-04: cancela una clase confirmada o una serie desde esa fecha; los huecos se liberan. Funciona
 * con el profesor inactivo. Errores: 404, 409 `CLASE_NO_MODIFICABLE`, `SOLICITUD_EN_CURSO`; 422 `p_alcance`.
 */
export async function cancelarClase(claseId: string, alcance: Alcance, deps: DependenciasPanel): Promise<ResultadoCancelar> {
  if (!ALCANCES_VALIDOS.has(alcance)) return falloLocal('p_alcance', MENSAJES_PANEL.alcanceInvalido);
  return llamar(deps, 'cancelar_clase', { p_clase_id: claseId, p_alcance: alcance }, esquemaClasesCanceladas, 'cancelar');
}

/** Mismo formato que un error de PostgREST, para que `traducirError` lo traduzca (contratos.md §1). */
function errorDia() {
  return { code: 'PT422', message: 'DATOS_INVALIDOS', details: JSON.stringify({ campo: 'p_dia' }) };
}

/**
 * `agenda_profesor(p_dia)` (PRF-05): los huecos del día en el huso del profesor, con quién toma cada clase. Un día
 * mal formado no sale a la red. Lanza el error de postgrest-js (la vista lo traduce con `mensajeDeError`).
 */
export async function leerAgendaProfesor(dia: Dia, deps: DependenciasPanel): Promise<FilaAgendaProfesor[]> {
  if (!esDia(dia)) throw errorDia();
  const cliente = await deps.obtenerCliente();
  const { data, error } = await cliente.rpc('agenda_profesor', { p_dia: dia });
  if (error) throw error;
  return z.array(esquemaFilaAgenda).parse(data ?? []);
}

/** `contadores()` (AVI-01). Lanza el error de postgrest-js. */
export async function leerContadores(deps: DependenciasPanel): Promise<Contadores> {
  const cliente = await deps.obtenerCliente();
  const { data, error } = await cliente.rpc('contadores');
  if (error) throw error;
  return esquemaContadores.parse(data);
}

/** Total para el aviso del panel (AVI-01): solicitudes más cuentas pendientes. */
export function totalPendientes(contadores: Contadores | null): number {
  return contadores ? contadores.solicitudes_pendientes + contadores.cuentas_pendientes : 0;
}

/** PRF-08: con el profesor inactivo no crea ni mueve; cancelar sigue disponible. */
export function permisosPanel(profesorActivo: boolean): { crear: boolean; mover: boolean; cancelar: boolean } {
  return { crear: profesorActivo, mover: profesorActivo, cancelar: true };
}

export interface AccionesFila {
  crear: boolean;
  mover: boolean;
  cancelar: boolean;
  /** Ofrecer «solo esta clase» / «de acá en adelante» (PRF-02, PRF-03): solo en una serie. */
  elegirAlcance: boolean;
}

/**
 * Qué puede hacer el profesor con una fila de su agenda. Crear: hueco libre que no pasó, con el profesor activo
 * (PRF-01, PRF-04: sin anticipación). Mover y cancelar: clase confirmada que no pasó y sin solicitud pendiente (la
 * base daría 409); mover solo activo (PRF-08). Una clase pendiente se responde desde la lista.
 */
export function accionesFila(fila: FilaAgendaProfesor, profesorActivo: boolean): AccionesFila {
  const permisos = permisosPanel(profesorActivo);
  const gestionable = fila.clase_estado === 'confirmada' && !fila.pasada && fila.solicitud_id === null;
  return {
    crear: permisos.crear && fila.estado === 'libre' && !fila.pasada,
    mover: permisos.mover && gestionable,
    cancelar: permisos.cancelar && gestionable,
    elegirAlcance: gestionable && fila.reserva_tipo === 'serie',
  };
}

/** Huecos libres y futuros de un día, destinos posibles de `mover_clase` (PRF-02). */
export function destinosLibres(filas: readonly FilaAgendaProfesor[]): FilaAgendaProfesor[] {
  return filas.filter((f) => f.estado === 'libre' && !f.pasada);
}

/** Texto de la clase de una fila ocupada: «Ana» o «Hija de Ana (titular: Ana)»; null si no hay a quién nombrar. */
export function textoQuienToma(fila: Pick<FilaAgendaProfesor, 'quien_toma' | 'titular'>): string | null {
  if (!fila.quien_toma) return null;
  if (fila.titular && fila.titular !== fila.quien_toma) return `${fila.quien_toma} (titular: ${fila.titular})`;
  return fila.quien_toma;
}

/**
 * Mensaje de éxito de una operación (AVI-04: el aviso por mail sale solo si la persona tiene mail). Si el resultado
 * trae `salteadas`, la vista las lista debajo de `MENSAJES_PANEL.salteadas`.
 */
export function mensajeExito(operacion: OperacionPanel, tipo: TipoClase = 'suelta'): string {
  if (operacion === 'cancelar') return MENSAJES_PANEL.cancelada;
  if (operacion === 'mover') return MENSAJES_PANEL.movida;
  return tipo === 'serie' ? MENSAJES_PANEL.serieCreada : MENSAJES_PANEL.creada;
}
