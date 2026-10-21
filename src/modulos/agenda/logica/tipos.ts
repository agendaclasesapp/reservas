// Tipos de dominio de la agenda pública, escritos a mano contra contratos.md §3 (componentes.md §5).
import type { ErrorTraducido } from '../../../lib/errores';
import type { Dia } from '../../../lib/fechas';

/** Estado de un hueco en la agenda pública (AGE-07). */
export type EstadoHueco = 'libre' | 'ocupado' | 'bloqueado';

export const ESTADOS_HUECO: readonly EstadoHueco[] = ['libre', 'ocupado', 'bloqueado'];

/** Elemento de `agenda_publica(p_dia)`: solo estas tres claves (ADR-006, SEC-07). Instantes ISO-8601. */
export interface Hueco {
  inicio: string;
  fin: string;
  estado: EstadoHueco;
}

/** Salida de `config_publica()`. */
export interface ConfigPublica {
  zona_horaria: string;
  duracion_min: number;
  anticipacion_horas: number;
  horizonte_semanas: number;
}

/** Días que `agenda_publica` acepta (SEC-09): de hoy − 366 a hoy + horizonte + 31, en el huso del profesor. */
export interface LimitesAgenda {
  hoy: Dia;
  min: Dia;
  max: Dia;
}

export type EstadoCarga = 'cargando' | 'listo' | 'error';

/** Resultado de `useAgendaDia`. `huecos` está vacío mientras carga o si hubo error. */
export interface AgendaDia {
  estado: EstadoCarga;
  huecos: Hueco[];
  error: ErrorTraducido | null;
  /** Vuelve a pedir el día actual (por ejemplo, tras un error). */
  recargar: () => void;
}

/** Resultado de `useConfigPublica`. `config` es null hasta que carga. */
export interface ConfigPublicaCargada {
  estado: EstadoCarga;
  config: ConfigPublica | null;
  error: ErrorTraducido | null;
  recargar: () => void;
}

/** Función que trae los huecos de un día; se inyecta en las pruebas. */
export type ObtenerAgenda = (dia: Dia) => Promise<Hueco[]>;
/** Función que trae la configuración pública; se inyecta en las pruebas. */
export type ObtenerConfig = () => Promise<ConfigPublica>;
