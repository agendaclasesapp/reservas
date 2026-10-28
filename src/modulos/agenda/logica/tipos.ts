// Tipos de dominio de la agenda pública, escritos a mano contra contratos.md §3 (componentes.md §5, ADR-020).
import type { ErrorTraducido } from '../../../lib/errores';
import type { Dia } from '../../../lib/fechas';

/** Estado de un hueco en la agenda pública (AGE-07). */
export type EstadoHueco = 'libre' | 'ocupado' | 'bloqueado';

export const ESTADOS_HUECO: readonly EstadoHueco[] = ['libre', 'ocupado', 'bloqueado'];

/** Elemento de `agenda_publica(p_slug, p_dia)`: solo estas tres claves (ADR-006, SEC-07). Instantes ISO-8601. */
export interface Hueco {
  inicio: string;
  fin: string;
  estado: EstadoHueco;
}

/** `config_publica(p_slug)` de un profesor activo (AGE-09, DEC-34): su nombre es lo único suyo que se ve. */
export interface ConfigPublicaActiva {
  profesor_id: string;
  /** Texto: la vista lo muestra escapado (SEC-16). */
  nombre: string;
  activo: true;
  zona_horaria: string;
  duracion_min: number;
  anticipacion_horas: number;
  horizonte_semanas: number;
}

/** `config_publica(p_slug)` de un profesor inactivo (AGE-11): sin agenda ni configuración. */
export interface ConfigPublicaInactiva {
  profesor_id: string;
  nombre: string;
  activo: false;
}

/** Salida de `config_publica(p_slug)`. */
export type ConfigPublica = ConfigPublicaActiva | ConfigPublicaInactiva;

/** Días que `agenda_publica` acepta (SEC-09): de hoy − 366 a hoy + horizonte + 31, en el huso del profesor. */
export interface LimitesAgenda {
  hoy: Dia;
  min: Dia;
  max: Dia;
}

export type EstadoCarga = 'cargando' | 'listo' | 'error';

/**
 * Resultado de `useAgendaDia`. `huecos` está vacío mientras carga o si hubo error. Con el profesor
 * inactivo llega 409 `PROFESOR_INACTIVO` (`error.codigo`); con un slug desconocido, `NO_ENCONTRADO`.
 */
export interface AgendaDia {
  estado: EstadoCarga;
  huecos: Hueco[];
  error: ErrorTraducido | null;
  /** Vuelve a pedir el día actual (por ejemplo, tras un error). */
  recargar: () => void;
}

/**
 * Resultado de `useConfigPublica(slug)`. `config` es null hasta que carga. `enlaceNoValido` es true si el
 * slug no es de ningún profesor (404, o con una forma que ninguno puede tener): la vista dice
 * `MENSAJE_ENLACE_NO_VALIDO` y no lista profesores (AGE-09).
 */
export interface ConfigPublicaCargada {
  estado: EstadoCarga;
  config: ConfigPublica | null;
  error: ErrorTraducido | null;
  enlaceNoValido: boolean;
  recargar: () => void;
}

/** Trae los huecos de un día de un profesor; se inyecta en las pruebas. */
export type ObtenerAgenda = (slug: string, dia: Dia) => Promise<Hueco[]>;
/** Trae la configuración pública de un profesor; se inyecta en las pruebas. */
export type ObtenerConfig = (slug: string) => Promise<ConfigPublica>;
