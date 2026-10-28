// Configuración de la agenda del profesor de la sesión (B10 · T10.1, WEB-08): leer y guardar duración,
// anticipación, huso (`guardar_configuracion`) y grilla semanal (`guardar_grilla`). Cada profesor configura
// solo lo suyo (AGE-10): las RPC actúan sobre `mi_profesor_id()` y las lecturas pasan por RLS.
// La base decide siempre (ADR-001); lo de acá valida con sus mismas reglas para marcar el campo o el tramo
// (contratos.md §1, «Validación de listas») y elige el texto del error (SEC-17).
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { traducirError } from '../../../lib/errores';
import { cargarSupabase } from '../../../lib/supabase';
import {
  ANTICIPACION_HORAS_MAXIMA,
  ANTICIPACION_HORAS_MINIMA,
  CAMPOS_CONFIGURACION,
  DURACION_MIN_MAXIMA,
  DURACION_MIN_MINIMA,
  MAX_TRAMOS_GRILLA,
  MENSAJES_CONFIGURACION,
  PATRON_HORA_DESDE,
  PATRON_HORA_HASTA,
  esquemaConfiguracionAgenda,
  esquemaTramo,
  type AgendaConfigurada,
  type CampoConfiguracion,
  type EntradaConfiguracion,
  type ErrorTramo,
  type FalloConfiguracion,
  type ResultadoConfiguracion,
  type ResultadoGrilla,
  type TramoGrilla,
  type ValidacionGrilla,
} from './agenda-tipos';

export interface DependenciasConfiguracion {
  obtenerCliente: () => Promise<SupabaseClient>;
}

/** Dependencias reales: supabase-js cargado con import() (ADR-017). */
export function dependenciasConfiguracion(): DependenciasConfiguracion {
  return { obtenerCliente: () => cargarSupabase() };
}

const CAMPOS = new Set<string>(CAMPOS_CONFIGURACION);

function campoDelError(error: unknown): CampoConfiguracion | null {
  const details = typeof error === 'object' && error !== null ? (error as { details?: unknown }).details : undefined;
  if (typeof details !== 'string') return null;
  try {
    const campo = (JSON.parse(details) as { campo?: unknown } | null)?.campo;
    return typeof campo === 'string' && CAMPOS.has(campo) ? (campo as CampoConfiguracion) : null;
  } catch {
    return null;
  }
}

const MENSAJE_CAMPO: Record<CampoConfiguracion, string> = {
  p_duracion_min: MENSAJES_CONFIGURACION.duracionInvalida,
  p_anticipacion_horas: MENSAJES_CONFIGURACION.anticipacionInvalida,
  p_zona_horaria: MENSAJES_CONFIGURACION.zonaInvalida,
  p_tramos: MENSAJES_CONFIGURACION.grillaInvalida,
};

/** Traduce el error de `guardar_configuracion` o `guardar_grilla` (SEC-17); un 422 marca su campo. */
export function falloConfiguracion(error: unknown): FalloConfiguracion {
  const { codigo, mensaje } = traducirError(error);
  if (codigo === 'DATOS_INVALIDOS') {
    const campo = campoDelError(error);
    if (campo) return { ok: false, codigo, mensaje: MENSAJE_CAMPO[campo], campo };
  }
  return { ok: false, codigo, mensaje, campo: null };
}

function falloLocal(campo: CampoConfiguracion): FalloConfiguracion {
  return { ok: false, codigo: 'DATOS_INVALIDOS', mensaje: MENSAJE_CAMPO[campo], campo };
}

