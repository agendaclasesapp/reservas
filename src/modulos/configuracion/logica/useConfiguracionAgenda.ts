// Hook de la configuración de la agenda del profesor de la sesión (B10 · T10.1, WEB-08, AGE-10).
import { useCallback, useEffect, useState } from 'react';
import { useSesion } from '../../../estado/useSesion';
import { mensajeDeError } from '../../../lib/errores';
import { useConfigPublica, type ObtenerConfig } from '../../agenda/logica';
import { guardarConfiguracion, guardarGrilla, leerConfiguracionAgenda } from './agenda';
import type {
  AgendaConfigurada,
  EntradaConfiguracion,
  ResultadoConfiguracion,
  ResultadoGrilla,
  TramoGrilla,
} from './agenda-tipos';
import { profesorDeSesion } from './profesor';

export type LectorConfiguracion = (profesorId: string) => Promise<AgendaConfigurada>;

export interface EscritoresConfiguracion {
  guardarConfiguracion: (entrada: EntradaConfiguracion) => Promise<ResultadoConfiguracion>;
  guardarGrilla: (tramos: readonly TramoGrilla[]) => Promise<ResultadoGrilla>;
}

const LECTOR_REAL: LectorConfiguracion = (profesorId) => leerConfiguracionAgenda(profesorId);
const ESCRITORES_REALES: EscritoresConfiguracion = {
  guardarConfiguracion: (entrada) => guardarConfiguracion(entrada),
  guardarGrilla: (tramos) => guardarGrilla(tramos),
};

export interface EstadoConfiguracionAgenda {
  /** `cargando` también mientras la sesión carga o si quien mira no es profesor. */
  estado: 'cargando' | 'listo' | 'error';
  /** Último dato leído o guardado; tras un error de lectura conserva el anterior. */
  datos: AgendaConfigurada | null;
  /** Texto ya traducido (SEC-17). */
  error: string | null;
}

export interface ResultadoUseConfiguracion {
  lectura: EstadoConfiguracionAgenda;
  recargar: () => void;
  /**
   * `guardar_configuracion`. Si sale bien, actualiza `lectura.datos.config` y vuelve a pedir `config_publica` del
   * profesor, para que el resto de las pantallas use el huso y la duración nuevos.
   */
  guardarConfiguracion: (entrada: EntradaConfiguracion) => Promise<ResultadoConfiguracion>;
  /** `guardar_grilla`. Si sale bien, actualiza `lectura.datos.grilla` con lo que guardó la base. */
  guardarGrilla: (tramos: readonly TramoGrilla[]) => Promise<ResultadoGrilla>;
}

interface Leido {
  profesorId: string;
  version: number;
  estado: 'listo' | 'error';
  datos: AgendaConfigurada | null;
  error: string | null;
}

/**
 * WEB-08: configuración y grilla del profesor de la sesión, y sus dos escrituras. Cada profesor ve y cambia solo
 * lo suyo (AGE-10). `lector`, `escritores` y `obtenerConfig` solo para pruebas (referencias estables).
 */
export function useConfiguracionAgenda(
  lector: LectorConfiguracion = LECTOR_REAL,
  escritores: EscritoresConfiguracion = ESCRITORES_REALES,
  obtenerConfig?: ObtenerConfig,
): ResultadoUseConfiguracion {
  const profesor = profesorDeSesion(useSesion());
  const profesorId = profesor?.id ?? null;
  const { recargar: recargarConfigPublica } = useConfigPublica(profesor?.slug ?? null, obtenerConfig);
  const [version, setVersion] = useState(0);
  const [leido, setLeido] = useState<Leido | null>(null);

  useEffect(() => {
    if (profesorId === null) return;
    let vigente = true;
    lector(profesorId).then(
      (datos) => {
        if (vigente) setLeido({ profesorId, version, estado: 'listo', datos, error: null });
      },
      (e: unknown) => {
        if (vigente) {
          setLeido((previo) => ({
            profesorId,
            version,
            estado: 'error',
            datos: previo?.profesorId === profesorId ? previo.datos : null,
            error: mensajeDeError(e),
          }));
        }
      },
    );
    return () => {
      vigente = false;
    };
  }, [lector, profesorId, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  const guardarConfig = useCallback(
    async (entrada: EntradaConfiguracion) => {
      const r = await escritores.guardarConfiguracion(entrada);
      if (r.ok) {
        const config = {
          zona_horaria: r.zona_horaria,
          duracion_min: r.duracion_min,
          anticipacion_horas: r.anticipacion_horas,
          horizonte_semanas: r.horizonte_semanas,
        };
        setLeido((previo) =>
          previo?.datos && previo.profesorId === profesorId
            ? { ...previo, datos: { ...previo.datos, config } }
            : previo,
        );
        recargarConfigPublica();
      }
      return r;
    },
    [escritores, profesorId, recargarConfigPublica],
  );

  const guardarTramos = useCallback(
    async (tramos: readonly TramoGrilla[]) => {
      const r = await escritores.guardarGrilla(tramos);
      if (r.ok) {
        setLeido((previo) =>
          previo?.datos && previo.profesorId === profesorId
            ? { ...previo, datos: { ...previo.datos, grilla: r.grilla } }
            : previo,
        );
      }
      return r;
    },
    [escritores, profesorId],
  );

  let lectura: EstadoConfiguracionAgenda;
  if (leido && leido.profesorId === profesorId && leido.version === version) {
    lectura = { estado: leido.estado, datos: leido.datos, error: leido.error };
  } else {
    const previos = leido?.profesorId === profesorId ? (leido?.datos ?? null) : null;
    lectura = { estado: 'cargando', datos: previos, error: null };
  }
  return { lectura, recargar, guardarConfiguracion: guardarConfig, guardarGrilla: guardarTramos };
}
