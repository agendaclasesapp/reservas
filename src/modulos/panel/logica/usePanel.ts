// Hooks de lectura del panel (B09): agenda del día del profesor y contadores (PRF-05, AVI-01, WEB-06).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { mensajeDeError } from '../../../lib/errores';
import type { Dia } from '../../../lib/fechas';
import type { Contadores, FilaAgendaProfesor } from './tipos';

export interface EstadoLecturaPanel<T> {
  estado: 'cargando' | 'listo' | 'error';
  /** Último dato leído; mientras vuelve a leer o tras un error conserva el anterior. */
  datos: T | null;
  /** Texto ya traducido (SEC-17). */
  error: string | null;
}

interface Resultado<T> {
  lector: () => Promise<T>;
  version: number;
  estado: 'listo' | 'error';
  datos: T | null;
  error: string | null;
}

/** Lee al montar, cuando cambia `lector` y en cada `recargar()`. Una respuesta vieja no pisa a una nueva. */
export function useLecturaPanel<T>(lector: () => Promise<T>): { lectura: EstadoLecturaPanel<T>; recargar: () => void } {
  const [resultado, setResultado] = useState<Resultado<T> | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    lector().then(
      (datos) => {
        if (vigente) setResultado({ lector, version, estado: 'listo', datos, error: null });
      },
      (e: unknown) => {
        if (vigente) {
          setResultado((previo) => ({ lector, version, estado: 'error', datos: previo?.datos ?? null, error: mensajeDeError(e) }));
        }
      },
    );
    return () => {
      vigente = false;
    };
  }, [lector, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  const lectura: EstadoLecturaPanel<T> =
    resultado && resultado.lector === lector && resultado.version === version
      ? { estado: resultado.estado, datos: resultado.datos, error: resultado.error }
      : { estado: 'cargando', datos: resultado?.datos ?? null, error: null };
  return { lectura, recargar };
}

export type LectorAgendaProfesor = (dia: Dia) => Promise<FilaAgendaProfesor[]>;
export type LectorContadores = () => Promise<Contadores>;

/** `agenda_profesor(dia)`; vuelve a leer al cambiar el día y en `recargar()` (después de crear, mover o cancelar). */
export function useAgendaProfesor(
  lector: LectorAgendaProfesor,
  dia: Dia,
): { lectura: EstadoLecturaPanel<FilaAgendaProfesor[]>; recargar: () => void } {
  const leer = useMemo(() => () => lector(dia), [lector, dia]);
  return useLecturaPanel(leer);
}

/** `contadores()` (AVI-01); `recargar()` después de responder una solicitud o una cuenta. */
export function useContadores(lector: LectorContadores): {
  lectura: EstadoLecturaPanel<Contadores>;
  recargar: () => void;
} {
  return useLecturaPanel(lector);
}
