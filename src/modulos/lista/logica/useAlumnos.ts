// Hook de la lista de alumnos del profesor (ALU-09, WEB-07).
import { useCallback, useEffect, useState } from 'react';
import { mensajeDeError } from '../../../lib/errores';
import type { AlumnoLista } from './tipos';

export type LectorAlumnos = () => Promise<AlumnoLista[]>;

export interface EstadoAlumnos {
  estado: 'cargando' | 'listo' | 'error';
  alumnos: AlumnoLista[];
  error: string | null;
}

const INICIAL: EstadoAlumnos = { estado: 'cargando', alumnos: [], error: null };

/**
 * Lee `v_alumnos` al montar y en cada `recargar()` (después de aprobar, rechazar, unir, dar de alta o
 * editar). Mientras recarga conserva la lista anterior; un error deja el texto traducido (SEC-17).
 */
export function useAlumnos(lector: LectorAlumnos): { datos: EstadoAlumnos; recargar: () => void } {
  const [datos, setDatos] = useState<EstadoAlumnos>(INICIAL);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    lector().then(
      (alumnos) => {
        if (vigente) setDatos({ estado: 'listo', alumnos, error: null });
      },
      (e: unknown) => {
        if (vigente) setDatos((previo) => ({ estado: 'error', alumnos: previo.alumnos, error: mensajeDeError(e) }));
      },
    );
    return () => {
      vigente = false;
    };
  }, [lector, version]);

  const recargar = useCallback(() => {
    setDatos((previo) => ({ estado: 'cargando', alumnos: previo.alumnos, error: null }));
    setVersion((v) => v + 1);
  }, []);

  return { datos, recargar };
}