/** true si el navegador reconoce el nombre IANA (ADR-004). La base lo valida contra `pg_timezone_names`. */
export function esZonaValida(zona: string): boolean {
  if (typeof zona !== 'string' || zona.trim() === '' || zona !== zona.trim()) return false;
  try {
    new Intl.DateTimeFormat('es', { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

type IntlConZonas = { supportedValuesOf?: (clave: 'timeZone') => string[] };

/**
 * Husos IANA para elegir, ordenados; incluye `actual` aunque el navegador no lo liste (por ejemplo, un alias).
 * `disponibles` solo para pruebas.
 */
export function zonasHorarias(
  actual: string | null = null,
  disponibles: () => string[] = () => (Intl as unknown as IntlConZonas).supportedValuesOf?.('timeZone') ?? [],
): string[] {
  const zonas = new Set(disponibles());
  if (actual) zonas.add(actual);
  return [...zonas].sort((a, b) => a.localeCompare(b));
}

/**
 * Validación previa de `guardar_configuracion` con los límites de la base (SEC-09): duración 1 a 1440 minutos,
 * anticipación 0 a 8784 horas, huso IANA. Devuelve el fallo del primer campo, en el orden de la base, o null.
 */
export function validarConfiguracion(entrada: EntradaConfiguracion): FalloConfiguracion | null {
  const { duracionMin, anticipacionHoras, zonaHoraria } = entrada;
  if (!Number.isInteger(duracionMin) || duracionMin < DURACION_MIN_MINIMA || duracionMin > DURACION_MIN_MAXIMA) {
    return falloLocal('p_duracion_min');
  }
  if (
    !Number.isInteger(anticipacionHoras) ||
    anticipacionHoras < ANTICIPACION_HORAS_MINIMA ||
    anticipacionHoras > ANTICIPACION_HORAS_MAXIMA
  ) {
    return falloLocal('p_anticipacion_horas');
  }
  if (!esZonaValida(zonaHoraria)) return falloLocal('p_zona_horaria');
  return null;
}

/**
 * AGE-10, ADR-004 (DEC-08 A): aviso a mostrar antes de guardar un huso distinto del actual; null si no cambia.
 * El cambio es solo de la agenda de ese profesor; las clases guardadas conservan su instante.
 */
export function advertenciaCambioHuso(actual: string | null | undefined, nueva: string): string | null {
  if (!actual || actual === nueva) return null;
  return MENSAJES_CONFIGURACION.cambioHuso;
}

/**
 * AGE-03, CA-12: aviso de que un cambio de duración o de grilla no mueve clases ni pedidos; null si la
 * duración no cambia y la grilla no se tocó.
 */
export function avisoSinEfectoEnClases(cambiaDuracion: boolean, cambiaGrilla = false): string | null {
  return cambiaDuracion || cambiaGrilla ? MENSAJES_CONFIGURACION.sinEfectoEnClases : null;
}

function minutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

function errorDeTramo(tramo: TramoGrilla): ErrorTramo | null {
  if (!Number.isInteger(tramo.dia_semana) || tramo.dia_semana < 1 || tramo.dia_semana > 7) return 'dia';
  if (typeof tramo.desde !== 'string' || typeof tramo.hasta !== 'string') return 'hora';
  if (!PATRON_HORA_DESDE.test(tramo.desde) || !PATRON_HORA_HASTA.test(tramo.hasta)) return 'hora';
  if (minutos(tramo.hasta) <= minutos(tramo.desde)) return 'orden';
  return null;
}

/**
 * AGE-01, SEC-09: valida la grilla con las reglas de `guardar_grilla` y marca cada tramo (contratos.md §1): día 1 a
 * 7, horas `HH:MM` (el fin admite 24:00), fin posterior al inicio, sin solape con otro tramo del mismo día (se
 * pueden tocar en el borde), hasta 50 tramos. En un solape se marca el tramo que aparece después en la lista.
 * `[]` es válida: vacía la grilla.
 */
export function validarGrilla(tramos: readonly TramoGrilla[]): ValidacionGrilla {
  const errores: (ErrorTramo | null)[] = tramos.map(errorDeTramo);
  tramos.forEach((t, j) => {
    if (errores[j] !== null) return;
    const solapa = tramos.some(
      (o, i) =>
        i < j &&
        errores[i] === null &&
        o.dia_semana === t.dia_semana &&
        minutos(o.desde) < minutos(t.hasta) &&
        minutos(t.desde) < minutos(o.hasta),
    );
    if (solapa) errores[j] = 'solape';
  });
  const general = tramos.length > MAX_TRAMOS_GRILLA ? MENSAJES_CONFIGURACION.demasiadosTramos : null;
  const porTramo = errores.map((e) => (e === null ? null : MENSAJES_CONFIGURACION.tramo[e]));
  return { valida: general === null && errores.every((e) => e === null), porTramo, general };
}

/** `time` de Postgres (`08:00:00`, `24:00:00`) a `HH:MM`. */
export function horaCorta(valor: string): string {
  return valor.slice(0, 5);
}

const esquemaFilaTramo = z.object({
  dia_semana: z.number().int().min(1).max(7),
  desde: z.string(),
  hasta: z.string(),
});

function aTramo(fila: z.infer<typeof esquemaFilaTramo>): TramoGrilla {
  return esquemaTramo.parse({
    dia_semana: fila.dia_semana,
    desde: horaCorta(fila.desde),
    hasta: horaCorta(fila.hasta),
  }) as TramoGrilla;
}

function ordenTramos(a: TramoGrilla, b: TramoGrilla): number {
  return a.dia_semana - b.dia_semana || minutos(a.desde) - minutos(b.desde);
}

/**
 * Lee la configuración y la grilla del profesor de la sesión: su fila de `profesor` y sus `grilla_tramo` (RLS:
 * solo las suyas, CA-52). Funciona con el profesor inactivo (PRF-08). Lanza el error de postgrest-js.
 */
export async function leerConfiguracionAgenda(
  profesorId: string,
  deps: DependenciasConfiguracion = dependenciasConfiguracion(),
): Promise<AgendaConfigurada> {
  const cliente = await deps.obtenerCliente();
  const [perfil, tramos] = await Promise.all([
    cliente
      .from('profesor')
      .select('zona_horaria, duracion_min, anticipacion_horas, horizonte_semanas')
      .eq('id', profesorId)
      .single(),
    cliente
      .from('grilla_tramo')
      .select('dia_semana, desde, hasta')
      .eq('profesor_id', profesorId)
      .order('dia_semana')
      .order('desde'),
  ]);
  if (perfil.error) throw perfil.error;
  if (tramos.error) throw tramos.error;
  return {
    config: esquemaConfiguracionAgenda.parse(perfil.data),
    grilla: z.array(esquemaFilaTramo).parse(tramos.data ?? []).map(aTramo).sort(ordenTramos),
  };
}

/**
 * `guardar_configuracion` (AGE-02, AGE-03, AGE-04, AGE-08, AGE-10): solo cambia la agenda de quien llama; las clases
 * y los pedidos ya guardados conservan su horario (CA-12). Errores: 403; 422 por campo.
 */
export async function guardarConfiguracion(
  entrada: EntradaConfiguracion,
  deps: DependenciasConfiguracion = dependenciasConfiguracion(),
): Promise<ResultadoConfiguracion> {
  const invalido = validarConfiguracion(entrada);
  if (invalido) return invalido;
  try {
    const cliente = await deps.obtenerCliente();
    const { data, error } = await cliente.rpc('guardar_configuracion', {
      p_duracion_min: entrada.duracionMin,
      p_anticipacion_horas: entrada.anticipacionHoras,
      p_zona_horaria: entrada.zonaHoraria,
    });
    if (error) return falloConfiguracion(error);
    return { ok: true, ...esquemaConfiguracionAgenda.parse(data) };
  } catch (e) {
    return falloConfiguracion(e);
  }
}

/**
 * `guardar_grilla` (AGE-01, AGE-03, AGE-10): reemplaza toda la grilla de quien llama. Valida antes y, si algo
 * falla, devuelve qué tramo marcar sin llamar; el 422 `{"campo":"p_tramos"}` de la base es la última barrera.
 */
export async function guardarGrilla(
  tramos: readonly TramoGrilla[],
  deps: DependenciasConfiguracion = dependenciasConfiguracion(),
): Promise<ResultadoGrilla> {
  const validacion = validarGrilla(tramos);
  if (!validacion.valida) {
    return {
      ok: false,
      codigo: 'DATOS_INVALIDOS',
      mensaje: validacion.general ?? MENSAJES_CONFIGURACION.grillaInvalida,
      campo: 'p_tramos',
      validacion,
    };
  }
  try {
    const cliente = await deps.obtenerCliente();
    const { data, error } = await cliente.rpc('guardar_grilla', {
      p_tramos: tramos.map((t) => ({ dia_semana: t.dia_semana, desde: t.desde, hasta: t.hasta })),
    });
    if (error) return { ...falloConfiguracion(error), validacion: null };
    return { ok: true, grilla: z.array(esquemaFilaTramo).parse(data ?? []).map(aTramo).sort(ordenTramos) };
  } catch (e) {
    return { ...falloConfiguracion(e), validacion: null };
  }
}

